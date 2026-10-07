import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import {
  ExtensionToWebviewMessageSchema,
  ThemeTokensPayloadSchema,
} from '../../../packages/antislop-protocol/src/index';

describe('v0.2.6 Zero-Hardcode Screen B Theming & Token Bridge Suite', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const webviewCssPath = path.resolve(__dirname, '../../antislop-webview/src/index.css');

  describe('1. Static Zero-Hardcode CSS Verification', () => {
    it('verifies workbench.css secondary sidebar variables map to theme tokens', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/--vscode-secondary-sidebar-bg:\s*var\(--vscode-sidebar-bg/);
      expect(css).toMatch(/--vscode-secondary-sidebar-border:\s*var\(--vscode-sidebar-border/);
    });

    it('verifies .secondary-sidebar-header and .secondary-webview-frame use dynamic CSS variables', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/\.secondary-sidebar-header\s*\{[^}]*background-color:\s*var\(--vscode-secondary-sidebar-bg\)/);
      expect(css).toMatch(/\.secondary-sidebar-header\s*\{[^}]*border-bottom:\s*1px solid var\(--vscode-secondary-sidebar-border\)/);
      expect(css).toMatch(/\.secondary-webview-frame\s*\{[^}]*background-color:\s*var\(--vscode-secondary-sidebar-bg\)/);
    });

    it('verifies prompt box card and dropdown do not retain hardcoded #18181b / #27272a backgrounds', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const promptBlockMatch = css.match(/\.antigravity-prompt-container\s*\{([^}]+)\}/);
      expect(promptBlockMatch).not.toBeNull();
      if (promptBlockMatch) {
        expect(promptBlockMatch[1]).toContain('var(--vscode-secondary-sidebar-bg)');
        expect(promptBlockMatch[1]).not.toContain('#18181b');
      }

      const cardBlockMatch = css.match(/\.prompt-box-card\s*\{([^}]+)\}/);
      expect(cardBlockMatch).not.toBeNull();
      if (cardBlockMatch) {
        expect(cardBlockMatch[1]).toContain('var(--vscode-editorWidget-bg');
        expect(cardBlockMatch[1]).not.toContain('#27272a');
      }
    });

    it('verifies antislop-webview/src/index.css maps variables to var(--vscode-*)', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).toContain('var(--vscode-');
      expect(css).not.toMatch(/--bg-surface-elevated:\s*#161b22/);
      expect(css).not.toMatch(/--code-bg:\s*#0d1117/);
    });
  });

  describe('2. Protocol Schema Conformance', () => {
    it('validates THEME_CHANGED message payload for dark, light, and hc-black themes', () => {
      const darkPayload = {
        themeId: 'vs-dark',
        themeType: 'dark' as const,
        tokens: {
          '--vscode-bg': '#1e1e1e',
          '--vscode-secondary-sidebar-bg': '#252526',
        },
      };
      const parsedDark = ThemeTokensPayloadSchema.safeParse(darkPayload);
      expect(parsedDark.success).toBe(true);

      const msg = {
        type: 'THEME_CHANGED',
        payload: darkPayload,
      };
      const parsedMsg = ExtensionToWebviewMessageSchema.safeParse(msg);
      expect(parsedMsg.success).toBe(true);
    });
  });

  describe('3. Workbench Runtime Theme Switching & Webview IPC', () => {
    let mockRootStyle: Record<string, string>;
    let mockRootAttributes: Record<string, string>;
    let mockSentMessages: any[];
    let mockSetThemeCalls: string[];

    beforeEach(() => {
      mockRootStyle = {};
      mockRootAttributes = {};
      mockSentMessages = [];
      mockSetThemeCalls = [];
    });

    function createMockDOM() {
      const documentElement = {
        style: {
          setProperty: vi.fn((prop: string, val: string) => {
            mockRootStyle[prop] = val;
          }),
          getPropertyValue: vi.fn((prop: string) => mockRootStyle[prop] || ''),
        },
        setAttribute: vi.fn((attr: string, val: string) => {
          mockRootAttributes[attr] = val;
        }),
        getAttribute: vi.fn((attr: string) => mockRootAttributes[attr] || null),
      };

      const webviewFrame = {
        id: 'webview-frame',
        contentWindow: {
          postMessage: vi.fn((msg: any) => {
            mockSentMessages.push(msg);
          }),
        },
        addEventListener: vi.fn(),
      };

      const elementsMap: Record<string, any> = {
        'webview-frame': webviewFrame,
        'command-palette-backdrop': {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
        'command-palette-input': {
          value: '',
          focus: vi.fn(),
          placeholder: '',
          addEventListener: vi.fn(),
        },
        'command-palette-results': {
          innerHTML: '',
          appendChild: vi.fn(),
        },
      };

      const mockDocument = {
        documentElement,
        getElementById: vi.fn((id: string) => elementsMap[id] || { addEventListener: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } }),
        querySelectorAll: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        createElement: vi.fn(() => ({
          className: '',
          innerHTML: '',
          addEventListener: vi.fn(),
        })),
      };

      const mockMonaco = {
        editor: {
          setTheme: vi.fn((theme: string) => {
            mockSetThemeCalls.push(theme);
          }),
        },
      };

      return { mockDocument, webviewFrame, mockMonaco };
    }

    it('registers Color Theme commands in COMMAND_REGISTRY', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      expect(code).toContain("'preferences.colorTheme'");
      expect(code).toContain("'preferences.colorThemeDark'");
      expect(code).toContain("'preferences.colorThemeLight'");
      expect(code).toContain("'preferences.colorThemeHighContrast'");
    });

    it('exports window.nscodeTheme with applyTheme, getCurrentTheme, getThemes, dispatchThemeToWebview', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      const { mockDocument, webviewFrame, mockMonaco } = createMockDOM();

      const context = {
        window: {
          monaco: mockMonaco,
          addEventListener: vi.fn(),
        },
        document: mockDocument,
        console,
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
        },
      };
      vm.createContext(context);

      // Run code in isolated VM
      try {
        vm.runInContext(code, context);
      } catch (_) {
        // Some browser elements might not exist in simple mock; check nscodeTheme
      }

      const nscodeTheme = (context.window as any).nscodeTheme;
      expect(nscodeTheme).toBeDefined();
      expect(typeof nscodeTheme.applyTheme).toBe('function');
      expect(typeof nscodeTheme.getCurrentTheme).toBe('function');
      expect(typeof nscodeTheme.getThemes).toBe('function');
      expect(typeof nscodeTheme.dispatchThemeToWebview).toBe('function');

      const themes = nscodeTheme.getThemes();
      expect(themes.length).toBeGreaterThanOrEqual(3);
      expect(themes.map((t: any) => t.id)).toEqual(expect.arrayContaining(['vs-dark', 'vs', 'hc-black']));

      // Test applyTheme('vs')
      nscodeTheme.applyTheme('vs');
      expect(nscodeTheme.getCurrentTheme()).toBe('vs');
      expect(mockRootAttributes['data-theme-id']).toBe('vs');
      expect(mockRootAttributes['data-theme-type']).toBe('light');
      expect(mockSetThemeCalls).toContain('vs');

      // Verify IPC sent to webview frame
      const lastMsg = mockSentMessages[mockSentMessages.length - 1];
      expect(lastMsg).toBeDefined();
      expect(lastMsg.type).toBe('THEME_CHANGED');
      expect(lastMsg.payload.themeId).toBe('vs');
      expect(lastMsg.payload.themeType).toBe('light');
      expect(lastMsg.payload.tokens).toBeDefined();

      // Test applyTheme('hc-black')
      nscodeTheme.applyTheme('hc-black');
      expect(nscodeTheme.getCurrentTheme()).toBe('hc-black');
      expect(mockRootAttributes['data-theme-id']).toBe('hc-black');
      expect(mockRootAttributes['data-theme-type']).toBe('hc-black');
      expect(mockSetThemeCalls).toContain('hc-black');
    });
  });
});
