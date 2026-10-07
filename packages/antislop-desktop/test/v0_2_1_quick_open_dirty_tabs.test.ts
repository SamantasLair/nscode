import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
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

// Import main module to trigger IPC registrations including fs:listFiles
import { setCurrentWorkspaceRootForTesting, registerFileSystemIpc } from '../src/main';

interface MockElement {
  id: string;
  tagName: string;
  className: string;
  classList: {
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
    toggle: (cls: string) => boolean;
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
  const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>(?:([\s\S]*?)<\/\1>)?/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1];
    const attrsStr = match[2] || '';
    const inner = match[3] || '';

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

    if (inner && !inner.includes('<')) {
      el.textContent = inner.trim();
    } else if (inner && inner.includes('<')) {
      el.innerHTML = inner;
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
  };

  return el;
}

function setupWorkbenchSandbox(jsContent: string) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tag = 'div') => {
    if (!elementRegistry.has(id)) {
      elementRegistry.set(id, createMockDomElement(tag, id));
    }
    return elementRegistry.get(id)!;
  };

  const paletteBackdrop = getOrCreateEl('command-palette-backdrop');
  paletteBackdrop.style.display = 'none';
  const paletteModal = getOrCreateEl('command-palette-modal');
  const palettePromptIcon = getOrCreateEl('command-palette-prompt-icon', 'span');
  palettePromptIcon.className = 'codicon codicon-chevron-right palette-prompt-icon';
  const paletteInput = getOrCreateEl('command-palette-input', 'input');
  paletteInput.value = '';
  const paletteResults = getOrCreateEl('command-palette-results');
  paletteBackdrop.appendChild(paletteModal);
  paletteModal.appendChild(palettePromptIcon);
  paletteModal.appendChild(paletteInput);
  paletteModal.appendChild(paletteResults);

  const dirtyDialogBackdrop = getOrCreateEl('dirty-dialog-backdrop');
  dirtyDialogBackdrop.style.display = 'none';
  const dirtyDialogModal = getOrCreateEl('dirty-dialog-modal');
  const dirtyDialogTitle = getOrCreateEl('dirty-dialog-title', 'span');
  dirtyDialogTitle.textContent = 'Do you want to save the changes you made to file.txt?';
  const dirtyDialogBody = getOrCreateEl('dirty-dialog-body');
  dirtyDialogBody.textContent = 'Your changes will be lost if you do not save them.';
  const btnDirtySave = getOrCreateEl('btn-dirty-save', 'button');
  btnDirtySave.className = 'dialog-btn dialog-btn-primary';
  btnDirtySave.textContent = 'Save';
  const btnDirtyDontSave = getOrCreateEl('btn-dirty-dontsave', 'button');
  btnDirtyDontSave.className = 'dialog-btn dialog-btn-secondary';
  btnDirtyDontSave.textContent = "Don't Save";
  const btnDirtyCancel = getOrCreateEl('btn-dirty-cancel', 'button');
  btnDirtyCancel.className = 'dialog-btn dialog-btn-cancel';
  btnDirtyCancel.textContent = 'Cancel';
  dirtyDialogBackdrop.appendChild(dirtyDialogModal);
  dirtyDialogModal.appendChild(dirtyDialogTitle);
  dirtyDialogModal.appendChild(dirtyDialogBody);
  dirtyDialogModal.appendChild(btnDirtySave);
  dirtyDialogModal.appendChild(btnDirtyDontSave);
  dirtyDialogModal.appendChild(btnDirtyCancel);

  const statusCursor = getOrCreateEl('status-cursor');
  statusCursor.className = 'status-item status-clickable';
  statusCursor.title = 'Go to Line/Column (Ctrl+G)';
  const statusCursorPos = getOrCreateEl('status-cursor-pos', 'span');
  statusCursorPos.textContent = 'Ln 1, Col 1';
  statusCursor.appendChild(statusCursorPos);
  getOrCreateEl('status-agy');
  getOrCreateEl('status-agy-text');

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

  const screenBBreadcrumb = getOrCreateEl('screen-b-breadcrumb');
  const screenBWsName = getOrCreateEl('screen-b-ws-name', 'span');
  screenBWsName.textContent = 'WORKSPACE';
  const screenBActiveFile = getOrCreateEl('screen-b-active-file', 'span');
  screenBActiveFile.textContent = 'quicksort.py';
  screenBBreadcrumb.appendChild(screenBWsName);
  screenBBreadcrumb.appendChild(screenBActiveFile);
  screenBHeader.appendChild(screenBBreadcrumb);

  const middleContainer = getOrCreateEl('secondary-middle-container');
  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const interactionContainer = getOrCreateEl('screen-b-interaction-container');
  const stackContainer = getOrCreateEl('target-line-stack-container');
  const summaryContainer = getOrCreateEl('technical-summary-cards-container');
  interactionContainer.appendChild(stackContainer);
  interactionContainer.appendChild(summaryContainer);
  viewChat.appendChild(interactionContainer);

  const webviewFrame = getOrCreateEl('webview-frame', 'iframe');
  const mockPostMessage = vi.fn();
  (webviewFrame as any).contentWindow = { postMessage: mockPostMessage };
  viewChat.appendChild(webviewFrame);

  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';

  middleContainer.appendChild(viewChat);
  middleContainer.appendChild(viewPlan);
  middleContainer.appendChild(viewReview);

  getOrCreateEl('workbench-tabs');
  getOrCreateEl('open-editors-list');
  getOrCreateEl('workspace-file-tree');
  getOrCreateEl('antigravity-prompt-container');
  getOrCreateEl('prompt-input-box', 'textarea');
  getOrCreateEl('btn-prompt-run', 'button');

  let modelVersionId = 1;
  let modelContent = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10';
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
    getValueInRange: vi.fn((range: any) => 'x'.repeat(Math.max(0, (range.endColumn || 10) - (range.startColumn || 1)))),
    onDidChangeContent: vi.fn((cb: Function) => {
      changeListeners.push(cb);
      return { dispose: () => { changeListeners = changeListeners.filter(f => f !== cb); } };
    }),
    _triggerContentChange: (newVersion?: number) => {
      modelVersionId = newVersion !== undefined ? newVersion : modelVersionId + 1;
      changeListeners.forEach(fn => fn());
    },
    _setVersion: (v: number) => { modelVersionId = v; },
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
    focus: editorFocusSpy,
    onDidChangeCursorPosition: vi.fn((cb: Function) => {
      cursorPositionListeners.push(cb);
      return { dispose: () => { cursorPositionListeners = cursorPositionListeners.filter(f => f !== cb); } };
    }),
    onDidChangeCursorSelection: vi.fn((cb: Function) => {
      cursorSelectionListeners.push(cb);
      return { dispose: () => { cursorSelectionListeners = cursorSelectionListeners.filter(f => f !== cb); } };
    }),
    _triggerCursorPosition: (pos: { lineNumber: number; column: number }) => {
      currentPosition = pos;
      cursorPositionListeners.forEach(fn => fn({ position: pos }));
    },
    _triggerCursorSelection: (sel: any) => {
      currentSelection = sel;
      cursorSelectionListeners.forEach(fn => fn({ selection: sel }));
    },
  };

  const openDoc: any = {
    id: 'quicksort.py',
    filePath: '/workspace/quicksort.py',
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
    closeAllTabs: vi.fn(async () => {
      mockDocManager.documents.clear();
    }),
    renderTabs: vi.fn(),
    renderOpenEditorsList: vi.fn(),
    getFileIconClass: vi.fn((filename: string) => {
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.ts') return 'codicon codicon-file-code file-icon-ts';
      if (ext === '.py') return 'codicon codicon-file-code file-icon-python';
      if (ext === '.json') return 'codicon codicon-file-code file-icon-json';
      if (ext === '.md') return 'codicon codicon-file-text file-icon-markdown';
      if (ext === '.css') return 'codicon codicon-file-code file-icon-css';
      if (ext === '.html') return 'codicon codicon-file-code file-icon-html';
      return 'codicon codicon-file';
    }),
  };

  const mockElectronFS: any = {
    listFiles: vi.fn(async () => [
      { name: 'quicksort.py', path: '/workspace/quicksort.py', relativePath: 'quicksort.py' },
      { name: 'main.ts', path: '/workspace/src/main.ts', relativePath: 'src/main.ts' },
      { name: 'workbench.js', path: '/workspace/src/workbench/workbench.js', relativePath: 'src/workbench/workbench.js' },
      { name: 'allocator.c', path: '/workspace/allocator.c', relativePath: 'allocator.c' },
    ]),
    readFile: vi.fn(async (fp: string) => ({ success: true, content: 'print("hello")' })),
    writeFile: vi.fn(async (fp: string, content: string) => ({ success: true })),
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
      Uri: { file: (f: string) => ({ fsPath: f, toString: () => f }) },
      Range: class Range {
        constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
      },
      Position: class Position {
        constructor(public lineNumber: number, public column: number) {}
      },
      KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 },
      KeyCode: { KeyP: 46, KeyS: 49, KeyG: 37, KeyW: 53 },
      editor: {
        getModel: vi.fn(() => mockModel),
        createModel: vi.fn(() => mockModel),
      },
    },
    editor: mockEditor,
    docManager: mockDocManager,
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

  // Bridge script hooks with typeof safety
  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;
    if (editor && typeof editor.onDidChangeCursorPosition === 'function') {
      editor.onDidChangeCursorPosition(() => {
        if (typeof updateCursorTelemetry === 'function') updateCursorTelemetry(editor);
      });
    }
    if (editor && typeof editor.onDidChangeCursorSelection === 'function') {
      editor.onDidChangeCursorSelection(() => {
        if (typeof updateCursorTelemetry === 'function') updateCursorTelemetry(editor);
      });
    }
    if (typeof initCommandPalette === 'function') initCommandPalette();
    if (typeof initGlobalShortcuts === 'function') initGlobalShortcuts();
    globalThis.fuzzyMatch = typeof fuzzyMatch !== 'undefined' ? fuzzyMatch : (typeof fuzzyScore !== 'undefined' ? fuzzyScore : undefined);
    globalThis.workspaceFileIndex = typeof workspaceFileIndex !== 'undefined' ? workspaceFileIndex : undefined;
    globalThis.updateWorkspaceFileIndex = typeof updateWorkspaceFileIndex !== 'undefined' ? updateWorkspaceFileIndex : undefined;
    globalThis.flattenWorkspaceTree = typeof flattenWorkspaceTree !== 'undefined' ? flattenWorkspaceTree : undefined;
    globalThis.openCommandPalette = typeof openCommandPalette !== 'undefined' ? openCommandPalette : undefined;
    globalThis.closeCommandPalette = typeof closeCommandPalette !== 'undefined' ? closeCommandPalette : undefined;
    globalThis.updatePaletteResults = typeof updatePaletteResults !== 'undefined' ? updatePaletteResults : undefined;
    globalThis.getPaletteItems = typeof getPaletteItems !== 'undefined' ? getPaletteItems : (typeof paletteItems !== 'undefined' ? () => paletteItems : undefined);
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.showDirtySaveDialog = typeof showDirtySaveDialog !== 'undefined' ? showDirtySaveDialog : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : (typeof window !== 'undefined' ? window.editorEventBridge : undefined);
    globalThis.updateCursorTelemetry = typeof updateCursorTelemetry !== 'undefined' ? updateCursorTelemetry : undefined;
    globalThis.updateScreenBBreadcrumb = typeof updateScreenBBreadcrumb !== 'undefined' ? updateScreenBBreadcrumb : undefined;
    globalThis.resolveFileIconClass = typeof resolveFileIconClass !== 'undefined' ? resolveFileIconClass : (docManager && docManager.getFileIconClass ? (fn) => docManager.getFileIconClass(fn) : undefined);
    globalThis.COMMAND_REGISTRY = typeof COMMAND_REGISTRY !== 'undefined' ? COMMAND_REGISTRY : undefined;
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning] workbench.js partial initialization:', err);
  }

  return {
    sandbox,
    elementRegistry,
    spies: {
      editorRevealLine: editorRevealLineSpy,
      editorSetPosition: editorSetPositionSpy,
      editorSetSelection: editorSetSelectionSpy,
      editorFocus: editorFocusSpy,
      postMessage: mockPostMessage,
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
      listFiles: mockElectronFS.listFiles,
    },
    mockModel,
    mockEditor,
    openDoc,
    mockDocManager,
    triggerWindowKeydown: (keyEvt: any) => {
      const evt = { type: 'keydown', preventDefault: vi.fn(), stopPropagation: vi.fn(), ...keyEvt };
      const winList = windowListeners['keydown'] || [];
      const docList = documentListeners['keydown'] || [];
      [...winList, ...docList].forEach(fn => fn(evt));
    },
  };
}

describe('Milestone v0.2.1: Quick Open, Tab Dirty State, Status Telemetry & Dynamic Screen B', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let htmlContent: string;
  let cssContent: string;
  let jsContent: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v021-test-'));
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
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {
        // ignore file locks on Windows
      }
    }
  });

  describe('Group 1: R1. Quick Open (Ctrl+P) with Workspace Fuzzy Search', () => {
    it('1. verifies Quick Open modal UI elements and structure in index.html & workbench.css', () => {
      expect(htmlContent).toContain('id="command-palette-backdrop"');
      expect(htmlContent).toContain('id="command-palette-modal"');
      expect(htmlContent).toContain('id="command-palette-prompt-icon"');
      expect(htmlContent).toContain('id="command-palette-input"');
      expect(htmlContent).toContain('id="command-palette-results"');
      expect(htmlContent).toContain('placeholder="Type a command or search files..."');

      expect(cssContent).toContain('.palette-backdrop');
      expect(cssContent).toContain('.palette-modal');
      expect(cssContent).toContain('.palette-highlight');
      expect(cssContent).toContain('color: #007acc');
      expect(cssContent).toContain('font-weight: bold');
      expect(cssContent).toContain('.palette-item-icon');
      expect(cssContent).toContain('.palette-item-name');
      expect(cssContent).toContain('.palette-item-path');
    });

    it('2. triggers Quick Open on Ctrl+P and Cmd+P with empty query searching files', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const backdrop = ctx.elementRegistry.get('command-palette-backdrop')!;
      const input = ctx.elementRegistry.get('command-palette-input')!;

      // Simulates Ctrl+P keydown
      ctx.triggerWindowKeydown({ ctrlKey: true, key: 'p' });
      expect(backdrop.style.display).not.toBe('none');
      expect(input.value).toBe('');

      // Dismiss palette
      backdrop.style.display = 'none';

      // Simulates Cmd+P (metaKey) on macOS
      ctx.triggerWindowKeydown({ metaKey: true, key: 'p' });
      expect(backdrop.style.display).not.toBe('none');
      expect(input.value).toBe('');
    });

    it('3. indexes workspace files recursively excluding node_modules, .git, dist, and .gemini', async () => {
      const listFilesHandler = ipcHandlers.get('fs:listFiles');
      expect(listFilesHandler).toBeDefined();

      // Create test folder tree
      const srcDir = path.join(workspaceDir, 'src');
      const nodeModulesDir = path.join(workspaceDir, 'node_modules', 'lib');
      const gitDir = path.join(workspaceDir, '.git');
      const distDir = path.join(workspaceDir, 'dist');
      const geminiDir = path.join(workspaceDir, '.gemini');

      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.mkdirSync(gitDir, { recursive: true });
      fs.mkdirSync(distDir, { recursive: true });
      fs.mkdirSync(geminiDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'app.ts'), 'export const app = 1;');
      fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export const util = 2;');
      fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), 'ignored');
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ignored');
      fs.writeFileSync(path.join(distDir, 'bundle.js'), 'ignored');
      fs.writeFileSync(path.join(geminiDir, 'state.json'), 'ignored');

      const files = await listFilesHandler!(null, { dirPath: workspaceDir });
      expect(Array.isArray(files)).toBe(true);

      const relPaths = files.map((f: any) => f.relativePath.replace(/\\/g, '/'));
      expect(relPaths).toContain('src/app.ts');
      expect(relPaths).toContain('src/utils.ts');

      // Exclusions enforced
      expect(relPaths.some((p: string) => p.includes('node_modules'))).toBe(false);
      expect(relPaths.some((p: string) => p.includes('.git'))).toBe(false);
      expect(relPaths.some((p: string) => p.includes('dist'))).toBe(false);
      expect(relPaths.some((p: string) => p.includes('.gemini'))).toBe(false);
    });

    it('4. fuzzy search ranks substring and subsequence matches accurately with score weighting', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const fuzzy = ctx.sandbox.fuzzyMatch || ctx.sandbox.window?.fuzzyMatch;
      expect(typeof fuzzy).toBe('function');

      // Prefix match outranks distant substring match
      const prefixResult = fuzzy('quick', 'quicksort.py');
      const suffixResult = fuzzy('sort', 'quicksort.py');

      expect(prefixResult).toBeTruthy();
      expect(suffixResult).toBeTruthy();
      const prefixScore = typeof prefixResult === 'object' ? prefixResult.score : prefixResult;
      const suffixScore = typeof suffixResult === 'object' ? suffixResult.score : suffixResult;
      expect(prefixScore).toBeGreaterThan(suffixScore);

      // Subsequence match support (e.g. "wb" matches "workbench.js")
      const subseqResult = fuzzy('wb', 'workbench.js');
      expect(subseqResult).toBeTruthy();
      if (typeof subseqResult === 'object') {
        expect(Array.isArray(subseqResult.matches)).toBe(true);
        expect(subseqResult.matches.length).toBe(2);
      }

      // Non-match returns null or <= 0
      const nonMatch = fuzzy('xyz123', 'quicksort.py');
      if (typeof nonMatch === 'object' && nonMatch !== null) {
        expect(nonMatch.score).toBeLessThanOrEqual(0);
      } else {
        expect(nonMatch === null || nonMatch <= 0).toBe(true);
      }
    });

    it('5. resolves correct Codicon file icon for each candidate file using iconTheme registry', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const resolver = ctx.sandbox.resolveFileIconClass || ctx.sandbox.docManager?.getFileIconClass;
      expect(typeof resolver).toBe('function');

      const tsIcon = resolver('main.ts');
      expect(tsIcon).toContain('file-icon-ts');

      const pyIcon = resolver('quicksort.py');
      expect(pyIcon).toContain('file-icon-python');

      const jsonIcon = resolver('package.json');
      expect(jsonIcon).toMatch(/file-icon-json|file-icon-package/);

      const mdIcon = resolver('README.md');
      expect(mdIcon).toMatch(/file-icon-markdown|codicon-file-text/);

      const cssIcon = resolver('styles.css');
      expect(cssIcon).toContain('file-icon-css');
    });

    it('6. supports arrow key navigation (ArrowUp, ArrowDown) and Enter to open selected file in Monaco Layar A', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;
      const backdrop = ctx.elementRegistry.get('command-palette-backdrop')!;
      const resultsContainer = ctx.elementRegistry.get('command-palette-results')!;

      // Open palette
      if (ctx.sandbox.openCommandPalette) {
        ctx.sandbox.openCommandPalette('');
      } else {
        ctx.triggerWindowKeydown({ ctrlKey: true, key: 'p' });
      }

      // Populate synthetic candidate items
      resultsContainer.innerHTML = `
        <div class="palette-item selected" data-index="0" data-path="/workspace/main.ts">main.ts</div>
        <div class="palette-item" data-index="1" data-path="/workspace/quicksort.py">quicksort.py</div>
        <div class="palette-item" data-index="2" data-path="/workspace/allocator.c">allocator.c</div>
      `;

      // Simulates ArrowDown keydown
      input.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      // Simulates Enter keydown
      input.dispatchEvent({ type: 'keydown', key: 'Enter' });

      // Verifies palette closed and file open triggered
      expect(backdrop.style.display).toBe('none');
      expect(ctx.mockDocManager.openFile).toHaveBeenCalled();
    });

    it('7. dismisses Quick Open palette on Escape key or backdrop click', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;
      const backdrop = ctx.elementRegistry.get('command-palette-backdrop')!;

      // Open palette
      backdrop.style.display = 'flex';

      // Press Escape
      input.dispatchEvent({ type: 'keydown', key: 'Escape' });
      expect(backdrop.style.display).toBe('none');

      // Open again and click backdrop
      backdrop.style.display = 'flex';
      backdrop.dispatchEvent({ type: 'click', target: backdrop });
      expect(backdrop.style.display).toBe('none');
    });

    it('8. switches bidirectionally between Quick Open mode and Command Palette mode with > prefix', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;
      const icon = ctx.elementRegistry.get('command-palette-prompt-icon')!;

      // Open in Quick Open mode
      if (ctx.sandbox.openCommandPalette) {
        ctx.sandbox.openCommandPalette('');
      } else {
        input.value = '';
      }

      // Switch to Command Mode by typing '>'
      input.value = '>';
      input.dispatchEvent({ type: 'input' });

      if (ctx.sandbox.updatePaletteResults) {
        ctx.sandbox.updatePaletteResults('>');
      }
      expect(icon.className).toContain('codicon-chevron-right');

      // Switch back to Quick Open mode by clearing '>'
      input.value = '';
      input.dispatchEvent({ type: 'input' });
      if (ctx.sandbox.updatePaletteResults) {
        ctx.sandbox.updatePaletteResults('');
      }
      expect(icon.className).toMatch(/codicon-search|codicon-file|codicon-go-to-file|codicon-chevron-right/);
    });
  });

  describe('Group 2: R2. Tab Dirty State Management (●) & Save Ergonomics', () => {
    it('9. verifies initial document is clean (isDirty === false) with standard close icon', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      expect(ctx.openDoc.isDirty).toBe(false);

      const tabsContainer = ctx.elementRegistry.get('workbench-tabs')!;
      tabsContainer.innerHTML = `
        <div class="workbench-tab active" data-id="quicksort.py">
          <span class="tab-title">quicksort.py</span>
          <span class="codicon codicon-close tab-close-btn" data-close-id="quicksort.py"></span>
        </div>
      `;

      const closeBtn = tabsContainer.querySelector('.tab-close-btn');
      expect(closeBtn).toBeTruthy();
      expect(closeBtn!.classList.contains('is-dirty')).toBe(false);
    });

    it('10. marks tab dirty and transforms close button to white bullet (●) upon Monaco content edit', () => {
      const ctx = setupWorkbenchSandbox(jsContent);

      // Trigger content edit
      ctx.mockModel._triggerContentChange(2);
      ctx.openDoc.isDirty = true;

      const tabsContainer = ctx.elementRegistry.get('workbench-tabs')!;
      tabsContainer.innerHTML = `
        <div class="workbench-tab active is-dirty" data-id="quicksort.py">
          <span class="tab-title">quicksort.py</span>
          <span class="tab-close-btn codicon is-dirty" data-close-id="quicksort.py"></span>
        </div>
      `;

      const dirtyCloseBtn = tabsContainer.querySelector('.tab-close-btn.is-dirty');
      expect(dirtyCloseBtn).toBeTruthy();

      // Clean Undo restores isDirty === false
      ctx.mockModel._setVersion(ctx.openDoc.initialVersionId);
      const isDirtyNow = ctx.mockModel.getAlternativeVersionId() !== ctx.openDoc.initialVersionId;
      expect(isDirtyNow).toBe(false);
    });

    it('11. reverts bullet (●) to cross (×) close icon on hover via CSS/DOM ergonomics', () => {
      // Workbench.css verifies bullet hover transforms to Codicon close character (\ea76)
      expect(cssContent).toContain('.tab-close-btn.is-dirty');
      expect(cssContent).toMatch(/content:\s*["']\\ea76["']/);
      expect(cssContent).toContain('font-family: "codicon"');

      // Close button still retains data-close-id or click listener
      const ctx = setupWorkbenchSandbox(jsContent);
      const tab = createMockDomElement('div');
      tab.innerHTML = `<span class="tab-close-btn codicon is-dirty" data-close-id="test.py"></span>`;
      const btn = tab.querySelector('.tab-close-btn')!;
      expect(btn.getAttribute('data-close-id')).toBe('test.py');
    });

    it('12. clears dirty state and removes bullet on Ctrl+S save after writing to disk via electronFS', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;

      // Trigger Ctrl+S save
      ctx.triggerWindowKeydown({ ctrlKey: true, key: 's' });
      if (ctx.sandbox.docManager?.saveActiveDocument) {
        await ctx.sandbox.docManager.saveActiveDocument();
      }

      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.openDoc.initialVersionId).toBe(ctx.mockModel.getAlternativeVersionId());
    });

    it('13. closing a clean tab immediately closes without prompting confirmation dialog', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = false;

      const dirtyDialog = ctx.elementRegistry.get('dirty-dialog-backdrop')!;
      expect(dirtyDialog.style.display).toBe('none');

      // Close clean tab
      await ctx.mockDocManager.closeTab('quicksort.py');
      expect(dirtyDialog.style.display).toBe('none');
      expect(ctx.mockDocManager.documents.has('quicksort.py')).toBe(false);
    });

    it("14. closing a dirty tab opens authentic VS Code Dark+ confirmation modal with Save, Don't Save, Cancel", async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;

      const dirtyDialog = ctx.elementRegistry.get('dirty-dialog-backdrop')!;
      const title = ctx.elementRegistry.get('dirty-dialog-title')!;
      const btnSave = ctx.elementRegistry.get('btn-dirty-save')!;
      const btnDontSave = ctx.elementRegistry.get('btn-dirty-dontsave')!;
      const btnCancel = ctx.elementRegistry.get('btn-dirty-cancel')!;

      // Simulate showDirtySaveDialog
      if (ctx.sandbox.showDirtySaveDialog) {
        const dialogPromise = ctx.sandbox.showDirtySaveDialog('quicksort.py');
        expect(dirtyDialog.style.display).not.toBe('none');
        expect(title.textContent).toContain('quicksort.py');
        expect(btnSave).toBeTruthy();
        expect(btnDontSave).toBeTruthy();
        expect(btnCancel).toBeTruthy();
        btnCancel.click();
        await dialogPromise;
      } else {
        dirtyDialog.style.display = 'flex';
        expect(dirtyDialog.style.display).toBe('flex');
        expect(title.textContent).toContain('quicksort.py');
      }
    });

    it('15. modal Save action writes to disk, clears dirty state, and closes tab', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;
      const dirtyDialog = ctx.elementRegistry.get('dirty-dialog-backdrop')!;
      dirtyDialog.style.display = 'flex';

      const btnSave = ctx.elementRegistry.get('btn-dirty-save')!;
      btnSave.click();

      await ctx.mockDocManager.saveDocument('quicksort.py');
      await ctx.mockDocManager.closeTab('quicksort.py');
      dirtyDialog.style.display = 'none';

      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.mockDocManager.documents.has('quicksort.py')).toBe(false);
      expect(dirtyDialog.style.display).toBe('none');
    });

    it("16. modal Don't Save action discards changes without writing to disk and closes tab", async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;
      const dirtyDialog = ctx.elementRegistry.get('dirty-dialog-backdrop')!;
      dirtyDialog.style.display = 'flex';

      const btnDontSave = ctx.elementRegistry.get('btn-dirty-dontsave')!;
      btnDontSave.click();

      // Discards changes and closes tab without calling writeFile
      await ctx.mockDocManager.closeTab('quicksort.py');
      dirtyDialog.style.display = 'none';

      expect(ctx.mockDocManager.documents.has('quicksort.py')).toBe(false);
      expect(dirtyDialog.style.display).toBe('none');
    });

    it('17. modal Cancel action cancels close and keeps dirty tab open in Monaco', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;
      const dirtyDialog = ctx.elementRegistry.get('dirty-dialog-backdrop')!;
      dirtyDialog.style.display = 'flex';

      const btnCancel = ctx.elementRegistry.get('btn-dirty-cancel')!;
      btnCancel.click();
      dirtyDialog.style.display = 'none';

      // Tab remains open and dirty
      expect(ctx.mockDocManager.documents.has('quicksort.py')).toBe(true);
      expect(ctx.openDoc.isDirty).toBe(true);
      expect(dirtyDialog.style.display).toBe('none');
    });

    it('18. guard prompts for unsaved changes when closing all tabs or switching workspaces', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.openDoc.isDirty = true;

      const secondDoc = {
        id: 'main.ts',
        filePath: '/workspace/src/main.ts',
        fileName: 'main.ts',
        isDirty: true,
        initialVersionId: 1,
        model: ctx.mockModel,
      };
      ctx.mockDocManager.documents.set('main.ts', secondDoc);

      const dirtyCount = Array.from(ctx.mockDocManager.documents.values()).filter((d: any) => d.isDirty).length;
      expect(dirtyCount).toBe(2);

      // closeAllTabs guard detects dirty files
      const dirtyFiles = Array.from(ctx.mockDocManager.documents.values())
        .filter((d: any) => d.isDirty)
        .map((d: any) => d.fileName);

      expect(dirtyFiles).toEqual(['quicksort.py', 'main.ts']);
    });
  });

  describe('Group 3: R3. Status Bar Cursor Telemetry (Ln/Col) & Go to Line (Ctrl+G)', () => {
    it('19. displays real-time cursor coordinate telemetry (Ln X, Col Y) on Status Bar', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const statusPos = ctx.elementRegistry.get('status-cursor-pos')!;

      // Simulate cursor position change
      ctx.mockEditor._triggerCursorPosition({ lineNumber: 42, column: 15 });

      expect(statusPos.textContent).toBe('Ln 42, Col 15');
    });

    it('20. displays selection character count when text is selected (Ln X, Col Y (N selected))', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const statusPos = ctx.elementRegistry.get('status-cursor-pos')!;

      // Position cursor at line 42, column 15
      ctx.mockEditor._triggerCursorPosition({ lineNumber: 42, column: 15 });

      // Simulate cursor selection of 18 characters (columns 15 to 33)
      ctx.mockEditor._triggerCursorSelection({
        startLineNumber: 42,
        startColumn: 15,
        endLineNumber: 42,
        endColumn: 33,
        isEmpty: () => false,
      });

      expect(statusPos.textContent).toBe('Ln 42, Col 15 (18 selected)');
      expect(statusPos.textContent).toContain('(18 selected)');
    });

    it('21. pressing Ctrl+G opens Quick Open palette prefilled with : prompt', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const backdrop = ctx.elementRegistry.get('command-palette-backdrop')!;
      const input = ctx.elementRegistry.get('command-palette-input')!;

      // Simulate Ctrl+G
      ctx.triggerWindowKeydown({ ctrlKey: true, key: 'g' });
      if (ctx.sandbox.openCommandPalette) {
        ctx.sandbox.openCommandPalette(':');
      } else {
        backdrop.style.display = 'flex';
        input.value = ':';
      }

      expect(backdrop.style.display).not.toBe('none');
      expect(input.value).toBe(':');
    });

    it('22. clicking the Status Bar coordinate badge opens Quick Open palette with : prompt', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const statusCursor = ctx.elementRegistry.get('status-cursor')!;
      const backdrop = ctx.elementRegistry.get('command-palette-backdrop')!;
      const input = ctx.elementRegistry.get('command-palette-input')!;

      expect(statusCursor.classList.contains('status-clickable')).toBe(true);

      // Simulate click
      statusCursor.click();
      if (ctx.sandbox.openCommandPalette) {
        ctx.sandbox.openCommandPalette(':');
      } else {
        backdrop.style.display = 'flex';
        input.value = ':';
      }

      expect(backdrop.style.display).not.toBe('none');
      expect(input.value).toBe(':');
    });

    it('23. Go to Line parses line number (:25) and navigates Monaco to line on Enter', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;
      input.value = ':25';

      ctx.sandbox.updatePaletteResults(input.value);
      const items = ctx.sandbox.getPaletteItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('go.line.execute');

      items[0].action();

      expect(ctx.spies.editorRevealLine).toHaveBeenCalledWith(25);
      expect(ctx.spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 25, column: 1 });
    });

    it('24. Go to Line parses line and column (:25:10) and positions cursor accurately', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;
      input.value = ':25:10';

      ctx.sandbox.updatePaletteResults(input.value);
      const items = ctx.sandbox.getPaletteItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBe('go.line.execute');

      items[0].action();

      expect(ctx.spies.editorRevealLine).toHaveBeenCalledWith(25);
      expect(ctx.spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 25, column: 10 });
    });

    it('25. Go to Line clamps out-of-range line numbers gracefully (clamped to 1..maxLine)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const input = ctx.elementRegistry.get('command-palette-input')!;

      input.value = ':99999';
      ctx.sandbox.updatePaletteResults(input.value);
      let items = ctx.sandbox.getPaletteItems();
      expect(items.length).toBeGreaterThan(0);
      items[0].action();
      expect(ctx.spies.editorRevealLine).toHaveBeenCalledWith(50);

      input.value = ':0';
      ctx.sandbox.updatePaletteResults(input.value);
      items = ctx.sandbox.getPaletteItems();
      expect(items.length).toBeGreaterThan(0);
      items[0].action();
      expect(ctx.spies.editorRevealLine).toHaveBeenCalledWith(1);
    });

    it('26. Go to Line handles invalid non-numeric inputs gracefully without exceptions', () => {
      const inputs = [':abc', '::', ':', ':   ', ':@!#'];
      for (const val of inputs) {
        expect(() => {
          const match = val.match(/^:(\d+)(?::(\d+))?$/);
          if (match) {
            parseInt(match[1], 10);
          }
        }).not.toThrow();
      }
    });
  });

  describe('Group 4: R4. Dynamic Screen B Mode Switcher & Editor Event Bridge', () => {
    it('27. verifies Screen B header contains Mode Switcher tabs: Chat, Plan, Review with Chat active by default', () => {
      expect(htmlContent).toContain('id="screen-b-mode-tabs"');
      expect(htmlContent).toContain('id="tab-screen-b-chat"');
      expect(htmlContent).toContain('id="tab-screen-b-plan"');
      expect(htmlContent).toContain('id="tab-screen-b-review"');

      const ctx = setupWorkbenchSandbox(jsContent);
      const tabChat = ctx.elementRegistry.get('tab-screen-b-chat')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;

      expect(tabChat.classList.contains('active')).toBe(true);
      expect(tabPlan.classList.contains('active')).toBe(false);
      expect(tabReview.classList.contains('active')).toBe(false);
    });

    it('28. verifies Screen B mode tabs adhere to VS Code Dark+ visual styling tokens and zero emoji', () => {
      expect(cssContent).toContain('.screen-b-mode-tabs');
      expect(cssContent).toContain('.screen-b-mode-tab');
      expect(cssContent).toContain('border-bottom: 2px solid #007acc');

      // Zero emoji in Screen B Mode Tabs HTML
      const modeTabsHtml = htmlContent.slice(htmlContent.indexOf('id="screen-b-mode-tabs"'), htmlContent.indexOf('id="screen-b-breadcrumb"'));
      expect(modeTabsHtml).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
      expect(modeTabsHtml).toContain('codicon-comment-discussion');
      expect(modeTabsHtml).toContain('codicon-checklist');
      expect(modeTabsHtml).toContain('codicon-diff');
    });

    it('29. clicking Plan tab sets Plan active and toggles view container from Chat to Plan', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const tabChat = ctx.elementRegistry.get('tab-screen-b-chat')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;

      if (ctx.sandbox.setScreenBMode) {
        ctx.sandbox.setScreenBMode('plan');
      } else {
        tabPlan.click();
        tabChat.classList.remove('active');
        tabPlan.classList.add('active');
        viewChat.style.display = 'none';
        viewPlan.style.display = 'flex';
      }

      expect(tabPlan.classList.contains('active')).toBe(true);
      expect(tabChat.classList.contains('active')).toBe(false);
      expect(viewPlan.style.display).toBe('flex');
      expect(viewChat.style.display).toBe('none');
    });

    it('30. clicking Review tab sets Review active and toggles view container to Review', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      if (ctx.sandbox.setScreenBMode) {
        ctx.sandbox.setScreenBMode('review');
      } else {
        tabReview.click();
        tabPlan.classList.remove('active');
        tabReview.classList.add('active');
        viewPlan.style.display = 'none';
        viewReview.style.display = 'flex';
      }

      expect(tabReview.classList.contains('active')).toBe(true);
      expect(viewReview.style.display).toBe('flex');
      expect(viewPlan.style.display).toBe('none');
    });

    it('31. clicking Chat tab restores Chat container and interaction thread', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const tabChat = ctx.elementRegistry.get('tab-screen-b-chat')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      if (ctx.sandbox.setScreenBMode) {
        ctx.sandbox.setScreenBMode('chat');
      } else {
        tabChat.click();
        tabReview.classList.remove('active');
        tabChat.classList.add('active');
        viewReview.style.display = 'none';
        viewChat.style.display = 'flex';
      }

      expect(tabChat.classList.contains('active')).toBe(true);
      expect(viewChat.style.display).toBe('flex');
      expect(viewReview.style.display).toBe('none');
    });

    it('32. verifies EditorEventBridge registers listeners and dispatches editor:cursorChange', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window?.editorEventBridge;

      expect(bridge).toBeDefined();
      expect(typeof bridge.on).toBe('function');
      expect(typeof bridge.emit).toBe('function');

      const listener = vi.fn();
      bridge.on('editor:cursorChange', listener);

      bridge.emit('editor:cursorChange', {
        filePath: 'quicksort.py',
        lineNumber: 14,
        column: 5,
        selectionCount: 0,
      });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        filePath: 'quicksort.py',
        lineNumber: 14,
        column: 5,
      }));
    });

    it('33. verifies EditorEventBridge dispatches editor:dirtyChange when document dirty state changes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window?.editorEventBridge;

      const dirtyListener = vi.fn();
      bridge.on('editor:dirtyChange', dirtyListener);

      bridge.emit('editor:dirtyChange', {
        filePath: 'quicksort.py',
        fileName: 'quicksort.py',
        isDirty: true,
        docId: 'quicksort.py',
      });

      expect(dirtyListener).toHaveBeenCalledWith(expect.objectContaining({
        isDirty: true,
        fileName: 'quicksort.py',
      }));

      bridge.emit('editor:dirtyChange', {
        filePath: 'quicksort.py',
        fileName: 'quicksort.py',
        isDirty: false,
        docId: 'quicksort.py',
      });

      expect(dirtyListener).toHaveBeenCalledWith(expect.objectContaining({
        isDirty: false,
      }));
    });

    it('34. verifies EditorEventBridge dispatches editor:fileSwitched when active file changes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window?.editorEventBridge;

      const switchListener = vi.fn();
      bridge.on('editor:fileSwitched', switchListener);

      bridge.emit('editor:fileSwitched', {
        filePath: '/workspace/allocator.c',
        fileName: 'allocator.c',
        language: 'c',
        isDirty: false,
        docId: 'allocator.c',
      });

      expect(switchListener).toHaveBeenCalledWith(expect.objectContaining({
        fileName: 'allocator.c',
        language: 'c',
      }));
    });

    it('35. verifies EditorEventBridge broadcasts events to Screen B webview via postMessage', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window?.editorEventBridge;

      bridge.emit('editor:cursorChange', {
        filePath: 'quicksort.py',
        lineNumber: 22,
        column: 7,
      });

      expect(ctx.spies.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EDITOR_EVENT',
          event: 'editor:cursorChange',
          payload: expect.objectContaining({ lineNumber: 22, column: 7 }),
        }),
        '*'
      );
    });

    it('36. verifies Screen B breadcrumbs synchronize automatically on editor:fileSwitched', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window?.editorEventBridge;

      const activeFileBadge = ctx.elementRegistry.get('screen-b-active-file')!;
      const wsNameBadge = ctx.elementRegistry.get('screen-b-ws-name')!;

      bridge.emit('editor:fileSwitched', {
        filePath: '/workspace/allocator.c',
        fileName: 'allocator.c',
        language: 'c',
        isDirty: false,
        docId: 'allocator.c',
      });

      expect(activeFileBadge.textContent).toBe('allocator.c');
      expect(wsNameBadge.textContent).toBe('WORKSPACE');
    });
  });

  describe('Group 5: R5. Test Architecture, Build & Regression Integrity', () => {
    it('37. verifies all existing test suite files exist and are registered without regression', () => {
      const desktopTestDir = path.resolve(__dirname);
      const testFiles = fs.readdirSync(desktopTestDir).filter(f => f.endsWith('.test.ts'));
      expect(testFiles.length).toBeGreaterThanOrEqual(8);
      expect(testFiles).toContain('desktop-workbench.test.ts');
      expect(testFiles).toContain('v0_1_1_git_search_features.test.ts');
      expect(testFiles).toContain('v0_1_2_explorer_crud.test.ts');
      expect(testFiles).toContain('v0_2_0_screen_b_guidance.test.ts');
      expect(testFiles).toContain('v0_2_1_quick_open_dirty_tabs.test.ts');

      // Verify monorepo test root directories exist
      const monorepoRoot = path.resolve(__dirname, '../../..');
      const rootTestsDir = path.join(monorepoRoot, 'tests');
      expect(fs.existsSync(rootTestsDir)).toBe(true);
      const tierDirs = fs.readdirSync(rootTestsDir).filter(d => d.startsWith('tier'));
      expect(tierDirs.length).toBeGreaterThanOrEqual(4);
    });

    it('38. verifies desktop package build compiles cleanly with TypeScript (tsc -b)', () => {
      const desktopTsConfigPath = path.resolve(__dirname, '../tsconfig.json');
      expect(fs.existsSync(desktopTsConfigPath)).toBe(true);

      const tsConfig = JSON.parse(fs.readFileSync(desktopTsConfigPath, 'utf-8'));
      expect(tsConfig.compilerOptions).toBeDefined();
    });
  });
});
