import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// =============================================================================
// ELECTRON IPC MOCK HARNESS
// =============================================================================

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
      getVersion: () => '0.1.2',
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
  };
});

// Import main module to trigger registerFileSystemIpc
import { setCurrentWorkspaceRootForTesting } from '../src/main';

describe('Milestone v0.1.2: Explorer Context Menu & File Operations CRUD', () => {
  let testTempDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nscode-v012-crud-'));
    workspaceDir = path.join(testTempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    setCurrentWorkspaceRootForTesting(workspaceDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    setCurrentWorkspaceRootForTesting(null);
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {
        // ignore Windows file lock cleanup errors
      }
    }
  });

  // ===========================================================================
  // 1. IPC Handler Registration & Safety Constraints (R1)
  // ===========================================================================
  describe('1. IPC Handler Registration & Safety Constraints (R1)', () => {
    it('verifies all 5 Milestone v0.1.2 IPC handlers are registered', () => {
      expect(ipcHandlers.has('fs:createFile')).toBe(true);
      expect(ipcHandlers.has('fs:createDirectory')).toBe(true);
      expect(ipcHandlers.has('fs:rename')).toBe(true);
      expect(ipcHandlers.has('fs:delete')).toBe(true);
      expect(ipcHandlers.has('shell:revealInFolder')).toBe(true);
    });

    it('fs:createFile rejects missing path parameter gracefully', async () => {
      const handler = ipcHandlers.get('fs:createFile');
      expect(handler).toBeDefined();

      const res1 = await handler!(null, {});
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Path is required');

      const res2 = await handler!(null, undefined);
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Path is required');
    });

    it('fs:createDirectory rejects missing path parameter gracefully', async () => {
      const handler = ipcHandlers.get('fs:createDirectory');
      expect(handler).toBeDefined();

      const res = await handler!(null, {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Path is required');
    });

    it('fs:createFile rejects creating file if it already exists without overwrite flag', async () => {
      const handler = ipcHandlers.get('fs:createFile');
      const existingFile = path.join(workspaceDir, 'existing.txt');
      fs.writeFileSync(existingFile, 'original content', 'utf-8');

      const res = await handler!(null, { filePath: existingFile });
      expect(res.success).toBe(false);
      expect(res.error).toContain('File already exists');
      expect(fs.readFileSync(existingFile, 'utf-8')).toBe('original content');

      // Allowed when overwrite is true
      const resOverwrite = await handler!(null, { filePath: existingFile, overwrite: true, content: 'overwritten' });
      expect(resOverwrite.success).toBe(true);
      expect(fs.readFileSync(existingFile, 'utf-8')).toBe('overwritten');
    });

    it('fs:createFile rejects creating file over an existing directory even with overwrite: true', async () => {
      const handler = ipcHandlers.get('fs:createFile')!;
      const existingDir = path.join(workspaceDir, 'subfolder');
      fs.mkdirSync(existingDir);

      const res = await handler(null, { filePath: existingDir, overwrite: true, content: 'data' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('is a directory');
    });

    it('fs:createDirectory rejects if path exists and is not a directory', async () => {
      const handler = ipcHandlers.get('fs:createDirectory');
      const existingFile = path.join(workspaceDir, 'not_a_dir.txt');
      fs.writeFileSync(existingFile, 'file content', 'utf-8');

      const res = await handler!(null, { dirPath: existingFile });
      expect(res.success).toBe(false);
      expect(res.error).toContain('is not a directory');
    });

    it('fs:createFile rejects dirPath without fileName', async () => {
      const handler = ipcHandlers.get('fs:createFile');
      const res = await handler!(null, { dirPath: workspaceDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Path is required');
    });

    it('fs:createFile and fs:rename reject Windows reserved names (CON, AUX, PRN, NUL)', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const resCreateCon = await createHandler(null, { filePath: path.join(workspaceDir, 'con.txt') });
      expect(resCreateCon.success).toBe(false);
      expect(resCreateCon.error).toContain('reserved device name');

      const resCreateAux = await createHandler(null, { filePath: path.join(workspaceDir, 'aux') });
      expect(resCreateAux.success).toBe(false);
      expect(resCreateAux.error).toContain('reserved device name');

      const validFile = path.join(workspaceDir, 'normal.txt');
      await createHandler(null, { filePath: validFile, content: 'ok' });

      const resRenameNul = await renameHandler(null, { oldPath: validFile, newPath: path.join(workspaceDir, 'nul.txt') });
      expect(resRenameNul.success).toBe(false);
      expect(resRenameNul.error).toContain('reserved device name');
    });

    it('fs:createFile and fs:rename reject expanded Windows reserved names (COM0, LPT0, CONIN$, CONOUT$)', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const resCreateCom0 = await createHandler(null, { filePath: path.join(workspaceDir, 'com0.txt') });
      expect(resCreateCom0.success).toBe(false);
      expect(resCreateCom0.error).toContain('reserved device name');

      const resCreateLpt0 = await createHandler(null, { filePath: path.join(workspaceDir, 'LPT0') });
      expect(resCreateLpt0.success).toBe(false);
      expect(resCreateLpt0.error).toContain('reserved device name');

      const validFile = path.join(workspaceDir, 'normal2.txt');
      await createHandler(null, { filePath: validFile, content: 'ok' });

      const resRenameConin = await renameHandler(null, { oldPath: validFile, newPath: path.join(workspaceDir, 'conin$.txt') });
      expect(resRenameConin.success).toBe(false);
      expect(resRenameConin.error).toContain('reserved device name');
    });

    it('fs:createFile and fs:rename reject invalid characters in filename', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const resCreate = await createHandler(null, { filePath: path.join(workspaceDir, 'bad*name.txt') });
      expect(resCreate.success).toBe(false);
      expect(resCreate.error).toContain('Invalid characters in name');

      const validFile = path.join(workspaceDir, 'valid.txt');
      await createHandler(null, { filePath: validFile, content: 'ok' });

      const resRename = await renameHandler(null, { oldPath: validFile, newPath: path.join(workspaceDir, 'invalid?file.txt') });
      expect(resRename.success).toBe(false);
      expect(resRename.error).toContain('Invalid characters in name');
    });

    it('fs:rename resolves relative newPath relative to oldPath parent directory', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const subDir = path.join(workspaceDir, 'modules');
      fs.mkdirSync(subDir);
      const oldFile = path.join(subDir, 'old_module.ts');
      await createHandler(null, { filePath: oldFile, content: 'test' });

      const res = await renameHandler(null, { oldPath: oldFile, newPath: 'renamed_module.ts' });
      expect(res.success).toBe(true);
      expect(res.newPath).toBe(path.join(subDir, 'renamed_module.ts'));
      expect(fs.existsSync(path.join(subDir, 'renamed_module.ts'))).toBe(true);
    });

    it('fs:rename rejects missing source or destination parameters', async () => {
      const handler = ipcHandlers.get('fs:rename');
      expect(handler).toBeDefined();

      const res1 = await handler!(null, { oldPath: 'some/path' });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Both old and new paths are required');

      const res2 = await handler!(null, { newPath: 'some/path' });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Both old and new paths are required');
    });

    it('fs:rename rejects non-existent source file', async () => {
      const handler = ipcHandlers.get('fs:rename');
      const nonExistent = path.join(workspaceDir, 'non_existent.txt');
      const newPath = path.join(workspaceDir, 'renamed.txt');

      const res = await handler!(null, { oldPath: nonExistent, newPath });
      expect(res.success).toBe(false);
      expect(res.error).toContain('does not exist');
    });

    it('fs:rename rejects renaming filesystem root, workspace root, or parent', async () => {
      const handler = ipcHandlers.get('fs:rename');
      const fsRoot = path.parse(workspaceDir).root;

      // 1. Filesystem root
      const res1 = await handler!(null, { oldPath: fsRoot, newPath: path.join(fsRoot, 'sub') });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Cannot rename filesystem root');

      // 2. Workspace root
      const res2 = await handler!(null, { oldPath: workspaceDir, newPath: path.join(testTempDir, 'new_ws') });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Cannot rename workspace root');

      // 3. Parent of workspace root
      const res3 = await handler!(null, { oldPath: testTempDir, newPath: path.join(os.tmpdir(), 'other') });
      expect(res3.success).toBe(false);
      expect(res3.error).toContain('Cannot rename parent of workspace root');
    });

    it('fs:rename rejects moving directory into its own descendant', async () => {
      const createDirHandler = ipcHandlers.get('fs:createDirectory')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const parentDir = path.join(workspaceDir, 'parent_dir');
      await createDirHandler(null, { dirPath: parentDir });

      const insideDir = path.join(parentDir, 'sub', 'nested');
      const res = await renameHandler(null, { oldPath: parentDir, newPath: insideDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot move a directory inside itself');
    });

    it('fs:rename handles identical paths as a no-op success', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      const testFile = path.join(workspaceDir, 'same.txt');
      await createHandler(null, { filePath: testFile, content: 'data' });

      const res = await renameHandler(null, { oldPath: testFile, newPath: testFile });
      expect(res.success).toBe(true);
      expect(res.oldPath).toBe(testFile);
      expect(res.newPath).toBe(testFile);
    });

    it('fs:rename rejects renaming to an already existing target file (collision guard)', async () => {
      const handler = ipcHandlers.get('fs:rename');
      const fileA = path.join(workspaceDir, 'fileA.txt');
      const fileB = path.join(workspaceDir, 'fileB.txt');
      fs.writeFileSync(fileA, 'content A', 'utf-8');
      fs.writeFileSync(fileB, 'content B', 'utf-8');

      const res = await handler!(null, { oldPath: fileA, newPath: fileB });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Target path already exists');
      expect(fs.readFileSync(fileA, 'utf-8')).toBe('content A');
      expect(fs.readFileSync(fileB, 'utf-8')).toBe('content B');
    });

    it('fs:rename allows case-only rename of existing file', async () => {
      const handler = ipcHandlers.get('fs:rename');
      const fileLower = path.join(workspaceDir, 'cased.txt');
      const fileUpper = path.join(workspaceDir, 'Cased.txt');
      fs.writeFileSync(fileLower, 'case content', 'utf-8');

      const res = await handler!(null, { oldPath: fileLower, newPath: fileUpper });
      expect(res.success).toBe(true);
      expect(fs.existsSync(fileUpper)).toBe(true);
    });

    it('fs:delete rejects non-existent target path', async () => {
      const handler = ipcHandlers.get('fs:delete');
      const nonExistent = path.join(workspaceDir, 'ghost.txt');

      const res = await handler!(null, { path: nonExistent });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Target does not exist');
    });

    it('fs:delete rejects empty or missing path parameter', async () => {
      const handler = ipcHandlers.get('fs:delete');
      expect(handler).toBeDefined();

      const res = await handler!(null, {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Path is required');
    });

    it('fs:delete enforces safety validation: rejects deleting filesystem root', async () => {
      const handler = ipcHandlers.get('fs:delete');
      const fsRoot = path.parse(workspaceDir).root;

      const res = await handler!(null, { path: fsRoot });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete filesystem root');
    });

    it('fs:delete enforces safety validation: rejects deleting workspace root directory', async () => {
      const handler = ipcHandlers.get('fs:delete');

      const res = await handler!(null, { path: workspaceDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete workspace root');
      expect(fs.existsSync(workspaceDir)).toBe(true);
    });

    it('fs:delete enforces safety validation: rejects deleting parent of workspace root directory', async () => {
      const handler = ipcHandlers.get('fs:delete');

      const res = await handler!(null, { path: testTempDir });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete parent of workspace root');
      expect(fs.existsSync(testTempDir)).toBe(true);
    });

    it('shell:revealInFolder calls electron shell.showItemInFolder', async () => {
      const handler = ipcHandlers.get('shell:revealInFolder');
      const targetFile = path.join(workspaceDir, 'target.txt');
      fs.writeFileSync(targetFile, 'sample content', 'utf-8');

      const res = await handler!(null, { filePath: targetFile });
      expect(res.success).toBe(true);
      expect(mockShell.showItemInFolder).toHaveBeenCalledWith(path.normalize(targetFile));
    });

    it('shell:revealInFolder rejects non-existent paths', async () => {
      const handler = ipcHandlers.get('shell:revealInFolder');
      const nonExistent = path.join(workspaceDir, 'ghost_reveal.txt');

      const res = await handler!(null, { filePath: nonExistent });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Target does not exist');
    });
  });

  // ===========================================================================
  // 2. Real File System CRUD Lifecycle Testing
  // ===========================================================================
  describe('2. Real File System CRUD Lifecycle', () => {
    it('creates file at workspace root and deep nested folders via fs:createFile', async () => {
      const createHandler = ipcHandlers.get('fs:createFile')!;

      // 1. Root level file
      const rootFile = path.join(workspaceDir, 'hello.ts');
      const res1 = await createHandler(null, { filePath: rootFile });
      expect(res1.success).toBe(true);
      expect(fs.existsSync(rootFile)).toBe(true);
      expect(fs.readFileSync(rootFile, 'utf-8')).toBe('');

      // 2. Deep nested file creating intermediate directories
      const deepFile = path.join(workspaceDir, 'src', 'components', 'button.tsx');
      const res2 = await createHandler(null, { filePath: deepFile, content: 'export const Btn = () => null;' });
      expect(res2.success).toBe(true);
      expect(fs.existsSync(deepFile)).toBe(true);
      expect(fs.readFileSync(deepFile, 'utf-8')).toBe('export const Btn = () => null;');
    });

    it('creates nested folders via fs:createDirectory', async () => {
      const createDirHandler = ipcHandlers.get('fs:createDirectory')!;
      const newDir = path.join(workspaceDir, 'assets', 'images', 'icons');

      const res = await createDirHandler(null, { dirPath: newDir });
      expect(res.success).toBe(true);
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.statSync(newDir).isDirectory()).toBe(true);
    });

    it('renames file and folder with path synchronization via fs:rename', async () => {
      const createFileHandler = ipcHandlers.get('fs:createFile')!;
      const createDirHandler = ipcHandlers.get('fs:createDirectory')!;
      const renameHandler = ipcHandlers.get('fs:rename')!;

      // File rename
      const oldFile = path.join(workspaceDir, 'old_name.ts');
      const newFile = path.join(workspaceDir, 'new_name.ts');
      await createFileHandler(null, { filePath: oldFile, content: 'export const val = 42;' });

      const fileRes = await renameHandler(null, { oldPath: oldFile, newPath: newFile });
      expect(fileRes.success).toBe(true);
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(newFile)).toBe(true);
      expect(fs.readFileSync(newFile, 'utf-8')).toBe('export const val = 42;');

      // Folder rename
      const oldDir = path.join(workspaceDir, 'old_folder');
      const newDir = path.join(workspaceDir, 'new_folder');
      await createDirHandler(null, { dirPath: oldDir });
      fs.writeFileSync(path.join(oldDir, 'child.txt'), 'child file', 'utf-8');

      const dirRes = await renameHandler(null, { oldPath: oldDir, newPath: newDir });
      expect(dirRes.success).toBe(true);
      expect(fs.existsSync(oldDir)).toBe(false);
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.existsSync(path.join(newDir, 'child.txt'))).toBe(true);
    });

    it('deletes file and directory recursively via fs:delete', async () => {
      const createFileHandler = ipcHandlers.get('fs:createFile')!;
      const createDirHandler = ipcHandlers.get('fs:createDirectory')!;
      const deleteHandler = ipcHandlers.get('fs:delete')!;

      // Delete single file
      const fileToDelete = path.join(workspaceDir, 'to_delete.txt');
      await createFileHandler(null, { filePath: fileToDelete, content: 'bye' });
      expect(fs.existsSync(fileToDelete)).toBe(true);

      const res1 = await deleteHandler(null, { path: fileToDelete });
      expect(res1.success).toBe(true);
      expect(fs.existsSync(fileToDelete)).toBe(false);

      // Delete recursive folder
      const dirToDelete = path.join(workspaceDir, 'folder_to_delete');
      await createDirHandler(null, { dirPath: dirToDelete });
      fs.writeFileSync(path.join(dirToDelete, 'sub1.txt'), 'sub1', 'utf-8');
      fs.mkdirSync(path.join(dirToDelete, 'inner'), { recursive: true });
      fs.writeFileSync(path.join(dirToDelete, 'inner', 'sub2.txt'), 'sub2', 'utf-8');

      const res2 = await deleteHandler(null, { path: dirToDelete });
      expect(res2.success).toBe(true);
      expect(fs.existsSync(dirToDelete)).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Preload Bridge Contract Exposure (R1)
  // ===========================================================================
  describe('3. Preload Bridge API Contract Exposure', () => {
    let preloadContent: string;

    beforeEach(() => {
      const preloadPath = path.resolve(__dirname, '../src/preload.ts');
      preloadContent = fs.readFileSync(preloadPath, 'utf-8');
    });

    it('exposes createFile on electronFS bridge', () => {
      expect(preloadContent).toContain('createFile:');
      expect(preloadContent).toContain("ipcRenderer.invoke('fs:createFile'");
    });

    it('exposes createDirectory on electronFS bridge', () => {
      expect(preloadContent).toContain('createDirectory:');
      expect(preloadContent).toContain("ipcRenderer.invoke('fs:createDirectory'");
    });

    it('exposes rename on electronFS bridge', () => {
      expect(preloadContent).toContain('rename:');
      expect(preloadContent).toContain("ipcRenderer.invoke('fs:rename'");
    });

    it('exposes delete on electronFS bridge', () => {
      expect(preloadContent).toContain('delete:');
      expect(preloadContent).toContain("ipcRenderer.invoke('fs:delete'");
    });

    it('exposes revealInFolder on electronFS and electronShell bridges', () => {
      expect(preloadContent).toContain('revealInFolder:');
      expect(preloadContent).toContain("ipcRenderer.invoke('shell:revealInFolder'");
      expect(preloadContent).toContain("contextBridge.exposeInMainWorld('electronShell'");
    });

    it('exposes clipboard on electronClipboard bridge', () => {
      expect(preloadContent).toContain("contextBridge.exposeInMainWorld('electronClipboard'");
      expect(preloadContent).toContain('writeText:');
      expect(preloadContent).toContain('readText:');
    });
  });

  // ===========================================================================
  // 4. UI Context Menu & Tree Operations Contract (R2 & R3)
  // ===========================================================================
  describe('4. UI Context Menu & Tree Operations Contract', () => {
    let jsContent: string;
    let cssContent: string;

    beforeEach(() => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      jsContent = fs.readFileSync(jsPath, 'utf-8');
      const cssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
      cssContent = fs.readFileSync(cssPath, 'utf-8');
    });

    it('implements openExplorerContextMenu and closeExplorerContextMenu functions', () => {
      expect(jsContent).toContain('function openExplorerContextMenu');
      expect(jsContent).toContain('function closeExplorerContextMenu');
      expect(jsContent).toContain('activeExplorerContextMenu');
    });

    it('context menu defines all 6 core actions', () => {
      expect(jsContent).toContain("label: 'New File'");
      expect(jsContent).toContain("label: 'New Folder'");
      expect(jsContent).toContain("label: 'Reveal in File Explorer'");
      expect(jsContent).toContain("label: 'Copy Path'");
      expect(jsContent).toContain("label: 'Copy Relative Path'");
      expect(jsContent).toContain("label: 'Rename'");
      expect(jsContent).toContain("label: 'Delete'");
    });

    it('implements inline renaming with input creation, Enter to commit, Escape to cancel', () => {
      expect(jsContent).toContain('function triggerRenameAction');
      expect(jsContent).toContain('tree-rename-input');
      expect(jsContent).toContain("e.key === 'Enter'");
      expect(jsContent).toContain("e.key === 'Escape'");
      expect(jsContent).toContain('window.electronFS.rename');
    });

    it('implements delete action with confirmation dialog', () => {
      expect(jsContent).toContain('function triggerDeleteAction');
      expect(jsContent).toContain('window.confirm');
      expect(jsContent).toContain('window.electronFS.delete');
    });

    it('implements reveal in file explorer and copy path actions', () => {
      expect(jsContent).toContain('function triggerRevealInExplorer');
      expect(jsContent).toContain('function copyPathAction');
      expect(jsContent).toContain('copyToClipboard');
    });

    it('wires contextmenu and keyboard listeners on tree items and empty workspace', () => {
      expect(jsContent).toContain("item.addEventListener('contextmenu'");
      expect(jsContent).toContain("workspaceFileTree.addEventListener('contextmenu'");
      expect(jsContent).toContain("item.addEventListener('keydown'");
      expect(jsContent).toContain("e.key === 'F2'");
      expect(jsContent).toContain("e.key === 'Delete'");
      expect(jsContent).toContain("e.key === 'Backspace'");
    });

    it('defines VS Code Dark+ CSS tokens for explorer-context-menu and tree-rename-input', () => {
      expect(cssContent).toContain('.explorer-context-menu');
      expect(cssContent).toContain('background-color: #252526');
      expect(cssContent).toContain('border: 1px solid #454545');
      expect(cssContent).toContain('.tree-rename-input');
      expect(cssContent).toContain('border: 1px solid #007acc');
    });

    it('implements input validation error styling for tree-rename-input', () => {
      expect(cssContent).toContain('.tree-rename-input.error');
      expect(cssContent).toContain('border-color: #f14c4c');
      expect(jsContent).toContain('INVALID_CHARS');
      expect(jsContent).toContain('RESERVED_NAMES');
    });

    it('isolates keyboard shortcuts from terminal, webview, and contenteditable', () => {
      expect(jsContent).toContain("closest('#terminal-container, .xterm, .terminal')");
      expect(jsContent).toContain("closest('#webview-frame, .webview-container')");
      expect(jsContent).toContain("isContentEditable");
      expect(jsContent).toContain("isSidebar");
    });

    it('synchronizes descendant tree selection path on parent folder rename and delete', () => {
      expect(jsContent).toContain('selectedTreePath && selectedTreePath.replace(');
    });

    it('implements window blur dismissal and Home, End, Tab keys in context menu', () => {
      expect(jsContent).toContain("window.addEventListener('blur', onWindowBlur)");
      expect(jsContent).toContain("e.key === 'Home'");
      expect(jsContent).toContain("e.key === 'End'");
      expect(jsContent).toContain("e.key === 'Tab'");
    });

    it('synchronizes expandedDirs across rename and delete operations', () => {
      expect(jsContent).toContain('updatedExpanded.add(newPath)');
      expect(jsContent).toContain('updatedExpanded.add(`${cleanBase}${sep');
      expect(jsContent).toContain('normExp !== normTarget');
    });

    it('refreshes SCM Source Control on file and folder creation, rename, and delete', () => {
      expect(jsContent).toContain('if (scmController) scmController.refresh()');
    });
  });

  // ===========================================================================
  // 5. Tab Auto-Update & Close Behavior on File Rename / Deletion (R3)
  // ===========================================================================
  describe('5. Tab Auto-Update & Close Behavior on File Rename / Deletion', () => {
    let jsContent: string;

    beforeEach(() => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      jsContent = fs.readFileSync(jsPath, 'utf-8');
    });

    it('DocumentManager implements handleFileRenamed and handleFileDeleted', () => {
      expect(jsContent).toContain('handleFileRenamed(oldPath, newPath)');
      expect(jsContent).toContain('handleFileDeleted(deletedPath)');
    });

    function createRealDocumentManager() {
      const vm = require('vm');
      const createDummyEl = () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setAttribute: vi.fn(),
        style: {},
        classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        remove: vi.fn(),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 })),
        dataset: {},
        textContent: '',
      });

      const elementRegistry = new Map<string, any>();
      const getOrCreateEl = (id: string) => {
        if (!elementRegistry.has(id)) {
          elementRegistry.set(id, createDummyEl());
        }
        return elementRegistry.get(id);
      };

      const mockWebviewWindow = { postMessage: vi.fn() };
      const webviewEl = createDummyEl();
      webviewEl.contentWindow = mockWebviewWindow;
      elementRegistry.set('webview-frame', webviewEl);

      const sandbox: any = {
        window: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
        document: {
          getElementById: vi.fn((id: string) => getOrCreateEl(id)),
          querySelector: vi.fn(() => createDummyEl()),
          querySelectorAll: vi.fn(() => []),
          createElement: vi.fn(() => createDummyEl()),
          body: createDummyEl(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        navigator: {},
        location: { protocol: 'http:', host: 'localhost' },
        console,
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        WebSocket: class {},
      };
      sandbox.window = Object.assign(sandbox.window, sandbox);
      sandbox.globalThis = sandbox;

      vm.createContext(sandbox);
      vm.runInContext(jsContent + '\n;globalThis.RealDocumentManager = DocumentManager;\nglobalThis.getNavHistory = () => navHistory;\nglobalThis.setNavHistory = (arr) => { navHistory = arr; navIndex = arr.length - 1; };\nglobalThis.findNodeByPath = findNodeByPath;', sandbox);

      const dm = new sandbox.RealDocumentManager();
      sandbox.editor = { setModel: vi.fn() };

      return { dm, sandbox, mockWebviewWindow, elementRegistry };
    }

    it('executes real DocumentManager tab synchronization on file and directory rename with trailing slashes', () => {
      const { dm } = createRealDocumentManager();

      dm.documents.set('/workspace/src/index.ts', {
        id: '/workspace/src/index.ts',
        filePath: '/workspace/src/index.ts',
        fileName: 'index.ts',
        language: 'typescript',
      });
      dm.documents.set('/workspace/src/utils.ts', {
        id: '/workspace/src/utils.ts',
        filePath: '/workspace/src/utils.ts',
        fileName: 'utils.ts',
        language: 'typescript',
      });
      dm.activeDocId = '/workspace/src/index.ts';

      // 1. Rename single file
      dm.handleFileRenamed('/workspace/src/index.ts', '/workspace/src/main.ts');
      expect(dm.documents.has('/workspace/src/index.ts')).toBe(false);
      expect(dm.documents.has('/workspace/src/main.ts')).toBe(true);
      expect(dm.documents.get('/workspace/src/main.ts').fileName).toBe('main.ts');
      expect(dm.activeDocId).toBe('/workspace/src/main.ts');

      // 2. Rename folder WITH trailing slash
      dm.handleFileRenamed('/workspace/src/', '/workspace/lib/');
      expect(dm.documents.has('/workspace/lib/main.ts')).toBe(true);
      expect(dm.documents.has('/workspace/lib/utils.ts')).toBe(true);
      expect(dm.activeDocId).toBe('/workspace/lib/main.ts');
    });

    it('executes real DocumentManager tab closing on file and directory deletion with trailing slashes', () => {
      const { dm } = createRealDocumentManager();

      dm.documents.set('/workspace/src/index.ts', { id: '/workspace/src/index.ts', filePath: '/workspace/src/index.ts', fileName: 'index.ts', language: 'typescript' });
      dm.documents.set('/workspace/src/sub/helper.ts', { id: '/workspace/src/sub/helper.ts', filePath: '/workspace/src/sub/helper.ts', fileName: 'helper.ts', language: 'typescript' });
      dm.documents.set('/workspace/readme.md', { id: '/workspace/readme.md', filePath: '/workspace/readme.md', fileName: 'readme.md', language: 'markdown' });
      dm.activeDocId = '/workspace/src/index.ts';

      // 1. Delete single file
      dm.handleFileDeleted('/workspace/src/index.ts');
      expect(dm.documents.has('/workspace/src/index.ts')).toBe(false);
      expect(dm.activeDocId).toBe('/workspace/readme.md');

      // 2. Delete directory WITH trailing slash closing /workspace/src/sub/helper.ts
      dm.handleFileDeleted('/workspace/src/');
      expect(dm.documents.has('/workspace/src/sub/helper.ts')).toBe(false);
      expect(dm.documents.size).toBe(1);
      expect(dm.documents.has('/workspace/readme.md')).toBe(true);
      expect(dm.activeDocId).toBe('/workspace/readme.md');
    });

    it('context menu supports keyboard navigation and listener cleanup', () => {
      expect(jsContent).toContain("e.key === 'ArrowDown'");
      expect(jsContent).toContain("e.key === 'ArrowUp'");
      expect(jsContent).toContain("activeExplorerContextMenuCleanup");
      expect(jsContent).toContain("cleanupListeners");
    });

    it('implements native clipboard and fallback when navigator.clipboard is unavailable', () => {
      expect(jsContent).toContain("window.electronClipboard.writeText");
      expect(jsContent).toContain("document.execCommand('copy')");
      expect(jsContent).toContain("textarea.select()");
    });

    it('copyPathAction handles relative path for workspace root cleanly', () => {
      expect(jsContent).toContain("textToCopy = rel || '.'");
    });

    it('executes real DocumentManager Monaco model migration and dirty state preservation on rename', () => {
      const { dm, sandbox } = createRealDocumentManager();

      const disposedModels: string[] = [];
      const fakeOldModel = {
        uri: 'file:///workspace/src/app.js',
        value: 'const a = 1; // dirty edit',
        getValue: () => fakeOldModel.value,
        dispose: () => { disposedModels.push('app.js'); },
        getAlternativeVersionId: () => 10,
        onDidChangeContent: vi.fn(),
      };

      sandbox.window.monaco = {
        Uri: { file: (p: string) => `file://${p}` },
        editor: {
          getModel: vi.fn(() => null),
          createModel: vi.fn((content: string, lang: string, uri: any) => ({
            uri,
            value: content,
            getValue: () => content,
            getAlternativeVersionId: () => 1,
            onDidChangeContent: vi.fn(),
            dispose: vi.fn(),
          })),
        },
      };

      dm.documents.set('/workspace/src/app.js', {
        id: '/workspace/src/app.js',
        filePath: '/workspace/src/app.js',
        fileName: 'app.js',
        language: 'javascript',
        model: fakeOldModel,
        isDirty: true,
        initialVersionId: -1,
      });
      dm.activeDocId = '/workspace/src/app.js';

      dm.handleFileRenamed('/workspace/src/app.js', '/workspace/src/app.ts');

      expect(dm.documents.has('/workspace/src/app.js')).toBe(false);
      expect(dm.documents.has('/workspace/src/app.ts')).toBe(true);
      const newDoc = dm.documents.get('/workspace/src/app.ts');
      expect(newDoc.fileName).toBe('app.ts');
      expect(newDoc.language).toBe('typescript');
      expect(newDoc.isDirty).toBe(true);
      expect(disposedModels).toContain('app.js');
    });

    it('executes real DocumentManager atomic multi-tab deletion without intermediate switches', () => {
      const { dm } = createRealDocumentManager();

      dm.documents.set('/workspace/src/a.ts', { id: '/workspace/src/a.ts', filePath: '/workspace/src/a.ts', fileName: 'a.ts', language: 'typescript' });
      dm.documents.set('/workspace/src/b.ts', { id: '/workspace/src/b.ts', filePath: '/workspace/src/b.ts', fileName: 'b.ts', language: 'typescript' });
      dm.documents.set('/workspace/src/c.ts', { id: '/workspace/src/c.ts', filePath: '/workspace/src/c.ts', fileName: 'c.ts', language: 'typescript' });
      dm.documents.set('/workspace/other.ts', { id: '/workspace/other.ts', filePath: '/workspace/other.ts', fileName: 'other.ts', language: 'typescript' });
      dm.activeDocId = '/workspace/src/a.ts';

      dm.handleFileDeleted('/workspace/src');
      expect(dm.documents.size).toBe(1);
      expect(dm.documents.has('/workspace/other.ts')).toBe(true);
      expect(dm.activeDocId).toBe('/workspace/other.ts');
    });

    it('executes real DocumentManager all-tabs closure resetting active state and notifying webview', () => {
      const { dm, mockWebviewWindow, elementRegistry } = createRealDocumentManager();

      dm.documents.set('/workspace/single.ts', { id: '/workspace/single.ts', filePath: '/workspace/single.ts', fileName: 'single.ts', language: 'typescript' });
      dm.activeDocId = '/workspace/single.ts';

      dm.handleFileDeleted('/workspace/single.ts');
      expect(dm.documents.size).toBe(0);
      expect(dm.activeDocId).toBeNull();
      expect(elementRegistry.get('status-language-text').textContent).toBe('');
      expect(elementRegistry.get('window-title').textContent).toBe('NSCode');
      expect(mockWebviewWindow.postMessage).toHaveBeenCalledWith(
        { type: 'SET_ACTIVE_FILE', payload: { fileUri: null, languageId: null } },
        '*'
      );
    });

    it('executes real findNodeByPath matching nodes even with trailing slashes', () => {
      const { sandbox } = createRealDocumentManager();
      const tree = [
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          children: [
            { name: 'app.ts', path: '/workspace/src/app.ts', isDirectory: false },
          ],
        },
      ];

      expect(sandbox.findNodeByPath(tree, '/workspace/src/')).toBeDefined();
      expect(sandbox.findNodeByPath(tree, '/workspace/src/').name).toBe('src');
      expect(sandbox.findNodeByPath(tree, '/workspace/src/app.ts')).toBeDefined();
    });

    it('executes real DocumentManager navHistory synchronization on file rename and delete', () => {
      const { dm, sandbox } = createRealDocumentManager();
      sandbox.setNavHistory(['/workspace/src/index.ts', '/workspace/src/utils.ts', '/workspace/readme.md']);

      dm.documents.set('/workspace/src/index.ts', { id: '/workspace/src/index.ts', filePath: '/workspace/src/index.ts', fileName: 'index.ts', language: 'typescript' });
      dm.documents.set('/workspace/src/utils.ts', { id: '/workspace/src/utils.ts', filePath: '/workspace/src/utils.ts', fileName: 'utils.ts', language: 'typescript' });
      dm.activeDocId = '/workspace/src/index.ts';

      // 1. Rename folder: synchronizes entries in navHistory
      dm.handleFileRenamed('/workspace/src', '/workspace/lib');
      const updatedHistory1 = sandbox.getNavHistory();
      expect(updatedHistory1).toContain('/workspace/lib/index.ts');
      expect(updatedHistory1).toContain('/workspace/lib/utils.ts');
      expect(updatedHistory1).not.toContain('/workspace/src/index.ts');

      // 2. Delete file: removes entry from navHistory
      dm.handleFileDeleted('/workspace/lib/index.ts');
      const updatedHistory2 = sandbox.getNavHistory();
      expect(updatedHistory2).not.toContain('/workspace/lib/index.ts');
      expect(updatedHistory2).toContain('/workspace/lib/utils.ts');
      expect(updatedHistory2).toContain('/workspace/readme.md');
    });

    it('executes real DocumentManager syncActiveChrome formatting fileUri with exactly three slashes', () => {
      const { dm, mockWebviewWindow } = createRealDocumentManager();

      dm.documents.set('/workspace/test.py', {
        id: '/workspace/test.py',
        filePath: '/workspace/test.py',
        fileName: 'test.py',
        language: 'python',
      });

      dm.syncActiveChrome('/workspace/test.py');
      expect(mockWebviewWindow.postMessage).toHaveBeenCalledWith(
        {
          type: 'SET_ACTIVE_FILE',
          payload: {
            fileUri: 'file:///workspace/test.py',
            languageId: 'python',
          },
        },
        '*'
      );
    });
  });
});
