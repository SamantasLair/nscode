import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';

describe('v0.3.0 Tahap 4 Target Stack 22px Chip Accordion & Kinetic Motion Suite', () => {
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const indexHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');

  describe('1. CSS 22px Chip Accordion & Kinetic Motion Invariants', () => {
    it('verifies .target-line-card.chip-collapsed enforces 22px height constraint and overflow clipping', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const collapsedMatch = css.match(/\.target-line-card\.chip-collapsed[^{]*\{([^}]+)\}/);
      expect(collapsedMatch).not.toBeNull();
      if (collapsedMatch) {
        expect(collapsedMatch[1]).toContain('height: 22px');
        expect(collapsedMatch[1]).toContain('max-height: 22px');
        expect(collapsedMatch[1]).toContain('min-height: 22px');
        expect(collapsedMatch[1]).toContain('overflow: hidden');
        expect(collapsedMatch[1]).toContain('padding: 0 8px');
      }
    });

    it('verifies collapsed mode strictly suppresses preview snippets and actions', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/\.target-line-card\.chip-collapsed\s+\.target-code-preview[^{]*\{[^}]*display:\s*none\s*!important/);
      expect(css).toMatch(/\.target-line-card\.chip-collapsed\s+\.target-card-actions[^{]*\{[^}]*display:\s*none\s*!important/);
    });

    it('verifies .target-line-card.chip-expanded provides smooth expansion up to 300px with focus highlight', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const expandedMatch = css.match(/\.target-line-card\.chip-expanded[^{]*\{([^}]+)\}/);
      expect(expandedMatch).not.toBeNull();
      if (expandedMatch) {
        expect(expandedMatch[1]).toContain('height: auto');
        expect(expandedMatch[1]).toContain('max-height: 300px');
        expect(expandedMatch[1]).toContain('var(--vscode-focusBorder, #007acc)');
        expect(expandedMatch[1]).toContain('box-shadow');
      }
    });

    it('verifies kinetic motion curve 160ms cubic-bezier(0.4, 0, 0.2, 1) and GPU promotion', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      expect(css).toMatch(/160ms\s+cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
      expect(css).toMatch(/transform:\s*translateZ\(0\)/);
    });

    it('verifies Monaco theme token parity across target stack components', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const stackSection = css.substring(
        css.indexOf('.target-line-stack-container'),
        css.indexOf('/* Technical Summary Cards */')
      );
      expect(stackSection).toContain('var(--vscode-sideBar-background');
      expect(stackSection).toContain('var(--vscode-editor-background');
      expect(stackSection).toContain('var(--vscode-sideBarSectionHeader-border');
      expect(stackSection).toContain('var(--vscode-badge-background');
      expect(stackSection).toContain('var(--vscode-badge-foreground');
      expect(stackSection).toContain('var(--vscode-focusBorder');
      expect(stackSection).toContain('var(--vscode-foreground');
      expect(stackSection).toContain('var(--vscode-descriptionForeground');
    });

    it('verifies Screen B cursor position scope pill styling in workbench.css', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');
      const cursorPosMatch = css.match(/\.screen-b-cursor-pos\s*\{([^}]+)\}/);
      expect(cursorPosMatch).not.toBeNull();
      if (cursorPosMatch) {
        expect(cursorPosMatch[1]).toContain('var(--vscode-descriptionForeground, #858585)');
        expect(cursorPosMatch[1]).toContain('border-left');
        expect(cursorPosMatch[1]).toContain('white-space: nowrap');
      }
    });

    it('verifies index.html contains #screen-b-cursor-pos within breadcrumb header', () => {
      const html = fs.readFileSync(indexHtmlPath, 'utf-8');
      expect(html).toContain('id="screen-b-cursor-pos"');
      expect(html).toContain('class="screen-b-cursor-pos"');
    });
  });

  describe('2. DOM Accordion State Machine, Keyboard A11y & Telemetry Invariants', () => {
    let mockDocument: any;
    let mockWindow: any;
    let elements: Map<string, any>;
    let revealedTargets: any[];
    let removedTargetIds: string[];
    let requestedGuidanceTargets: any[];
    let postedIframeMessages: any[];

    class MockElement {
      tagName: string;
      id: string = '';
      className: string = '';
      textContent: string = '';
      dataset: Record<string, string> = {};
      style: Record<string, string> = {};
      children: MockElement[] = [];
      attributes: Map<string, string> = new Map();
      eventListeners: Map<string, Function[]> = new Map();

      constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
      }

      setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
        if (name === 'data-target-id') this.dataset.targetId = value;
        if (name === 'data-file-path') this.dataset.filePath = value;
        if (name === 'data-start-line') this.dataset.startLine = value;
        if (name === 'data-end-line') this.dataset.endLine = value;
      }

      getAttribute(name: string) {
        return this.attributes.get(name) || null;
      }

      get classList() {
        return {
          add: (...cls: string[]) => {
            const list = this.className.split(/\s+/).filter(Boolean);
            cls.forEach(c => { if (!list.includes(c)) list.push(c); });
            this.className = list.join(' ');
          },
          remove: (...cls: string[]) => {
            const list = this.className.split(/\s+/).filter(Boolean);
            this.className = list.filter(c => !cls.includes(c)).join(' ');
          },
          contains: (cls: string) => {
            return this.className.split(/\s+/).includes(cls);
          },
          toggle: (cls: string, force?: boolean) => {
            const exists = this.classList.contains(cls);
            const shouldAdd = force !== undefined ? force : !exists;
            if (shouldAdd) this.classList.add(cls);
            else this.classList.remove(cls);
            return shouldAdd;
          }
        };
      }

      appendChild(child: MockElement) {
        this.children.push(child);
        return child;
      }

      get innerHTML() {
        return '';
      }

      set innerHTML(val: string) {
        this.children = [];
        if (!val) return;
        
        // Lightweight simulated parser for target card elements
        if (val.includes('target-btn-dismiss')) {
          const dismissBtn = new MockElement('button');
          dismissBtn.className = 'target-btn-dismiss';
          this.children.push(dismissBtn);
        }
        if (val.includes('target-btn-reveal')) {
          const revealBtn = new MockElement('button');
          revealBtn.className = 'target-btn-reveal';
          this.children.push(revealBtn);
        }
        if (val.includes('btn-request-guidance')) {
          const guidanceBtn = new MockElement('button');
          guidanceBtn.className = 'btn-request-guidance target-btn-guidance';
          this.children.push(guidanceBtn);
        }
      }

      querySelector(selector: string): MockElement | null {
        if (selector === '.target-btn-dismiss') {
          return this.children.find(c => c.className.includes('target-btn-dismiss')) || null;
        }
        if (selector === '.target-btn-reveal') {
          return this.children.find(c => c.className.includes('target-btn-reveal')) || null;
        }
        if (selector === '.btn-request-guidance') {
          return this.children.find(c => c.className.includes('btn-request-guidance')) || null;
        }
        return null;
      }

      querySelectorAll(selector: string): MockElement[] {
        return this.children.filter(c => {
          if (selector.includes('target-line-card') || selector.includes('target-card')) {
            return c.className.includes('target-line-card') || c.className.includes('target-card');
          }
          return false;
        });
      }

      addEventListener(event: string, handler: Function) {
        if (!this.eventListeners.has(event)) {
          this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(handler);
      }

      dispatchEvent(event: { type: string; target?: any; [key: string]: any }) {
        let propagationStopped = false;
        const evt = {
          ...event,
          target: event.target || this,
          stopPropagation: () => { propagationStopped = true; },
          preventDefault: () => {},
        };

        const handlers = this.eventListeners.get(event.type) || [];
        for (const h of handlers) {
          if (propagationStopped) break;
          h(evt);
        }
        return !propagationStopped;
      }
    }

    beforeEach(() => {
      elements = new Map();
      revealedTargets = [];
      removedTargetIds = [];
      requestedGuidanceTargets = [];
      postedIframeMessages = [];

      const stackList = new MockElement('div');
      stackList.id = 'target-stack-list';
      elements.set('target-stack-list', stackList);

      const stackContainer = new MockElement('div');
      stackContainer.id = 'target-line-stack-container';
      elements.set('target-line-stack-container', stackContainer);

      const stackCount = new MockElement('span');
      stackCount.id = 'target-stack-count';
      elements.set('target-stack-count', stackCount);

      const screenBCursorPos = new MockElement('span');
      screenBCursorPos.id = 'screen-b-cursor-pos';
      elements.set('screen-b-cursor-pos', screenBCursorPos);

      const statusCursorPos = new MockElement('span');
      statusCursorPos.id = 'status-cursor-pos';
      elements.set('status-cursor-pos', statusCursorPos);

      const screenBActiveFile = new MockElement('span');
      screenBActiveFile.id = 'screen-b-active-file';
      elements.set('screen-b-active-file', screenBActiveFile);

      const mockIframe = new MockElement('iframe');
      mockIframe.className = 'secondary-webview-frame';
      (mockIframe as any).contentWindow = {
        postMessage: (msg: any) => {
          postedIframeMessages.push(msg);
        }
      };

      mockDocument = {
        getElementById: (id: string) => elements.get(id) || null,
        createElement: (tag: string) => new MockElement(tag),
        querySelector: (selector: string) => {
          if (selector === '.secondary-webview-frame') return mockIframe;
          return null;
        },
        querySelectorAll: (selector: string) => {
          if (selector.includes('target-line-card') || selector.includes('target-card')) {
            const list = elements.get('target-stack-list');
            return list ? list.children : [];
          }
          return [];
        }
      };

      mockWindow = {
        document: mockDocument,
        editorEventBridge: {
          emit: vi.fn()
        }
      };
    });

    it('renders target cards in .chip-collapsed mode with aria-expanded="false" and tabindex="0" by default', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18, codeSnippet: 'def partition(arr):' },
          { id: 'target-2', filePath: 'utils.py', startLine: 45, endLine: 50, codeSnippet: 'def swap(a, b):' },
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: (t: any) => revealedTargets.push(t),
        removeTargetFromStack: (id: string) => removedTargetIds.push(id),
        requestGuidanceForTarget: (t: any) => requestedGuidanceTargets.push(t),
      };

      // Extract functions
      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      sandbox.renderTargetStack();

      const listEl = elements.get('target-stack-list');
      expect(listEl.children.length).toBe(2);

      const card1 = listEl.children[0];
      const card2 = listEl.children[1];

      expect(card1.classList.contains('chip-collapsed')).toBe(true);
      expect(card1.classList.contains('chip-expanded')).toBe(false);
      expect(card1.getAttribute('aria-expanded')).toBe('false');
      expect(card1.getAttribute('role')).toBe('button');
      expect(card1.getAttribute('tabindex')).toBe('0');

      expect(card2.classList.contains('chip-collapsed')).toBe(true);
      expect(card2.getAttribute('aria-expanded')).toBe('false');
    });

    it('toggles a card to .chip-expanded on click and calls revealTargetInMonaco', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18, codeSnippet: 'def partition(arr):' },
          { id: 'target-2', filePath: 'utils.py', startLine: 45, endLine: 50, codeSnippet: 'def swap(a, b):' },
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: (t: any) => revealedTargets.push(t),
        removeTargetFromStack: (id: string) => removedTargetIds.push(id),
        requestGuidanceForTarget: (t: any) => requestedGuidanceTargets.push(t),
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      sandbox.renderTargetStack();
      const listEl = elements.get('target-stack-list');
      const card1 = listEl.children[0];

      // Simulate click on card body (not a button)
      card1.dispatchEvent({
        type: 'click',
        target: { closest: () => null }
      });

      expect(revealedTargets.length).toBe(1);
      expect(revealedTargets[0].id).toBe('target-1');

      // Card 1 is now expanded
      const updatedCard1 = listEl.children[0];
      const updatedCard2 = listEl.children[1];
      expect(updatedCard1.classList.contains('chip-expanded')).toBe(true);
      expect(updatedCard1.classList.contains('chip-collapsed')).toBe(false);
      expect(updatedCard1.getAttribute('aria-expanded')).toBe('true');

      // Card 2 remains collapsed
      expect(updatedCard2.classList.contains('chip-collapsed')).toBe(true);
      expect(updatedCard2.getAttribute('aria-expanded')).toBe('false');
    });

    it('collapses an expanded card back to 22px chip on second click', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18, codeSnippet: 'def partition(arr):' }
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: (t: any) => revealedTargets.push(t),
        removeTargetFromStack: (id: string) => removedTargetIds.push(id),
        requestGuidanceForTarget: (t: any) => requestedGuidanceTargets.push(t),
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      sandbox.renderTargetStack();
      const listEl = elements.get('target-stack-list');

      // First click expands
      listEl.children[0].dispatchEvent({
        type: 'click',
        target: { closest: () => null }
      });
      expect(listEl.children[0].classList.contains('chip-expanded')).toBe(true);

      // Second click collapses
      listEl.children[0].dispatchEvent({
        type: 'click',
        target: { closest: () => null }
      });
      expect(listEl.children[0].classList.contains('chip-collapsed')).toBe(true);
      expect(listEl.children[0].getAttribute('aria-expanded')).toBe('false');
    });

    it('auto-collapses sibling cards in strict accordion mode when another card is expanded', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18 },
          { id: 'target-2', filePath: 'utils.py', startLine: 45, endLine: 50 },
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: (t: any) => revealedTargets.push(t),
        removeTargetFromStack: (id: string) => removedTargetIds.push(id),
        requestGuidanceForTarget: (t: any) => requestedGuidanceTargets.push(t),
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      sandbox.renderTargetStack();
      const listEl = elements.get('target-stack-list');

      // Click card 1
      listEl.children[0].dispatchEvent({
        type: 'click',
        target: { closest: () => null }
      });
      expect(listEl.children[0].classList.contains('chip-expanded')).toBe(true);
      expect(listEl.children[1].classList.contains('chip-collapsed')).toBe(true);

      // Click card 2
      listEl.children[1].dispatchEvent({
        type: 'click',
        target: { closest: () => null }
      });
      expect(listEl.children[0].classList.contains('chip-collapsed')).toBe(true);
      expect(listEl.children[1].classList.contains('chip-expanded')).toBe(true);
      expect(listEl.children[1].getAttribute('aria-expanded')).toBe('true');
    });

    it('toggles expansion on Enter and Space keydown events', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18 }
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: (t: any) => revealedTargets.push(t),
        removeTargetFromStack: (id: string) => removedTargetIds.push(id),
        requestGuidanceForTarget: (t: any) => requestedGuidanceTargets.push(t),
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      sandbox.renderTargetStack();
      const listEl = elements.get('target-stack-list');

      // Keydown Enter
      listEl.children[0].dispatchEvent({
        type: 'keydown',
        key: 'Enter'
      });
      expect(listEl.children[0].classList.contains('chip-expanded')).toBe(true);

      // Keydown Space collapses
      listEl.children[0].dispatchEvent({
        type: 'keydown',
        key: ' '
      });
      expect(listEl.children[0].classList.contains('chip-collapsed')).toBe(true);
    });

    it('dismiss button removes target without triggering card expansion or Monaco navigation', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        targetStack: [
          { id: 'target-1', filePath: 'quicksort.py', startLine: 12, endLine: 18 }
        ],
        escapeHtml: (s: string) => s,
        revealTargetInMonaco: vi.fn(),
        requestGuidanceForTarget: vi.fn(),
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('let expandedTargetId = null;'), code.indexOf('async function revealTargetInMonaco'))}
        `,
        sandbox
      );

      const originalRemove = sandbox.removeTargetFromStack;
      sandbox.removeTargetFromStack = vi.fn((id: string) => {
        removedTargetIds.push(id);
        return originalRemove(id);
      });

      sandbox.renderTargetStack();
      const listEl = elements.get('target-stack-list');
      const card = listEl.children[0];
      const dismissBtn = card.querySelector('.target-btn-dismiss');
      expect(dismissBtn).not.toBeNull();

      // Dispatch click on dismiss button
      card.dispatchEvent({
        type: 'click',
        target: {
          closest: (selector: string) => selector === '.target-btn-dismiss' ? dismissBtn : null
        }
      });

      expect(removedTargetIds).toContain('target-1');
      expect(sandbox.revealTargetInMonaco).not.toHaveBeenCalled();
      expect(listEl.children.length).toBe(0);
    });

    it('synchronizes Monaco cursor telemetry with Screen B header and sends IPC to webview iframe', () => {
      const code = fs.readFileSync(workbenchJsPath, 'utf-8');
      
      const mockEditor = {
        getPosition: () => ({ lineNumber: 42, column: 15 }),
        getSelection: () => ({ isEmpty: () => true }),
        getModel: () => null,
      };

      const mockDocManager = {
        activeDocId: 'doc-1',
        documents: new Map([
          ['doc-1', { filePath: 'src/main.ts' }]
        ])
      };

      const breadcrumbUpdatedFiles: string[] = [];
      const emittedEvents: any[] = [];

      const sandbox: any = {
        document: mockDocument,
        window: mockWindow,
        console,
        editor: mockEditor,
        statusCursorPos: elements.get('status-cursor-pos'),
        docManager: mockDocManager,
        updateScreenBBreadcrumb: (fp: string) => breadcrumbUpdatedFiles.push(fp),
        editorEventBridge: {
          emit: (name: string, data: any) => emittedEvents.push({ name, data })
        }
      };

      vm.runInNewContext(
        `
        ${code.substring(code.indexOf('function updateCursorTelemetry'), code.indexOf('function updateScreenBModePill'))}
        `,
        sandbox
      );

      sandbox.updateCursorTelemetry(mockEditor);

      // Verify status bar text
      const statusPos = elements.get('status-cursor-pos');
      expect(statusPos.textContent).toBe('Ln 42, Col 15');

      // Verify Screen B header scope indicator
      const screenBPos = elements.get('screen-b-cursor-pos');
      expect(screenBPos.textContent).toBe('Ln 42, Col 15');

      // Verify Screen B breadcrumb sync
      expect(breadcrumbUpdatedFiles).toContain('src/main.ts');

      // Verify in-process event emission
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].name).toBe('editor:cursorChange');
      expect(emittedEvents[0].data.lineNumber).toBe(42);
      expect(emittedEvents[0].data.column).toBe(15);

      // Verify IPC postMessage to secondary webview iframe
      expect(postedIframeMessages.length).toBe(1);
      expect(postedIframeMessages[0].type).toBe('CURSOR_TELEMETRY_UPDATE');
      expect(postedIframeMessages[0].payload.filePath).toBe('src/main.ts');
      expect(postedIframeMessages[0].payload.lineNumber).toBe(42);
      expect(postedIframeMessages[0].payload.column).toBe(15);
    });
  });
});
