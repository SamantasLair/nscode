import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

describe('BridgeWire Visual Spline Overlay Suite', () => {
  const workbenchHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const bridgewireJsPath = path.resolve(__dirname, '../src/workbench/bridgewire.js');

  describe('1. HTML Markup & SVG Canvas Structure', () => {
    it('verifies index.html contains #bridgewire-overlay-canvas before body close', () => {
      const html = fs.readFileSync(workbenchHtmlPath, 'utf-8');
      expect(html).toContain('id="bridgewire-overlay-canvas"');
      expect(html).toContain('class="bridgewire-canvas"');
      expect(html).toContain('id="bw-glow"');
      expect(html).toContain('id="bw-dot-end"');
      expect(html).toContain('id="bridgewire-active-spline"');
      expect(html).toContain('class="bridgewire-spline"');
      expect(html).toContain('<script src="bridgewire.js"></script>');
    });

    it('verifies filter and marker SVG definitions', () => {
      const html = fs.readFileSync(workbenchHtmlPath, 'utf-8');
      expect(html).toContain('<feGaussianBlur stdDeviation="3" result="blur"');
      expect(html).toContain('<feMergeNode in="blur"');
      expect(html).toContain('<feMergeNode in="SourceGraphic"');
      expect(html).toContain('<circle cx="3" cy="3" r="2.5" class="bridgewire-marker"');
    });
  });

  describe('2. Workbench CSS Rules & Design System Tokens', () => {
    it('verifies #bridgewire-overlay-canvas fixed overlay styling', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*position:\s*fixed;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*top:\s*0;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*left:\s*0;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*width:\s*100vw;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*height:\s*100vh;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*pointer-events:\s*none;/);
      expect(css).toMatch(/#bridgewire-overlay-canvas\s*\{[^}]*z-index:\s*9999;/);
    });

    it('verifies .bridgewire-spline and animation rules', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*stroke:\s*var\(--vscode-focusBorder,\s*#007acc\);/);
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*stroke-width:\s*2px;/);
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*stroke-dasharray:\s*6 3;/);
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*animation:\s*bw-dash 1\.5s linear infinite;/);
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*filter:\s*url\(#bw-glow\);/);
      expect(css).toMatch(/\.bridgewire-spline\.error\s*\{[^}]*stroke:\s*var\(--vscode-editorError-foreground,\s*#f14c4c\);/);
      expect(css).toMatch(/\.bridgewire-marker\s*\{[^}]*fill:\s*var\(--vscode-focusBorder,\s*#007acc\);/);
      expect(css).toMatch(/@keyframes bw-dash\s*\{[^}]*to\s*\{[^}]*stroke-dashoffset:\s*-18;/);
    });
  });

  describe('3. BridgeWireController JavaScript Engine', () => {
    let BridgeWireController: any;
    let mockSvg: any;
    let mockSpline: any;
    let originalWindow: any;
    let originalDoc: any;

    beforeEach(() => {
      originalWindow = (global as any).window;
      originalDoc = (global as any).document;

      mockSpline = {
        setAttribute: vi.fn(),
        getAttribute: vi.fn().mockReturnValue('url(#bw-dot-end)'),
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn().mockReturnValue(false),
        },
      };

      mockSvg = {
        style: {},
      };

      (global as any).document = {
        getElementById: vi.fn((id: string) => {
          if (id === 'bridgewire-overlay-canvas') return mockSvg;
          if (id === 'bridgewire-active-spline') return mockSpline;
          return null;
        }),
        querySelector: vi.fn(),
      };

      (global as any).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // Fresh require
      delete require.cache[require.resolve('../src/workbench/bridgewire.js')];
      const mod = require('../src/workbench/bridgewire.js');
      BridgeWireController = mod.BridgeWireController;
    });

    afterEach(() => {
      (global as any).window = originalWindow;
      (global as any).document = originalDoc;
    });

    it('instantiates BridgeWireController with initial idle state', () => {
      const controller = new BridgeWireController();
      expect(controller.state).toEqual({
        active: false,
        start: null,
        end: null,
        isDirty: false,
        rafId: null,
      });
      expect(controller.svg).toBe(mockSvg);
      expect(controller.spline).toBe(mockSpline);
    });

    it('computes smooth cubic Bezier spline with adaptive tension', () => {
      const controller = new BridgeWireController();
      const path1 = controller.computeSpline(100, 200, 500, 300);
      expect(path1).toMatch(/^M 100\.0,200\.0 C \d+\.\d+,200\.0 \d+\.\d+,300\.0 500\.0,300\.0$/);

      // dx = 400 => abs(dx)/400 = 1.0 => clamped to 0.6 => cx1 = 100 + 400*0.6 = 340, cx2 = 500 - 400*0.6 = 260
      expect(path1).toBe('M 100.0,200.0 C 340.0,200.0 260.0,300.0 500.0,300.0');

      // Small dx = 40 => abs(dx)/400 = 0.1 => clamped to min 0.2
      const path2 = controller.computeSpline(100, 100, 140, 150);
      // cx1 = 100 + 40*0.2 = 108.0, cx2 = 140 - 40*0.2 = 132.0
      expect(path2).toBe('M 100.0,100.0 C 108.0,100.0 132.0,150.0 140.0,150.0');
    });

    it('connects numeric coordinates directly', () => {
      const controller = new BridgeWireController();
      controller.connect({ x: 120, y: 150 }, { x: 400, y: 350 });

      expect(controller.state.active).toBe(true);
      expect(controller.state.isDirty).toBe(true);

      const d = controller.render();
      expect(d).toContain('M 120.0,150.0 C');
      expect(mockSpline.setAttribute).toHaveBeenCalledWith('d', d);
      expect(controller.state.isDirty).toBe(false);
    });

    it('connects Monaco editor line to HTMLElement target with live geometry', () => {
      const controller = new BridgeWireController();

      const mockEditor = {
        getDomNode: vi.fn().mockReturnValue({
          getBoundingClientRect: () => ({ left: 60, top: 40, width: 800, height: 600 }),
        }),
        getScrolledVisiblePosition: vi.fn().mockReturnValue({
          left: 140,
          top: 180,
          height: 20,
        }),
        onDidScrollChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };

      const mockTargetEl = {
        getBoundingClientRect: () => ({ left: 950, top: 220, width: 300, height: 100 }),
      };

      controller.connect({ editor: mockEditor, lineNumber: 42 }, mockTargetEl);

      expect(controller.state.active).toBe(true);
      expect(mockEditor.onDidScrollChange).toHaveBeenCalled();

      const d = controller.render();
      // x1 = 60 + 140 = 200, y1 = 40 + 180 + 10 = 230
      // x2 = 950, y2 = 220 + 50 = 270
      expect(d).toContain('M 200.0,230.0 C');
      expect(d).toContain('950.0,270.0');
      expect(mockSpline.setAttribute).toHaveBeenCalledWith('d', d);
    });

    it('handles error state option with CSS class toggle', () => {
      const controller = new BridgeWireController();
      controller.connect({ x: 0, y: 0 }, { x: 100, y: 100 }, { isError: true });
      expect(mockSpline.classList.add).toHaveBeenCalledWith('error');

      controller.connect({ x: 0, y: 0 }, { x: 100, y: 100 }, { isError: false });
      expect(mockSpline.classList.remove).toHaveBeenCalledWith('error');
    });

    it('disconnects and clears the active spline', () => {
      const controller = new BridgeWireController();
      controller.connect({ x: 10, y: 20 }, { x: 100, y: 200 });
      controller.render();

      controller.disconnect();
      expect(controller.state.active).toBe(false);
      expect(controller.state.isDirty).toBe(false);
      expect(mockSpline.setAttribute).toHaveBeenCalledWith('d', '');
      expect(mockSpline.classList.remove).toHaveBeenCalledWith('error');
    });

    it('binds scroll and resize listeners via startListening', () => {
      const controller = new BridgeWireController();
      const mockDisposable = { dispose: vi.fn() };
      let scrollCb: Function = () => {};
      const mockEditor = {
        onDidScrollChange: vi.fn((cb) => {
          scrollCb = cb;
          return mockDisposable;
        }),
      };

      controller.startListening(mockEditor);
      expect(mockEditor.onDidScrollChange).toHaveBeenCalled();
      expect((global as any).window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

      controller.connect({ x: 50, y: 50 }, { x: 200, y: 200 });
      controller.render();
      expect(controller.state.isDirty).toBe(false);

      // Trigger scroll
      scrollCb();
      expect(controller.state.isDirty).toBe(true);

      // Clean up
      controller.stopListening();
      expect(mockDisposable.dispose).toHaveBeenCalled();
      expect((global as any).window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('attaches singleton instance to window.nscodeBridgeWire', () => {
      expect((global as any).window.nscodeBridgeWire).toBeDefined();
      expect((global as any).window.nscodeBridgeWire).toBeInstanceOf(BridgeWireController);
    });
  });
});
