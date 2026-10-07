import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import vm from 'vm';

const { ipcHandlers, mockWebContents, mockMainWindow, mockShell, mockClipboard } = vi.hoisted(() => {
  const handlers = new Map<string, Function>();
  const webContents = { send: vi.fn() };
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

vi.mock('electron', () => ({
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
}));

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
      if (val && typeof val === 'string') {
        val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },
    classList: {
      add: (...cls: string[]) => {
        cls.forEach(c => classes.add(c));
        el.className = Array.from(classes).join(' ');
      },
      remove: (...cls: string[]) => {
        cls.forEach(c => classes.delete(c));
        el.className = Array.from(classes).join(' ');
      },
      contains: (cls: string) => classes.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) {
            classes.add(cls);
            el.className = Array.from(classes).join(' ');
            return true;
          } else {
            classes.delete(cls);
            el.className = Array.from(classes).join(' ');
            return false;
          }
        }
        if (classes.has(cls)) {
          classes.delete(cls);
          el.className = Array.from(classes).join(' ');
          return false;
        } else {
          classes.add(cls);
          el.className = Array.from(classes).join(' ');
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
      child.parentNode = el;
      children.push(child);
      return child;
    },
    prepend: (child: MockElement) => {
      child.parentNode = el;
      children.unshift(child);
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
      if (matchesSelector(el, sel)) return el;
      for (const child of children) {
        if (matchesSelector(child, sel)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      for (const child of children) {
        if (matchesSelector(child, sel)) results.push(child);
        results.push(...child.querySelectorAll(sel));
      }
      return results;
    },
    closest: (sel: string) => {
      let cur: MockElement | null = el;
      while (cur) {
        if (matchesSelector(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
    focus: vi.fn(),
    click: () => {
      if (listeners['click']) {
        const ev = {
          type: 'click',
          target: el,
          currentTarget: el,
          stopPropagation: vi.fn(),
          preventDefault: vi.fn(),
        };
        listeners['click'].forEach(h => h(ev));
      }
    },
    dispatchEvent: (event: any) => {
      const list = listeners[event.type] || [];
      list.forEach(h => h(event));
      return true;
    },
  };

  return el;
}

function setupTestSandbox(jsContent: string) {
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
  const daemonLatencyText = getOrCreateEl('daemon-latency-text', 'span');
  const daemonModelBadge = getOrCreateEl('daemon-model-badge', 'span');
  statusDaemon.appendChild(daemonStatusDot);
  statusDaemon.appendChild(daemonStatusText);
  statusDaemon.appendChild(daemonLatencyText);
  statusDaemon.appendChild(daemonModelBadge);

  const screenBHeader = getOrCreateEl('screen-b-header');
  const screenBModeTabs = getOrCreateEl('screen-b-mode-tabs');
  const tabChat = getOrCreateEl('tab-screen-b-chat', 'button');
  tabChat.className = 'screen-b-mode-tab active';
  tabChat.dataset.mode = 'chat';
  const tabPlan = getOrCreateEl('tab-screen-b-plan', 'button');
  tabPlan.className = 'screen-b-mode-tab';
  tabPlan.dataset.mode = 'plan';
  const tabReview = getOrCreateEl('tab-screen-b-review', 'button');
  tabReview.className = 'screen-b-mode-tab';
  tabReview.dataset.mode = 'review';
  const reviewTabBadge = getOrCreateEl('review-tab-badge', 'span');
  reviewTabBadge.className = 'review-tab-badge';
  reviewTabBadge.textContent = '0';
  tabReview.appendChild(reviewTabBadge);

  screenBModeTabs.appendChild(tabChat);
  screenBModeTabs.appendChild(tabPlan);
  screenBModeTabs.appendChild(tabReview);
  screenBHeader.appendChild(screenBModeTabs);

  const viewChat = getOrCreateEl('screen-b-view-chat');
  const chatThreadContainer = getOrCreateEl('chat-thread-container');
  chatThreadContainer.className = 'chat-thread-container';
  viewChat.appendChild(chatThreadContainer);

  const viewPlan = getOrCreateEl('screen-b-view-plan');
  const planEmptyPane = getOrCreateEl('plan-empty-pane');
  const planActivePane = getOrCreateEl('plan-active-pane');
  planActivePane.style.display = 'none';
  const planLogsConsole = getOrCreateEl('plan-logs-console');
  planActivePane.appendChild(planLogsConsole);
  viewPlan.appendChild(planEmptyPane);
  viewPlan.appendChild(planActivePane);

  const viewReview = getOrCreateEl('screen-b-view-review');
  const reviewEmptyPane = getOrCreateEl('review-empty-pane');
  const reviewActivePane = getOrCreateEl('review-active-pane');
  reviewActivePane.style.display = 'none';
  const reviewFileList = getOrCreateEl('review-file-list');
  reviewActivePane.appendChild(reviewFileList);
  viewReview.appendChild(reviewEmptyPane);
  viewReview.appendChild(reviewActivePane);

  let modelContent = 'def solve():\n    return 42\n';
  let modelVersionId = 1;
  const mockModel: any = {
    getValue: vi.fn(() => modelContent),
    setValue: vi.fn((val: string) => { modelContent = val; modelVersionId++; }),
    getAlternativeVersionId: vi.fn(() => modelVersionId),
    uri: { fsPath: '/workspace/solve.py', path: '/workspace/solve.py', toString: () => 'file:///workspace/solve.py' },
  };

  const mockEditor: any = {
    setModel: vi.fn(),
    getModel: vi.fn(() => mockModel),
    focus: vi.fn(),
    saveViewState: vi.fn(() => ({ cursor: { lineNumber: 1, column: 1 } })),
    restoreViewState: vi.fn(),
  };

  let diffEditorOrigModel: any = null;
  let diffEditorPropModel: any = null;
  const mockDiffEditor: any = {
    setModel: vi.fn((models: { original: any; modified: any }) => {
      diffEditorOrigModel = models?.original;
      diffEditorPropModel = models?.modified;
    }),
    getModel: vi.fn(() => ({ original: diffEditorOrigModel, modified: diffEditorPropModel })),
    getOriginalEditor: vi.fn(() => mockEditor),
    getModifiedEditor: vi.fn(() => mockEditor),
    layout: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
  };

  const openDoc: any = {
    id: 'solve.py',
    filePath: 'solve.py',
    fileName: 'solve.py',
    language: 'python',
    isDirty: false,
    initialVersionId: 1,
    model: mockModel,
  };

  const mockDocManager: any = {
    activeDocId: 'solve.py',
    activeDoc: openDoc,
    documents: new Map([['solve.py', openDoc]]),
    detectLanguage: vi.fn((fp: string) => fp.endsWith('.ts') ? 'typescript' : 'python'),
    syncActiveChrome: vi.fn(),
  };

  const mockElectronFS: any = {
    writeFile: vi.fn(async (_fp: string, _content: string) => ({ success: true })),
    readFile: vi.fn(async (_fp: string) => ({ success: true, content: modelContent })),
  };

  let clipboardStorage = '';
  const mockElectronClipboard: any = {
    writeText: vi.fn((txt: string) => { clipboardStorage = txt; return true; }),
    readText: vi.fn(() => clipboardStorage),
  };

  const mockNavigator = {
    clipboard: {
      writeText: vi.fn(async (txt: string) => { clipboardStorage = txt; return true; }),
      readText: vi.fn(async () => clipboardStorage),
    },
  };

  const modelRegistry = new Map<string, any>();

  const sandbox: any = {
    window: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      electronFS: mockElectronFS,
      electronClipboard: mockElectronClipboard,
      navigator: mockNavigator,
      performance: { now: vi.fn(() => Date.now()) },
      CustomEvent: class CustomEvent {
        constructor(public type: string, public init?: any) {
          this.detail = init?.detail;
        }
        detail?: any;
      },
    },
    navigator: mockNavigator,
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
        parse: vi.fn((u: string) => ({
          fsPath: u.replace(/^[a-z\-]+:\/\//, ''),
          path: u.replace(/^[a-z\-]+:\/\//, ''),
          scheme: u.split('://')[0],
          toString: () => u,
        })),
      },
      editor: {
        getModel: vi.fn((uri?: any) => {
          if (uri && uri.toString && modelRegistry.has(uri.toString())) {
            return modelRegistry.get(uri.toString());
          }
          return null;
        }),
        createModel: vi.fn((content: string, _lang?: string, uri?: any) => {
          const m = {
            getValue: vi.fn(() => content),
            setValue: vi.fn((v: string) => { content = v; }),
            uri: uri || { toString: () => `inmemory://${Date.now()}` },
          };
          if (uri && uri.toString) {
            modelRegistry.set(uri.toString(), m);
          }
          return m;
        }),
        create: vi.fn(() => mockEditor),
        createDiffEditor: vi.fn(() => mockDiffEditor),
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
    performance: { now: vi.fn(() => Date.now()) },
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    globalThis.TypewriterRenderer = typeof TypewriterRenderer !== 'undefined' ? TypewriterRenderer : window.TypewriterRenderer;
    globalThis.StreamMessageParser = typeof StreamMessageParser !== 'undefined' ? StreamMessageParser : window.StreamMessageParser;
    globalThis.createThinkingCard = typeof createThinkingCard !== 'undefined' ? createThinkingCard : window.createThinkingCard;
    globalThis.formatCodeWithDarkPlusTokens = typeof formatCodeWithDarkPlusTokens !== 'undefined' ? formatCodeWithDarkPlusTokens : window.formatCodeWithDarkPlusTokens;
    globalThis.attachCopyButtonHandler = typeof attachCopyButtonHandler !== 'undefined' ? attachCopyButtonHandler : window.attachCopyButtonHandler;
    globalThis.createTaskPlan = typeof createTaskPlan !== 'undefined' ? createTaskPlan : undefined;
    globalThis.advanceSubtask = typeof advanceSubtask !== 'undefined' ? advanceSubtask : undefined;
    globalThis.addExecutionLog = typeof addExecutionLog !== 'undefined' ? addExecutionLog : undefined;
    globalThis.renderPlanView = typeof renderPlanView !== 'undefined' ? renderPlanView : undefined;
    globalThis.handlePlanStreamMessage = typeof handlePlanStreamMessage !== 'undefined' ? handlePlanStreamMessage : window.handlePlanStreamMessage;
    globalThis.getCurrentTaskPlan = () => (typeof currentTaskPlan !== 'undefined' ? currentTaskPlan : window.currentTaskPlan);
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.getReviewDiffs = typeof getReviewDiffs !== 'undefined' ? getReviewDiffs : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : undefined;
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.handleDiffStreamMessage = typeof handleDiffStreamMessage !== 'undefined' ? handleDiffStreamMessage : window.handleDiffStreamMessage;
    globalThis.setScreenBMode = typeof setScreenBMode !== 'undefined' ? setScreenBMode : undefined;
    globalThis.appendChatChunk = typeof appendChatChunk !== 'undefined' ? appendChatChunk : window.appendChatChunk;
    globalThis.getActiveDiffReviewId = () => (typeof activeDiffReviewId !== 'undefined' ? activeDiffReviewId : null);
  `;

  try {
    vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);
  } catch (err) {
    console.warn('[Adversarial Sandbox Init Warning]:', err);
  }

  return {
    sandbox,
    elementRegistry,
    mockEditor,
    mockDiffEditor,
    mockElectronFS,
    mockElectronClipboard,
    mockNavigator,
    openDoc,
    getDiffModels: () => ({ original: diffEditorOrigModel, modified: diffEditorPropModel }),
  };
}

describe('Challenger 2: Adversarial Stress Test Suite (Milestone v0.2.3)', () => {
  let jsContent: string;
  let env: ReturnType<typeof setupTestSandbox>;

  beforeEach(() => {
    const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(jsPath, 'utf-8');
    env = setupTestSandbox(jsContent);
    vi.clearAllMocks();
  });

  describe('Suite 1: Fragmented & Adversarial Thinking Tag Stream Parsing Stress', () => {
    it('1.1 should correctly parse single-character fragmented chunks across 15+ iterations without tag leakage', () => {
      const { StreamMessageParser } = env.sandbox;
      const thinkingChunks: string[] = [];
      const answerChunks: string[] = [];
      let completionData: any = null;

      const parser = new StreamMessageParser({
        onThinkingChunk: (delta: string) => thinkingChunks.push(delta),
        onAnswerChunk: (delta: string) => answerChunks.push(delta),
        onThinkingComplete: (stats: any) => { completionData = stats; },
      });

      // Split '<thinking>' into 1-character chunks
      const openTagChars = '<thinking>'.split('');
      openTagChars.forEach(ch => parser.feed(ch));

      expect(parser.insideThinking).toBe(true);
      expect(answerChunks.length).toBe(0);

      // Thinking content fed in 1-char chunks
      const thoughtChars = 'Deep reasoning algorithm'.split('');
      thoughtChars.forEach(ch => parser.feed(ch));

      expect(parser.thinking).toBe('Deep reasoning algorithm');
      expect(answerChunks.length).toBe(0);

      // Split '</thinking>' into 1-character chunks
      const closeTagChars = '</thinking>'.split('');
      closeTagChars.forEach(ch => parser.feed(ch));

      expect(parser.insideThinking).toBe(false);
      expect(completionData).not.toBeNull();
      expect(completionData.text).toBe('Deep reasoning algorithm');

      // Subsequent answer in 1-char chunks
      const answerChars = 'Final computed result.'.split('');
      answerChars.forEach(ch => parser.feed(ch));

      parser.finish();

      expect(parser.answer).toBe('Final computed result.');
      // Crucial: Zero tag characters leaked into answer
      expect(parser.answer).not.toContain('<');
      expect(parser.answer).not.toContain('thinking');
    });

    it('1.2 should handle 2-character chunk boundaries cutting across open and close tags', () => {
      const { StreamMessageParser } = env.sandbox;
      const thinkingDeltas: string[] = [];
      const answerDeltas: string[] = [];

      const parser = new StreamMessageParser({
        onThinkingChunk: (delta: string) => thinkingDeltas.push(delta),
        onAnswerChunk: (delta: string) => answerDeltas.push(delta),
      });

      // Preceding answer + split opening tag: '<t', 'hi', 'nk', 'in', 'g>'
      parser.feed('Prefix ');
      parser.feed('<t');
      parser.feed('hi');
      parser.feed('nk');
      parser.feed('in');
      parser.feed('g>Internal insight</');
      parser.feed('th');
      parser.feed('in');
      parser.feed('ki');
      parser.feed('ng');
      parser.feed('> Postfix response');
      parser.finish();

      expect(parser.thinking).toBe('Internal insight');
      expect(parser.answer).toBe('Prefix  Postfix response');
      expect(parser.insideThinking).toBe(false);
    });

    it('1.3 should not get trapped or drop decoy tags that resemble <thinking> (e.g. <thinker>, <table>, <thin>)', () => {
      const { StreamMessageParser } = env.sandbox;
      const answerDeltas: string[] = [];

      const parser = new StreamMessageParser({
        onAnswerChunk: (delta: string) => answerDeltas.push(delta),
      });

      // Adversarial decoy tags
      parser.feed('Analysis: ');
      parser.feed('<thin');
      parser.feed('gs are fine> and ');
      parser.feed('<thinker');
      parser.feed('> person and ');
      parser.feed('<table><tr><td>data</td></tr></table>');
      parser.finish();

      const combined = answerDeltas.join('');
      expect(combined).toContain('<things are fine>');
      expect(combined).toContain('<thinker>');
      expect(combined).toContain('<table><tr><td>data</td></tr></table>');
      expect(parser.insideThinking).toBe(false);
      expect(parser.thinking).toBe('');
    });

    it('1.4 should gracefully handle unclosed thinking blocks when stream terminates unexpectedly', () => {
      const { StreamMessageParser } = env.sandbox;
      const parser = new StreamMessageParser();

      parser.feed('Beginning <thinking>This reasoning was cut short by network error');
      // Stream terminates without </thinking>
      parser.finish();

      expect(parser.insideThinking).toBe(true);
      expect(parser.thinking).toBe('This reasoning was cut short by network error');
      expect(parser.answer).toBe('Beginning ');
    });

    it('1.5 should handle nested or duplicate <thinking> tags without infinite loop or buffer corruption', () => {
      const { StreamMessageParser } = env.sandbox;
      const parser = new StreamMessageParser();

      // Nested thinking tags
      parser.feed('<thinking>Outer <thinking>inner block</thinking> trailing</thinking> Done');
      parser.finish();

      expect(parser.insideThinking).toBe(false);
      expect(parser.thinking).toContain('Outer <thinking>inner block');
      expect(parser.answer).toContain('Done');
    });

    it('1.6 should process multiple sequential thinking and answer blocks in the same stream', () => {
      const { StreamMessageParser } = env.sandbox;
      const completions: any[] = [];

      const parser = new StreamMessageParser({
        onThinkingComplete: (stats: any) => completions.push(stats),
      });

      parser.feed('<thinking>Phase 1</thinking>Step 1 complete. ');
      parser.feed('<thinking>Phase 2</thinking>Step 2 complete. ');
      parser.feed('<thinking>Phase 3</thinking>Step 3 complete.');
      parser.finish();

      expect(completions.length).toBe(3);
      expect(completions[0].text).toBe('Phase 1');
      expect(completions[1].text).toBe('Phase 1Phase 2'); // Cumulative thinking buffer
      expect(parser.answer).toBe('Step 1 complete. Step 2 complete. Step 3 complete.');
    });

    it('1.7 should handle empty <thinking></thinking> tag cleanly', () => {
      const { StreamMessageParser } = env.sandbox;
      let completed = false;

      const parser = new StreamMessageParser({
        onThinkingComplete: () => { completed = true; },
      });

      parser.feed('<thinking></thinking>Immediate answer.');
      parser.finish();

      expect(completed).toBe(true);
      expect(parser.thinking).toBe('');
      expect(parser.answer).toBe('Immediate answer.');
    });

    it('1.8 should support explicit isThinkingProtocol flag without XML tag wrapping', () => {
      const { StreamMessageParser } = env.sandbox;
      const thinkingChunks: string[] = [];

      const parser = new StreamMessageParser({
        onThinkingChunk: (delta: string) => thinkingChunks.push(delta),
      });

      // Feed with protocol flag
      parser.feed('Protocol reasoning token 1 ', true);
      parser.feed('Protocol reasoning token 2', true);

      expect(parser.insideThinking).toBe(true);
      expect(parser.thinking).toBe('Protocol reasoning token 1 Protocol reasoning token 2');
      expect(parser.answer).toBe('');
    });
  });

  describe('Suite 2: High-Throughput Typewriter Queue Bursts & Non-Blocking Drainage', () => {
    it('2.1 should drain a massive burst of 10,000 characters with dynamic acceleration in <= 85 ticks without dropping characters', () => {
      const { TypewriterRenderer } = env.sandbox;
      let assembledText = '';
      let tickCount = 0;
      let isCompleted = false;

      const renderer = new TypewriterRenderer({
        tickIntervalMs: 16,
        onTick: (delta: string) => {
          assembledText += delta;
        },
        onComplete: () => {
          isCompleted = true;
        },
      });

      // Generate a massive payload of 10,000 characters
      const massivePayload = 'X'.repeat(10000);
      renderer.enqueue(massivePayload);
      renderer.end();

      // Step manually through ticks to simulate animation loop and measure ticks
      while (renderer.queue.length > 0 && tickCount < 100) {
        tickCount++;
        const len = renderer.queue.length;
        let count = 1;
        if (len > 150) {
          count = Math.min(len, Math.ceil(len / 6));
        } else if (len > 50) {
          count = 4;
        } else if (len > 15) {
          count = 2;
        }
        renderer.tick(count);
      }

      // Standard drain without acceleration would take 5,000 ticks.
      // Dynamic acceleration ladder drains 10,000 chars in ~80 ticks (1.28 seconds)
      expect(tickCount).toBeLessThanOrEqual(85);
      expect(assembledText.length).toBe(10000);
      expect(assembledText).toBe(massivePayload);
      expect(renderer.queue.length).toBe(0);
    });

    it('2.2 should maintain strict FIFO character ordering when multiple rapid bursts arrive during active drainage', () => {
      const { TypewriterRenderer } = env.sandbox;
      let output = '';

      const renderer = new TypewriterRenderer({
        onTick: (delta: string) => { output += delta; },
      });

      // Burst 1: 500 chars of 'A'
      renderer.enqueue('A'.repeat(500));
      renderer.tick(50); // Partially drain

      // Burst 2: 500 chars of 'B'
      renderer.enqueue('B'.repeat(500));
      renderer.tick(50);

      // Burst 3: 500 chars of 'C'
      renderer.enqueue('C'.repeat(500));
      renderer.flush(); // Flush remaining

      expect(output.length).toBe(1500);
      // Verify ordering: all As precede all Bs which precede all Cs
      const firstB = output.indexOf('B');
      const firstC = output.indexOf('C');
      expect(firstB).toBe(500);
      expect(firstC).toBe(1000);
    });

    it('2.3 should immediately dump all queued characters when flush() is invoked under 15,000 char load', () => {
      const { TypewriterRenderer } = env.sandbox;
      let totalReceived = '';
      let completed = false;

      const renderer = new TypewriterRenderer({
        onTick: (delta: string) => { totalReceived += delta; },
        onComplete: () => { completed = true; },
      });

      renderer.enqueue('MASSIVE_BURST_'.repeat(1000)); // 14,000 chars
      expect(renderer.queue.length).toBe(14000);

      renderer.flush();

      expect(renderer.queue.length).toBe(0);
      expect(totalReceived.length).toBe(14000);
      expect(completed).toBe(true);
      expect(renderer.isActive).toBe(false);
    });

    it('2.4 should halt timer and clear queue cleanly when reset() is called during an active burst', () => {
      const { TypewriterRenderer } = env.sandbox;
      const renderer = new TypewriterRenderer({
        onTick: vi.fn(),
      });

      renderer.enqueue('1234567890'.repeat(100));
      expect(renderer.isActive).toBe(true);
      expect(renderer.queue.length).toBe(1000);

      renderer.reset();

      expect(renderer.isActive).toBe(false);
      expect(renderer.queue).toBe('');
      expect(renderer.isStreamEnded).toBe(false);
    });

    it('2.5 should ignore empty strings, null, and undefined enqueues without throwing', () => {
      const { TypewriterRenderer } = env.sandbox;
      const renderer = new TypewriterRenderer();

      expect(() => {
        renderer.enqueue('');
        renderer.enqueue(null);
        renderer.enqueue(undefined);
      }).not.toThrow();

      expect(renderer.queue).toBe('');
      expect(renderer.isActive).toBe(false);
    });
  });

  // SUITE 3: Code Block Formatting, Multilingual Syntax, XSS & Copy Race Conditions
  describe('Suite 3: Code Block Formatting, XSS Sanitization & Copy Button Race Conditions', () => {
    it('3.1 should highlight diverse programming language tokens with VS Code Dark+ classes', () => {
      const { formatCodeWithDarkPlusTokens } = env.sandbox;

      const testCases = [
        { lang: 'python', code: 'def calculate(x, y):\n    return x + y # sum' },
        { lang: 'typescript', code: 'const sum: number = (a, b) => a + b;' },
        { lang: 'sql', code: 'SELECT * FROM users WHERE active = 1;' },
        { lang: 'bash', code: 'export PATH="/usr/bin:$PATH"' },
      ];

      testCases.forEach(({ lang, code }) => {
        const html = formatCodeWithDarkPlusTokens(code, lang);
        expect(html).toContain(`data-language="${lang}"`);
        expect(html).toContain(`class="lang-text">${lang}</span>`);
        expect(html).toContain('btn-copy-code');
        expect(html).toContain('chat-code-pre');
        expect(html).toContain('chat-code-content');
      });
    });

    it('3.2 should sanitize malicious XSS payloads in code blocks (adversarial script injection)', () => {
      const { formatCodeWithDarkPlusTokens } = env.sandbox;

      const xssSnippet = '<script>window.pwned=true;</script><img src="x" onerror="stealCookies()">';
      const formatted = formatCodeWithDarkPlusTokens(xssSnippet, 'html');

      // Crucial: Must be escaped into &lt; and &gt;
      expect(formatted).not.toContain('<script>');
      expect(formatted).toContain('&lt;script&gt;');
      expect(formatted).toContain('&lt;/script&gt;');
      expect(formatted).toContain('&lt;img src=');
    });

    it('3.3 should handle rapid copy button click bursts (30 clicks in 50ms) without crash or state desync', () => {
      const { attachCopyButtonHandler, document } = env.sandbox;
      const button = document.createElement('button');
      button.className = 'btn-copy-code';
      const icon = document.createElement('span');
      icon.className = 'codicon codicon-copy';
      const label = document.createElement('span');
      label.className = 'copy-label';
      label.textContent = 'Copy';
      button.appendChild(icon);
      button.appendChild(label);

      const sampleCode = 'console.log("Adversarial copy test");';
      attachCopyButtonHandler(button, sampleCode);

      // Simulate 30 rapid clicks
      for (let i = 0; i < 30; i++) {
        button.click();
      }

      // Check electron clipboard was invoked 30 times with exact code
      expect(env.mockElectronClipboard.writeText).toHaveBeenCalledTimes(30);
      expect(env.mockElectronClipboard.writeText).toHaveBeenLastCalledWith(sampleCode);

      expect(button.classList.contains('copied')).toBe(true);
      expect(label.textContent).toBe('Copied!');
      expect(icon.classList.contains('codicon-check')).toBe(true);
    });

    it('3.4 should fall back to navigator.clipboard when window.electronClipboard is not present', () => {
      const { attachCopyButtonHandler, document, window } = env.sandbox;
      delete window.electronClipboard; // Remove electron clipboard

      const button = document.createElement('button');
      button.className = 'btn-copy-code';
      const label = document.createElement('span');
      label.className = 'copy-label';
      button.appendChild(label);

      attachCopyButtonHandler(button, 'fallback code');
      button.click();

      expect(env.mockNavigator.clipboard.writeText).toHaveBeenCalledWith('fallback code');
      expect(label.textContent).toBe('Copied!');
    });

    it('3.5 should prevent click event from bubbling up to parent containers', () => {
      const { attachCopyButtonHandler, document } = env.sandbox;
      const parent = document.createElement('div');
      const parentClickSpy = vi.fn();
      parent.addEventListener('click', parentClickSpy);

      const button = document.createElement('button');
      button.className = 'btn-copy-code';
      parent.appendChild(button);

      attachCopyButtonHandler(button, 'code');
      button.click();

      // Parent click listener should not be triggered due to stopPropagation
      expect(parentClickSpy).not.toHaveBeenCalled();
    });
  });

  describe('Suite 4: Out-of-Order & Adversarial Plan Streaming Events', () => {
    it('4.1 should return null gracefully when plan:step_start arrives before plan:init is called', () => {
      const { handlePlanStreamMessage } = env.sandbox;

      const outOfOrderMsg = {
        type: 'plan:step_start',
        params: { subtaskId: 'ghost-step-1' },
      };

      const result = handlePlanStreamMessage(outOfOrderMsg);
      expect(result).toBeNull(); // No crash
    });

    it('4.2 should handle plan:step_start referencing a phantom non-existent subtask ID without corrupting valid subtasks', () => {
      const { handlePlanStreamMessage, getCurrentTaskPlan } = env.sandbox;

      handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          id: 'plan-adv-1',
          title: 'Adversarial Plan',
          subtasks: [
            { id: 'task-real-1', title: 'Real Task 1' },
            { id: 'task-real-2', title: 'Real Task 2' },
          ],
        },
      });

      expect(() => {
        handlePlanStreamMessage({
          type: 'plan:step_start',
          params: { subtaskId: 'task-phantom-99' },
        });
      }).not.toThrow();

      const plan = getCurrentTaskPlan();
      expect(plan).toBeDefined();
      expect(plan.subtasks[0].status).toBe('in_progress');
      expect(plan.subtasks[1].status).toBe('pending');
    });

    it('4.3 should handle out-of-order plan:step_done received for a subtask that was still pending', () => {
      const { handlePlanStreamMessage, getCurrentTaskPlan } = env.sandbox;

      handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          id: 'plan-adv-2',
          title: 'Out of Order Plan',
          subtasks: [
            { id: 'step-1', title: 'Step 1' },
            { id: 'step-2', title: 'Step 2' },
          ],
        },
      });

      // Directly mark step-1 as completed without step_start
      handlePlanStreamMessage({
        type: 'plan:step_done',
        params: { subtaskId: 'step-1', status: 'completed' },
      });

      const plan = getCurrentTaskPlan();
      expect(plan.subtasks[0].status).toBe('completed');
      expect(plan.progress).toBe(50);
      // Auto-advance activates step-2
      expect(plan.subtasks[1].status).toBe('in_progress');
    });

    it('4.4 should prevent duplicate plan:step_done events from causing progress calculation overflow (>100%)', () => {
      const { handlePlanStreamMessage, getCurrentTaskPlan } = env.sandbox;

      handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          id: 'plan-adv-3',
          title: 'Duplicate Done Plan',
          subtasks: [
            { id: 'step-single', title: 'Only Step' },
          ],
        },
      });

      // Send step_done 5 times
      for (let i = 0; i < 5; i++) {
        handlePlanStreamMessage({
          type: 'plan:step_done',
          params: { subtaskId: 'step-single', status: 'completed' },
        });
      }

      const plan = getCurrentTaskPlan();
      expect(plan.status).toBe('completed');
      expect(plan.progress).toBe(100); // Caps at 100%, never exceeds
    });

    it('4.5 should handle a rapid burst of 100 plan:step_log entries without dropping messages or DOM freeze', () => {
      const { handlePlanStreamMessage, getCurrentTaskPlan, document } = env.sandbox;

      handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          id: 'plan-adv-4',
          title: 'Logging Stress Plan',
          subtasks: [{ id: 'st-1', title: 'Stress Task' }],
        },
      });

      // Flood 100 log messages
      for (let i = 0; i < 100; i++) {
        handlePlanStreamMessage({
          type: 'plan:step_log',
          params: {
            subtaskId: 'st-1',
            message: `Log event batch #${i}: metric validation passed`,
            level: i % 2 === 0 ? 'info' : 'warn',
          },
        });
      }

      const plan = getCurrentTaskPlan();
      // 1 initial plan creation log + 100 streamed step logs = 101 logs
      expect(plan.logs.length).toBe(101);

      const consoleEl = document.getElementById('plan-logs-console');
      expect(consoleEl.children.length).toBe(100);
      expect(consoleEl.scrollTop).toBe(consoleEl.scrollHeight);
    });

    it('4.6 should process failed subtask status without terminating plan state machine unexpectedly', () => {
      const { handlePlanStreamMessage, getCurrentTaskPlan } = env.sandbox;

      handlePlanStreamMessage({
        type: 'plan:init',
        params: {
          id: 'plan-adv-5',
          title: 'Failure Recovery Plan',
          subtasks: [
            { id: 'f-1', title: 'Faulty Task' },
            { id: 'f-2', title: 'Recovery Task' },
          ],
        },
      });

      handlePlanStreamMessage({
        type: 'plan:step_done',
        params: {
          subtaskId: 'f-1',
          status: 'failed',
          message: 'Syntax error detected in AST pass',
        },
      });

      const plan = getCurrentTaskPlan();
      expect(plan.subtasks[0].status).toBe('failed');
      const errLog = plan.logs.find((l: any) => l.level === 'error');
      expect(errLog).toBeDefined();
      expect(errLog.message).toContain('Syntax error detected');
    });
  });

  // SUITE 5: Rapid Diff Proposals, Duplicate Diff IDs & Zero-Buffer Invariant
  describe('Suite 5: Rapid Diff Proposals, Duplicate IDs & Zero-Buffer Invariant Preservation', () => {
    it('5.1 should update existing diff in-place when rapid successive proposals target the SAME file path', () => {
      const { handleDiffStreamMessage, getReviewDiffs, document } = env.sandbox;

      // Propose diff for solve.py 10 times with increasing additions
      for (let i = 1; i <= 10; i++) {
        handleDiffStreamMessage({
          type: 'diff:file_proposed',
          params: {
            filePath: 'solve.py',
            originalContent: 'def solve(): pass',
            proposedContent: `def solve(): return ${i}`,
            linesAdded: i,
            linesDeleted: 0,
            description: `Iteration ${i}`,
          },
        });
      }

      const diffs = getReviewDiffs();
      // Crucial: Must NOT create 10 redundant duplicate entries for solve.py!
      expect(diffs.length).toBe(1);
      expect(diffs[0].proposedContent).toBe('def solve(): return 10');
      expect(diffs[0].linesAdded).toBe(10);
      expect(diffs[0].description).toBe('Iteration 10');

      const badge = document.getElementById('review-tab-badge');
      expect(badge.textContent).toBe('1');
    });

    it('5.2 should accommodate multiple distinct files even if sidecar emits identical duplicate diff IDs', () => {
      const { handleDiffStreamMessage, getReviewDiffs } = env.sandbox;

      // Duplicate diff ID for file1.ts and file2.ts
      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'colliding-diff-id',
          filePath: 'src/file1.ts',
          proposedContent: 'export const A = 1;',
        },
      });

      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'colliding-diff-id',
          filePath: 'src/file2.ts',
          proposedContent: 'export const B = 2;',
        },
      });

      const diffs = getReviewDiffs();
      expect(diffs.length).toBe(2);
      expect(diffs[0].filePath).toBe('src/file1.ts');
      expect(diffs[1].filePath).toBe('src/file2.ts');
    });

    it('5.3 should preserve the Zero-Buffer invariant: openReviewDiff never writes to disk and leaves buffer clean', async () => {
      const { handleDiffStreamMessage, openReviewDiff, document } = env.sandbox;

      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-zb-1',
          filePath: 'solve.py',
          originalContent: 'def solve():\n    return 42\n',
          proposedContent: 'def solve():\n    return 100\n',
        },
      });

      // Trigger diff inspection
      const result = await openReviewDiff('diff-zb-1');
      expect(result).toBe(true);

      // INVARIANT 1: Zero disk mutation during preview
      expect(env.mockElectronFS.writeFile).not.toHaveBeenCalled();

      // INVARIANT 2: Open document buffer is NOT marked dirty
      expect(env.openDoc.isDirty).toBe(false);

      // INVARIANT 3: Monaco Diff Editor displays original vs proposed models
      const { original, modified } = env.getDiffModels();
      expect(original).toBeDefined();
      expect(modified).toBeDefined();
      expect(original.uri.toString()).toBe('agent-orig://solve.py');
      expect(modified.uri.toString()).toBe('agent-proposed://solve.py');

      // INVARIANT 4: Diff Mount shown, regular editor mount hidden
      const diffMount = document.getElementById('diff-editor-mount');
      const editorMount = document.getElementById('editor-mount');
      expect(diffMount.style.display).toBe('block');
      expect(editorMount.style.display).toBe('none');
    });

    it('5.4 should smoothly switch between multiple diff previews in rapid succession without errors', async () => {
      const { handleDiffStreamMessage, openReviewDiff, getActiveDiffReviewId } = env.sandbox;

      const files = ['a.py', 'b.ts', 'c.css', 'd.json', 'e.html'];
      files.forEach((fp, idx) => {
        handleDiffStreamMessage({
          type: 'diff:file_proposed',
          params: {
            id: `diff-rapid-${idx}`,
            filePath: fp,
            proposedContent: `// content for ${fp}`,
          },
        });
      });

      // Rapidly toggle preview across all 5 diffs
      for (let i = 0; i < files.length; i++) {
        const opened = await openReviewDiff(`diff-rapid-${i}`);
        expect(opened).toBe(true);
      }

      const { modified } = env.getDiffModels();
      expect(modified.uri.toString()).toBe('agent-proposed://e.html');
      expect(getActiveDiffReviewId()).toBe('diff-rapid-4');
    });

    it('5.5 should restore normal Monaco editor and view state cleanly upon closeReviewDiff', async () => {
      const { handleDiffStreamMessage, openReviewDiff, closeReviewDiff, getActiveDiffReviewId, document } = env.sandbox;

      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-close-test',
          filePath: 'solve.py',
          proposedContent: 'def solve(): return 999',
        },
      });

      await openReviewDiff('diff-close-test');
      expect(document.getElementById('diff-editor-mount').style.display).toBe('block');

      closeReviewDiff();

      expect(document.getElementById('diff-editor-mount').style.display).toBe('none');
      expect(document.getElementById('editor-mount').style.display).toBe('block');
      expect(getActiveDiffReviewId()).toBeNull();
      // Zero disk writes occurred
      expect(env.mockElectronFS.writeFile).not.toHaveBeenCalled();
    });

    it('5.6 should strictly contrast acceptReviewDiff (disk write) vs discardReviewDiff (zero disk write)', async () => {
      const { handleDiffStreamMessage, acceptReviewDiff, discardReviewDiff, getReviewDiffs } = env.sandbox;

      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-accept-me',
          filePath: 'accept.ts',
          proposedContent: 'export const ACCEPTED = true;',
        },
      });

      handleDiffStreamMessage({
        type: 'diff:file_proposed',
        params: {
          id: 'diff-discard-me',
          filePath: 'discard.ts',
          proposedContent: 'export const DISCARDED = true;',
        },
      });

      expect(getReviewDiffs().length).toBe(2);

      await acceptReviewDiff('diff-accept-me');
      expect(env.mockElectronFS.writeFile).toHaveBeenCalledWith('accept.ts', 'export const ACCEPTED = true;');
      expect(getReviewDiffs().length).toBe(1);
      expect(getReviewDiffs()[0].id).toBe('diff-discard-me');

      env.mockElectronFS.writeFile.mockClear();

      discardReviewDiff('diff-discard-me');
      expect(env.mockElectronFS.writeFile).not.toHaveBeenCalled();
      expect(getReviewDiffs().length).toBe(0);
    });
  });
});
