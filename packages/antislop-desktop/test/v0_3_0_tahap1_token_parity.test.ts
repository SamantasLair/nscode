import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import {
  ExtensionToWebviewMessageSchema,
  ThemeTokensPayloadSchema,
} from '../../../packages/antislop-protocol/src/index';

describe('v0.3.0 Tahap 1 Design Tokens & Color Parity Suite', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const webviewCssPath = path.resolve(__dirname, '../../antislop-webview/src/index.css');
  const webviewApiTsPath = path.resolve(__dirname, '../../antislop-webview/src/vscode-api.ts');

  describe('1. Static Token Parity & Zero-Hardcode Verification', () => {
    it('verifies workbench.css .secondary-webview-container avoids inverted dark elevation #18181b', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const containerMatch = css.match(/\.secondary-webview-container\s*\{([^}]+)\}/);
      expect(containerMatch).not.toBeNull();
      if (containerMatch) {
        expect(containerMatch[1]).toContain('var(--vscode-secondary-sidebar-bg');
        expect(containerMatch[1]).not.toContain('#18181b');
      }
    });

    it('verifies workbench.js THEME_REGISTRY defines full syntax tokens for vs-dark, vs, and hc-black', () => {
      const js = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      // vs-dark
      expect(js).toContain("'--vscode-symbolIcon-keywordForeground': '#c586c0'");
      expect(js).toContain("'--vscode-symbolIcon-functionForeground': '#dcdcaa'");
      expect(js).toContain("'--vscode-symbolIcon-stringForeground': '#ce9178'");
      expect(js).toContain("'--vscode-symbolIcon-numberForeground': '#b5cea8'");
      expect(js).toContain("'--vscode-symbolIcon-classForeground': '#4ec9b0'");
      expect(js).toContain("'--vscode-symbolIcon-variableForeground': '#9cdcfe'");
      expect(js).toContain("'--vscode-symbolIcon-operatorForeground': '#d4d4d4'");

      // vs (light)
      expect(js).toContain("'--vscode-symbolIcon-keywordForeground': '#af00db'");
      expect(js).toContain("'--vscode-symbolIcon-functionForeground': '#795e26'");
      expect(js).toContain("'--vscode-symbolIcon-stringForeground': '#a31515'");
      expect(js).toContain("'--vscode-symbolIcon-numberForeground': '#098658'");
      expect(js).toContain("'--vscode-symbolIcon-classForeground': '#267f99'");
      expect(js).toContain("'--vscode-symbolIcon-variableForeground': '#001080'");
      expect(js).toContain("'--vscode-symbolIcon-operatorForeground': '#000000'");

      // hc-black (high contrast)
      expect(js).toContain("'--vscode-symbolIcon-keywordForeground': '#569cd6'");
      expect(js).toContain("'--vscode-symbolIcon-operatorForeground': '#ffffff'");
    });

    it('verifies antislop-webview index.css defines 1:1 semantic syntax tokens mapped to VS Code variables', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).toContain('--token-keyword: var(--vscode-symbolIcon-keywordForeground');
      expect(css).toContain('--token-function: var(--vscode-symbolIcon-functionForeground');
      expect(css).toContain('--token-string: var(--vscode-symbolIcon-stringForeground');
      expect(css).toContain('--token-number: var(--vscode-symbolIcon-numberForeground');
      expect(css).toContain('--token-comment: var(--vscode-descriptionForeground');
      expect(css).toContain('--token-type: var(--vscode-symbolIcon-classForeground');
      expect(css).toContain('--token-variable: var(--vscode-symbolIcon-variableForeground');
      expect(css).toContain('--token-punctuation: var(--vscode-editor-foreground');
      expect(css).toContain('--token-operator: var(--vscode-symbolIcon-operatorForeground');
    });

    it('verifies antislop-webview index.css enforces Anti-Slop disabled tokens without saturated accent', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      expect(css).toMatch(/button:disabled[\s\S]*?\.token-chip:disabled/);
      expect(css).toContain('opacity: 0.65');
      expect(css).toContain('background: var(--bg-muted, #252526) !important');
    });

    it('verifies antislop-webview index.css replaced hardcoded callout hexes with CSS variables', () => {
      const css = fs.readFileSync(webviewCssPath, 'utf-8');
      const calloutMatch = css.match(/\.contract-callout\s*\{([^}]+)\}/);
      expect(calloutMatch).not.toBeNull();
      if (calloutMatch) {
        expect(calloutMatch[1]).toContain('var(--accent-red-bg');
        expect(calloutMatch[1]).toContain('var(--accent-red-border');
        expect(calloutMatch[1]).not.toContain('#3f1d1d');
      }

      const streamingMatch = css.match(/\.streaming-token-box\s*\{([^}]+)\}/);
      expect(streamingMatch).not.toBeNull();
      if (streamingMatch) {
        expect(streamingMatch[1]).toContain('var(--bg-surface-elevated');
        expect(streamingMatch[1]).not.toContain('#121214');
      }
    });

    it('verifies antislop-webview vscode-api.ts contains FALLBACK_THEME_TOKENS for resilience', () => {
      const ts = fs.readFileSync(webviewApiTsPath, 'utf-8');
      expect(ts).toContain('FALLBACK_THEME_TOKENS');
      expect(ts).toContain("'--vscode-symbolIcon-keywordForeground'");
      expect(ts).toContain("'--vscode-symbolIcon-functionForeground'");
      expect(ts).toContain("'--vscode-symbolIcon-stringForeground'");
      expect(ts).toContain("document.body.setAttribute('data-theme-id'");
      expect(ts).toContain("document.body.setAttribute('data-theme-type'");
    });
  });

  describe('2. Runtime Theme Switch IPC Simulation', () => {
    let mockRootStyle: Record<string, string>;
    let mockRootAttributes: Record<string, string>;
    let mockSentMessages: any[];

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
        contentWindow: {
          postMessage: vi.fn((msg: any) => {
            mockSentMessages.push(msg);
          }),
        },
        addEventListener: vi.fn(),
      };

      return {
        document: {
          documentElement,
          getElementById: vi.fn((id: string) => {
            if (id === 'webview-frame') return webviewFrame;
            return null;
          }),
        },
        webviewFrame,
      };
    }

    beforeEach(() => {
      mockRootStyle = {};
      mockRootAttributes = {};
      mockSentMessages = [];
    });

    it('dispatches THEME_CHANGED with full syntax tokens on applyTheme("vs-dark")', () => {
      const { document } = createMockDOM();
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');

      // Extract THEME_REGISTRY, dispatchThemeToWebview, applyTheme
      const sandbox = {
        document,
        window: {
          monaco: { editor: { setTheme: vi.fn() } },
        },
        console,
        currentThemeId: 'vs-dark',
      };
      vm.createContext(sandbox);

      const registryMatch = code.match(/const THEME_REGISTRY = \{[\s\S]*?\n\};\n/);
      expect(registryMatch).not.toBeNull();

      const dispatchMatch = code.match(/function dispatchThemeToWebview[\s\S]*?\n\}/);
      expect(dispatchMatch).not.toBeNull();

      const applyMatch = code.match(/function applyTheme[\s\S]*?\n\}/);
      expect(applyMatch).not.toBeNull();

      const scriptToRun = `
        ${registryMatch![0]}
        let currentThemeId = 'vs-dark';
        ${dispatchMatch![0]}
        ${applyMatch![0]}
        applyTheme('vs-dark');
      `;

      vm.runInContext(scriptToRun, sandbox);

      expect(mockSentMessages.length).toBe(1);
      const sent = mockSentMessages[0];
      expect(sent.type).toBe('THEME_CHANGED');
      expect(sent.payload.themeId).toBe('vs-dark');
      expect(sent.payload.tokens['--vscode-symbolIcon-keywordForeground']).toBe('#c586c0');
      expect(sent.payload.tokens['--vscode-symbolIcon-functionForeground']).toBe('#dcdcaa');

      // Protocol validation
      const parseResult = ExtensionToWebviewMessageSchema.safeParse(sent);
      expect(parseResult.success).toBe(true);
    });

    it('dispatches THEME_CHANGED with light syntax tokens on applyTheme("vs")', () => {
      const { document } = createMockDOM();
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');

      const sandbox = {
        document,
        window: {
          monaco: { editor: { setTheme: vi.fn() } },
        },
        console,
        currentThemeId: 'vs-dark',
      };
      vm.createContext(sandbox);

      const registryMatch = code.match(/const THEME_REGISTRY = \{[\s\S]*?\n\};\n/);
      const dispatchMatch = code.match(/function dispatchThemeToWebview[\s\S]*?\n\}/);
      const applyMatch = code.match(/function applyTheme[\s\S]*?\n\}/);

      const scriptToRun = `
        ${registryMatch![0]}
        let currentThemeId = 'vs-dark';
        ${dispatchMatch![0]}
        ${applyMatch![0]}
        applyTheme('vs');
      `;

      vm.runInContext(scriptToRun, sandbox);

      expect(mockSentMessages.length).toBe(1);
      const sent = mockSentMessages[0];
      expect(sent.type).toBe('THEME_CHANGED');
      expect(sent.payload.themeId).toBe('vs');
      expect(sent.payload.themeType).toBe('light');
      expect(sent.payload.tokens['--vscode-symbolIcon-keywordForeground']).toBe('#af00db');
      expect(sent.payload.tokens['--vscode-symbolIcon-functionForeground']).toBe('#795e26');

      const parseResult = ExtensionToWebviewMessageSchema.safeParse(sent);
      expect(parseResult.success).toBe(true);
    });
  });
});
