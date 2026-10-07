import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import vm from 'vm';
import { EventEmitter } from 'events';

// Hoisted mocks for Electron and Child Process
const {
  ipcHandlers,
  mockWebContents,
  mockMainWindow,
  mockShell,
  mockClipboard,
  mockExecFile,
  mockSpawn,
} = vi.hoisted(() => {
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

  const execFileFn = vi.fn();
  const spawnFn = vi.fn();

  return {
    ipcHandlers: handlers,
    mockWebContents: webContents,
    mockMainWindow: mainWindow,
    mockShell: shell,
    mockClipboard: clipboard,
    mockExecFile: execFileFn,
    mockSpawn: spawnFn,
  };
});

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.2.5',
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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: mockExecFile,
    spawn: mockSpawn,
  };
});

// Import main module to trigger IPC registrations and set workspace root
import {
  setCurrentWorkspaceRootForTesting,
  registerAntigravityIpc,
  registerTerminalIpc,
} from '../src/main';

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
  selectedIndex?: number;
  options?: MockElement[];
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

  while ((match = openTagRegex.exec(html)) !== null) {
    const tagName = match[1];
    if (tagName.startsWith('/')) continue;
    const rawAttrs = match[2];

    const child = createMockDomElement(tagName);
    child.parentNode = parent;

    const idMatch = rawAttrs.match(/id=["']([^"']+)["']/);
    if (idMatch) child.id = idMatch[1];

    const classMatch = rawAttrs.match(/class=["']([^"']+)["']/);
    if (classMatch) child.className = classMatch[1];

    const valMatch = rawAttrs.match(/value=["']([^"']*)["']/);
    if (valMatch) child.value = valMatch[1];

    children.push(child);
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
  let rawVal = '';
  let selectedValue: string | undefined = undefined;

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
      if (children.length > 0 && !rawHtml) {
        return children.map(c => {
          const t = c.tagName.toLowerCase();
          const cls = c.className ? ` class="${c.className}"` : '';
          const i = c.id ? ` id="${c.id}"` : '';
          const v = c.attributes.value !== undefined ? ` value="${c.attributes.value}"` : '';
          return `<${t}${cls}${i}${v}>${c.innerHTML || c.textContent}</${t}>`;
        }).join('');
      }
      return rawHtml;
    },
    set innerHTML(val: string) {
      rawHtml = val;
      children.length = 0;
      selectedValue = undefined;
      if (val && val.includes('<')) {
        const parsed = parseHtmlToMockElements(val, el);
        children.push(...parsed);
      } else {
        rawText = val;
      }
    },
    get value() {
      if (el.tagName === 'SELECT') {
        if (selectedValue !== undefined) return selectedValue;
        const opts = children.filter(c => c.tagName === 'OPTION');
        return opts.length > 0 ? opts[0].value : '';
      }
      return rawVal;
    },
    set value(v: string) {
      if (el.tagName === 'SELECT') {
        selectedValue = String(v);
      } else {
        rawVal = String(v);
      }
    },
    get options() {
      return children.filter(c => c.tagName === 'OPTION');
    },
    get selectedIndex() {
      const opts = children.filter(c => c.tagName === 'OPTION');
      return opts.findIndex(o => o.value === el.value);
    },
    set selectedIndex(idx: number) {
      const opts = children.filter(c => c.tagName === 'OPTION');
      if (opts[idx]) {
        el.value = opts[idx].value;
      }
    },
    disabled: false,
    title: '',
    children,
    parentNode: null,
    getAttribute: (attr: string) => {
      if (attr === 'disabled' && el.disabled) return '';
      return attributes[attr] ?? (attr === 'id' ? el.id : (attr === 'class' ? el.className : null));
    },
    setAttribute: (attr: string, val: string) => {
      attributes[attr] = String(val);
      if (attr === 'id') el.id = String(val);
      if (attr === 'class') el.className = String(val);
      if (attr === 'disabled') el.disabled = true;
      if (attr === 'value') {
        rawVal = String(val);
        selectedValue = String(val);
      }
    },
    removeAttribute: (attr: string) => {
      delete attributes[attr];
      if (attr === 'disabled') el.disabled = false;
    },
    hasAttribute: (attr: string) => (attr === 'disabled' && el.disabled) || (attr in attributes),
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
    click: () => {
      if (el.disabled) return;
      const handlers = listeners['click'] || [];
      handlers.forEach(h => h({ type: 'click', target: el }));
    },
    dispatchEvent: (event: any) => {
      const type = typeof event === 'string' ? event : event?.type;
      const handlers = listeners[type] || [];
      const ev = typeof event === 'string' ? { type, target: el } : { ...event, target: el };
      handlers.forEach(h => h(ev));
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

  // Antigravity Prompt Box & Controls
  const antigravityPromptContainer = getOrCreateEl('antigravity-prompt-container');
  const promptInputBox = getOrCreateEl('prompt-input-box', 'textarea');
  const btnPromptRun = getOrCreateEl('btn-prompt-run', 'button');
  const statusAgy = getOrCreateEl('status-agy');
  const statusAgyText = getOrCreateEl('status-agy-text', 'span');
  statusAgy.appendChild(statusAgyText);

  // Sub-Agent dropdown in prompt actions right
  const agentSelectDropdown = getOrCreateEl('agent-select-dropdown', 'select');
  agentSelectDropdown.className = 'agent-select-dropdown panel-channel-select';

  const defaultOption = createMockDomElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Agent: Default';
  agentSelectDropdown.appendChild(defaultOption);

  const modelSelectDropdown = getOrCreateEl('model-select-dropdown');
  const modelLabel = createMockDomElement('span');
  modelLabel.className = 'model-label';
  modelLabel.textContent = 'Auto';
  modelSelectDropdown.appendChild(modelLabel);

  const chatThreadContainer = getOrCreateEl('chat-thread-container');
  const secondarySidebar = getOrCreateEl('secondary-sidebar');
  const primarySidebar = getOrCreateEl('primary-sidebar');

  const rootDoc = createMockDomElement('html', 'root');
  elementRegistry.forEach(el => rootDoc.appendChild(el));

  const mockDocument = {
    getElementById: (id: string) => elementRegistry.get(id) || null,
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return elementRegistry.get(sel.slice(1)) || null;
      return rootDoc.querySelector(sel);
    },
    querySelectorAll: (sel: string) => rootDoc.querySelectorAll(sel),
    createElement: (tag: string) => createMockDomElement(tag),
    body: rootDoc,
    documentElement: rootDoc,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  let outputCallback: Function | null = null;
  let exitCallback: Function | null = null;

  const mockElectronAntigravity = {
    checkStatus: vi.fn().mockResolvedValue({
      available: true,
      version: '1.2.16',
      binaryPath: 'C:\\Users\\DELL\\AppData\\Local\\agy\\bin\\agy.exe',
    }),
    getModels: vi.fn().mockResolvedValue({
      available: true,
      models: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash High' },
      ],
    }),
    getAgents: vi.fn().mockResolvedValue({
      available: true,
      agents: [
        { id: 'research', name: 'research' },
        { id: 'security-boundary-verifier', name: 'security-boundary-verifier' },
        { id: 'build-error-resolver', name: 'build-error-resolver' },
        { id: 'consistency-auditor', name: 'consistency-auditor' },
      ],
    }),
    runCommand: vi.fn().mockResolvedValue(undefined),
    cancelCommand: vi.fn().mockResolvedValue(undefined),
    onOutput: vi.fn().mockImplementation((cb) => {
      outputCallback = cb;
      return () => { outputCallback = null; };
    }),
    onExit: vi.fn().mockImplementation((cb) => {
      exitCallback = cb;
      return () => { exitCallback = null; };
    }),
  };

  const sandbox: any = {
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    document: mockDocument,
    window: {
      document: mockDocument,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronAntigravity: mockElectronAntigravity,
      electronFS: {
        getWorkspaceRoot: vi.fn().mockResolvedValue({ path: 'C:\\workspace' }),
        writeFile: vi.fn().mockResolvedValue(true),
      },
      electronIpc: {
        invoke: vi.fn().mockResolvedValue({}),
      },
      setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id),
      setInterval: (fn: Function, ms: number) => setInterval(fn, ms),
      clearInterval: (id: any) => clearInterval(id),
      screenBController: undefined,
    },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    electronAntigravity: mockElectronAntigravity,
    monaco: undefined,
    editor: undefined,
    docManager: undefined,
  };

  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);

  const harnessHook = `
    globalThis.SCREEN_B_OPERATIONAL_RULESET = typeof SCREEN_B_OPERATIONAL_RULESET !== 'undefined' ? SCREEN_B_OPERATIONAL_RULESET : undefined;
    globalThis.FALLBACK_SUB_AGENTS = typeof FALLBACK_SUB_AGENTS !== 'undefined' ? FALLBACK_SUB_AGENTS : undefined;
    globalThis.buildScreenBPromptEnvelope = typeof buildScreenBPromptEnvelope !== 'undefined' ? buildScreenBPromptEnvelope : undefined;
    globalThis.populateAgentDropdown = typeof populateAgentDropdown !== 'undefined' ? populateAgentDropdown : undefined;
    globalThis.getAvailableAgents = typeof getAvailableAgents !== 'undefined' ? getAvailableAgents : undefined;
    globalThis.getSelectedAgent = typeof getSelectedAgent !== 'undefined' ? getSelectedAgent : undefined;
    globalThis.setSelectedAgent = typeof setSelectedAgent !== 'undefined' ? setSelectedAgent : undefined;
    globalThis.initAntigravityBridge = typeof initAntigravityBridge !== 'undefined' ? initAntigravityBridge : undefined;
    globalThis.runAntigravityPrompt = typeof runAntigravityPrompt !== 'undefined' ? runAntigravityPrompt : undefined;
    globalThis.appendUserMessage = typeof appendUserMessage !== 'undefined' ? appendUserMessage : undefined;
    globalThis.screenBController = typeof screenBController !== 'undefined' ? screenBController : undefined;
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning] workbench.js execution:', err);
  }

  // Bind exported symbols directly onto sandbox for convenient test access
  sandbox.SCREEN_B_OPERATIONAL_RULESET = sandbox.window.SCREEN_B_OPERATIONAL_RULESET;
  sandbox.FALLBACK_SUB_AGENTS = sandbox.window.FALLBACK_SUB_AGENTS;
  sandbox.buildScreenBPromptEnvelope = sandbox.window.buildScreenBPromptEnvelope;
  sandbox.populateAgentDropdown = sandbox.window.populateAgentDropdown;
  sandbox.getAvailableAgents = sandbox.window.getAvailableAgents;
  sandbox.getSelectedAgent = sandbox.window.getSelectedAgent;
  sandbox.setSelectedAgent = sandbox.window.setSelectedAgent;
  sandbox.initAntigravityBridge = sandbox.window.initAntigravityBridge;
  sandbox.runAntigravityPrompt = sandbox.window.runAntigravityPrompt;
  sandbox.appendUserMessage = sandbox.window.appendUserMessage;
  sandbox.mockElectronAntigravity = mockElectronAntigravity;

  return {
    sandbox,
    elementRegistry,
    mockElectronAntigravity,
    simulateOutput: (chunk: string, correlationId: string) => {
      if (outputCallback) outputCallback({ correlationId, chunk, stream: 'stdout', timestamp: Date.now() });
    },
    simulateExit: (exitCode = 0, correlationId: string) => {
      if (exitCallback) exitCallback({ correlationId, exitCode, durationMs: 100 });
    },
  };
}

describe('Milestone v0.2.5: Antigravity Sub-Agent Dynamic Discovery & In-Flight Isolated Ruleset', () => {
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const indexHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const geminiConfigPath = 'C:\\Users\\DELL\\.gemini\\GEMINI.md';
  const EXPECTED_GEMINI_MD5 = 'BB220CB5B3230E9A127EB14FDF05BEC1';

  let workbenchJsCode: string;
  let indexHtmlContent: string;
  let workbenchCssContent: string;

  beforeEach(() => {
    workbenchJsCode = fs.readFileSync(workbenchJsPath, 'utf-8');
    indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
    workbenchCssContent = fs.readFileSync(workbenchCssPath, 'utf-8');
    registerAntigravityIpc();
    registerTerminalIpc();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Suite 1: Sub-Agent Dynamic Discovery IPC (antigravity:getAgents)
  // ===========================================================================
  describe('Suite 1: Sub-Agent Dynamic Discovery IPC (antigravity:getAgents)', () => {
    it('1.1 verifies antigravity:getAgents handler is registered in ipcMain', () => {
      expect(ipcHandlers.has('antigravity:getAgents')).toBe(true);
      expect(typeof ipcHandlers.get('antigravity:getAgents')).toBe('function');
    });

    it('1.2 parses multi-line stdout from agy agents into structured agent array', async () => {
      mockExecFile.mockImplementation((binary: string, args: string[], options: any, callback: Function) => {
        const cb = typeof options === 'function' ? options : callback;
        if (args && args[0] === 'agents') {
          cb(null, 'build-error-resolver\nconsistency-auditor\nmeta-auditor\nresearch\nsecurity-boundary-verifier\n');
        } else {
          cb(null, '');
        }
      });

      const handler = ipcHandlers.get('antigravity:getAgents')!;
      const result = await handler();

      expect(result.available).toBe(true);
      expect(Array.isArray(result.agents)).toBe(true);
      expect(result.agents).toHaveLength(5);
      expect(result.agents[0]).toEqual({ id: 'build-error-resolver', name: 'build-error-resolver' });
      expect(result.agents[3]).toEqual({ id: 'research', name: 'research' });
      expect(result.agents[4]).toEqual({ id: 'security-boundary-verifier', name: 'security-boundary-verifier' });
    });

    it('1.3 filters empty lines and log notices (such as lines starting with fetching)', async () => {
      mockExecFile.mockImplementation((binary: string, args: string[], options: any, callback: Function) => {
        const cb = typeof options === 'function' ? options : callback;
        cb(null, '  \nfetching agent registry...\nFetching update manifest\nresearch\n\n\nsilent-failure-hunter\n  \n');
      });

      const handler = ipcHandlers.get('antigravity:getAgents')!;
      const result = await handler();

      expect(result.available).toBe(true);
      expect(result.agents).toHaveLength(2);
      expect(result.agents).toEqual([
        { id: 'research', name: 'research' },
        { id: 'silent-failure-hunter', name: 'silent-failure-hunter' },
      ]);
    });

    it('1.4 returns { available: false, agents: [] } when CLI execution errors or times out', async () => {
      mockExecFile.mockImplementation((binary: string, args: string[], options: any, callback: Function) => {
        const cb = typeof options === 'function' ? options : callback;
        cb(new Error('CLI process timed out after 5000ms'), '');
      });

      const handler = ipcHandlers.get('antigravity:getAgents')!;
      const result = await handler();

      expect(result).toEqual({ available: false, agents: [] });
    });

    it('1.5 verifies preload bridge exposes getAgents() invoking antigravity:getAgents', () => {
      const preloadPath = path.resolve(__dirname, '../src/preload.ts');
      const preloadContent = fs.readFileSync(preloadPath, 'utf-8');

      expect(preloadContent).toContain("getAgents: () => ipcRenderer.invoke('antigravity:getAgents')");
      expect(preloadContent).toContain("runCommand: (params: { prompt: string; correlationId: string; cwd?: string; model?: string; agent?: string })");
    });
  });

  // ===========================================================================
  // Suite 2: Sub-Agent Selection & --agent Argument Propagation in runCommand
  // ===========================================================================
  describe('Suite 2: Sub-Agent Selection & --agent Argument Propagation in antigravity:runCommand', () => {
    it('2.1 verifies antigravity:runCommand is registered in ipcMain', () => {
      expect(ipcHandlers.has('antigravity:runCommand')).toBe(true);
    });

    it('2.2 appends ["--agent", params.agent] to CLI args when agent is specified', async () => {
      let capturedArgs: string[] = [];
      const mockProcess = {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: vi.fn(),
        kill: vi.fn(),
      };

      mockSpawn.mockImplementation((binary: string, args: string[]) => {
        capturedArgs = [...args];
        return mockProcess;
      });

      const handler = ipcHandlers.get('antigravity:runCommand')!;
      await handler(null, {
        prompt: 'Audit boundary contracts',
        correlationId: 'corr-agent-1',
        agent: 'security-boundary-verifier',
      });

      expect(capturedArgs).toContain('--agent');
      const agentIndex = capturedArgs.indexOf('--agent');
      expect(capturedArgs[agentIndex + 1]).toBe('security-boundary-verifier');
      expect(capturedArgs).toContain('--print');
    });

    it('2.3 does NOT append --agent flag when agent is undefined, empty, or default', async () => {
      let capturedArgs: string[] = [];
      const mockProcess = {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: vi.fn(),
        kill: vi.fn(),
      };

      mockSpawn.mockImplementation((binary: string, args: string[]) => {
        capturedArgs = [...args];
        return mockProcess;
      });

      const handler = ipcHandlers.get('antigravity:runCommand')!;

      // Undefined agent
      await handler(null, {
        prompt: 'Check syntax',
        correlationId: 'corr-agent-2',
      });
      expect(capturedArgs).not.toContain('--agent');

      // Empty agent
      await handler(null, {
        prompt: 'Check syntax',
        correlationId: 'corr-agent-3',
        agent: '',
      });
      expect(capturedArgs).not.toContain('--agent');

      // 'default' agent
      await handler(null, {
        prompt: 'Check syntax',
        correlationId: 'corr-agent-4',
        agent: 'default',
      });
      expect(capturedArgs).not.toContain('--agent');
    });

    it('2.4 passes both --agent and --model without flag collisions', async () => {
      let capturedArgs: string[] = [];
      const mockProcess = {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        on: vi.fn(),
        kill: vi.fn(),
      };

      mockSpawn.mockImplementation((binary: string, args: string[]) => {
        capturedArgs = [...args];
        return mockProcess;
      });

      const handler = ipcHandlers.get('antigravity:runCommand')!;
      await handler(null, {
        prompt: 'Perform deep research',
        correlationId: 'corr-agent-5',
        model: 'gemini-3.8-flash-high',
        agent: 'research',
      });

      expect(capturedArgs).toContain('--agent');
      expect(capturedArgs[capturedArgs.indexOf('--agent') + 1]).toBe('research');
      expect(capturedArgs).toContain('--model');
      expect(capturedArgs[capturedArgs.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
    });
  });

  // ===========================================================================
  // Suite 3: UI Dropdown Population & Event Binding (#agent-select-dropdown)
  // ===========================================================================
  describe('Suite 3: UI Dropdown Population & Event Binding (#agent-select-dropdown)', () => {
    it('3.1 verifies #agent-select-dropdown exists in index.html with VS Code Dark+ classes and default option', () => {
      expect(indexHtmlContent).toContain('id="agent-select-dropdown"');
      expect(indexHtmlContent).toContain('class="agent-select-dropdown panel-channel-select"');
      expect(indexHtmlContent).toContain('<option value="">Agent: Default</option>');
    });

    it('3.2 verifies #agent-select-dropdown is positioned directly before #model-select-dropdown', () => {
      const dropdownIdx = indexHtmlContent.indexOf('id="agent-select-dropdown"');
      const modelDropdownIdx = indexHtmlContent.indexOf('id="model-select-dropdown"');

      expect(dropdownIdx).toBeGreaterThan(0);
      expect(modelDropdownIdx).toBeGreaterThan(0);
      expect(dropdownIdx).toBeLessThan(modelDropdownIdx);
    });

    it('3.3 verifies workbench.css includes VS Code Dark+ styling tokens for .agent-select-dropdown', () => {
      expect(workbenchCssContent).toContain('.agent-select-dropdown');
      expect(workbenchCssContent).toContain('background-color: #252526');
      expect(workbenchCssContent).toContain('border: 1px solid #3f3f46');
      expect(workbenchCssContent).toContain('border-color: #007acc'); // focus
      expect(workbenchCssContent).toContain('max-width: 140px');
    });

    it('3.4 populateAgentDropdown correctly populates default option and agent list', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJsCode);
      const dropdown = elementRegistry.get('agent-select-dropdown')!;

      const testAgents = [
        { id: 'research', name: 'research' },
        { id: 'security-boundary-verifier', name: 'security-boundary-verifier' },
      ];

      sandbox.populateAgentDropdown(testAgents);

      expect(dropdown.children.length).toBe(3); // 1 default + 2 agents
      expect(dropdown.children[0].value).toBe('');
      expect(dropdown.children[0].textContent).toBe('Agent: Default');
      expect(dropdown.children[1].value).toBe('research');
      expect(dropdown.children[2].value).toBe('security-boundary-verifier');
    });

    it('3.5 initAntigravityBridge populates discovered agents from electronAntigravity.getAgents()', async () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJsCode);
      const dropdown = elementRegistry.get('agent-select-dropdown')!;

      await sandbox.initAntigravityBridge();

      expect(sandbox.mockElectronAntigravity.getAgents).toHaveBeenCalled();
      const available = sandbox.getAvailableAgents();
      expect(available.length).toBe(4);
      expect(available.map((a: any) => a.id)).toContain('research');
      expect(available.map((a: any) => a.id)).toContain('security-boundary-verifier');

      // Dropdown children: 1 default + 4 agents = 5
      expect(dropdown.children.length).toBe(5);
    });

    it('3.6 initAntigravityBridge falls back to FALLBACK_SUB_AGENTS when getAgents() fails or returns unavailable', async () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJsCode);
      sandbox.mockElectronAntigravity.getAgents.mockResolvedValueOnce({ available: false, agents: [] });
      const dropdown = elementRegistry.get('agent-select-dropdown')!;

      await sandbox.initAntigravityBridge();

      const available = sandbox.getAvailableAgents();
      expect(available.length).toBe(7); // 7 fallback agents
      expect(available.map((a: any) => a.id)).toEqual([
        'research',
        'security-boundary-verifier',
        'build-error-resolver',
        'consistency-auditor',
        'meta-auditor',
        'silent-failure-hunter',
        'specification-gap-auditor',
      ]);
      expect(dropdown.children.length).toBe(8); // 1 default + 7 fallbacks
    });

    it('3.7 changing #agent-select-dropdown updates selectedAgent state and controller helpers', async () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJsCode);
      await sandbox.initAntigravityBridge();
      const dropdown = elementRegistry.get('agent-select-dropdown')!;

      dropdown.value = 'security-boundary-verifier';
      dropdown.dispatchEvent({ type: 'change', target: { value: 'security-boundary-verifier' } });

      expect(sandbox.getSelectedAgent()).toBe('security-boundary-verifier');

      // Programmatic setSelectedAgent
      sandbox.setSelectedAgent('build-error-resolver');
      expect(sandbox.getSelectedAgent()).toBe('build-error-resolver');
      expect(dropdown.value).toBe('build-error-resolver');
    });

    it('3.8 dropdown is disabled during prompt execution and re-enabled upon completion', async () => {
      const { sandbox, elementRegistry, simulateExit, mockElectronAntigravity } = setupWorkbenchSandbox(workbenchJsCode);
      await sandbox.initAntigravityBridge();
      const dropdown = elementRegistry.get('agent-select-dropdown')!;
      const promptInput = elementRegistry.get('prompt-input-box')!;

      promptInput.value = 'Refactor memory leak';
      expect(dropdown.disabled).toBe(false);

      const promptPromise = sandbox.runAntigravityPrompt();
      expect(dropdown.disabled).toBe(true);

      const lastCall = mockElectronAntigravity.runCommand.mock.calls[0][0];
      simulateExit(0, lastCall.correlationId);
      await promptPromise;

      expect(dropdown.disabled).toBe(false);
    });
  });

  // ===========================================================================
  // Suite 4: 100% In-Flight Ruleset Envelope Injection (buildScreenBPromptEnvelope)
  // ===========================================================================
  describe('Suite 4: 100% In-Flight Ruleset Envelope Injection (buildScreenBPromptEnvelope)', () => {
    it('4.1 in-memory constant SCREEN_B_OPERATIONAL_RULESET contains Anti-Slop, Socratic, and Zero-Buffer principles', () => {
      const { sandbox } = setupWorkbenchSandbox(workbenchJsCode);
      const ruleset = sandbox.SCREEN_B_OPERATIONAL_RULESET;

      expect(typeof ruleset).toBe('string');
      expect(ruleset).toContain('Screen B Active Ruleset');
      expect(ruleset).toContain('Anti-Slop: Zero conversational fluff, direct dense solutions, surgical code modifications.');
      expect(ruleset).toContain('Socratic Cognitive Guidance: Golden Invariant: zero blind auto-patching');
      expect(ruleset).toContain('Zero-Buffer Streaming Integrity: Display-only streaming output; zero Monaco editor buffer or disk file mutations');
    });

    it('4.2 buildScreenBPromptEnvelope(userPrompt) prepends SCREEN_B_OPERATIONAL_RULESET in memory', () => {
      const { sandbox } = setupWorkbenchSandbox(workbenchJsCode);
      const envelope = sandbox.buildScreenBPromptEnvelope('Fix crash on startup');

      expect(envelope).toContain(sandbox.SCREEN_B_OPERATIONAL_RULESET);
      expect(envelope).toContain('Fix crash on startup');
      expect(envelope.startsWith(sandbox.SCREEN_B_OPERATIONAL_RULESET)).toBe(true);
    });

    it('4.3 buildScreenBPromptEnvelope(userPrompt, editorContext) injects both ruleset and editor context', () => {
      const { sandbox } = setupWorkbenchSandbox(workbenchJsCode);
      const context = '[Context: Active file "src/main.ts" (typescript)]';
      const envelope = sandbox.buildScreenBPromptEnvelope('Inspect lines 20-40', context);

      expect(envelope).toContain(sandbox.SCREEN_B_OPERATIONAL_RULESET);
      expect(envelope).toContain(context);
      expect(envelope).toContain('Inspect lines 20-40');

      // Order check: Ruleset -> Context -> Prompt
      const rulesetIdx = envelope.indexOf(sandbox.SCREEN_B_OPERATIONAL_RULESET);
      const contextIdx = envelope.indexOf(context);
      const promptIdx = envelope.indexOf('Inspect lines 20-40');

      expect(rulesetIdx).toBeLessThan(contextIdx);
      expect(contextIdx).toBeLessThan(promptIdx);
    });

    it('4.4 runAntigravityPrompt transmits enveloped prompt and selected agent to electronAntigravity.runCommand', async () => {
      const { sandbox, elementRegistry, simulateExit, mockElectronAntigravity } = setupWorkbenchSandbox(workbenchJsCode);
      await sandbox.initAntigravityBridge();

      sandbox.setSelectedAgent('meta-auditor');
      const promptInput = elementRegistry.get('prompt-input-box')!;
      promptInput.value = 'Review architecture invariants';

      const promptPromise = sandbox.runAntigravityPrompt();
      expect(mockElectronAntigravity.runCommand).toHaveBeenCalledTimes(1);

      const params = mockElectronAntigravity.runCommand.mock.calls[0][0];
      expect(params.prompt).toContain(sandbox.SCREEN_B_OPERATIONAL_RULESET);
      expect(params.prompt).toContain('Review architecture invariants');
      expect(params.agent).toBe('meta-auditor');

      simulateExit(0, params.correlationId);
      await promptPromise;
    });

    it('4.5 assembling prompt envelope performs zero disk mutations', () => {
      const { sandbox } = setupWorkbenchSandbox(workbenchJsCode);
      const writeSpy = sandbox.window.electronFS.writeFile;

      sandbox.buildScreenBPromptEnvelope('Test zero disk prompt', 'Some editor context');
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Suite 5: UI Decoupling (Chat Bubble Displays Only User Prompt)
  // ===========================================================================
  describe('Suite 5: UI Decoupling (Chat Bubble Displays Only User Prompt)', () => {
    it('5.1 submitting a prompt renders strictly the user raw instruction in chat thread bubble', async () => {
      const { sandbox, elementRegistry, simulateExit, mockElectronAntigravity } = setupWorkbenchSandbox(workbenchJsCode);
      await sandbox.initAntigravityBridge();

      const promptInput = elementRegistry.get('prompt-input-box')!;
      const chatContainer = elementRegistry.get('chat-thread-container')!;
      const userInstruction = 'Optimalkan binary search di quicksort.py';

      promptInput.value = userInstruction;
      const promptPromise = sandbox.runAntigravityPrompt();

      // Inspect chat bubble rendered in DOM
      expect(chatContainer.children.length).toBeGreaterThanOrEqual(1);
      const userBubble = chatContainer.children[chatContainer.children.length - 1];
      const bubbleText = userBubble.innerHTML || userBubble.textContent;

      expect(bubbleText).toContain(userInstruction);
      expect(bubbleText).not.toContain(sandbox.SCREEN_B_OPERATIONAL_RULESET);
      expect(bubbleText).not.toContain('Screen B Active Ruleset');

      const params = mockElectronAntigravity.runCommand.mock.calls[0][0];
      simulateExit(0, params.correlationId);
      await promptPromise;
    });

    it('5.2 chat bubble does not contain editor context preamble metadata', async () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJsCode);
      const chatContainer = elementRegistry.get('chat-thread-container')!;

      sandbox.appendUserMessage('Hanya teks pengguna');
      const renderedBubble = chatContainer.children[0];

      expect(renderedBubble.innerHTML).toContain('Hanya teks pengguna');
      expect(renderedBubble.innerHTML).not.toContain('[Context:');
      expect(renderedBubble.innerHTML).not.toContain('Active file');
    });
  });

  // ===========================================================================
  // Suite 6: Global File Isolation & MD5 Hash Invariant
  // ===========================================================================
  describe('Suite 6: Global File Isolation & MD5 Hash Invariant', () => {
    it('6.1 asserts C:\\Users\\DELL\\.gemini\\GEMINI.md exists on host filesystem', () => {
      expect(fs.existsSync(geminiConfigPath)).toBe(true);
    });

    it(`6.2 asserts MD5 hash of C:\\Users\\DELL\\.gemini\\GEMINI.md is strictly ${EXPECTED_GEMINI_MD5}`, () => {
      const content = fs.readFileSync(geminiConfigPath);
      const calculatedHash = crypto.createHash('md5').update(content).digest('hex').toUpperCase();

      expect(calculatedHash).toBe(EXPECTED_GEMINI_MD5);
    });

    it('6.3 executes prompt envelope workflow and re-verifies GEMINI.md hash is 100% unchanged', async () => {
      const preHash = crypto.createHash('md5').update(fs.readFileSync(geminiConfigPath)).digest('hex').toUpperCase();

      const { sandbox, elementRegistry, simulateExit, mockElectronAntigravity } = setupWorkbenchSandbox(workbenchJsCode);
      await sandbox.initAntigravityBridge();

      sandbox.setSelectedAgent('security-boundary-verifier');
      const promptInput = elementRegistry.get('prompt-input-box')!;
      promptInput.value = 'Boundary test against config files';

      const promptPromise = sandbox.runAntigravityPrompt();
      const params = mockElectronAntigravity.runCommand.mock.calls[0][0];
      simulateExit(0, params.correlationId);
      await promptPromise;

      const postHash = crypto.createHash('md5').update(fs.readFileSync(geminiConfigPath)).digest('hex').toUpperCase();

      expect(preHash).toBe(EXPECTED_GEMINI_MD5);
      expect(postHash).toBe(EXPECTED_GEMINI_MD5);
      expect(postHash).toBe(preHash);
    });

    it('6.4 verifies workbench and main process do NOT write to .gemini directory', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const mainContent = fs.readFileSync(mainPath, 'utf-8');

      expect(mainContent).not.toContain('GEMINI.md');
      expect(workbenchJsCode).not.toContain('GEMINI.md');
    });
  });

  // ===========================================================================
  // Suite 7: Terminal Session Isolation
  // ===========================================================================
  describe('Suite 7: Terminal Session Isolation', () => {
    it('7.1 verifies terminal:create spawns default shell without Screen B ruleset or agent flags', async () => {
      expect(ipcHandlers.has('terminal:create')).toBe(true);
      let capturedSpawnArgs: any = null;

      mockSpawn.mockImplementation((command: string, args: string[], options: any) => {
        capturedSpawnArgs = { command, args, options };
        return {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: { write: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
        };
      });

      const handler = ipcHandlers.get('terminal:create')!;
      const result = await handler(null, { cwd: 'C:\\workspace' });

      expect(result).toHaveProperty('id');
      expect(capturedSpawnArgs).not.toBeNull();

      // Verify no --agent or ruleset was injected into terminal command or args
      const commandStr = String(capturedSpawnArgs.command);
      const argsStr = JSON.stringify(capturedSpawnArgs.args || []);
      expect(commandStr).not.toContain('--agent');
      expect(argsStr).not.toContain('--agent');
      expect(argsStr).not.toContain('Screen B Active Ruleset');
    });

    it('7.2 terminal process environment does NOT contain Screen B ruleset pollution', async () => {
      let capturedEnv: any = null;

      mockSpawn.mockImplementation((command: string, args: string[], options: any) => {
        capturedEnv = options?.env;
        return {
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          stdin: { write: vi.fn() },
          on: vi.fn(),
          kill: vi.fn(),
        };
      });

      const handler = ipcHandlers.get('terminal:create')!;
      await handler(null, {});

      expect(capturedEnv).toBeDefined();
      expect(capturedEnv.SCREEN_B_RULESET).toBeUndefined();
      expect(capturedEnv.AGY_AGENT).toBeUndefined();
    });
  });
});
