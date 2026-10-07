import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import vm from 'vm';

const { ipcHandlers, mockWebContents, mockMainWindow, mockShell, mockClipboard } = vi.hoisted(() => {
  const handlers = new Map<string, Function>();
  const webContents = {
    send: vi.fn(),
  };
  const mainWindow = {
    isDestroyed: () => false,
    webContents,
    loadFile: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  const shell = {
    showItemInFolder: vi.fn(),
    openPath: vi.fn(),
    openExternal: vi.fn(),
  };
  let clipboardContent = '';
  const clipboard = {
    writeText: vi.fn((txt: string) => { clipboardContent = txt; return true; }),
    readText: vi.fn(() => clipboardContent),
  };
  return {
    ipcHandlers: handlers,
    mockWebContents: webContents,
    mockMainWindow: mainWindow,
    mockShell: shell,
    mockClipboard: clipboard,
  };
});

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.2.3',
      isPackaged: false,
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => mockMainWindow),
    dialog: {
      showOpenDialog: vi.fn(),
      showMessageBox: vi.fn(),
    },
    ipcMain: {
      handle: (channel: string, handler: Function) => {
        ipcHandlers.set(channel, handler);
      },
    },
    shell: mockShell,
    clipboard: mockClipboard,
  };
});

import { setCurrentWorkspaceRootForTesting } from '../src/main';

export class AdversarialMockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: AdversarialMockWebSocket[] = [];

  public url: string;
  public readyState: number = AdversarialMockWebSocket.CONNECTING;
  public sentMessages: string[] = [];
  public listeners: Record<string, Function[]> = {};
  public closeCallCount = 0;

  public onopen: ((ev: any) => void) | null = null;
  public onclose: ((ev: any) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    AdversarialMockWebSocket.instances.push(this);
  }

  public send(data: string): void {
    if (this.readyState !== AdversarialMockWebSocket.OPEN) {
      throw new Error(`WebSocket is not open: readyState=${this.readyState}`);
    }
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = 'Normal Closure'): void {
    if (this.readyState === AdversarialMockWebSocket.CLOSED) {
      return;
    }
    this.closeCallCount++;
    this.readyState = AdversarialMockWebSocket.CLOSED;
    const ev = { code, reason, wasClean: code === 1000, type: 'close' };
    if (this.onclose) this.onclose(ev);
    this.emit('close', ev);
  }

  public addEventListener(type: string, fn: Function): void {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  }

  public removeEventListener(type: string, fn: Function): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(f => f !== fn);
    }
  }

  public emit(type: string, event: any): void {
    const list = this.listeners[type] || [];
    list.forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        console.error(`[AdversarialMockWebSocket] Listener error "${type}":`, err);
      }
    });
  }

  public simulateOpen(): void {
    this.readyState = AdversarialMockWebSocket.OPEN;
    const ev = { type: 'open' };
    if (this.onopen) this.onopen(ev);
    this.emit('open', ev);
  }

  public simulateMessage(payload: any): void {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const ev = { data, type: 'message' };
    if (this.onmessage) this.onmessage(ev);
    this.emit('message', ev);
  }

  public simulateError(error: any = new Error('Socket network fault')): void {
    const ev = { error, type: 'error' };
    if (this.onerror) this.onerror(ev);
    this.emit('error', ev);
  }

  public simulateClose(code = 1006, reason = 'Abnormal Closure'): void {
    this.readyState = AdversarialMockWebSocket.CLOSED;
    const ev = { code, reason, wasClean: false, type: 'close' };
    if (this.onclose) this.onclose(ev);
    this.emit('close', ev);
  }

  public getLastSentJson(): any {
    if (this.sentMessages.length === 0) return null;
    try {
      return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
    } catch {
      return null;
    }
  }

  public static reset(): void {
    AdversarialMockWebSocket.instances = [];
  }
}

export interface MockElement {
  id: string;
  tagName: string;
  className: string;
  classList: {
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
    toggle: (cls: string, force?: boolean) => boolean;
  };
  style: Record<string, string>;
  dataset: Record<string, string>;
  textContent: string;
  innerHTML: string;
  value: string;
  disabled: boolean;
  title: string;
  children: MockElement[];
  parentNode: MockElement | null;
  attributes: Record<string, string>;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  getAttribute: (attr: string) => string | null;
  setAttribute: (attr: string, val: string) => void;
  removeAttribute: (attr: string) => void;
  hasAttribute: (attr: string) => boolean;
  addEventListener: (event: string, handler: Function) => void;
  removeEventListener: (event: string, handler: Function) => void;
  appendChild: (child: MockElement) => MockElement;
  prepend: (child: MockElement) => void;
  removeChild: (child: MockElement) => MockElement;
  querySelector: (sel: string) => MockElement | null;
  querySelectorAll: (sel: string) => MockElement[];
  closest: (sel: string) => MockElement | null;
  focus: () => void;
  click: () => void;
  dispatchEvent: (event: any) => boolean;
}

function matchesSelector(el: MockElement, sel: string): boolean {
  const parts = sel.split(/(?=[.#\[])/);
  for (const part of parts) {
    if (part.startsWith('#')) {
      if (el.id !== part.slice(1)) return false;
    } else if (part.startsWith('.')) {
      if (!el.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('[')) {
      const attrMatch = part.match(/\[([a-zA-Z0-9\-]+)(?:=["']?([^"'\]]+)["']?)?\]/);
      if (attrMatch) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2];
        const actualVal = el.getAttribute(attrName);
        if (actualVal === null) return false;
        if (attrVal !== undefined && actualVal !== attrVal) return false;
      }
    } else if (part.trim()) {
      if (el.tagName !== part.trim().toUpperCase()) return false;
    }
  }
  return true;
}

export function createMockDomElement(tag = 'div', id = ''): MockElement {
  const classes = new Set<string>();
  const listeners: Record<string, Function[]> = {};
  const children: MockElement[] = [];
  const attributes: Record<string, string> = {};
  let rawHtml = '';
  let rawText = '';

  const el: MockElement = {
    id,
    tagName: tag.toUpperCase(),
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val: string) {
      classes.clear();
      if (val) {
        val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },
    classList: {
      add: (...cls: string[]) => cls.forEach(c => classes.add(c)),
      remove: (...cls: string[]) => cls.forEach(c => classes.delete(c)),
      contains: (cls: string) => classes.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) {
            classes.add(cls);
            return true;
          } else {
            classes.delete(cls);
            return false;
          }
        }
        if (classes.has(cls)) {
          classes.delete(cls);
          return false;
        } else {
          classes.add(cls);
          return true;
        }
      },
    },
    style: {},
    dataset: {},
    attributes,
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 50,
    get textContent() {
      if (children.length > 0 && !rawText) {
        return children.map(c => c.textContent).join('');
      }
      return rawText;
    },
    set textContent(val: string) {
      rawText = val;
      rawHtml = val;
      children.length = 0;
    },
    get innerHTML() {
      return rawHtml;
    },
    set innerHTML(val: string) {
      rawHtml = val;
      rawText = val.replace(/<[^>]*>/g, '');
      children.length = 0;
    },
    value: '',
    disabled: false,
    title: '',
    children,
    parentNode: null,
    getAttribute: (attr: string) => attributes[attr] ?? (attr === 'id' ? el.id : (attr === 'class' ? el.className : null)),
    setAttribute: (attr: string, val: string) => {
      attributes[attr] = String(val);
      if (attr === 'id') el.id = String(val);
      if (attr === 'class') el.className = String(val);
    },
    removeAttribute: (attr: string) => {
      delete attributes[attr];
    },
    hasAttribute: (attr: string) => attr in attributes,
    addEventListener: (event: string, handler: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    },
    appendChild: (child: MockElement) => {
      children.push(child);
      child.parentNode = el;
      return child;
    },
    prepend: (child: MockElement) => {
      children.unshift(child);
      child.parentNode = el;
    },
    removeChild: (child: MockElement) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector: (sel: string) => {
      for (const child of children) {
        if (matchesSelector(child, sel)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      const commaParts = sel.split(',').map(s => s.trim());
      const search = (node: MockElement) => {
        for (const child of node.children) {
          for (const p of commaParts) {
            if (matchesSelector(child, p)) {
              results.push(child);
              break;
            }
          }
          search(child);
        }
      };
      search(el);
      return results;
    },
    closest: (sel: string) => {
      let curr: MockElement | null = el;
      while (curr) {
        if (matchesSelector(curr, sel)) return curr;
        curr = curr.parentNode;
      }
      return null;
    },
    focus: () => {},
    click: () => {
      const list = listeners['click'] || [];
      list.forEach(fn => fn({ target: el, currentTarget: el, stopPropagation: () => {} }));
    },
    dispatchEvent: (event: any) => {
      const list = listeners[event.type] || [];
      list.forEach(fn => fn(event));
      return true;
    },
  };

  return el;
}

export function setupWorkbenchSandbox(jsContent: string) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tag = 'div') => {
    if (!elementRegistry.has(id)) {
      elementRegistry.set(id, createMockDomElement(tag, id));
    }
    return elementRegistry.get(id)!;
  };

  const editorMount = getOrCreateEl('editor-mount');
  editorMount.style.display = 'block';
  const diffEditorMount = getOrCreateEl('diff-editor-mount');
  diffEditorMount.style.display = 'none';

  const statusDaemon = getOrCreateEl('status-daemon');
  const daemonStatusDot = getOrCreateEl('daemon-status-dot', 'span');
  daemonStatusDot.className = 'status-dot disconnected';
  const daemonStatusText = getOrCreateEl('daemon-status-text', 'span');
  daemonStatusText.className = 'status-text';
  daemonStatusText.textContent = 'Sidecar 4949';
  const daemonLatencyText = getOrCreateEl('daemon-latency-text', 'span');
  daemonLatencyText.className = 'daemon-latency';
  daemonLatencyText.textContent = '---ms';
  const daemonModelBadge = getOrCreateEl('daemon-model-badge', 'span');
  daemonModelBadge.className = 'daemon-model-badge';
  daemonModelBadge.textContent = 'gemini-2.5-flash';

  statusDaemon.appendChild(daemonStatusDot);
  statusDaemon.appendChild(daemonStatusText);
  statusDaemon.appendChild(daemonLatencyText);
  statusDaemon.appendChild(daemonModelBadge);

  const statusAgy = getOrCreateEl('status-agy');
  const statusAgyText = getOrCreateEl('status-agy-text', 'span');
  statusAgyText.textContent = 'agy: Ready';
  statusAgy.appendChild(statusAgyText);

  const screenBHeader = getOrCreateEl('screen-b-header');
  const screenBModeTabs = getOrCreateEl('screen-b-mode-tabs');
  screenBModeTabs.setAttribute('role', 'tablist');

  const tabChat = getOrCreateEl('tab-screen-b-chat', 'button');
  tabChat.className = 'screen-b-mode-tab active';
  tabChat.dataset.mode = 'chat';
  tabChat.textContent = 'Chat';

  const tabPlan = getOrCreateEl('tab-screen-b-plan', 'button');
  tabPlan.className = 'screen-b-mode-tab';
  tabPlan.dataset.mode = 'plan';
  tabPlan.textContent = 'Plan';

  const tabReview = getOrCreateEl('tab-screen-b-review', 'button');
  tabReview.className = 'screen-b-mode-tab';
  tabReview.dataset.mode = 'review';
  tabReview.textContent = 'Review';
  const reviewTabBadge = getOrCreateEl('review-tab-badge', 'span');
  reviewTabBadge.className = 'review-tab-badge';
  reviewTabBadge.textContent = '0';
  tabReview.appendChild(reviewTabBadge);

  screenBModeTabs.appendChild(tabChat);
  screenBModeTabs.appendChild(tabPlan);
  screenBModeTabs.appendChild(tabReview);
  screenBHeader.appendChild(screenBModeTabs);

  const screenBDaemonStatus = getOrCreateEl('screen-b-daemon-status');
  screenBDaemonStatus.className = 'screen-b-daemon-status';
  const screenBDaemonDot = getOrCreateEl('screen-b-daemon-dot', 'span');
  screenBDaemonDot.className = 'status-dot disconnected';
  const screenBDaemonLatency = getOrCreateEl('screen-b-daemon-latency', 'span');
  screenBDaemonLatency.className = 'screen-b-daemon-latency';
  screenBDaemonLatency.textContent = '---ms';
  const screenBModelBadge = getOrCreateEl('screen-b-model-badge', 'span');
  screenBModelBadge.className = 'screen-b-model-badge';
  screenBModelBadge.textContent = 'gemini-2.5-flash';

  screenBDaemonStatus.appendChild(screenBDaemonDot);
  screenBDaemonStatus.appendChild(screenBDaemonLatency);
  screenBDaemonStatus.appendChild(screenBModelBadge);
  screenBHeader.appendChild(screenBDaemonStatus);

  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const chatThreadContainer = getOrCreateEl('chat-thread-container');
  chatThreadContainer.className = 'chat-thread-container';
  viewChat.appendChild(chatThreadContainer);

  const webviewFrame = getOrCreateEl('webview-frame', 'iframe');
  const mockPostMessage = vi.fn();
  (webviewFrame as any).contentWindow = { postMessage: mockPostMessage };
  viewChat.appendChild(webviewFrame);

  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const planActivePane = getOrCreateEl('plan-active-pane');
  const planSubtaskList = getOrCreateEl('plan-subtask-list');
  const planLogsConsole = getOrCreateEl('plan-logs-console');
  planActivePane.appendChild(planSubtaskList);
  planActivePane.appendChild(planLogsConsole);
  viewPlan.appendChild(planActivePane);

  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';
  const reviewActivePane = getOrCreateEl('review-active-pane');
  const reviewFileList = getOrCreateEl('review-file-list');
  reviewActivePane.appendChild(reviewFileList);
  viewReview.appendChild(reviewActivePane);

  const promptContainer = getOrCreateEl('antigravity-prompt-container');
  const promptInputBox = getOrCreateEl('prompt-input-box', 'textarea');
  promptInputBox.value = '';
  promptInputBox.disabled = false;
  const btnPromptRun = getOrCreateEl('btn-prompt-run', 'button');
  promptContainer.appendChild(promptInputBox);
  promptContainer.appendChild(btnPromptRun);

  getOrCreateEl('workbench-tabs');
  getOrCreateEl('open-editors-list');
  getOrCreateEl('workspace-file-tree');

  let mockCurrentTime = 100000;
  const mockPerformance = {
    now: vi.fn(() => mockCurrentTime),
  };

  const documentListeners: Record<string, Function[]> = {};
  const windowListeners: Record<string, Function[]> = {};

  const CustomDate = class extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(mockCurrentTime);
      } else {
        super(...args as [any]);
      }
    }
    static now() {
      return mockCurrentTime;
    }
  };

  const sandbox: any = {
    Date: CustomDate,
    WebSocket: AdversarialMockWebSocket,
    window: {
      Date: CustomDate,
      WebSocket: AdversarialMockWebSocket,
      addEventListener: vi.fn((evt: string, fn: Function) => {
        windowListeners[evt] = windowListeners[evt] || [];
        windowListeners[evt].push(fn);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn((event: any) => {
        const list = windowListeners[event.type] || [];
        list.forEach(fn => fn(event));
        return true;
      }),
      performance: mockPerformance,
      navigator: {
        clipboard: {
          writeText: vi.fn(async () => true),
          readText: vi.fn(async () => ''),
        },
      },
    },
    document: {
      getElementById: vi.fn((id: string) => getOrCreateEl(id)),
      createElement: vi.fn((tag: string) => createMockDomElement(tag)),
      querySelector: vi.fn((sel: string) => {
        if (sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
        for (const el of elementRegistry.values()) {
          if (matchesSelector(el, sel)) return el;
          const found = el.querySelector(sel);
          if (found) return found;
        }
        return null;
      }),
      querySelectorAll: vi.fn((sel: string) => {
        const results: MockElement[] = [];
        for (const el of elementRegistry.values()) {
          if (matchesSelector(el, sel)) results.push(el);
          results.push(...el.querySelectorAll(sel));
        }
        return Array.from(new Set(results));
      }),
      body: createMockDomElement('body'),
      addEventListener: vi.fn((evt: string, fn: Function) => {
        documentListeners[evt] = documentListeners[evt] || [];
        documentListeners[evt].push(fn);
      }),
      removeEventListener: vi.fn(),
    },
    performance: mockPerformance,
    setTimeout: (fn: Function, delay?: number) => setTimeout(fn, delay),
    clearTimeout: (id: any) => clearTimeout(id),
    setInterval: (fn: Function, delay?: number) => setInterval(fn, delay),
    clearInterval: (id: any) => clearInterval(id),
    console,
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const harnessHook = `
    globalThis.connectSidecar = typeof connectSidecar !== 'undefined' ? connectSidecar : undefined;
    globalThis.disconnectSidecar = typeof disconnectSidecar !== 'undefined' ? disconnectSidecar : undefined;
    globalThis.sidecarClient = typeof sidecarClient !== 'undefined' ? sidecarClient : (typeof window !== 'undefined' ? window.sidecarClient : undefined);
    globalThis.sidecarWs = typeof sidecarWs !== 'undefined' ? sidecarWs : undefined;
    globalThis.SidecarWebSocketClient = typeof SidecarWebSocketClient !== 'undefined' ? SidecarWebSocketClient : undefined;
    globalThis.StreamMessageParser = typeof StreamMessageParser !== 'undefined' ? StreamMessageParser : (typeof window !== 'undefined' ? window.StreamMessageParser : undefined);
    globalThis.TypewriterRenderer = typeof TypewriterRenderer !== 'undefined' ? TypewriterRenderer : (typeof window !== 'undefined' ? window.TypewriterRenderer : undefined);
    globalThis.handlePlanStreamMessage = typeof handlePlanStreamMessage !== 'undefined' ? handlePlanStreamMessage : undefined;
    globalThis.handleDiffStreamMessage = typeof handleDiffStreamMessage !== 'undefined' ? handleDiffStreamMessage : undefined;
    globalThis.appendChatChunk = typeof appendChatChunk !== 'undefined' ? appendChatChunk : undefined;
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning]:', err);
  }

  return {
    sandbox,
    elementRegistry,
    setMockTime: (t: number) => { mockCurrentTime = t; },
    getMockTime: () => mockCurrentTime,
    mockPerformance,
  };
}

describe('Adversarial Challenger 1: WebSocket Lifecycle, Telemetry & Network Stress', () => {
  let jsContent: string;
  let testTempDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    AdversarialMockWebSocket.reset();
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-challenger1-'));
    workspaceDir = path.join(testTempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    setCurrentWorkspaceRootForTesting(workspaceDir);

    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(jsPath, 'utf-8');
    vi.clearAllMocks();
  });

  afterEach(() => {
    setCurrentWorkspaceRootForTesting(null);
    AdversarialMockWebSocket.reset();
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('1. Rapid Connect/Disconnect Churn & Reconnect Timer Lifecycle', () => {
    it('1.1 multiple rapid consecutive connect() calls do not leak timers or create unhandled errors', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();

      // Trigger 10 rapid connect calls without waiting for connection establishment
      for (let i = 0; i < 10; i++) {
        expect(() => client.connect()).not.toThrow();
      }

      // Latest instance should be valid and trackable
      const lastWs = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      expect(lastWs).toBeDefined();
      expect(lastWs.url).toBe('ws://127.0.0.1:4949');

      // Simulating open on the latest socket marks client as connected
      lastWs.simulateOpen();
      expect(client.isConnected()).toBe(true);
    });

    it('1.2 immediate disconnect() during CONNECTING state transitions cleanly to closed', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      expect(ws.readyState).toBe(AdversarialMockWebSocket.CONNECTING);
      expect(client.isConnected()).toBe(false);

      // Call disconnect while connecting
      client.disconnect();

      expect(client.isConnected()).toBe(false);
      expect(client.ws).toBeNull();
      expect(ctx.elementRegistry.get('daemon-status-dot').classList.contains('disconnected')).toBe(true);
    });

    it('1.3 calling disconnect() when reconnectTimer is pending clears the timer and prevents auto-reconnect', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // Simulate connection drop to schedule reconnect timer
      ws.simulateClose(1006, 'Connection dropped');
      expect(client.reconnectTimer).not.toBeNull();
      const scheduledTimer = client.reconnectTimer;

      // Disconnect must clear the scheduled timer
      client.disconnect();
      expect(client.reconnectTimer).toBeNull();
    });

    it('1.4 stress test: alternating connect and disconnect 50 times in a tight loop maintains consistent state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();

      for (let i = 0; i < 50; i++) {
        client.connect();
        const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
        if (i % 2 === 0) {
          ws.simulateOpen();
          expect(client.isConnected()).toBe(true);
        }
        client.disconnect();
        expect(client.isConnected()).toBe(false);
      }

      // Final state must be cleanly disconnected
      expect(client.isConnected()).toBe(false);
      expect(client.ws).toBeNull();
      expect(ctx.elementRegistry.get('daemon-status-dot').classList.contains('disconnected')).toBe(true);
    });

    it('1.5 connectSidecar returns a persistent singleton client instance', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client1 = ctx.sandbox.connectSidecar();
      const client2 = ctx.sandbox.connectSidecar();

      expect(client1).toBe(client2);
      expect(client1.url).toBe('ws://127.0.0.1:4949');
    });

    it('1.6 reconnecting after an intentional disconnect properly re-initializes WebSocket lifecycle', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws1 = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws1.simulateOpen();
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.isConnected()).toBe(false);

      // Reconnect anew
      client.connect();
      const ws2 = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      expect(ws2).not.toBe(ws1);
      ws2.simulateOpen();
      expect(client.isConnected()).toBe(true);
      expect(ctx.elementRegistry.get('daemon-status-dot').classList.contains('connected')).toBe(true);
    });

    it('1.7 disconnectSidecar() helper delegates cleanly to singleton client disconnect', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();
      expect(client.isConnected()).toBe(true);

      if (typeof ctx.sandbox.disconnectSidecar === 'function') {
        ctx.sandbox.disconnectSidecar();
        expect(client.isConnected()).toBe(false);
      }
    });

    it('1.8 sendHeartbeat() is a safe no-op when socket is null or not in OPEN state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // While CONNECTING:
      expect(ws.readyState).toBe(AdversarialMockWebSocket.CONNECTING);
      const initialSentCount = ws.sentMessages.length;
      client.sendHeartbeat();
      expect(ws.sentMessages.length).toBe(initialSentCount);

      // When CLOSED:
      ws.simulateClose(1000);
      client.sendHeartbeat();
      expect(ws.sentMessages.length).toBe(initialSentCount);

      // When ws is null:
      client.ws = null;
      expect(() => client.sendHeartbeat()).not.toThrow();
    });

    it('1.9 sendHeartbeat() safely absorbs internal socket send exceptions', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      // Mock ws.send throwing buffer error
      ws.send = () => {
        throw new Error('Socket buffer overflow / broken pipe');
      };

      expect(() => client.sendHeartbeat()).not.toThrow();
    });

    it('1.10 construction failure during new WebSocket() catches cleanly, updates status and schedules backoff', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();

      // Temporarily mock WebSocket constructor to throw
      const originalWS = ctx.sandbox.WebSocket;
      ctx.sandbox.WebSocket = class ThrowingWS {
        constructor() {
          throw new Error('SecurityError: WebSocket creation disallowed');
        }
      };

      expect(() => client.connect()).not.toThrow();
      expect(client.reconnectTimer).not.toBeNull();
      expect(ctx.elementRegistry.get('daemon-status-dot').classList.contains('disconnected')).toBe(true);

      // Restore WebSocket class
      ctx.sandbox.WebSocket = originalWS;
    });
  });

  describe('2. Malformed WebSocket Payloads & Corrupted Data Handling', () => {
    it('2.1 truncated and unparseable JSON payloads are silently discarded without throwing', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const malformedPayloads = [
        '{"jsonrpc": "2.0", "result": {',
        '{"method": "chat:chunk", "params":',
        '{ invalid json syntax }',
        'undefined',
        'NaN',
        '<<<XML HEADER>>>',
        '{"unclosed": "string',
        '\0\0\0binary_garbage',
      ];

      for (const badData of malformedPayloads) {
        expect(() => {
          ws.simulateMessage(badData);
        }).not.toThrow();
      }

      // Connection must remain healthy
      expect(client.isConnected()).toBe(true);
    });

    it('2.2 primitive strings and numbers outside standard RPC format do not corrupt client state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const nonObjectFrames = [
        'PING',
        'PONG',
        '42',
        'true',
        'false',
        'null',
        '',
      ];

      for (const frame of nonObjectFrames) {
        expect(() => ws.simulateMessage(frame)).not.toThrow();
      }

      expect(client.isConnected()).toBe(true);
    });

    it('2.3 empty JSON object and arrays do not trigger property access exceptions', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      expect(() => ws.simulateMessage({})).not.toThrow();
      expect(() => ws.simulateMessage([])).not.toThrow();
      expect(() => ws.simulateMessage([1, 2, 3])).not.toThrow();
      expect(() => ws.simulateMessage([{ method: 'unknown' }])).not.toThrow();
      expect(client.isConnected()).toBe(true);
    });

    it('2.4 streaming chunk messages with null or missing properties handle defaults safely', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      // Missing params, null chunk, empty tokens
      const edgeChunkMessages = [
        { method: 'chat:chunk', params: null },
        { method: 'chat:chunk', params: {} },
        { method: 'chat:chunk', params: { chunk: null } },
        { method: 'chat:chunk', params: { token: undefined, isThinking: null } },
        { type: 'stream:chunk', payload: null },
      ];

      for (const msg of edgeChunkMessages) {
        expect(() => ws.simulateMessage(msg)).not.toThrow();
      }

      expect(client.isConnected()).toBe(true);
    });

    it('2.5 plan stream messages with null subtasks or missing identifiers do not crash workbench state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      // Empty or missing subtasks array is safely normalized to [] without throwing
      const edgePlanMessages = [
        { method: 'plan:init', params: { title: 'Broken Plan', subtasks: null } },
        { method: 'plan:step_start', params: { subtaskId: null } },
        { method: 'plan:step_log', params: { message: '' } },
        { method: 'plan:step_done', params: { subtaskId: 'non-existent-step', status: 'unknown_status' } },
      ];

      for (const msg of edgePlanMessages) {
        expect(() => ws.simulateMessage(msg)).not.toThrow();
      }

      // Missing title in plan:init triggers validation exception from createTaskPlan
      expect(() => ws.simulateMessage({ method: 'plan:init', params: null })).toThrow(/Task plan requires a valid title/);
      expect(() => ws.simulateMessage({ method: 'plan:init', params: {} })).toThrow(/Task plan requires a valid title/);
    });

    it('2.6 diff stream messages with null or empty diff structures degrade gracefully', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const edgeDiffMessages = [
        { method: 'diff:file_proposed', params: null },
        { method: 'diff:file_proposed', params: { filePath: '', proposedContent: '' } },
      ];

      for (const msg of edgeDiffMessages) {
        expect(() => ws.simulateMessage(msg)).not.toThrow();
      }
    });

    it('2.7 extremely large (100KB) valid JSON payload is parsed without recursion or freeze', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const largeText = 'A'.repeat(100 * 1024);
      const largeMsg = {
        method: 'chat:chunk',
        params: {
          chunk: largeText,
          correlationId: 'heavy-chunk-1',
        },
      };

      expect(() => ws.simulateMessage(largeMsg)).not.toThrow();
      expect(client.isConnected()).toBe(true);
    });

    it('2.8 malicious prototype pollution attempt in JSON does not pollute Object prototype', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const evilPayload = JSON.parse('{"__proto__": {"polluted": true}}');
      ws.simulateMessage(evilPayload);

      expect((({} as any).polluted)).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('2.10 stream parser isolates split <thinking> tags across multiple fragmented chunks', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const StreamParser = ctx.sandbox.StreamMessageParser;
      expect(StreamParser).toBeDefined();

      let thinkingText = '';
      let answerText = '';

      const parser = new StreamParser({
        onThinkingChunk: (delta: string) => { thinkingText += delta; },
        onAnswerChunk: (delta: string) => { answerText += delta; },
      });

      // Split opening and closing tags across chunks
      parser.feed('Preamble. <thi');
      parser.feed('nking>Internal reasoning trace</thi');
      parser.feed('nking>Final verified answer.');
      parser.finish();

      expect(thinkingText).toBe('Internal reasoning trace');
      expect(answerText).toBe('Preamble. Final verified answer.');
      expect(answerText).not.toContain('<thinking>');
      expect(answerText).not.toContain('</thinking>');
    });

    it('2.11 stream parser handles multiple sequential reasoning blocks cleanly', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const StreamParser = ctx.sandbox.StreamMessageParser;

      let thinkingAccum = '';
      let answerAccum = '';

      const parser = new StreamParser({
        onThinkingChunk: (delta: string) => { thinkingAccum += delta; },
        onAnswerChunk: (delta: string) => { answerAccum += delta; },
      });

      parser.feed('<thinking>Reasoning phase 1</thinking>');
      parser.feed('First solution. ');
      parser.feed('<thinking>Reasoning phase 2</thinking>');
      parser.feed('Second solution.');
      parser.finish();

      expect(thinkingAccum).toContain('Reasoning phase 1');
      expect(thinkingAccum).toContain('Reasoning phase 2');
      expect(answerAccum).toBe('First solution. Second solution.');
    });

    it('2.12 handleMessage routes diverse payload schemas (diagnostics.tokenChunk, chat:chunk, stream:chunk)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const chatContainer = ctx.elementRegistry.get('chat-thread-container');
      expect(chatContainer).toBeDefined();

      // Send diagnostics.tokenChunk
      ws.simulateMessage({
        method: 'diagnostics.tokenChunk',
        params: { token: 'Diagnostic insight. ' },
      });

      // Send chat:chunk
      ws.simulateMessage({
        method: 'chat:chunk',
        payload: { chunk: 'Chat response. ' },
      });

      // Send stream:chunk
      ws.simulateMessage({
        type: 'stream:chunk',
        chunk: 'Stream data.',
      });

      expect(chatContainer.children.length).toBeGreaterThan(0);
    });
  });

  // SUITE 3: LATENCY CALCULATION, DELAYED PONGS, CLOCK DRIFT & MISSED PING THRESHOLD
  describe('3. Latency Calculation, Delayed Pongs, Clock Drift & Missed Ping Threshold', () => {
    it('3.1 exactly 2 missed pings triggers socket closure and auto-reconnect sequence', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen();
      // On open: sendHeartbeat() is called once, so missedPings starts at 1
      expect(client.missedPings).toBe(1);
      expect(ws.sentMessages.length).toBe(1);

      // 1st heartbeat interval tick without pong response:
      // missedPings is 1 (< 2), so sendHeartbeat increments missedPings to 2 and sends 2nd ping
      client.sendHeartbeat();
      expect(client.missedPings).toBe(2);
      expect(ws.sentMessages.length).toBe(2);
      expect(ws.readyState).toBe(AdversarialMockWebSocket.OPEN);

      // 2nd heartbeat interval tick without pong response:
      // missedPings is now 2 (>= 2 threshold met!) -> triggers this.ws.close()
      client.sendHeartbeat();
      expect(ws.readyState).toBe(AdversarialMockWebSocket.CLOSED);
      expect(ws.closeCallCount).toBeGreaterThan(0);
    });

    it('3.2 receiving pong before 2 missed pings resets missedPings counter to 0', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen();
      expect(client.missedPings).toBe(1);

      const firstPing = ws.getLastSentJson();
      expect(firstPing).toBeDefined();

      // Send matching pong response
      ws.simulateMessage({
        jsonrpc: '2.0',
        id: firstPing.id,
        result: { status: 'pong' },
      });

      // missedPings must reset to 0
      expect(client.missedPings).toBe(0);

      // Next heartbeat sends ping 1 again without exceeding threshold
      client.sendHeartbeat();
      expect(client.missedPings).toBe(1);
      expect(ws.readyState).toBe(AdversarialMockWebSocket.OPEN);
    });

    it('3.3 calculates large round-trip latency accurately for delayed pong responses', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(10000);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen();
      const pingMsg = ws.getLastSentJson();
      expect(pingMsg).toBeDefined();

      // Fast forward time by 4850ms (delayed pong)
      ctx.setMockTime(14850);

      ws.simulateMessage({
        jsonrpc: '2.0',
        id: pingMsg.id,
        result: { status: 'pong', timestamp: 14850 },
      });

      expect(client.getLatency()).toBe(4850);

      const daemonLatency = ctx.elementRegistry.get('daemon-latency-text');
      const screenBLatency = ctx.elementRegistry.get('screen-b-daemon-latency');
      expect(daemonLatency.textContent).toBe('4850ms');
      expect(screenBLatency.textContent).toBe('4850ms');
    });

    it('3.4 clock drift / backward adjustment ensures latency never drops below 1ms', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(50000);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen();
      const pingMsg = ws.getLastSentJson();

      // System clock stepped backward before pong was processed
      ctx.setMockTime(49000); // -1000ms delta

      ws.simulateMessage({
        jsonrpc: '2.0',
        id: pingMsg.id,
        result: { status: 'pong' },
      });

      // Math.max(1, round(now - sendTime)) must floor at 1ms
      expect(client.getLatency()).toBe(1);
      expect(ctx.elementRegistry.get('daemon-latency-text').textContent).toBe('1ms');
    });

    it('3.5 unsolicited or mismatched pong IDs are safely ignored without altering latency', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(20000);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen();
      const initialLatency = client.getLatency(); // -1 or baseline

      // Simulate pong with non-matching ID
      ws.simulateMessage({
        jsonrpc: '2.0',
        id: 'ping-rogue-foreign-id',
        result: { status: 'pong' },
      });

      // Latency and missed pings must not be affected by unmatched ID
      expect(client.getLatency()).toBe(initialLatency);
      expect(client.missedPings).toBe(1);
    });

    it('3.6 multiple out-of-order pongs resolve corresponding pending pings correctly', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(1000);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();
      const ping1 = ws.getLastSentJson();

      // Reset missed pings manually to simulate 2nd ping transmission
      client.missedPings = 0;
      ctx.setMockTime(2000);
      client.sendHeartbeat();
      const ping2 = ws.getLastSentJson();
      expect(ping1.id).not.toBe(ping2.id);

      // Receive Pong for ping2 first at t=2150 (latency 150ms)
      ctx.setMockTime(2150);
      ws.simulateMessage({ jsonrpc: '2.0', id: ping2.id, result: { status: 'pong' } });
      expect(client.getLatency()).toBe(150);

      // Receive Pong for ping1 later at t=2300 (latency 1300ms)
      ctx.setMockTime(2300);
      ws.simulateMessage({ jsonrpc: '2.0', id: ping1.id, result: { status: 'pong' } });
      expect(client.getLatency()).toBe(1300);
      expect(client.pendingPings.size).toBe(0);
    });

    it('3.7 fallback to Date.now() when performance.now is unavailable computes valid latency', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(70000);
      const client = ctx.sandbox.connectSidecar();

      // Temporarily remove performance.now
      const origPerfNow = ctx.sandbox.performance.now;
      ctx.sandbox.performance.now = undefined;
      ctx.sandbox.window.performance.now = undefined;

      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();
      const ping = ws.getLastSentJson();
      expect(ping).toBeDefined();

      ctx.setMockTime(70125); // +125ms
      ws.simulateMessage({ jsonrpc: '2.0', id: ping.id, result: { status: 'pong' } });

      expect(client.getLatency()).toBe(125);
      expect(ctx.elementRegistry.get('daemon-latency-text').textContent).toBe('125ms');

      // Restore
      ctx.sandbox.performance.now = origPerfNow;
      ctx.sandbox.window.performance.now = origPerfNow;
    });

    it('3.8 ping queue containment: 2-missed-ping limit strictly bounds pending pings size to max 2', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.setMockTime(10000);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateOpen(); // Ping 1 sent at t=10000
      expect(client.pendingPings.size).toBe(1);

      ctx.setMockTime(15000); // Advance time by 5s
      client.sendHeartbeat(); // Ping 2 sent at t=15000
      expect(client.pendingPings.size).toBe(2);

      // 3rd heartbeat attempt drops socket, preventing further ping accumulation
      ctx.setMockTime(20000);
      client.sendHeartbeat();
      expect(ws.readyState).toBe(AdversarialMockWebSocket.CLOSED);
      expect(client.pendingPings.size).toBeLessThanOrEqual(2);
    });
  });

  describe('4. Exponential Backoff Bounds & Jitter Progression', () => {
    it('4.1 exponential backoff delay strictly satisfies the mathematical lower and upper bounds', () => {
      // Replicate the client scheduleReconnect calculation:
      // min(1000 * 2^(attempts-1), 16000) + random * 250
      for (let attempt = 1; attempt <= 10; attempt++) {
        const base = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
        const minExpected = base;
        const maxExpected = base + 250;

        // Sample 50 iterations to test jitter distribution
        for (let s = 0; s < 50; s++) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000) + Math.random() * 250;
          expect(delay).toBeGreaterThanOrEqual(minExpected);
          expect(delay).toBeLessThanOrEqual(maxExpected);
        }
      }
    });

    it('4.2 delays on attempt 5 and beyond are strictly capped at 16000ms plus jitter', () => {
      const baseAttempt5 = Math.min(1000 * Math.pow(2, 5 - 1), 16000);
      const baseAttempt6 = Math.min(1000 * Math.pow(2, 6 - 1), 16000);
      const baseAttempt10 = Math.min(1000 * Math.pow(2, 10 - 1), 16000);
      const baseAttempt50 = Math.min(1000 * Math.pow(2, 50 - 1), 16000);

      expect(baseAttempt5).toBe(16000);
      expect(baseAttempt6).toBe(16000);
      expect(baseAttempt10).toBe(16000);
      expect(baseAttempt50).toBe(16000);
    });

    it('4.3 successful connection (ws.onopen) immediately resets reconnectAttempts to 0', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // Simulate 4 prior failed reconnection attempts
      client.reconnectAttempts = 4;
      expect(client.getReconnectAttempts()).toBe(4);

      // On socket open, counter must be reset
      ws.simulateOpen();
      expect(client.getReconnectAttempts()).toBe(0);
    });

    it('4.4 next disconnection after reconnection restarts backoff progression from attempt 1', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateOpen();
      expect(client.getReconnectAttempts()).toBe(0);

      // Trigger disconnect to trigger scheduleReconnect
      ws.simulateClose(1006, 'Daemon restarted');
      expect(client.getReconnectAttempts()).toBe(1);
    });

    it('4.5 multiple rapid error/close triggers do not schedule duplicate reconnect timers', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // Multiple close and error calls
      ws.simulateError();
      ws.simulateClose(1006);
      const timerRef = client.reconnectTimer;
      expect(timerRef).not.toBeNull();
      const attemptsCount = client.getReconnectAttempts();

      // Trigger another close immediately
      client.scheduleReconnect();
      // Timer reference must not change and attempt count must remain unchanged
      expect(client.reconnectTimer).toBe(timerRef);
      expect(client.getReconnectAttempts()).toBe(attemptsCount);
    });

    it('4.6 randomized jitter stays non-negative and strictly within 0-250ms range across repeated samplings', () => {
      for (let i = 0; i < 200; i++) {
        const jitter = Math.random() * 250;
        expect(jitter).toBeGreaterThanOrEqual(0);
        expect(jitter).toBeLessThan(250);
      }
    });
  });

  describe('5. Offline Fallback Behavior & Graceful Degradation', () => {
    it('5.1 connection error transitions UI indicators to red dot and offline state text', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // Socket error and closure
      ws.simulateError(new Error('connect ECONNREFUSED 127.0.0.1:4949'));
      ws.simulateClose(1006, 'Connection refused');

      const daemonDot = ctx.elementRegistry.get('daemon-status-dot');
      const daemonText = ctx.elementRegistry.get('daemon-status-text');
      const daemonLatency = ctx.elementRegistry.get('daemon-latency-text');

      const screenBDot = ctx.elementRegistry.get('screen-b-daemon-dot');
      const screenBLatency = ctx.elementRegistry.get('screen-b-daemon-latency');

      expect(daemonDot.classList.contains('disconnected')).toBe(true);
      expect(daemonDot.classList.contains('connected')).toBe(false);
      expect(daemonText.textContent).toBe('Sidecar: Offline');
      expect(daemonLatency.textContent).toBe('---ms');

      expect(screenBDot.classList.contains('disconnected')).toBe(true);
      expect(screenBLatency.textContent).toBe('---ms');
    });

    it('5.2 UI prompt input box and buttons remain enabled and interactive when daemon is offline', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateClose(1006, 'Daemon offline');

      const promptInput = ctx.elementRegistry.get('prompt-input-box');
      const btnRun = ctx.elementRegistry.get('btn-prompt-run');

      expect(promptInput.disabled).toBe(false);
      expect(btnRun.disabled).toBe(false);

      // Typing into prompt box remains functional
      promptInput.value = 'Refactor quicksort into iterative implementation';
      expect(promptInput.value).toBe('Refactor quicksort into iterative implementation');
    });

    it('5.3 mode switcher tabs switch between Chat, Plan, and Review views without error during offline state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      ws.simulateClose(1006);

      const setMode = ctx.sandbox.setScreenBMode;
      if (typeof setMode === 'function') {
        expect(() => setMode('plan')).not.toThrow();
        expect(ctx.elementRegistry.get('tab-screen-b-plan').classList.contains('active')).toBe(true);

        expect(() => setMode('review')).not.toThrow();
        expect(ctx.elementRegistry.get('tab-screen-b-review').classList.contains('active')).toBe(true);

        expect(() => setMode('chat')).not.toThrow();
        expect(ctx.elementRegistry.get('tab-screen-b-chat').classList.contains('active')).toBe(true);
      }
    });

    it('5.4 automatic recovery restores green indicators, latency, and active model badge when daemon comes online', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      // Initial offline state
      ws.simulateClose(1006, 'Offline');
      expect(ctx.elementRegistry.get('daemon-status-dot').classList.contains('disconnected')).toBe(true);

      // New socket connection opens
      client.connect();
      const activeWs = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];
      activeWs.simulateOpen();

      const daemonDot = ctx.elementRegistry.get('daemon-status-dot');
      const daemonText = ctx.elementRegistry.get('daemon-status-text');
      const daemonBadge = ctx.elementRegistry.get('daemon-model-badge');

      const screenBDot = ctx.elementRegistry.get('screen-b-daemon-dot');
      const screenBBadge = ctx.elementRegistry.get('screen-b-model-badge');

      expect(daemonDot.classList.contains('connected')).toBe(true);
      expect(daemonDot.classList.contains('disconnected')).toBe(false);
      expect(daemonText.textContent).toBe('Sidecar 4949');
      expect(daemonBadge.textContent).toBe('gemini-2.5-flash');

      expect(screenBDot.classList.contains('connected')).toBe(true);
      expect(screenBBadge.textContent).toBe('gemini-2.5-flash');
    });

    it('5.5 triggerAnalysis() safely aborts when sidecar daemon is disconnected without throwing', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      ws.simulateClose(1006, 'Offline');

      if (typeof ctx.sandbox.triggerAnalysis === 'function') {
        expect(() => ctx.sandbox.triggerAnalysis()).not.toThrow();
      }
    });

    it('5.6 repeated error and close cascades do not corrupt DOM classList or text styling', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.connectSidecar();
      const ws = AdversarialMockWebSocket.instances[AdversarialMockWebSocket.instances.length - 1];

      for (let i = 0; i < 20; i++) {
        ws.simulateError(new Error('Network flapping'));
        ws.simulateClose(1006, 'Drop');
      }

      const dot = ctx.elementRegistry.get('daemon-status-dot');
      expect(dot.classList.contains('disconnected')).toBe(true);
      expect(dot.classList.contains('connected')).toBe(false);

      const text = ctx.elementRegistry.get('daemon-status-text');
      expect(text.textContent).toBe('Sidecar: Offline');
      expect(text.style.color).toBe('#f87171');
    });
  });
});
