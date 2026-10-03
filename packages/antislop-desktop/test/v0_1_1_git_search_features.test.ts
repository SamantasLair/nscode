import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Milestone v0.1.1: Source Control, Workspace Search & Tooling Patch', () => {
  let testTempDir: string;

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antislop-v011-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // 1. Version Synchronization across Monorepo
  // ===========================================================================
  describe('1. Version Synchronization (v0.1.1)', () => {
    const packages = [
      'package.json',
      'packages/antislop-desktop/package.json',
      'packages/antislop-protocol/package.json',
      'packages/antislop-sidecar/package.json',
      'packages/antislop-vscode-extension/package.json',
      'packages/theia-shell-extension/package.json',
      'packages/antislop-webview/package.json',
    ];

    packages.forEach((pkgRelPath) => {
      it(`verifies ${pkgRelPath} is bumped to 0.1.1`, () => {
        const fullPath = path.resolve(__dirname, '../../..', pkgRelPath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        expect(content.version).toBe('0.1.1');
      });
    });

    it('verifies Help About dialog references v0.1.1 in workbench.js', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');
      expect(content).toContain('NSCode v0.1.1');
      expect(content).toContain('Make Coders Great Again. No Slop.');
    });
  });

  // ===========================================================================
  // 2. UI Markup Verification for Milestone v0.1.1
  // ===========================================================================
  describe('2. UI Markup & View Containers', () => {
    let html: string;

    beforeEach(() => {
      const htmlPath = path.resolve(__dirname, '../src/workbench/index.html');
      html = fs.readFileSync(htmlPath, 'utf-8');
    });

    it('contains all Activity Bar view triggers', () => {
      expect(html).toContain('id="act-explorer"');
      expect(html).toContain('id="act-search"');
      expect(html).toContain('id="act-scm"');
      expect(html).toContain('id="act-antislop"');
      expect(html).toContain('id="act-settings"');
      expect(html).toContain('id="act-accounts"');
    });

    it('contains Search view pane and controls', () => {
      expect(html).toContain('id="view-search"');
      expect(html).toContain('id="search-query-input"');
      expect(html).toContain('id="toggle-case-sensitive"');
      expect(html).toContain('id="toggle-whole-word"');
      expect(html).toContain('id="toggle-regex"');
      expect(html).toContain('id="search-status-bar"');
      expect(html).toContain('id="search-results-tree"');
    });

    it('contains Source Control (SCM) view pane and controls', () => {
      expect(html).toContain('id="view-scm"');
      expect(html).toContain('id="scm-non-repo"');
      expect(html).toContain('id="btn-scm-init"');
      expect(html).toContain('id="scm-repo-content"');
      expect(html).toContain('id="scm-branch-bar"');
      expect(html).toContain('id="scm-branch-name"');
      expect(html).toContain('id="scm-commit-msg"');
      expect(html).toContain('id="btn-scm-commit"');
      expect(html).toContain('id="section-scm-staged"');
      expect(html).toContain('id="section-scm-changes"');
    });

    it('contains Monaco Diff Editor mount container in editor area', () => {
      expect(html).toContain('id="diff-editor-mount"');
    });

    it('contains Settings modal with preference controls', () => {
      expect(html).toContain('id="settings-modal"');
      expect(html).toContain('id="setting-font-size"');
      expect(html).toContain('id="setting-tab-size"');
      expect(html).toContain('id="setting-word-wrap"');
      expect(html).toContain('id="setting-auto-save"');
      expect(html).toContain('id="btn-close-settings"');
    });
  });

  // ===========================================================================
  // 3. Git Status Porcelain Parser & Contract
  // ===========================================================================
  describe('3. Git Status Parser Contract', () => {
    function parseGitPorcelain(stdout: string) {
      const lines = stdout.split(/\r?\n/).filter(l => l.trim().length > 0);
      let branch: string | null = null;
      const staged: { path: string; status: string }[] = [];
      const unstaged: { path: string; status: string }[] = [];
      const untracked: { path: string; status: string }[] = [];

      for (const line of lines) {
        if (line.startsWith('## ')) {
          const branchPart = line.substring(3).trim();
          if (branchPart.startsWith('No commits yet on ')) {
            branch = branchPart.replace('No commits yet on ', '').trim();
          } else if (branchPart.startsWith('Initial commit on ')) {
            branch = branchPart.replace('Initial commit on ', '').trim();
          } else {
            const match = branchPart.match(/^([^\s.]+)/);
            branch = (match && match[1]) ? match[1] : (branchPart || null);
          }
          continue;
        }

        if (line.startsWith('?? ')) {
          untracked.push({ path: line.substring(3).trim(), status: 'U' });
          continue;
        }

        const x = line[0];
        const y = line[1];
        const filePath = line.substring(3).trim();

        if (x && x !== ' ' && x !== '?') {
          staged.push({ path: filePath, status: x });
        }
        if (y && y !== ' ' && y !== '?') {
          unstaged.push({ path: filePath, status: y });
        }
      }

      return { branch, staged, unstaged, untracked };
    }

    it('parses branch and mixed staged, unstaged, and untracked files correctly', () => {
      const mockOutput = [
        '## main...origin/main [ahead 1]',
        'M  packages/antislop-desktop/src/main.ts',
        ' M packages/antislop-desktop/src/workbench/workbench.js',
        'A  packages/antislop-desktop/test/v0_1_1_git_search_features.test.ts',
        'D  legacy/old_file.txt',
        '?? new_untracked_script.py',
        '?? docs/roadmap.md',
      ].join('\n');

      const parsed = parseGitPorcelain(mockOutput);
      expect(parsed.branch).toBe('main');

      // Staged files: M packages/antislop-desktop/src/main.ts, A test, D legacy
      expect(parsed.staged).toHaveLength(3);
      expect(parsed.staged[0]).toEqual({ path: 'packages/antislop-desktop/src/main.ts', status: 'M' });
      expect(parsed.staged[1]).toEqual({ path: 'packages/antislop-desktop/test/v0_1_1_git_search_features.test.ts', status: 'A' });
      expect(parsed.staged[2]).toEqual({ path: 'legacy/old_file.txt', status: 'D' });

      // Unstaged files: M workbench.js
      expect(parsed.unstaged).toHaveLength(1);
      expect(parsed.unstaged[0]).toEqual({ path: 'packages/antislop-desktop/src/workbench/workbench.js', status: 'M' });

      // Untracked files: new_untracked_script.py, docs/roadmap.md
      expect(parsed.untracked).toHaveLength(2);
      expect(parsed.untracked[0]).toEqual({ path: 'new_untracked_script.py', status: 'U' });
      expect(parsed.untracked[1]).toEqual({ path: 'docs/roadmap.md', status: 'U' });
    });

    it('handles initial repository with no commits yet', () => {
      const mockOutput = [
        '## No commits yet on master',
        '?? file1.ts',
        '?? file2.ts',
      ].join('\n');

      const parsed = parseGitPorcelain(mockOutput);
      expect(parsed.branch).toBe('master');
      expect(parsed.staged).toHaveLength(0);
      expect(parsed.unstaged).toHaveLength(0);
      expect(parsed.untracked).toHaveLength(2);
    });
  });

  // ===========================================================================
  // 4. Fast Workspace Search Logic Contract
  // ===========================================================================
  describe('4. Fast Workspace Search Logic Contract', () => {
    function searchLines(lines: string[], query: string, options: { isCaseSensitive?: boolean; isWholeWord?: boolean; isRegex?: boolean }) {
      let pattern = query;
      if (!options.isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (options.isWholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      const flags = options.isCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);

      const matches: { line: number; column: number; length: number; text: string }[] = [];
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(lineText)) !== null) {
          matches.push({
            line: i + 1,
            column: match.index + 1,
            length: match[0].length,
            text: lineText.trim(),
          });
          if (!regex.global) break;
        }
      }
      return matches;
    }

    const sampleCode = [
      'function calculateMetrics(totalScore: number) {',
      '  const score = totalScore * 1.5;',
      '  console.log("SCORE:", score);',
      '  return score;',
      '}',
    ];

    it('matches case-insensitively by default', () => {
      const matches = searchLines(sampleCode, 'score', { isCaseSensitive: false });
      // Matches: calculateMetrics(totalScore), const score, totalScore, SCORE, score, return score
      expect(matches.length).toBeGreaterThanOrEqual(4);
    });

    it('matches case-sensitively when requested', () => {
      const matches = searchLines(sampleCode, 'SCORE', { isCaseSensitive: true });
      expect(matches).toHaveLength(1);
      expect(matches[0].line).toBe(3);
    });

    it('matches whole words only when requested', () => {
      const matches = searchLines(sampleCode, 'score', { isCaseSensitive: false, isWholeWord: true });
      // Should match 'score' and 'SCORE', but NOT 'totalScore'
      matches.forEach(m => {
        expect(m.text).not.toBe('function calculateMetrics(totalScore: number) {');
      });
      expect(matches.length).toBe(4);
    });

    it('matches regular expression patterns', () => {
      const matches = searchLines(sampleCode, 'const\\s+\\w+', { isRegex: true });
      expect(matches).toHaveLength(1);
      expect(matches[0].line).toBe(2);
    });
  });

  // ===========================================================================
  // 5. Preload Bridge API Contract Exposure
  // ===========================================================================
  describe('5. Preload Bridge API Contract Exposure', () => {
    it('verifies preload.ts exposes electronGit and electronSearch bridges', () => {
      const preloadPath = path.resolve(__dirname, '../src/preload.ts');
      const content = fs.readFileSync(preloadPath, 'utf-8');

      expect(content).toContain("contextBridge.exposeInMainWorld('electronGit'");
      expect(content).toContain("status: () => ipcRenderer.invoke('git:status')");
      expect(content).toContain("init: () => ipcRenderer.invoke('git:init')");
      expect(content).toContain("diff: (filePath: string) => ipcRenderer.invoke('git:diff'");
      expect(content).toContain("stage: (filePath?: string) => ipcRenderer.invoke('git:stage'");
      expect(content).toContain("unstage: (filePath?: string) => ipcRenderer.invoke('git:unstage'");
      expect(content).toContain("commit: (message: string) => ipcRenderer.invoke('git:commit'");

      expect(content).toContain("contextBridge.exposeInMainWorld('electronSearch'");
      expect(content).toContain("searchFiles: (options:");
    });
  });

  // ===========================================================================
  // 6. Workbench Routing & Diff Editor Integration Contract
  // ===========================================================================
  describe('6. Workbench Routing & Diff Integration Contract', () => {
    it('verifies workbench.js implements ScmController, SearchController, and openDiffViewer', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('class ScmController');
      expect(content).toContain('class SearchController');
      expect(content).toContain('async function openDiffViewer');
      expect(content).toContain('function showSidebarView');
      expect(content).toContain('function initSettingsModal');
      expect(content).toContain('monaco.editor.createDiffEditor');
    });

    it('verifies COMMAND_REGISTRY has search, scm, and settings command bindings', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain("id: 'view.search'");
      expect(content).toContain("id: 'view.scm'");
      expect(content).toContain("id: 'preferences.settings'");
    });
  });

  // ===========================================================================
  // 7. Open Folder & Workspace Tree Interactive Contract
  // ===========================================================================
  describe('7. Open Folder & Workspace Tree Interactive Contract', () => {
    it('verifies workbench.js implements robust openWorkspaceFolder with error boundaries and SCM sync', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('async function openWorkspaceFolder');
      expect(content).toContain('window.electronFS.openDirectory()');
      expect(content).toContain('workspaceFolderName.textContent = folderName.toUpperCase()');
      expect(content).toContain('await refreshWorkspaceTree()');
      expect(content).toContain('scmController.refresh()');
      expect(content).toContain("showSidebarView('explorer')");
    });

    it('verifies refreshWorkspaceTree handles both nodes and tree properties gracefully', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('async function refreshWorkspaceTree');
      expect(content).toContain('(res && (res.nodes || res.tree)) || []');
    });

    it('verifies renderEmptyWorkspace generates authentic VS Code empty state with Open Folder button', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('function renderEmptyWorkspace');
      expect(content).toContain('empty-workspace-state');
      expect(content).toContain('btn-empty-open-folder');
      expect(content).toContain('You have not yet opened a folder.');
      expect(content).toContain('btn-vscode-primary');
      expect(content).toContain('openWorkspaceFolder()');
    });

    it('verifies initGlobalShortcuts binds Ctrl+K Ctrl+O chord and Ctrl+O', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('chordPending');
      expect(content).toContain("e.key === 'k'");
      expect(content).toContain("e.key === 'o'");
      expect(content).toContain('openWorkspaceFolder()');
    });

    it('verifies explorer toolbar provides new file, new folder, and refresh actions', () => {
      const jsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
      const content = fs.readFileSync(jsPath, 'utf-8');

      expect(content).toContain('btn-tree-new-file');
      expect(content).toContain('btn-tree-new-folder');
      expect(content).toContain('btn-tree-refresh');
      expect(content).toContain('btn-tree-collapse');
    });

    it('verifies main.ts returns full directory tree nodes with dual tree & nodes payload', () => {
      const mainPath = path.resolve(__dirname, '../src/main.ts');
      const content = fs.readFileSync(mainPath, 'utf-8');

      expect(content).toContain("ipcMain.handle('fs:openDirectory'");
      expect(content).toContain('name: folderName');
      expect(content).toContain("ipcMain.handle('fs:readDirectory'");
      expect(content).toContain('return { error: null, rootPath: targetDir, nodes: tree, tree };');
    });
  });
});

