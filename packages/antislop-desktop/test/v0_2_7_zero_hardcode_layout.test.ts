import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

describe('v0.2.7 Zero-Hardcode Screen B Fluid Layout & Ergonomics Suite', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const workbenchHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');
  const webviewCssPath = path.resolve(__dirname, '../../antislop-webview/src/index.css');
  const webviewAppPath = path.resolve(__dirname, '../../antislop-webview/src/App.tsx');

  describe('1. Webview CSS Container Queries & Fluid Responsiveness', () => {
    it('verifies container-type: inline-size on app-container, main-content, and smart-card', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).toMatch(/\.app-container\s*\{[^}]*container-type:\s*inline-size;/);
      expect(css).toMatch(/\.main-content\s*\{[^}]*container-type:\s*inline-size;/);
      expect(css).toMatch(/\.smart-card\s*\{[^}]*container-type:\s*inline-size;/);
    });

    it('verifies elimination of rigid minmax(340px) in smart-card-grid', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).not.toMatch(/\.smart-card-grid\s*\{[^}]*minmax\(340px,\s*1fr\)/);
      expect(css).toContain('minmax(min(100%, 320px), 1fr)');
    });

    it('verifies container queries for wide side-by-side layout and narrow stacked layouts', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).toContain('@container main (min-width: 860px)');
      expect(css).toContain('@container main (max-width: 359px)');
      expect(css).toContain('@container card (max-width: 360px)');
      expect(css).toContain('.mode-selector-bar');
      expect(css).toContain('flex-wrap: wrap');
    });

    it('verifies App.tsx eliminates hardcoded inline maxWidth on welcome container', () => {
      const tsx = fs.readFileSync(webviewAppPath, 'utf-8');
      expect(tsx).not.toContain("maxWidth: '340px'");
      expect(tsx).toContain('className="chat-welcome-container"');
    });
  });

  describe('2. Desktop Kinetic Sliding Pill Tab Indicator', () => {
    it('verifies sliding pill element markup exists in index.html', () => {
      const html = fs.readFileSync(workbenchHtmlPath, 'utf-8');
      expect(html).toContain('class="screen-b-mode-pill-indicator"');
      expect(html).toContain('id="screen-b-mode-pill"');
    });

    it('verifies workbench.css declares dynamic CSS variables for sliding pill', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/\.screen-b-mode-pill-indicator\s*\{[^}]*transform:\s*translate3d\(var\(--tab-active-x/);
      expect(css).toMatch(/\.screen-b-mode-pill-indicator\s*\{[^}]*width:\s*var\(--tab-active-width/);
      expect(css).toContain('transition: transform 0.2s cubic-bezier');
    });

    it('verifies updateScreenBModePill dynamically calculates relative offset without magic numbers', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');

      let containerStyleProps: Record<string, string> = {};
      const mockContainer = {
        id: 'screen-b-mode-tabs',
        getBoundingClientRect: vi.fn(() => ({ left: 100, top: 10, width: 240, height: 30 })),
        querySelector: vi.fn(),
        style: {
          setProperty: vi.fn((prop: string, val: string) => {
            containerStyleProps[prop] = val;
          }),
        },
      };

      const mockActiveTab = {
        classList: { contains: () => true },
        dataset: { mode: 'plan' },
        getBoundingClientRect: vi.fn(() => ({ left: 172, top: 10, width: 68, height: 26 })),
      };

      mockContainer.querySelector.mockReturnValue(mockActiveTab);

      const mockDocument = {
        getElementById: vi.fn((id: string) => (id === 'screen-b-mode-tabs' ? mockContainer : null)),
        querySelectorAll: vi.fn(() => [mockActiveTab]),
        querySelector: vi.fn(),
        documentElement: { style: { setProperty: vi.fn() }, setAttribute: vi.fn() },
      };

      const context = {
        window: { addEventListener: vi.fn() },
        document: mockDocument,
        console,
      };
      vm.createContext(context);
      try {
        vm.runInContext(code, context);
      } catch (_) {}

      const nscodeLayout = (context.window as any).nscodeLayout;
      expect(nscodeLayout).toBeDefined();
      expect(typeof nscodeLayout.updateScreenBModePill).toBe('function');

      // Test calculation
      nscodeLayout.updateScreenBModePill(mockActiveTab);
      // relativeX = 172 - 100 = 72px, width = 68px
      expect(containerStyleProps['--tab-active-x']).toBe('72px');
      expect(containerStyleProps['--tab-active-width']).toBe('68px');
    });
  });

  describe('3. Elastic Auto-Grow Prompt Box Ergonomics', () => {
    it('verifies workbench.css declares --prompt-min-height and --prompt-max-height tokens', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toContain('--prompt-min-height: 40px');
      expect(css).toContain('--prompt-max-height: 180px');
      expect(css).toMatch(/\.prompt-input-box\s*\{[^}]*min-height:\s*var\(--prompt-min-height/);
      expect(css).toMatch(/\.prompt-input-box\s*\{[^}]*max-height:\s*var\(--prompt-max-height/);
    });

    it('verifies adjustPromptBoxHeight and resetPromptBoxHeight scale dynamically with scrollHeight', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');

      const mockTextarea = {
        id: 'prompt-input-box',
        value: 'Multi-line prompt text\nLine 2\nLine 3',
        scrollHeight: 96,
        style: {
          height: '40px',
          overflowY: 'hidden',
        },
      };

      const mockDocument = {
        getElementById: vi.fn((id: string) => (id === 'prompt-input-box' ? mockTextarea : null)),
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(),
        documentElement: { style: { setProperty: vi.fn() }, setAttribute: vi.fn() },
      };

      const mockWindow = {
        addEventListener: vi.fn(),
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: (prop: string) => {
            if (prop === '--prompt-min-height') return '40px';
            if (prop === '--prompt-max-height') return '180px';
            return '';
          },
        })),
      };

      const context = {
        window: mockWindow,
        document: mockDocument,
        promptInputBox: mockTextarea,
        console,
      };
      vm.createContext(context);
      try {
        vm.runInContext(code, context);
      } catch (_) {}

      const nscodeLayout = (context.window as any).nscodeLayout;
      expect(nscodeLayout).toBeDefined();
      expect(typeof nscodeLayout.adjustPromptBoxHeight).toBe('function');
      expect(typeof nscodeLayout.resetPromptBoxHeight).toBe('function');

      // Test 1: Intermediate expand (scrollHeight: 96px)
      mockTextarea.scrollHeight = 96;
      nscodeLayout.adjustPromptBoxHeight();
      expect(mockTextarea.style.height).toBe('96px');
      expect(mockTextarea.style.overflowY).toBe('hidden');

      // Test 2: Overflow capping (scrollHeight: 240px > max-height 180px)
      mockTextarea.scrollHeight = 240;
      nscodeLayout.adjustPromptBoxHeight();
      expect(mockTextarea.style.height).toBe('180px');
      expect(mockTextarea.style.overflowY).toBe('auto');

      // Test 3: Reset post-submit
      nscodeLayout.resetPromptBoxHeight();
      expect(mockTextarea.style.height).toBe('40px');
      expect(mockTextarea.style.overflowY).toBe('hidden');
    });
  });
});
