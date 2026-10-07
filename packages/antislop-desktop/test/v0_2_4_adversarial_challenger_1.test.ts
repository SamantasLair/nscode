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
      getVersion: () => '0.2.4',
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

    const disabledMatch = attrsStr.match(/\bdisabled\b/);
    if (disabledMatch) {
      el.disabled = true;
      el.setAttribute('disabled', '');
    }

    const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
    let dataMatch: RegExpExecArray | null;
    while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      el.dataset[key] = dataMatch[2];
      el.setAttribute(`data-${dataMatch[1]}`, dataMatch[2]);
    }

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
      if (children.length > 0 && !rawHtml) {
        return children.map(c => {
          const t = c.tagName.toLowerCase();
          const cls = c.className ? ` class="${c.className}"` : '';
          const i = c.id ? ` id="${c.id}"` : '';
          return `<${t}${cls}${i}>${c.innerHTML || c.textContent}</${t}>`;
        }).join('');
      }
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
    getAttribute: (attr: string) => {
      if (attr === 'disabled' && el.disabled) return '';
      return attributes[attr] ?? (attr === 'id' ? el.id : (attr === 'class' ? el.className : null));
    },
    setAttribute: (attr: string, val: string) => {
      attributes[attr] = String(val);
      if (attr === 'id') el.id = String(val);
      if (attr === 'class') el.className = String(val);
      if (attr === 'disabled') el.disabled = true;
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
      if (el.disabled) {
        return; // Disabled buttons reject click events
      }
      el.dispatchEvent({ type: 'click' });
    },
  };

  return el;
}

export function setupAdversarialSandbox(jsContent: string) {
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
  const statusGate = getOrCreateEl('status-gate');
  statusGate.className = 'status-item';
  const gateLockIcon = getOrCreateEl('gate-lock-icon', 'span');
  gateLockIcon.className = 'codicon codicon-lock';
  const gateStatusText = getOrCreateEl('gate-status-text', 'span');
  gateStatusText.className = 'status-text';
  gateStatusText.textContent = 'Gate: LOCKED';
  statusGate.appendChild(gateLockIcon);
  statusGate.appendChild(gateStatusText);

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

  const middleContainer = getOrCreateEl('secondary-middle-container');

  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';
  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';
  const viewReview = getOrCreateEl('screen-b-view-review');
  viewReview.style.display = 'none';

  const reviewEmptyPane = getOrCreateEl('review-empty-pane');
  const reviewActivePane = getOrCreateEl('review-active-pane');
  reviewActivePane.style.display = 'none';

  const reviewHeaderBar = getOrCreateEl('review-header-bar');
  reviewHeaderBar.className = 'review-header-toolbar';
  const reviewFileCount = getOrCreateEl('review-file-count', 'span');
  reviewFileCount.textContent = '0 files modified';
  const reviewTotalAdded = getOrCreateEl('review-total-added', 'span');
  reviewTotalAdded.textContent = '+0';
  const reviewTotalDeleted = getOrCreateEl('review-total-deleted', 'span');
  reviewTotalDeleted.textContent = '-0';

  const btnReviewAcceptAll = getOrCreateEl('btn-review-accept-all', 'button');
  btnReviewAcceptAll.className = 'btn-vscode-primary btn-review-bulk btn-disabled';
  btnReviewAcceptAll.disabled = true;
  btnReviewAcceptAll.setAttribute('disabled', '');
  btnReviewAcceptAll.title = 'Socratic Cognitive Gate locked';
  const bulkAcceptIcon = getOrCreateEl('bulk-accept-icon', 'span');
  bulkAcceptIcon.className = 'codicon codicon-lock';
  const bulkAcceptLabel = getOrCreateEl('bulk-accept-label', 'span');
  bulkAcceptLabel.textContent = 'Accept All';
  btnReviewAcceptAll.appendChild(bulkAcceptIcon);
  btnReviewAcceptAll.appendChild(bulkAcceptLabel);

  const btnReviewDiscardAll = getOrCreateEl('btn-review-discard-all', 'button');
  btnReviewDiscardAll.className = 'btn-vscode-secondary btn-review-bulk';
  btnReviewDiscardAll.disabled = false;
  btnReviewDiscardAll.title = 'Discard all proposed changes';
  const bulkDiscardIcon = getOrCreateEl('bulk-discard-icon', 'span');
  bulkDiscardIcon.className = 'codicon codicon-discard';
  const bulkDiscardLabel = getOrCreateEl('bulk-discard-label', 'span');
  bulkDiscardLabel.textContent = 'Discard All';
  btnReviewDiscardAll.appendChild(bulkDiscardIcon);
  btnReviewDiscardAll.appendChild(bulkDiscardLabel);

  reviewHeaderBar.appendChild(reviewFileCount);
  reviewHeaderBar.appendChild(reviewTotalAdded);
  reviewHeaderBar.appendChild(reviewTotalDeleted);
  reviewHeaderBar.appendChild(btnReviewAcceptAll);
  reviewHeaderBar.appendChild(btnReviewDiscardAll);
  reviewActivePane.appendChild(reviewHeaderBar);

  const socraticGateCard = getOrCreateEl('socratic-gate-card');
  socraticGateCard.className = 'socratic-gate-card';
  socraticGateCard.style.display = 'none';

  const socraticGateHeader = getOrCreateEl('socratic-gate-header');
  socraticGateHeader.className = 'socratic-gate-header';
  const socraticHeaderIdent = getOrCreateEl('socratic-header-ident');
  const socraticGateBadgeIcon = getOrCreateEl('socratic-gate-badge-icon', 'span');
  socraticGateBadgeIcon.className = 'codicon codicon-lock';
  const socraticHeaderTitle = getOrCreateEl('socratic-header-title', 'span');
  socraticHeaderTitle.textContent = 'Socratic Cognitive Gate';
  socraticHeaderIdent.appendChild(socraticGateBadgeIcon);
  socraticHeaderIdent.appendChild(socraticHeaderTitle);

  const socraticHeaderMeta = getOrCreateEl('socratic-header-meta');
  const socraticTargetFile = getOrCreateEl('socratic-target-file', 'span');
  const socraticGateStatusPill = getOrCreateEl('socratic-gate-status-pill', 'span');
  socraticGateStatusPill.className = 'socratic-gate-status-pill status-locked';
  socraticGateStatusPill.textContent = 'LOCKED';
  socraticHeaderMeta.appendChild(socraticTargetFile);
  socraticHeaderMeta.appendChild(socraticGateStatusPill);

  socraticGateHeader.appendChild(socraticHeaderIdent);
  socraticGateHeader.appendChild(socraticHeaderMeta);
  socraticGateCard.appendChild(socraticGateHeader);

  const socraticGateBody = getOrCreateEl('socratic-gate-body');
  socraticGateBody.className = 'socratic-gate-body';

  const socraticQuestionContainer = getOrCreateEl('socratic-question-container');
  const socraticQuestionText = getOrCreateEl('socratic-question-text', 'p');
  const socraticConceptQuestion = getOrCreateEl('socratic-concept-question', 'p');
  socraticQuestionContainer.appendChild(socraticQuestionText);
  socraticQuestionContainer.appendChild(socraticConceptQuestion);
  socraticGateBody.appendChild(socraticQuestionContainer);

  const socraticOptionsList = getOrCreateEl('socratic-options-list');
  socraticOptionsList.className = 'socratic-options-list';
  socraticOptionsList.setAttribute('role', 'radiogroup');
  socraticGateBody.appendChild(socraticOptionsList);

  const socraticFeedbackBanner = getOrCreateEl('socratic-feedback-banner');
  socraticFeedbackBanner.className = 'socratic-feedback-banner';
  socraticFeedbackBanner.style.display = 'none';
  const socraticFeedbackIcon = getOrCreateEl('socratic-feedback-icon', 'span');
  const socraticFeedbackText = getOrCreateEl('socratic-feedback-text', 'span');
  socraticFeedbackBanner.appendChild(socraticFeedbackIcon);
  socraticFeedbackBanner.appendChild(socraticFeedbackText);
  socraticGateBody.appendChild(socraticFeedbackBanner);

  const socraticExplanationCard = getOrCreateEl('socratic-explanation-card');
  socraticExplanationCard.className = 'socratic-explanation-card';
  socraticExplanationCard.style.display = 'none';
  const socraticExplanationText = getOrCreateEl('socratic-explanation-text', 'p');
  socraticExplanationCard.appendChild(socraticExplanationText);
  socraticGateBody.appendChild(socraticExplanationCard);

  socraticGateCard.appendChild(socraticGateBody);

  const socraticGateFooter = getOrCreateEl('socratic-gate-footer');
  socraticGateFooter.className = 'socratic-gate-footer';
  const socraticHintBtn = getOrCreateEl('socratic-hint-btn', 'button');
  socraticHintBtn.className = 'socratic-hint-btn';
  socraticHintBtn.setAttribute('aria-expanded', 'false');
  const socraticHintBtnLabel = getOrCreateEl('socratic-hint-btn-label', 'span');
  socraticHintBtnLabel.textContent = 'Hint / Explain Concept';
  socraticHintBtn.appendChild(socraticHintBtnLabel);
  socraticGateFooter.appendChild(socraticHintBtn);

  const socraticHintContainer = getOrCreateEl('socratic-hint-container');
  socraticHintContainer.className = 'socratic-hint-container';
  socraticHintContainer.style.display = 'none';
  const socraticHintText = getOrCreateEl('socratic-hint-text', 'p');
  socraticHintContainer.appendChild(socraticHintText);
  socraticGateFooter.appendChild(socraticHintContainer);

  socraticGateCard.appendChild(socraticGateFooter);
  reviewActivePane.appendChild(socraticGateCard);

  const reviewFileList = getOrCreateEl('review-file-list');
  reviewFileList.className = 'review-file-list';
  reviewActivePane.appendChild(reviewFileList);

  viewReview.appendChild(reviewEmptyPane);
  viewReview.appendChild(reviewActivePane);

  middleContainer.appendChild(viewChat);
  middleContainer.appendChild(viewPlan);
  middleContainer.appendChild(viewReview);

  let modelVersionId = 1;
  let modelContent = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
  let changeListeners: Function[] = [];

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

  const mockModel: any = {
    getValue: vi.fn(() => modelContent),
    setValue: editorSetValueSpy,
    getLineCount: vi.fn(() => 5),
    getLineMaxColumn: vi.fn(() => 40),
    getAlternativeVersionId: vi.fn(() => modelVersionId),
    getValueInRange: vi.fn(() => modelContent),
    getLineContent: vi.fn((l: number) => modelContent.split('\n')[l - 1] || ''),
    onDidChangeContent: vi.fn((cb: Function) => {
      changeListeners.push(cb);
      return { dispose: () => { changeListeners = changeListeners.filter(f => f !== cb); } };
    }),
    uri: { fsPath: '/workspace/src/math.ts', path: '/workspace/src/math.ts', scheme: 'file', toString: () => 'file:///workspace/src/math.ts' },
  };

  const mockEditor: any = {
    revealLineInCenter: editorRevealLineSpy,
    setPosition: editorSetPositionSpy,
    setSelection: editorSetSelectionSpy,
    getPosition: vi.fn(() => currentPosition),
    getModel: vi.fn(() => mockModel),
    setModel: vi.fn(),
    focus: editorFocusSpy,
    applyEdits: editorApplyEditsSpy,
    setValue: editorSetValueSpy,
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
    id: 'src/math.ts',
    filePath: 'src/math.ts',
    fileName: 'math.ts',
    language: 'typescript',
    isDirty: false,
    initialVersionId: 1,
    model: mockModel,
  };

  const mockDocManager: any = {
    activeDocId: 'src/math.ts',
    activeDoc: openDoc,
    documents: new Map([['src/math.ts', openDoc]]),
    openFile: vi.fn(async (fp: string) => {
      mockDocManager.activeDocId = fp;
      openDoc.id = fp;
      openDoc.filePath = fp;
      openDoc.fileName = path.basename(fp);
      return openDoc;
    }),
    saveActiveDocument: vi.fn(async () => {
      openDoc.isDirty = false;
      return true;
    }),
    saveDocument: vi.fn(async () => {
      openDoc.isDirty = false;
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
      { name: 'math.ts', path: '/workspace/src/math.ts', relativePath: 'src/math.ts' },
    ]),
    readFile: vi.fn(async () => ({ success: true, content: modelContent })),
    writeFile: vi.fn(async () => ({ success: true })),
    getWorkspaceRoot: vi.fn(async () => ({ path: '/workspace' })),
    readDirectory: vi.fn(async () => ({ error: null, nodes: [] })),
  };

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
      socraticGateEnforced: true,
      isSocraticGateEnforced: true,
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
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
    setTimeout: (fn: Function, delay?: number) => setTimeout(fn, delay),
    clearTimeout: (id: any) => clearTimeout(id),
    setInterval: (fn: Function, delay?: number) => setInterval(fn, delay),
    clearInterval: (id: any) => clearInterval(id),
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;

    // Socratic Gate State & Controllers
    globalThis.isSocraticGateUnlocked = typeof isSocraticGateUnlocked !== 'undefined' ? isSocraticGateUnlocked : undefined;
    globalThis.getSocraticChallenge = typeof getSocraticChallenge !== 'undefined' ? getSocraticChallenge : (() => activeSocraticChallenge);
    globalThis.activeSocraticChallenge = typeof activeSocraticChallenge !== 'undefined' ? activeSocraticChallenge : undefined;
    globalThis.answerSocraticChallenge = typeof answerSocraticChallenge !== 'undefined' ? answerSocraticChallenge : undefined;
    globalThis.unlockSocraticGate = typeof unlockSocraticGate !== 'undefined' ? unlockSocraticGate : undefined;
    globalThis.resetSocraticGate = typeof resetSocraticGate !== 'undefined' ? resetSocraticGate : undefined;
    globalThis.toggleSocraticHint = typeof toggleSocraticHint !== 'undefined' ? toggleSocraticHint : undefined;
    globalThis.generateSocraticChallenge = typeof generateSocraticChallenge !== 'undefined' ? generateSocraticChallenge : undefined;
    globalThis.renderSocraticGateCard = typeof renderSocraticGateCard !== 'undefined' ? renderSocraticGateCard : undefined;

    // Review Mode controllers
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.getReviewDiffs = typeof getReviewDiffs !== 'undefined' ? getReviewDiffs : undefined;
    globalThis.renderReviewPane = typeof renderReviewPane !== 'undefined' ? renderReviewPane : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : undefined;
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.acceptAllReviewDiffs = typeof acceptAllReviewDiffs !== 'undefined' ? acceptAllReviewDiffs : undefined;
    globalThis.discardAllReviewDiffs = typeof discardAllReviewDiffs !== 'undefined' ? discardAllReviewDiffs : undefined;
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : undefined;
    globalThis.escapeHtml = typeof escapeHtml !== 'undefined' ? escapeHtml : undefined;
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning] workbench.js execution:', err);
  }

  const helpers = {
    isGateUnlocked: (): boolean => {
      if (typeof sandbox.isSocraticGateUnlocked === 'function') return sandbox.isSocraticGateUnlocked();
      if (typeof sandbox.window?.isSocraticGateUnlocked === 'function') return sandbox.window.isSocraticGateUnlocked();
      const card = elementRegistry.get('socratic-gate-card');
      return card?.getAttribute('data-gate-state') === 'unlocked';
    },
    getChallenge: (): any => {
      if (typeof sandbox.getSocraticChallenge === 'function') return sandbox.getSocraticChallenge();
      if (typeof sandbox.window?.getSocraticChallenge === 'function') return sandbox.window.getSocraticChallenge();
      return sandbox.activeSocraticChallenge || null;
    },
    answerChallenge: (idxOrId: number | string): any => {
      if (typeof sandbox.answerSocraticChallenge === 'function') {
        return sandbox.answerSocraticChallenge(idxOrId);
      }
      return { success: false };
    },
    unlockGate: (): void => {
      if (typeof sandbox.unlockSocraticGate === 'function') sandbox.unlockSocraticGate();
    },
    resetGate: (): void => {
      if (typeof sandbox.resetSocraticGate === 'function') sandbox.resetSocraticGate();
    },
    toggleHint: (): boolean => {
      if (typeof sandbox.toggleSocraticHint === 'function') return sandbox.toggleSocraticHint();
      return false;
    },
  };

  return {
    sandbox,
    elementRegistry,
    helpers,
    spies: {
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
      listFiles: mockElectronFS.listFiles,
    },
    mockModel,
    mockEditor,
    mockDiffEditor,
    openDoc,
    mockDocManager,
    getDiffEditorState: () => ({
      container: diffEditorContainer,
      options: diffEditorOptions,
      models: { original: diffEditorOriginalModel, modified: diffEditorModifiedModel },
      disposed: diffEditorDisposed,
    }),
  };
}

const baseDiffFixture = {
  id: 'diff-sample-1',
  filePath: 'src/math.ts',
  originalContent: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
  proposedContent: 'export function add(a: number, b: number): number {\n  if (typeof a !== "number") throw new TypeError("a must be number");\n  return a + b;\n}\n',
  linesAdded: 1,
  linesDeleted: 0,
  description: 'Add input boundary validation to prevent non-number crashes',
};

describe('Milestone v0.2.4: Adversarial Challenger 1 — Socratic Cognitive Gate Stress Suite', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let jsContent: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v024-adv1-'));
    workspaceDir = path.join(testTempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    setCurrentWorkspaceRootForTesting(workspaceDir);

    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(jsPath, 'utf-8');

    vi.clearAllMocks();
  });

  afterEach(() => {
    setCurrentWorkspaceRootForTesting(null);
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {
        // ignore lock on Windows
      }
    }
  });

  describe('Suite 1: Stress & Race Boundaries — Rapid Clicking & Concurrency', () => {
    it('1.1 Rapid multiple clicks (50x) on #btn-review-accept-all while gate is locked: zero writeFile calls', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all')!;
      expect(btnAcceptAll.disabled).toBe(true);
      expect(btnAcceptAll.classList.contains('btn-disabled')).toBe(true);

      // Stress test: fire 50 rapid click events
      for (let i = 0; i < 50; i++) {
        btnAcceptAll.click();
        btnAcceptAll.dispatchEvent({ type: 'click' });
      }

      // Assert zero disk mutations occurred
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });

    it('1.2 Rapid multiple clicks (50x) on per-file .btn-review-accept while gate is locked: zero writeFile calls', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      const btnAccept = reviewFileList.querySelector('.btn-review-accept')!;
      expect(btnAccept).not.toBeNull();
      expect(btnAccept.disabled).toBe(true);
      expect(btnAccept.classList.contains('btn-disabled')).toBe(true);

      // Stress test: fire 50 rapid click events
      for (let i = 0; i < 50; i++) {
        btnAccept.click();
        btnAccept.dispatchEvent({ type: 'click' });
      }

      // Assert zero disk mutations occurred
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });

    it('1.3 Mixed concurrent actions: wrong answer selection followed by rapid accept attempts remains locked', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).not.toBeNull();

      // Find an incorrect option
      const wrongOpt = challenge.options.find((o: any) => !o.isCorrect);
      expect(wrongOpt).toBeDefined();

      // Answer wrongly
      const ansRes = ctx.helpers.answerChallenge(wrongOpt.id);
      expect(ansRes.success).toBe(false);
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      // Immediately attempt to accept 20x
      for (let i = 0; i < 20; i++) {
        const acceptResult = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
        expect(acceptResult).toBe(false);
      }

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('1.4 Concurrent multiple diff items: individual accept buttons are all independently locked and resist spam', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const multiDiffs = [
        { ...baseDiffFixture, id: 'diff-1', filePath: 'src/a.ts' },
        { ...baseDiffFixture, id: 'diff-2', filePath: 'src/b.ts' },
        { ...baseDiffFixture, id: 'diff-3', filePath: 'src/c.ts' },
      ];
      ctx.sandbox.setReviewDiffs(multiDiffs);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      const acceptBtns = reviewFileList.querySelectorAll('.btn-review-accept');
      expect(acceptBtns.length).toBe(3);

      for (const btn of acceptBtns) {
        expect(btn.disabled).toBe(true);
        expect(btn.classList.contains('btn-disabled')).toBe(true);
        for (let i = 0; i < 10; i++) {
          btn.click();
          btn.dispatchEvent({ type: 'click' });
        }
      }

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.sandbox.getReviewDiffs().length).toBe(3);
    });

    it('1.5 High-frequency toggling of #socratic-hint-btn (100x): toggles cleanly without crashing', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const hintBtn = ctx.elementRegistry.get('socratic-hint-btn')!;
      const hintContainer = ctx.elementRegistry.get('socratic-hint-container')!;

      for (let i = 0; i < 100; i++) {
        ctx.helpers.toggleHint();
        const isOdd = i % 2 === 0; // 0th iteration makes it expanded
        expect(hintBtn.getAttribute('aria-expanded')).toBe(isOdd ? 'true' : 'false');
        expect(hintContainer.style.display).toBe(isOdd ? 'block' : 'none');
      }
    });

    it('1.6 Rapid repeated correct answers: re-answering already unlocked gate does not crash or double-emit bad state', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const challenge = ctx.helpers.getChallenge();
      const correctOpt = challenge.options.find((o: any) => o.isCorrect);

      // Answer 10 times in rapid succession
      for (let i = 0; i < 10; i++) {
        const res = ctx.helpers.answerChallenge(correctOpt.id);
        expect(res.success).toBe(true);
        expect(ctx.helpers.isGateUnlocked()).toBe(true);
      }

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill')!;
      expect(pill.textContent).toBe('UNLOCKED');
    });
  });

  // SUITE 2: PROGRAMMATIC SECURITY & BYPASS IMMUNITY
  describe('Suite 2: Programmatic Security & Bypass Immunity', () => {
    it('2.1 Direct invocation of acceptReviewDiff(diffId) while gate is locked returns false with 0 disk writes', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
      expect(result).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SocraticGate] Accept blocked'));

      warnSpy.mockRestore();
    });

    it('2.2 Direct invocation of acceptAllReviewDiffs() while gate is locked returns false with 0 disk writes', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ctx.sandbox.acceptAllReviewDiffs();
      expect(result).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SocraticGate] Accept All blocked'));

      warnSpy.mockRestore();
    });

    it('2.3 Calling acceptReviewDiff() with non-existent or malicious IDs returns false without crash', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // Unlock gate first so we can test ID resolution guard
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      expect(await ctx.sandbox.acceptReviewDiff(null)).toBe(false);
      expect(await ctx.sandbox.acceptReviewDiff(undefined)).toBe(false);
      expect(await ctx.sandbox.acceptReviewDiff('')).toBe(false);
      expect(await ctx.sandbox.acceptReviewDiff('__proto__')).toBe(false);
      expect(await ctx.sandbox.acceptReviewDiff('non-existent-diff-id')).toBe(false);

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('2.4 DOM Tampering: removing disabled and .btn-disabled from #btn-review-accept-all still fails at JS layer', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all')!;
      // Attacker modifies DOM directly via DevTools
      btnAcceptAll.classList.remove('btn-disabled');
      btnAcceptAll.removeAttribute('disabled');
      btnAcceptAll.disabled = false;

      // Attacker clicks the button
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      btnAcceptAll.click();

      // Because acceptAllReviewDiffs validates internal isSocraticGateUnlocked state, it must fail
      const directCallRes = await ctx.sandbox.acceptAllReviewDiffs();
      expect(directCallRes).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('2.5 DOM Tampering: removing disabled and .btn-disabled from per-file accept button still aborts write', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      const btnAccept = reviewFileList.querySelector('.btn-review-accept')!;
      expect(btnAccept).not.toBeNull();

      // Attacker modifies DOM directly via DevTools
      btnAccept.classList.remove('btn-disabled');
      btnAccept.removeAttribute('disabled');
      btnAccept.disabled = false;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      btnAccept.click();

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('2.6 Programmatic unlock via unlockSocraticGate() emits screenB:gateUnlocked and enables safe acceptance', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      let gateEventReceived = false;
      ctx.sandbox.editorEventBridge.on('screenB:gateUnlocked', (payload: any) => {
        if (payload.isUnlocked) gateEventReceived = true;
      });

      // Call programmatic unlock
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);
      expect(gateEventReceived).toBe(true);

      // Now acceptReviewDiff should proceed cleanly and write to disk
      const acceptRes = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
      expect(acceptRes).toBe(true);
      expect(ctx.spies.writeFile).toHaveBeenCalledWith(baseDiffFixture.filePath, baseDiffFixture.proposedContent);
    });
  });

  describe('Suite 3: Pathological, Empty, & Malformed Diff Payloads', () => {
    it('3.1 Setting empty diffs (setReviewDiffs([])) hides Socratic card and shows empty review pane', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([]);

      const socraticCard = ctx.elementRegistry.get('socratic-gate-card')!;
      const emptyPane = ctx.elementRegistry.get('review-empty-pane')!;
      const activePane = ctx.elementRegistry.get('review-active-pane')!;

      expect(socraticCard.style.display).toBe('none');
      expect(emptyPane.style.display).toBe('flex');
      expect(activePane.style.display).toBe('none');
      expect(ctx.helpers.getChallenge()).toBeNull();
    });

    it('3.2 Null and undefined diff items in addReviewDiff are handled gracefully', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      expect(() => ctx.sandbox.addReviewDiff(null)).not.toThrow();
      expect(() => ctx.sandbox.addReviewDiff(undefined)).not.toThrow();
      expect(ctx.sandbox.getReviewDiffs().length).toBe(0);
    });

    it('3.3 Diff item with empty strings and missing optional properties normalizes to defensive bounds category', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const bareDiff = {
        id: 'diff-bare',
        filePath: 'unknown.ts',
        originalContent: '',
        proposedContent: '',
      };

      ctx.sandbox.addReviewDiff(bareDiff);
      const challenge = ctx.helpers.getChallenge();
      expect(challenge).not.toBeNull();
      expect(challenge.category).toBe('defensive_bounds');
      expect(challenge.options.length).toBeGreaterThanOrEqual(2);
      expect(challenge.isUnlocked).toBe(false);
    });

    it('3.4 Custom pre-packaged challenge without optional fields survives renderSocraticGateCard', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const customChallengeDiff = {
        id: 'diff-custom',
        filePath: 'src/custom.ts',
        originalContent: 'const a = 1;',
        proposedContent: 'const a = 2;',
        socraticChallenge: {
          id: 'custom-ch-1',
          diffId: 'diff-custom',
          category: 'state_isolation',
          question: 'Why isolate state?',
          options: [
            { id: 'opt-a', text: 'Option A', isCorrect: true },
            { id: 'opt-b', text: 'Option B', isCorrect: false },
          ],
          hint: 'Think about immutability',
          explanation: 'State isolation guarantees pure rendering',
          isUnlocked: false,
        },
      };

      ctx.sandbox.addReviewDiff(customChallengeDiff);
      const socraticCard = ctx.elementRegistry.get('socratic-gate-card')!;
      expect(socraticCard.style.display).toBe('flex');

      const qText = ctx.elementRegistry.get('socratic-question-text')!;
      expect(qText.textContent).toContain('Why isolate state?');

      // Answer it
      const res = ctx.helpers.answerChallenge('opt-a');
      expect(res.success).toBe(true);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);
    });

    it('3.5 Answering with out-of-range option index returns failure without crashing', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      expect(ctx.helpers.answerChallenge(999)).toEqual({ success: false, explanation: 'Option not found.' });
      expect(ctx.helpers.answerChallenge(-1)).toEqual({ success: false, explanation: 'Option not found.' });
      expect(ctx.helpers.answerChallenge('non-existent-opt')).toEqual({ success: false, explanation: 'Option not found.' });
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });

    it('3.6 Answering challenge when no challenge exists returns safe error', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([]);

      expect(ctx.helpers.answerChallenge(0)).toEqual({ success: false, explanation: 'No active Socratic challenge.' });
      expect(ctx.helpers.answerChallenge('opt-0')).toEqual({ success: false, explanation: 'No active Socratic challenge.' });
    });
  });

  describe('Suite 4: Adversarial XSS & Special Characters Injection', () => {
    it('4.1 Script tag XSS in filePath (<script>alert(1)</script>) is escaped in target file badge', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const xssDiff = {
        ...baseDiffFixture,
        filePath: 'src/<script>alert("xss")</script>.ts',
      };

      ctx.sandbox.setReviewDiffs([xssDiff]);

      const targetFileEl = ctx.elementRegistry.get('socratic-target-file')!;
      expect(targetFileEl.innerHTML).not.toContain('<script>');
      expect(targetFileEl.innerHTML).toContain('&lt;script&gt;');
      expect(targetFileEl.querySelector('script')).toBeNull();
    });

    it('4.2 Image onerror XSS in diff description is escaped and does not spawn img elements', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const imgXssDiff = {
        ...baseDiffFixture,
        description: '<img src="x" onerror="alert(\'attack\')"> Boundary validation fix',
      };

      ctx.sandbox.setReviewDiffs([imgXssDiff]);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      const descEl = reviewFileList.querySelector('.review-file-desc')!;
      expect(descEl).not.toBeNull();
      expect(descEl.innerHTML).not.toContain('<img src="x"');
      expect(descEl.innerHTML).toContain('&lt;img');
      expect(descEl.querySelector('img')).toBeNull();
    });

    it('4.3 SVG onload XSS in custom challenge question is escaped', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const svgXssDiff = {
        ...baseDiffFixture,
        socraticChallenge: {
          id: 'xss-ch',
          diffId: baseDiffFixture.id,
          category: 'concurrency',
          question: '<svg/onload=alert("pwned")> How does concurrency work?',
          options: [{ id: 'opt-0', text: 'Safe option', isCorrect: true }],
          hint: 'None',
          explanation: 'Safe',
          isUnlocked: false,
        },
      };

      ctx.sandbox.setReviewDiffs([svgXssDiff]);

      const qEl = ctx.elementRegistry.get('socratic-question-text')!;
      expect(qEl.innerHTML).not.toContain('<svg/onload');
      expect(qEl.innerHTML).toContain('&lt;svg');
      expect(qEl.querySelector('svg')).toBeNull();
    });

    it('4.4 HTML attribute breakout in option text is escaped in .socratic-option-text', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const optXssDiff = {
        ...baseDiffFixture,
        socraticChallenge: {
          id: 'opt-xss-ch',
          diffId: baseDiffFixture.id,
          category: 'concurrency',
          question: 'Valid question?',
          options: [
            { id: 'opt-0', text: '"><script>alert(document.cookie)</script>', isCorrect: true },
          ],
          hint: 'Hint',
          explanation: 'Explanation',
          isUnlocked: false,
        },
      };

      ctx.sandbox.setReviewDiffs([optXssDiff]);

      const optTextEl = ctx.elementRegistry.get('socratic-options-list')!.querySelector('.socratic-option-text')!;
      expect(optTextEl).not.toBeNull();
      expect(optTextEl.innerHTML).not.toContain('<script>');
      expect(optTextEl.innerHTML).toContain('&lt;script&gt;');
      expect(optTextEl.querySelector('script')).toBeNull();
    });

    it('4.5 Path traversal strings in filePath are rendered safely', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const traversalDiff = {
        ...baseDiffFixture,
        filePath: '../../../../../../windows/system32/calc.exe',
      };

      ctx.sandbox.setReviewDiffs([traversalDiff]);

      const targetFileEl = ctx.elementRegistry.get('socratic-target-file')!;
      expect(targetFileEl.textContent).toContain('calc.exe');
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });

    it('4.6 Unicode, emojis, and right-to-left override characters do not throw or corrupt question', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const unicodeDiff = {
        ...baseDiffFixture,
        filePath: 'src/\u202Ereversed_file_🚀_✨.ts',
        description: 'Fixing memory leak with 💥 high intensity \u0000 characters',
      };

      expect(() => ctx.sandbox.setReviewDiffs([unicodeDiff])).not.toThrow();
      const targetFileEl = ctx.elementRegistry.get('socratic-target-file')!;
      expect(targetFileEl.textContent).toContain('reversed_file');
    });
  });

  describe('Suite 5: Sequential Diff Proposals & Multi-Turn State Lifecycle', () => {
    it('5.1 Unlocking gate for diff 1, then receiving new diffs proposal (setReviewDiffs) RELOCKS gate', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // Unlock diff 1
      const ch1 = ctx.helpers.getChallenge();
      const correctOpt = ch1.options.find((o: any) => o.isCorrect);
      ctx.helpers.answerChallenge(correctOpt.id);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // Now a new diff batch arrives (Turn 2)
      const diff2 = {
        id: 'diff-turn-2',
        filePath: 'src/network.ts',
        originalContent: 'function send() {}',
        proposedContent: 'async function send() { await fetch(); }',
        description: 'Introduce async networking flow',
      };
      ctx.sandbox.setReviewDiffs([diff2]);

      // INVARIANT: Gate MUST RELOCK for the new diff batch!
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
      const pill = ctx.elementRegistry.get('socratic-gate-status-pill')!;
      expect(pill.textContent).toBe('LOCKED');

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all')!;
      expect(btnAcceptAll.disabled).toBe(true);
      expect(btnAcceptAll.classList.contains('btn-disabled')).toBe(true);

      // Verify new challenge matches the new diff's category (concurrency)
      const ch2 = ctx.helpers.getChallenge();
      expect(ch2.diffId).toBe('diff-turn-2');
      expect(ch2.category).toBe('concurrency');
    });

    it('5.2 Sequential answering lifecycle: wrong -> wrong -> correct properly transitions status and banner', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const ch = ctx.helpers.getChallenge();
      const wrongOpts = ch.options.filter((o: any) => !o.isCorrect);
      const correctOpt = ch.options.find((o: any) => o.isCorrect);
      expect(wrongOpts.length).toBeGreaterThanOrEqual(1);

      const banner = ctx.elementRegistry.get('socratic-feedback-banner')!;
      const bannerText = ctx.elementRegistry.get('socratic-feedback-text')!;

      const res1 = ctx.helpers.answerChallenge(wrongOpts[0].id);
      expect(res1.success).toBe(false);
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
      expect(banner.style.display).toBe('flex');
      expect(banner.className).toContain('feedback-error');

      if (wrongOpts[1]) {
        const res2 = ctx.helpers.answerChallenge(wrongOpts[1].id);
        expect(res2.success).toBe(false);
        expect(ctx.helpers.isGateUnlocked()).toBe(false);
        expect(banner.className).toContain('feedback-error');
      }

      const res3 = ctx.helpers.answerChallenge(correctOpt.id);
      expect(res3.success).toBe(true);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);
      expect(banner.style.display).toBe('flex');
      expect(banner.className).toContain('feedback-success');

      const explanationCard = ctx.elementRegistry.get('socratic-explanation-card')!;
      expect(explanationCard.style.display).toBe('flex');
    });

    it('5.3 resetSocraticGate() resets gate state to locked, hides feedback banner, and re-locks buttons', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // Unlock gate
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // Now reset
      ctx.helpers.resetGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all')!;
      expect(btnAcceptAll.disabled).toBe(true);
      expect(btnAcceptAll.classList.contains('btn-disabled')).toBe(true);

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill')!;
      expect(pill.textContent).toBe('LOCKED');
    });

    it('5.4 Accepting 1 of 2 diffs keeps gate active for the remaining diff', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const multiDiffs = [
        { ...baseDiffFixture, id: 'diff-1', filePath: 'src/math.ts' },
        { ...baseDiffFixture, id: 'diff-2', filePath: 'src/utils.ts' },
      ];
      ctx.sandbox.setReviewDiffs(multiDiffs);

      // Unlock gate and accept diff-1
      ctx.helpers.unlockGate();
      const res = await ctx.sandbox.acceptReviewDiff('diff-1');
      expect(res).toBe(true);

      // Remaining diff should still be present
      const remaining = ctx.sandbox.getReviewDiffs();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe('diff-2');

      // Review badge should show 1
      const badge = ctx.elementRegistry.get('review-tab-badge')!;
      expect(badge.textContent).toBe('1');
    });

    it('5.5 Accepting the last diff resets gate state to idle and closes Socratic card', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      ctx.helpers.unlockGate();
      const res = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
      expect(res).toBe(true);

      // Diff list is now empty
      expect(ctx.sandbox.getReviewDiffs().length).toBe(0);

      // Socratic card hidden, empty pane shown
      const socraticCard = ctx.elementRegistry.get('socratic-gate-card')!;
      expect(socraticCard.style.display).toBe('none');

      const emptyPane = ctx.elementRegistry.get('review-empty-pane')!;
      expect(emptyPane.style.display).toBe('flex');
    });
  });

  describe('Suite 6: Discard Freedom & Complete State Sanitization', () => {
    it('6.1 Discard All (#btn-review-discard-all) is fully clickable while gate is locked and clears diffs', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const btnDiscardAll = ctx.elementRegistry.get('btn-review-discard-all')!;
      expect(btnDiscardAll.disabled).toBe(false);
      expect(btnDiscardAll.classList.contains('btn-disabled')).toBe(false);

      // User discards while gate is still locked
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
      btnDiscardAll.click();
      ctx.sandbox.discardAllReviewDiffs();

      expect(ctx.sandbox.getReviewDiffs().length).toBe(0);
      expect(ctx.helpers.getChallenge()).toBeNull();
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      const emptyPane = ctx.elementRegistry.get('review-empty-pane')!;
      expect(emptyPane.style.display).toBe('flex');
    });

    it('6.2 Per-file Discard (.btn-review-discard) is unconditionally clickable while gate is locked', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      const btnDiscard = reviewFileList.querySelector('.btn-review-discard')!;
      expect(btnDiscard).not.toBeNull();
      expect(btnDiscard.disabled).toBe(false);
      expect(btnDiscard.classList.contains('btn-disabled')).toBe(false);

      // Discard via button click
      btnDiscard.click();

      expect(ctx.sandbox.getReviewDiffs().length).toBe(0);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('6.3 Discarding while error feedback banner is displayed cleans up card state cleanly', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // Trigger error banner by answering wrong
      const ch = ctx.helpers.getChallenge();
      const wrongOpt = ch.options.find((o: any) => !o.isCorrect);
      ctx.helpers.answerChallenge(wrongOpt.id);

      const banner = ctx.elementRegistry.get('socratic-feedback-banner')!;
      expect(banner.style.display).toBe('flex');

      // Now discard all diffs
      ctx.sandbox.discardAllReviewDiffs();

      const socraticCard = ctx.elementRegistry.get('socratic-gate-card')!;
      expect(socraticCard.style.display).toBe('none');
      expect(ctx.sandbox.getReviewDiffs().length).toBe(0);
    });

    it('6.4 Discarding active diff restores Layar A editor mount and hides diff editor mount', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // Open diff editor
      ctx.sandbox.openReviewDiff(baseDiffFixture.id);
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('none');
      expect(diffMount.style.display).toBe('block');

      // Now discard diff
      ctx.sandbox.discardReviewDiff(baseDiffFixture.id);
      expect(diffMount.style.display).toBe('none');
      expect(editorMount.style.display).toBe('block');
    });

    it('6.5 Discarding 1 of 3 diffs updates counter badge from 3 to 2 and leaves remaining diffs locked', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const diffs = [
        { ...baseDiffFixture, id: 'd-1', filePath: 'src/1.ts' },
        { ...baseDiffFixture, id: 'd-2', filePath: 'src/2.ts' },
        { ...baseDiffFixture, id: 'd-3', filePath: 'src/3.ts' },
      ];
      ctx.sandbox.setReviewDiffs(diffs);

      ctx.sandbox.discardReviewDiff('d-2');

      const remaining = ctx.sandbox.getReviewDiffs();
      expect(remaining.length).toBe(2);
      expect(remaining.map((d: any) => d.id)).toEqual(['d-1', 'd-3']);

      const badge = ctx.elementRegistry.get('review-tab-badge')!;
      expect(badge.textContent).toBe('2');

      // Gate remains active and locked
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });
  });

  // SUITE 7: LAYAR A MONACO DIFF ZERO-BUFFER INVARIANT UNDER ATTACK
  describe('Suite 7: Layar A Monaco Diff Zero-Buffer Invariant Under Attack', () => {
    it('7.1 Opening diff editor (openReviewDiff) does NOT write to disk while gate is locked', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      const openRes = await ctx.sandbox.openReviewDiff(baseDiffFixture.id);
      expect(openRes).toBe(true);

      // Verify zero-buffer: writeFile was NEVER called
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Verify document dirty state is untouched
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('7.2 Toggling between diff previews repeatedly never alters file buffer or writes to disk', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const multiDiffs = [
        { ...baseDiffFixture, id: 'diff-a', filePath: 'src/a.ts' },
        { ...baseDiffFixture, id: 'diff-b', filePath: 'src/b.ts' },
      ];
      ctx.sandbox.setReviewDiffs(multiDiffs);

      for (let i = 0; i < 5; i++) {
        await ctx.sandbox.openReviewDiff('diff-a');
        await ctx.sandbox.openReviewDiff('diff-b');
      }

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('7.3 Closing diff editor restores previous editor view state cleanly', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      await ctx.sandbox.openReviewDiff(baseDiffFixture.id);
      expect(ctx.elementRegistry.get('diff-editor-mount')!.style.display).toBe('block');

      ctx.sandbox.closeReviewDiff();
      expect(ctx.elementRegistry.get('diff-editor-mount')!.style.display).toBe('none');
      expect(ctx.elementRegistry.get('editor-mount')!.style.display).toBe('block');
      expect(ctx.mockEditor.focus).toHaveBeenCalled();
    });

    it('7.4 End-to-end zero-buffer flow: Inspect -> Locked -> Answer Correct -> Accept writes disk once', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([baseDiffFixture]);

      // 1. Inspect diff in Layar A (zero-buffer)
      await ctx.sandbox.openReviewDiff(baseDiffFixture.id);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // 2. Attempt locked accept -> blocked
      const blockedRes = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
      expect(blockedRes).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      const ch = ctx.helpers.getChallenge();
      const correctOpt = ch.options.find((o: any) => o.isCorrect);
      ctx.helpers.answerChallenge(correctOpt.id);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      const acceptedRes = await ctx.sandbox.acceptReviewDiff(baseDiffFixture.id);
      expect(acceptedRes).toBe(true);

      // Verify writeFile was called exactly once with proposed content
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1);
      expect(ctx.spies.writeFile).toHaveBeenCalledWith(baseDiffFixture.filePath, baseDiffFixture.proposedContent);

      // Verify dirty state cleared
      expect(ctx.openDoc.isDirty).toBe(false);
    });
  });
});
