import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

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
      getVersion: () => '0.2.2',
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
  scrollTop: number;
  scrollHeight: number;
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
  let pos = 0;

  while (pos < html.length) {
    const openTagStart = html.indexOf('<', pos);
    if (openTagStart === -1) break;

    // Skip closing tags or comments at outer level
    if (html[openTagStart + 1] === '/' || html[openTagStart + 1] === '!') {
      pos = openTagStart + 1;
      continue;
    }

    const openTagEnd = html.indexOf('>', openTagStart);
    if (openTagEnd === -1) break;

    const tagContent = html.substring(openTagStart + 1, openTagEnd);
    const spaceIdx = tagContent.search(/\s/);
    const rawTag = (spaceIdx === -1 ? tagContent : tagContent.substring(0, spaceIdx)).replace('/', '').trim();
    const tagName = rawTag.toUpperCase();
    const isSelfClosing = tagContent.endsWith('/') || ['BR', 'HR', 'IMG', 'INPUT'].includes(tagName);

    const attrsStr = spaceIdx === -1 ? '' : tagContent.substring(spaceIdx);

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

    const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      el.dataset[key] = dataMatch[2];
      el.setAttribute(`data-${dataMatch[1]}`, dataMatch[2]);
    }

    if (isSelfClosing) {
      children.push(el);
      pos = openTagEnd + 1;
      continue;
    }

    const closeTag = `</${rawTag}>`;
    const openTagPrefix = `<${rawTag}`;
    let depth = 1;
    let searchPos = openTagEnd + 1;
    let matchingClosePos = -1;

    while (depth > 0 && searchPos < html.length) {
      const nextOpen = html.indexOf(openTagPrefix, searchPos);
      const nextClose = html.indexOf(closeTag, searchPos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        const charAfter = html[nextOpen + openTagPrefix.length];
        if (charAfter === ' ' || charAfter === '>' || charAfter === '/' || charAfter === '\n' || charAfter === '\t') {
          depth++;
        }
        searchPos = nextOpen + openTagPrefix.length;
      } else {
        depth--;
        if (depth === 0) {
          matchingClosePos = nextClose;
        }
        searchPos = nextClose + closeTag.length;
      }
    }

    if (matchingClosePos !== -1) {
      const inner = html.substring(openTagEnd + 1, matchingClosePos);
      if (inner.includes('<')) {
        el.innerHTML = inner;
      } else {
        el.textContent = inner;
      }
      pos = matchingClosePos + closeTag.length;
    } else {
      pos = openTagEnd + 1;
    }

    children.push(el);
  }

  return children;
}

function createMockDomElement(tag = 'div', id = ''): MockElement {
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

function setupAdversarialSandbox(jsContent: string, options: { modelContent?: string; lineCount?: number } = {}) {
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

  const secondarySidebar = getOrCreateEl('secondary-sidebar');
  const screenBHeader = getOrCreateEl('screen-b-header');
  const screenBModeTabs = getOrCreateEl('screen-b-mode-tabs');
  screenBModeTabs.setAttribute('role', 'tablist');

  const tabChat = getOrCreateEl('tab-screen-b-chat', 'button');
  tabChat.className = 'screen-b-mode-tab active';
  tabChat.dataset.mode = 'chat';
  const tabPlan = getOrCreateEl('tab-screen-b-plan', 'button');
  tabPlan.className = 'screen-b-mode-tab';
  tabPlan.dataset.mode = 'plan';
  const tabReview = getOrCreateEl('tab-screen-b-review', 'button');
  tabReview.className = 'screen-b-mode-tab';
  tabReview.dataset.mode = 'review';

  screenBModeTabs.appendChild(tabChat);
  screenBModeTabs.appendChild(tabPlan);
  screenBModeTabs.appendChild(tabReview);
  screenBHeader.appendChild(screenBModeTabs);

  const middleContainer = getOrCreateEl('secondary-middle-container');

  // Chat View
  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const stackContainer = getOrCreateEl('target-line-stack-container');
  const stackCount = getOrCreateEl('target-stack-count', 'span');
  stackCount.textContent = '0';
  const stackList = getOrCreateEl('target-stack-list');
  stackContainer.appendChild(stackCount);
  stackContainer.appendChild(stackList);
  viewChat.appendChild(stackContainer);

  const promptInputBox = getOrCreateEl('prompt-input-box', 'textarea');
  viewChat.appendChild(promptInputBox);

  // Plan View
  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const planEmptyPane = getOrCreateEl('plan-empty-pane');
  const planActivePane = getOrCreateEl('plan-active-pane');
  planActivePane.style.display = 'none';

  const planTitle = getOrCreateEl('plan-title', 'span');
  const planStatusBadge = getOrCreateEl('plan-status-badge', 'span');
  const btnPlanPause = getOrCreateEl('btn-plan-pause', 'button');
  const btnPlanResume = getOrCreateEl('btn-plan-resume', 'button');
  const btnPlanCancel = getOrCreateEl('btn-plan-cancel', 'button');
  const planProgressFill = getOrCreateEl('plan-progress-bar-fill');
  const planProgressText = getOrCreateEl('plan-progress-text', 'span');
  const planSubtaskList = getOrCreateEl('plan-subtask-list');
  const planSubtaskCount = getOrCreateEl('plan-subtask-count', 'span');
  const planAffectedList = getOrCreateEl('plan-affected-list');
  const planAffectedCount = getOrCreateEl('plan-affected-count', 'span');
  const planLogsConsole = getOrCreateEl('plan-logs-console');

  planActivePane.appendChild(planTitle);
  planActivePane.appendChild(planStatusBadge);
  planActivePane.appendChild(btnPlanPause);
  planActivePane.appendChild(btnPlanResume);
  planActivePane.appendChild(btnPlanCancel);
  planActivePane.appendChild(planProgressFill);
  planActivePane.appendChild(planProgressText);
  planActivePane.appendChild(planSubtaskList);
  planActivePane.appendChild(planSubtaskCount);
  planActivePane.appendChild(planAffectedList);
  planActivePane.appendChild(planAffectedCount);
  planActivePane.appendChild(planLogsConsole);

  viewPlan.appendChild(planEmptyPane);
  viewPlan.appendChild(planActivePane);

  // Review View
  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';
  const reviewEmptyPane = getOrCreateEl('review-empty-pane');
  const reviewActivePane = getOrCreateEl('review-active-pane');
  reviewActivePane.style.display = 'none';
  const reviewFileList = getOrCreateEl('review-file-list');
  reviewActivePane.appendChild(reviewFileList);
  viewReview.appendChild(reviewEmptyPane);
  viewReview.appendChild(reviewActivePane);

  middleContainer.appendChild(viewChat);
  middleContainer.appendChild(viewPlan);
  middleContainer.appendChild(viewReview);

  // Buffer and mock instrumentation
  let content = options.modelContent !== undefined ? options.modelContent : 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\n';
  const totalLines = options.lineCount || content.split('\n').length;

  let currentPosition = { lineNumber: 1, column: 1 };
  let currentSelection: any = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1,
    isEmpty: () => currentSelection.startLineNumber === currentSelection.endLineNumber && currentSelection.startColumn === currentSelection.endColumn,
  };

  const registeredActions = new Map<string, any>();
  const editorApplyEditsSpy = vi.fn();
  const editorSetValueSpy = vi.fn((val: string) => { content = val; });
  const writeFileSpy = vi.fn(async () => ({ success: true }));

  const mockModel: any = {
    getValue: vi.fn(() => content),
    setValue: editorSetValueSpy,
    getLineCount: vi.fn(() => totalLines),
    getLineMaxColumn: vi.fn(() => 120),
    getAlternativeVersionId: vi.fn(() => 1),
    getValueInRange: vi.fn((range: any) => {
      const lines = content.split('\n');
      const s = Math.min(range.startLineNumber || 1, range.endLineNumber || 1);
      const e = Math.max(range.startLineNumber || 1, range.endLineNumber || 1);
      const startIdx = Math.max(0, s - 1);
      const endIdx = Math.min(lines.length, e);
      return lines.slice(startIdx, endIdx).join('\n');
    }),
    getLineContent: vi.fn((lineNum: number) => {
      const lines = content.split('\n');
      return lines[lineNum - 1] || '';
    }),
    uri: { fsPath: '/workspace/quicksort.py', path: '/workspace/quicksort.py', scheme: 'file', toString: () => 'file:///workspace/quicksort.py' },
  };

  const mockEditor: any = {
    revealLineInCenter: vi.fn(),
    setPosition: vi.fn((pos: any) => { if (pos) currentPosition = pos; }),
    setSelection: vi.fn((sel: any) => { if (sel) currentSelection = sel; }),
    getPosition: vi.fn(() => currentPosition),
    getSelection: vi.fn(() => currentSelection),
    getModel: vi.fn(() => mockModel),
    focus: vi.fn(),
    applyEdits: editorApplyEditsSpy,
    setValue: editorSetValueSpy,
    addAction: vi.fn((act: any) => { if (act?.id) registeredActions.set(act.id, act); }),
    addCommand: vi.fn(),
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  };

  const openDoc: any = {
    id: 'quicksort.py',
    filePath: 'quicksort.py',
    fileName: 'quicksort.py',
    isDirty: false,
    model: mockModel,
  };

  const mockDocManager: any = {
    activeDocId: 'quicksort.py',
    activeDoc: openDoc,
    documents: new Map([['quicksort.py', openDoc]]),
    renderTabs: vi.fn(),
    syncActiveChrome: vi.fn(),
  };

  const mockElectronFS: any = {
    writeFile: writeFileSpy,
    readFile: vi.fn(async () => ({ success: true, content })),
    listFiles: vi.fn(async () => []),
    getWorkspaceRoot: vi.fn(async () => ({ path: '/workspace' })),
    readDirectory: vi.fn(async () => ({ error: null, nodes: [] })),
  };

  const documentListeners: Record<string, Function[]> = {};
  const windowListeners: Record<string, Function[]> = {};

  const sandbox: any = {
    window: {
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
        parse: vi.fn((u: string) => ({ fsPath: u, path: u, scheme: 'virtual', toString: () => u })),
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
        getModel: vi.fn(() => mockModel),
        createModel: vi.fn((c: string) => ({ getValue: () => c, setValue: vi.fn(), uri: { toString: () => 'model' } })),
        create: vi.fn(() => mockEditor),
      },
    },
    editor: mockEditor,
    docManager: mockDocManager,
    currentWorkspaceRoot: '/workspace',
    console,
    setTimeout: (fn: Function) => { fn(); return 1; },
    clearTimeout: vi.fn(),
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

  const hookScript = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;

    if (typeof registerEditorActions === 'function') registerEditorActions(editor);

    globalThis.sendSelectionToScreenB = typeof sendSelectionToScreenB !== 'undefined' ? sendSelectionToScreenB : undefined;
    globalThis.createTaskPlan = typeof createTaskPlan !== 'undefined' ? createTaskPlan : undefined;
    globalThis.getTaskPlan = typeof getTaskPlan !== 'undefined' ? getTaskPlan : undefined;
    globalThis.pauseTaskPlan = typeof pauseTaskPlan !== 'undefined' ? pauseTaskPlan : undefined;
    globalThis.resumeTaskPlan = typeof resumeTaskPlan !== 'undefined' ? resumeTaskPlan : undefined;
    globalThis.cancelTaskPlan = typeof cancelTaskPlan !== 'undefined' ? cancelTaskPlan : undefined;
    globalThis.advanceSubtask = typeof advanceSubtask !== 'undefined' ? advanceSubtask : (typeof updateSubtaskStatus !== 'undefined' ? updateSubtaskStatus : undefined);
    globalThis.addExecutionLog = typeof addExecutionLog !== 'undefined' ? addExecutionLog : undefined;
    globalThis.renderPlanView = typeof renderPlanView !== 'undefined' ? renderPlanView : undefined;
    globalThis.renderTargetStack = typeof renderTargetStack !== 'undefined' ? renderTargetStack : undefined;
    globalThis.targetStack = typeof targetStack !== 'undefined' ? targetStack : undefined;
    globalThis.escapeHtml = typeof escapeHtml !== 'undefined' ? escapeHtml : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : undefined;
  `;

  vm.runInContext(jsContent, sandbox);
  vm.runInContext(hookScript, sandbox);

  return {
    sandbox,
    elementRegistry,
    mockModel,
    mockEditor,
    openDoc,
    mockDocManager,
    spies: {
      applyEdits: editorApplyEditsSpy,
      setValue: editorSetValueSpy,
      writeFile: writeFileSpy,
    },
    setSelection: (sel: any) => {
      currentSelection = {
        ...sel,
        isEmpty: () => sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn,
      };
    },
    setPosition: (pos: { lineNumber: number; column: number }) => {
      currentPosition = pos;
    },
    setContent: (newContent: string) => {
      content = newContent;
    },
  };
}

describe('Milestone v0.2.2: Adversarial Stress Testing (Challenger 1)', () => {
  let jsContent: string;

  beforeEach(() => {
    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(jsPath, 'utf-8');
    vi.clearAllMocks();
  });

  describe('Suite 1: Context Bridge (R1) Adversarial & Stress Testing', () => {

    it('1.1 normalizes severely inverted selection ranges (endLine < startLine) ensuring startLine <= endLine', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;
      expect(typeof sendSelection).toBe('function');

      // Severely inverted: user dragged upwards from line 9 down to line 2
      ctx.setSelection({
        startLineNumber: 9,
        startColumn: 15,
        endLineNumber: 2,
        endColumn: 1,
      });

      const target = sendSelection(ctx.mockEditor);
      expect(target).toBeDefined();
      expect(target.startLine).toBe(2);
      expect(target.endLine).toBe(9);
      expect(target.startLine).toBeLessThanOrEqual(target.endLine);
      expect(target.label).toBe('quicksort.py:2-9');
      expect(target.isContextCard).toBe(true);
    });

    it('1.2 handles zero-length cursor selection without NaN or range corruption, capturing cursor line content', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // Collapsed cursor at line 4, col 8
      ctx.setSelection({
        startLineNumber: 4,
        startColumn: 8,
        endLineNumber: 4,
        endColumn: 8,
      });
      ctx.setPosition({ lineNumber: 4, column: 8 });

      const target = sendSelection(ctx.mockEditor);
      expect(target).toBeDefined();
      expect(target.startLine).toBe(4);
      expect(target.endLine).toBe(4);
      expect(target.label).toBe('quicksort.py:4');
      // Should have captured line 4 content: "line 4"
      expect(target.codeSnippet).toBe('line 4');
    });

    it('1.3 gracefully handles out-of-bounds cursor positions beyond file length', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // Position way beyond 10-line buffer
      ctx.setSelection({
        startLineNumber: 9999,
        startColumn: 1,
        endLineNumber: 9999,
        endColumn: 1,
      });
      ctx.setPosition({ lineNumber: 9999, column: 1 });

      const target = sendSelection(ctx.mockEditor);
      expect(target).toBeDefined();
      expect(target.startLine).toBe(9999);
      expect(target.endLine).toBe(9999);
      expect(target.codeSnippet).toBe('');
    });

    it('1.4 stress-tests multi-line selection (>100 lines) with DOM snippet truncation and full snippet retention', () => {
      const hugeBuffer = Array.from({ length: 300 }, (_, i) => `def step_${i + 1}(): return ${i + 1}`).join('\n');
      const ctx = setupAdversarialSandbox(jsContent, { modelContent: hugeBuffer, lineCount: 300 });
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // Span 150 lines: lines 50 to 200
      ctx.setSelection({
        startLineNumber: 50,
        startColumn: 1,
        endLineNumber: 200,
        endColumn: 30,
      });

      const startTime = performance.now();
      const target = sendSelection(ctx.mockEditor);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(150); // High-performance requirement
      expect(target.startLine).toBe(50);
      expect(target.endLine).toBe(200);
      expect(target.label).toBe('quicksort.py:50-200');

      // The full snippet should contain all 151 lines
      const snippetLines = target.codeSnippet.split('\n');
      expect(snippetLines.length).toBe(151);

      // Verify DOM rendering truncates preview code snippet to <= 123 chars (120 + '...')
      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      const card = stackList.children[0];
      expect(card).toBeDefined();
      const codePreview = card.querySelector('code');
      expect(codePreview).toBeDefined();
      expect(codePreview!.textContent.length).toBeLessThanOrEqual(124);
      expect(codePreview!.textContent).toContain('...');
    });

    it('1.5 preserves Unicode characters (emojis, CJK, RTL Arabic, zero-width chars) in selection without corruption', () => {
      const unicodeContent = [
        '# Line 1: Basic setup',
        '# Line 2: 🚀 Rocket Launch with emoji: 🦀 💡 🔥 ✨',
        '# Line 3: CJK symbols: 日本語と中文のテスト',
        '# Line 4: RTL Arabic: مرحبا بالعالم البرمجي',
        '# Line 5: Zero-width joiner test: a\u200Db\u200Cc',
        '# Line 6: Done',
      ].join('\n');

      const ctx = setupAdversarialSandbox(jsContent, { modelContent: unicodeContent });
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      ctx.setSelection({
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 35,
      });

      const target = sendSelection(ctx.mockEditor);
      expect(target.codeSnippet).toContain('🚀');
      expect(target.codeSnippet).toContain('日本語と中文のテスト');
      expect(target.codeSnippet).toContain('مرحبا بالعالم البرمجي');
      expect(target.codeSnippet).toContain('\u200D');

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      expect(stackList.children.length).toBeGreaterThan(0);
      const card = stackList.children[0];
      const preview = card.querySelector('.target-code-preview');
      expect(preview).toBeDefined();
      expect(preview!.title).toContain('🚀');
      expect(preview!.title).toContain('日本語と中文のテスト');
    });

    it('1.6 handles rapid repeated bursts of sendSelectionToScreenB, deduplicating identical targets', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      ctx.setSelection({
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 7,
        endColumn: 10,
      });

      // 50 rapid calls with identical coordinates
      for (let i = 0; i < 50; i++) {
        sendSelection(ctx.mockEditor);
      }

      // Target stack must deduplicate identical cards
      const targetStack = ctx.sandbox.targetStack;
      expect(targetStack.length).toBe(1);

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      expect(stackList.children.length).toBe(1);
    });

    it('1.7 accommodates 50 distinct sequential targets without memory leak or state corruption', () => {
      const largeContent = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');
      const ctx = setupAdversarialSandbox(jsContent, { modelContent: largeContent, lineCount: 120 });
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // 50 distinct targets
      for (let i = 1; i <= 50; i++) {
        ctx.setSelection({
          startLineNumber: i,
          startColumn: 1,
          endLineNumber: i + 1,
          endColumn: 5,
        });
        sendSelection(ctx.mockEditor);
      }

      const targetStack = ctx.sandbox.targetStack;
      expect(targetStack.length).toBe(50);

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      expect(stackList.children.length).toBe(50);
      expect(ctx.elementRegistry.get('target-stack-count')!.textContent).toBe('50');
    });

    it('1.8 handles missing active document and null editor instance fallbacks safely without throwing', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // Case 1: activeDocId is null, falls back to editor model uri
      ctx.mockDocManager.activeDocId = null;
      ctx.mockDocManager.documents.clear();

      ctx.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 });
      const target1 = sendSelection(ctx.mockEditor);
      expect(target1).toBeDefined();
      expect(target1.filePath).toBe('quicksort.py');

      // Case 2: completely null editor parameter and null lexical editor in workbench
      vm.runInContext('editor = null;', ctx.sandbox);
      const target2 = sendSelection(null);
      expect(target2).toBeNull(); // Graceful null return without crash
    });

    it('1.9 strictly maintains Zero-Buffer Invariant under adversarial Context Bridge bombardment', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      for (let i = 1; i <= 20; i++) {
        ctx.setSelection({ startLineNumber: i, startColumn: 1, endLineNumber: i + 2, endColumn: 5 });
        sendSelection(ctx.mockEditor);
      }

      // Zero-Buffer Invariant assertions:
      expect(ctx.spies.applyEdits).not.toHaveBeenCalled();
      expect(ctx.spies.setValue).not.toHaveBeenCalled();
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });
  });

  describe('Suite 2: Agentic Task Plan State Machine (R3) Adversarial & Stress Testing', () => {

    it('2.1 executes rapid state cycling: in_progress -> paused -> in_progress -> paused -> cancelled', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const pausePlan = ctx.sandbox.pauseTaskPlan;
      const resumePlan = ctx.sandbox.resumeTaskPlan;
      const cancelPlan = ctx.sandbox.cancelTaskPlan;

      createPlan({
        title: 'Rapid Cycling Plan',
        subtasks: [
          { id: 'st-1', title: 'Task 1' },
          { id: 'st-2', title: 'Task 2' },
        ],
      });

      let plan = ctx.sandbox.getTaskPlan();
      expect(plan.status).toBe('in_progress');

      expect(pausePlan()).toBe(true);
      expect(plan.status).toBe('paused');
      expect(ctx.elementRegistry.get('btn-plan-pause')!.style.display).toBe('none');
      expect(ctx.elementRegistry.get('btn-plan-resume')!.style.display).not.toBe('none');

      expect(resumePlan()).toBe(true);
      expect(plan.status).toBe('in_progress');
      expect(ctx.elementRegistry.get('btn-plan-pause')!.style.display).not.toBe('none');
      expect(ctx.elementRegistry.get('btn-plan-resume')!.style.display).toBe('none');

      expect(pausePlan()).toBe(true);
      expect(plan.status).toBe('paused');

      expect(cancelPlan()).toBe(true);
      expect(plan.status).toBe('cancelled');
      expect(ctx.elementRegistry.get('plan-status-badge')!.textContent).toContain('CANCELLED');
    });

    it('2.2 rejects invalid state machine transitions gracefully returning false', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const pausePlan = ctx.sandbox.pauseTaskPlan;
      const resumePlan = ctx.sandbox.resumeTaskPlan;
      const cancelPlan = ctx.sandbox.cancelTaskPlan;

      expect(pausePlan()).toBe(false);
      expect(resumePlan()).toBe(false);
      expect(cancelPlan()).toBe(false);

      // Create plan
      createPlan({ title: 'Invalid Transitions Plan', subtasks: [{ id: 'st-1', title: 'Task 1' }] });

      expect(resumePlan()).toBe(false);

      // Pause plan
      pausePlan();

      expect(pausePlan()).toBe(false);

      // Cancel plan
      cancelPlan();

      expect(pausePlan()).toBe(false);
      expect(resumePlan()).toBe(false);

      expect(cancelPlan()).toBe(false);
    });

    it('2.3 detects state transition boundaries when advanceSubtask is called on a cancelled plan', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const cancelPlan = ctx.sandbox.cancelTaskPlan;
      const advanceSubtask = ctx.sandbox.advanceSubtask;

      createPlan({
        title: 'Cancelled Advance Plan',
        subtasks: [
          { id: 'st-1', title: 'Task 1', status: 'in_progress' },
          { id: 'st-2', title: 'Task 2', status: 'pending' },
        ],
      });

      cancelPlan();
      const plan = ctx.sandbox.getTaskPlan();
      expect(plan.status).toBe('cancelled');
      // Subtask 1 was marked failed upon cancellation
      expect(plan.subtasks[0].status).toBe('failed');

      // Adversarial observation: advance subtask on cancelled plan updates subtask status
      advanceSubtask('st-2', 'completed');
      expect(plan.subtasks[1].status).toBe('completed');
    });

    it('2.4 handles non-existent subtasks and duplicate subtask IDs robustly', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const advanceSubtask = ctx.sandbox.advanceSubtask;

      createPlan({
        title: 'Subtask ID Anomalies Plan',
        subtasks: [
          { id: 'dup-id', title: 'Duplicate Step A' },
          { id: 'dup-id', title: 'Duplicate Step B' },
        ],
      });

      expect(advanceSubtask('phantom-id-404', 'completed')).toBe(false);

      const ok = advanceSubtask('dup-id', 'completed');
      expect(ok).toBe(true);

      const plan = ctx.sandbox.getTaskPlan();
      expect(plan.subtasks[0].status).toBe('completed');
    });

    it('2.5 handles zero-subtask plan without NaN progress or division-by-zero errors', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;

      // Plan with 0 subtasks
      const plan = createPlan({
        title: 'Empty Zero Subtask Plan',
        subtasks: [],
      });

      expect(plan.subtasks.length).toBe(0);
      expect(plan.progress).toBe(0); // must be 0, not NaN
      expect(Number.isNaN(plan.progress)).toBe(false);

      const progressText = ctx.elementRegistry.get('plan-progress-text')!;
      expect(progressText.textContent).toContain('0 / 0 subtasks completed (0%)');
      expect(progressText.textContent).not.toContain('NaN');
    });

    it('2.6 throws descriptive error on missing plan title and falls back safely for malformed payloads', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;

      expect(() => createPlan(null)).toThrow(/Task plan requires a valid title/);

      expect(() => createPlan({ title: '' })).toThrow(/Task plan requires a valid title/);

      const plan = createPlan({ title: 'Valid Title', subtasks: 'invalid' as any });
      expect(Array.isArray(plan.subtasks)).toBe(true);
      expect(plan.subtasks.length).toBe(0);
    });

    it('2.7 stress-tests high-volume execution logs (200 rapid entries) maintaining order and auto-scroll', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const addLog = ctx.sandbox.addExecutionLog;

      createPlan({ title: 'Log Stress Plan', subtasks: [] });

      const startTime = performance.now();
      for (let i = 1; i <= 200; i++) {
        addLog(`Execution trace checkpoint #${i}: verifying invariant status.`, i % 50 === 0 ? 'warn' : 'info');
      }
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(200);

      const plan = ctx.sandbox.getTaskPlan();
      expect(plan.logs.length).toBe(201); // 1 initial created during plan init + 200 appended

      const consoleEl = ctx.elementRegistry.get('plan-logs-console')!;
      expect(consoleEl.children.length).toBe(200); // 200 appended to DOM console via addLog
      expect(consoleEl.children[199].textContent).toContain('checkpoint #200');
    });

    it('2.8 sanitizes HTML/XSS injection attempts in execution logs and subtask fields', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const addLog = ctx.sandbox.addExecutionLog;
      const escapeHtml = ctx.sandbox.escapeHtml;

      expect(typeof escapeHtml).toBe('function');
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('foo & bar "test" \'val\'')).toBe('foo &amp; bar &quot;test&quot; &#039;val&#039;');

      createPlan({
        title: 'Sanitization Plan',
        subtasks: [
          {
            id: 'xss-1',
            title: '<img src=x onerror=alert(1)>',
            description: '<iframe src="javascript:alert(1)"></iframe>',
            targetFiles: ['quicksort.py'],
          },
        ],
      });

      addLog('<script>window.pwned=true;</script>', 'error');

      const consoleEl = ctx.elementRegistry.get('plan-logs-console')!;
      const lastRow = consoleEl.children[consoleEl.children.length - 1];
      // HTML characters in message should be escaped
      expect(lastRow.innerHTML).toContain('&lt;script&gt;');
      expect(lastRow.innerHTML).not.toContain('<script>window.pwned=true;</script>');

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      const subtaskItem = subtaskList.children[0];
      const descEl = subtaskItem.querySelector('.subtask-desc');
      expect(descEl).toBeDefined();
      expect(descEl!.innerHTML).toContain('&lt;iframe');
      expect(descEl!.innerHTML).not.toContain('<iframe src="javascript:alert(1)">');
    });

    it('2.9 observes lack of HTML escaping in subtask target file attributes and target stack card path (Adversarial Security Audit)', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan;
      const sendSelection = ctx.sandbox.sendSelectionToScreenB;

      // Test A: Subtask target file attribute injection in renderPlanView
      // In workbench.js line 4474:
      // <span class="subtask-target-tag" data-file-path="${fp}">
      // If fp contains double quotes, it breaks out of data-file-path attribute
      createPlan({
        title: 'Attribute Escape Test Plan',
        subtasks: [
          {
            id: 'st-attr-test',
            title: 'Audit attribute escaping',
            targetFiles: ['test" onmouseover="alert(1)'],
          },
        ],
      });

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      const subtaskItem = subtaskList.children[0];
      const targetTagsContainer = subtaskItem.querySelector('.subtask-target-tags')!;
      expect(targetTagsContainer).toBeDefined();
      // Verifying empirical behavior of raw string interpolation in HTML template
      expect(targetTagsContainer.innerHTML).toContain('data-file-path="test" onmouseover="alert(1)"');

      // Test B: Target stack card file path rendering in renderTargetStack
      // In workbench.js line 3774:
      // <span class="target-file-badge target-path" title="${target.filePath}">${target.filePath}</span>
      // target.filePath is rendered directly into innerHTML without escapeHtml()
      ctx.mockDocManager.activeDocId = 'vuln<img src=x onerror=alert(1)>.py';
      ctx.mockDocManager.documents.set('vuln<img src=x onerror=alert(1)>.py', {
        id: 'vuln<img src=x onerror=alert(1)>.py',
        filePath: 'vuln<img src=x onerror=alert(1)>.py',
        model: ctx.mockModel,
      });

      sendSelection(ctx.mockEditor);

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      const card = stackList.children[0];
      // Note the empirical observation: target.filePath in target-card-main is unescaped
      expect(card.innerHTML).toContain('vuln<img src=x onerror=alert(1)>.py');
    });

    it('2.10 ensures EditorEventBridge contains listener errors without breaking event dispatch', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      expect(bridge).toBeDefined();

      const order: number[] = [];
      const listener1 = vi.fn(() => { order.push(1); });
      const faultyListenerError = vi.fn(() => {
        order.push(2);
        throw new Error('Fatal error in consumer listener');
      });
      const faultyListenerString = vi.fn(() => {
        order.push(3);
        throw 'String thrown';
      });
      const listener4 = vi.fn(() => { order.push(4); });

      bridge.on('screenB:planUpdate', listener1);
      bridge.on('screenB:planUpdate', faultyListenerError);
      bridge.on('screenB:planUpdate', faultyListenerString);
      bridge.on('screenB:planUpdate', listener4);

      // Emitting must not throw back to caller
      expect(() => {
        bridge.emit('screenB:planUpdate', { action: 'test-event' });
      }).not.toThrow();

      // All 4 listeners were called in order
      expect(order).toEqual([1, 2, 3, 4]);
      expect(listener1).toHaveBeenCalled();
      expect(faultyListenerError).toHaveBeenCalled();
      expect(faultyListenerString).toHaveBeenCalled();
      expect(listener4).toHaveBeenCalled();
    });

    it('2.11 safely handles unsubscribing, re-entrant emissions, and non-function listeners', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      const spyA = vi.fn();
      const disposeA = bridge.on('test:sub', spyA);

      bridge.emit('test:sub', { step: 1 });
      expect(spyA).toHaveBeenCalledTimes(1);

      disposeA();
      bridge.emit('test:sub', { step: 2 });
      expect(spyA).toHaveBeenCalledTimes(1); // not called again

      expect(() => bridge.emit('unregistered:event', { foo: 'bar' })).not.toThrow();

      let reentrantCount = 0;
      bridge.on('reentrant:outer', () => {
        reentrantCount++;
        if (reentrantCount === 1) {
          bridge.emit('reentrant:inner', { depth: 1 });
        }
      });

      const innerSpy = vi.fn();
      bridge.on('reentrant:inner', innerSpy);

      expect(() => bridge.emit('reentrant:outer', {})).not.toThrow();
      expect(innerSpy).toHaveBeenCalledWith({ depth: 1 });
    });
  });
});
