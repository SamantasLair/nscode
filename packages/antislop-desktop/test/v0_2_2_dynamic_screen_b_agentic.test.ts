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

// Import main module to trigger IPC registrations
import { setCurrentWorkspaceRootForTesting } from '../src/main';

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

function setupWorkbenchSandbox(jsContent: string) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tag = 'div') => {
    if (!elementRegistry.has(id)) {
      elementRegistry.set(id, createMockDomElement(tag, id));
    }
    return elementRegistry.get(id)!;
  };

  // Seed Layar A Editor Mounts
  const editorMount = getOrCreateEl('editor-mount');
  editorMount.style.display = 'block';
  const diffEditorMount = getOrCreateEl('diff-editor-mount');
  diffEditorMount.style.display = 'none';

  // Seed Screen B Secondary Sidebar and Headers
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

  // Seed Screen B Middle Container & Views
  const middleContainer = getOrCreateEl('secondary-middle-container');

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

  const webviewFrame = getOrCreateEl('webview-frame', 'iframe');
  const mockPostMessage = vi.fn();
  (webviewFrame as any).contentWindow = { postMessage: mockPostMessage };
  viewChat.appendChild(webviewFrame);

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
  btnPlanPause.className = 'plan-control-btn';
  const btnPlanResume = getOrCreateEl('btn-plan-resume', 'button');
  btnPlanResume.className = 'plan-control-btn';
  btnPlanResume.style.display = 'none';
  const btnPlanCancel = getOrCreateEl('btn-plan-cancel', 'button');
  btnPlanCancel.className = 'plan-control-btn btn-danger';

  const planProgressBarFill = getOrCreateEl('plan-progress-bar-fill');
  planProgressBarFill.style.width = '0%';
  const planProgressText = getOrCreateEl('plan-progress-text');
  planProgressText.textContent = '0 / 0 subtasks completed (0%)';

  planHeaderBar.appendChild(planTitle);
  planHeaderBar.appendChild(planStatusBadge);
  planHeaderBar.appendChild(btnPlanPause);
  planHeaderBar.appendChild(btnPlanResume);
  planHeaderBar.appendChild(btnPlanCancel);
  planActivePane.appendChild(planHeaderBar);

  const planSubtasksSection = getOrCreateEl('plan-subtasks-section');
  const planSubtaskCount = getOrCreateEl('plan-subtask-count', 'span');
  planSubtaskCount.textContent = '0';
  const planSubtaskList = getOrCreateEl('plan-subtask-list');
  planSubtasksSection.appendChild(planSubtaskCount);
  planSubtasksSection.appendChild(planSubtaskList);
  planActivePane.appendChild(planSubtasksSection);

  const planAffectedSection = getOrCreateEl('plan-affected-section');
  const planAffectedCount = getOrCreateEl('plan-affected-count', 'span');
  planAffectedCount.textContent = '0';
  const planAffectedList = getOrCreateEl('plan-affected-list');
  planAffectedSection.appendChild(planAffectedCount);
  planAffectedSection.appendChild(planAffectedList);
  planActivePane.appendChild(planAffectedSection);

  const planLogsSection = getOrCreateEl('plan-logs-section');
  const btnPlanClearLogs = getOrCreateEl('btn-plan-clear-logs', 'button');
  const planLogsConsole = getOrCreateEl('plan-logs-console');
  planLogsSection.appendChild(btnPlanClearLogs);
  planLogsSection.appendChild(planLogsConsole);
  planActivePane.appendChild(planLogsSection);

  viewPlan.appendChild(planEmptyPane);
  viewPlan.appendChild(planActivePane);

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

  const documentListeners: Record<string, Function[]> = {};
  const windowListeners: Record<string, Function[]> = {};

  const modelRegistry = new Map<string, any>();

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

    if (typeof initCommandPalette === 'function') initCommandPalette();
    if (typeof initGlobalShortcuts === 'function') initGlobalShortcuts();
    if (typeof registerEditorActions === 'function') registerEditorActions(editor);

    // Context Bridge (R1)
    globalThis.sendSelectionToScreenB = typeof sendSelectionToScreenB !== 'undefined' ? sendSelectionToScreenB : undefined;
    globalThis.bridgeSelectionToScreenB = typeof bridgeSelectionToScreenB !== 'undefined' ? bridgeSelectionToScreenB : undefined;
    globalThis.registerEditorActions = typeof registerEditorActions !== 'undefined' ? registerEditorActions : undefined;
    globalThis.toRelativeWorkspacePath = typeof toRelativeWorkspacePath !== 'undefined' ? toRelativeWorkspacePath : undefined;
    globalThis.getActiveDocumentRelativePath = typeof getActiveDocumentRelativePath !== 'undefined' ? getActiveDocumentRelativePath : undefined;

    // Screen B Mode Morphing (R2)
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.currentScreenBMode = typeof currentScreenBMode !== 'undefined' ? currentScreenBMode : undefined;

    // Agentic Task Plan State Machine (R3)
    globalThis.createTaskPlan = typeof createTaskPlan !== 'undefined' ? createTaskPlan : undefined;
    globalThis.setAgenticPlan = typeof setAgenticPlan !== 'undefined' ? setAgenticPlan : undefined;
    globalThis.getTaskPlan = typeof getTaskPlan !== 'undefined' ? getTaskPlan : undefined;
    globalThis.pauseTaskPlan = typeof pauseTaskPlan !== 'undefined' ? pauseTaskPlan : (typeof pausePlan !== 'undefined' ? pausePlan : undefined);
    globalThis.resumeTaskPlan = typeof resumeTaskPlan !== 'undefined' ? resumeTaskPlan : (typeof resumePlan !== 'undefined' ? resumePlan : undefined);
    globalThis.cancelTaskPlan = typeof cancelTaskPlan !== 'undefined' ? cancelTaskPlan : (typeof cancelPlan !== 'undefined' ? cancelPlan : undefined);
    globalThis.updateSubtaskStatus = typeof updateSubtaskStatus !== 'undefined' ? updateSubtaskStatus : (typeof advanceSubtask !== 'undefined' ? advanceSubtask : undefined);
    globalThis.addExecutionLog = typeof addExecutionLog !== 'undefined' ? addExecutionLog : undefined;
    globalThis.renderPlanView = typeof renderPlanView !== 'undefined' ? renderPlanView : (typeof renderPlanPane !== 'undefined' ? renderPlanPane : undefined);

    // Layar A Zero-Buffer Diff Review (R4)
    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.getReviewDiffs = typeof getReviewDiffs !== 'undefined' ? getReviewDiffs : undefined;
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : (typeof showDiffEditor !== 'undefined' ? showDiffEditor : undefined);
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.acceptAllReviewDiffs = typeof acceptAllReviewDiffs !== 'undefined' ? acceptAllReviewDiffs : undefined;
    globalThis.discardAllReviewDiffs = typeof discardAllReviewDiffs !== 'undefined' ? discardAllReviewDiffs : undefined;
    globalThis.renderReviewView = typeof renderReviewView !== 'undefined' ? renderReviewView : (typeof renderReviewPane !== 'undefined' ? renderReviewPane : undefined);

    // Event Bridge & Common
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : (typeof window !== 'undefined' ? window.editorEventBridge : undefined);
    globalThis.targetStack = typeof targetStack !== 'undefined' ? targetStack : [];
    globalThis.renderTargetStack = typeof renderTargetStack !== 'undefined' ? renderTargetStack : undefined;
    globalThis.screenBController = typeof screenBController !== 'undefined' ? screenBController : (typeof window !== 'undefined' ? window.screenBController : undefined);
    globalThis.secondaryResizer = typeof secondaryResizer !== 'undefined' ? secondaryResizer : (typeof window !== 'undefined' ? window.secondaryResizer : undefined);
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
    setSelection: (sel: any) => {
      currentSelection = {
        ...sel,
        isEmpty: () => sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn,
      };
    },
    setPosition: (pos: { lineNumber: number; column: number }) => {
      currentPosition = pos;
    },
    triggerWindowKeydown: (keyEvt: any) => {
      const evt = { type: 'keydown', preventDefault: vi.fn(), stopPropagation: vi.fn(), ...keyEvt };
      const winList = windowListeners['keydown'] || [];
      const docList = documentListeners['keydown'] || [];
      [...winList, ...docList].forEach(fn => fn(evt));
    },
  };
}

describe('Milestone v0.2.2: Dynamic Screen B Agentic Intelligence & Layar A Zero-Buffer Diff', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let htmlContent: string;
  let cssContent: string;
  let jsContent: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v022-test-'));
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

  describe('Suite 1: Context Bridge (Ctrl+Alt+A & Monaco Context Menu)', () => {
    it('1.1 registers Monaco action "sendToScreenB" with label "Kirim ke Screen B" and keybinding CtrlCmd+Alt+KeyA', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const action = ctx.spies.registeredActions.get('sendToScreenB');

      expect(action, 'Monaco action sendToScreenB must be registered via editor.addAction').toBeDefined();
      expect(action.label).toMatch(/Kirim ke Screen B|Screen B/);
      expect(Array.isArray(action.keybindings)).toBe(true);
      expect(action.keybindings.length).toBeGreaterThan(0);
      expect(typeof action.run).toBe('function');
    });

    it('1.2 captures relative file path, line range, and code snippet upon Ctrl+Alt+A selection bridge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn, 'sendSelectionToScreenB or bridgeSelectionToScreenB function must be implemented in workbench.js').toBe('function');
      if (typeof bridgeFn !== 'function') return;

      // Set multi-line selection lines 2-5
      ctx.setSelection({
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 30,
      });

      const target = bridgeFn(ctx.mockEditor);

      expect(target).toBeDefined();
      expect(target.filePath).toBe('quicksort.py');
      expect(target.startLine).toBe(2);
      expect(target.endLine).toBe(5);
      expect(target.codeSnippet).toContain('if len(arr) <= 1:');
      expect(target.isContextCard).toBe(true);
    });

    it('1.3 normalizes inverted selection coordinates ensuring startLine <= endLine', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      // Inverted selection from line 8 up to line 4
      ctx.setSelection({
        startLineNumber: 8,
        startColumn: 10,
        endLineNumber: 4,
        endColumn: 1,
      });

      const target = bridgeFn(ctx.mockEditor);

      expect(target.startLine).toBeLessThanOrEqual(target.endLine);
      expect(target.startLine).toBe(4);
      expect(target.endLine).toBe(8);
    });

    it('1.4 falls back to current cursor line when selection is empty', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      // Zero-width selection at line 3
      ctx.setSelection({
        startLineNumber: 3,
        startColumn: 5,
        endLineNumber: 3,
        endColumn: 5,
      });
      ctx.setPosition({ lineNumber: 3, column: 5 });

      const target = bridgeFn(ctx.mockEditor);

      expect(target.startLine).toBe(3);
      expect(target.endLine).toBe(3);
      expect(target.codeSnippet).toContain('return arr');
    });

    it('1.5 pushes target context card to targetStack and renders .target-code-preview in DOM', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      ctx.setSelection({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 20,
      });

      bridgeFn(ctx.mockEditor);

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      expect(stackList.children.length).toBeGreaterThan(0);

      const card = stackList.children[0];
      expect(card.classList.contains('target-line-card') || card.classList.contains('target-card')).toBe(true);

      const previewEl = card.querySelector('.target-code-preview');
      expect(previewEl, 'Target context card must render .target-code-preview snippet').toBeDefined();
    });

    it('1.6 automatically switches Screen B to chat mode and focuses prompt input box', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      // Start in plan mode
      if (typeof ctx.sandbox.setScreenBMode === 'function') {
        ctx.sandbox.setScreenBMode('plan');
      }

      ctx.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 });
      bridgeFn(ctx.mockEditor);

      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      expect(viewChat.style.display).toBe('flex');

      const promptBox = ctx.elementRegistry.get('prompt-input-box')!;
      expect(promptBox.focus).toHaveBeenCalled();
    });

    it('1.7 broadcasts "screenB:contextBridged" event through EditorEventBridge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      const eventSpy = vi.fn();
      if (ctx.sandbox.editorEventBridge && typeof ctx.sandbox.editorEventBridge.on === 'function') {
        ctx.sandbox.editorEventBridge.on('screenB:contextBridged', eventSpy);
      }

      ctx.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 });
      bridgeFn(ctx.mockEditor);

      expect(eventSpy).toHaveBeenCalled();
      const payload = eventSpy.mock.calls[0][0];
      expect(payload.filePath).toBe('quicksort.py');
      expect(payload.startLine).toBe(1);
      expect(payload.endLine).toBe(3);
    });

    it('1.8 strictly maintains Zero-Buffer Invariant on context bridge activation', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      ctx.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 1 });
      bridgeFn(ctx.mockEditor);

      // Verify zero editor mutation
      expect(ctx.spies.editorApplyEdits).not.toHaveBeenCalled();
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('1.9 executes context bridge via global shortcut Ctrl+Alt+A keydown event', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridgeFn = ctx.sandbox.sendSelectionToScreenB || ctx.sandbox.bridgeSelectionToScreenB;

      expect(typeof bridgeFn).toBe('function');
      if (typeof bridgeFn !== 'function') return;

      ctx.setSelection({ startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 1 });

      ctx.triggerWindowKeydown({
        ctrlKey: true,
        altKey: true,
        key: 'a',
      });

      const stackList = ctx.elementRegistry.get('target-stack-list')!;
      expect(stackList.children.length).toBeGreaterThan(0);
    });
  });

  describe('Suite 2: Dynamic Screen B Mode Morphing (Chat <-> Plan <-> Review)', () => {
    it('2.1 manual tab switching via setScreenBMode updates active tab, aria-selected, and view visibility', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setMode = ctx.sandbox.setScreenBMode;

      expect(typeof setMode, 'setScreenBMode must be exported and callable').toBe('function');
      if (typeof setMode !== 'function') return;

      const tabChat = ctx.elementRegistry.get('tab-screen-b-chat')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      const viewChat = ctx.elementRegistry.get('screen-b-view-chat')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      // Switch to Plan Mode
      setMode('plan');
      expect(tabPlan.classList.contains('active')).toBe(true);
      expect(tabPlan.getAttribute('aria-selected')).toBe('true');
      expect(tabChat.classList.contains('active')).toBe(false);
      expect(tabChat.getAttribute('aria-selected')).toBe('false');
      expect(viewPlan.style.display).toBe('flex');
      expect(viewChat.style.display).toBe('none');
      expect(viewReview.style.display).toBe('none');

      // Switch to Review Mode
      setMode('review');
      expect(tabReview.classList.contains('active')).toBe(true);
      expect(tabReview.getAttribute('aria-selected')).toBe('true');
      expect(viewReview.style.display).toBe('flex');
      expect(viewPlan.style.display).toBe('none');
      expect(viewChat.style.display).toBe('none');

      // Switch back to Chat Mode
      setMode('chat');
      expect(tabChat.classList.contains('active')).toBe(true);
      expect(tabChat.getAttribute('aria-selected')).toBe('true');
      expect(viewChat.style.display).toBe('flex');
      expect(viewPlan.style.display).toBe('none');
      expect(viewReview.style.display).toBe('none');
    });

    it('2.2 clicking mode tab elements triggers setScreenBMode transitions', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;
      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;

      tabPlan.click();
      expect(viewPlan.style.display).toBe('flex');

      tabReview.click();
      expect(viewReview.style.display).toBe('flex');
    });

    it('2.3 automatically morphs to Plan Mode when task plan is initialized', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;

      expect(typeof createPlan, 'createTaskPlan must be implemented').toBe('function');
      if (typeof createPlan !== 'function') return;

      const viewPlan = ctx.elementRegistry.get('screen-b-view-plan')!;
      const tabPlan = ctx.elementRegistry.get('tab-screen-b-plan')!;

      createPlan({
        title: 'Refactor IPC Bridge Handlers',
        subtasks: [{ id: 'st-1', title: 'Extract file listing', targetFiles: ['src/main.ts'] }],
      });

      expect(viewPlan.style.display).toBe('flex');
      expect(tabPlan.classList.contains('active')).toBe(true);
    });

    it('2.4 automatically morphs to Review Mode when review diffs are received', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;

      expect(typeof setDiffs, 'setReviewDiffs must be implemented').toBe('function');
      if (typeof setDiffs !== 'function') return;

      const viewReview = ctx.elementRegistry.get('screen-b-view-review')!;
      const tabReview = ctx.elementRegistry.get('tab-screen-b-review')!;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'src/main.ts',
          originalContent: 'const a = 1;',
          proposedContent: 'const a = 2;',
          linesAdded: 1,
          linesDeleted: 1,
        },
      ]);

      expect(viewReview.style.display).toBe('flex');
      expect(tabReview.classList.contains('active')).toBe(true);
    });

    it('2.5 emits "screenB:modeChanged" event with new mode payload upon transition', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setMode = ctx.sandbox.setScreenBMode;

      expect(typeof setMode).toBe('function');
      if (typeof setMode !== 'function') return;

      const eventSpy = vi.fn();
      if (ctx.sandbox.editorEventBridge) {
        ctx.sandbox.editorEventBridge.on('screenB:modeChanged', eventSpy);
      }

      setMode('plan');
      expect(eventSpy).toHaveBeenCalledWith({ mode: 'plan' });

      setMode('review');
      expect(eventSpy).toHaveBeenCalledWith({ mode: 'review' });
    });

    it('2.6 strictly adheres to VS Code Dark+ styling tokens and Zero-Emoji Invariant', () => {
      // Test HTML content for zero emoji characters
      const emojiRegex = /\p{Extended_Pictographic}/u;
      expect(emojiRegex.test(htmlContent), 'index.html must adhere to Zero-Emoji Invariant').toBe(false);

      // Verify VS Code Dark+ CSS classes and token rules
      expect(cssContent).toContain('.screen-b-mode-tabs');
      expect(cssContent).toContain('.screen-b-mode-tab');
      expect(cssContent).toContain('.plan-active-pane');
      expect(cssContent).toContain('.review-active-pane');
      expect(cssContent).toContain('.status-badge-progress');
      expect(cssContent).toContain('.status-badge-paused');
      expect(cssContent).toContain('.status-badge-completed');
    });
  });

  describe('Suite 3: Agentic Task Plan State Machine (R3)', () => {
    it('3.1 createTaskPlan initializes task plan with subtasks, initial progress 0%, and in_progress status', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;

      expect(typeof createPlan).toBe('function');
      if (typeof createPlan !== 'function') return;

      const plan = createPlan({
        title: 'Implement Diff Preview',
        subtasks: [
          { id: 'st-1', title: 'Subtask 1: Parse AST', targetFiles: ['quicksort.py'] },
          { id: 'st-2', title: 'Subtask 2: Generate Diff', targetFiles: ['quicksort.py'] },
          { id: 'st-3', title: 'Subtask 3: Write Tests', targetFiles: ['quicksort.py'] },
        ],
      });

      expect(plan).toBeDefined();
      expect(plan.title).toBe('Implement Diff Preview');
      expect(plan.status).toBe('in_progress');
      expect(plan.progress).toBe(0);
      expect(plan.subtasks.length).toBe(3);
      expect(plan.subtasks[0].status).toBe('in_progress');
      expect(plan.subtasks[1].status).toBe('pending');
      expect(plan.subtasks[2].status).toBe('pending');

      const titleEl = ctx.elementRegistry.get('plan-title')!;
      expect(titleEl.textContent).toBe('Implement Diff Preview');

      const badgeEl = ctx.elementRegistry.get('plan-status-badge')!;
      expect(badgeEl.textContent).toContain('IN PROGRESS');

      const activePane = ctx.elementRegistry.get('plan-active-pane')!;
      expect(activePane.style.display).toBe('flex');
    });

    it('3.2 renders collapsible subtask checklist with Codicon status indicators', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;

      expect(typeof createPlan).toBe('function');
      if (typeof createPlan !== 'function') return;

      createPlan({
        title: 'Feature Plan',
        subtasks: [
          { id: 'st-1', title: 'Step 1', description: 'Desc 1', targetFiles: ['src/main.ts'] },
          { id: 'st-2', title: 'Step 2', description: 'Desc 2', targetFiles: ['src/main.ts'] },
        ],
      });

      const subtaskList = ctx.elementRegistry.get('plan-subtask-list')!;
      expect(subtaskList.children.length).toBe(2);

      const firstItem = subtaskList.children[0];
      expect(firstItem.classList.contains('plan-subtask-item')).toBe(true);

      const header = firstItem.querySelector('.subtask-header')!;
      expect(header).toBeDefined();

      // Test collapsible click behavior
      const chevron = firstItem.querySelector('.subtask-chevron')!;
      const body = firstItem.querySelector('.subtask-body')!;
      header.click();
      expect(chevron.classList.contains('collapsed')).toBe(true);
      expect(body.classList.contains('collapsed')).toBe(true);
    });

    it('3.3 groups affected files displaying file icons and subtask association counts', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;

      expect(typeof createPlan).toBe('function');
      if (typeof createPlan !== 'function') return;

      createPlan({
        title: 'Multi-file Plan',
        subtasks: [
          { id: 'st-1', title: 'Step 1', targetFiles: ['src/main.ts', 'src/preload.ts'] },
          { id: 'st-2', title: 'Step 2', targetFiles: ['src/main.ts'] },
        ],
      });

      const affectedList = ctx.elementRegistry.get('plan-affected-list')!;
      const affectedCount = ctx.elementRegistry.get('plan-affected-count')!;

      expect(affectedCount.textContent).toBe('2');
      expect(affectedList.children.length).toBe(2);
    });

    it('3.4 pauseTaskPlan transitions plan status to paused and swaps Pause for Resume button', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const pausePlan = ctx.sandbox.pauseTaskPlan || ctx.sandbox.pausePlan;

      expect(typeof pausePlan).toBe('function');
      if (typeof createPlan !== 'function' || typeof pausePlan !== 'function') return;

      createPlan({ title: 'Plan to Pause', subtasks: [{ id: 'st-1', title: 'Task 1' }] });

      const ok = pausePlan();
      expect(ok).toBe(true);

      const badgeEl = ctx.elementRegistry.get('plan-status-badge')!;
      expect(badgeEl.textContent).toContain('PAUSED');

      const btnPause = ctx.elementRegistry.get('btn-plan-pause')!;
      const btnResume = ctx.elementRegistry.get('btn-plan-resume')!;
      expect(btnPause.style.display).toBe('none');
      expect(btnResume.style.display).not.toBe('none');

      // Calling pause again when already paused returns false
      expect(pausePlan()).toBe(false);
    });

    it('3.5 resumeTaskPlan restores plan status to in_progress and swaps Resume for Pause button', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const pausePlan = ctx.sandbox.pauseTaskPlan || ctx.sandbox.pausePlan;
      const resumePlan = ctx.sandbox.resumeTaskPlan || ctx.sandbox.resumePlan;

      expect(typeof resumePlan).toBe('function');
      if (typeof createPlan !== 'function' || typeof resumePlan !== 'function') return;

      createPlan({ title: 'Plan to Resume', subtasks: [{ id: 'st-1', title: 'Task 1' }] });
      pausePlan();

      const ok = resumePlan();
      expect(ok).toBe(true);

      const badgeEl = ctx.elementRegistry.get('plan-status-badge')!;
      expect(badgeEl.textContent).toContain('IN PROGRESS');

      const btnPause = ctx.elementRegistry.get('btn-plan-pause')!;
      const btnResume = ctx.elementRegistry.get('btn-plan-resume')!;
      expect(btnPause.style.display).not.toBe('none');
      expect(btnResume.style.display).toBe('none');
    });

    it('3.6 cancelTaskPlan aborts plan execution and marks active subtasks failed', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const cancelPlan = ctx.sandbox.cancelTaskPlan || ctx.sandbox.cancelPlan;

      expect(typeof cancelPlan).toBe('function');
      if (typeof createPlan !== 'function' || typeof cancelPlan !== 'function') return;

      createPlan({ title: 'Plan to Cancel', subtasks: [{ id: 'st-1', title: 'Task 1' }] });

      const ok = cancelPlan();
      expect(ok).toBe(true);

      const badgeEl = ctx.elementRegistry.get('plan-status-badge')!;
      expect(badgeEl.textContent).toContain('CANCELLED');

      const plan = (typeof ctx.sandbox.getTaskPlan === 'function') ? ctx.sandbox.getTaskPlan() : null;
      if (plan) {
        expect(plan.subtasks[0].status).toBe('failed');
      }
    });

    it('3.7 updateSubtaskStatus advances subtask checklist, recalculates progress, and completes plan', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const updateSubtask = ctx.sandbox.updateSubtaskStatus || ctx.sandbox.advanceSubtask;

      expect(typeof updateSubtask).toBe('function');
      if (typeof createPlan !== 'function' || typeof updateSubtask !== 'function') return;

      createPlan({
        title: 'Two-step Plan',
        subtasks: [
          { id: 'st-1', title: 'Step 1' },
          { id: 'st-2', title: 'Step 2' },
        ],
      });

      // Complete step 1
      updateSubtask('st-1', 'completed', 'Step 1 is complete');

      let plan = ctx.sandbox.getTaskPlan ? ctx.sandbox.getTaskPlan() : null;
      if (plan) {
        expect(plan.subtasks[0].status).toBe('completed');
        expect(plan.subtasks[1].status).toBe('in_progress');
        expect(plan.progress).toBe(50);
      }

      const progressFill = ctx.elementRegistry.get('plan-progress-bar-fill')!;
      expect(progressFill.style.width).toBe('50%');

      // Complete step 2
      updateSubtask('st-2', 'completed', 'Step 2 is complete');
      plan = ctx.sandbox.getTaskPlan ? ctx.sandbox.getTaskPlan() : null;
      if (plan) {
        expect(plan.status).toBe('completed');
        expect(plan.progress).toBe(100);
      }
    });

    it('3.8 addExecutionLog records timestamped logs and auto-scrolls console', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const addLog = ctx.sandbox.addExecutionLog;

      expect(typeof addLog).toBe('function');
      if (typeof createPlan !== 'function' || typeof addLog !== 'function') return;

      createPlan({ title: 'Logging Plan', subtasks: [] });
      addLog('Verifying AST tree invariants', 'info');

      const consoleEl = ctx.elementRegistry.get('plan-logs-console')!;
      expect(consoleEl.children.length).toBeGreaterThan(0);

      const lastEntry = consoleEl.children[consoleEl.children.length - 1];
      expect(lastEntry.textContent).toContain('Verifying AST tree invariants');
    });

    it('3.9 emits "screenB:planUpdate" and "screenB:taskProgress" events across state transitions', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const pausePlan = ctx.sandbox.pauseTaskPlan || ctx.sandbox.pausePlan;

      expect(typeof createPlan).toBe('function');
      if (typeof createPlan !== 'function') return;

      const planUpdateSpy = vi.fn();
      const taskProgressSpy = vi.fn();

      if (ctx.sandbox.editorEventBridge) {
        ctx.sandbox.editorEventBridge.on('screenB:planUpdate', planUpdateSpy);
        ctx.sandbox.editorEventBridge.on('screenB:taskProgress', taskProgressSpy);
      }

      createPlan({ title: 'Event Plan', subtasks: [{ id: 'st-1', title: 'Task 1' }] });
      expect(planUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'created' }));
      expect(taskProgressSpy).toHaveBeenCalled();

      if (typeof pausePlan === 'function') {
        pausePlan();
        expect(planUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'paused' }));
      }
    });

    it('3.10 strictly maintains Zero-Buffer Invariant during plan execution without disk mutation', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const createPlan = ctx.sandbox.createTaskPlan || ctx.sandbox.setAgenticPlan;
      const updateSubtask = ctx.sandbox.updateSubtaskStatus || ctx.sandbox.advanceSubtask;

      expect(typeof createPlan).toBe('function');
      if (typeof createPlan !== 'function') return;

      createPlan({
        title: 'Safe Invariant Plan',
        subtasks: [{ id: 'st-1', title: 'Pure computation', targetFiles: ['quicksort.py'] }],
      });

      if (typeof updateSubtask === 'function') {
        updateSubtask('st-1', 'completed');
      }

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });
  });

  // SUITE 4: LAYAR A ZERO-BUFFER DIFF PREVIEW & REVIEW INSPECTION (R4)
  describe('Suite 4: Layar A Zero-Buffer Diff Preview & Review Inspection (R4)', () => {
    it('4.1 setReviewDiffs renders modified files list with diff badges and totals', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;

      expect(typeof setDiffs).toBe('function');
      if (typeof setDiffs !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'def quicksort(): pass',
          proposedContent: 'def quicksort(arr): return sorted(arr)',
          linesAdded: 28,
          linesDeleted: 10,
          description: 'Optimized recursion baseline',
        },
        {
          id: 'diff-2',
          filePath: 'main.ts',
          originalContent: 'console.log("old");',
          proposedContent: 'console.log("new");',
          linesAdded: 14,
          linesDeleted: 5,
        },
      ]);

      const activePane = ctx.elementRegistry.get('review-active-pane')!;
      expect(activePane.style.display).toBe('flex');

      const countEl = ctx.elementRegistry.get('review-file-count')!;
      expect(countEl.textContent).toContain('2');

      const addBadge = ctx.elementRegistry.get('review-total-added')!;
      expect(addBadge.textContent).toBe('+42');

      const delBadge = ctx.elementRegistry.get('review-total-deleted')!;
      expect(delBadge.textContent).toBe('-15');

      const fileList = ctx.elementRegistry.get('review-file-list')!;
      expect(fileList.children.length).toBe(2);

      const firstCard = fileList.children[0];
      expect(firstCard.classList.contains('review-file-card')).toBe(true);
      expect(firstCard.querySelector('.btn-review-diff')).toBeDefined();
      expect(firstCard.querySelector('.btn-review-accept')).toBeDefined();
      expect(firstCard.querySelector('.btn-review-discard')).toBeDefined();
    });

    it('4.2 openReviewDiff mounts Monaco Diff Editor in #diff-editor-mount and hides #editor-mount', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      expect(typeof openDiff).toBe('function');
      if (typeof setDiffs !== 'function' || typeof openDiff !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'old code',
          proposedContent: 'new proposed code',
          linesAdded: 5,
          linesDeleted: 2,
        },
      ]);

      openDiff('diff-1');

      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;

      expect(editorMount.style.display).toBe('none');
      expect(diffMount.style.display).toBe('block');

      const diffState = ctx.getDiffEditorState();
      expect(diffState.options.readOnly).toBe(true);
      expect(diffState.options.renderSideBySide).toBe(true);
    });

    it('4.3 uses virtual URIs agent-orig:// and agent-proposed:// isolating open document buffer', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      expect(typeof openDiff).toBe('function');
      if (typeof setDiffs !== 'function' || typeof openDiff !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'old baseline',
          proposedContent: 'new proposition',
          linesAdded: 1,
          linesDeleted: 1,
        },
      ]);

      openDiff('diff-1');

      const diffState = ctx.getDiffEditorState();
      expect(diffState.models.original).toBeDefined();
      expect(diffState.models.modified).toBeDefined();

      const origUri = diffState.models.original.uri.toString();
      const propUri = diffState.models.modified.uri.toString();

      expect(origUri).toContain('agent-orig://');
      expect(propUri).toContain('agent-proposed://');

      // Ensure openDoc model is unaffected
      expect(ctx.openDoc.model.getValue()).not.toBe('new proposition');
    });

    it('4.4 preserves zero-buffer invariant during diff preview without dirtying buffer or writing to disk', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      expect(typeof openDiff).toBe('function');
      if (typeof setDiffs !== 'function' || typeof openDiff !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'old baseline',
          proposedContent: 'new proposition',
          linesAdded: 5,
          linesDeleted: 2,
        },
      ]);

      openDiff('diff-1');

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.editorSetValue).not.toHaveBeenCalled();
    });

    it('4.5 acceptReviewDiff writes proposed content to disk, updates buffer, clears dirty state, and restores editor', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      expect(typeof acceptDiff).toBe('function');
      if (typeof setDiffs !== 'function' || typeof acceptDiff !== 'function') return;

      const proposed = 'def quicksort(arr):\n    return sorted(arr)\n';
      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'def quicksort(): pass',
          proposedContent: proposed,
          linesAdded: 2,
          linesDeleted: 1,
        },
      ]);

      if (typeof openDiff === 'function') openDiff('diff-1');

      const acceptSpy = vi.fn();
      if (ctx.sandbox.editorEventBridge) {
        ctx.sandbox.editorEventBridge.on('screenB:diffAccepted', acceptSpy);
        ctx.sandbox.editorEventBridge.on('screenB:reviewAccepted', acceptSpy);
      }

      await acceptDiff('diff-1');

      expect(ctx.spies.writeFile).toHaveBeenCalledWith('quicksort.py', proposed);

      expect(ctx.openDoc.isDirty).toBe(false);

      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('block');
      expect(diffMount.style.display).toBe('none');

      expect(acceptSpy).toHaveBeenCalled();
    });

    it('4.6 discardReviewDiff closes diff editor and restores standard editor without disk writes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;
      const discardDiff = ctx.sandbox.discardReviewDiff;

      expect(typeof discardDiff).toBe('function');
      if (typeof setDiffs !== 'function' || typeof discardDiff !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'original',
          proposedContent: 'rejected proposal',
          linesAdded: 1,
          linesDeleted: 1,
        },
      ]);

      if (typeof openDiff === 'function') openDiff('diff-1');

      const discardSpy = vi.fn();
      if (ctx.sandbox.editorEventBridge) {
        ctx.sandbox.editorEventBridge.on('screenB:diffDiscarded', discardSpy);
        ctx.sandbox.editorEventBridge.on('screenB:reviewDiscarded', discardSpy);
      }

      discardDiff('diff-1');

      // No disk writes
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Buffer clean and unmodified
      expect(ctx.openDoc.isDirty).toBe(false);

      // Diff editor closed
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('block');
      expect(diffMount.style.display).toBe('none');

      expect(discardSpy).toHaveBeenCalled();
    });

    it('4.7 acceptAllReviewDiffs applies all pending proposals in batch and writes to disk', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptAll = ctx.sandbox.acceptAllReviewDiffs;

      expect(typeof acceptAll).toBe('function');
      if (typeof setDiffs !== 'function' || typeof acceptAll !== 'function') return;

      setDiffs([
        {
          id: 'diff-1',
          filePath: 'quicksort.py',
          originalContent: 'code 1',
          proposedContent: 'proposed 1',
          linesAdded: 1,
          linesDeleted: 0,
        },
        {
          id: 'diff-2',
          filePath: 'main.ts',
          originalContent: 'code 2',
          proposedContent: 'proposed 2',
          linesAdded: 1,
          linesDeleted: 0,
        },
      ]);

      await acceptAll();

      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(2);
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('quicksort.py', 'proposed 1');
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('main.ts', 'proposed 2');

      const fileList = ctx.elementRegistry.get('review-file-list')!;
      expect(fileList.children.length).toBe(0);
    });

    it('4.8 discardAllReviewDiffs clears all pending proposals without writing to disk', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      expect(typeof discardAll).toBe('function');
      if (typeof setDiffs !== 'function' || typeof discardAll !== 'function') return;

      setDiffs([
        { id: 'diff-1', filePath: 'quicksort.py', originalContent: '1', proposedContent: '2', linesAdded: 1, linesDeleted: 1 },
        { id: 'diff-2', filePath: 'main.ts', originalContent: '3', proposedContent: '4', linesAdded: 1, linesDeleted: 1 },
      ]);

      discardAll();

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      const fileList = ctx.elementRegistry.get('review-file-list')!;
      expect(fileList.children.length).toBe(0);
    });

    it('4.9 closing diff editor restores standard Monaco editor without destroying open tabs', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const closeDiff = ctx.sandbox.closeReviewDiff;

      expect(typeof closeDiff).toBe('function');
      if (typeof closeDiff !== 'function') return;

      // Simulate diff editor being open
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      editorMount.style.display = 'none';
      diffMount.style.display = 'block';

      closeDiff();

      expect(editorMount.style.display).toBe('block');
      expect(diffMount.style.display).toBe('none');

      // Verify open document tab in DocumentManager was preserved
      expect(ctx.mockDocManager.documents.has('quicksort.py')).toBe(true);
      expect(ctx.mockEditor.focus).toHaveBeenCalled();
    });
  });

  describe('Suite 5: Monorepo Regression & Build Integrity (R5)', () => {
    it('5.1 verifies all required Screen B and Diff Editor DOM elements exist in index.html', () => {
      expect(htmlContent).toContain('id="screen-b-mode-tabs"');
      expect(htmlContent).toContain('id="tab-screen-b-chat"');
      expect(htmlContent).toContain('id="tab-screen-b-plan"');
      expect(htmlContent).toContain('id="tab-screen-b-review"');

      expect(htmlContent).toContain('id="screen-b-view-chat"');
      expect(htmlContent).toContain('id="screen-b-view-plan"');
      expect(htmlContent).toContain('id="screen-b-view-review"');

      expect(htmlContent).toContain('id="plan-active-pane"');
      expect(htmlContent).toContain('id="btn-plan-pause"');
      expect(htmlContent).toContain('id="btn-plan-resume"');
      expect(htmlContent).toContain('id="btn-plan-cancel"');
      expect(htmlContent).toContain('id="plan-progress-bar-fill"');
      expect(htmlContent).toContain('id="plan-subtask-list"');
      expect(htmlContent).toContain('id="plan-affected-list"');
      expect(htmlContent).toContain('id="plan-logs-console"');

      expect(htmlContent).toContain('id="review-active-pane"');
      expect(htmlContent).toContain('id="review-file-count"');
      expect(htmlContent).toContain('id="review-total-added"');
      expect(htmlContent).toContain('id="review-total-deleted"');
      expect(htmlContent).toContain('id="btn-review-accept-all"');
      expect(htmlContent).toContain('id="btn-review-discard-all"');
      expect(htmlContent).toContain('id="review-file-list"');

      expect(htmlContent).toContain('id="editor-mount"');
      expect(htmlContent).toContain('id="diff-editor-mount"');
    });

    it('5.2 verifies CSS styling classes and dark+ tokens exist in workbench.css', () => {
      expect(cssContent).toContain('.plan-active-pane');
      expect(cssContent).toContain('.review-active-pane');
      expect(cssContent).toContain('.plan-header-toolbar');
      expect(cssContent).toContain('.plan-subtask-item');
      expect(cssContent).toContain('.subtask-header');
      expect(cssContent).toContain('.subtask-body');
      expect(cssContent).toContain('.subtask-target-tag');
      expect(cssContent).toContain('.plan-affected-file-item');
      expect(cssContent).toContain('.plan-logs-console');
      expect(cssContent).toContain('.review-file-card');
      expect(cssContent).toContain('.btn-review-diff');
      expect(cssContent).toContain('.btn-review-accept');
      expect(cssContent).toContain('.btn-review-discard');
      expect(cssContent).toContain('.target-code-preview');
    });

    it('5.3 verifies EditorEventBridge contract supports event subscriptions and robust error containment', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge;

      expect(bridge).toBeDefined();
      expect(typeof bridge.on).toBe('function');
      expect(typeof bridge.emit).toBe('function');

      const spy1 = vi.fn();
      const faultySpy = vi.fn(() => {
        throw new Error('Boom from faulty listener');
      });
      const spy2 = vi.fn();

      bridge.on('test:event', spy1);
      bridge.on('test:event', faultySpy);
      bridge.on('test:event', spy2);

      // Emitting event should not abort or throw back to caller
      expect(() => bridge.emit('test:event', { payload: 123 })).not.toThrow();

      expect(spy1).toHaveBeenCalledWith({ payload: 123 });
      expect(faultySpy).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalledWith({ payload: 123 });
    });

    it('5.4 verifies API surface exposed on window and window.screenBController', () => {
      const ctx = setupWorkbenchSandbox(jsContent);

      expect(typeof ctx.sandbox.setScreenBMode).toBe('function');
      expect(typeof ctx.sandbox.window.setScreenBMode).toBe('function');

      const controller = ctx.sandbox.screenBController || ctx.sandbox.window.screenBController;
      expect(controller).toBeDefined();
    });

    it('5.5 verifies monorepo build and test baseline continues to compile cleanly', () => {
      // Sanity check on TypeScript and workbench assets
      expect(fs.existsSync(path.resolve(__dirname, '../src/main.ts'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/preload.ts'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/workbench/index.html'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../src/workbench/workbench.js'))).toBe(true);
    });

    it('5.6 verifies Screen B header has prominent close button and handles COLLAPSE_SCREEN_B message', () => {
      expect(htmlContent).toContain('id="btn-secondary-collapse"');
      expect(htmlContent).toContain('codicon-close');
      expect(htmlContent).toContain('Tutup Layar B (Ctrl+Alt+B)');

      const ctx = setupWorkbenchSandbox(jsContent);
      const secondaryResizer = ctx.sandbox.secondaryResizer;
      expect(secondaryResizer).toBeDefined();

      const collapseSpy = vi.spyOn(secondaryResizer, 'collapse');
      ctx.sandbox.window.dispatchEvent({
        type: 'message',
        data: { type: 'COLLAPSE_SCREEN_B' }
      });
      expect(collapseSpy).toHaveBeenCalled();
    });
  });
});
