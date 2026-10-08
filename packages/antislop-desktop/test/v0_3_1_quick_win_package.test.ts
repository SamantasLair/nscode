import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

describe('Quick Win Package Suite (LSP Diagnostics + Telemetry rAF Throttle + Proactive Duck Nudge)', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const maieuticDuckJsPath = path.resolve(__dirname, '../src/workbench/maieutic-duck.js');

  describe('1. CSS Invariants for LSP Diagnostic Cards', () => {
    it('verifies .lsp-diagnostic-card styles in workbench.css', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/\.technical-summary-card\.lsp-diagnostic-card[^{]*\{[^}]*border-left/);
      expect(css).toMatch(/\.technical-summary-card\.lsp-diagnostic-card\.diagnostic-error/);
      expect(css).toMatch(/\.technical-summary-card\.lsp-diagnostic-card\.diagnostic-warning/);
      expect(css).toMatch(/\.summary-card-badge\.badge-error/);
      expect(css).toMatch(/\.summary-card-badge\.badge-warning/);
    });

    it('verifies 160ms cubic-bezier transition on LSP cards', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const cardBlock = css.substring(css.indexOf('.technical-summary-card.lsp-diagnostic-card'));
      expect(cardBlock).toMatch(/160ms\s+cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
    });
  });

  describe('2. Telemetry rAF Throttling Invariants', () => {
    it('verifies updateCursorTelemetry clamps IPC emissions with requestAnimationFrame / 16ms throttle', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      const telemetryBlock = code.substring(
        code.indexOf('function updateCursorTelemetry'),
        code.indexOf('function updateScreenBModePill')
      );
      expect(telemetryBlock).toContain('_rafPending');
      expect(telemetryBlock).toContain('requestAnimationFrame');
      expect(telemetryBlock).toContain('editorEventBridge.emit');
      expect(telemetryBlock).toContain('CURSOR_TELEMETRY_UPDATE');
    });
  });

  describe('3. LSP Diagnostics Streaming to Screen B Smart Cards', () => {
    it('verifies syncLspDiagnosticsToScreenB renders cards and broadcasts IPC', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      expect(code).toContain('function syncLspDiagnosticsToScreenB(markers)');
      expect(code).toContain('lsp-diagnostic-card');
      expect(code).toContain('LSP_DIAGNOSTICS_UPDATE');

      // Test execution in isolated VM sandbox
      class MockElement {
        tagName: string;
        className: string = '';
        dataset: Record<string, string> = {};
        children: MockElement[] = [];
        innerHTML: string = '';
        eventListeners: Map<string, Function[]> = new Map();

        constructor(tag: string) {
          this.tagName = tag.toUpperCase();
        }

        appendChild(child: MockElement) {
          this.children.push(child);
          return child;
        }

        querySelectorAll(selector: string) {
          return this.children.filter(c => c.className.includes('lsp-diagnostic-card'));
        }

        remove() {}

        addEventListener(event: string, handler: Function) {
          if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
          this.eventListeners.get(event)!.push(handler);
        }
      }

      const summaryContainer = new MockElement('div');
      const postedIframeMessages: any[] = [];
      const duckFailureCalls: any[] = [];

      const mockIframe = {
        contentWindow: {
          postMessage: (msg: any) => postedIframeMessages.push(msg),
        }
      };

      const sandbox: any = {
        document: {
          getElementById: (id: string) => id === 'technical-summary-cards-container' ? summaryContainer : null,
          createElement: (tag: string) => new MockElement(tag),
          querySelector: (sel: string) => sel === '.secondary-webview-frame' ? mockIframe : null,
        },
        window: {
          nscodeMaieuticDuck: {
            notifyFailure: (ctx: any) => duckFailureCalls.push(ctx),
          }
        },
        escapeHtml: (s: string) => s,
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('function syncLspDiagnosticsToScreenB'), code.indexOf('const MENU_DEFINITIONS'))}
        `,
        sandbox
      );

      const mockMarkers = [
        { severity: 8, message: 'Type error: cannot assign number to string', startLineNumber: 42, startColumn: 10, source: 'ts', resource: { fsPath: 'src/app.ts' } },
        { severity: 4, message: 'Unused variable: foo', startLineNumber: 15, startColumn: 5, source: 'eslint', resource: { fsPath: 'src/app.ts' } },
      ];

      sandbox.syncLspDiagnosticsToScreenB(mockMarkers);

      // Verify cards generated in container
      expect(summaryContainer.children.length).toBe(2);
      expect(summaryContainer.children[0].className).toContain('diagnostic-error');
      expect(summaryContainer.children[1].className).toContain('diagnostic-warning');

      // Verify IPC broadcast
      expect(postedIframeMessages.length).toBe(1);
      expect(postedIframeMessages[0].type).toBe('LSP_DIAGNOSTICS_UPDATE');
      expect(postedIframeMessages[0].payload.errors).toBe(1);
      expect(postedIframeMessages[0].payload.warnings).toBe(1);

      // Verify proactive duck integration called on severe error
      expect(duckFailureCalls.length).toBe(1);
      expect(duckFailureCalls[0].line).toBe(42);
      expect(duckFailureCalls[0].message).toContain('Type error');
    });
  });

  describe('4. Proactive Maieutic Duck Nudge Engine', () => {
    it('triggers proactive Socratic nudge when 3 failures occur in 60 seconds', () => {
      const duckCode = fs.readFileSync(maieuticDuckJsPath, 'utf-8');
      
      const sandbox: any = {
        console,
        window: {},
        Date,
        setTimeout,
      };

      vm.runInNewContext(duckCode, sandbox);
      const DuckClass = sandbox.MaieuticDuckController || sandbox.window?.MaieuticDuckController;
      const controller = new DuckClass();

      // First failure: no trigger
      const trigger1 = controller.notifyFailure({ symbol: 'quicksort', line: 12, message: 'Failed assertion' });
      expect(trigger1).toBe(false);
      expect(controller.dialogue.length).toBe(0);

      // Second failure: no trigger
      const trigger2 = controller.notifyFailure({ symbol: 'quicksort', line: 12, message: 'Failed assertion' });
      expect(trigger2).toBe(false);

      // Third failure: triggers proactive Socratic nudge!
      const trigger3 = controller.notifyFailure({ symbol: 'quicksort', line: 12, message: 'Failed assertion' });
      expect(trigger3).toBe(true);

      expect(controller.dialogue.length).toBeGreaterThan(0);
      const firstBubble = controller.dialogue[0];
      expect(firstBubble.sender).toBe('duck');
      expect(firstBubble.text).toContain('3 kegagalan');
      expect(firstBubble.text).toContain('quicksort');
    });

    it('triggers proactive Socratic nudge upon user frustration churn', () => {
      const duckCode = fs.readFileSync(maieuticDuckJsPath, 'utf-8');
      
      const sandbox: any = {
        console,
        window: {},
        Date,
        setTimeout,
      };

      vm.runInNewContext(duckCode, sandbox);
      const DuckClass = sandbox.MaieuticDuckController || sandbox.window?.MaieuticDuckController;
      const controller = new DuckClass();

      const triggered = controller.notifyFrustration({ symbol: 'binarySearch', line: 45 });
      expect(triggered).toBe(true);

      const firstBubble = controller.dialogue[0];
      expect(firstBubble.sender).toBe('duck');
      expect(firstBubble.phase).toBe('invariant');
      expect(firstBubble.text).toContain('menulis ulang binarySearch beberapa kali');
    });
  });
});
