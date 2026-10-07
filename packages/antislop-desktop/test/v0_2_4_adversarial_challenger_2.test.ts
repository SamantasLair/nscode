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

    const disabledMatch = attrsStr.match(/disabled(?:=["']([^"']*)["'])?/);
    if (disabledMatch) el.disabled = true;

    const ariaExpandedMatch = attrsStr.match(/aria-expanded=["']([^"']+)["']/);
    if (ariaExpandedMatch) el.setAttribute('aria-expanded', ariaExpandedMatch[1]);

    const dataGateStateMatch = attrsStr.match(/data-gate-state=["']([^"']+)["']/);
    if (dataGateStateMatch) el.setAttribute('data-gate-state', dataGateStateMatch[1]);

    const closeTag = `</${tagName}>`;
    const closeIdx = html.indexOf(closeTag, openTagEnd);

    if (closeIdx !== -1) {
      const innerContent = html.substring(openTagEnd, closeIdx);
      if (innerContent.includes('<')) {
        parseHtmlToMockElements(innerContent, el).forEach(c => el.appendChild(c));
      } else {
        el.textContent = innerContent.trim();
      }
      pos = closeIdx + closeTag.length;
    } else {
      pos = openTagEnd;
    }

    children.push(el);
  }

  return children;
}

export function createMockDomElement(tagName = 'div', id = ''): MockElement {
  const children: MockElement[] = [];
  const classListSet = new Set<string>();
  const attributes: Record<string, string> = {};
  const listeners: Record<string, Function[]> = {};

  let rawText = '';
  let rawHtml = '';

  const el: MockElement = {
    id,
    tagName: tagName.toUpperCase(),
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val: string) {
      classListSet.clear();
      if (val) {
        val.split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
      }
    },
    classList: {
      add: (...cls: string[]) => {
        cls.forEach(c => {
          if (c) c.split(/\s+/).filter(Boolean).forEach(single => classListSet.add(single));
        });
      },
      remove: (...cls: string[]) => {
        cls.forEach(c => {
          if (c) c.split(/\s+/).filter(Boolean).forEach(single => classListSet.delete(single));
        });
      },
      contains: (cls: string) => classListSet.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force === true) {
          classListSet.add(cls);
          return true;
        } else if (force === false) {
          classListSet.delete(cls);
          return false;
        }
        if (classListSet.has(cls)) {
          classListSet.delete(cls);
          return false;
        } else {
          classListSet.add(cls);
          return true;
        }
      },
    },
    style: {},
    dataset: {},
    get textContent() {
      if (children.length > 0) {
        return children.map(c => c.textContent).join(' ');
      }
      return rawText;
    },
    set textContent(val: string) {
      rawText = val;
      children.length = 0;
    },
    get innerHTML() {
      if (children.length > 0) {
        return children.map(c => `<${c.tagName.toLowerCase()} id="${c.id}" class="${c.className}">${c.innerHTML || c.textContent}</${c.tagName.toLowerCase()}>`).join('');
      }
      return rawHtml || rawText;
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
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    attributes,
    getAttribute: (attr: string) => {
      if (attr === 'disabled') return el.disabled ? '' : null;
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
        return;
      }
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

  // Locked by default with codicon-lock and .btn-disabled
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

  // Discard is ALWAYS enabled and clickable
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
  socraticGateCard.setAttribute('data-gate-state', 'locked');
  socraticGateCard.style.display = 'none';

  const socraticGateHeader = getOrCreateEl('socratic-gate-header');
  socraticGateHeader.className = 'socratic-gate-header';
  const socraticGateBadge = getOrCreateEl('socratic-gate-badge');
  socraticGateBadge.className = 'socratic-gate-badge';
  const socraticGateBadgeIcon = getOrCreateEl('socratic-gate-badge-icon', 'span');
  socraticGateBadgeIcon.className = 'codicon codicon-lock';
  const socraticGateBadgeTitle = getOrCreateEl('socratic-gate-badge-title', 'span');
  socraticGateBadgeTitle.className = 'socratic-gate-badge-title';
  socraticGateBadgeTitle.textContent = 'SOCRATIC COGNITIVE GATE';
  socraticGateBadge.appendChild(socraticGateBadgeIcon);
  socraticGateBadge.appendChild(socraticGateBadgeTitle);

  const socraticGateStatusPill = getOrCreateEl('socratic-gate-status-pill', 'span');
  socraticGateStatusPill.className = 'socratic-gate-status-pill status-locked';
  socraticGateStatusPill.textContent = 'LOCKED';

  socraticGateHeader.appendChild(socraticGateBadge);
  socraticGateHeader.appendChild(socraticGateStatusPill);
  socraticGateCard.appendChild(socraticGateHeader);

  const socraticGateBody = getOrCreateEl('socratic-gate-body');
  socraticGateBody.className = 'socratic-gate-body';

  const socraticTargetContext = getOrCreateEl('socratic-target-context');
  socraticTargetContext.className = 'socratic-target-context';
  const socraticTargetFile = getOrCreateEl('socratic-target-file', 'span');
  socraticTargetFile.className = 'socratic-target-file';
  socraticTargetFile.textContent = 'Evaluating proposed changes...';
  socraticTargetContext.appendChild(socraticTargetFile);
  socraticGateBody.appendChild(socraticTargetContext);

  const socraticQuestionContainer = getOrCreateEl('socratic-question-container');
  socraticQuestionContainer.className = 'socratic-question-container';
  const socraticQuestionText = getOrCreateEl('socratic-question-text', 'p');
  socraticQuestionText.className = 'socratic-question-text';
  socraticQuestionText.textContent = 'Loading comprehension check...';
  socraticQuestionContainer.appendChild(socraticQuestionText);
  const socraticConceptQuestion = getOrCreateEl('socratic-concept-question', 'p');
  socraticConceptQuestion.className = 'socratic-question-text';
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
  socraticFeedbackIcon.className = 'codicon codicon-info';
  const socraticFeedbackText = getOrCreateEl('socratic-feedback-text', 'span');
  socraticFeedbackText.className = 'socratic-feedback-text';
  socraticFeedbackBanner.appendChild(socraticFeedbackIcon);
  socraticFeedbackBanner.appendChild(socraticFeedbackText);
  socraticGateBody.appendChild(socraticFeedbackBanner);

  const socraticExplanationCard = getOrCreateEl('socratic-explanation-card');
  socraticExplanationCard.className = 'socratic-explanation-card';
  socraticExplanationCard.style.display = 'none';
  const socraticExplanationHeader = getOrCreateEl('socratic-explanation-header');
  socraticExplanationHeader.className = 'socratic-explanation-header';
  const expIcon = getOrCreateEl('socratic-explanation-icon', 'span');
  expIcon.className = 'codicon codicon-pass-filled';
  const expTitle = getOrCreateEl('socratic-explanation-title', 'span');
  expTitle.textContent = 'Architectural Invariant Verified';
  socraticExplanationHeader.appendChild(expIcon);
  socraticExplanationHeader.appendChild(expTitle);
  const socraticExplanationText = getOrCreateEl('socratic-explanation-text', 'p');
  socraticExplanationText.className = 'socratic-explanation-text';
  socraticExplanationCard.appendChild(socraticExplanationHeader);
  socraticExplanationCard.appendChild(socraticExplanationText);
  socraticGateBody.appendChild(socraticExplanationCard);

  // Hint Section
  const socraticHintSection = getOrCreateEl('socratic-hint-section');
  socraticHintSection.className = 'socratic-hint-section';
  const socraticHintBtn = getOrCreateEl('socratic-hint-btn', 'button');
  socraticHintBtn.className = 'btn-vscode-link socratic-hint-toggle';
  socraticHintBtn.setAttribute('aria-expanded', 'false');
  const hintIcon = getOrCreateEl('socratic-hint-icon', 'span');
  hintIcon.className = 'codicon codicon-lightbulb';
  const socraticHintBtnLabel = getOrCreateEl('socratic-hint-btn-label', 'span');
  socraticHintBtnLabel.textContent = 'Hint / Explain Concept';
  socraticHintBtn.appendChild(hintIcon);
  socraticHintBtn.appendChild(socraticHintBtnLabel);

  const socraticHintContainer = getOrCreateEl('socratic-hint-container');
  socraticHintContainer.className = 'socratic-hint-container';
  socraticHintContainer.style.display = 'none';
  const socraticHintText = getOrCreateEl('socratic-hint-text', 'p');
  socraticHintText.className = 'socratic-hint-text';
  socraticHintContainer.appendChild(socraticHintText);

  socraticHintSection.appendChild(socraticHintBtn);
  socraticHintSection.appendChild(socraticHintContainer);
  socraticGateBody.appendChild(socraticHintSection);

  socraticGateCard.appendChild(socraticGateBody);
  reviewActivePane.appendChild(socraticGateCard);

  const reviewFileList = getOrCreateEl('review-file-list');
  reviewFileList.className = 'review-file-list';
  reviewActivePane.appendChild(reviewFileList);

  const breadcrumbs = getOrCreateEl('breadcrumbs');
  const crumbFileName = getOrCreateEl('crumb-file-name', 'span');
  const crumbSymbolName = getOrCreateEl('crumb-symbol-name', 'span');
  breadcrumbs.appendChild(crumbFileName);
  breadcrumbs.appendChild(crumbSymbolName);

  // Monaco Mock Models and Editors
  const modelsMap = new Map<string, any>();
  const editorRevealLineSpy = vi.fn();
  const editorSetPositionSpy = vi.fn();
  const editorSetSelectionSpy = vi.fn();
  const editorFocusSpy = vi.fn();
  const editorSetValueSpy = vi.fn();
  const editorApplyEditsSpy = vi.fn();

  let activeModelContent = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

  const mockModel = {
    uri: { toString: () => 'file:///workspace/src/math.ts' },
    getValue: () => activeModelContent,
    setValue: (val: string) => {
      activeModelContent = val;
      editorSetValueSpy(val);
    },
    getLineCount: () => activeModelContent.split('\n').length,
    getLineContent: (line: number) => (activeModelContent.split('\n')[line - 1] || ''),
    getAlternativeVersionId: () => 1,
    applyEdits: editorApplyEditsSpy,
  };
  modelsMap.set('file:///workspace/src/math.ts', mockModel);

  const mockEditor = {
    getModel: () => mockModel,
    setModel: vi.fn(),
    revealLineInCenter: editorRevealLineSpy,
    setPosition: editorSetPositionSpy,
    setSelection: editorSetSelectionSpy,
    focus: editorFocusSpy,
    saveViewState: vi.fn(() => ({ cursorState: [{ inSelectionMode: false, position: { lineNumber: 1, column: 1 } }] })),
    restoreViewState: vi.fn(),
  };

  let diffEditorOriginalModel: any = null;
  let diffEditorModifiedModel: any = null;
  let diffEditorContainer: any = null;
  let diffEditorOptions: any = null;
  let diffEditorDisposed = false;

  const mockDiffEditor = {
    setModel: vi.fn((models: { original: any; modified: any }) => {
      diffEditorOriginalModel = models.original;
      diffEditorModifiedModel = models.modified;
    }),
    getModel: () => ({ original: diffEditorOriginalModel, modified: diffEditorModifiedModel }),
    dispose: vi.fn(() => { diffEditorDisposed = true; }),
  };

  const mockMonaco = {
    editor: {
      create: vi.fn(() => mockEditor),
      createDiffEditor: vi.fn((container: any, options: any) => {
        diffEditorContainer = container;
        diffEditorOptions = options;
        return mockDiffEditor;
      }),
      createModel: vi.fn((content: string, lang?: string, uri?: any) => {
        const uriStr = uri?.toString?.() || `inmemory://model-${modelsMap.size}`;
        const m = {
          uri: uri || { toString: () => uriStr },
          getValue: () => content,
          setValue: (newVal: string) => { content = newVal; },
          getLineCount: () => content.split('\n').length,
        };
        modelsMap.set(uriStr, m);
        return m;
      }),
      getModel: vi.fn((uri: any) => {
        const uriStr = uri?.toString?.() || String(uri);
        return modelsMap.get(uriStr) || null;
      }),
    },
    Uri: {
      file: (p: string) => ({ toString: () => `file:///${p.replace(/\\/g, '/')}` }),
      parse: (str: string) => ({ toString: () => str }),
    },
  };

  const mockElectronFS = {
    readFile: vi.fn().mockResolvedValue({ content: activeModelContent }),
    writeFile: vi.fn().mockResolvedValue(true),
    listFiles: vi.fn().mockResolvedValue(['src/math.ts', 'src/apiClient.ts']),
  };

  const openDoc = {
    filePath: 'src/math.ts',
    model: mockModel,
    isDirty: false,
    initialVersionId: 1,
    viewState: null,
  };

  const mockDocManager = {
    activeDocId: 'src/math.ts',
    documents: new Map<string, any>([['src/math.ts', openDoc]]),
    renderTabs: vi.fn(),
    syncActiveChrome: vi.fn(),
    detectLanguage: vi.fn(() => 'typescript'),
  };

  // VM Sandbox construction
  const sandbox: any = {
    window: {
      monaco: mockMonaco,
      electronFS: mockElectronFS,
      electronIPC: { invoke: vi.fn().mockResolvedValue(undefined) },
      socraticGateEnforced: true,
      isSocraticGateEnforced: true,
    },
    document: {
      getElementById: (id: string) => getOrCreateEl(id),
      querySelector: (sel: string) => {
        if (sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
        for (const el of elementRegistry.values()) {
          if (matchesSelector(el, sel)) return el;
          const found = el.querySelector(sel);
          if (found) return found;
        }
        return null;
      },
      querySelectorAll: (sel: string) => {
        const res: MockElement[] = [];
        for (const el of elementRegistry.values()) {
          if (matchesSelector(el, sel)) res.push(el);
          res.push(...el.querySelectorAll(sel));
        }
        return Array.from(new Set(res));
      },
      createElement: (tag: string) => createMockDomElement(tag),
      body: getOrCreateEl('body'),
      addEventListener: vi.fn(),
    },
    monaco: mockMonaco,
    electronFS: mockElectronFS,
    editor: mockEditor,
    diffEditor: null,
    docManager: mockDocManager,
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    setTimeout: (fn: Function) => fn(),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    Date,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Set,
    Map,
    parseInt,
    parseFloat,
    isNaN,
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);

  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;

    Object.defineProperty(globalThis, 'currentReviewDiffs', {
      get: () => typeof currentReviewDiffs !== 'undefined' ? currentReviewDiffs : [],
      set: (v) => { if (typeof currentReviewDiffs !== 'undefined') currentReviewDiffs = v; },
      configurable: true
    });
    Object.defineProperty(globalThis, 'activeDiffReviewId', {
      get: () => typeof activeDiffReviewId !== 'undefined' ? activeDiffReviewId : null,
      set: (v) => { if (typeof activeDiffReviewId !== 'undefined') activeDiffReviewId = v; },
      configurable: true
    });

    globalThis.isSocraticGateUnlocked = typeof isSocraticGateUnlocked !== 'undefined' ? () => isSocraticGateUnlocked : (typeof window !== 'undefined' && typeof window.isSocraticGateUnlocked === 'function' ? window.isSocraticGateUnlocked : () => false);
    globalThis.isSocraticGateActive = typeof isSocraticGateActive !== 'undefined' ? isSocraticGateActive : undefined;
    globalThis.getSocraticChallenge = typeof activeSocraticChallenge !== 'undefined' ? () => activeSocraticChallenge : (typeof window !== 'undefined' && typeof window.getSocraticChallenge === 'function' ? window.getSocraticChallenge : () => null);
    
    globalThis.selectSocraticOption = typeof selectSocraticOption !== 'undefined' ? selectSocraticOption : (typeof answerSocraticChallenge !== 'undefined' ? answerSocraticChallenge : (typeof window !== 'undefined' && typeof window.selectSocraticOption === 'function' ? window.selectSocraticOption : undefined));
    globalThis.answerSocraticChallenge = typeof answerSocraticChallenge !== 'undefined' ? answerSocraticChallenge : (typeof selectSocraticOption !== 'undefined' ? selectSocraticOption : (typeof window !== 'undefined' && typeof window.answerSocraticChallenge === 'function' ? window.answerSocraticChallenge : undefined));
    
    globalThis.unlockSocraticGate = typeof unlockSocraticGate !== 'undefined' ? unlockSocraticGate : (typeof window !== 'undefined' && typeof window.unlockSocraticGate === 'function' ? window.unlockSocraticGate : undefined);
    globalThis.resetSocraticGate = typeof resetSocraticGate !== 'undefined' ? resetSocraticGate : (typeof window !== 'undefined' && typeof window.resetSocraticGate === 'function' ? window.resetSocraticGate : undefined);
    globalThis.toggleSocraticHint = typeof toggleSocraticHint !== 'undefined' ? toggleSocraticHint : (typeof window !== 'undefined' && typeof window.toggleSocraticHint === 'function' ? window.toggleSocraticHint : undefined);
    globalThis.generateSocraticChallenge = typeof generateSocraticChallenge !== 'undefined' ? generateSocraticChallenge : (typeof window !== 'undefined' && typeof window.generateSocraticChallenge === 'function' ? window.generateSocraticChallenge : undefined);
    globalThis.renderSocraticGateCard = typeof renderSocraticGateCard !== 'undefined' ? renderSocraticGateCard : undefined;

    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.renderReviewPane = typeof renderReviewPane !== 'undefined' ? renderReviewPane : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : (typeof showDiffEditor !== 'undefined' ? showDiffEditor : undefined);
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.acceptAllReviewDiffs = typeof acceptAllReviewDiffs !== 'undefined' ? acceptAllReviewDiffs : undefined;
    globalThis.discardAllReviewDiffs = typeof discardAllReviewDiffs !== 'undefined' ? discardAllReviewDiffs : undefined;

    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : (typeof window !== 'undefined' ? window.editorEventBridge : undefined);
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
      if (card) return card.getAttribute('data-gate-state') === 'unlocked';
      return false;
    },
    getChallenge: (): any => {
      if (typeof sandbox.getSocraticChallenge === 'function') return sandbox.getSocraticChallenge();
      if (typeof sandbox.window?.getSocraticChallenge === 'function') return sandbox.window.getSocraticChallenge();
      return sandbox.activeSocraticChallenge || null;
    },
    answerChallenge: (idxOrId: number | string): any => {
      const ch = helpers.getChallenge();
      let optId = typeof idxOrId === 'string' ? idxOrId : (ch?.options?.[idxOrId]?.id || String(idxOrId));
      let optIdx = typeof idxOrId === 'number' ? idxOrId : (ch?.options ? ch.options.findIndex((o: any) => o.id === idxOrId) : 0);

      if (typeof sandbox.answerSocraticChallenge === 'function') {
        const res = sandbox.answerSocraticChallenge(optId);
        if (res !== undefined) return res;
      }
      if (typeof sandbox.window?.answerSocraticChallenge === 'function') {
        const res = sandbox.window.answerSocraticChallenge(optId);
        if (res !== undefined) return res;
      }
      if (typeof sandbox.selectSocraticOption === 'function') {
        return sandbox.selectSocraticOption(optIdx);
      }
      return false;
    },
    unlockGate: (): void => {
      if (typeof sandbox.unlockSocraticGate === 'function') {
        sandbox.unlockSocraticGate();
      } else if (typeof sandbox.window?.unlockSocraticGate === 'function') {
        sandbox.window.unlockSocraticGate();
      }
    },
    resetGate: (): void => {
      if (typeof sandbox.resetSocraticGate === 'function') {
        sandbox.resetSocraticGate();
      } else if (typeof sandbox.window?.resetSocraticGate === 'function') {
        sandbox.window.resetSocraticGate();
      }
    },
    toggleHint: (): boolean => {
      if (typeof sandbox.toggleSocraticHint === 'function') {
        return sandbox.toggleSocraticHint();
      } else if (typeof sandbox.window?.toggleSocraticHint === 'function') {
        return sandbox.window.toggleSocraticHint();
      }
      const btn = elementRegistry.get('socratic-hint-btn');
      if (btn) {
        btn.click();
        return btn.getAttribute('aria-expanded') === 'true';
      }
      return false;
    },
  };

  return {
    sandbox,
    elementRegistry,
    helpers,
    spies: {
      editorRevealLine: editorRevealLineSpy,
      editorSetPosition: editorSetPositionSpy,
      editorFocus: editorFocusSpy,
      editorSetValue: editorSetValueSpy,
      editorApplyEdits: editorApplyEditsSpy,
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
    },
    mockModel,
    mockEditor,
    mockDiffEditor,
    openDoc,
    mockDocManager,
  };
}

const mathDiffFixture = {
  id: 'diff-math-1',
  filePath: 'src/math.ts',
  originalContent: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
  proposedContent: 'export function add(a: number, b: number): number {\n  if (typeof a !== "number" || typeof b !== "number") {\n    throw new TypeError("Inputs must be numbers");\n  }\n  return a + b;\n}\n',
  linesAdded: 3,
  linesDeleted: 0,
  description: 'Add defensive boundary validation to prevent non-number input crashes',
};

const asyncDiffFixture = {
  id: 'diff-async-1',
  filePath: 'src/apiClient.ts',
  originalContent: 'async function fetchData(url: string) {\n  return fetch(url);\n}\n',
  proposedContent: 'async function fetchData(url: string, signal?: AbortSignal) {\n  return fetch(url, { signal });\n}\n',
  linesAdded: 2,
  linesDeleted: 1,
  description: 'Introduce AbortController cancellation signal to prevent async race conditions',
};

describe('Milestone v0.2.4: Adversarial Challenger 2 — Socratic Gate State Machine & Zero-Buffer Integrity', () => {
  let jsContent: string;

  beforeEach(() => {
    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(jsPath, 'utf-8');
    vi.clearAllMocks();
  });

  describe('Suite 1: Probe State Machine Transitions & Negative Response Probes', () => {
    it('1.1 calling answerSocraticChallenge with wrong option -> feedback banner shows error, stays locked, button receives incorrect/wrong class', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      expect(challenge.options.length).toBeGreaterThanOrEqual(2);

      const wrongIdx = challenge.options.findIndex((o: any) => !o.isCorrect);
      expect(wrongIdx).toBeGreaterThanOrEqual(0);
      const wrongOption = challenge.options[wrongIdx];

      // Invoke wrong answer
      const result = ctx.helpers.answerChallenge(wrongIdx);
      expect(result.success).toBe(false);

      // Verify gate stays strictly locked
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard?.getAttribute('data-gate-state')).toBe('locked');

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
      expect(pill?.classList.contains('status-locked')).toBe(true);
      expect(pill?.textContent).toBe('LOCKED');

      // Verify feedback banner indicates error
      const feedbackBanner = ctx.elementRegistry.get('socratic-feedback-banner');
      expect(feedbackBanner?.style.display).toBe('flex');
      expect(feedbackBanner?.classList.contains('feedback-error')).toBe(true);

      const feedbackIcon = ctx.elementRegistry.get('socratic-feedback-icon');
      expect(feedbackIcon?.className).toContain('codicon-error');

      // Verify button receives incorrect / wrong class
      const optionsList = ctx.elementRegistry.get('socratic-options-list');
      const optionButtons = optionsList?.querySelectorAll('button') || [];
      expect(optionButtons.length).toBe(challenge.options.length);

      const selectedBtn = optionButtons[wrongIdx];
      expect(selectedBtn).toBeDefined();
      expect(selectedBtn.getAttribute('aria-checked')).toBe('true');

      // Accept button remains disabled
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(true);
      expect(btnAcceptAll?.classList.contains('btn-disabled')).toBe(true);

      // Verify zero filesystem writes
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('1.2 calling answerSocraticChallenge with wrong option ID (string) preserves negative state invariants', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([asyncDiffFixture]);

      const challenge = ctx.helpers.getChallenge();
      const wrongOption = challenge.options.find((o: any) => !o.isCorrect);
      expect(wrongOption).toBeDefined();

      const result = ctx.helpers.answerChallenge(wrongOption.id);
      expect(result.success).toBe(false);
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const feedbackBanner = ctx.elementRegistry.get('socratic-feedback-banner');
      expect(feedbackBanner?.classList.contains('feedback-error')).toBe(true);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('1.3 calling answerSocraticChallenge with out-of-range indices or invalid IDs returns failure without crashing', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      // Out of bounds: -1
      const resNeg = ctx.helpers.answerChallenge(-1);
      expect(resNeg.success).toBe(false);
      expect(resNeg.explanation).toBe('Option not found.');
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      // Out of bounds: 999
      const resHigh = ctx.helpers.answerChallenge(999);
      expect(resHigh.success).toBe(false);
      expect(resHigh.explanation).toBe('Option not found.');
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      // Non-existent string ID
      const resBogus = ctx.helpers.answerChallenge('opt-nonexistent-99');
      expect(resBogus.success).toBe(false);
      expect(resBogus.explanation).toBe('Option not found.');
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });

    it('1.4 subsequent correct answer -> verify recovery, transitions to unlocked, emits screenB:gateUnlocked', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      let emittedEvent: any = null;
      ctx.sandbox.editorEventBridge.on('screenB:gateUnlocked', (evt: any) => {
        emittedEvent = evt;
      });

      const challenge = ctx.helpers.getChallenge();
      const wrongIdx = challenge.options.findIndex((o: any) => !o.isCorrect);
      const correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // First attempt: wrong
      ctx.helpers.answerChallenge(wrongIdx);
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      // Second attempt: correct (recovery)
      const resCorrect = ctx.helpers.answerChallenge(correctIdx);
      expect(resCorrect.success).toBe(true);

      // State transitions to unlocked
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard?.getAttribute('data-gate-state')).toBe('unlocked');

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
      expect(pill?.classList.contains('status-unlocked')).toBe(true);
      expect(pill?.textContent).toBe('UNLOCKED');

      // Feedback banner transitions to success
      const feedbackBanner = ctx.elementRegistry.get('socratic-feedback-banner');
      expect(feedbackBanner?.style.display).toBe('flex');
      expect(feedbackBanner?.classList.contains('feedback-success')).toBe(true);

      const feedbackIcon = ctx.elementRegistry.get('socratic-feedback-icon');
      expect(feedbackIcon?.className).toContain('codicon-pass-filled');

      // Explanation card is displayed
      const explanationCard = ctx.elementRegistry.get('socratic-explanation-card');
      expect(explanationCard?.style.display).toBe('flex');

      // Accept buttons unlocked
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(false);
      expect(btnAcceptAll?.classList.contains('btn-disabled')).toBe(false);

      // Event emitted
      expect(emittedEvent).not.toBeNull();
      expect(emittedEvent.isUnlocked).toBe(true);
      expect(emittedEvent.challengeId).toBe(challenge.id);
    });

    it('1.5 subsequent interactions after gate is unlocked preserve unlocked state and do not relock', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      const challenge = ctx.helpers.getChallenge();
      const correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      ctx.helpers.answerChallenge(correctIdx);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // Now click another option
      const wrongIdx = challenge.options.findIndex((o: any) => !o.isCorrect);
      ctx.helpers.answerChallenge(wrongIdx);

      // Gate remains unlocked
      expect(ctx.helpers.isGateUnlocked()).toBe(true);
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(false);
    });
  });

  // SUITE 2: CALLING unlockSocraticGate MULTIPLE TIMES -> IDEMPOTENCY
  describe('Suite 2: Calling unlockSocraticGate Multiple Times -> Idempotency', () => {
    it('2.1 calling unlockSocraticGate 5 times consecutively maintains clean unlocked state with zero corruption', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      let emitCount = 0;
      ctx.sandbox.editorEventBridge.on('screenB:gateUnlocked', () => {
        emitCount++;
      });

      // Call 5 times
      for (let i = 0; i < 5; i++) {
        ctx.helpers.unlockGate();
        expect(ctx.helpers.isGateUnlocked()).toBe(true);

        const card = ctx.elementRegistry.get('socratic-gate-card');
        expect(card?.getAttribute('data-gate-state')).toBe('unlocked');

        const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
        expect(pill?.classList.contains('status-unlocked')).toBe(true);

        const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
        expect(btnAcceptAll?.disabled).toBe(false);
        expect(btnAcceptAll?.classList.contains('btn-disabled')).toBe(false);
      }

      expect(emitCount).toBe(5);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('2.2 calling unlockSocraticGate when no diffs or challenge exist handles gracefully with fallback IDs', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.currentReviewDiffs = [];

      let emitted: any = null;
      ctx.sandbox.editorEventBridge.on('screenB:gateUnlocked', (e: any) => {
        emitted = e;
      });

      expect(() => ctx.helpers.unlockGate()).not.toThrow();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);
      expect(emitted).not.toBeNull();
      expect(emitted.challengeId).toBe('challenge-0');
    });

    it('2.3 calling resetSocraticGate after multiple unlocks cleanly restores locked invariant', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      // Unlock 3 times
      ctx.helpers.unlockGate();
      ctx.helpers.unlockGate();
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // Now reset
      ctx.helpers.resetGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const card = ctx.elementRegistry.get('socratic-gate-card');
      expect(card?.getAttribute('data-gate-state')).toBe('locked');

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
      expect(pill?.classList.contains('status-locked')).toBe(true);

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(true);
      expect(btnAcceptAll?.classList.contains('btn-disabled')).toBe(true);

      // Feedback banner is reset/hidden
      const feedbackBanner = ctx.elementRegistry.get('socratic-feedback-banner');
      expect(feedbackBanner?.style.display).toBe('none');
    });
  });

  // SUITE 3: ZERO-BUFFER MONACO DIFF EDITOR INSPECTION INTEGRITY
  describe('Suite 3: Zero-Buffer Monaco Diff Editor Inspection Integrity', () => {
    it('3.1 calling openReviewDiff and inspecting models does not mark openDocument dirty or call fs write', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Open diff in Layar A
      const openResult = await ctx.sandbox.openReviewDiff(mathDiffFixture.id);
      expect(openResult).toBe(true);

      // Diff editor mount visible, standard editor hidden
      const diffMount = ctx.elementRegistry.get('diff-editor-mount');
      const editorMount = ctx.elementRegistry.get('editor-mount');
      expect(diffMount?.style.display).toBe('block');
      expect(editorMount?.style.display).toBe('none');

      // Inspect models
      const diffState = ctx.sandbox.diffEditor;
      expect(diffState).toBeDefined();

      const origModel = ctx.sandbox.monaco.editor.getModel(ctx.sandbox.monaco.Uri.parse(`agent-orig://${mathDiffFixture.filePath}`));
      const propModel = ctx.sandbox.monaco.editor.getModel(ctx.sandbox.monaco.Uri.parse(`agent-proposed://${mathDiffFixture.filePath}`));
      expect(origModel).not.toBeNull();
      expect(propModel).not.toBeNull();

      expect(origModel.getValue()).toContain('return a + b;');
      expect(propModel.getValue()).toContain('throw new TypeError');

      // ZERO-BUFFER INVARIANTS:
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Close diff editor
      ctx.sandbox.closeReviewDiff();
      expect(diffMount?.style.display).toBe('none');
      expect(editorMount?.style.display).toBe('block');

      // Still clean after closing
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('3.2 repeatedly opening and closing review diffs (10 cycles) while gate is locked never touches disk or dirty state', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      for (let i = 0; i < 10; i++) {
        await ctx.sandbox.openReviewDiff(mathDiffFixture.id);
        expect(ctx.openDoc.isDirty).toBe(false);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();

        ctx.sandbox.closeReviewDiff();
        expect(ctx.openDoc.isDirty).toBe(false);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      }
    });

    it('3.3 calling acceptReviewDiff directly while gate is locked is rejected and leaves buffers untouched', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      // Attempt to accept while locked
      const accepted = await ctx.sandbox.acceptReviewDiff(mathDiffFixture.id);
      expect(accepted).toBe(false);

      // Must NOT write to disk
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      // Must NOT mark document dirty
      expect(ctx.openDoc.isDirty).toBe(false);
      // Must remain in review diff list
      expect(ctx.sandbox.currentReviewDiffs.length).toBe(1);
    });

    it('3.4 calling acceptAllReviewDiffs while gate is locked is rejected and performs zero disk writes', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture, asyncDiffFixture]);

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const acceptedAll = await ctx.sandbox.acceptAllReviewDiffs();
      expect(acceptedAll).toBe(false);

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.sandbox.currentReviewDiffs.length).toBe(2);
    });

    it('3.5 calling acceptReviewDiff strictly AFTER gate unlock applies changes to disk and clears dirty state', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      // Unlock gate
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // Now accept
      const accepted = await ctx.sandbox.acceptReviewDiff(mathDiffFixture.id);
      expect(accepted).toBe(true);

      // Filesystem write executed with proposed content
      expect(ctx.spies.writeFile).toHaveBeenCalledWith(mathDiffFixture.filePath, mathDiffFixture.proposedContent);

      // Buffer updated to proposed content
      expect(ctx.mockModel.getValue()).toBe(mathDiffFixture.proposedContent);
      // isDirty cleared
      expect(ctx.openDoc.isDirty).toBe(false);
      // Pending diff removed
      expect(ctx.sandbox.currentReviewDiffs.length).toBe(0);
    });
  });

  describe('Suite 4: Hint Toggling Under Repeated Clicks (aria-expanded true <-> false)', () => {
    it('4.1 verify hint toggling under repeated clicks (aria-expanded true <-> false)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      const hintBtn = ctx.elementRegistry.get('socratic-hint-btn');
      const hintContainer = ctx.elementRegistry.get('socratic-hint-container');
      const hintLabel = ctx.elementRegistry.get('socratic-hint-btn-label');

      expect(hintBtn).toBeDefined();
      expect(hintContainer).toBeDefined();

      // Initial state: collapsed
      expect(hintContainer?.style.display).toBe('none');
      expect(hintBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(hintLabel?.textContent).toBe('Hint / Explain Concept');

      ctx.helpers.toggleHint();
      expect(hintContainer?.style.display).toBe('block');
      expect(hintBtn?.getAttribute('aria-expanded')).toBe('true');
      expect(hintLabel?.textContent).toBe('Hide Concept Hint');

      ctx.helpers.toggleHint();
      expect(hintContainer?.style.display).toBe('none');
      expect(hintBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(hintLabel?.textContent).toBe('Hint / Explain Concept');

      ctx.helpers.toggleHint();
      expect(hintContainer?.style.display).toBe('block');
      expect(hintBtn?.getAttribute('aria-expanded')).toBe('true');
      expect(hintLabel?.textContent).toBe('Hide Concept Hint');

      ctx.helpers.toggleHint();
      expect(hintContainer?.style.display).toBe('none');
      expect(hintBtn?.getAttribute('aria-expanded')).toBe('false');
      expect(hintLabel?.textContent).toBe('Hint / Explain Concept');
    });

    it('4.2 rapid cycling of hint toggle (10 iterations) maintains strict deterministic parity', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([asyncDiffFixture]);

      const hintBtn = ctx.elementRegistry.get('socratic-hint-btn');
      const hintContainer = ctx.elementRegistry.get('socratic-hint-container');

      for (let i = 1; i <= 10; i++) {
        const isExpanded = ctx.helpers.toggleHint();
        const expectedExpanded = i % 2 === 1;

        expect(isExpanded).toBe(expectedExpanded);
        expect(hintBtn?.getAttribute('aria-expanded')).toBe(String(expectedExpanded));
        expect(hintContainer?.style.display).toBe(expectedExpanded ? 'block' : 'none');
      }
    });
  });

  // SUITE 5: DISCARD SOVEREIGNTY WHILE GATE IS LOCKED
  describe('Suite 5: Discard Sovereignty While Gate is Locked', () => {
    it('5.1 user can discard single diff while gate is locked without answering challenge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      let discardedEvt: any = null;
      ctx.sandbox.editorEventBridge.on('screenB:diffDiscarded', (e: any) => {
        discardedEvt = e;
      });

      const discarded = ctx.sandbox.discardReviewDiff(mathDiffFixture.id);
      expect(discarded).toBe(true);

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.sandbox.currentReviewDiffs.length).toBe(0);
      expect(discardedEvt).not.toBeNull();
      expect(discardedEvt.diffId).toBe(mathDiffFixture.id);
    });

    it('5.2 user can discardAllReviewDiffs while gate is locked without answering challenge', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture, asyncDiffFixture]);

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      ctx.sandbox.discardAllReviewDiffs();

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.sandbox.currentReviewDiffs.length).toBe(0);
      expect(ctx.helpers.getChallenge()).toBeNull();
    });
  });

  describe('Suite 6: Adversarial Stress, Malicious Payloads & Boundary Handling', () => {
    it('6.1 XSS injection payloads in diff filePath are sanitized against script injection', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const xssDiff = {
        id: 'diff-xss-1',
        filePath: '<script>alert("XSS")</script>',
        originalContent: 'baseline',
        proposedContent: 'injected',
        description: 'XSS attack probe',
      };

      ctx.sandbox.setReviewDiffs([xssDiff]);

      const targetFileEl = ctx.elementRegistry.get('socratic-target-file');
      expect(targetFileEl).toBeDefined();

      // Must be HTML-escaped, not containing raw executable script tags
      expect(targetFileEl?.innerHTML).not.toContain('<script>');
      expect(targetFileEl?.innerHTML).toContain('&lt;script&gt;');
    });

    it('6.2 generator accurately categorizes diverse invariant categories', () => {
      const ctx = setupWorkbenchSandbox(jsContent);

      const gen = ctx.sandbox.generateSocraticChallenge;
      expect(typeof gen).toBe('function');

      const concurrencyCh = gen({
        id: '1',
        filePath: 'src/stream.ts',
        proposedContent: 'const ac = new AbortController(); await fetch(url, { signal: ac.signal });',
        originalContent: 'fetch(url);',
        description: 'concurrency race guard',
      });
      expect(concurrencyCh.category).toBe('concurrency');

      const errorCh = gen({
        id: '2',
        filePath: 'src/handler.ts',
        proposedContent: 'try { doTask(); } catch (err) { recover(); }',
        originalContent: 'doTask();',
        description: 'resilience failure containment',
      });
      expect(errorCh.category).toBe('error_resilience');

      const memoryCh = gen({
        id: '3',
        filePath: 'src/widget.ts',
        proposedContent: 'window.removeEventListener("resize", handler);',
        originalContent: 'window.addEventListener("resize", handler);',
        description: 'leak dispose cleanup',
      });
      expect(memoryCh.category).toBe('memory_lifecycle');

      const boundsCh = gen({
        id: '4',
        filePath: 'src/parse.ts',
        proposedContent: 'const x = 42;',
        originalContent: 'const x = 0;',
        description: 'simple update',
      });
      expect(boundsCh.category).toBe('defensive_bounds');
    });

    it('6.3 non-existent diff IDs passed to openReviewDiff, acceptReviewDiff, discardReviewDiff return false gracefully', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      ctx.sandbox.setReviewDiffs([mathDiffFixture]);

      expect(await ctx.sandbox.openReviewDiff('ghost-id-404')).toBe(false);
      expect(await ctx.sandbox.acceptReviewDiff('ghost-id-404')).toBe(false);
      expect(ctx.sandbox.discardReviewDiff('ghost-id-404')).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });
  });
});
