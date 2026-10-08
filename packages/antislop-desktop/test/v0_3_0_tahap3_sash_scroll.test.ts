import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

describe('v0.3.0 Tahap 3 Single-Scroll & Anti-Trap Sash 60fps Suite', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const webviewIndexCssPath = path.resolve(__dirname, '../../antislop-webview/src/index.css');
  const codePreviewCssPath = path.resolve(__dirname, '../../antislop-webview/src/components/Common/CodePreview.css');

  describe('1. Webview Sovereign Single-Scroll CSS Invariants', () => {
    it('verifies html, body, and #root strictly enforce overflow: hidden and height: 100%', () => {
      const css = fs.readFileSync(webviewIndexCssPath, 'utf-8');
      
      const htmlBodyMatch = css.match(/html,\s*body\s*\{([^}]+)\}/);
      expect(htmlBodyMatch).not.toBeNull();
      if (htmlBodyMatch) {
        expect(htmlBodyMatch[1]).toContain('overflow: hidden !important');
        expect(htmlBodyMatch[1]).toContain('overscroll-behavior: none !important');
        expect(htmlBodyMatch[1]).toContain('height: 100%');
      }

      const rootMatch = css.match(/#root\s*\{([^}]+)\}/);
      expect(rootMatch).not.toBeNull();
      if (rootMatch) {
        expect(rootMatch[1]).toContain('overflow: hidden !important');
        expect(rootMatch[1]).toContain('height: 100%');
      }
    });

    it('verifies .app-container locks overflow: hidden with min-height: 0', () => {
      const css = fs.readFileSync(webviewIndexCssPath, 'utf-8');
      const appContainerMatch = css.match(/\.app-container\s*\{([^}]+)\}/);
      expect(appContainerMatch).not.toBeNull();
      if (appContainerMatch) {
        expect(appContainerMatch[1]).toContain('overflow: hidden !important');
        expect(appContainerMatch[1]).toContain('min-height: 0');
      }
    });

    it('verifies .main-content is the sole sovereign scroller with overscroll containment and stable gutter', () => {
      const css = fs.readFileSync(webviewIndexCssPath, 'utf-8');
      const mainContentMatch = css.match(/\.main-content\s*\{([^}]+)\}/);
      expect(mainContentMatch).not.toBeNull();
      if (mainContentMatch) {
        expect(mainContentMatch[1]).toContain('overflow-y: auto');
        expect(mainContentMatch[1]).toContain('overflow-x: hidden');
        expect(mainContentMatch[1]).toContain('overscroll-behavior-y: contain');
        expect(mainContentMatch[1]).toContain('scrollbar-gutter: stable');
        expect(mainContentMatch[1]).toContain('contain: layout style');
        expect(mainContentMatch[1]).toContain('transform: translateZ(0)');
      }
    });

    it('verifies child .code-preview-viewport uses overflow-y: visible to prevent nested scroll traps', () => {
      const css = fs.readFileSync(codePreviewCssPath, 'utf-8');
      const viewportMatch = css.match(/\.code-preview-viewport\s*\{([^}]+)\}/);
      expect(viewportMatch).not.toBeNull();
      if (viewportMatch) {
        expect(viewportMatch[1]).toContain('overflow-y: visible');
        expect(viewportMatch[1]).toContain('overflow-x: auto');
      }
    });
  });

  describe('2. Workbench Anti-Trap Sash & Transition Invariants', () => {
    it('verifies workbench.css disables iframe pointer-events under body.is-resizing', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const iframeRule = css.match(/body\.is-resizing\s+iframe[^{]*\{([^}]+)\}/);
      expect(iframeRule).not.toBeNull();
      if (iframeRule) {
        expect(iframeRule[1]).toContain('pointer-events: none !important');
      }

      const webviewRule = css.match(/body\.is-resizing\s+\.secondary-webview-frame[^{]*\{([^}]+)\}/);
      expect(webviewRule).not.toBeNull();
      if (webviewRule) {
        expect(webviewRule[1]).toContain('pointer-events: none !important');
      }
    });

    it('verifies workbench.css neutralizes sidebar transitions during drag to eliminate 60fps lag', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/body\.is-resizing\s+\.zone-secondary-sidebar[^{]*\{[^}]*transition:\s*none\s*!important/);
      expect(css).toMatch(/body\.is-resizing\s+\.zone-primary-sidebar[^{]*\{[^}]*transition:\s*none\s*!important/);
    });
  });

  describe('3. Runtime SidebarResizer rAF Batching & Drag Failsafes', () => {
    let mockSidebar: any;
    let mockSash: any;
    let eventMap: Record<string, Function>;
    let sashEventMap: Record<string, Function>;
    let mockDocument: any;
    let mockWindow: any;
    let rafCallbacks: Function[];
    let cancelledRafIds: number[];
    let currentRafId: number;

    beforeEach(() => {
      eventMap = {};
      sashEventMap = {};
      rafCallbacks = [];
      cancelledRafIds = [];
      currentRafId = 0;

      mockSidebar = {
        style: { width: '380px' },
        classList: {
          contains: vi.fn(() => false),
          add: vi.fn(),
          remove: vi.fn(),
        },
        getBoundingClientRect: vi.fn(() => ({ width: 380, left: 1000 })),
      };

      mockSash = {
        addEventListener: vi.fn((evt: string, cb: Function) => {
          sashEventMap[evt] = cb;
        }),
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      };

      mockDocument = {
        body: {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
      };

      mockWindow = {
        addEventListener: vi.fn((evt: string, cb: Function) => {
          eventMap[evt] = cb;
        }),
        removeEventListener: vi.fn(),
      };
    });

    function instantiateResizer(code: string) {
      const mockMultiGroup = { layoutAll: vi.fn() };
      const sandbox = {
        window: mockWindow,
        document: mockDocument,
        multiGroupManager: mockMultiGroup,
        requestAnimationFrame: vi.fn((cb: Function) => {
          currentRafId++;
          rafCallbacks.push(cb);
          return currentRafId;
        }),
        cancelAnimationFrame: vi.fn((id: number) => {
          cancelledRafIds.push(id);
        }),
        console,
        mockSidebar,
        mockSash,
      };

      vm.createContext(sandbox);

      const resizerClassMatch = code.match(/class SidebarResizer\s*\{[\s\S]*?\n\}/);
      expect(resizerClassMatch).not.toBeNull();

      const scriptToRun = `
        ${resizerClassMatch![0]}
        const resizer = new SidebarResizer(mockSidebar, mockSash, false);
      `;
      vm.runInContext(scriptToRun, sandbox);

      return { sandbox, mockMultiGroup };
    }

    it('enforces rAF batching during rapid 1,000 px/s mousemove drag', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      const { sandbox, mockMultiGroup } = instantiateResizer(code);

      // 1. Mousedown
      const mousedownHandler = sashEventMap['mousedown'];
      expect(mousedownHandler).toBeDefined();
      mousedownHandler({ clientX: 1000, button: 0, preventDefault: vi.fn() });

      expect(mockDocument.body.classList.add).toHaveBeenCalledWith('is-resizing');
      expect(mockSash.classList.add).toHaveBeenCalledWith('is-active');

      const mousemoveHandler = eventMap['mousemove'];
      expect(mousemoveHandler).toBeDefined();

      // 2. Rapid mouse movements (5 events in a burst)
      mousemoveHandler({ clientX: 950 });
      mousemoveHandler({ clientX: 900 });
      mousemoveHandler({ clientX: 850 });
      mousemoveHandler({ clientX: 800 });
      mousemoveHandler({ clientX: 750 }); // deltaX = 1000 - 750 = 250px -> target = 380 + 250 = 630px

      // Width immediately updated, but layoutAll batched via rAF
      expect(mockSidebar.style.width).toBe('630px');
      expect(sandbox.requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(mockMultiGroup.layoutAll).not.toHaveBeenCalled();

      // Execute rAF frame
      expect(rafCallbacks.length).toBe(1);
      rafCallbacks[0]();
      expect(mockMultiGroup.layoutAll).toHaveBeenCalledTimes(1);
    });

    it('clamps boundary metrics between min (280px) and max (700px)', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      instantiateResizer(code);

      sashEventMap['mousedown']({ clientX: 1000, button: 0, preventDefault: vi.fn() });

      const mousemoveHandler = eventMap['mousemove'];

      // Drag leftwards past 700px (e.g. clientX = 200 -> delta = 800px -> 380 + 800 = 1180px -> clamp to 700px)
      mousemoveHandler({ clientX: 200 });
      expect(mockSidebar.style.width).toBe('700px');

      // Drag rightwards near 280px boundary (clientX = 1080 -> delta = -80px -> 380 - 80 = 300px)
      mousemoveHandler({ clientX: 1080 });
      expect(mockSidebar.style.width).toBe('300px');
    });

    it('cancels drag state and releases anti-trap locks on window blur or mouseup', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      const { sandbox } = instantiateResizer(code);

      sashEventMap['mousedown']({ clientX: 1000, button: 0, preventDefault: vi.fn() });
      expect(mockDocument.body.classList.add).toHaveBeenCalledWith('is-resizing');

      // Trigger window blur (Alt-Tab during drag)
      const blurHandler = eventMap['blur'];
      expect(blurHandler).toBeDefined();
      blurHandler();

      // Locks released cleanly
      expect(mockDocument.body.classList.remove).toHaveBeenCalledWith('is-resizing');
      expect(mockSash.classList.remove).toHaveBeenCalledWith('is-active');

      // Verify pending rAF was cancelled if any
      if (sandbox.cancelAnimationFrame.mock.calls.length > 0) {
        expect(cancelledRafIds.length).toBeGreaterThan(0);
      }
    });
  });
});
