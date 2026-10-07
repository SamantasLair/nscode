/**
 * bridgewire.js
 * Visual spline overlay connecting editor lines to cognitive cards / Screen B elements.
 * Part of the NSCode AntiSlop cognitive workbench shell.
 */

class BridgeWireController {
  constructor() {
    this.svg = typeof document !== 'undefined' ? document.getElementById('bridgewire-overlay-canvas') : null;
    this.spline = typeof document !== 'undefined' ? document.getElementById('bridgewire-active-spline') : null;
    this.state = {
      active: false,
      start: null,
      end: null,
      isDirty: false,
      rafId: null,
    };
    this.options = {};
    this.boundEditor = null;
    this.scrollDisposable = null;
    this.resizeListener = null;

    this.render = this.render.bind(this);
    this._onEditorScroll = this._onEditorScroll.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
  }

  _ensureElements() {
    if (typeof document === 'undefined') return;
    if (!this.svg) {
      this.svg = document.getElementById('bridgewire-overlay-canvas');
    }
    if (!this.spline) {
      this.spline = document.getElementById('bridgewire-active-spline');
    }
  }

  computeSpline(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const tension = Math.max(0.2, Math.min(0.6, Math.abs(dx) / 400));
    const cx1 = x1 + dx * tension;
    const cy1 = y1;
    const cx2 = x2 - dx * tension;
    const cy2 = y2;
    return `M ${x1.toFixed(1)},${y1.toFixed(1)} C ${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  _resolveStart(source) {
    if (!source) return null;

    // Direct coords: { x, y } or { x1, y1 }
    if (typeof source.x === 'number' && typeof source.y === 'number') {
      return { x: source.x, y: source.y };
    }
    if (typeof source.x1 === 'number' && typeof source.y1 === 'number') {
      return { x: source.x1, y: source.y1 };
    }
    if (Array.isArray(source) && source.length >= 2) {
      return { x: Number(source[0]), y: Number(source[1]) };
    }

    // Monaco editor source: { editor, lineNumber }
    if (typeof source === 'object' && ('editor' in source || 'lineNumber' in source)) {
      const editor = source.editor || this.boundEditor;
      const lineNumber = typeof source.lineNumber === 'number' ? source.lineNumber : 1;
      const column = typeof source.column === 'number' ? source.column : 1;

      if (editor) {
        let editorRect = { left: 0, top: 0, width: 0, height: 0 };
        if (typeof editor.getDomNode === 'function') {
          const domNode = editor.getDomNode();
          if (domNode && typeof domNode.getBoundingClientRect === 'function') {
            editorRect = domNode.getBoundingClientRect();
          }
        } else if (typeof editor.getContainerDomNode === 'function') {
          const domNode = editor.getContainerDomNode();
          if (domNode && typeof domNode.getBoundingClientRect === 'function') {
            editorRect = domNode.getBoundingClientRect();
          }
        } else if (typeof editor.getBoundingClientRect === 'function') {
          editorRect = editor.getBoundingClientRect();
        }

        let pos = null;
        if (typeof editor.getScrolledVisiblePosition === 'function') {
          pos = editor.getScrolledVisiblePosition({ lineNumber, column });
        }

        if (pos) {
          const lineHeight = pos.height || 18;
          return {
            x: editorRect.left + (pos.left !== undefined ? pos.left : 0),
            y: editorRect.top + (pos.top !== undefined ? pos.top : 0) + (lineHeight / 2),
          };
        } else {
          return {
            x: editorRect.left,
            y: editorRect.top,
          };
        }
      }
    }

    // Raw number when editor is bound
    if (typeof source === 'number' && this.boundEditor) {
      return this._resolveStart({ editor: this.boundEditor, lineNumber: source });
    }

    // HTMLElement
    if (typeof source === 'object' && typeof source.getBoundingClientRect === 'function') {
      const rect = source.getBoundingClientRect();
      return {
        x: rect.right,
        y: rect.top + (rect.height / 2),
      };
    }

    // CSS selector string
    if (typeof source === 'string' && typeof document !== 'undefined') {
      const el = document.querySelector(source);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.right,
          y: rect.top + (rect.height / 2),
        };
      }
    }

    return null;
  }

  _resolveEnd(target) {
    if (!target) return null;

    // Direct coords: { x, y } or { x2, y2 }
    if (typeof target.x === 'number' && typeof target.y === 'number') {
      return { x: target.x, y: target.y };
    }
    if (typeof target.x2 === 'number' && typeof target.y2 === 'number') {
      return { x: target.x2, y: target.y2 };
    }
    if (Array.isArray(target) && target.length >= 2) {
      return { x: Number(target[0]), y: Number(target[1]) };
    }

    // HTMLElement or object with getBoundingClientRect
    if (typeof target === 'object' && typeof target.getBoundingClientRect === 'function') {
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top + (rect.height / 2),
      };
    }

    // CSS selector string
    if (typeof target === 'string' && typeof document !== 'undefined') {
      const el = document.querySelector(target);
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top + (rect.height / 2),
        };
      }
    }

    return null;
  }

  connect(sourceLineOrCoords, targetElementOrCoords, options = {}) {
    this._ensureElements();
    this.state.active = true;
    this.state.start = sourceLineOrCoords;
    this.state.end = targetElementOrCoords;
    this.options = { ...options };

    if (sourceLineOrCoords && typeof sourceLineOrCoords === 'object' && sourceLineOrCoords.editor) {
      if (!this.boundEditor || this.boundEditor !== sourceLineOrCoords.editor) {
        this.startListening(sourceLineOrCoords.editor);
      }
    }

    if (this.spline) {
      if (options.error || options.isError) {
        this.spline.classList.add('error');
      } else {
        this.spline.classList.remove('error');
      }
      if (!this.spline.getAttribute('marker-end')) {
        this.spline.setAttribute('marker-end', 'url(#bw-dot-end)');
      }
    }

    this.state.isDirty = true;
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.state.rafId !== null) return;
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);

    this.state.rafId = raf(() => {
      this.state.rafId = null;
      if (this.state.active && this.state.isDirty) {
        this.render();
      }
    });
  }

  render() {
    this._ensureElements();

    if (!this.state.active) {
      if (this.spline) {
        this.spline.setAttribute('d', '');
      }
      return '';
    }

    const p1 = this._resolveStart(this.state.start);
    const p2 = this._resolveEnd(this.state.end);

    if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) {
      if (this.spline) {
        this.spline.setAttribute('d', '');
      }
      this.state.isDirty = false;
      return '';
    }

    const d = this.computeSpline(p1.x, p1.y, p2.x, p2.y);
    if (this.spline) {
      this.spline.setAttribute('d', d);
    }
    this.state.isDirty = false;
    return d;
  }

  disconnect() {
    this.state.active = false;
    this.state.start = null;
    this.state.end = null;
    this.state.isDirty = false;

    if (this.state.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.state.rafId);
      } else {
        clearTimeout(this.state.rafId);
      }
      this.state.rafId = null;
    }

    if (this.spline) {
      this.spline.setAttribute('d', '');
      this.spline.classList.remove('error');
    }
  }

  startListening(editor) {
    if (editor && editor !== this.boundEditor) {
      this._disposeScroll();
      this.boundEditor = editor;
      if (typeof editor.onDidScrollChange === 'function') {
        this.scrollDisposable = editor.onDidScrollChange(() => {
          this._onEditorScroll();
        });
      }
    }

    if (typeof window !== 'undefined' && !this.resizeListener) {
      this.resizeListener = () => {
        this._onWindowResize();
      };
      window.addEventListener('resize', this.resizeListener);
    }
  }

  _onEditorScroll() {
    if (this.state.active) {
      this.state.isDirty = true;
      this.scheduleRender();
    }
  }

  _onWindowResize() {
    if (this.state.active) {
      this.state.isDirty = true;
      this.scheduleRender();
    }
  }

  _disposeScroll() {
    if (this.scrollDisposable) {
      if (typeof this.scrollDisposable.dispose === 'function') {
        this.scrollDisposable.dispose();
      } else if (typeof this.scrollDisposable === 'function') {
        this.scrollDisposable();
      }
      this.scrollDisposable = null;
    }
  }

  stopListening() {
    this._disposeScroll();
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
    this.boundEditor = null;
  }
}

// Attach instance to window.nscodeBridgeWire & global class
if (typeof window !== 'undefined') {
  window.BridgeWireController = BridgeWireController;
  if (!window.nscodeBridgeWire) {
    window.nscodeBridgeWire = new BridgeWireController();
  }
}

// CommonJS export support for unit test harnesses
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BridgeWireController };
}
