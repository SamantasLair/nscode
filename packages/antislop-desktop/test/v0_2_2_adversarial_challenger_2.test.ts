import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import os from 'os';

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
  setSelectionRange?: (start?: number, end?: number) => void;
  dispatchEvent: (event: any) => boolean;
  click: () => void;
  getBoundingClientRect: () => { width: number; height: number; top: number; left: number };
}

function matchesSelector(el: MockElement, sel: string): boolean {
  const parts = sel.split(/(?=[.#\[])/);
  for (const p of parts) {
    if (p.startsWith('#') && el.id !== p.slice(1)) return false;
    if (p.startsWith('.') && !el.classList.contains(p.slice(1))) return false;
    if (p.startsWith('[') && p.endsWith(']')) {
      const inner = p.slice(1, -1);
      const [attrName, expectedVal] = inner.split('=');
      const cleanExpected = expectedVal ? expectedVal.replace(/['"]/g, '') : undefined;
      const actual = el.getAttribute(attrName);
      if (cleanExpected !== undefined) {
        if (actual !== cleanExpected) return false;
      } else {
        if (!el.hasAttribute(attrName)) return false;
      }
    }
  }
  return true;
}

function createMockDomElement(tag = 'div', id = ''): MockElement {
  const classListSet = new Set<string>();
  const styleMap: Record<string, string> = {};
  const datasetMap: Record<string, string> = {};
  const attributesMap: Record<string, string> = {};
  const listeners: Record<string, Function[]> = {};
  const childrenList: MockElement[] = [];

  let textVal = '';

  const el: MockElement = {
    id,
    tagName: tag.toUpperCase(),
    className: '',
    classList: {
      add: (...cls: string[]) => {
        cls.forEach(c => classListSet.add(c));
        el.className = Array.from(classListSet).join(' ');
      },
      remove: (...cls: string[]) => {
        cls.forEach(c => classListSet.delete(c));
        el.className = Array.from(classListSet).join(' ');
      },
      contains: (cls: string) => classListSet.has(cls),
      toggle: (cls: string, force?: boolean) => {
        let shouldAdd = force !== undefined ? force : !classListSet.has(cls);
        if (shouldAdd) classListSet.add(cls);
        else classListSet.delete(cls);
        el.className = Array.from(classListSet).join(' ');
        return shouldAdd;
      },
    },
    style: new Proxy(styleMap, {
      set(target, prop: string, val: string) {
        target[prop] = String(val);
        return true;
      },
      get(target, prop: string) {
        return target[prop] || '';
      },
    }),
    dataset: new Proxy(datasetMap, {
      set(target, prop: string, val: string) {
        target[prop] = String(val);
        return true;
      },
      get(target, prop: string) {
        return target[prop];
      },
    }),
    attributes: attributesMap,
    getAttribute: (attr: string) => {
      if (attr === 'id') return el.id;
      if (attr === 'class') return el.className;
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        return datasetMap[key] || null;
      }
      return attributesMap[attr] !== undefined ? attributesMap[attr] : null;
    },
    setAttribute: (attr: string, val: string) => {
      attributesMap[attr] = String(val);
      if (attr === 'id') el.id = String(val);
      if (attr === 'class') {
        el.className = String(val);
        classListSet.clear();
        String(val).split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
      }
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        datasetMap[key] = String(val);
      }
    },
    removeAttribute: (attr: string) => {
      delete attributesMap[attr];
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        delete datasetMap[key];
      }
    },
    hasAttribute: (attr: string) => {
      if (attr === 'id') return Boolean(el.id);
      if (attr === 'class') return Boolean(el.className);
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        return key in datasetMap;
      }
      return attr in attributesMap;
    },
    get textContent() {
      if (childrenList.length > 0) {
        return childrenList.map(c => c.textContent).join('');
      }
      return textVal;
    },
    set textContent(val: string) {
      textVal = String(val);
      childrenList.length = 0;
    },
    get innerHTML() {
      return textVal;
    },
    set innerHTML(val: string) {
      textVal = String(val);
      childrenList.length = 0;
      if (!val) return;

      const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/>/g;
      let match: RegExpExecArray | null;
      while ((match = tagRegex.exec(val)) !== null) {
        const tagName = match[1] || match[4];
        const rawAttrs = match[2] || match[5] || '';
        const innerContent = match[3] || '';
        const child = createMockDomElement(tagName);

        const classMatch = /class="([^"]*)"/.exec(rawAttrs);
        if (classMatch) {
          classMatch[1].split(/\s+/).filter(Boolean).forEach(c => child.classList.add(c));
        }
        const titleMatch = /title="([^"]*)"/.exec(rawAttrs);
        if (titleMatch) child.title = titleMatch[1];

        const idMatch = /id="([^"]*)"/.exec(rawAttrs);
        if (idMatch) child.id = idMatch[1];

        const dataMatch = /data-([a-zA-Z0-9\-]+)="([^"]*)"/g;
        let dMatch: RegExpExecArray | null;
        while ((dMatch = dataMatch.exec(rawAttrs)) !== null) {
          child.setAttribute(`data-${dMatch[1]}`, dMatch[2]);
        }

        if (innerContent.includes('<')) {
          child.innerHTML = innerContent;
        } else {
          child.textContent = innerContent;
        }
        el.appendChild(child);
      }
    },
    value: '',
    disabled: false,
    title: '',
    children: childrenList,
    parentNode: null,
    addEventListener: (event: string, handler: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: Function) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    appendChild: (child: MockElement) => {
      child.parentNode = el;
      childrenList.push(child);
      return child;
    },
    prepend: (child: MockElement) => {
      child.parentNode = el;
      childrenList.unshift(child);
    },
    removeChild: (child: MockElement) => {
      const idx = childrenList.indexOf(child);
      if (idx !== -1) {
        childrenList.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector: (sel: string) => {
      const commaParts = sel.split(',').map(s => s.trim());
      const search = (node: MockElement): MockElement | null => {
        for (const child of node.children) {
          for (const p of commaParts) {
            if (matchesSelector(child, p)) return child;
          }
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(el);
    },
    querySelectorAll: (sel: string) => {
      const commaParts = sel.split(',').map(s => s.trim());
      const results: MockElement[] = [];
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
    getBoundingClientRect: () => ({ width: 100, height: 30, top: 0, left: 0 }),
  };

  return el;
}

function setupAdversarialSandbox(jsContent: string) {
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

  let modelVersionId = 1;
  let modelContent = 'def quicksort(arr):\n    return sorted(arr)\n';

  const editorSetValueSpy = vi.fn((val: string) => {
    modelContent = val;
    modelVersionId++;
  });

  const mockModel: any = {
    getValue: vi.fn(() => modelContent),
    setValue: editorSetValueSpy,
    getAlternativeVersionId: vi.fn(() => modelVersionId),
    uri: { fsPath: '/workspace/quicksort.py', path: '/workspace/quicksort.py', scheme: 'file', toString: () => 'file:///workspace/quicksort.py' },
  };

  const openDoc: any = {
    id: 'quicksort.py',
    filePath: 'quicksort.py',
    fileName: 'quicksort.py',
    language: 'python',
    isDirty: false,
    initialVersionId: 1,
    model: mockModel,
    viewState: { cursor: { lineNumber: 5, column: 12 } },
  };

  const tab2Model: any = {
    getValue: vi.fn(() => 'export const API_KEY = "xyz";'),
    setValue: vi.fn(),
    getAlternativeVersionId: vi.fn(() => 42),
    uri: { fsPath: '/workspace/src/config.ts', path: '/workspace/src/config.ts', scheme: 'file', toString: () => 'file:///workspace/src/config.ts' },
  };
  const doc2: any = {
    id: 'src/config.ts',
    filePath: 'src/config.ts',
    fileName: 'config.ts',
    language: 'typescript',
    isDirty: true, // Dirty with unsaved changes
    initialVersionId: 40,
    model: tab2Model,
    viewState: { cursor: { lineNumber: 1, column: 20 } },
  };

  const tab3Model: any = {
    getValue: vi.fn(() => 'package main\nfunc main() {}'),
    setValue: vi.fn(),
    getAlternativeVersionId: vi.fn(() => 10),
    uri: { fsPath: '/workspace/main.go', path: '/workspace/main.go', scheme: 'file', toString: () => 'file:///workspace/main.go' },
  };
  const doc3: any = {
    id: 'main.go',
    filePath: 'main.go',
    fileName: 'main.go',
    language: 'go',
    isDirty: true, // Dirty with unsaved changes
    initialVersionId: 8,
    model: tab3Model,
    viewState: { cursor: { lineNumber: 2, column: 5 } },
  };

  const documentsMap = new Map<string, any>([
    ['quicksort.py', openDoc],
    ['src/config.ts', doc2],
    ['main.go', doc3],
  ]);

  const mockDocManager: any = {
    activeDocId: 'quicksort.py',
    activeDoc: openDoc,
    documents: documentsMap,
    renderTabs: vi.fn(),
    syncActiveChrome: vi.fn(),
    detectLanguage: vi.fn((fp: string) => {
      if (fp.endsWith('.ts')) return 'typescript';
      if (fp.endsWith('.go')) return 'go';
      if (fp.endsWith('.py')) return 'python';
      return 'plaintext';
    }),
  };

  const mockEditor: any = {
    saveViewState: vi.fn(() => ({ cursor: { lineNumber: 5, column: 12 } })),
    restoreViewState: vi.fn(),
    setModel: vi.fn(),
    focus: vi.fn(),
  };

  let diffEditorOriginalModel: any = null;
  let diffEditorModifiedModel: any = null;
  let diffEditorOptions: any = null;

  const mockDiffEditor: any = {
    setModel: vi.fn((models: { original: any; modified: any }) => {
      diffEditorOriginalModel = models?.original;
      diffEditorModifiedModel = models?.modified;
    }),
    getModel: vi.fn(() => ({
      original: diffEditorOriginalModel,
      modified: diffEditorModifiedModel,
    })),
  };

  const modelRegistry = new Map<string, any>();

  const mockElectronFS: any = {
    writeFile: vi.fn(async (_fp: string, _content: string) => ({ success: true })),
    readFile: vi.fn(async (fp: string) => {
      if (fp.includes('missing')) throw new Error('ENOENT: file not found');
      return { success: true, content: `original file content on disk for ${fp}` };
    }),
  };

  const sandbox: any = {
    window: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    monaco: {
      Uri: {
        parse: vi.fn((u: string) => ({
          scheme: u.split('://')[0],
          path: u.split('://')[1] || '',
          toString: () => u,
        })),
      },
      editor: {
        getModel: vi.fn((uri?: any) => {
          if (uri && uri.toString && modelRegistry.has(uri.toString())) {
            return modelRegistry.get(uri.toString());
          }
          return mockModel;
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
        createDiffEditor: vi.fn((_mount: any, opts: any) => {
          diffEditorOptions = opts;
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
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    if (globalThis.currentWorkspaceRoot) currentWorkspaceRoot = globalThis.currentWorkspaceRoot;

    globalThis.setReviewDiffs = typeof setReviewDiffs !== 'undefined' ? setReviewDiffs : undefined;
    globalThis.getReviewDiffs = typeof getReviewDiffs !== 'undefined' ? getReviewDiffs : undefined;
    globalThis.addReviewDiff = typeof addReviewDiff !== 'undefined' ? addReviewDiff : undefined;
    globalThis.openReviewDiff = typeof openReviewDiff !== 'undefined' ? openReviewDiff : undefined;
    globalThis.closeReviewDiff = typeof closeReviewDiff !== 'undefined' ? closeReviewDiff : undefined;
    globalThis.acceptReviewDiff = typeof acceptReviewDiff !== 'undefined' ? acceptReviewDiff : undefined;
    globalThis.discardReviewDiff = typeof discardReviewDiff !== 'undefined' ? discardReviewDiff : undefined;
    globalThis.acceptAllReviewDiffs = typeof acceptAllReviewDiffs !== 'undefined' ? acceptAllReviewDiffs : undefined;
    globalThis.discardAllReviewDiffs = typeof discardAllReviewDiffs !== 'undefined' ? discardAllReviewDiffs : undefined;
    globalThis.computeDiffStats = typeof computeDiffStats !== 'undefined' ? computeDiffStats : undefined;
    globalThis.renderReviewPane = typeof renderReviewPane !== 'undefined' ? renderReviewPane : undefined;
    globalThis.showDiffEditor = typeof showDiffEditor !== 'undefined' ? showDiffEditor : undefined;
    globalThis.editorEventBridge = typeof editorEventBridge !== 'undefined' ? editorEventBridge : undefined;
  `;

  vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);

  return {
    sandbox,
    elementRegistry,
    spies: {
      writeFile: mockElectronFS.writeFile,
      readFile: mockElectronFS.readFile,
      editorSetValue: editorSetValueSpy,
      editorSetModel: mockEditor.setModel,
      editorSaveViewState: mockEditor.saveViewState,
      editorRestoreViewState: mockEditor.restoreViewState,
      editorFocus: mockEditor.focus,
    },
    openDoc,
    doc2,
    doc3,
    mockDocManager,
    mockEditor,
    mockDiffEditor,
    modelRegistry,
    getDiffEditorState: () => ({
      options: diffEditorOptions,
      originalModel: diffEditorOriginalModel,
      modifiedModel: diffEditorModifiedModel,
    }),
  };
}

// ADVERSARIAL CHALLENGER 2 TEST SUITE (ZERO-BUFFER DIFF INSPECTION)

describe('Adversarial Challenger 2: Requirement R4 Zero-Buffer Diff Inspection & Review Lifecycle', () => {
  let jsContent: string;

  beforeEach(() => {
    const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
    jsContent = fs.readFileSync(workbenchJsPath, 'utf8');
  });

  // SUITE 1: EMPIRICAL PROOF OF ZERO-BUFFER & ZERO-DISK-WRITE INVARIANTS
  describe('Suite 1: Empirical Proof of Zero-Buffer & Zero-Disk-Write Invariants (R4)', () => {
    it('1.1 openReviewDiff NEVER calls electronFS.writeFile under standard and edge payloads', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      setDiffs([
        { id: 'diff-normal', filePath: 'quicksort.py', originalContent: 'orig', proposedContent: 'prop' },
      ]);
      await openDiff('diff-normal');
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      setDiffs([
        { id: 'diff-empty', filePath: 'empty.py', originalContent: '', proposedContent: '' },
      ]);
      await openDiff('diff-empty');
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      const hugeOrig = Array.from({ length: 10000 }, (_, i) => `line ${i}`).join('\n');
      const hugeProp = Array.from({ length: 10000 }, (_, i) => `modified line ${i}`).join('\n');
      setDiffs([
        { id: 'diff-huge', filePath: 'huge.py', originalContent: hugeOrig, proposedContent: hugeProp },
      ]);
      await openDiff('diff-huge');
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      setDiffs([
        { id: 'diff-missing', filePath: 'missing_nowhere.py', proposedContent: 'new code' },
      ]);
      await openDiff('diff-missing');
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(0);
    });

    it('1.2 openReviewDiff preserves isDirty and AlternativeVersionId of active document model', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      const initialVersionId = ctx.openDoc.model.getAlternativeVersionId();
      expect(ctx.openDoc.isDirty).toBe(false);

      setDiffs([
        { id: 'diff-1', filePath: 'quicksort.py', originalContent: 'old', proposedContent: 'new' },
      ]);

      await openDiff('diff-1');

      // Zero-buffer invariant: active doc model is NOT marked dirty and versionId is NOT mutated
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.openDoc.model.getAlternativeVersionId()).toBe(initialVersionId);
      expect(ctx.spies.editorSetValue).not.toHaveBeenCalled();
    });

    it('1.3 openReviewDiff preserves pre-existing dirty buffer and unsaved edits across preview and closure', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;
      const closeDiff = ctx.sandbox.closeReviewDiff;

      // Simulate active doc already being dirty with unsaved user edits
      ctx.openDoc.isDirty = true;
      ctx.openDoc.initialVersionId = 1;
      const dirtyContent = 'def quicksort(arr):\n    # UNSAVED USER WIP CODE\n    return []';
      ctx.openDoc.model.getValue = vi.fn(() => dirtyContent);

      setDiffs([
        { id: 'diff-1', filePath: 'quicksort.py', proposedContent: 'def quicksort(): pass' },
      ]);

      // Open diff preview
      await openDiff('diff-1');

      // Dirty flag must NOT be cleared or reset by previewing diff
      expect(ctx.openDoc.isDirty).toBe(true);
      expect(ctx.openDoc.model.getValue()).toBe(dirtyContent);

      // Close diff preview
      closeDiff();

      // Upon closing diff, active doc model restored, dirty flag still preserved
      expect(ctx.openDoc.isDirty).toBe(true);
      expect(ctx.openDoc.model.getValue()).toBe(dirtyContent);
      expect(ctx.spies.editorSetModel).toHaveBeenCalledWith(ctx.openDoc.model);
      expect(ctx.spies.editorRestoreViewState).toHaveBeenCalled();
    });

    it('1.4 discardReviewDiff and discardAllReviewDiffs execute with 0 disk writes', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const discardDiff = ctx.sandbox.discardReviewDiff;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      setDiffs([
        { id: 'd-1', filePath: 'a.py', proposedContent: 'a1' },
        { id: 'd-2', filePath: 'b.py', proposedContent: 'b1' },
        { id: 'd-3', filePath: 'c.py', proposedContent: 'c1' },
      ]);

      // Discard single
      discardDiff('d-1');
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Discard all remaining
      discardAll();
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(0);
    });

    it('1.5 virtual URIs agent-orig:// and agent-proposed:// strictly isolate physical workspace models', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      setDiffs([
        { id: 'd-v', filePath: 'src/utils.ts', originalContent: 'const a = 1;', proposedContent: 'const a = 2;' },
      ]);

      await openDiff('d-v');

      const diffState = ctx.getDiffEditorState();
      expect(diffState.originalModel).toBeDefined();
      expect(diffState.modifiedModel).toBeDefined();

      const origUri = diffState.originalModel.uri.toString();
      const propUri = diffState.modifiedModel.uri.toString();

      expect(origUri).toBe('agent-orig://src/utils.ts');
      expect(propUri).toBe('agent-proposed://src/utils.ts');

      // Monaco Diff Editor configured with readOnly and renderSideBySide
      expect(diffState.options.readOnly).toBe(true);
      expect(diffState.options.renderSideBySide).toBe(true);
    });
  });

  describe('Suite 2: Rapid Switching & Concurrency Stress Testing', () => {
    it('2.1 rapid alternating openReviewDiff calls across 5 files without closing (100 switches)', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      const diffFiles = ['alpha.ts', 'beta.ts', 'gamma.ts', 'delta.ts', 'epsilon.ts'];
      const diffList = diffFiles.map((f, i) => ({
        id: `diff-${i}`,
        filePath: f,
        originalContent: `original ${f}`,
        proposedContent: `proposed ${f}`,
      }));

      setDiffs(diffList);

      const startTime = performance.now();

      // Rapidly switch 100 times back and forth without closing
      for (let step = 0; step < 100; step++) {
        const targetId = `diff-${step % 5}`;
        const res = await openDiff(targetId);
        expect(res).toBe(true);
      }

      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(1000); // Must be under 1s

      // Zero disk writes during the entire 100 switches
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();

      // Diff editor mount remains visible, editor mount hidden
      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;
      expect(editorMount.style.display).toBe('none');
      expect(diffMount.style.display).toBe('block');

      // The active diff model points to the final switch ('epsilon.ts')
      const diffState = ctx.getDiffEditorState();
      expect(diffState.modifiedModel.uri.toString()).toBe('agent-proposed://epsilon.ts');
    });

    it('2.2 model caching / reuse: virtual models with agent schemes are reused without tab leaks', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      setDiffs([
        { id: 'diff-reuse', filePath: 'quicksort.py', originalContent: 'v1', proposedContent: 'v1-prop' },
      ]);

      await openDiff('diff-reuse');
      const origModel1 = ctx.getDiffEditorState().originalModel;

      // Update diff proposed content and re-open same diff
      ctx.sandbox.addReviewDiff({
        id: 'diff-reuse',
        filePath: 'quicksort.py',
        originalContent: 'v2',
        proposedContent: 'v2-prop',
      });

      await openDiff('diff-reuse');
      const origModel2 = ctx.getDiffEditorState().originalModel;

      // Models should be reused / updated cleanly
      expect(origModel2).toBe(origModel1);
      expect(origModel1.setValue).toHaveBeenCalledWith('v2');

      // DocumentManager tabs count must remain exactly 3 (no new phantom tabs added)
      expect(ctx.mockDocManager.documents.size).toBe(3);
    });

    it('2.3 50 open/close toggles preserve cursor coordinates and active tab state', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;
      const closeDiff = ctx.sandbox.closeReviewDiff;

      setDiffs([
        { id: 'd-toggle', filePath: 'quicksort.py', originalContent: '1', proposedContent: '2' },
      ]);

      const editorMount = ctx.elementRegistry.get('editor-mount')!;
      const diffMount = ctx.elementRegistry.get('diff-editor-mount')!;

      for (let i = 0; i < 50; i++) {
        await openDiff('d-toggle');
        expect(diffMount.style.display).toBe('block');
        expect(editorMount.style.display).toBe('none');

        closeDiff();
        expect(diffMount.style.display).toBe('none');
        expect(editorMount.style.display).toBe('block');
      }

      // Cursor viewState preserved and restored on editor
      expect(ctx.spies.editorRestoreViewState).toHaveBeenCalledTimes(50);
      expect(ctx.spies.editorFocus).toHaveBeenCalledTimes(50);
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('Suite 3: Adversarial Boundary & Invalid Diff ID Handling', () => {
    it('3.1 acceptReviewDiff with non-existent or malformed diff IDs returns false without disk writes', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      const badIds = ['non-existent', '', null as any, undefined as any, 12345 as any, { evil: true } as any];

      for (const badId of badIds) {
        const result = await acceptDiff(badId);
        expect(result).toBe(false);
        expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      }
    });

    it('3.2 discardReviewDiff with non-existent diff ID returns false without side effects', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const discardDiff = ctx.sandbox.discardReviewDiff;

      expect(discardDiff('non-existent')).toBe(false);
      expect(discardDiff(null as any)).toBe(false);
      expect(discardDiff(undefined as any)).toBe(false);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('3.3 idempotency: double accept, discard-then-accept, and accept-then-discard', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;
      const discardDiff = ctx.sandbox.discardReviewDiff;

      setDiffs([
        { id: 'diff-idem-1', filePath: 'quicksort.py', proposedContent: 'idem 1' },
        { id: 'diff-idem-2', filePath: 'main.go', proposedContent: 'idem 2' },
      ]);

      const firstAccept = await acceptDiff('diff-idem-1');
      expect(firstAccept).toBe(true);
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1);

      const secondAccept = await acceptDiff('diff-idem-1');
      expect(secondAccept).toBe(false);
      // Ensure NO duplicate disk write occurred
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1);

      const discardRes = discardDiff('diff-idem-2');
      expect(discardRes).toBe(true);

      const acceptAfterDiscard = await acceptDiff('diff-idem-2');
      expect(acceptAfterDiscard).toBe(false);
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('3.4 adversarial diff payloads (missing filePath, undefined lines, empty contents)', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const addDiff = ctx.sandbox.addReviewDiff;

      // Add payload with completely missing properties
      const item = addDiff({
        // no filePath, no id, no originalContent
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.filePath).toBe('quicksort.py'); // fallback
      expect(item.originalContent).toBe('');
      expect(item.proposedContent).toBe('');
      expect(item.linesAdded).toBe(0);
      expect(item.linesDeleted).toBe(0);
    });
  });

  describe('Suite 4: Large Payloads, Performance & Special Encoding Stress Tests', () => {
    it('4.1 massive diff (>10,000 lines payload) computes diff stats and opens preview in <200ms', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;
      const computeStats = ctx.sandbox.computeDiffStats;

      const linesOrig = Array.from({ length: 10000 }, (_, i) => `// Line ${i}: export function func_${i}() { return ${i}; }`).join('\n');
      const linesProp = Array.from({ length: 10500 }, (_, i) => `// Line ${i}: export function func_${i}() { return ${i * 2}; }`).join('\n');

      const t0 = performance.now();
      const stats = computeStats(linesOrig, linesProp);
      const tStats = performance.now() - t0;

      expect(tStats).toBeLessThan(100); // Linear O(N) Set hashing must complete in <100ms
      expect(stats.added).toBeGreaterThan(0);

      setDiffs([
        { id: 'diff-massive', filePath: 'massive.ts', originalContent: linesOrig, proposedContent: linesProp },
      ]);

      const t1 = performance.now();
      await openDiff('diff-massive');
      const tOpen = performance.now() - t1;

      expect(tOpen).toBeLessThan(150);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('4.2 ultra-wide single line (100,000 chars) handles diff preview without buffer overflow', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const openDiff = ctx.sandbox.openReviewDiff;

      const wideOrig = '{"data":[' + '1,'.repeat(50000) + '0]}';
      const wideProp = '{"data":[' + '2,'.repeat(50000) + '0]}';

      setDiffs([
        { id: 'diff-wide', filePath: 'bundle.json', originalContent: wideOrig, proposedContent: wideProp },
      ]);

      const openRes = await openDiff('diff-wide');
      expect(openRes).toBe(true);
      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
    });

    it('4.3 binary strings, null bytes \\0, CRLF/LF, emojis, and RTL text preserved verbatim', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      const specialPayload = 'BINARY\0DATA\r\nEmojis: 🚀✨🔒\r\nRTL: مرحبا بالعالم\nCJK: 漢字テスト';

      setDiffs([
        { id: 'diff-special', filePath: 'special.dat', originalContent: 'old', proposedContent: specialPayload },
      ]);

      await acceptDiff('diff-special');

      // The exact bytes must be passed to electronFS.writeFile without alteration
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('special.dat', specialPayload);
    });

    it('4.4 XSS injection attacks in filePath and description are strictly escaped in review DOM', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;

      const maliciousPath = '<script>alert("pwned")</script><img src=x onerror=alert(1)>';
      const maliciousDesc = '<a href="javascript:alert(1)">Click me</a>';

      setDiffs([
        { id: 'diff-xss', filePath: maliciousPath, description: maliciousDesc, originalContent: '1', proposedContent: '2' },
      ]);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      expect(reviewFileList.children.length).toBe(1);

      const card = reviewFileList.children[0];
      // innerHTML of card must NOT contain unescaped script tag
      expect(card.innerHTML).not.toContain('<script>');
      expect(card.innerHTML).toContain('&lt;script&gt;');
      expect(card.innerHTML).not.toContain('<a href=');
    });
  });

  describe('Suite 5: Batch Operations & Multi-Tab Workspace Resilience', () => {
    it('5.1 acceptAllReviewDiffs processes batch of 20 diffs, updates buffers and resets review UI', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptAll = ctx.sandbox.acceptAllReviewDiffs;

      const batch = Array.from({ length: 20 }, (_, i) => ({
        id: `batch-${i}`,
        filePath: `file_${i}.ts`,
        originalContent: `orig_${i}`,
        proposedContent: `prop_${i}`,
        linesAdded: 10,
        linesDeleted: 2,
      }));

      setDiffs(batch);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      expect(reviewFileList.children.length).toBe(20);

      await acceptAll();

      // All 20 files written to disk
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(20);
      for (let i = 0; i < 20; i++) {
        expect(ctx.spies.writeFile).toHaveBeenCalledWith(`file_${i}.ts`, `prop_${i}`);
      }

      // Review list emptied and badges reset
      expect(reviewFileList.children.length).toBe(0);
      expect(ctx.elementRegistry.get('review-file-count')!.textContent).toBe('0 files modified');
      expect(ctx.elementRegistry.get('review-total-added')!.textContent).toBe('+0');
      expect(ctx.elementRegistry.get('review-total-deleted')!.textContent).toBe('-0');
    });

    it('5.2 discardAllReviewDiffs clears 20 diffs with 0 disk writes and resets review UI', () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      const batch = Array.from({ length: 20 }, (_, i) => ({
        id: `batch-${i}`,
        filePath: `file_${i}.ts`,
        originalContent: `orig_${i}`,
        proposedContent: `prop_${i}`,
      }));

      setDiffs(batch);

      discardAll();

      expect(ctx.spies.writeFile).not.toHaveBeenCalled();
      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      expect(reviewFileList.children.length).toBe(0);
      expect(ctx.elementRegistry.get('review-empty-pane')!.style.display).toBe('flex');
      expect(ctx.elementRegistry.get('review-active-pane')!.style.display).toBe('none');
    });

    it('5.3 multi-tab dirty preservation: accepting clean tab diff leaves other dirty tabs untouched', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      // In sandbox:
      // quicksort.py is clean (isDirty = false)
      // src/config.ts is DIRTY (isDirty = true)
      // main.go is DIRTY (isDirty = true)

      expect(ctx.doc2.isDirty).toBe(true);
      expect(ctx.doc3.isDirty).toBe(true);
      expect(ctx.openDoc.isDirty).toBe(false);

      setDiffs([
        { id: 'diff-clean', filePath: 'quicksort.py', proposedContent: 'new clean code' },
      ]);

      await acceptDiff('diff-clean');

      // quicksort.py was updated and marked clean
      expect(ctx.openDoc.isDirty).toBe(false);
      expect(ctx.spies.writeFile).toHaveBeenCalledWith('quicksort.py', 'new clean code');

      // CRITICAL INVARIANT: Secondary dirty tabs MUST NOT have their dirty flags or models affected
      expect(ctx.doc2.isDirty).toBe(true);
      expect(ctx.doc2.model.getValue()).toBe('export const API_KEY = "xyz";');
      expect(ctx.doc3.isDirty).toBe(true);
      expect(ctx.doc3.model.getValue()).toBe('package main\nfunc main() {}');
    });

    it('5.4 partial individual accept followed by batch discard leaves clean state', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;
      const discardAll = ctx.sandbox.discardAllReviewDiffs;

      setDiffs([
        { id: 'd-1', filePath: 'f1.py', proposedContent: 'c1' },
        { id: 'd-2', filePath: 'f2.py', proposedContent: 'c2' },
        { id: 'd-3', filePath: 'f3.py', proposedContent: 'c3' },
      ]);

      // Accept first
      await acceptDiff('d-1');
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1);

      // Remaining 2 are discarded
      discardAll();

      // No more writes
      expect(ctx.spies.writeFile).toHaveBeenCalledTimes(1);

      const reviewFileList = ctx.elementRegistry.get('review-file-list')!;
      expect(reviewFileList.children.length).toBe(0);
    });

    it('5.5 file system rejection during acceptReviewDiff does not crash or leave inconsistent view', async () => {
      const ctx = setupAdversarialSandbox(jsContent);
      const setDiffs = ctx.sandbox.setReviewDiffs;
      const acceptDiff = ctx.sandbox.acceptReviewDiff;

      // Simulate disk write error (e.g. disk full / EACCES)
      ctx.spies.writeFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      setDiffs([
        { id: 'd-err', filePath: 'protected.sys', proposedContent: 'malicious change' },
      ]);

      // Execution will throw / reject as expected from fs error, but must not crash sandbox process
      let threw = false;
      try {
        await acceptDiff('d-err');
      } catch (err: any) {
        threw = true;
        expect(err.message).toContain('EACCES');
      }
      expect(threw).toBe(true);
    });
  });
});
