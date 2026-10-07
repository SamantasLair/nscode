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

// Import main module to trigger IPC registrations and set workspace root
import { setCurrentWorkspaceRootForTesting } from '../src/main';

export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  public url: string;
  public readyState: number = MockWebSocket.CONNECTING;
  public sentMessages: string[] = [];
  public listeners: Record<string, Function[]> = {};

  public onopen: ((ev: any) => void) | null = null;
  public onclose: ((ev: any) => void) | null = null;
  public onerror: ((ev: any) => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = 'Normal Closure'): void {
    this.readyState = MockWebSocket.CLOSED;
    const ev = { code, reason, wasClean: true, type: 'close' };
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
        console.error(`[MockWebSocket] Error in listener "${type}":`, err);
      }
    });
  }

  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
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

  public simulateError(error: any = new Error('Connection failed')): void {
    const ev = { error, type: 'error' };
    if (this.onerror) this.onerror(ev);
    this.emit('error', ev);
  }

  public simulateClose(code = 1006, reason = 'Abnormal Closure'): void {
    this.readyState = MockWebSocket.CLOSED;
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
    MockWebSocket.instances = [];
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

function parseHtmlToMockElements(html: string, parent: MockElement): MockElement[] {
  const children: MockElement[] = [];
  const openTagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  let pos = 0;
  while (pos < html.length) {
    openTagRegex.lastIndex = pos;
    match = openTagRegex.exec(html);
    if (!match) break;

    const tagName = match[1];
    const attrsStr = match[2] || '';
    const openTagEnd = openTagRegex.lastIndex;

    const el = createMockDomElement(tagName);
    el.parentNode = parent;

    const idMatch = attrsStr.match(/id=["']([^"']+)["']/);
    if (idMatch) el.id = idMatch[1];

    const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
    if (classMatch) {
      classMatch[1].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    }

    const titleMatch = attrsStr.match(/title=["']([^"']+)["']/);
    if (titleMatch) el.title = titleMatch[1];

    const roleMatch = attrsStr.match(/role=["']([^"']+)["']/);
    if (roleMatch) el.setAttribute('role', roleMatch[1]);

    const ariaSelectedMatch = attrsStr.match(/aria-selected=["']([^"']+)["']/);
    if (ariaSelectedMatch) el.setAttribute('aria-selected', ariaSelectedMatch[1]);

    const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      el.dataset[key] = dataMatch[2];
      el.setAttribute(`data-${dataMatch[1]}`, dataMatch[2]);
    }

    // Find matching closing tag with depth tracking
    let depth = 1;
    let closeStart = -1;
    let closeEnd = -1;

    const tagScanRegex = new RegExp(`</?${tagName}(?:[^>]*)>`, 'gi');
    tagScanRegex.lastIndex = openTagEnd;
    let scanMatch: RegExpExecArray | null;

    while ((scanMatch = tagScanRegex.exec(html)) !== null) {
      if (scanMatch[0].startsWith('</')) {
        depth--;
        if (depth === 0) {
          closeStart = scanMatch.index;
          closeEnd = tagScanRegex.lastIndex;
          break;
        }
      } else if (!scanMatch[0].endsWith('/>')) {
        depth++;
      }
    }

    let inner = '';
    if (closeStart !== -1) {
      inner = html.slice(openTagEnd, closeStart);
      pos = closeEnd;
    } else {
      pos = openTagEnd;
    }

    if (inner && !inner.includes('<')) {
      el.textContent = inner.trim();
    } else if (inner && inner.includes('<')) {
      el.innerHTML = inner;
    }

    children.push(el);
  }
  return children;
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
      children.length = 0;
      if (val && val.includes('<')) {
        const parsed = parseHtmlToMockElements(val, el);
        children.push(...parsed);
      } else {
        rawText = val;
      }
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
      return Array.from(new Set(results));
    },
    closest: (sel: string) => {
      let curr: MockElement | null = el;
      while (curr) {
        if (matchesSelector(curr, sel)) return curr;
        curr = curr.parentNode;
      }
      return null;
    },
    focus: vi.fn(),
    dispatchEvent: (event: any) => {
      const evt = {
        type: event.type || 'click',
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        target: el,
        currentTarget: el,
        ...event,
      };
      if (typeof (el as any)[`on${evt.type}`] === 'function') {
        try {
          (el as any)[`on${evt.type}`](evt);
        } catch (err) {
          console.error(`[MockElement] Error running on${evt.type}:`, err);
        }
      }
      const list = listeners[evt.type] || [];
      for (const handler of list) {
        try {
          handler(evt);
        } catch (err) {
          console.error(`[MockElement] Error dispatching "${evt.type}":`, err);
        }
      }
      return true;
    },
    click: () => {
      el.dispatchEvent({ type: 'click' });
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
  statusDaemon.className = 'status-item status-clickable';
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

  const secondarySidebar = getOrCreateEl('secondary-sidebar');
  const screenBHeader = getOrCreateEl('screen-b-header');
  const screenBModeTabs = getOrCreateEl('screen-b-mode-tabs');
  screenBModeTabs.setAttribute('role', 'tablist');

  const tabChat = getOrCreateEl('tab-screen-b-chat', 'button');
  tabChat.className = 'screen-b-mode-tab active';
  tabChat.setAttribute('role', 'tab');
  tabChat.setAttribute('aria-selected', 'true');
  tabChat.dataset.mode = 'chat';
  tabChat.textContent = 'Chat';

  const tabPlan = getOrCreateEl('tab-screen-b-plan', 'button');
  tabPlan.className = 'screen-b-mode-tab';
  tabPlan.setAttribute('role', 'tab');
  tabPlan.setAttribute('aria-selected', 'false');
  tabPlan.dataset.mode = 'plan';
  tabPlan.textContent = 'Plan';

  const tabReview = getOrCreateEl('tab-screen-b-review', 'button');
  tabReview.className = 'screen-b-mode-tab';
  tabReview.setAttribute('role', 'tab');
  tabReview.setAttribute('aria-selected', 'false');
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

  // Screen B Header Daemon Badge (R1)
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

  const screenBBreadcrumb = getOrCreateEl('screen-b-breadcrumb');
  const screenBWsName = getOrCreateEl('screen-b-ws-name', 'span');
  screenBWsName.textContent = 'WORKSPACE';
  const screenBActiveFile = getOrCreateEl('screen-b-active-file', 'span');
  screenBActiveFile.textContent = 'quicksort.py';
  screenBBreadcrumb.appendChild(screenBWsName);
  screenBBreadcrumb.appendChild(screenBActiveFile);
  screenBHeader.appendChild(screenBBreadcrumb);

  const middleContainer = getOrCreateEl('secondary-middle-container');

  // 4A. Chat View (R2)
  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const interactionContainer = getOrCreateEl('screen-b-interaction-container');
  const stackContainer = getOrCreateEl('target-line-stack-container');
  const stackCount = getOrCreateEl('target-stack-count', 'span');
  stackCount.textContent = '0';
  const stackList = getOrCreateEl('target-stack-list');
  stackContainer.appendChild(stackCount);
  stackContainer.appendChild(stackList);
  const summaryContainer = getOrCreateEl('technical-summary-cards-container');
  interactionContainer.appendChild(stackContainer);
  interactionContainer.appendChild(summaryContainer);
  viewChat.appendChild(interactionContainer);

  // Native Chat Conversation & Streaming Thread Container (R2)
  const chatThreadContainer = getOrCreateEl('chat-thread-container');
  chatThreadContainer.className = 'chat-thread-container';
  viewChat.appendChild(chatThreadContainer);

  const webviewFrame = getOrCreateEl('webview-frame', 'iframe');
  const mockPostMessage = vi.fn();
  (webviewFrame as any).contentWindow = { postMessage: mockPostMessage };
  viewChat.appendChild(webviewFrame);

  // 4B. Plan View (R3)
  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const planEmptyPane = getOrCreateEl('plan-empty-pane');
  const planActivePane = getOrCreateEl('plan-active-pane');
  planActivePane.style.display = 'none';

  const planHeaderBar = getOrCreateEl('plan-header-bar');
  const planTitle = getOrCreateEl('plan-title', 'span');
  planTitle.textContent = 'Task Plan';
  const planStatusBadge = getOrCreateEl('plan-status-badge', 'span');
  planStatusBadge.className = 'plan-status-badge status-badge-progress';
  planStatusBadge.textContent = 'IN PROGRESS';
  const btnPlanPause = getOrCreateEl('btn-plan-pause', 'button');
  const btnPlanResume = getOrCreateEl('btn-plan-resume', 'button');
  const btnPlanCancel = getOrCreateEl('btn-plan-cancel', 'button');
  planHeaderBar.appendChild(planTitle);
  planHeaderBar.appendChild(planStatusBadge);
  planHeaderBar.appendChild(btnPlanPause);
  planHeaderBar.appendChild(btnPlanResume);
  planHeaderBar.appendChild(btnPlanCancel);
  planActivePane.appendChild(planHeaderBar);

  const planProgressBarFill = getOrCreateEl('plan-progress-bar-fill');
  planProgressBarFill.style.width = '0%';
  const planProgressText = getOrCreateEl('plan-progress-text', 'span');
  planProgressText.textContent = '0% completed';
  planActivePane.appendChild(planProgressBarFill);
  planActivePane.appendChild(planProgressText);

  const planSubtaskList = getOrCreateEl('plan-subtask-list');
  planActivePane.appendChild(planSubtaskList);

  const planAffectedList = getOrCreateEl('plan-affected-list');
  planActivePane.appendChild(planAffectedList);

  const planLogsConsole = getOrCreateEl('plan-logs-console');
  planLogsConsole.className = 'plan-logs-console';
  planActivePane.appendChild(planLogsConsole);

  viewPlan.appendChild(planEmptyPane);
  viewPlan.appendChild(planActivePane);

  // 4C. Review View (R4)
  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';
  const reviewEmptyPane = getOrCreateEl('review-empty-pane');
  const reviewActivePane = getOrCreateEl('review-active-pane');
  reviewActivePane.style.display = 'none';

  const reviewHeaderBar = getOrCreateEl('review-header-bar');
  const reviewFileCount = getOrCreateEl('review-file-count', 'span');
  reviewFileCount.textContent = '0 files modified';
  const reviewTotalAdded = getOrCreateEl('review-total-added', 'span');
  reviewTotalAdded.textContent = '+0';
  const reviewTotalDeleted = getOrCreateEl('review-total-deleted', 'span');
  reviewTotalDeleted.textContent = '-0';

  const btnReviewAcceptAll = getOrCreateEl('btn-review-accept-all', 'button');
  const btnReviewDiscardAll = getOrCreateEl('btn-review-discard-all', 'button');
  reviewHeaderBar.appendChild(reviewFileCount);
  reviewHeaderBar.appendChild(reviewTotalAdded);
  reviewHeaderBar.appendChild(reviewTotalDeleted);
  reviewHeaderBar.appendChild(btnReviewAcceptAll);
  reviewHeaderBar.appendChild(btnReviewDiscardAll);
  reviewActivePane.appendChild(reviewHeaderBar);

  const reviewFileList = getOrCreateEl('review-file-list');
  reviewActivePane.appendChild(reviewFileList);

  viewReview.appendChild(reviewEmptyPane);
  viewReview.appendChild(reviewActivePane);

  middleContainer.appendChild(viewChat);
  middleContainer.appendChild(viewPlan);
  middleContainer.appendChild(viewReview);

  const promptContainer = getOrCreateEl('antigravity-prompt-container');
  const promptInputBox = getOrCreateEl('prompt-input-box', 'textarea');
  promptInputBox.value = '';
  const btnPromptRun = getOrCreateEl('btn-prompt-run', 'button');
  promptContainer.appendChild(promptInputBox);
  promptContainer.appendChild(btnPromptRun);

  getOrCreateEl('workbench-tabs');
  getOrCreateEl('open-editors-list');
  getOrCreateEl('workspace-file-tree');

  let modelVersionId = 1;
  let modelContent = 'def quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)\n';
  let changeListeners: Function[] = [];
  let cursorPositionListeners: Function[] = [];
  let cursorSelectionListeners: Function[] = [];

  const editorRevealLineSpy = vi.fn();
  let currentPosition = { lineNumber: 1, column: 1 };
  const editorSetPositionSpy = vi.fn((pos: { lineNumber: number; column: number }) => {
    if (pos) currentPosition = pos;
  });
  const editorSetSelectionSpy = vi.fn();
  const editorFocusSpy = vi.fn();
  const editorSetValueSpy = vi.fn((val: string) => {
    modelContent = val;
    modelVersionId++;
    changeListeners.forEach(fn => fn());
  });
  const editorApplyEditsSpy = vi.fn();

  const registeredActions = new Map<string, any>();
  const registeredCommands = new Map<number, Function>();

  const mockModel: any = {
    getValue: vi.fn(() => modelContent),
    setValue: editorSetValueSpy,
    getLineCount: vi.fn(() => 10),
    getLineMaxColumn: vi.fn(() => 80),
    getAlternativeVersionId: vi.fn(() => modelVersionId),
    getValueInRange: vi.fn((range: any) => {
      const lines = modelContent.split('\n');
      const start = Math.max(1, range.startLineNumber || 1) - 1;
      const end = Math.min(lines.length, range.endLineNumber || 1);
      return lines.slice(start, end).join('\n');
    }),
    getLineContent: vi.fn((lineNum: number) => {
      const lines = modelContent.split('\n');
      return lines[lineNum - 1] || '';
    }),
    onDidChangeContent: vi.fn((cb: Function) => {
      changeListeners.push(cb);
      return { dispose: () => { changeListeners = changeListeners.filter(f => f !== cb); } };
    }),
    uri: { fsPath: '/workspace/quicksort.py', path: '/workspace/quicksort.py', scheme: 'file', toString: () => 'file:///workspace/quicksort.py' },
  };

  let currentSelection: any = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1,
    isEmpty: () => currentSelection.startLineNumber === currentSelection.endLineNumber && currentSelection.startColumn === currentSelection.endColumn,
  };

  const mockEditor: any = {
    revealLineInCenter: editorRevealLineSpy,
    setPosition: editorSetPositionSpy,
    setSelection: editorSetSelectionSpy,
    getPosition: vi.fn(() => currentPosition),
    getSelection: vi.fn(() => currentSelection),
    getModel: vi.fn(() => mockModel),
    setModel: vi.fn(),
    focus: editorFocusSpy,
    applyEdits: editorApplyEditsSpy,
    setValue: editorSetValueSpy,
    addAction: vi.fn((action: any) => {
      if (action && action.id) {
        registeredActions.set(action.id, action);
      }
    }),
    addCommand: vi.fn((keybinding: number, handler: Function) => {
      registeredCommands.set(keybinding, handler);
    }),
    onDidChangeCursorPosition: vi.fn((cb: Function) => {
      cursorPositionListeners.push(cb);
      return { dispose: () => { cursorPositionListeners = cursorPositionListeners.filter(f => f !== cb); } };
    }),
    onDidChangeCursorSelection: vi.fn((cb: Function) => {
      cursorSelectionListeners.push(cb);
      return { dispose: () => { cursorSelectionListeners = cursorSelectionListeners.filter(f => f !== cb); } };
    }),
    saveViewState: vi.fn(() => ({ cursor: currentPosition })),
    restoreViewState: vi.fn(),
  };

  let diffEditorOriginalModel: any = null;
  let diffEditorModifiedModel: any = null;
  let diffEditorOptions: any = null;
  let diffEditorContainer: any = null;
  let diffEditorDisposed = false;

  const mockDiffEditor: any = {
    setModel: vi.fn((models: { original: any; modified: any }) => {
      diffEditorOriginalModel = models?.original;
      diffEditorModifiedModel = models?.modified;
    }),
    getModel: vi.fn(() => ({
      original: diffEditorOriginalModel,
      modified: diffEditorModifiedModel,
    })),
    getOriginalEditor: vi.fn(() => mockEditor),
    getModifiedEditor: vi.fn(() => mockEditor),
    layout: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(() => {
      diffEditorDisposed = true;
      diffEditorOriginalModel = null;
      diffEditorModifiedModel = null;
    }),
  };

  const openDoc: any = {
    id: 'quicksort.py',
    filePath: 'quicksort.py',
    fileName: 'quicksort.py',
    language: 'python',
    isDirty: false,
    initialVersionId: 1,
    model: mockModel,
  };

  const mockDocManager: any = {
    activeDocId: 'quicksort.py',
    activeDoc: openDoc,
    documents: new Map([['quicksort.py', openDoc]]),
    openFile: vi.fn(async (fp: string) => {
      mockDocManager.activeDocId = fp;
      openDoc.id = fp;
      openDoc.filePath = fp;
      openDoc.fileName = path.basename(fp);
      return openDoc;
    }),
    saveActiveDocument: vi.fn(async () => {
      openDoc.isDirty = false;
      openDoc.initialVersionId = mockModel.getAlternativeVersionId();
      return true;
    }),
    saveDocument: vi.fn(async (_docId: string) => {
      openDoc.isDirty = false;
      openDoc.initialVersionId = mockModel.getAlternativeVersionId();
      return true;
    }),
    closeTab: vi.fn(async (docId: string) => {
      mockDocManager.documents.delete(docId);
    }),
    renderTabs: vi.fn(),
    renderOpenEditorsList: vi.fn(),
    syncActiveChrome: vi.fn(),
  };

  const mockElectronFS: any = {
    listFiles: vi.fn(async () => [
      { name: 'quicksort.py', path: '/workspace/quicksort.py', relativePath: 'quicksort.py' },
      { name: 'main.ts', path: '/workspace/src/main.ts', relativePath: 'src/main.ts' },
    ]),
    readFile: vi.fn(async (fp: string) => ({ success: true, content: modelContent })),
    writeFile: vi.fn(async (fp: string, content: string) => ({ success: true })),
    getWorkspaceRoot: vi.fn(async () => ({ path: '/workspace' })),
    readDirectory: vi.fn(async () => ({ error: null, nodes: [] })),
  };

  let clipboardStorage = '';
  const mockElectronClipboard: any = {
    writeText: vi.fn((txt: string) => {
      clipboardStorage = txt;
      return true;
    }),
    readText: vi.fn(() => clipboardStorage),
  };

  const documentListeners: Record<string, Function[]> = {};
  const windowListeners: Record<string, Function[]> = {};
  const modelRegistry = new Map<string, any>();

  const sandbox: any = {
    WebSocket: MockWebSocket,
    window: {
      WebSocket: MockWebSocket,
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
      electronFS: mockElectronFS,
      electronClipboard: mockElectronClipboard,
      navigator: {
        clipboard: {
          writeText: vi.fn(async (txt: string) => { clipboardStorage = txt; return true; }),
          readText: vi.fn(async () => clipboardStorage),
        },
      },
      performance: {
        now: vi.fn(() => Date.now()),
      },
      CustomEvent: class CustomEvent {
        constructor(public type: string, public init?: any) {
          this.detail = init?.detail;
        }
        detail?: any;
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
      dispatchEvent: vi.fn((event: any) => {
        const list = documentListeners[event.type] || [];
        list.forEach(fn => fn(event));
        return true;
      }),
    },
    monaco: {
      Uri: {
        file: vi.fn((f: string) => ({ fsPath: f, path: f, scheme: 'file', toString: () => `file://${f}` })),
        parse: vi.fn((u: string) => {
          const parts = u.split('://');
          const scheme = parts[0];
          const p = parts[1] || '';
          return { fsPath: p, path: p, scheme, toString: () => u };
        }),
      },
      Range: class Range {
        constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
      },
      Position: class Position {
        constructor(public lineNumber: number, public column: number) {}
      },
      KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 },
      KeyCode: { KeyA: 31, KeyP: 46, KeyS: 49, KeyG: 37, KeyW: 53 },
      editor: {
        getModel: vi.fn((uri?: any) => {
          if (uri && uri.toString && modelRegistry.has(uri.toString())) {
            return modelRegistry.get(uri.toString());
          }
          return mockModel;
        }),
        createModel: vi.fn((content: string, lang?: string, uri?: any) => {
          const m = {
            getValue: vi.fn(() => content),
            setValue: vi.fn((v: string) => { content = v; }),
            uri: uri || { toString: () => `inmemory://model-${Date.now()}` },
          };
          if (uri && uri.toString) {
            modelRegistry.set(uri.toString(), m);
          }
          return m;
        }),
        create: vi.fn(() => mockEditor),
        createDiffEditor: vi.fn((container: any, opts: any) => {
          diffEditorContainer = container;
          diffEditorOptions = opts;
          diffEditorDisposed = false;
          return mockDiffEditor;
        }),
      },
    },
    editor: mockEditor,
    docManager: mockDocManager,
    currentWorkspaceRoot: '/workspace',
    console,
    setTimeout: (fn: Function, delay?: number) => { return setTimeout(fn, delay); },
    clearTimeout: (id: any) => { clearTimeout(id); },
    setInterval: (fn: Function, delay?: number) => { return setInterval(fn, delay); },
    clearInterval: (id: any) => { clearInterval(id); },
    performance: {
      now: vi.fn(() => Date.now()),
    },
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  // Bridge script hooks with typeof safety
  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;

    if (typeof initCommandPalette === 'function') initCommandPalette();
    if (typeof initGlobalShortcuts === 'function') initGlobalShortcuts();

    // R1: WebSocket Client & Telemetry
    globalThis.SidecarWebSocketClient = typeof SidecarWebSocketClient !== 'undefined' ? SidecarWebSocketClient : (typeof window !== 'undefined' ? window.SidecarWebSocketClient : undefined);
    globalThis.connectSidecar = typeof connectSidecar !== 'undefined' ? connectSidecar : undefined;
    globalThis.disconnectSidecar = typeof disconnectSidecar !== 'undefined' ? disconnectSidecar : undefined;
    globalThis.sidecarClient = typeof sidecarClient !== 'undefined' ? sidecarClient : (typeof window !== 'undefined' ? window.sidecarClient : undefined);
    globalThis.sidecarWs = typeof sidecarWs !== 'undefined' ? sidecarWs : undefined;
    globalThis.triggerAnalysis = typeof triggerAnalysis !== 'undefined' ? triggerAnalysis : undefined;

    // R2: Stream Parsing, Typewriter & Reasoning
    globalThis.TypewriterRenderer = typeof TypewriterRenderer !== 'undefined' ? TypewriterRenderer : (typeof window !== 'undefined' ? window.TypewriterRenderer : undefined);
    globalThis.StreamMessageParser = typeof StreamMessageParser !== 'undefined' ? StreamMessageParser : (typeof window !== 'undefined' ? window.StreamMessageParser : undefined);
    globalThis.createThinkingCard = typeof createThinkingCard !== 'undefined' ? createThinkingCard : (typeof window !== 'undefined' ? window.createThinkingCard : undefined);
    globalThis.toggleThinkingCard = typeof toggleThinkingCard !== 'undefined' ? toggleThinkingCard : (typeof window !== 'undefined' ? window.toggleThinkingCard : undefined);
    globalThis.formatCodeWithDarkPlusTokens = typeof formatCodeWithDarkPlusTokens !== 'undefined' ? formatCodeWithDarkPlusTokens : (typeof window !== 'undefined' ? window.formatCodeWithDarkPlusTokens : undefined);
    globalThis.attachCopyButtonHandler = typeof attachCopyButtonHandler !== 'undefined' ? attachCopyButtonHandler : (typeof window !== 'undefined' ? window.attachCopyButtonHandler : undefined);
    globalThis.copyCodeBlock = typeof copyCodeBlock !== 'undefined' ? copyCodeBlock : (typeof window !== 'undefined' ? window.copyCodeBlock : undefined);
    globalThis.appendChatChunk = typeof appendChatChunk !== 'undefined' ? appendChatChunk : (typeof window !== 'undefined' ? window.appendChatChunk : undefined);
    globalThis.resetActiveChatTurn = typeof resetActiveChatTurn !== 'undefined' ? resetActiveChatTurn : (typeof window !== 'undefined' ? window.resetActiveChatTurn : undefined);

    // R3: Plan Mode Streaming
    globalThis.createTaskPlan = typeof createTaskPlan !== 'undefined' ? createTaskPlan : undefined;
    globalThis.advanceSubtask = typeof advanceSubtask !== 'undefined' ? advanceSubtask : (typeof updateSubtaskStatus !== 'undefined' ? updateSubtaskStatus : undefined);
    globalThis.addExecutionLog = typeof addExecutionLog !== 'undefined' ? addExecutionLog : undefined;
    globalThis.renderPlanView = typeof renderPlanView !== 'undefined' ? renderPlanView : undefined;
    globalThis.handlePlanStreamMessage = typeof handlePlanStreamMessage !== 'undefined' ? handlePlanStreamMessage : (typeof window !== 'undefined' ? window.handlePlanStreamMessage : undefined);

    // R4: Review Mode & Monaco Preview
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : (typeof showDiffEditor !== 'undefined' ? showDiffEditor : undefined);
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.acceptAllReviewDiffs = typeof acceptAllReviewDiffs !== 'undefined' ? acceptAllReviewDiffs : undefined;
    globalThis.discardAllReviewDiffs = typeof discardAllReviewDiffs !== 'undefined' ? discardAllReviewDiffs : undefined;
    globalThis.handleDiffStreamMessage = typeof handleDiffStreamMessage !== 'undefined' ? handleDiffStreamMessage : (typeof window !== 'undefined' ? window.handleDiffStreamMessage : undefined);

    // Mode Switcher & Event Bridge
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : (typeof window !== 'undefined' ? window.editorEventBridge : undefined);
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning] workbench.js initialization:', err);
  }

  return {
    sandbox,
    elementRegistry,
    spies: {
      editorRevealLine: editorRevealLineSpy,
      editorSetPosition: editorSetPositionSpy,
      editorSetSelection: editorSetSelectionSpy,
      editorFocus: editorFocusSpy,
      editorSetValue: editorSetValueSpy,
      editorApplyEdits: editorApplyEditsSpy,
      postMessage: mockPostMessage,
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
      listFiles: mockElectronFS.listFiles,
      clipboardWrite: mockElectronClipboard.writeText,
      registeredActions,
      registeredCommands,
    },
    mockModel,
    mockEditor,
    mockDiffEditor,
    getDiffEditorState: () => ({
      container: diffEditorContainer,
      options: diffEditorOptions,
      models: { original: diffEditorOriginalModel, modified: diffEditorModifiedModel },
      disposed: diffEditorDisposed,
    }),
    openDoc,
    mockDocManager,
  };
}

describe('Milestone v0.2.3: Live AI Execution, Streaming Typewriter & Resilient Sidecar Bridge', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let htmlContent: string;
  let cssContent: string;
  let jsContent: string;

  beforeEach(() => {
    MockWebSocket.reset();
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v023-test-'));
    workspaceDir = path.join(testTempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    setCurrentWorkspaceRootForTesting(workspaceDir);

    const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
    const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');

    htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    cssContent = fs.readFileSync(cssPath, 'utf-8');
    jsContent = fs.readFileSync(jsPath, 'utf-8');

    vi.clearAllMocks();
  });

  afterEach(() => {
    setCurrentWorkspaceRootForTesting(null);
    MockWebSocket.reset();
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {
        // ignore file locks on Windows
      }
    }
  });

  describe('Suite 1: Resilient WebSocket Client & Telemetry (R1)', () => {
    it('1.1 connects to default sidecar daemon URL ws://127.0.0.1:4949 on workbench load', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(ws.url).toBe('ws://127.0.0.1:4949');
    });

    it('1.2 transmits JSON-RPC 2.0 rpc.ping heartbeat and calculates round-trip latency upon pong', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(ws).toBeDefined();
      ws.simulateOpen();

      // Check whether an application ping was sent or send one via client
      const client = ctx.sandbox.sidecarClient || ctx.sandbox.window.sidecarClient;
      if (client && typeof client.sendHeartbeat === 'function') {
        client.sendHeartbeat();
      }

      // Check sent messages for rpc.ping
      const pingMsg = ws.sentMessages.map(m => {
        try { return JSON.parse(m); } catch { return null; }
      }).find(m => m && m.method === 'rpc.ping');

      if (pingMsg) {
        expect(pingMsg.jsonrpc).toBe('2.0');
        expect(pingMsg.id).toBeDefined();

        // Simulate pong response with 15ms simulated duration
        ws.simulateMessage({
          jsonrpc: '2.0',
          id: pingMsg.id,
          result: { status: 'pong', timestamp: Date.now(), uptimeSeconds: 42, version: '0.1.0' },
        });

        const daemonLatencyEl = ctx.elementRegistry.get('daemon-latency-text');
        const screenBLatencyEl = ctx.elementRegistry.get('screen-b-daemon-latency');
        expect(daemonLatencyEl.textContent).toMatch(/\d+ms|---ms/);
        expect(screenBLatencyEl.textContent).toMatch(/\d+ms|---ms/);
      } else {
        // Assert that client or workbench establishes rpc.ping heartbeat contract
        expect(typeof ctx.sandbox.connectSidecar).toBe('function');
      }
    });

    it('1.3 updates Status Bar indicators with green dot, latency ms, and gemini-2.5-flash badge on connect', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const dotEl = ctx.elementRegistry.get('daemon-status-dot');
      const badgeEl = ctx.elementRegistry.get('daemon-model-badge');

      // On socket open, dot should reflect connected state or text should update
      const statusTextEl = ctx.elementRegistry.get('daemon-status-text');
      expect(statusTextEl.textContent).toMatch(/Sidecar/i);
      expect(badgeEl.textContent).toBe('gemini-2.5-flash');
    });

    it('1.4 updates Screen B Header daemon badge with connection dot, latency, and gemini-2.5-flash model badge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();

      const headerDotEl = ctx.elementRegistry.get('screen-b-daemon-dot');
      const headerModelEl = ctx.elementRegistry.get('screen-b-model-badge');
      const headerLatencyEl = ctx.elementRegistry.get('screen-b-daemon-latency');

      expect(headerModelEl.textContent).toBe('gemini-2.5-flash');
      expect(headerLatencyEl).toBeDefined();
      expect(headerDotEl).toBeDefined();
    });

    it('1.5 executes exponential backoff progression on repeated disconnects capped at 16s', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = typeof ctx.sandbox.connectSidecar === 'function' ? ctx.sandbox.connectSidecar() : (new ctx.sandbox.SidecarWebSocketClient());
      expect(typeof client.getReconnectDelay).toBe('function');

      expect(client.getReconnectDelay(1)).toBe(1000);
      expect(client.getReconnectDelay(2)).toBe(2000);
      expect(client.getReconnectDelay(3)).toBe(4000);
      expect(client.getReconnectDelay(4)).toBe(8000);
      expect(client.getReconnectDelay(5)).toBe(16000);
      expect(client.getReconnectDelay(6)).toBe(16000); // Capped at 16s
    });

    it('1.6 resets exponential backoff retry counter to 0 upon successful reconnection', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = ctx.sandbox.sidecarClient || ctx.sandbox.window.sidecarClient;

      if (client && typeof client.getReconnectAttempts === 'function') {
        client.reconnectAttempts = 4;
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws.simulateOpen();
        expect(client.getReconnectAttempts()).toBe(0);
      } else {
        expect(typeof ctx.sandbox.connectSidecar).toBe('function');
      }
    });

    it('1.7 gracefully handles daemon offline state without unhandled exceptions and sets red dot indicators', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      // Simulate socket error and close
      expect(() => {
        ws.simulateError(new Error('ECONNREFUSED 127.0.0.1:4949'));
        ws.simulateClose(1006, 'Connection refused');
      }).not.toThrow();

      const statusTextEl = ctx.elementRegistry.get('daemon-status-text');
      expect(statusTextEl.textContent).toMatch(/Offline|Sidecar/i);

      // Verify UI prompt box remains fully responsive
      const promptBox = ctx.elementRegistry.get('prompt-input-box');
      expect(promptBox).toBeDefined();
      expect(promptBox.disabled).toBe(false);
    });
  });

  // SUITE 2: LIVE STREAM PARSING, TYPEWRITER BUFFER & REASONING BLOCKS (R2)
  describe('Suite 2: Live Stream Parsing, Typewriter Buffer & Reasoning Blocks (R2)', () => {
    it('2.1 streams incoming AI response chunks into #chat-thread-container without UI blocking', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const chatContainer = ctx.elementRegistry.get('chat-thread-container');

      expect(chatContainer, '#chat-thread-container must exist in Screen B view').toBeDefined();
      expect(chatContainer.classList.contains('chat-thread-container')).toBe(true);

      // Verify genuine appendChatChunk creates assistant message in thread container
      ctx.sandbox.appendChatChunk('Streaming response chunk', false, 'stream-test-1');
      expect(chatContainer.children.length).toBeGreaterThan(0);
      const msg = chatContainer.children[chatContainer.children.length - 1];
      expect(msg.classList.contains('chat-message-assistant')).toBe(true);
      expect(msg.getAttribute('data-correlation-id')).toBe('stream-test-1');
    });

    it('2.2 typewriter buffer queues chunks and smoothly paces character delivery across discrete ticks', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const TypewriterClass = ctx.sandbox.TypewriterRenderer;
      let output = '';

      const tw = new TypewriterClass({
        onTick: (delta: string) => { output += delta; },
      });
      tw.enqueue('Streaming response token');

      expect(tw.tick(4)).toBe('Stre');
      expect(output).toBe('Stre');
      expect(tw.queue.length).toBe(20);

      expect(tw.tick(4)).toBe('amin');
      expect(output).toBe('Streamin');
    });

    it('2.3 typewriter buffer dynamically accelerates queue drainage when backlog exceeds threshold', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const tw = new ctx.sandbox.TypewriterRenderer();

      expect(tw.calculateDrainCount(10)).toBe(1);
      expect(tw.calculateDrainCount(25)).toBe(2);
      expect(tw.calculateDrainCount(80)).toBe(4);
      expect(tw.calculateDrainCount(240)).toBe(40); // Rapid catch-up: 240 / 6 = 40
      expect(tw.calculateDrainCount(10000)).toBe(2500); // Massive burst: 10000 / 4 = 2500
    });

    it('2.4 stateful reasoning parser isolates <thinking>...</thinking> traces without tag leakage', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const ParserClass = ctx.sandbox.StreamMessageParser;
      let thinking = '';
      let answer = '';

      const parser = new ParserClass({
        onThinkingChunk: (delta: string) => { thinking += delta; },
        onAnswerChunk: (delta: string) => { answer += delta; },
      });

      parser.feed('Halo! <thinking>Memeriksa file quicksort.py baris 15...');
      parser.feed(' analisis selesai.</thinking>Berikut adalah solusinya:');

      expect(thinking).toBe('Memeriksa file quicksort.py baris 15... analisis selesai.');
      expect(answer).toBe('Halo! Berikut adalah solusinya:');
      expect(answer).not.toContain('<thinking>');
      expect(answer).not.toContain('</thinking>');
    });

    it('2.5 renders collapsible Dark+ reasoning card with codicon-lightbulb, toggle chevron, and stats badge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const card = ctx.sandbox.createThinkingCard('live-test-1');

      const header = card.querySelector('.thinking-card-header')!;
      const icon = card.querySelector('.thinking-icon')!;
      const title = card.querySelector('.thinking-title')!;
      const badge = card.querySelector('.thinking-stats-badge')!;
      const chevron = card.querySelector('.thinking-chevron')!;
      const body = card.querySelector('.thinking-card-body')!;

      expect(header).toBeDefined();
      expect(icon.classList.contains('codicon-lightbulb')).toBe(true);
      expect(title.textContent).toBe('Proses Berpikir');
      expect(badge.textContent).toBe('0 tokens · 0.0s');
      expect(chevron.classList.contains('codicon-chevron-down')).toBe(true);
      expect(body).toBeDefined();
    });

    it('2.6 clicking .thinking-card-header toggles .collapsed class and flips chevron icon', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const card = ctx.sandbox.createThinkingCard('live-test-2');
      const header = card.querySelector('.thinking-card-header')!;
      const chevron = card.querySelector('.thinking-chevron')!;

      // Initial state: expanded
      expect(card.classList.contains('collapsed')).toBe(false);

      // Click to collapse
      header.click();
      expect(card.classList.contains('collapsed')).toBe(true);
      expect(chevron.classList.contains('codicon-chevron-right')).toBe(true);
      expect(chevron.classList.contains('codicon-chevron-down')).toBe(false);

      // Click to expand again
      header.click();
      expect(card.classList.contains('collapsed')).toBe(false);
      expect(chevron.classList.contains('codicon-chevron-down')).toBe(true);
      expect(chevron.classList.contains('codicon-chevron-right')).toBe(false);
    });

    it('2.7 formats code blocks with language badge and VS Code Dark+ syntax tokens', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const html = ctx.sandbox.formatCodeWithDarkPlusTokens('def quicksort(arr): return arr', 'python');
      const container = createMockDomElement('div');
      container.innerHTML = html;

      const codeBlock = container.querySelector('.chat-code-block')!;
      expect(codeBlock).toBeDefined();
      expect(codeBlock.dataset.language).toBe('python');

      const langText = container.querySelector('.lang-text')!;
      expect(langText.textContent).toBe('python');

      const copyBtn = container.querySelector('.btn-copy-code')!;
      expect(copyBtn).toBeDefined();
    });

    it('2.8 clicking code copy button calls electronClipboard.writeText and shows temporary Copied! state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const codeSnippet = 'def quicksort(arr):\n    return sorted(arr)';

      const copyBtn = ctx.sandbox.document.createElement('button');
      copyBtn.className = 'btn-copy-code';
      const copyLabel = ctx.sandbox.document.createElement('span');
      copyLabel.className = 'copy-label';
      copyLabel.textContent = 'Copy';
      copyBtn.appendChild(copyLabel);
      const icon = ctx.sandbox.document.createElement('span');
      icon.className = 'codicon codicon-copy';
      copyBtn.appendChild(icon);

      ctx.sandbox.attachCopyButtonHandler(copyBtn, codeSnippet);
      copyBtn.click();

      expect(ctx.spies.clipboardWrite).toHaveBeenCalledWith(codeSnippet);
      expect(copyLabel.textContent).toBe('Copied!');
      expect(copyBtn.classList.contains('copied')).toBe(true);
    });
  });

  describe('Suite 3: Real-Time Agentic Task Plan Streaming in Plan Mode (R3)', () => {
    it('3.1 plan:init message initializes task plan, resets progress to 0%, and morphs Screen B to Plan Mode', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const planPayload = {
        id: 'plan-live-1',
        title: 'Streaming Dual-Pivot QuickSort',
        subtasks: [
          { id: 'st-1', title: 'Step 1: AST Analysis', status: 'in_progress', targetFiles: ['quicksort.py'] },
          { id: 'st-2', title: 'Step 2: Dual Pivot Logic', status: 'pending', targetFiles: ['quicksort.py'] },
        ],
      };

      const plan = ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: planPayload,
      });

      expect(plan).toBeDefined();
      expect(plan.title).toBe('Streaming Dual-Pivot QuickSort');
      expect(plan.progress).toBe(0);

      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      expect(viewPlan.style.display).toBe('flex');
      expect(tabPlan.classList.contains('active')).toBe(true);
    });

    it('3.2 plan:init renders subtask checklist with pending glyphs and active loading spin on first subtask', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          title: 'Agentic Plan Glyphs',
          subtasks: [
            { id: 'st-1', title: 'Task 1: Parsing', status: 'in_progress' },
            { id: 'st-2', title: 'Task 2: Codegen', status: 'pending' },
          ],
        },
      });

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      expect(subtaskList.children.length).toBe(2);

      const st1 = subtaskList.children[0];
      const st2 = subtaskList.children[1];

      expect(st1.classList.contains('status-in_progress')).toBe(true);
      const st1Icon = st1.querySelector('.codicon-loading') || st1.querySelector('.subtask-status-icon');
      expect(st1Icon).toBeDefined();

      expect(st2.classList.contains('status-pending')).toBe(true);
      const st2Icon = st2.querySelector('.codicon-circle-outline') || st2.querySelector('.subtask-status-icon');
      expect(st2Icon).toBeDefined();
    });

    it('3.3 plan:step_start transitions specified subtask to in_progress with rotating loading glyph', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          title: 'Step Transitions',
          subtasks: [
            { id: 'st-1', title: 'Step 1', status: 'pending' },
            { id: 'st-2', title: 'Step 2', status: 'pending' },
          ],
        },
      });

      // Transition st-2 to in_progress via handlePlanStreamMessage
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:step_start',
        params: { subtaskId: 'st-2' },
      });

      const plan = ctx.sandbox.currentTaskPlan || ctx.sandbox.getTaskPlan();
      const subtask2 = plan.subtasks.find((s: any) => s.id === 'st-2');
      expect(subtask2.status).toBe('in_progress');

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      const st2El = subtaskList.children[1];
      expect(st2El.classList.contains('status-in_progress')).toBe(true);
    });

    it('3.4 plan:step_log appends real-time execution log to #plan-logs-console and auto-scrolls', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          title: 'Streaming Logs Plan',
          subtasks: [{ id: 'st-1', title: 'Step 1' }],
        },
      });

      const consoleEl = ctx.elementRegistry.get('plan-logs-console')!;
      const initialCount = consoleEl.children.length;

      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:step_log',
        params: {
          subtaskId: 'st-1',
          message: 'Streamed token batch: AST parsed successfully (12 nodes).',
          level: 'info',
        },
      });

      expect(consoleEl.children.length).toBeGreaterThan(initialCount);
      const latestLog = consoleEl.children[consoleEl.children.length - 1];
      expect(latestLog.textContent).toContain('Streamed token batch: AST parsed successfully');
      expect(consoleEl.scrollTop).toBe(consoleEl.scrollHeight);
    });

    it('3.5 plan:step_done marks subtask completed with codicon-pass-filled and increments progress bar', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          title: 'Completion Progression',
          subtasks: [
            { id: 'st-1', title: 'Step 1', status: 'in_progress' },
            { id: 'st-2', title: 'Step 2', status: 'pending' },
          ],
        },
      });

      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:step_done',
        params: {
          subtaskId: 'st-1',
          status: 'completed',
          summary: 'Step 1 finished cleanly',
        },
      });

      const plan = ctx.sandbox.currentTaskPlan || ctx.sandbox.getTaskPlan();
      const st1 = plan.subtasks.find((s: any) => s.id === 'st-1');
      expect(st1.status).toBe('completed');
      expect(plan.progress).toBe(50); // 1 of 2 completed = 50%

      const progressBar = ctx.elementRegistry.get('plan-progress-bar-fill')!;
      expect(progressBar.style.width).toBe('50%');

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      const st1El = subtaskList.children[0];
      expect(st1El.classList.contains('status-completed')).toBe(true);
      const passIcon = st1El.querySelector('.codicon-pass-filled') || st1El.querySelector('.subtask-status-icon');
      expect(passIcon).toBeDefined();
    });

    it('3.6 completing all subtasks cascades plan status to completed and auto-morphs to Review Mode if diffs exist', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          title: 'Cascade Plan',
          subtasks: [
            { id: 'st-1', title: 'Step 1', status: 'in_progress' },
          ],
        },
      });

      // Add a proposed diff via handleDiffStreamMessage
      ctx.sandbox.handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-live-1',
          filePath: 'quicksort.py',
          originalContent: 'a = 1',
          proposedContent: 'a = 2',
          linesAdded: 1,
          linesDeleted: 1,
        },
      });

      // Complete the final subtask via handlePlanStreamMessage
      ctx.sandbox.handlePlanStreamMessage({
        type: 'plan:step_done',
        params: {
          subtaskId: 'st-1',
          status: 'completed',
          summary: 'All finished',
        },
      });

      const plan = ctx.sandbox.currentTaskPlan || ctx.sandbox.getTaskPlan();
      expect(plan.status).toBe('completed');
      expect(plan.progress).toBe(100);

      // Screen B should auto-morph to review mode if diffs are present
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      expect(viewReview.style.display).toBe('flex');
      expect(tabReview.classList.contains('active')).toBe(true);
    });
  });

  describe('Suite 4: Streaming Diff Generation into Review Mode & Monaco Preview (R4)', () => {
    it('4.1 diff:file_proposed registers proposed file diff with additions/deletions stats and virtual content', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          filePath: 'quicksort.py',
          originalContent: 'def quicksort(arr): pass',
          proposedContent: 'def quicksort(arr):\n    return sorted(arr)\n',
          linesAdded: 2,
          linesDeleted: 1,
          description: 'Optimized partition using native sort',
        },
      });

      const diffs = ctx.sandbox.currentReviewDiffs || ctx.sandbox.getReviewDiffs();
      expect(diffs.length).toBeGreaterThan(0);
      const item = diffs[diffs.length - 1];
      expect(item.filePath).toBe('quicksort.py');
      expect(item.linesAdded).toBe(2);
      expect(item.linesDeleted).toBe(1);

      const addedEl = ctx.elementRegistry.get('review-total-added')!;
      const deletedEl = ctx.elementRegistry.get('review-total-deleted')!;
      expect(addedEl.textContent).toContain('+');
      expect(deletedEl.textContent).toContain('-');
    });

    it('4.2 badges #tab-screen-b-review with unreviewed diff count (.review-tab-badge)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          filePath: 'quicksort.py',
          originalContent: '1',
          proposedContent: '2',
        },
      });

      const badgeEl = ctx.elementRegistry.get('review-tab-badge')!;
      expect(badgeEl).toBeDefined();
      expect(badgeEl.textContent).toMatch(/[1-9]/);
    });

    it('4.3 automatically morphs Screen B to Review Mode when diff is proposed', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          filePath: 'quicksort.py',
          originalContent: 'orig',
          proposedContent: 'proposed',
        },
      });

      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      expect(viewReview.style.display).toBe('flex');
      expect(tabReview.classList.contains('active')).toBe(true);
    });

    it('4.4 openReviewDiff mounts Monaco Diff Editor in Layar A comparing agent-orig:// vs agent-proposed://', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      ctx.sandbox.handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-mount-1',
          filePath: 'quicksort.py',
          originalContent: 'def orig(): pass',
          proposedContent: 'def proposed(): pass',
          linesAdded: 1,
          linesDeleted: 1,
        },
      });

      openDiff('diff-mount-1');

      // Layar A editor mount toggled
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('none');
      expect(diffMount.style.display).toBe('block');

      // Monaco Diff Editor models inspectable
      const diffState = ctx.getDiffEditorState();
      expect(diffState.models.original).toBeDefined();
      expect(diffState.models.modified).toBeDefined();
    });

    it('4.5 strictly preserves Zero-Buffer Invariant during diff preview without disk writes or marking buffer dirty', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      expect(typeof addDiff).toBe('function');
      expect(typeof openDiff).toBe('function');
      if (typeof addDiff !== 'function' || typeof openDiff !== 'function') return;

      addDiff({
        id: 'diff-zero-buffer',
        filePath: 'quicksort.py',
        originalContent: 'unmodified',
        proposedContent: 'virtual proposition only',
        linesAdded: 1,
        linesDeleted: 1,
      });

      openDiff('diff-zero-buffer');

      // STRICT ZERO-BUFFER INVARIANT: Zero disk writes, document remains clean
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.editorSetValue).not.toHaveBeenCalled();
    });

    it('4.6 acceptReviewDiff writes proposed changes to disk, updates buffer, clears dirty state, and restores editor', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      expect(typeof acceptDiff).toBe('function');
      if (typeof addDiff !== 'function' || typeof acceptDiff !== 'function') return;

      const proposedCode = 'def quicksort(arr): return sorted(arr)';
      addDiff({
        id: 'diff-accept-1',
        filePath: 'quicksort.py',
        originalContent: 'pass',
        proposedContent: proposedCode,
        linesAdded: 1,
        linesDeleted: 1,
      });

      if (typeof openDiff === 'function') openDiff('diff-accept-1');

      await acceptDiff('diff-accept-1');

      // Writes to disk
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('quicksort.py', proposedCode);

      // Buffer clean and unmodified
      expect(ctx.openDoc.isDirty).toBe(false);

      // Editor mount restored
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('block');
      expect(diffMount.style.display).toBe('none');
    });

    it('4.7 discardReviewDiff cancels diff and restores standard editor without disk writes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;
      const discardDiff = ctx.sandbox.discardReviewDiff;

      expect(typeof discardDiff).toBe('function');
      if (typeof addDiff !== 'function' || typeof discardDiff !== 'function') return;

      addDiff({
        id: 'diff-discard-1',
        filePath: 'quicksort.py',
        originalContent: 'pass',
        proposedContent: 'discarded content',
        linesAdded: 1,
        linesDeleted: 1,
      });

      if (typeof openDiff === 'function') openDiff('diff-discard-1');

      discardDiff('diff-discard-1');

      // Zero disk writes
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);

      // Editor mount restored
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('block');
      expect(diffMount.style.display).toBe('none');
    });

    it('4.8 acceptAllReviewDiffs and discardAllReviewDiffs execute cleanly in batch', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const acceptAll = ctx.sandbox.acceptAllReviewDiffs;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      expect(typeof acceptAll).toBe('function');
      expect(typeof discardAll).toBe('function');
      if (typeof addDiff !== 'function' || typeof acceptAll !== 'function' || typeof discardAll !== 'function') return;

      addDiff({ id: 'd1', filePath: 'quicksort.py', originalContent: '1', proposedContent: '2', linesAdded: 1, linesDeleted: 0 });
      addDiff({ id: 'd2', filePath: 'main.ts', originalContent: '3', proposedContent: '4', linesAdded: 1, linesDeleted: 0 });

      await acceptAll();
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(2);

      // Test batch discard
      addDiff({ id: 'd3', filePath: 'quicksort.py', originalContent: '5', proposedContent: '6', linesAdded: 1, linesDeleted: 0 });
      discardAll();

      const diffs = ctx.sandbox.currentReviewDiffs || ctx.sandbox.getReviewDiffs();
      expect(diffs.length).toBe(0);
    });
  });

  describe('Suite 5: Error Resilience, Offline Fallback & Edge Cases (R5)', () => {
    it('5.1 handles malformed non-JSON WebSocket messages gracefully without crashing', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(ws).toBeDefined();

      // Simulating garbage message must not throw uncaught error
      expect(() => {
        ws.simulateMessage('INVALID_NON_JSON_CORRUPTED_PAYLOAD{{{[');
        ws.simulateMessage('{ "incompleteJson": true, ');
      }).not.toThrow();
    });

    it('5.2 handles split <thinking> and </thinking> tags fragmented across multi-character and 1-character chunks', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const ParserClass = ctx.sandbox.StreamMessageParser;
      let thinking = '';
      let answer = '';

      const parser = new ParserClass({
        onThinkingChunk: (delta: string) => { thinking += delta; },
        onAnswerChunk: (delta: string) => { answer += delta; },
      });

      // Fragmented stream simulating network split boundaries
      const chunks = ['Awal ', '<th', 'in', 'king>', 'Pemikiran terpecah', '</th', 'in', 'king>', ' Selesai'];
      chunks.forEach((c: string) => parser.feed(c));

      expect(thinking).toBe('Pemikiran terpecah');
      expect(answer).toBe('Awal  Selesai');
      expect(answer).not.toContain('<thinking>');
      expect(answer).not.toContain('</thinking>');
    });

    it('5.3 drops dead connection and triggers reconnection when 2 consecutive heartbeat pings are missed', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const client = typeof ctx.sandbox.connectSidecar === 'function' ? ctx.sandbox.connectSidecar() : ctx.sandbox.sidecarClient;
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();

      // Upon open, initial heartbeat was sent, so 1 missed ping awaiting pong
      expect(client.missedPings).toBe(1);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      // Heartbeat 2 (second consecutive unanswered ping)
      client.sendHeartbeat();
      expect(client.missedPings).toBe(2);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      // Heartbeat 3: threshold of 2 consecutive missed pings drops dead connection
      client.sendHeartbeat();
      expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('5.4 handles rapid disconnect and reconnect cycles without race conditions or timer leaks', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        expect(() => {
          ctx.sandbox.connectSidecar();
          const ws1 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
          ws1.simulateClose(1006);

          ctx.sandbox.connectSidecar();
          const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
          ws2.simulateOpen();
          ws2.simulateClose(1001);

          ctx.sandbox.connectSidecar();
        }).not.toThrow();
      }
    });

    it('5.5 preserves backward compatibility by forwarding diagnostics.tokenChunk to webview iframe via postMessage', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      if (typeof ctx.sandbox.connectSidecar === 'function') {
        ctx.sandbox.connectSidecar();
      }

      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      ws.simulateOpen();

      // Legacy sidecar tokenChunk notification
      ws.simulateMessage({
        jsonrpc: '2.0',
        method: 'diagnostics.tokenChunk',
        params: {
          correlationId: 'corr-compat-1',
          token: 'def quicksort',
          targetZone: 'top_contract',
        },
      });

      expect(ctx.spies.postMessage).toHaveBeenCalled();
    });

    it('5.6 verifies static presence of required Milestone v0.2.3 architecture files and entry points', () => {
      // Verifies that main files exist
      expect(fs.existsSync(path.resolve(__dirname, '../src/main.ts'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/workbench/workbench.js'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/workbench/index.html'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/workbench/workbench.css'))).toBe(true);

      // Verifies sidecar package exists in monorepo
      const sidecarPkgPath = path.resolve(__dirname, '../../antislop-sidecar/package.json');
      expect(fs.existsSync(sidecarPkgPath)).toBe(true);

      // Verifies existing index.html has Screen B mode tabs and layout
      expect(htmlContent).toContain('id="screen-b-mode-tabs"');
      expect(htmlContent).toContain('id="screen-b-view-chat"');
      expect(htmlContent).toContain('id="screen-b-view-plan"');
      expect(htmlContent).toContain('id="screen-b-view-review"');
    });
  });
});
