import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

// =============================================================================
// ELECTRON IPC & BROWSER MOCK HARNESS
// =============================================================================

const { ipcHandlers, mockWebContents, mockMainWindow, mockShell } = vi.hoisted(() => {
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
  return { ipcHandlers: handlers, mockWebContents: webContents, mockMainWindow: mainWindow, mockShell: shell };
});

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.2.1',
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
    clipboard: {
      writeText: vi.fn(),
      readText: vi.fn(() => ''),
    },
  };
});

// =============================================================================
// ROBUST DOM SIMULATOR FOR NODE VM SANDBOX
// =============================================================================

interface MockElement {
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
  setSelectionRange: (start?: number, end?: number) => void;
  dispatchEvent: (event: any) => boolean;
  click: () => void;
  getBoundingClientRect: () => { width: number; height: number; top: number; left: number };
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

function createMockDomElement(tag = 'div', id = ''): MockElement {
  const listeners: Record<string, Function[]> = {};
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();

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
          if (force) classes.add(cls);
          else classes.delete(cls);
          return force;
        }
        if (classes.has(cls)) {
          classes.delete(cls);
          return false;
        }
        classes.add(cls);
        return true;
      },
    },
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    title: '',
    children: [],
    parentNode: null,
    attributes: attrs,
    getAttribute: (attr: string) => attrs[attr] ?? null,
    setAttribute: (attr: string, val: string) => {
      attrs[attr] = String(val);
      if (attr === 'id') el.id = val;
      if (attr === 'class') el.className = val;
    },
    removeAttribute: (attr: string) => {
      delete attrs[attr];
    },
    hasAttribute: (attr: string) => attr in attrs,
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
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    prepend: (child: MockElement) => {
      child.parentNode = el;
      el.children.unshift(child);
    },
    removeChild: (child: MockElement) => {
      const idx = el.children.indexOf(child);
      if (idx !== -1) {
        child.parentNode = null;
        el.children.splice(idx, 1);
      }
      return child;
    },
    querySelector: (sel: string) => {
      for (const child of el.children) {
        if (matchesSelector(child, sel)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      const search = (parent: MockElement) => {
        for (const child of parent.children) {
          if (matchesSelector(child, sel)) results.push(child);
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
    setSelectionRange: vi.fn(),
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
    getBoundingClientRect: () => ({ width: 400, height: 300, top: 0, left: 0 }),
  };

  return el;
}

// =============================================================================
// WORKBENCH SANDBOX BUILDER
// =============================================================================

function setupWorkbenchSandbox(jsContent: string) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tag = 'div') => {
    if (!elementRegistry.has(id)) {
      elementRegistry.set(id, createMockDomElement(tag, id));
    }
    return elementRegistry.get(id)!;
  };

  // Seed Dialog Elements
  const dirtyDialogBackdrop = getOrCreateEl('dirty-dialog-backdrop');
  dirtyDialogBackdrop.style.display = 'none';
  const dirtyDialogModal = getOrCreateEl('dirty-dialog-modal');
  const dirtyDialogTitle = getOrCreateEl('dirty-dialog-title', 'span');
  dirtyDialogTitle.textContent = 'Do you want to save the changes?';
  const dirtyDialogBody = getOrCreateEl('dirty-dialog-body');
  const btnDirtySave = getOrCreateEl('btn-dirty-save', 'button');
  btnDirtySave.textContent = 'Save';
  const btnDirtyDontSave = getOrCreateEl('btn-dirty-dontsave', 'button');
  btnDirtyDontSave.textContent = "Don't Save";
  const btnDirtyCancel = getOrCreateEl('btn-dirty-cancel', 'button');
  btnDirtyCancel.textContent = 'Cancel';

  dirtyDialogBackdrop.appendChild(dirtyDialogModal);
  dirtyDialogModal.appendChild(dirtyDialogTitle);
  dirtyDialogModal.appendChild(dirtyDialogBody);
  dirtyDialogModal.appendChild(btnDirtySave);
  dirtyDialogModal.appendChild(btnDirtyDontSave);
  dirtyDialogModal.appendChild(btnDirtyCancel);

  // Status bar
  const statusCursor = getOrCreateEl('status-cursor');
  const statusCursorPos = getOrCreateEl('status-cursor-pos', 'span');
  statusCursorPos.textContent = 'Ln 1, Col 1';
  statusCursor.appendChild(statusCursorPos);
  getOrCreateEl('status-language-text', 'span');
  getOrCreateEl('window-title', 'span');
  getOrCreateEl('crumb-file-name', 'span');
  getOrCreateEl('crumb-symbol-name', 'span');

  // Screen B elements
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

  screenBModeTabs.appendChild(tabChat);
  screenBModeTabs.appendChild(tabPlan);
  screenBModeTabs.appendChild(tabReview);
  screenBHeader.appendChild(screenBModeTabs);

  const middleContainer = getOrCreateEl('secondary-middle-container');
  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';

  const webviewFrame = getOrCreateEl('webview-frame', 'iframe');
  const mockPostMessage = vi.fn();
  (webviewFrame as any).contentWindow = { postMessage: mockPostMessage };
  viewChat.appendChild(webviewFrame);

  middleContainer.appendChild(viewChat);
  middleContainer.appendChild(viewPlan);
  middleContainer.appendChild(viewReview);

  // Multi-Group Editor Elements
  getOrCreateEl('editor-area');
  getOrCreateEl('editor-split-sash');
  getOrCreateEl('editor-group');
  getOrCreateEl('tab-scroll-container');
  getOrCreateEl('breadcrumbs-bar');
  getOrCreateEl('editor-mount');

  getOrCreateEl('editor-group-2');
  getOrCreateEl('tab-scroll-container-2');
  getOrCreateEl('breadcrumbs-bar-2');
  getOrCreateEl('editor-mount-2');

  getOrCreateEl('btn-editor-split', 'button');
  getOrCreateEl('btn-editor-split-down', 'button');
  getOrCreateEl('btn-editor-split-2', 'button');
  getOrCreateEl('btn-editor-split-down-2', 'button');
  getOrCreateEl('btn-editor-close-group-2', 'button');

  getOrCreateEl('tab-scroll-container');
  getOrCreateEl('open-editors-list');
  getOrCreateEl('workspace-file-tree');

  let modelVersionId = 1;
  let modelContent = 'line 1\nline 2\nline 3\nline 4\nline 5';
  let changeListeners: Function[] = [];
  let cursorPositionListeners: Function[] = [];
  let cursorSelectionListeners: Function[] = [];

  const mockModel: any = {
    getValue: vi.fn(() => modelContent),
    setValue: vi.fn((val: string) => {
      modelContent = val;
      modelVersionId++;
      changeListeners.forEach(fn => fn());
    }),
    getLineCount: vi.fn(() => 50),
    getLineMaxColumn: vi.fn(() => 80),
    getAlternativeVersionId: vi.fn(() => modelVersionId),
    getValueInRange: vi.fn((range: any) => 'sample text'),
    onDidChangeContent: vi.fn((cb: Function) => {
      changeListeners.push(cb);
      return { dispose: () => { changeListeners = changeListeners.filter(f => f !== cb); } };
    }),
    _triggerContentChange: (newVersion?: number) => {
      modelVersionId = newVersion !== undefined ? newVersion : modelVersionId + 1;
      changeListeners.forEach(fn => fn());
    },
    dispose: vi.fn(),
  };

  const createMockEditor = () => {
    let currentSelection = {
      startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1,
      isEmpty: () => true,
    };
    const cPosListeners: Function[] = [];
    const cSelListeners: Function[] = [];

    return {
      revealLineInCenter: vi.fn(),
      setPosition: vi.fn(),
      setSelection: vi.fn(),
      getSelection: vi.fn(() => currentSelection),
      getModel: vi.fn(() => mockModel),
      setModel: vi.fn(),
      focus: vi.fn(),
      saveViewState: vi.fn(() => ({ cursor: { lineNumber: 1, column: 1 } })),
      restoreViewState: vi.fn(),
      onDidChangeCursorPosition: vi.fn((cb: Function) => {
        cPosListeners.push(cb);
        return { dispose: () => {} };
      }),
      onDidChangeCursorSelection: vi.fn((cb: Function) => {
        cSelListeners.push(cb);
        return { dispose: () => {} };
      }),
      onDidFocusEditorWidget: vi.fn(),
      _triggerCursorPosition: (pos: { lineNumber: number; column: number }) => {
        cPosListeners.forEach(fn => fn({ position: pos }));
      },
      _triggerCursorSelection: (sel: any) => {
        currentSelection = sel;
        cSelListeners.forEach(fn => fn({ selection: sel }));
      },
    };
  };

  const mockEditor = createMockEditor();

  const mockElectronFS: any = {
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ success: true, content: 'test content' })),
    writeFile: vi.fn(async () => ({ success: true })),
    getWorkspaceRoot: vi.fn(async () => ({ path: '/workspace' })),
    openDirectory: vi.fn(async () => ({ canceled: true })),
  };

  const documentListeners: Record<string, Function[]> = {};
  const windowListeners: Record<string, Function[]> = {};

  const sandbox: any = {
    window: {
      addEventListener: vi.fn((evt: string, fn: Function) => {
        windowListeners[evt] = windowListeners[evt] || [];
        windowListeners[evt].push(fn);
      }),
      removeEventListener: vi.fn((evt: string, fn: Function) => {
        if (windowListeners[evt]) {
          windowListeners[evt] = windowListeners[evt].filter(f => f !== fn);
        }
      }),
      dispatchEvent: vi.fn((event: any) => {
        const list = windowListeners[event.type] || [];
        list.forEach(fn => fn(event));
        return true;
      }),
      electronFS: mockElectronFS,
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
      dispatchEvent: vi.fn(),
    },
    monaco: {
      editor: {
        create: vi.fn(() => createMockEditor()),
        getModel: vi.fn(() => mockModel),
        createModel: vi.fn(() => mockModel),
      },
      KeyMod: { CtrlCmd: 2048 },
      KeyCode: { KeyS: 49 },
    },
    editor: mockEditor,
    currentWorkspaceRoot: '/workspace',
    console,
    setTimeout: (fn: Function) => { fn(); return 1; },
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    CustomEvent: class CustomEvent {
      constructor(public type: string, public init?: any) {
        this.detail = init?.detail;
      }
      detail?: any;
    },
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const harnessHook = `
    docManager = typeof docManager !== 'undefined' && docManager !== null ? docManager : (typeof DocumentManager !== 'undefined' ? new DocumentManager() : globalThis.docManager);
    multiGroupManager = typeof multiGroupManager !== 'undefined' && multiGroupManager !== null ? multiGroupManager : (typeof MultiGroupEditorManager !== 'undefined' ? new MultiGroupEditorManager() : globalThis.multiGroupManager);
    editor = globalThis.editor;
    globalThis.docManager = docManager;
    globalThis.multiGroupManager = multiGroupManager;
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : (typeof window !== 'undefined' ? window.editorEventBridge : undefined);
    globalThis.EditorEventBridge = typeof EditorEventBridge !== 'undefined' ? EditorEventBridge : undefined;
    globalThis.showDirtySaveDialog = typeof showDirtySaveDialog !== 'undefined' ? showDirtySaveDialog : undefined;
    globalThis.updateCursorTelemetry = typeof updateCursorTelemetry !== 'undefined' ? updateCursorTelemetry : undefined;
    globalThis.DocumentManager = typeof DocumentManager !== 'undefined' ? DocumentManager : undefined;
    globalThis.MultiGroupEditorManager = typeof MultiGroupEditorManager !== 'undefined' ? MultiGroupEditorManager : undefined;
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Adversarial Init Warning] workbench.js partial initialization:', err);
  }

  return {
    sandbox,
    elementRegistry,
    spies: {
      postMessage: mockPostMessage,
      writeFile: mockElectronFS.writeFile,
    },
    mockModel,
    mockEditor,
  };
}

// =============================================================================
// ADVERSARIAL CHALLENGE SPECIFICATION
// =============================================================================

describe('Adversarial Challenger 2: Screen B Switcher, EventBridge & Multi-Group Dirty Tabs', () => {
  let jsContent: string;

  beforeEach(() => {
    const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(workbenchJsPath, 'utf8');
  });

  // ---------------------------------------------------------------------------
  // 1. RAPID MODE TAB SWITCHING & CONTAINER STATE INTEGRITY
  // ---------------------------------------------------------------------------
  describe('1. Screen B Mode Switcher Rapid Stress & Boundary Testing', () => {
    it('1.1 stresses rapid cyclical mode switching (Chat -> Plan -> Review -> Chat) across 600 transitions without state drift', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setScreenBMode = ctx.sandbox.setScreenBMode;
      const bridge = ctx.sandbox.editorEventBridge;

      expect(typeof setScreenBMode).toBe('function');

      const modeListener = vi.fn();
      bridge.on('screenB:modeChanged', modeListener);

      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      const tabChat = ctx.elementRegistry.get('tab-screen-b-chat')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;

      const sequence: Array<'chat' | 'plan' | 'review'> = ['chat', 'plan', 'review'];

      // Perform 200 full cycles (600 switches)
      for (let cycle = 0; cycle < 200; cycle++) {
        for (const mode of sequence) {
          setScreenBMode(mode);

          // Verify strict single active container invariant
          if (mode === 'chat') {
            expect(viewChat.style.display).toBe('flex');
            expect(viewPlan.style.display).toBe('none');
            expect(viewReview.style.display).toBe('none');

            expect(tabChat.classList.contains('active')).toBe(true);
            expect(tabChat.getAttribute('aria-selected')).toBe('true');
            expect(tabPlan.classList.contains('active')).toBe(false);
            expect(tabPlan.getAttribute('aria-selected')).toBe('false');
            expect(tabReview.classList.contains('active')).toBe(false);
            expect(tabReview.getAttribute('aria-selected')).toBe('false');
          } else if (mode === 'plan') {
            expect(viewChat.style.display).toBe('none');
            expect(viewPlan.style.display).toBe('flex');
            expect(viewReview.style.display).toBe('none');

            expect(tabPlan.classList.contains('active')).toBe(true);
            expect(tabPlan.getAttribute('aria-selected')).toBe('true');
            expect(tabChat.classList.contains('active')).toBe(false);
            expect(tabChat.getAttribute('aria-selected')).toBe('false');
            expect(tabReview.classList.contains('active')).toBe(false);
            expect(tabReview.getAttribute('aria-selected')).toBe('false');
          } else if (mode === 'review') {
            expect(viewChat.style.display).toBe('none');
            expect(viewPlan.style.display).toBe('none');
            expect(viewReview.style.display).toBe('flex');

            expect(tabReview.classList.contains('active')).toBe(true);
            expect(tabReview.getAttribute('aria-selected')).toBe('true');
            expect(tabChat.classList.contains('active')).toBe(false);
            expect(tabChat.getAttribute('aria-selected')).toBe('false');
            expect(tabPlan.classList.contains('active')).toBe(false);
            expect(tabPlan.getAttribute('aria-selected')).toBe('false');
          }
        }
      }

      // Exactly 600 mode events received
      expect(modeListener).toHaveBeenCalledTimes(600);
      expect(modeListener).toHaveBeenLastCalledWith({ mode: 'review' });
    });

    it('1.2 verifies idempotent switches to the same active mode do not corrupt DOM attributes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setScreenBMode = ctx.sandbox.setScreenBMode;

      // Repeated switches to 'plan'
      for (let i = 0; i < 20; i++) {
        setScreenBMode('plan');
      }

      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;

      expect(viewPlan.style.display).toBe('flex');
      expect(tabPlan.classList.contains('active')).toBe(true);
      expect(tabPlan.getAttribute('aria-selected')).toBe('true');
    });

    it('1.3 tests hostile / invalid mode inputs gracefully hide all containers without uncaught exceptions', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setScreenBMode = ctx.sandbox.setScreenBMode;

      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      // Invalid mode strings
      expect(() => setScreenBMode('unsupported_mode')).not.toThrow();
      expect(viewChat.style.display).toBe('none');
      expect(viewPlan.style.display).toBe('none');
      expect(viewReview.style.display).toBe('none');

      // Null or undefined
      expect(() => setScreenBMode(null as any)).not.toThrow();
      expect(() => setScreenBMode(undefined as any)).not.toThrow();
    });

    it('1.4 tests mode switcher tolerance when target container elements are missing from the DOM', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setScreenBMode = ctx.sandbox.setScreenBMode;

      // Simulate corrupted or missing plan container
      ctx.elementRegistry.delete('screen-b-view-plan');

      expect(() => setScreenBMode('plan')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. EDITOREVENTBRIDGE DECOUPLING & HOSTILE LISTENER ISOLATION
  // ---------------------------------------------------------------------------
  describe('2. EditorEventBridge Decoupling & Error Containment', () => {
    it('2.1 isolates crashing listeners: throwing listener must NOT crash sibling listeners or emit() caller', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      const healthySpy1 = vi.fn();
      const healthySpy2 = vi.fn();
      const healthySpy3 = vi.fn();

      // Register healthy listener 1
      bridge.on('editor:cursorChange', healthySpy1);

      // Register malicious / buggy listener that throws Error
      bridge.on('editor:cursorChange', () => {
        throw new Error('Exploding hostile listener!');
      });

      // Register healthy listener 2
      bridge.on('editor:cursorChange', healthySpy2);

      // Register listener that throws TypeError
      bridge.on('editor:cursorChange', () => {
        throw new TypeError('Cannot read property of undefined');
      });

      // Register listener that throws non-Error primitive
      bridge.on('editor:cursorChange', () => {
        throw 'Raw string crash';
      });

      // Register healthy listener 3
      bridge.on('editor:cursorChange', healthySpy3);

      const payload = { filePath: 'test.ts', lineNumber: 42, column: 10, selectionCount: 0 };

      // Calling emit must NOT throw
      expect(() => {
        bridge.emit('editor:cursorChange', payload);
      }).not.toThrow();

      // All healthy listeners MUST have executed with the payload
      expect(healthySpy1).toHaveBeenCalledWith(payload);
      expect(healthySpy2).toHaveBeenCalledWith(payload);
      expect(healthySpy3).toHaveBeenCalledWith(payload);
    });

    it('2.2 throwing listener does not prevent updateCursorTelemetry from updating the Status Bar', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;
      const updateCursorTelemetry = ctx.sandbox.updateCursorTelemetry;
      const statusCursorPos = ctx.elementRegistry.get('status-cursor-pos')!;

      // Attach throwing listener to editor:cursorChange
      bridge.on('editor:cursorChange', () => {
        throw new Error('Cursor listener failure');
      });

      // Trigger telemetry update with editor at Line 15, Col 8
      const mockEd = {
        getPosition: () => ({ lineNumber: 15, column: 8 }),
        getSelection: () => ({ isEmpty: () => true }),
      };

      expect(() => {
        updateCursorTelemetry(mockEd);
      }).not.toThrow();

      // Status Bar coordinate badge must reflect updated coordinates
      expect(statusCursorPos.textContent).toBe('Ln 15, Col 8');
    });

    it('2.3 throwing listener on editor:dirtyChange does not crash or abort document dirty transition', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      let caughtError = false;
      bridge.on('editor:dirtyChange', () => {
        caughtError = true;
        throw new Error('Hostile dirty listener error');
      });

      expect(() => {
        bridge.emit('editor:dirtyChange', {
          filePath: 'quicksort.py',
          fileName: 'quicksort.py',
          isDirty: true,
          docId: 'quicksort.py',
        });
      }).not.toThrow();

      expect(caughtError).toBe(true);
    });

    it('2.4 absorbs hostile window.dispatchEvent or iframe postMessage failures', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      // Mock window.dispatchEvent throwing
      ctx.sandbox.window.dispatchEvent = vi.fn(() => {
        throw new Error('Window event dispatch crashed');
      });

      // Mock webview postMessage throwing (e.g. cross-origin security error or detached frame)
      const webview = ctx.elementRegistry.get('webview-frame')!;
      (webview as any).contentWindow = {
        postMessage: vi.fn(() => {
          throw new DOMException('Frame is detached', 'SecurityError');
        }),
      };

      const internalSpy = vi.fn();
      bridge.on('editor:fileSwitched', internalSpy);

      expect(() => {
        bridge.emit('editor:fileSwitched', {
          filePath: '/test/main.rs',
          fileName: 'main.rs',
          language: 'rust',
          isDirty: false,
          docId: 'main.rs',
        });
      }).not.toThrow();

      // Native subscriber still received event
      expect(internalSpy).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'main.rs' }));
    });

    it('2.5 verifies clean listener unsubscribe and non-existent listener removal resilience', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      const spy = vi.fn();
      const unsubscribe = bridge.on('test:event', spy);

      bridge.emit('test:event', { val: 1 });
      expect(spy).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();
      bridge.emit('test:event', { val: 2 });
      expect(spy).toHaveBeenCalledTimes(1);

      // Removing already-removed handler does not throw
      expect(() => bridge.off('test:event', spy)).not.toThrow();
      expect(() => bridge.off('non_existent_event', () => {})).not.toThrow();
    });

    it('2.6 high-throughput emission stress test: 2,000 events with alternating throwing and healthy listeners', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      let callCount = 0;
      bridge.on('stress:event', () => { callCount++; });
      bridge.on('stress:event', () => { throw new Error('Crash'); });
      bridge.on('stress:event', () => { callCount++; });

      const startTime = Date.now();
      for (let i = 0; i < 2000; i++) {
        bridge.emit('stress:event', { index: i });
      }
      const duration = Date.now() - startTime;

      expect(callCount).toBe(4000); // 2 healthy listeners * 2000 emits
      expect(duration).toBeLessThan(3000); // Fast synchronous execution under parallel runner load
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MULTI-GROUP SPLIT EDITOR TAB CLOSURE & DIRTY GUARD BEHAVIOR
  // ---------------------------------------------------------------------------
  describe('3. Multi-Group Split Editor Tab Closure & Dirty Guard Behavior', () => {
    it('3.1 cancels dirty tab closure in secondary group: document remains open and dirty across all groups', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const docManager = ctx.sandbox.docManager;
      const multiMgr = ctx.sandbox.multiGroupManager;

      expect(multiMgr).toBeDefined();
      expect(docManager).toBeDefined();

      // Seed documents in docManager
      const docA = {
        id: 'main.ts',
        filePath: '/workspace/main.ts',
        fileName: 'main.ts',
        language: 'typescript',
        isDirty: true,
        model: ctx.mockModel,
      };
      const docB = {
        id: 'quicksort.py',
        filePath: '/workspace/quicksort.py',
        fileName: 'quicksort.py',
        language: 'python',
        isDirty: false,
        model: ctx.mockModel,
      };

      docManager.documents = new Map([
        ['main.ts', docA],
        ['quicksort.py', docB],
      ]);

      // Split into two groups
      multiMgr.splitRight();

      // Open both documents in group-1 and group-2
      multiMgr.openDocumentInGroup('group-1', 'main.ts');
      multiMgr.openDocumentInGroup('group-1', 'quicksort.py');
      multiMgr.openDocumentInGroup('group-2', 'main.ts');

      expect(multiMgr.groups.get('group-1')!.openDocIds).toContain('main.ts');
      expect(multiMgr.groups.get('group-2')!.openDocIds).toContain('main.ts');

      // Mock user clicking CANCEL on the dirty dialog
      const btnCancel = ctx.elementRegistry.get('btn-dirty-cancel')!;
      const showDirtyPromise = multiMgr.closeTabInGroup('group-2', 'main.ts');

      // Simulate user clicking cancel
      btnCancel.click();

      const closed = await showDirtyPromise;

      // The closeTab must have been prevented
      expect(closed).toBe(false);

      // main.ts must still be present in BOTH groups
      expect(multiMgr.groups.get('group-1')!.openDocIds).toContain('main.ts');
      expect(multiMgr.groups.get('group-2')!.openDocIds).toContain('main.ts');

      // main.ts must still be retained in docManager and remain dirty
      expect(docManager.documents.has('main.ts')).toBe(true);
      expect(docManager.documents.get('main.ts')!.isDirty).toBe(true);
    });

    it('3.2 closes dirty tab with "Don\'t Save": discards changes without disk write and removes from all groups', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const docManager = ctx.sandbox.docManager;
      const multiMgr = ctx.sandbox.multiGroupManager;

      const docA = {
        id: 'main.ts',
        filePath: '/workspace/main.ts',
        fileName: 'main.ts',
        language: 'typescript',
        isDirty: true,
        model: ctx.mockModel,
      };
      const docB = {
        id: 'quicksort.py',
        filePath: '/workspace/quicksort.py',
        fileName: 'quicksort.py',
        language: 'python',
        isDirty: false,
        model: ctx.mockModel,
      };

      docManager.documents = new Map([
        ['main.ts', docA],
        ['quicksort.py', docB],
      ]);

      multiMgr.splitRight();
      multiMgr.openDocumentInGroup('group-1', 'main.ts');
      multiMgr.openDocumentInGroup('group-1', 'quicksort.py');
      multiMgr.openDocumentInGroup('group-2', 'main.ts');
      multiMgr.openDocumentInGroup('group-2', 'quicksort.py');

      // Attempt to close dirty main.ts from group-1, user clicks "Don't Save"
      const btnDontSave = ctx.elementRegistry.get('btn-dirty-dontsave')!;
      const closePromise = multiMgr.closeTabInGroup('group-1', 'main.ts');

      btnDontSave.click();

      const closed = await closePromise;

      expect(closed).toBe(true);
      // Disk write was NOT performed
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // main.ts must be cleanly removed from both group-1 and group-2
      expect(multiMgr.groups.get('group-1')!.openDocIds).not.toContain('main.ts');
      expect(multiMgr.groups.get('group-2')!.openDocIds).not.toContain('main.ts');
      expect(docManager.documents.has('main.ts')).toBe(false);

      // Remaining doc quicksort.py must now be active
      expect(multiMgr.groups.get('group-1')!.activeDocId).toBe('quicksort.py');
    });

    it('3.3 closes dirty tab with "Save": triggers file write, clears dirty flag and removes from all groups', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const docManager = ctx.sandbox.docManager;
      const multiMgr = ctx.sandbox.multiGroupManager;

      const docA = {
        id: 'dirty.py',
        filePath: '/workspace/dirty.py',
        fileName: 'dirty.py',
        language: 'python',
        isDirty: true,
        model: ctx.mockModel,
      };

      docManager.documents = new Map([['dirty.py', docA]]);
      docManager.activeDocId = 'dirty.py';

      multiMgr.openDocumentInGroup('group-1', 'dirty.py');

      const btnSave = ctx.elementRegistry.get('btn-dirty-save')!;
      const closePromise = multiMgr.closeTabInGroup('group-1', 'dirty.py');

      btnSave.click();

      const closed = await closePromise;

      expect(closed).toBe(true);
      // writeFile was executed
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('/workspace/dirty.py', expect.any(String));

      // Document is now closed
      expect(multiMgr.groups.get('group-1')!.openDocIds).not.toContain('dirty.py');
      expect(docManager.documents.has('dirty.py')).toBe(false);
    });

    it('3.4 closeAllTabs stops immediately when a dirty tab confirmation is cancelled, keeping remaining tabs intact', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const docManager = ctx.sandbox.docManager || (ctx.sandbox.DocumentManager && new ctx.sandbox.DocumentManager());

      const doc1 = { id: 'file1.ts', filePath: '/w/file1.ts', fileName: 'file1.ts', isDirty: true, model: ctx.mockModel };
      const doc2 = { id: 'file2.ts', filePath: '/w/file2.ts', fileName: 'file2.ts', isDirty: true, model: ctx.mockModel };
      const doc3 = { id: 'file3.ts', filePath: '/w/file3.ts', fileName: 'file3.ts', isDirty: true, model: ctx.mockModel };

      docManager.documents = new Map([
        ['file1.ts', doc1],
        ['file2.ts', doc2],
        ['file3.ts', doc3],
      ]);

      const btnDontSave = ctx.elementRegistry.get('btn-dirty-dontsave')!;
      const btnCancel = ctx.elementRegistry.get('btn-dirty-cancel')!;

      // We start closeAllTabs()
      // First prompt: file1 -> click Don't Save
      // Second prompt: file2 -> click Cancel
      const closeAllPromise = docManager.closeAllTabs();

      // Trigger first prompt resolution
      btnDontSave.click();

      // Allow tick for next prompt to appear
      await new Promise(r => setTimeout(r, 10));

      // Trigger second prompt cancel
      btnCancel.click();

      await closeAllPromise;

      // File 1 was closed
      expect(docManager.documents.has('file1.ts')).toBe(false);

      // File 2 and File 3 must STILL be open because cancel aborted the loop
      expect(docManager.documents.has('file2.ts')).toBe(true);
      expect(docManager.documents.has('file3.ts')).toBe(true);
    });
  });
});
