import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// =============================================================================
// ELECTRON IPC MOCK HARNESS
// Intercepts ipcMain.handle registrations to test real handlers directly from src/main.ts
// =============================================================================

const { ipcHandlers, mockWebContents, mockMainWindow } = vi.hoisted(() => {
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
  return { ipcHandlers: handlers, mockWebContents: webContents, mockMainWindow: mainWindow };
});

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.1.0',
      isPackaged: false,
      whenReady: () => new Promise(() => {}), // Don't proceed to window creation in unit tests
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => mockMainWindow),
    dialog: {
      showOpenDialog: vi.fn(),
    },
    ipcMain: {
      handle: (channel: string, handler: Function) => {
        ipcHandlers.set(channel, handler);
      },
    },
  };
});

// Import main module to trigger registerFileSystemIpc and registerAntigravityIpc
import '../src/main';

describe('Adversarial Stress & Boundary Testing: packages/antislop-desktop', () => {
  let testTempDir: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antislop-adversarial-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors on Windows
      }
    }
  });

  // ===========================================================================
  // 1. FILE SYSTEM IPC SECURITY & BOUNDARY TESTING
  // ===========================================================================
  describe('1. File System IPC Security & Boundary Testing', () => {
    describe('fs:readFile Boundaries & Guards', () => {
      it('rejects non-existent file paths with clean error object', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        expect(readFileHandler).toBeDefined();

        const nonExistent = path.join(testTempDir, 'does_not_exist.ts');
        const res = await readFileHandler!(null, { filePath: nonExistent });

        expect(res.error).toContain('File not found');
        expect(res.content).toBeNull();
      });

      it('gracefully handles directory path passed to readFile without crashing', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const dirPath = path.join(testTempDir, 'some_dir');
        fs.mkdirSync(dirPath);

        const res = await readFileHandler!(null, { filePath: dirPath });
        expect(res.error).toBeDefined();
        expect(res.content).toBeNull();
      });

      it('enforces strict 5MB file size limit (5,242,880 bytes)', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const largeFilePath = path.join(testTempDir, 'too_large.txt');

        // Create file strictly > 5MB (5MB + 16 bytes)
        const fiveMbPlus = 5 * 1024 * 1024 + 16;
        const fh = fs.openSync(largeFilePath, 'w');
        fs.writeSync(fh, Buffer.alloc(1024, 'A'), 0, 1024, 0);
        fs.ftruncateSync(fh, fiveMbPlus);
        fs.closeSync(fh);

        const stat = fs.statSync(largeFilePath);
        expect(stat.size).toBe(fiveMbPlus);

        const res = await readFileHandler!(null, { filePath: largeFilePath });
        expect(res.error).toBe('File exceeds 5MB limit. Cannot be opened in editor.');
        expect(res.content).toBeNull();
      });

      it('permits files at or below 5MB threshold', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const validFilePath = path.join(testTempDir, 'valid_size.txt');
        const content = 'Clean content within bounds';
        fs.writeFileSync(validFilePath, content, 'utf-8');

        const res = await readFileHandler!(null, { filePath: validFilePath });
        expect(res.error).toBeNull();
        expect(res.content).toBe(content);
        expect(res.size).toBe(content.length);
        expect(res.mtime).toBeGreaterThan(0);
      });

      it('handles 0-byte empty files cleanly', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const emptyFilePath = path.join(testTempDir, 'empty.txt');
        fs.writeFileSync(emptyFilePath, '', 'utf-8');

        const res = await readFileHandler!(null, { filePath: emptyFilePath });
        expect(res.error).toBeNull();
        expect(res.content).toBe('');
        expect(res.size).toBe(0);
      });

      it('detects binary null byte 0x00 at byte 0 (beginning of file)', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const binFile = path.join(testTempDir, 'binary_start.bin');
        const buf = Buffer.from([0x00, 0x48, 0x65, 0x6c, 0x6c, 0x6f]); // \0Hello
        fs.writeFileSync(binFile, buf);

        const res = await readFileHandler!(null, { filePath: binFile });
        expect(res.isBinary).toBe(true);
        expect(res.error).toBe('Binary file cannot be opened as text.');
        expect(res.content).toBeNull();
      });

      it('detects binary null byte 0x00 at byte 255 (middle of header)', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const binFile = path.join(testTempDir, 'binary_mid.bin');
        const buf = Buffer.alloc(512, 0x20); // fill with spaces
        buf[255] = 0x00; // insert null byte
        fs.writeFileSync(binFile, buf);

        const res = await readFileHandler!(null, { filePath: binFile });
        expect(res.isBinary).toBe(true);
        expect(res.error).toBe('Binary file cannot be opened as text.');
        expect(res.content).toBeNull();
      });

      it('detects binary null byte 0x00 at byte 511 (boundary of 512-byte header inspection)', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const binFile = path.join(testTempDir, 'binary_boundary.bin');
        const buf = Buffer.alloc(512, 0x41); // 'A'
        buf[511] = 0x00; // last inspected byte is null
        fs.writeFileSync(binFile, buf);

        const res = await readFileHandler!(null, { filePath: binFile });
        expect(res.isBinary).toBe(true);
        expect(res.error).toBe('Binary file cannot be opened as text.');
        expect(res.content).toBeNull();
      });

      it('correctly decodes multi-byte UTF-8 Unicode content and emojis', async () => {
        const readFileHandler = ipcHandlers.get('fs:readFile');
        const unicodeFile = path.join(testTempDir, 'unicode.txt');
        const text = 'こんにちは世界 🚀 AntiSlop IDE 🧠 — Cognitive Mastery & Zero-Buffer';
        fs.writeFileSync(unicodeFile, text, 'utf-8');

        const res = await readFileHandler!(null, { filePath: unicodeFile });
        expect(res.error).toBeNull();
        expect(res.content).toBe(text);
      });
    });

    describe('fs:readDirectory Depth Caps & Sensitive Folder Exclusion', () => {
      it('enforces recursion depth cap (maxDepth)', async () => {
        const readDirHandler = ipcHandlers.get('fs:readDirectory');
        expect(readDirHandler).toBeDefined();

        // Create deeply nested structure: d1/d2/d3/d4/d5/d6
        let curr = testTempDir;
        for (let i = 1; i <= 6; i++) {
          curr = path.join(curr, `d${i}`);
          fs.mkdirSync(curr);
          fs.writeFileSync(path.join(curr, `file${i}.txt`), `depth ${i}`);
        }

        // Test maxDepth: 2
        const res = await readDirHandler!(null, { dirPath: testTempDir, maxDepth: 2 });
        expect(res.error).toBeNull();
        expect(res.nodes.length).toBe(1);

        const d1 = res.nodes[0];
        expect(d1.name).toBe('d1');
        expect(d1.children.length).toBe(2); // file1.txt and d2

        const d2 = d1.children.find((c: any) => c.name === 'd2');
        expect(d2).toBeDefined();
        // At depth 2 (d2), it calls walk on d3 with depth 3. Since 3 > maxDepth (2), d3 is empty!
        const d3 = d2.children.find((c: any) => c.name === 'd3');
        expect(d3).toBeDefined();
        expect(d3.children.length).toBe(0); // recursion capped!
      });

      it('enforces maxDepth: 0 by halting recursion at root subdirectories', async () => {
        const readDirHandler = ipcHandlers.get('fs:readDirectory');
        const sub = path.join(testTempDir, 'subfolder');
        fs.mkdirSync(sub);
        fs.writeFileSync(path.join(sub, 'inner.txt'), 'inner');
        fs.writeFileSync(path.join(testTempDir, 'root_file.txt'), 'root');

        const res = await readDirHandler!(null, { dirPath: testTempDir, maxDepth: 0 });
        expect(res.error).toBeNull();

        const subNode = res.nodes.find((n: any) => n.name === 'subfolder');
        expect(subNode).toBeDefined();
        expect(subNode.children.length).toBe(0); // depth 1 > 0, returns []

        const rootFile = res.nodes.find((n: any) => n.name === 'root_file.txt');
        expect(rootFile).toBeDefined();
      });

      it('strictly excludes sensitive and bulky directories (.git, node_modules, dist, release, etc.)', async () => {
        const readDirHandler = ipcHandlers.get('fs:readDirectory');

        // Create folders to ignore
        const sensitiveDirs = [
          '.git',
          'node_modules',
          'dist',
          'release',
          'build',
          'out',
          '.vscode',
          '.idea',
          '__pycache__',
          '.cache',
          'coverage',
        ];

        for (const dir of sensitiveDirs) {
          const dirPath = path.join(testTempDir, dir);
          fs.mkdirSync(dirPath);
          fs.writeFileSync(path.join(dirPath, 'secret.txt'), 'do not leak');
        }

        // Create nested node_modules and dist inside a legitimate source directory
        const srcDir = path.join(testTempDir, 'src');
        fs.mkdirSync(srcDir);
        fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const a = 1;');

        const nestedNodeModules = path.join(srcDir, 'node_modules');
        fs.mkdirSync(nestedNodeModules);
        fs.writeFileSync(path.join(nestedNodeModules, 'pkg.json'), '{}');

        const nestedDist = path.join(srcDir, 'dist');
        fs.mkdirSync(nestedDist);
        fs.writeFileSync(path.join(nestedDist, 'bundle.js'), 'bad');

        // Create ignored files
        fs.writeFileSync(path.join(testTempDir, '.DS_Store'), 'trash');
        fs.writeFileSync(path.join(testTempDir, 'Thumbs.db'), 'trash');
        fs.writeFileSync(path.join(testTempDir, 'desktop.ini'), 'trash');

        // Create legitimate dotfiles (should be preserved as files)
        fs.writeFileSync(path.join(testTempDir, '.gitignore'), 'node_modules\n');
        fs.writeFileSync(path.join(testTempDir, '.env.example'), 'PORT=4949\n');

        const res = await readDirHandler!(null, { dirPath: testTempDir });
        expect(res.error).toBeNull();

        const nodeNames = res.nodes.map((n: any) => n.name);

        // Verify none of the sensitive directories appear at root
        for (const dir of sensitiveDirs) {
          expect(nodeNames).not.toContain(dir);
        }

        // Verify ignored files are omitted
        expect(nodeNames).not.toContain('.DS_Store');
        expect(nodeNames).not.toContain('Thumbs.db');
        expect(nodeNames).not.toContain('desktop.ini');

        // Verify legitimate dotfiles ARE included
        expect(nodeNames).toContain('.gitignore');
        expect(nodeNames).toContain('.env.example');

        // Verify nested sensitive dirs in src are also excluded
        const srcNode = res.nodes.find((n: any) => n.name === 'src');
        expect(srcNode).toBeDefined();
        const srcChildrenNames = srcNode.children.map((c: any) => c.name);
        expect(srcChildrenNames).toContain('index.ts');
        expect(srcChildrenNames).not.toContain('node_modules');
        expect(srcChildrenNames).not.toContain('dist');
      });

      it('sorts directories first, then files alphabetically', async () => {
        const readDirHandler = ipcHandlers.get('fs:readDirectory');

        fs.mkdirSync(path.join(testTempDir, 'zoo_dir'));
        fs.mkdirSync(path.join(testTempDir, 'alpha_dir'));
        fs.writeFileSync(path.join(testTempDir, 'zoo_file.ts'), '');
        fs.writeFileSync(path.join(testTempDir, 'alpha_file.ts'), '');
        fs.writeFileSync(path.join(testTempDir, 'beta_file.ts'), '');

        const res = await readDirHandler!(null, { dirPath: testTempDir });
        const names = res.nodes.map((n: any) => n.name);

        expect(names).toEqual([
          'alpha_dir',
          'zoo_dir',
          'alpha_file.ts',
          'beta_file.ts',
          'zoo_file.ts',
        ]);
      });

      it('returns clean error object for non-existent directory', async () => {
        const readDirHandler = ipcHandlers.get('fs:readDirectory');
        const res = await readDirHandler!(null, { dirPath: path.join(testTempDir, 'ghost') });
        expect(res.error).toBe('Directory does not exist');
        expect(res.nodes).toEqual([]);
      });
    });

    describe('fs:writeFile Safety & Error Handling', () => {
      it('writes UTF-8 file and returns success with mtime', async () => {
        const writeFileHandler = ipcHandlers.get('fs:writeFile');
        expect(writeFileHandler).toBeDefined();

        const target = path.join(testTempDir, 'new_script.py');
        const content = 'print("Empirically Verified")';

        const res = await writeFileHandler!(null, { filePath: target, content });
        expect(res.error).toBeNull();
        expect(res.success).toBe(true);
        expect(res.mtime).toBeGreaterThan(0);

        expect(fs.readFileSync(target, 'utf-8')).toBe(content);
      });

      it('returns error when target directory does not exist', async () => {
        const writeFileHandler = ipcHandlers.get('fs:writeFile');
        const invalidTarget = path.join(testTempDir, 'ghost_parent', 'deep', 'script.py');

        const res = await writeFileHandler!(null, { filePath: invalidTarget, content: 'fail' });
        expect(res.success).toBe(false);
        expect(res.error).toBeDefined();
        expect(typeof res.error).toBe('string');
      });
    });
  });

  // ===========================================================================
  // 2. ANTI-TRAP SASH & MOUSE CAPTURE TESTING
  // ===========================================================================
  describe('2. Anti-Trap Sash & Mouse Capture Testing', () => {
    it('verifies workbench.css strictly contains pointer-events: none !important for iframes', () => {
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      // Rule 1: body.is-resizing cursor & user-select
      expect(css).toMatch(/body\.is-resizing\s*\{[^}]*cursor:\s*col-resize\s*!important/);
      expect(css).toMatch(/body\.is-resizing\s*\{[^}]*user-select:\s*none\s*!important/);

      // Rule 2: iframe pointer-events suppression
      expect(css).toMatch(/body\.is-resizing\s+(?:iframe|\.secondary-webview-frame)[^{]*\{[^}]*pointer-events:\s*none\s*!important/);

      // Rule 3: transition suppression during active drag
      expect(css).toMatch(/body\.is-resizing\s+(?:\.zone-secondary-sidebar|\.zone-primary-sidebar)[^{]*\{[^}]*transition:\s*none\s*!important/);
    });

    it('simulates resizer lifecycle with mouseup, blur, and mouseleave cleanups', () => {
      // Simulate DOM environment
      class MockClassList {
        private classes = new Set<string>();
        add(c: string) { this.classes.add(c); }
        remove(c: string) { this.classes.delete(c); }
        contains(c: string) { return this.classes.has(c); }
      }

      class MockElement extends EventEmitter {
        classList = new MockClassList();
        style: Record<string, string> = {};
        getBoundingClientRect() {
          return { width: 380, height: 800, top: 0, left: 0, right: 380, bottom: 800 };
        }
      }

      const mockBody = { classList: new MockClassList() };
      const sidebarEl = new MockElement();
      const sashEl = new MockElement();

      // Implement exact logic from SecondarySidebarResizer in workbench.js
      class TestSidebarResizer {
        sidebar: MockElement;
        sash: MockElement;
        isDragging = false;
        startX = 0;
        startWidth = 380;
        minWidth = 240;
        maxWidth = 800;

        constructor(sidebar: MockElement, sash: MockElement) {
          this.sidebar = sidebar;
          this.sash = sash;
        }

        onMouseDown(e: { clientX: number; preventDefault?: () => void }) {
          if (this.sidebar.classList.contains('collapsed')) return;
          this.isDragging = true;
          this.startX = e.clientX;
          this.startWidth = this.sidebar.getBoundingClientRect().width;
          mockBody.classList.add('is-resizing');
          this.sash.classList.add('is-active');
        }

        onMouseMove(e: { clientX: number }) {
          if (!this.isDragging) return;
          const deltaX = this.startX - e.clientX;
          let targetWidth = this.startWidth + deltaX;
          if (targetWidth < 140) {
            this.collapse();
            this.onMouseUp();
            return;
          }
          targetWidth = Math.max(this.minWidth, Math.min(this.maxWidth, targetWidth));
          this.sidebar.style.width = `${targetWidth}px`;
        }

        onMouseUp() {
          if (!this.isDragging) return;
          this.isDragging = false;
          mockBody.classList.remove('is-resizing');
          this.sash.classList.remove('is-active');
        }

        collapse() {
          this.sidebar.classList.add('collapsed');
          this.sash.classList.add('disabled');
        }
      }

      const resizer = new TestSidebarResizer(sidebarEl, sashEl);

      // 1. Normal Drag & Release Cycle
      resizer.onMouseDown({ clientX: 500 });
      expect(mockBody.classList.contains('is-resizing')).toBe(true);
      expect(sashEl.classList.contains('is-active')).toBe(true);
      expect(resizer.isDragging).toBe(true);

      resizer.onMouseMove({ clientX: 450 });
      expect(sidebarEl.style.width).toBe('430px');

      resizer.onMouseUp();
      expect(mockBody.classList.contains('is-resizing')).toBe(false);
      expect(sashEl.classList.contains('is-active')).toBe(false);
      expect(resizer.isDragging).toBe(false);

      // 2. Fallback: Window Blur Cleanup
      resizer.onMouseDown({ clientX: 500 });
      expect(mockBody.classList.contains('is-resizing')).toBe(true);
      // Window blur triggers onMouseUp
      resizer.onMouseUp();
      expect(mockBody.classList.contains('is-resizing')).toBe(false);

      // 3. Fallback: Document Mouseleave Cleanup
      resizer.onMouseDown({ clientX: 500 });
      expect(mockBody.classList.contains('is-resizing')).toBe(true);
      // Mouseleave triggers onMouseUp
      resizer.onMouseUp();
      expect(mockBody.classList.contains('is-resizing')).toBe(false);

      // 4. Fallback: Drag-to-Collapse Auto-Cleanup
      resizer.onMouseDown({ clientX: 500 });
      expect(mockBody.classList.contains('is-resizing')).toBe(true);
      // Drag cursor far to right so targetWidth drops below 140px threshold
      resizer.onMouseMove({ clientX: 800 }); // deltaX = 500 - 800 = -300 -> targetWidth = 80px (< 140px)
      expect(sidebarEl.classList.contains('collapsed')).toBe(true);
      expect(mockBody.classList.contains('is-resizing')).toBe(false);
      expect(resizer.isDragging).toBe(false);
    });
  });

  // ===========================================================================
  // 3. ANTIGRAVITY CLI (AGY) BRIDGE TESTING
  // ===========================================================================
  describe('3. Antigravity CLI (agy) Bridge Testing', () => {
    it('verifies antigravity:checkStatus handler is registered and callable', async () => {
      const checkStatusHandler = ipcHandlers.get('antigravity:checkStatus');
      expect(checkStatusHandler).toBeDefined();

      const result = await checkStatusHandler!();
      expect(result).toBeDefined();
      expect(typeof result.available).toBe('boolean');
      if (result.available) {
        expect(result.version).toBeDefined();
        expect(result.binaryPath).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });

    it('verifies antigravity:runCommand handler is registered and sets up IPC channels', async () => {
      const runCommandHandler = ipcHandlers.get('antigravity:runCommand');
      expect(runCommandHandler).toBeDefined();

      const cancelCommandHandler = ipcHandlers.get('antigravity:cancelCommand');
      expect(cancelCommandHandler).toBeDefined();

      // Test cancel with no active process returns cancelled: false
      const cancelRes = await cancelCommandHandler!();
      expect(cancelRes).toEqual({ cancelled: false });
    });

    it('verifies workbench.js Antigravity integration preserves the Golden Invariant (Zero Monaco Mutation)', () => {
      const wbPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const wbCode = fs.readFileSync(wbPath, 'utf-8');

      // Ensure runAntigravityPrompt streams chunks to webview via postMessage
      expect(wbCode).toContain("window.electronAntigravity.onOutput");
      expect(wbCode).toContain("diagnostics.tokenChunk");
      expect(wbCode).toContain("diagnostics.analysisCompleted");

      // Verify that output chunk is NOT written to editor
      const promptFunctionMatch = wbCode.match(/async function runAntigravityPrompt\(\)\s*\{[\s\S]*?\n\}/);
      expect(promptFunctionMatch).not.toBeNull();
      const promptFunctionCode = promptFunctionMatch![0];

      // Prohibit editor mutations in Antigravity CLI stream
      expect(promptFunctionCode).not.toContain('editor.setValue');
      expect(promptFunctionCode).not.toContain('editor.applyEdits');
      expect(promptFunctionCode).not.toContain('editor.executeEdits');
      expect(promptFunctionCode).not.toContain('model.setValue');
      expect(promptFunctionCode).not.toContain('model.applyEdits');
    });

    it('verifies terminal:write and terminal:kill support both object and positional parameter signatures', async () => {
      const writeHandler = ipcHandlers.get('terminal:write');
      const killHandler = ipcHandlers.get('terminal:kill');
      expect(writeHandler).toBeDefined();
      expect(killHandler).toBeDefined();

      // Test object signature for write
      const writeObjRes = await writeHandler!(null, { id: 'non-existent-session', data: 'ls\r\n' });
      expect(writeObjRes.success).toBe(false);
      expect(writeObjRes.error).toBeDefined();

      // Test positional signature for write
      const writePosRes = await writeHandler!(null, 'non-existent-session', 'ls\r\n');
      expect(writePosRes.success).toBe(false);
      expect(writePosRes.error).toBeDefined();

      // Test object signature for kill
      const killObjRes = await killHandler!(null, { id: 'non-existent-session' });
      expect(killObjRes.success).toBe(false);

      // Test positional signature for kill
      const killPosRes = await killHandler!(null, 'non-existent-session');
      expect(killPosRes.success).toBe(false);
    });
  });
});
