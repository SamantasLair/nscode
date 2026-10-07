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
      getVersion: () => '0.2.0',
      isPackaged: false,
      whenReady: () => new Promise(() => {}),
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

// Import main module to register all IPC handlers including guidance:scoutPattern
import { setCurrentWorkspaceRootForTesting } from '../src/main';

interface MockElement {
  id: string;
  tagName: string;
  className: string;
  classList: {
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
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
  addEventListener: (event: string, handler: Function) => void;
  removeEventListener: (event: string, handler: Function) => void;
  appendChild: (child: MockElement) => MockElement;
  prepend: (child: MockElement) => void;
  removeChild: (child: MockElement) => MockElement;
  querySelector: (sel: string) => MockElement | null;
  querySelectorAll: (sel: string) => MockElement[];
  closest: (sel: string) => MockElement | null;
  focus: () => void;
  dispatchEvent: (event: any) => void;
}

function createMockDomElement(tag = 'div', id = ''): MockElement {
  const classes = new Set<string>();
  const listeners: Record<string, Function[]> = {};
  const children: MockElement[] = [];
  let rawHtml = '';

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
    },
    style: {},
    dataset: {},
    textContent: '',
    get innerHTML() {
      return rawHtml;
    },
    set innerHTML(val: string) {
      rawHtml = val;
      if (val === '') {
        children.length = 0;
        return;
      }
      // Populate synthetic interactive child buttons for target cards
      if (val.includes('target-btn-reveal') || val.includes('btn-request-guidance')) {
        children.length = 0;
        const revealBtn = createMockDomElement('button');
        revealBtn.className = 'target-btn-reveal';
        revealBtn.parentNode = el;
        children.push(revealBtn);

        const guidanceBtn = createMockDomElement('button');
        guidanceBtn.className = 'btn-request-guidance target-btn-guidance';
        guidanceBtn.parentNode = el;
        children.push(guidanceBtn);
      }
    },
    value: '',
    disabled: false,
    title: '',
    children,
    parentNode: null,
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
        if (sel.startsWith('.') && child.classList.contains(sel.slice(1))) return child;
        if (sel.startsWith('#') && child.id === sel.slice(1)) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (sel: string) => {
      const results: MockElement[] = [];
      const parts = sel.split(',').map(s => s.trim());
      const search = (node: MockElement) => {
        for (const child of node.children) {
          for (const p of parts) {
            if (p.startsWith('.') && child.classList.contains(p.slice(1))) {
              results.push(child);
            } else if (p.startsWith('#') && child.id === p.slice(1)) {
              results.push(child);
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
        if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
        if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
        curr = curr.parentNode;
      }
      return null;
    },
    focus: vi.fn(),
    dispatchEvent: (event: any) => {
      const evt = {
        type: 'click',
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
        target: el,
        ...event,
      };
      const list = listeners[evt.type] || [];
      for (const handler of list) {
        handler(evt);
      }
    },
  };

  return el;
}

function setupWorkbenchSandbox(jsContent: string, mockGuidanceScout?: Function) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tag = 'div') => {
    if (!elementRegistry.has(id)) {
      elementRegistry.set(id, createMockDomElement(tag, id));
    }
    return elementRegistry.get(id)!;
  };

  // Seed Screen B and workbench elements
  getOrCreateEl('screen-b-header');
  getOrCreateEl('screen-b-breadcrumb');
  getOrCreateEl('screen-b-ws-name');
  getOrCreateEl('screen-b-active-file');
  getOrCreateEl('secondary-breadcrumb');
  const middleContainer = getOrCreateEl('secondary-middle-container');
  const interactionContainer = getOrCreateEl('screen-b-interaction-container');
  const stackContainer = getOrCreateEl('target-line-stack-container');
  getOrCreateEl('target-stack-count');
  const stackList = getOrCreateEl('target-stack-list');
  const summaryContainer = getOrCreateEl('technical-summary-cards-container');
  getOrCreateEl('webview-frame', 'iframe');
  getOrCreateEl('antigravity-prompt-container');
  getOrCreateEl('prompt-input-box', 'textarea');
  getOrCreateEl('btn-prompt-run', 'button');
  getOrCreateEl('status-agy');
  getOrCreateEl('status-agy-text');
  getOrCreateEl('btn-add-context', 'button');

  middleContainer.appendChild(interactionContainer);
  interactionContainer.appendChild(stackContainer);
  stackContainer.appendChild(stackList);
  interactionContainer.appendChild(summaryContainer);

  // Monaco Mock with zero-buffer spy assertions
  const editorApplyEditsSpy = vi.fn();
  const editorSetValueSpy = vi.fn();
  const editorRevealLineSpy = vi.fn();
  const editorSetPositionSpy = vi.fn();
  const editorSetSelectionSpy = vi.fn();
  const editorDeltaDecorationsSpy = vi.fn(() => ['decoration-1']);

  const mockModel = {
    getValue: vi.fn(() => 'line 1\nline 2\nline 3\nline 4\nline 5'),
    getLineMaxColumn: vi.fn(() => 80),
    updateOptions: vi.fn(),
  };

  const mockEditor = {
    revealLineInCenter: editorRevealLineSpy,
    setPosition: editorSetPositionSpy,
    setSelection: editorSetSelectionSpy,
    deltaDecorations: editorDeltaDecorationsSpy,
    applyEdits: editorApplyEditsSpy,
    setValue: editorSetValueSpy,
    getModel: vi.fn(() => mockModel),
    focus: vi.fn(),
    updateOptions: vi.fn(),
  };

  const openDoc = {
    id: 'src/main.ts',
    filePath: 'src/main.ts',
    isDirty: false,
    model: mockModel,
  };

  const mockDocManager = {
    activeDocId: 'src/main.ts',
    activeDoc: openDoc,
    documents: new Map([['src/main.ts', openDoc]]),
    openFile: vi.fn(async (fp: string) => {
      mockDocManager.activeDocId = fp;
      openDoc.filePath = fp;
      return openDoc;
    }),
  };

  const sandbox: any = {
    window: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronGuidance: mockGuidanceScout ? { scoutPattern: mockGuidanceScout } : undefined,
    },
    document: {
      getElementById: vi.fn((id: string) => getOrCreateEl(id)),
      createElement: vi.fn((tag: string) => createMockDomElement(tag)),
      querySelector: vi.fn((sel: string) => {
        if (sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
        return createMockDomElement();
      }),
      querySelectorAll: vi.fn((sel: string) => {
        const results: MockElement[] = [];
        const parts = sel.split(',').map(s => s.trim());
        for (const el of elementRegistry.values()) {
          for (const p of parts) {
            if (p.startsWith('.') && el.classList.contains(p.slice(1))) {
              results.push(el);
            } else if (p.startsWith('#') && el.id === p.slice(1)) {
              results.push(el);
            }
          }
          // Recursively search children
          const innerMatches = el.querySelectorAll(sel);
          results.push(...innerMatches);
        }
        return Array.from(new Set(results));
      }),
      body: createMockDomElement('body'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    monaco: {
      Range: class {
        constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
      },
    },
    editor: mockEditor,
    docManager: mockDocManager,
    currentWorkspaceRoot: '/workspace/test-project',
    console,
    setTimeout: (fn: Function) => fn(),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
  };

  sandbox.window = Object.assign(sandbox.window, sandbox);
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  // Expose Screen B controllers and link script-scoped editor/docManager
  const harnessHook = `
    editor = globalThis.editor;
    docManager = globalThis.docManager;
    globalThis.extractTargetLines = extractTargetLines;
    globalThis.addTargetsToStack = addTargetsToStack;
    globalThis.renderTargetStack = renderTargetStack;
    globalThis.revealTargetInMonaco = revealTargetInMonaco;
    globalThis.requestGuidanceForTarget = requestGuidanceForTarget;
    globalThis.renderTechnicalSummaryCard = renderTechnicalSummaryCard;
    globalThis.updateScreenBBreadcrumb = updateScreenBBreadcrumb;
    globalThis.getTargetStack = () => targetStack;
    globalThis.setTargetStack = (arr) => { targetStack = arr; renderTargetStack(); };
    globalThis.clearTargetStack = () => { targetStack = []; renderTargetStack(); };
    globalThis.setEditor = (ed) => { editor = ed; };
    globalThis.setDocManager = (dm) => { docManager = dm; };
  `;

  vm.runInContext(jsContent + '\n;' + harnessHook, sandbox);

  return {
    sandbox,
    elementRegistry,
    spies: {
      editorApplyEdits: editorApplyEditsSpy,
      editorSetValue: editorSetValueSpy,
      editorRevealLine: editorRevealLineSpy,
      editorSetPosition: editorSetPositionSpy,
      editorSetSelection: editorSetSelectionSpy,
      editorDeltaDecorations: editorDeltaDecorationsSpy,
      openFile: mockDocManager.openFile,
    },
    openDoc,
    mockEditor,
  };
}

describe('Milestone v0.2.0: Screen B Guided Cognition & Monaco Zero-Buffer Pointer', () => {
  let testTempDir: string;
  let workspaceDir: string;
  let htmlContent: string;
  let cssContent: string;
  let jsContent: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v020-guidance-'));
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
        // ignore Windows file locks
      }
    }
  });

  describe('Tier 1: Feature Coverage', () => {
    it('1.1 Screen B Visual Tokens & VS Code Dark+ Parity (R1)', () => {
      expect(cssContent).toContain('--vscode-secondary-sidebar-bg: #18181b');
      expect(cssContent).toContain('--vscode-secondary-sidebar-border: #27272a');
      expect(cssContent).toContain('--size-secondary-sidebar-default-width: 380px');

      expect(cssContent).toContain('.target-line-stack-container');
      expect(cssContent).toContain('.technical-summary-card');
      expect(cssContent).toContain('background-color: #252526');
      expect(cssContent).toContain('border: 1px solid #2d2d2d');

      expect(cssContent).toContain('overflow-x: hidden');
      expect(cssContent).toContain('max-width: 100%');
      expect(cssContent).toContain('word-break: break-word');

      const screenBZone = htmlContent.slice(htmlContent.indexOf('id="secondary-sidebar"'));
      expect(screenBZone).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });

    it('1.2 3-Tier Clean Layout & Prompt Placeholder (R1)', () => {
      expect(htmlContent).toContain('id="screen-b-header"');
      expect(htmlContent).toContain('id="screen-b-breadcrumb"');
      expect(htmlContent).toContain('id="screen-b-ws-name"');
      expect(htmlContent).toContain('id="screen-b-active-file"');

      expect(htmlContent).toContain('id="secondary-middle-container"');
      expect(htmlContent).toContain('id="screen-b-interaction-container"');
      expect(htmlContent).toContain('id="target-line-stack-container"');
      expect(htmlContent).toContain('id="target-stack-count"');
      expect(htmlContent).toContain('id="target-stack-list"');
      expect(htmlContent).toContain('id="technical-summary-cards-container"');
      expect(htmlContent).toContain('id="webview-frame"');

      expect(htmlContent).toContain('id="antigravity-prompt-container"');
      expect(htmlContent).toContain('id="prompt-input-box"');
      expect(htmlContent).toContain('placeholder="Apa yang akan kita kerjakan hari ini?"');
    });

    it('1.3 Prompt Target Extraction Engine (R2)', () => {
      const { sandbox } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;

      // Single line target: file:line
      const res1 = extractTargetLines('Periksa bug pada src/main.ts:288');
      expect(res1).toHaveLength(1);
      expect(res1[0].filePath).toBe('src/main.ts');
      expect(res1[0].startLine).toBe(288);
      expect(res1[0].endLine).toBeUndefined();

      // Range target: file:start-end
      const res2 = extractTargetLines('Perbaiki src/main.ts:288-305 dan refactor');
      expect(res2).toHaveLength(1);
      expect(res2[0].filePath).toBe('src/main.ts');
      expect(res2[0].startLine).toBe(288);
      expect(res2[0].endLine).toBe(305);

      // GitHub style anchor: file#Lstart-Lend
      const res3 = extractTargetLines('Lihat quicksort.py#L12-L25');
      expect(res3).toHaveLength(1);
      expect(res3[0].filePath).toBe('quicksort.py');
      expect(res3[0].startLine).toBe(12);
      expect(res3[0].endLine).toBe(25);

      // Indonesian phrasing: file baris X sampai Y
      const res4 = extractTargetLines('Periksa utils/calc.js baris 10 sampai 20');
      expect(res4).toHaveLength(1);
      expect(res4[0].filePath).toBe('utils/calc.js');
      expect(res4[0].startLine).toBe(10);
      expect(res4[0].endLine).toBe(20);

      // Contextual fallback to active document when only line numbers are specified
      sandbox.docManager.activeDocId = 'quicksort.py';
      const res5 = extractTargetLines('Periksa baris 15-25');
      expect(res5).toHaveLength(1);
      expect(res5[0].filePath).toBe('quicksort.py');
      expect(res5[0].startLine).toBe(15);
      expect(res5[0].endLine).toBe(25);
    });

    it('1.4 Target Line Stack Rendering & Card Model (R2)', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(jsContent);
      const addTargetsToStack = sandbox.addTargetsToStack;

      addTargetsToStack([
        { id: 'target-1', filePath: 'src/main.ts', startLine: 288, endLine: 305 },
        { id: 'target-2', filePath: 'quicksort.py', startLine: 12 },
      ]);

      const countEl = elementRegistry.get('target-stack-count')!;
      expect(countEl.textContent).toBe('2');

      const listEl = elementRegistry.get('target-stack-list')!;
      expect(listEl.children).toHaveLength(2);

      const firstCard = listEl.children[0];
      expect(firstCard.dataset.filePath).toBe('src/main.ts');
      expect(firstCard.dataset.startLine).toBe('288');
      expect(firstCard.dataset.endLine).toBe('305');
      expect(firstCard.innerHTML).toContain(':288-305');
      expect(firstCard.innerHTML).toContain('Sorot Baris');
      expect(firstCard.innerHTML).toContain('Minta Saran Pengerjaan');
    });

    it('1.5 Monaco Zero-Buffer Pointer Execution (R2)', async () => {
      const { sandbox, spies, openDoc } = setupWorkbenchSandbox(jsContent);
      const revealTargetInMonaco = sandbox.revealTargetInMonaco;

      const target = { id: 't-1', filePath: 'src/main.ts', startLine: 288, endLine: 305 };
      await revealTargetInMonaco(target);

      expect(spies.editorRevealLine).toHaveBeenCalledWith(288);

      expect(spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 288, column: 1 });

      expect(spies.editorSetSelection).toHaveBeenCalled();

      // 4. Zero buffer mutation invariant: NO applyEdits and NO setValue
      expect(spies.editorApplyEdits).not.toHaveBeenCalled();
      expect(spies.editorSetValue).not.toHaveBeenCalled();
      expect(openDoc.isDirty).toBe(false);
    });

    it('1.6 Guidance Trigger & Electron IPC Handler (R3)', async () => {
      expect(ipcHandlers.has('guidance:scoutPattern')).toBe(true);
      const handler = ipcHandlers.get('guidance:scoutPattern')!;

      const testFile = path.join(workspaceDir, 'service.ts');
      fs.writeFileSync(testFile, 'export function compute() {\n  const x = null;\n  return x.value;\n}\n');

      const res = await handler(null, {
        filePath: testFile,
        startLine: 2,
        endLine: 3,
      });

      expect(res.success).toBe(true);
      expect(res.card).toBeDefined();
      expect(res.card.rootCause).toContain('service.ts:2-3');
      expect(res.card.references).toHaveLength(4); // TypeScript Handbook prepended for .ts
      expect(res.card.references[0].url).toContain('typescriptlang.org');
      expect(res.card.references.some((r: any) => r.source === 'MDN')).toBe(true);
      expect(res.card.references.some((r: any) => r.source === 'Node.js Docs')).toBe(true);
      expect(res.card.suggestedDiff.original).toContain('const x = null;');
    });

    it('1.7 Technical Summary Card Rendering without Auto-Patch (R3)', async () => {
      const mockScout = vi.fn().mockResolvedValue({
        success: true,
        card: {
          id: 'card-123',
          target: { filePath: 'src/main.ts', startLine: 288, endLine: 305 },
          rootCause: 'Potensi null pointer dereference pada parameter request',
          explanation: 'Pemeriksaan defensif diperlukan sebelum mengakses property',
          references: [
            { title: 'MDN Error Handling', url: 'https://developer.mozilla.org/errors', source: 'MDN' },
          ],
          suggestedDiff: {
            original: 'return req.body.id;',
            suggested: 'return req.body?.id ?? null;',
            explanation: 'Gunakan optional chaining dan nullish coalescing',
          },
        },
      });

      const { sandbox, elementRegistry, spies } = setupWorkbenchSandbox(jsContent, mockScout);
      const requestGuidance = sandbox.requestGuidanceForTarget;

      const target = { id: 'target-1', filePath: 'src/main.ts', startLine: 288, endLine: 305 };
      await requestGuidance(target);

      expect(mockScout).toHaveBeenCalledWith({
        filePath: 'src/main.ts',
        startLine: 288,
        endLine: 305,
        context: undefined,
      });

      const container = elementRegistry.get('technical-summary-cards-container')!;
      expect(container.children.length).toBeGreaterThanOrEqual(1);

      const renderedCard = container.children[0];
      expect(renderedCard.innerHTML).toContain('Potensi null pointer dereference');
      expect(renderedCard.innerHTML).toContain('MDN Error Handling');
      expect(renderedCard.innerHTML).toContain('+ return req.body?.id ?? null;');

      // Confirms buffer was NOT auto-patched
      expect(spies.editorApplyEdits).not.toHaveBeenCalled();
      expect(spies.editorSetValue).not.toHaveBeenCalled();
    });
  });

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('2.1 Empty & Malformed Prompts Handling', () => {
      const { sandbox } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;

      expect(extractTargetLines('')).toEqual([]);
      expect(extractTargetLines('   \t\n  ')).toEqual([]);
      expect(extractTargetLines('Halo selamat pagi, bagaimana cuaca hari ini?')).toEqual([]);
      expect(extractTargetLines(null as any)).toEqual([]);
      expect(extractTargetLines(undefined as any)).toEqual([]);
    });

    it('2.2 Boundary & Invalid Line Numbers Normalization', () => {
      const { sandbox } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;

      // Line 0 is invalid -> ignored
      expect(extractTargetLines('src/main.ts:0')).toEqual([]);

      // Inverted line range 50-20 -> endLine is discarded/ignored because endLine < startLine
      const inverted = extractTargetLines('src/main.ts:50-20');
      expect(inverted).toHaveLength(1);
      expect(inverted[0].startLine).toBe(50);
      expect(inverted[0].endLine).toBeUndefined();

      // Negative line numbers
      expect(extractTargetLines('src/main.ts:-5')).toEqual([]);
    });

    it('2.3 Missing or Inaccessible Files in IPC Handler', async () => {
      const handler = ipcHandlers.get('guidance:scoutPattern')!;

      // Missing filePath parameter
      const resMissing = await handler(null, {});
      expect(resMissing.success).toBe(false);
      expect(resMissing.error).toContain('filePath is required');

      // Non-existent file path: returns graceful fallback card without crashing
      const missingPath = path.join(workspaceDir, 'does-not-exist.ts');
      const resNonExistent = await handler(null, { filePath: missingPath, startLine: 10 });
      expect(resNonExistent.success).toBe(true);
      expect(resNonExistent.card.suggestedDiff.original).toContain('Baris 10');
      expect(resNonExistent.card.references.length).toBeGreaterThan(0);
    });

    it('2.4 Multiple Targets Extracted in Single Prompt', () => {
      const { sandbox } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;

      const multiPrompt = 'Periksa bug di src/main.ts:288-305 dan src/preload.ts:149-153 serta index.html:450';
      const targets = extractTargetLines(multiPrompt);

      expect(targets).toHaveLength(3);
      expect(targets[0].filePath).toBe('src/main.ts');
      expect(targets[0].startLine).toBe(288);
      expect(targets[0].endLine).toBe(305);

      expect(targets[1].filePath).toBe('src/preload.ts');
      expect(targets[1].startLine).toBe(149);
      expect(targets[1].endLine).toBe(153);

      expect(targets[2].filePath).toBe('index.html');
      expect(targets[2].startLine).toBe(450);
      expect(targets[2].endLine).toBeUndefined();
    });

    it('2.5 Long File Paths, Windows Backslashes & Deep Directories', () => {
      const { sandbox } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;

      const deepPath = 'packages/antislop-desktop/src/workbench/components/deep/nested/view.tsx:120-140';
      const resDeep = extractTargetLines(deepPath);
      expect(resDeep).toHaveLength(1);
      expect(resDeep[0].filePath).toBe('packages/antislop-desktop/src/workbench/components/deep/nested/view.tsx');

      const winPath = 'src\\workbench\\workbench.js:3000';
      const resWin = extractTargetLines(winPath);
      expect(resWin).toHaveLength(1);
      expect(resWin[0].filePath).toBe('src\\workbench\\workbench.js');
      expect(resWin[0].startLine).toBe(3000);
    });

    it('2.6 Offline Scout Fallback when IPC / Service is Unavailable', async () => {
      // Pass null scout function to trigger fallback path
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(jsContent, undefined);
      const requestGuidance = sandbox.requestGuidanceForTarget;

      const target = { id: 't-offline', filePath: 'quicksort.py', startLine: 12 };
      await requestGuidance(target);

      const container = elementRegistry.get('technical-summary-cards-container')!;
      expect(container.children.length).toBeGreaterThanOrEqual(1);

      const card = container.children[0];
      expect(card.innerHTML).toContain('quicksort.py:12');
      expect(card.innerHTML).toContain('MDN Web Docs');
      expect(card.innerHTML).toContain('Node.js Documentation');
    });
  });

  describe('Tier 3: Cross-Feature Interactions', () => {
    it('3.1 Prompt Extraction -> Monaco Line Reveal Coordination', async () => {
      const { sandbox, spies, elementRegistry } = setupWorkbenchSandbox(jsContent);
      const extractTargetLines = sandbox.extractTargetLines;
      const addTargetsToStack = sandbox.addTargetsToStack;

      const targets = extractTargetLines('Cek issue di src/main.ts:288-305');
      addTargetsToStack(targets);

      const listEl = elementRegistry.get('target-stack-list')!;
      expect(listEl.children).toHaveLength(1);

      const cardEl = listEl.children[0];

      cardEl.dispatchEvent({ type: 'click', target: cardEl });

      expect(spies.editorRevealLine).toHaveBeenCalledWith(288);
      expect(spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 288, column: 1 });
      expect(cardEl.classList.contains('active')).toBe(true);
    });

    it('3.2 Cross-Tab Document Switching before Line Reveal', async () => {
      const { sandbox, spies } = setupWorkbenchSandbox(jsContent);
      const revealTargetInMonaco = sandbox.revealTargetInMonaco;

      // Active doc is currently src/main.ts
      expect(sandbox.docManager.activeDocId).toBe('src/main.ts');

      // Target points to a different file
      const externalTarget = {
        id: 'target-ext',
        filePath: 'packages/protocol/src/index.ts',
        startLine: 45,
        endLine: 60,
      };

      await revealTargetInMonaco(externalTarget);

      // System called docManager.openFile on target document
      expect(spies.openFile).toHaveBeenCalledWith('packages/protocol/src/index.ts');
      expect(spies.editorRevealLine).toHaveBeenCalledWith(45);
      expect(spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 45, column: 1 });
    });

    it('3.3 Target Click -> Guidance Trigger Flow', async () => {
      const mockScout = vi.fn().mockResolvedValue({
        success: true,
        card: {
          id: 'card-scout',
          target: { filePath: 'src/main.ts', startLine: 288 },
          rootCause: 'Validation error on input stream',
          explanation: 'Check buffer boundary',
          references: [],
        },
      });

      const { sandbox, elementRegistry } = setupWorkbenchSandbox(jsContent, mockScout);
      const addTargetsToStack = sandbox.addTargetsToStack;

      addTargetsToStack([{ id: 't-1', filePath: 'src/main.ts', startLine: 288 }]);
      const listEl = elementRegistry.get('target-stack-list')!;
      const cardEl = listEl.children[0];
      const guidanceBtn = cardEl.querySelector('.btn-request-guidance')!;
      expect(guidanceBtn).not.toBeNull();

      // Click specifically the guidance button
      cardEl.dispatchEvent({ type: 'click', target: guidanceBtn });

      expect(mockScout).toHaveBeenCalledWith(expect.objectContaining({
        filePath: 'src/main.ts',
        startLine: 288,
      }));

      // Await async scout completion
      await Promise.resolve();
      await new Promise(r => setTimeout(r, 0));

      const summaryContainer = elementRegistry.get('technical-summary-cards-container')!;
      expect(summaryContainer.children).toHaveLength(1);
      expect(summaryContainer.children[0].innerHTML).toContain('Validation error on input stream');
    });

    it('3.4 Target Stack Management & Document State Independence', () => {
      const { sandbox, elementRegistry, openDoc } = setupWorkbenchSandbox(jsContent);
      const addTargetsToStack = sandbox.addTargetsToStack;
      const clearTargetStack = sandbox.clearTargetStack;

      addTargetsToStack([
        { id: '1', filePath: 'a.ts', startLine: 10 },
        { id: '2', filePath: 'b.ts', startLine: 20 },
      ]);
      expect(elementRegistry.get('target-stack-count')!.textContent).toBe('2');

      clearTargetStack();
      expect(elementRegistry.get('target-stack-count')!.textContent).toBe('0');
      expect(elementRegistry.get('target-stack-list')!.children).toHaveLength(0);

      // Verify open document remains untouched
      expect(openDoc.isDirty).toBe(false);
      expect(sandbox.docManager.documents.has('src/main.ts')).toBe(true);
    });
  });

  describe('Tier 4: Real-World Application Scenarios', () => {
    it('4.1 Complete Developer Workflow: Prompt -> Stack -> Inspection -> Guidance', async () => {
      const mockScout = vi.fn().mockResolvedValue({
        success: true,
        card: {
          id: 'card-e2e',
          target: { filePath: 'src/main.ts', startLine: 288, endLine: 305 },
          rootCause: 'Race condition dalam inisialisasi async IPC handler',
          explanation: 'Gunakan async mutex atau periksa status listener sebelum binding',
          references: [
            { title: 'Node.js Event Emitter Docs', url: 'https://nodejs.org/api/events.html', source: 'Node.js Docs' },
          ],
          suggestedDiff: {
            original: 'ipcMain.handle("event", handler);',
            suggested: 'if (!ipcMain.eventNames().includes("event")) ipcMain.handle("event", handler);',
            explanation: 'Cegah duplikasi registrasi listener',
          },
        },
      });

      const { sandbox, elementRegistry, spies, openDoc } = setupWorkbenchSandbox(jsContent, mockScout);

      const promptInput = elementRegistry.get('prompt-input-box')!;
      expect(htmlContent).toContain('placeholder="Apa yang akan kita kerjakan hari ini?"');

      promptInput.value = 'Apa yang akan kita kerjakan hari ini? Periksa race condition di src/main.ts:288-305';
      const extracted = sandbox.extractTargetLines(promptInput.value);
      sandbox.addTargetsToStack(extracted);

      const listEl = elementRegistry.get('target-stack-list')!;
      expect(listEl.children).toHaveLength(1);
      const card = listEl.children[0];
      expect(card.innerHTML).toContain('src/main.ts');
      expect(card.innerHTML).toContain(':288-305');

      await sandbox.revealTargetInMonaco(extracted[0]);
      expect(spies.editorRevealLine).toHaveBeenCalledWith(288);
      expect(spies.editorSetPosition).toHaveBeenCalledWith({ lineNumber: 288, column: 1 });

      await sandbox.requestGuidanceForTarget(extracted[0]);
      expect(mockScout).toHaveBeenCalledWith(expect.objectContaining({
        filePath: 'src/main.ts',
        startLine: 288,
        endLine: 305,
      }));

      const summaryContainer = elementRegistry.get('technical-summary-cards-container')!;
      expect(summaryContainer.children).toHaveLength(1);
      const summaryCard = summaryContainer.children[0];
      expect(summaryCard.innerHTML).toContain('Race condition dalam inisialisasi async IPC handler');
      expect(summaryCard.innerHTML).toContain('Node.js Event Emitter Docs');
      expect(summaryCard.innerHTML).toContain('ipcMain.eventNames().includes');

      expect(spies.editorApplyEdits).not.toHaveBeenCalled();
      expect(spies.editorSetValue).not.toHaveBeenCalled();
      expect(openDoc.isDirty).toBe(false);
    });

    it('4.2 Strict Zero Buffer Mutation Verification (Golden Invariant)', async () => {
      const { sandbox, spies, openDoc } = setupWorkbenchSandbox(jsContent);

      const initialContent = openDoc.model.getValue();
      expect(initialContent).toBe('line 1\nline 2\nline 3\nline 4\nline 5');

      // Perform a sequence of target additions, selections, revelations, and breadcrumb updates
      sandbox.addTargetsToStack([
        { id: '1', filePath: 'src/main.ts', startLine: 1, endLine: 2 },
        { id: '2', filePath: 'src/main.ts', startLine: 3, endLine: 4 },
      ]);

      await sandbox.revealTargetInMonaco({ id: '1', filePath: 'src/main.ts', startLine: 1, endLine: 2 });
      await sandbox.revealTargetInMonaco({ id: '2', filePath: 'src/main.ts', startLine: 3, endLine: 4 });
      await sandbox.requestGuidanceForTarget({ id: '1', filePath: 'src/main.ts', startLine: 1 });

      // IMMUTABLE INVARIANT ASSERTIONS:
      expect(openDoc.model.getValue()).toBe(initialContent);

      expect(openDoc.isDirty).toBe(false);

      expect(spies.editorApplyEdits).toHaveBeenCalledTimes(0);
      expect(spies.editorSetValue).toHaveBeenCalledTimes(0);
    });
  });
});
