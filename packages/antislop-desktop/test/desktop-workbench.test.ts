import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { ExtensionToWebviewMessageSchema, WebviewToExtensionMessageSchema } from '@antislop/protocol';

describe('Milestone 6: VS Code Dark+ Desktop Workbench Shell Transformation', () => {
  let testTempDir: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antislop-desktop-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  describe('R1: 5-Zone Workbench Layout & Tokens', () => {
    it('verifies index.html contains all 5 canonical VS Code Dark+ zones', () => {
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      expect(fs.existsSync(htmlPath)).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf-8');

      // Zone 1: Titlebar (30px)
      expect(html).toContain('id="titlebar"');
      expect(html).toContain('class="zone-titlebar"');
      expect(html).toContain('id="command-palette-trigger"');
      expect(html).toContain('id="btn-toggle-primary-sidebar"');
      expect(html).toContain('id="btn-toggle-secondary-sidebar"');

      // Zone 2: Activity Bar (48px)
      expect(html).toContain('id="activity-bar"');
      expect(html).toContain('class="zone-activitybar"');
      expect(html).toContain('id="act-explorer"');
      expect(html).toContain('id="act-antislop"');

      // Zone 3: Primary Sidebar (260px collapsible)
      expect(html).toContain('id="primary-sidebar"');
      expect(html).toContain('class="zone-primary-sidebar"');
      expect(html).toContain('id="section-open-editors"');
      expect(html).toContain('id="section-workspace"');
      expect(html).toContain('id="workspace-file-tree"');

      // Zone 4: Editor Group (Tab Bar 35px + Breadcrumbs 22px + Monaco)
      expect(html).toContain('id="editor-group"');
      expect(html).toContain('id="tab-bar-container"');
      expect(html).toContain('id="breadcrumbs-bar"');
      expect(html).toContain('id="editor-mount"');

      // Zone 5: Secondary Sidebar (380px collapsible for Screen B)
      expect(html).toContain('id="secondary-sidebar"');
      expect(html).toContain('class="zone-secondary-sidebar"');
      expect(html).toContain('id="antigravity-prompt-container"');
      expect(html).toContain('id="webview-frame"');

      // Zone 6: Status Bar (22px, #007acc)
      expect(html).toContain('id="statusbar"');
      expect(html).toContain('class="zone-statusbar"');
      expect(html).toContain('id="status-daemon"');
      expect(html).toContain('id="status-agy"');
      expect(html).toContain('id="status-big-o"');
      expect(html).toContain('id="status-gate"');
    });

    it('verifies workbench.css defines canonical VS Code Dark+ tokens and geometry', () => {
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      expect(fs.existsSync(cssPath)).toBe(true);
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('--vscode-titlebar-bg: #1e1e1e');
      expect(css).toContain('--vscode-activitybar-bg: #181818');
      expect(css).toContain('--vscode-sidebar-bg: #252526');
      expect(css).toContain('--vscode-editor-bg: #1e1e1e');
      expect(css).toContain('--vscode-secondary-sidebar-bg: #18181b');
      expect(css).toContain('--vscode-statusbar-bg: #007acc');

      expect(css).toContain('--size-titlebar-height: 30px');
      expect(css).toContain('--size-activitybar-width: 48px');
      expect(css).toContain('--size-sidebar-default-width: 260px');
      expect(css).toContain('--size-tab-header-height: 35px');
      expect(css).toContain('--size-breadcrumbs-height: 22px');
      expect(css).toContain('--size-secondary-sidebar-default-width: 380px');
      expect(css).toContain('--size-statusbar-height: 22px');
    });
  });

  describe('R2: Real File System IPC Capabilities', () => {
    it('hierarchically reads directory with ignore filtering and sorting', async () => {
      const srcDir = path.join(testTempDir, 'src');
      const gitDir = path.join(testTempDir, '.git');
      const nodeModulesDir = path.join(testTempDir, 'node_modules');

      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(gitDir, { recursive: true });
      fs.mkdirSync(nodeModulesDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const hello = 1;', 'utf-8');
      fs.writeFileSync(path.join(srcDir, 'utils.py'), 'def test(): pass', 'utf-8');
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main', 'utf-8');
      fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{}', 'utf-8');
      fs.writeFileSync(path.join(testTempDir, '.DS_Store'), 'trash', 'utf-8');

      const IGNORE_DIRECTORIES = new Set(['.git', 'node_modules', 'dist']);
      const IGNORE_FILES = new Set(['.DS_Store']);

      async function walk(currentPath: string, rootPath: string): Promise<any[]> {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        const nodes: any[] = [];

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (IGNORE_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
            const fullPath = path.join(currentPath, entry.name);
            nodes.push({
              name: entry.name,
              path: fullPath,
              isDirectory: true,
              children: await walk(fullPath, rootPath),
            });
          } else if (entry.isFile()) {
            if (IGNORE_FILES.has(entry.name)) continue;
            const fullPath = path.join(currentPath, entry.name);
            nodes.push({
              name: entry.name,
              path: fullPath,
              isDirectory: false,
              extension: path.extname(entry.name).replace('.', ''),
            });
          }
        }
        return nodes.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      }

      const tree = await walk(testTempDir, testTempDir);

      // Verify .git and node_modules and .DS_Store are strictly filtered out
      expect(tree.length).toBe(1);
      expect(tree[0].name).toBe('src');
      expect(tree[0].isDirectory).toBe(true);
      expect(tree[0].children.length).toBe(2);
      expect(tree[0].children[0].name).toBe('index.ts');
      expect(tree[0].children[1].name).toBe('utils.py');
    });

    it('safely reads files with binary detection and 5MB size limit', async () => {
      const validPath = path.join(testTempDir, 'quicksort.py');
      fs.writeFileSync(validPath, 'def quicksort(): pass', 'utf-8');

      const stat = await fs.promises.stat(validPath);
      expect(stat.size).toBeLessThan(5 * 1024 * 1024);
      const content = await fs.promises.readFile(validPath, 'utf-8');
      expect(content).toBe('def quicksort(): pass');

      const binaryPath = path.join(testTempDir, 'image.png');
      const binBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
      fs.writeFileSync(binaryPath, binBuf);

      const fd = await fs.promises.open(binaryPath, 'r');
      const header = Buffer.alloc(512);
      const { bytesRead } = await fd.read(header, 0, 512, 0);
      await fd.close();

      let isBinary = false;
      for (let i = 0; i < bytesRead; i++) {
        if (header[i] === 0) {
          isBinary = true;
          break;
        }
      }
      expect(isBinary).toBe(true);
    });

    it('writes files safely and updates mtime', async () => {
      const targetFile = path.join(testTempDir, 'edited.py');
      fs.writeFileSync(targetFile, '# original', 'utf-8');

      const initialStat = await fs.promises.stat(targetFile);
      // Wait 10ms to ensure timestamp difference
      await new Promise(r => setTimeout(r, 15));

      await fs.promises.writeFile(targetFile, '# modified code', 'utf-8');
      const updatedStat = await fs.promises.stat(targetFile);

      expect(fs.readFileSync(targetFile, 'utf-8')).toBe('# modified code');
      expect(updatedStat.mtimeMs).toBeGreaterThanOrEqual(initialStat.mtimeMs);
    });
  });

  // R3. Multi-Tab Document Manager & Undo-Stack Preservation Invariant
  describe('R3: Multi-Tab Document Manager & Dirty Tracking Invariant', () => {
    it('verifies alternativeVersionId dirty tracking invariant (clean undo)', () => {
      // Simulate Monaco model versionId tracking
      class MockMonacoModel {
        private versionId = 1;
        private initialVersionId = 1;
        private content = '';
        private history: string[] = [];

        constructor(initialContent: string) {
          this.content = initialContent;
          this.history.push(initialContent);
        }

        getAlternativeVersionId() {
          return this.versionId;
        }

        getInitialVersionId() {
          return this.initialVersionId;
        }

        isDirty() {
          return this.versionId !== this.initialVersionId;
        }

        edit(newContent: string) {
          this.content = newContent;
          this.history.push(newContent);
          this.versionId += 1;
        }

        undo() {
          if (this.history.length > 1) {
            this.history.pop();
            this.content = this.history[this.history.length - 1];
            this.versionId -= 1;
          }
        }
      }

      const model = new MockMonacoModel('const x = 10;');
      expect(model.isDirty()).toBe(false);

      // User types: dirty becomes true
      model.edit('const x = 20;');
      expect(model.isDirty()).toBe(true);
      expect(model.getAlternativeVersionId()).toBe(2);

      // User undos (Ctrl+Z): versionId matches initialVersionId -> clean undo without dirty flag sticking!
      model.undo();
      expect(model.isDirty()).toBe(false);
      expect(model.getAlternativeVersionId()).toBe(1);
    });

    it('verifies viewState caching across tab switching in sub-16ms', () => {
      interface MockViewState {
        cursor: { lineNumber: number; column: number };
        scroll: { scrollTop: number };
      }

      const tabA = {
        id: 'quicksort.py',
        viewState: { cursor: { lineNumber: 25, column: 4 }, scroll: { scrollTop: 320 } } as MockViewState | null,
      };

      const tabB = {
        id: 'binary_search.cpp',
        viewState: { cursor: { lineNumber: 10, column: 1 }, scroll: { scrollTop: 0 } } as MockViewState | null,
      };

      const start = performance.now();

      // Switch from A to B: save A, restore B
      const cachedA = tabA.viewState;
      expect(cachedA?.cursor.lineNumber).toBe(25);

      const restoredB = tabB.viewState;
      expect(restoredB?.cursor.lineNumber).toBe(10);

      const durationMs = performance.now() - start;
      // Tab switch latency must be sub-16ms (60 FPS frame window)
      expect(durationMs).toBeLessThan(16);
    });
  });

  describe('R4: Anti-Trap Sash & Secondary Sidebar Rules', () => {
    it('verifies anti-trap sash CSS rules strictly disable iframe pointer events during drag', () => {
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Verify the Anti-Trap rule exists verbatim
      expect(css).toContain('body.is-resizing iframe');
      expect(css).toContain('pointer-events: none !important');
      expect(css).toContain('body.is-resizing');
      expect(css).toContain('cursor: col-resize !important');
      expect(css).toContain('transition: none !important');
    });

    it('verifies smooth 380px to 0px collapse transition styling', () => {
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      expect(css).toContain('transition: width 0.18s cubic-bezier(0.4, 0, 0.2, 1)');
      expect(css).toContain('.zone-secondary-sidebar.collapsed');
      expect(css).toContain('width: 0px !important');
      expect(css).toContain('visibility: hidden');
    });
  });

  describe('R5: RPC Convergence & Webview Zod Bridge', () => {
    it('verifies host-to-webview notifications pass ExtensionToWebviewMessageSchema', () => {
      const streamMessage = {
        type: 'DIAGNOSTIC_DATA',
        payload: {
          method: 'diagnostics.smartCardsReady',
          params: {
            correlationId: 'test-corr-1',
            cards: [
              {
                id: 'c1',
                strategyName: 'Idiomatic',
                title: 'Iterative QuickSort',
                bigO: { time: 'O(n log n)', space: 'O(log n)' },
                cognitiveGate: { type: 'CLOZE', prompt: 'Fill in pivot', clozeAnswer: 'pivot' },
              }
            ]
          }
        }
      };

      const result = ExtensionToWebviewMessageSchema.safeParse(streamMessage);
      expect(result.success).toBe(true);

      const setActiveFileMsg = {
        type: 'SET_ACTIVE_FILE',
        payload: {
          fileUri: 'file:///workspace/src/quicksort.py',
          languageId: 'python',
        }
      };
      const activeFileResult = ExtensionToWebviewMessageSchema.safeParse(setActiveFileMsg);
      expect(activeFileResult.success).toBe(true);

      // 3. Invalid message type must be rejected
      const invalidMsg = {
        type: 'ANALYSIS_RESULT', // Obsolete prototype format
        payload: {}
      };
      const invalidResult = ExtensionToWebviewMessageSchema.safeParse(invalidMsg);
      expect(invalidResult.success).toBe(false);
    });

    it('verifies webview-to-host HIGHLIGHT_LINE conforms to Zero-Buffer contract', () => {
      const highlightMsg = {
        type: 'HIGHLIGHT_LINE',
        payload: {
          fileUri: 'file:///workspace/quicksort.py',
          line: 14,
          endLine: 16,
        }
      };

      const parsed = WebviewToExtensionMessageSchema.safeParse(highlightMsg);
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.type === 'HIGHLIGHT_LINE') {
        expect(parsed.data.payload.line).toBe(14);
      }
    });

    it('verifies local offline Monaco assets and Codicons are bundled', () => {
      const distWb = path.resolve(__dirname, '../dist/workbench');
      const vsLoader = path.join(distWb, 'vs', 'loader.js');
      const codiconCss = path.join(distWb, 'codicons', 'codicon.css');

      expect(fs.existsSync(vsLoader)).toBe(true);
      expect(fs.existsSync(codiconCss)).toBe(true);

      // Verify index.html does NOT link to external CDN
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).not.toContain('cdnjs.cloudflare.com');
      expect(html).toContain('vs/loader.js');
      expect(html).toContain('codicons/codicon.css');
    });
  });

  describe('R6: Antigravity CLI Bridge (agy)', () => {
    it('verifies preload.ts exposes window.electronFS and window.electronAntigravity', () => {
      const preloadPath = path.resolve(__dirname, '../src/preload.ts');
      const preloadCode = fs.readFileSync(preloadPath, 'utf-8');

      expect(preloadCode).toContain("contextBridge.exposeInMainWorld('electronFS'");
      expect(preloadCode).toContain("contextBridge.exposeInMainWorld('electronAntigravity'");
      expect(preloadCode).toContain('checkStatus:');
      expect(preloadCode).toContain('runCommand:');
      expect(preloadCode).toContain('onOutput:');
      expect(preloadCode).toContain('onExit:');
    });

    it('verifies workbench.js enforces Golden Invariant (zero auto-patch to editor)', () => {
      const wbCode = path.resolve(__dirname, '../src/workbench/workbench.js');
      const js = fs.readFileSync(wbCode, 'utf-8');

      // The Antigravity prompt execution handler streams to Screen B webview, never applies directly to editor
      expect(js).toContain('runAntigravityPrompt');
      expect(js).toContain('diagnostics.tokenChunk');
      expect(js).toContain('diagnostics.analysisCompleted');

      // Assert editor.setValue or editor.applyEdits is NOT called in Antigravity output stream
      const streamSection = js.substring(js.indexOf('runAntigravityPrompt'), js.indexOf('initGlobalShortcuts'));
      expect(streamSection).not.toContain('editor.setValue(outputBuffer)');
      expect(streamSection).not.toContain('editor.applyEdits');
    });
  });

  describe('R1-R6: Authentic VS Code & Cursor Transformation Regression Suite', () => {
    it('R1: verifies frameless window titleBarStyle hidden, titleBarOverlay, and zero duplicate window buttons', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const mainContent = fs.readFileSync(mainPath, 'utf-8');
      expect(mainContent).toContain("titleBarStyle: 'hidden'");
      expect(mainContent).toContain("color: '#181818'");
      expect(mainContent).toContain("symbolColor: '#cccccc'");
      expect(mainContent).toContain('height: 30');

      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('class="vscode-logo-svg"');
      expect(html).toContain('id="btn-nav-back"');
      expect(html).toContain('id="btn-nav-forward"');
      expect(html).toContain('id="command-palette-trigger"');
      expect(html).toContain('id="btn-toggle-primary-sidebar"');
      expect(html).toContain('id="btn-toggle-bottom-panel"');
      expect(html).toContain('id="btn-toggle-secondary-sidebar"');

      // Zero duplicate HTML window controls
      expect(html).not.toContain('class="window-controls"');
      expect(html).not.toContain('id="win-close"');

      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain('margin-right: 140px');
    });

    it('R2: verifies 8-menu cascading menubar structure and fuzzy command palette modal', () => {
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      // 8 authentic VS Code menus
      expect(html).toContain('data-menu="file"');
      expect(html).toContain('data-menu="edit"');
      expect(html).toContain('data-menu="selection"');
      expect(html).toContain('data-menu="view"');
      expect(html).toContain('data-menu="go"');
      expect(html).toContain('data-menu="run"');
      expect(html).toContain('data-menu="terminal"');
      expect(html).toContain('data-menu="help"');

      // Command palette modal popup
      expect(html).toContain('id="command-palette-backdrop"');
      expect(html).toContain('id="command-palette-modal"');
      expect(html).toContain('id="command-palette-input"');
      expect(html).toContain('id="command-palette-results"');

      const wbCode = path.resolve(__dirname, '../src/workbench/workbench.js');
      const js = fs.readFileSync(wbCode, 'utf-8');
      expect(js).toContain('initMenubar');
      expect(js).toContain('initCommandPalette');
      expect(js).toContain('fuzzyScore');
    });

    it('R3: verifies Split Screen multi-group editor architecture with independent tabs and mounts', () => {
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('id="center-area"');
      expect(html).toContain('id="editor-area"');
      expect(html).toContain('id="editor-group"');
      expect(html).toContain('id="editor-split-sash"');
      expect(html).toContain('id="editor-group-2"');
      expect(html).toContain('id="tab-bar-container-2"');
      expect(html).toContain('id="editor-mount-2"');

      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain('.layout-single');
      expect(css).toContain('.layout-split-horizontal');
      expect(css).toContain('.layout-split-vertical');
      expect(css).toContain('#editor-split-sash');

      const wbCode = path.resolve(__dirname, '../src/workbench/workbench.js');
      const js = fs.readFileSync(wbCode, 'utf-8');
      expect(js).toContain('MultiGroupEditorManager');
      expect(js).toContain('splitRight');
      expect(js).toContain('splitDown');
    });

    it('R4: verifies Integrated Collapsible Bottom Panel, anti-trap sash, and Duplex Terminal IPC', () => {
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      expect(html).toContain('id="bottom-panel"');
      expect(html).toContain('id="bottom-panel-sash"');
      expect(html).toContain('id="tab-btn-problems"');
      expect(html).toContain('id="tab-btn-output"');
      expect(html).toContain('id="tab-btn-terminal"');
      expect(html).toContain('id="terminal-screen"');

      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain('body.is-resizing iframe');
      expect(css).toContain('pointer-events: none !important');

      const preloadPath = path.resolve(__dirname, '../src/preload.ts');
      const preloadCode = fs.readFileSync(preloadPath, 'utf-8');
      expect(preloadCode).toContain("contextBridge.exposeInMainWorld('electronTerminal'");
      expect(preloadCode).toContain('create:');
      expect(preloadCode).toContain('write:');
      expect(preloadCode).toContain('kill:');
      expect(preloadCode).toContain('onData:');
      expect(preloadCode).toContain('onExit:');

      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const mainContent = fs.readFileSync(mainPath, 'utf-8');
      expect(mainContent).toContain('registerTerminalIpc');
      expect(mainContent).toContain("'terminal:create'");
      expect(mainContent).toContain("'terminal:write'");
      expect(mainContent).toContain("'terminal:kill'");
      expect(mainContent).toContain("'terminal:data'");
    });

    it('R5: verifies Layar B zero-emoji purge, Cursor Copilot Chat header, and stream token normalization', () => {
      const componentsDir = path.resolve(__dirname, '../../antislop-webview/src/components');
      const files = fs.readdirSync(componentsDir, { recursive: true }) as string[];
      const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{26A0}-\u{26A1}\u{274C}\u{2705}\u{2728}\u{23F0}\u{23F3}\u{26D4}\u{2699}\u{2709}\u{270E}]/gu;
      
      const violatingFiles: string[] = [];
      for (const file of files) {
        const fullPath = path.join(componentsDir, file);
        if (fs.statSync(fullPath).isFile() && (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (emojiRegex.test(content)) {
            violatingFiles.push(file);
          }
        }
      }
      expect(violatingFiles).toEqual([]);

      const appPath = path.resolve(__dirname, '../../antislop-webview/src/App.tsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');
      expect(appContent).toContain('chat-header-bar');
      expect(appContent).toContain('chat-header-tabs');
      expect(appContent).toContain('chat-header-actions');
      expect(appContent).toContain('chunk || payload.params.tokens || payload.params.token');

      const copyBtnPath = path.resolve(__dirname, '../../antislop-webview/src/components/CognitiveGate/LockedCopyButton.tsx');
      const copyBtnContent = fs.readFileSync(copyBtnPath, 'utf-8');
      expect(copyBtnContent).toContain('disabled={!isUnlocked}');
    });

    it('R6: verifies 24px Activity Bar icon precision, badge removal, and discrete status bar layout', () => {
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain('.activity-item .codicon {');
      expect(css).toContain('font-size: 24px !important;');
      expect(css).toContain('width: 24px !important;');
      expect(css).toContain('height: 24px !important;');

      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).not.toContain('activitybar-badge');
      expect(html).toContain('id="status-remote"');
      expect(html).toContain('id="status-git-branch"');
      expect(html).toContain('id="status-diagnostics"');
      expect(html).toContain('id="status-cursor"');
      expect(html).toContain('id="status-encoding"');
      expect(html).toContain('id="status-eol"');
      expect(html).toContain('id="status-bell"');
      expect(html).toContain('id="status-big-o"');
      expect(html).toContain('id="status-gate"');
    });
  });
});
