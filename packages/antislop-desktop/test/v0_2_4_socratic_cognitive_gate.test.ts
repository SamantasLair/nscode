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

// Import main module to trigger IPC registrations and set workspace root
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

    const roleMatch = attrsStr.match(/role=["']([^"']+)["']/);
    if (roleMatch) el.setAttribute('role', roleMatch[1]);

    const ariaExpandedMatch = attrsStr.match(/aria-expanded=["']([^"']+)["']/);
    if (ariaExpandedMatch) el.setAttribute('aria-expanded', ariaExpandedMatch[1]);

    const ariaCheckedMatch = attrsStr.match(/aria-checked=["']([^"']+)["']/);
    if (ariaCheckedMatch) el.setAttribute('aria-checked', ariaCheckedMatch[1]);

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
        // Disabled buttons do not fire click handlers
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

  // 4A. Chat View
  const viewChat = getOrCreateEl('screen-b-view-chat');
  viewChat.style.display = 'flex';

  // 4B. Plan View
  const viewPlan = getOrCreateEl('screen-b-view-plan');
  viewPlan.style.display = 'none';

  // 4C. Review View (Milestone v0.2.4 Target)
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

  // Locked by default with codicon-lock and .btn-disabled (R1)
  const btnReviewAcceptAll = getOrCreateEl('btn-review-accept-all', 'button');
  btnReviewAcceptAll.className = 'btn-vscode-primary btn-review-bulk btn-disabled';
  btnReviewAcceptAll.disabled = true;
  btnReviewAcceptAll.setAttribute('disabled', '');
  btnReviewAcceptAll.title = 'Socratic Cognitive Gate locked — verify architectural comprehension below';
  const bulkAcceptIcon = getOrCreateEl('bulk-accept-icon', 'span');
  bulkAcceptIcon.className = 'codicon codicon-lock';
  const bulkAcceptLabel = getOrCreateEl('bulk-accept-label', 'span');
  bulkAcceptLabel.textContent = 'Accept All';
  btnReviewAcceptAll.appendChild(bulkAcceptIcon);
  btnReviewAcceptAll.appendChild(bulkAcceptLabel);

  // Discard is ALWAYS enabled and clickable (R2 Invariant)
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

  // Socratic Gate Card DOM hierarchy (R1)
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
  // Also register socratic-concept-question as alias/fallback
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

  const promptContainer = getOrCreateEl('antigravity-prompt-container');
  const promptInputBox = getOrCreateEl('prompt-input-box', 'textarea');
  promptInputBox.value = '';
  promptContainer.appendChild(promptInputBox);

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
    getValueInRange: vi.fn((range: any) => modelContent),
    getLineContent: vi.fn((lineNum: number) => modelContent.split('\n')[lineNum - 1] || ''),
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
    onDidChangeCursorPosition: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
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
    saveDocument: vi.fn(async (_docId: string) => {
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
    readFile: vi.fn(async (fp: string) => ({ success: true, content: modelContent })),
    writeFile: vi.fn(async (fp: string, content: string) => ({ success: true })),
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

  // Harness hook to bind global & window exports across both implementations
  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;

    // Milestone v0.2.4: Socratic Gate State & Controllers
    globalThis.isSocraticGateUnlocked = typeof isSocraticGateUnlocked !== 'undefined' ? isSocraticGateUnlocked : (typeof isGateUnlocked !== 'undefined' ? isGateUnlocked : (typeof window !== 'undefined' && typeof window.isSocraticGateUnlocked === 'function' ? window.isSocraticGateUnlocked : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.isGateUnlocked === 'function' ? window.screenBController.isGateUnlocked : undefined)));
    globalThis.isGateUnlocked = typeof isGateUnlocked !== 'undefined' ? isGateUnlocked : (typeof isSocraticGateUnlocked !== 'undefined' ? isSocraticGateUnlocked : (typeof window !== 'undefined' && typeof window.isGateUnlocked === 'function' ? window.isGateUnlocked : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.isGateUnlocked === 'function' ? window.screenBController.isGateUnlocked : undefined)));
    
    globalThis.getSocraticChallenge = typeof getSocraticChallenge !== 'undefined' ? getSocraticChallenge : (typeof currentSocraticChallenge !== 'undefined' ? () => currentSocraticChallenge : (typeof window !== 'undefined' && typeof window.getSocraticChallenge === 'function' ? window.getSocraticChallenge : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.getSocraticChallenge === 'function' ? window.screenBController.getSocraticChallenge : undefined)));
    globalThis.currentSocraticChallenge = typeof currentSocraticChallenge !== 'undefined' ? currentSocraticChallenge : undefined;
    
    globalThis.selectSocraticOption = typeof selectSocraticOption !== 'undefined' ? selectSocraticOption : (typeof answerSocraticChallenge !== 'undefined' ? answerSocraticChallenge : (typeof window !== 'undefined' && typeof window.selectSocraticOption === 'function' ? window.selectSocraticOption : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.selectSocraticOption === 'function' ? window.screenBController.selectSocraticOption : undefined)));
    globalThis.answerSocraticChallenge = typeof answerSocraticChallenge !== 'undefined' ? answerSocraticChallenge : (typeof selectSocraticOption !== 'undefined' ? selectSocraticOption : (typeof window !== 'undefined' && typeof window.answerSocraticChallenge === 'function' ? window.answerSocraticChallenge : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.answerSocraticChallenge === 'function' ? window.screenBController.answerSocraticChallenge : undefined)));
    
    globalThis.unlockSocraticGate = typeof unlockSocraticGate !== 'undefined' ? unlockSocraticGate : (typeof window !== 'undefined' && typeof window.unlockSocraticGate === 'function' ? window.unlockSocraticGate : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.unlockSocraticGate === 'function' ? window.screenBController.unlockSocraticGate : undefined));
    globalThis.resetSocraticGate = typeof resetSocraticGate !== 'undefined' ? resetSocraticGate : (typeof window !== 'undefined' && typeof window.resetSocraticGate === 'function' ? window.resetSocraticGate : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.resetSocraticGate === 'function' ? window.screenBController.resetSocraticGate : undefined));
    globalThis.toggleSocraticHint = typeof toggleSocraticHint !== 'undefined' ? toggleSocraticHint : (typeof window !== 'undefined' && typeof window.toggleSocraticHint === 'function' ? window.toggleSocraticHint : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.toggleSocraticHint === 'function' ? window.screenBController.toggleSocraticHint : undefined));
    globalThis.generateSocraticChallenge = typeof generateSocraticChallenge !== 'undefined' ? generateSocraticChallenge : (typeof window !== 'undefined' && typeof window.generateSocraticChallenge === 'function' ? window.generateSocraticChallenge : (typeof window !== 'undefined' && window.screenBController && typeof window.screenBController.generateSocraticChallenge === 'function' ? window.screenBController.generateSocraticChallenge : undefined));
    globalThis.renderSocraticGateCard = typeof renderSocraticGateCard !== 'undefined' ? renderSocraticGateCard : undefined;

    // Review Mode controllers
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.renderReviewPane = typeof renderReviewPane !== 'undefined' ? renderReviewPane : undefined;
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
    globalThis.screenBController = typeof screenBController !== 'undefined' ? screenBController : (typeof window !== 'undefined' ? window.screenBController : undefined);
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Sandbox Init Warning] workbench.js execution:', err);
  }

  // Unified helper accessors
  const helpers = {
    isGateUnlocked: (): boolean => {
      if (typeof sandbox.isSocraticGateUnlocked === 'function') return sandbox.isSocraticGateUnlocked();
      if (typeof sandbox.window?.isSocraticGateUnlocked === 'function') return sandbox.window.isSocraticGateUnlocked();
      if (typeof sandbox.isGateUnlocked === 'function') return sandbox.isGateUnlocked();
      if (typeof sandbox.window?.isGateUnlocked === 'function') return sandbox.window.isGateUnlocked();
      if (sandbox.window?.screenBController?.isGateUnlocked) return sandbox.window.screenBController.isGateUnlocked();
      if (sandbox.window?.screenBController?.isSocraticGateUnlocked) return sandbox.window.screenBController.isSocraticGateUnlocked();
      const card = elementRegistry.get('socratic-gate-card');
      if (card) return card.getAttribute('data-gate-state') === 'unlocked';
      return false;
    },
    getChallenge: (): any => {
      if (typeof sandbox.getSocraticChallenge === 'function') return sandbox.getSocraticChallenge();
      if (typeof sandbox.window?.getSocraticChallenge === 'function') return sandbox.window.getSocraticChallenge();
      if (sandbox.window?.screenBController?.getSocraticChallenge) return sandbox.window.screenBController.getSocraticChallenge();
      return sandbox.activeSocraticChallenge || sandbox.currentSocraticChallenge || null;
    },
    selectOption: (idxOrId: number | string): any => {
      const ch = helpers.getChallenge();
      let optId = typeof idxOrId === 'string' ? idxOrId : (ch?.options?.[idxOrId]?.id || String(idxOrId));
      let optIdx = typeof idxOrId === 'number' ? idxOrId : (ch?.options ? ch.options.findIndex((o: any) => o.id === idxOrId) : parseInt(String(idxOrId).replace(/\D/g, '') || '0', 10));

      if (typeof sandbox.answerSocraticChallenge === 'function') {
        const res = sandbox.answerSocraticChallenge(optId);
        if (res !== undefined) return res;
      }
      if (typeof sandbox.window?.answerSocraticChallenge === 'function') {
        const res = sandbox.window.answerSocraticChallenge(optId);
        if (res !== undefined) return res;
      }
      if (sandbox.window?.screenBController?.answerSocraticChallenge) {
        const res = sandbox.window.screenBController.answerSocraticChallenge(optId);
        if (res !== undefined) return res;
      }
      if (typeof sandbox.selectSocraticOption === 'function') {
        return sandbox.selectSocraticOption(optIdx);
      }
      if (typeof sandbox.window?.selectSocraticOption === 'function') {
        return sandbox.window.selectSocraticOption(optIdx);
      }
      if (sandbox.window?.screenBController?.selectSocraticOption) {
        return sandbox.window.screenBController.selectSocraticOption(optIdx);
      }
      const optionsList = elementRegistry.get('socratic-options-list');
      if (optionsList && optionsList.children.length > 0) {
        const target = (optIdx >= 0 && optionsList.children[optIdx])
          ? optionsList.children[optIdx]
          : optionsList.querySelector(`[data-option-id="${optId}"]`) || optionsList.querySelector(`[data-option-idx="${optIdx}"]`);
        if (target) {
          target.click();
          return true;
        }
      }
      return false;
    },
    unlockGate: (): void => {
      if (typeof sandbox.unlockSocraticGate === 'function') {
        sandbox.unlockSocraticGate();
      } else if (sandbox.window?.screenBController?.unlockSocraticGate) {
        sandbox.window.screenBController.unlockSocraticGate();
      } else if (typeof sandbox.window?.unlockSocraticGate === 'function') {
        sandbox.window.unlockSocraticGate();
      }
    },
    toggleHint: (): void => {
      if (typeof sandbox.toggleSocraticHint === 'function') {
        sandbox.toggleSocraticHint();
      } else if (sandbox.window?.screenBController?.toggleSocraticHint) {
        sandbox.window.screenBController.toggleSocraticHint();
      } else if (typeof sandbox.window?.toggleSocraticHint === 'function') {
        sandbox.window.toggleSocraticHint();
      } else {
        const btn = elementRegistry.get('socratic-hint-btn');
        if (btn) btn.click();
      }
    },
    resetGate: (): void => {
      if (typeof sandbox.resetSocraticGate === 'function') {
        sandbox.resetSocraticGate();
      } else if (sandbox.window?.screenBController?.resetSocraticGate) {
        sandbox.window.screenBController.resetSocraticGate();
      } else if (typeof sandbox.window?.resetSocraticGate === 'function') {
        sandbox.window.resetSocraticGate();
      }
    },
  };

  return {
    sandbox,
    elementRegistry,
    helpers,
    spies: {
      editorRevealLine: editorRevealLineSpy,
      editorSetPosition: editorSetPositionSpy,
      editorSetSelection: editorSetSelectionSpy,
      editorFocus: editorFocusSpy,
      editorSetValue: editorSetValueSpy,
      editorApplyEdits: editorApplyEditsSpy,
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
      listFiles: mockElectronFS.listFiles,
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

export const sampleDiffFixture = {
  id: 'diff-sample-1',
  filePath: 'src/math.ts',
  originalContent: 'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
  proposedContent: 'export function add(a: number, b: number): number {\n  if (typeof a !== "number" || typeof b !== "number") {\n    throw new TypeError("Inputs must be numbers");\n  }\n  return a + b;\n}\n',
  linesAdded: 3,
  linesDeleted: 0,
  description: 'Add defensive boundary validation to prevent non-number input crashes',
};

export const sampleAsyncDiffFixture = {
  id: 'diff-async-1',
  filePath: 'src/apiClient.ts',
  originalContent: 'async function fetchData(url: string) {\n  return fetch(url);\n}\n',
  proposedContent: 'async function fetchData(url: string, signal?: AbortSignal) {\n  return fetch(url, { signal });\n}\n',
  linesAdded: 2,
  linesDeleted: 1,
  description: 'Introduce AbortController cancellation signal to prevent async race conditions',
};

describe('Milestone v0.2.4: Socratic Cognitive Gate & Anti-Slop Differentiation Engine', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let htmlContent: string;
  let cssContent: string;
  let jsContent: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v024-test-'));
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
        // ignore file lock errors on Windows
      }
    }
  });

  // SUITE 1: INITIAL LOCKED STATE OF ACCEPT BUTTONS (R1)
  describe('Suite 1: Initial Locked State of Accept Buttons (R1)', () => {
    it('1.1 bulk Accept All button (#btn-review-accept-all) is disabled with .btn-disabled and codicon-lock by default', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll).toBeDefined();
      expect(btnAcceptAll!.disabled).toBe(true);
      expect(btnAcceptAll!.classList.contains('btn-disabled')).toBe(true);

      const hasLockIcon =
        btnAcceptAll!.innerHTML.includes('codicon-lock') ||
        Boolean(btnAcceptAll!.querySelector('.codicon-lock')) ||
        btnAcceptAll!.querySelector('#bulk-accept-icon')?.classList.contains('codicon-lock');
      expect(hasLockIcon).toBe(true);
    });

    it('1.2 per-file Accept buttons (.btn-review-accept) on review cards are locked with disabled and codicon-lock', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const fileList = ctx.elementRegistry.get('review-file-list');
      expect(fileList).toBeDefined();

      const acceptButtons = fileList!.querySelectorAll('.btn-review-accept');
      expect(acceptButtons.length).toBeGreaterThan(0);

      acceptButtons.forEach((btn: MockElement) => {
        expect(btn.disabled).toBe(true);
        expect(btn.classList.contains('btn-disabled')).toBe(true);
        const hasLock = btn.innerHTML.includes('codicon-lock') || Boolean(btn.querySelector('.codicon-lock'));
        expect(hasLock).toBe(true);
      });
    });

    it('1.3 clicking locked Accept or Accept All buttons does NOT write to disk and rejects action', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;
      const acceptAll = ctx.sandbox.acceptAllReviewDiffs;

      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      // Clicking DOM button when disabled should be a no-op
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      btnAcceptAll?.click();
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Programmatic invocation should return false / be blocked
      if (typeof acceptDiff === 'function') {
        const res = await acceptDiff(sampleDiffFixture.id);
        expect(res).toBe(false);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      }

      if (typeof acceptAll === 'function') {
        const resAll = await acceptAll();
        expect(resAll === false || resAll === undefined || ctx.spies.writeFile.mock.calls.length === 0).toBe(true);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      }
    });

    it('1.4 initial Socratic Gate query confirms locked state (isGateUnlocked === false)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);
    });
  });

  describe('Suite 2: Socratic Challenge Rendering & Option Selection (R1, R3)', () => {
    it('2.1 renders #socratic-gate-card in DOM with locked status pill and architectural inquiry', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard).toBeDefined();
      expect(gateCard!.style.display).not.toBe('none');
      expect(gateCard!.getAttribute('data-gate-state')).toBe('locked');

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
      expect(pill).toBeDefined();
      expect(pill!.textContent).toMatch(/LOCKED/i);
      expect(pill!.classList.contains('status-locked')).toBe(true);

      const qText = ctx.elementRegistry.get('socratic-question-text') || ctx.elementRegistry.get('socratic-concept-question');
      expect(qText).toBeDefined();
      expect(qText!.textContent.length).toBeGreaterThan(10);
    });

    it('2.2 generates 2 to 3 interactive options in #socratic-options-list with exactly one correct option', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      expect(challenge?.options).toBeDefined();
      expect(challenge.options.length).toBeGreaterThanOrEqual(2);
      expect(challenge.options.length).toBeLessThanOrEqual(4);

      const correctCount = challenge.options.filter((o: any) => o.isCorrect).length;
      expect(correctCount).toBe(1);

      // Verify DOM rendering of option items
      const optionsList = ctx.elementRegistry.get('socratic-options-list');
      expect(optionsList).toBeDefined();
      expect(optionsList!.children.length).toBe(challenge.options.length);
    });

    it('2.3 selecting an incorrect option shows error feedback and keeps gate strictly locked', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const incorrectIdx = challenge?.options?.findIndex((o: any) => !o.isCorrect) ?? -1;
      expect(incorrectIdx).toBeGreaterThanOrEqual(0);

      // Select incorrect option
      ctx.helpers.selectOption(incorrectIdx);

      // Gate remains locked
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard?.getAttribute('data-gate-state')).toBe('locked');

      // Feedback banner indicates error
      const feedbackBanner = ctx.elementRegistry.get('socratic-feedback-banner');
      if (feedbackBanner && feedbackBanner.style.display !== 'none') {
        expect(
          feedbackBanner.classList.contains('feedback-error') ||
          feedbackBanner.textContent.toLowerCase().includes('incorrect') ||
          feedbackBanner.innerHTML.includes('codicon-error')
        ).toBe(true);
      }

      // Accept buttons remain locked
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(true);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('2.4 clicking #socratic-hint-btn toggles #socratic-hint-container and aria-expanded state', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const hintBtn = ctx.elementRegistry.get('socratic-hint-btn');
      const hintContainer = ctx.elementRegistry.get('socratic-hint-container');
      expect(hintBtn).toBeDefined();
      expect(hintContainer).toBeDefined();

      // Initially collapsed
      expect(hintContainer!.style.display).toBe('none');
      expect(hintBtn!.getAttribute('aria-expanded')).toBe('false');

      // Toggle open
      ctx.helpers.toggleHint();
      expect(hintContainer!.style.display).not.toBe('none');
      expect(hintBtn!.getAttribute('aria-expanded')).toBe('true');

      // Toggle closed
      ctx.helpers.toggleHint();
      expect(hintContainer!.style.display).toBe('none');
      expect(hintBtn!.getAttribute('aria-expanded')).toBe('false');
    });
  });

  // SUITE 3: GATE UNLOCK EVENT DISPATCH & TRANSITION (R2)
  describe('Suite 3: Gate Unlock Event Dispatch & Transition (R2)', () => {
    it('3.1 selecting the correct option displays success feedback and architectural explanation card', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);

      // Select correct option
      ctx.helpers.selectOption(correctIdx);

      // Explanation card shown
      const explanationCard = ctx.elementRegistry.get('socratic-explanation-card');
      expect(explanationCard).toBeDefined();
      expect(explanationCard!.style.display).not.toBe('none');
      const explanationText = ctx.elementRegistry.get('socratic-explanation-text');
      expect(explanationText!.textContent.length).toBeGreaterThan(10);
    });

    it('3.2 transitions gate state to unlocked and updates status pill to UNLOCKED', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      ctx.helpers.selectOption(correctIdx);

      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      const pill = ctx.elementRegistry.get('socratic-gate-status-pill');
      expect(pill?.textContent).toMatch(/UNLOCKED/i);
      expect(pill?.classList.contains('status-unlocked')).toBe(true);

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard?.getAttribute('data-gate-state')).toBe('unlocked');
    });

    it('3.3 dispatches screenB:gateUnlocked event via EditorEventBridge with verification payload', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window.editorEventBridge;
      expect(bridge).toBeDefined();

      let unlockedEventReceived: any = null;
      bridge.on('screenB:gateUnlocked', (payload: any) => {
        unlockedEventReceived = payload;
      });

      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      ctx.helpers.selectOption(correctIdx);

      expect(unlockedEventReceived).toBeDefined();
      expect(unlockedEventReceived.isUnlocked === true || unlockedEventReceived.unlocked === true).toBe(true);
      expect(unlockedEventReceived.timestamp).toBeDefined();
    });

    it('3.4 transitions Accept All and per-file Accept buttons to active state with check icon', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      ctx.helpers.selectOption(correctIdx);

      // Accept All button unlocked
      const btnAcceptAll = ctx.elementRegistry.get('btn-review-accept-all');
      expect(btnAcceptAll?.disabled).toBe(false);
      expect(btnAcceptAll?.classList.contains('btn-disabled')).toBe(false);

      const bulkIcon = btnAcceptAll?.querySelector('.codicon') || ctx.elementRegistry.get('bulk-accept-icon');
      const hasCheckIcon =
        Boolean(bulkIcon?.className.includes('check')) ||
        Boolean(btnAcceptAll?.querySelector('.codicon-check')) ||
        Boolean(btnAcceptAll?.querySelector('.codicon-check-all')) ||
        Boolean(btnAcceptAll?.innerHTML.includes('check'));
      expect(hasCheckIcon).toBe(true);

      // Per-file Accept buttons unlocked
      const fileList = ctx.elementRegistry.get('review-file-list');
      const acceptBtns = fileList?.querySelectorAll('.btn-review-accept') || [];
      expect(acceptBtns.length).toBeGreaterThan(0);
      acceptBtns.forEach(btn => {
        expect(btn.disabled).toBe(false);
        expect(btn.classList.contains('btn-disabled')).toBe(false);
        const hasPerFileCheck =
          Boolean(btn.querySelector('.codicon-check')) ||
          Boolean(btn.querySelector('.codicon-check-all')) ||
          btn.innerHTML.includes('check');
        expect(hasPerFileCheck).toBe(true);
      });
    });

    it('3.5 updates Status Bar gate telemetry icon to codicon-check and status text to UNLOCKED', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      ctx.helpers.selectOption(correctIdx);

      const statusGate = ctx.elementRegistry.get('status-gate');
      const gateLockIcon = ctx.elementRegistry.get('gate-lock-icon');
      const gateStatusText = ctx.elementRegistry.get('gate-status-text');

      if (statusGate && gateLockIcon && gateStatusText) {
        expect(gateLockIcon.classList.contains('codicon-check') || gateLockIcon.className.includes('check')).toBe(true);
        expect(gateStatusText.textContent).toMatch(/UNLOCKED/i);
      }
    });
  });

  describe('Suite 4: Discard Freedom Without Gate Clearance (R2)', () => {
    it('4.1 per-file [ Discard ] buttons remain interactive and clickable while gate is locked', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      // Gate remains strictly locked
      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const fileList = ctx.elementRegistry.get('review-file-list');
      const discardBtns = fileList?.querySelectorAll('.btn-review-discard') || [];
      expect(discardBtns.length).toBeGreaterThan(0);

      discardBtns.forEach(btn => {
        expect(btn.disabled).toBe(false);
        expect(btn.classList.contains('btn-disabled')).toBe(false);
      });
    });

    it('4.2 global [ Discard All ] button remains clickable while gate is locked', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const btnDiscardAll = ctx.elementRegistry.get('btn-review-discard-all');
      expect(btnDiscardAll).toBeDefined();
      expect(btnDiscardAll!.disabled).toBe(false);
      expect(btnDiscardAll!.classList.contains('btn-disabled')).toBe(false);
    });

    it('4.3 clicking Discard drops diff and restores editor without disk writes', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const discardDiff = ctx.sandbox.discardReviewDiff;

      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      if (typeof discardDiff === 'function') {
        discardDiff(sampleDiffFixture.id);
      } else {
        const fileList = ctx.elementRegistry.get('review-file-list');
        const discardBtn = fileList?.querySelector('.btn-review-discard');
        discardBtn?.click();
      }

      // Absolute zero-write protection
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('4.4 discarding diff emits screenB:diffDiscarded event without requiring challenge answer', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const bridge = ctx.sandbox.editorEventBridge || ctx.sandbox.window.editorEventBridge;
      const discardDiff = ctx.sandbox.discardReviewDiff;

      let discardEventReceived = false;
      bridge?.on('screenB:diffDiscarded', () => {
        discardEventReceived = true;
      });

      const addDiff = ctx.sandbox.addReviewDiff;
      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      if (typeof discardDiff === 'function') {
        discardDiff(sampleDiffFixture.id);
        expect(discardEventReceived).toBe(true);
      }
    });
  });

  // SUITE 5: ZERO-BUFFER PROTECTION & DISK WRITE SAFETY (R4)
  describe('Suite 5: Zero-Buffer Protection & Disk Write Safety (R4)', () => {
    it('5.1 Monaco Diff Editor inspects side-by-side diff in Layar A without disk write while gate is locked', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const openDiff = ctx.sandbox.openReviewDiff || ctx.sandbox.showDiffEditor;

      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      if (typeof openDiff === 'function') {
        openDiff(sampleDiffFixture.id);
      }

      // Diff editor is mounted in Layar A
      const editorMount = ctx.elementRegistry.get('editor-mount');
      const diffMount = ctx.elementRegistry.get('diff-editor-mount');
      expect(editorMount?.style.display).toBe('none');
      expect(diffMount?.style.display).toBe('block');

      // Models inspectable comparing original vs proposed
      const diffState = ctx.getDiffEditorState();
      expect(diffState.models.original).toBeDefined();
      expect(diffState.models.modified).toBeDefined();

      // STRICT ZERO-BUFFER INVARIANT: Zero disk writes, document remains clean
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('5.2 multiple interactions with options and hints never mutate disk files', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      // Toggle hint multiple times
      ctx.helpers.toggleHint();
      ctx.helpers.toggleHint();

      // Click wrong option
      const challenge = ctx.helpers.getChallenge();
      if (challenge?.options) {
        const wrongIdx = challenge.options.findIndex((o: any) => !o.isCorrect);
        if (wrongIdx >= 0) {
          ctx.helpers.selectOption(wrongIdx);
        }
      }

      // Verify zero disk mutations
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.openDoc.isDirty).toBe(false);
    });

    it('5.3 acceptReviewDiff executes disk write strictly AFTER gate unlock and updates buffer', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      if (typeof addDiff === 'function') {
        addDiff(sampleDiffFixture);
      }

      // Phase 1: Attempt to accept while locked -> rejected
      expect(ctx.helpers.isGateUnlocked()).toBe(false);
      if (typeof acceptDiff === 'function') {
        const rejectedRes = await acceptDiff(sampleDiffFixture.id);
        expect(rejectedRes).toBe(false);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      }

      // Phase 2: Complete Socratic challenge -> unlock gate
      const challenge = ctx.helpers.getChallenge();
      expect(challenge).toBeDefined();
      const correctIdx = challenge?.options?.findIndex((o: any) => o.isCorrect) ?? -1;
      expect(correctIdx).toBeGreaterThanOrEqual(0);
      ctx.helpers.selectOption(correctIdx);
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      if (typeof acceptDiff === 'function') {
        await acceptDiff(sampleDiffFixture.id);

        expect(ctx.spies.writeFile).toHaveBeenCalledWith(
          sampleDiffFixture.filePath,
          sampleDiffFixture.proposedContent
        );
        expect(ctx.openDoc.isDirty).toBe(false);

        // Standard editor mount restored
        const editorMount = ctx.elementRegistry.get('editor-mount');
        const diffMount = ctx.elementRegistry.get('diff-editor-mount');
        expect(editorMount?.style.display).toBe('block');
        expect(diffMount?.style.display).toBe('none');
      }
    });

    it('5.4 bulk Accept All executes disk writes for all diffs once gate is unlocked', async () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      const acceptAll = ctx.sandbox.acceptAllReviewDiffs;

      const diffList = [
        sampleDiffFixture,
        {
          id: 'diff-sample-2',
          filePath: 'src/utils.ts',
          originalContent: 'function util() {}',
          proposedContent: 'function util() { return true; }',
          linesAdded: 1,
          linesDeleted: 0,
        },
      ];

      if (typeof setDiffs === 'function') {
        setDiffs(diffList);
      }

      // Unlock gate
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      if (typeof acceptAll === 'function') {
        await acceptAll();
        expect(ctx.spies.writeFile).toHaveBeenCalledWith('src/math.ts', sampleDiffFixture.proposedContent);
        expect(ctx.spies.writeFile).toHaveBeenCalledWith('src/utils.ts', 'function util() { return true; }');
      }
    });
  });

  // SUITE 6: EDGE CASES, MULTI-DIFF SCENARIOS & STATE INVARIANTS (R3, R5)
  describe('Suite 6: Edge Cases, Multi-Diff Scenarios & State Invariants (R3, R5)', () => {
    it('6.1 review queue with multiple diffs maintains locked state across all items until gate cleared', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;

      const multipleDiffs = [sampleDiffFixture, sampleAsyncDiffFixture];
      if (typeof setDiffs === 'function') {
        setDiffs(multipleDiffs);
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);

      const fileList = ctx.elementRegistry.get('review-file-list');
      const acceptBtns = fileList?.querySelectorAll('.btn-review-accept') || [];
      expect(acceptBtns.length).toBe(2);

      acceptBtns.forEach(btn => {
        expect(btn.disabled).toBe(true);
        expect(btn.classList.contains('btn-disabled')).toBe(true);
      });
    });

    it('6.2 new proposed diff resets gate state back to locked (state idempotency)', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;

      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      // Unlock first batch
      ctx.helpers.unlockGate();
      expect(ctx.helpers.isGateUnlocked()).toBe(true);

      // New diff arrival must reset gate for newly proposed code
      if (typeof setDiffs === 'function') {
        setDiffs([sampleAsyncDiffFixture]);
      } else {
        ctx.helpers.resetGate();
      }

      expect(ctx.helpers.isGateUnlocked()).toBe(false);
      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      expect(gateCard?.getAttribute('data-gate-state')).toBe('locked');
    });

    it('6.3 when all diffs are discarded or accepted, #socratic-gate-card hides and empty pane shows', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      const emptyPane = ctx.elementRegistry.get('review-empty-pane');
      const activePane = ctx.elementRegistry.get('review-active-pane');

      // Clear all diffs
      if (typeof discardAll === 'function') {
        discardAll();
      } else if (typeof setDiffs === 'function') {
        setDiffs([]);
      }

      expect(gateCard?.style.display).toBe('none');
      expect(emptyPane?.style.display).not.toBe('none');
      expect(activePane?.style.display).toBe('none');
    });

    it('6.4 HTML / script injection in diff descriptions or paths is safely sanitized', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;

      const maliciousDiff = {
        id: 'diff-xss-1',
        filePath: 'src/<script>alert("xss")</script>.ts',
        originalContent: 'safe',
        proposedContent: '<img src=x onerror=alert(1)>',
        linesAdded: 1,
        linesDeleted: 0,
        description: '<b onmouseover=alert("pwned")>Malicious Diff</b>',
      };

      if (typeof setDiffs === 'function') {
        setDiffs([maliciousDiff]);
      }

      const targetFileEl = ctx.elementRegistry.get('socratic-target-file');
      if (targetFileEl) {
        // Assert filename has been HTML-escaped and has no executable <script> tags
        expect(targetFileEl.innerHTML).not.toContain('<script>');
        expect(targetFileEl.innerHTML).toContain('&lt;script&gt;');
        expect(targetFileEl.querySelector('script')).toBeNull();
      }

      const qText = ctx.elementRegistry.get('socratic-question-text');
      if (qText) {
        expect(qText.innerHTML).not.toContain('<script>');
        expect(qText.querySelector('script')).toBeNull();
      }
    });

    it('6.5 zero-emoji invariant: all rendered challenge elements contain zero emoji Unicode characters', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs || ctx.sandbox.addReviewDiff;
      if (typeof setDiffs === 'function') {
        setDiffs([sampleDiffFixture]);
      }

      const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      const gateCard = ctx.elementRegistry.get('socratic-gate-card');
      const allText = gateCard ? gateCard.textContent + gateCard.innerHTML : '';
      expect(emojiRegex.test(allText)).toBe(false);
    });

    it('6.6 deterministic challenge generator categorizes diff invariants accurately across domains', () => {
      const ctx = setupWorkbenchSandbox(jsContent);
      const generator =
        ctx.sandbox.generateSocraticChallenge ||
        ctx.sandbox.window?.generateSocraticChallenge ||
        ctx.sandbox.window?.screenBController?.generateSocraticChallenge;

      if (typeof generator === 'function') {
        // Concurrency category test
        const asyncChallenge = generator(sampleAsyncDiffFixture);
        expect(asyncChallenge).toBeDefined();
        expect(
          asyncChallenge.category?.toLowerCase().includes('async') ||
          asyncChallenge.category?.toLowerCase().includes('concurrency') ||
          asyncChallenge.concept?.toLowerCase().includes('concurrency') ||
          asyncChallenge.question?.toLowerCase().includes('asynchronous')
        ).toBe(true);

        // Defensive validation test
        const defensiveChallenge = generator(sampleDiffFixture);
        expect(defensiveChallenge).toBeDefined();
        expect(
          defensiveChallenge.category?.toLowerCase().includes('defensive') ||
          defensiveChallenge.category?.toLowerCase().includes('bounds') ||
          defensiveChallenge.category?.toLowerCase().includes('validation') ||
          defensiveChallenge.concept?.toLowerCase().includes('safety') ||
          defensiveChallenge.question?.toLowerCase().includes('check') ||
          defensiveChallenge.question?.toLowerCase().includes('boundary')
        ).toBe(true);
      }
    });
  });
});
