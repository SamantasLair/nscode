import { describe, it, expect, beforeEach } from 'vitest';
import {
  IconThemeRegistry,
  SETI_ICON_THEME,
  MINIMAL_ICON_THEME,
  resolveFileIcon,
  resolveFolderIcon,
  IconThemeDefinition
} from '../src/workbench/iconTheme';

describe('IconTheme System', () => {
  let registry: IconThemeRegistry;

  beforeEach(() => {
    registry = new IconThemeRegistry();
  });

  describe('Theme Definitions & Registration', () => {
    it('initializes with built-in themes "seti" and "minimal"', () => {
      expect(registry.hasTheme('seti')).toBe(true);
      expect(registry.hasTheme('minimal')).toBe(true);
      expect(registry.getActiveThemeId()).toBe('seti');
      expect(registry.getActiveTheme().id).toBe('seti');
    });

    it('allows switching to minimal theme and back', () => {
      const switched = registry.setActiveTheme('minimal');
      expect(switched).toBe(true);
      expect(registry.getActiveThemeId()).toBe('minimal');
      expect(registry.getActiveTheme().id).toBe('minimal');

      registry.setActiveTheme('seti');
      expect(registry.getActiveThemeId()).toBe('seti');
    });

    it('returns false when switching to a non-existent theme', () => {
      const switched = registry.setActiveTheme('non-existent');
      expect(switched).toBe(false);
      expect(registry.getActiveThemeId()).toBe('seti');
    });

    it('emits onDidChangeActiveTheme event on theme change', () => {
      let triggered = false;
      let prevId = '';
      let currId = '';

      const unsubscribe = registry.onDidChangeActiveTheme((event) => {
        triggered = true;
        prevId = event.previousThemeId;
        currId = event.currentTheme.id;
      });

      registry.setActiveTheme('minimal');
      expect(triggered).toBe(true);
      expect(prevId).toBe('seti');
      expect(currId).toBe('minimal');

      unsubscribe();
      triggered = false;
      registry.setActiveTheme('seti');
      expect(triggered).toBe(false);
    });

    it('supports custom theme registration and unregistration', () => {
      const customTheme: IconThemeDefinition = {
        id: 'custom-retro',
        label: 'Custom Retro',
        defaultFile: { icon: 'codicon codicon-symbol-misc' },
        defaultFolder: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
        fileExtensions: {
          pas: { icon: 'codicon codicon-file-code custom-pascal' }
        }
      };

      registry.registerTheme(customTheme);
      expect(registry.hasTheme('custom-retro')).toBe(true);
      registry.setActiveTheme('custom-retro');
      expect(registry.resolveFileIcon('main.pas')).toBe('codicon codicon-file-code custom-pascal');

      // Unregister active theme
      const unregistered = registry.unregisterTheme('custom-retro');
      expect(unregistered).toBe(true);
      expect(registry.hasTheme('custom-retro')).toBe(false);
      expect(registry.getActiveThemeId()).toBe('seti');
    });
  });

  describe('Seti Theme Resolution', () => {
    beforeEach(() => {
      registry.setActiveTheme('seti');
    });

    it('resolves standard programming language extensions', () => {
      expect(registry.resolveFileIcon('app.ts')).toContain('codicon-file-code');
      expect(registry.resolveFileIcon('app.ts')).toContain('file-icon-ts');

      expect(registry.resolveFileIcon('component.tsx')).toContain('file-icon-react');
      expect(registry.resolveFileIcon('server.js')).toContain('file-icon-js');
      expect(registry.resolveFileIcon('script.py')).toContain('file-icon-python');
      expect(registry.resolveFileIcon('main.rs')).toContain('file-icon-rust');
      expect(registry.resolveFileIcon('main.go')).toContain('file-icon-go');
      expect(registry.resolveFileIcon('index.php')).toContain('file-icon-php');
      expect(registry.resolveFileIcon('style.css')).toContain('file-icon-css');
      expect(registry.resolveFileIcon('style.scss')).toContain('file-icon-scss');
      expect(registry.resolveFileIcon('index.html')).toContain('file-icon-html');
      expect(registry.resolveFileIcon('doc.md')).toContain('file-icon-markdown');
      expect(registry.resolveFileIcon('data.json')).toContain('file-icon-json');
      expect(registry.resolveFileIcon('query.sql')).toContain('file-icon-sql');
      expect(registry.resolveFileIcon('deploy.sh')).toContain('file-icon-shell');
    });

    it('resolves exact configuration file names', () => {
      expect(registry.resolveFileIcon('.gitignore')).toContain('file-icon-git');
      expect(registry.resolveFileIcon('Dockerfile')).toContain('file-icon-docker');
      expect(registry.resolveFileIcon('package.json')).toContain('file-icon-npm');
      expect(registry.resolveFileIcon('tsconfig.json')).toContain('file-icon-tsconfig');
      expect(registry.resolveFileIcon('README.md')).toContain('file-icon-readme');
      expect(registry.resolveFileIcon('LICENSE')).toContain('file-icon-license');
      expect(registry.resolveFileIcon('.env')).toContain('file-icon-env');
      expect(registry.resolveFileIcon('.env.production')).toContain('file-icon-env');
    });

    it('handles paths with slashes and backslashes', () => {
      expect(registry.resolveFileIcon('/home/project/src/index.ts')).toContain('file-icon-ts');
      expect(registry.resolveFileIcon('C:\\workspace\\project\\.gitignore')).toContain('file-icon-git');
    });

    it('resolves folder icons with expanded state and folder-specific names', () => {
      expect(registry.resolveFolderIcon(false)).toBe('codicon codicon-folder');
      expect(registry.resolveFolderIcon(true)).toBe('codicon codicon-folder-opened');

      const srcInfo = registry.resolveFolderIconInfo(false, 'src');
      expect(srcInfo.color).toBe('#519aba');

      const nodeModulesInfo = registry.resolveFolderIconInfo(false, 'node_modules');
      expect(nodeModulesInfo.color).toBe('#cb3837');
    });

    it('falls back to default file icon for unknown extension', () => {
      const icon = registry.resolveFileIcon('unknown_file.xyz123');
      expect(icon).toBe('codicon codicon-file file-icon-default');
    });

    it('returns rich info via resolveFileIconInfo', () => {
      const tsInfo = registry.resolveFileIconInfo('test.ts');
      expect(tsInfo.icon).toBe('codicon codicon-file-code file-icon-ts');
      expect(tsInfo.color).toBe('#3178c6');

      const gitInfo = registry.resolveFileIconInfo('.gitignore');
      expect(gitInfo.color).toBe('#f14e32');
    });
  });

  describe('Minimal Theme Resolution', () => {
    beforeEach(() => {
      registry.setActiveTheme('minimal');
    });

    it('resolves monochromatic icons without color classes', () => {
      expect(registry.resolveFileIcon('app.ts')).toBe('codicon codicon-file-code');
      expect(registry.resolveFileIcon('script.py')).toBe('codicon codicon-file-code');
      expect(registry.resolveFileIcon('data.json')).toBe('codicon codicon-json');
      expect(registry.resolveFileIcon('readme.md')).toBe('codicon codicon-markdown');
      expect(registry.resolveFileIcon('.gitignore')).toBe('codicon codicon-source-control');
      expect(registry.resolveFileIcon('unknown.xyz')).toBe('codicon codicon-file');
    });

    it('resolves minimal folder icons', () => {
      expect(registry.resolveFolderIcon(false)).toBe('codicon codicon-folder');
      expect(registry.resolveFolderIcon(true)).toBe('codicon codicon-folder-opened');
    });
  });

  describe('Convenience Functions', () => {
    it('works with standalone resolveFileIcon and resolveFolderIcon helpers', () => {
      expect(resolveFileIcon('index.ts')).toContain('file-icon-ts');
      expect(resolveFolderIcon(false)).toBe('codicon codicon-folder');
      expect(resolveFolderIcon(true)).toBe('codicon codicon-folder-opened');
    });
  });
});
