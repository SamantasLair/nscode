# SPRINT 3: SINGLE-SCROLL & ANTI-TRAP SASH 60FPS DOSSIER
**Monorepo Component**: `@antislop/webview` & `@antislop/desktop`  
**Autonomous Protocol**: ANTIGRAVITY SURGICAL PROTOCOL v5.1  
**Swarm Mobilization**: 20 Sub-Agents (4 Domain Captains + 16 Leaf Workers)  
**Verification Date**: 2026-10-08  

---

## 1. Executive Summary & Architecture Blueprint

Sprint 3 solves the dual challenges of layout fluidics in NSCode:
1. **The Sovereign Single-Scroll Invariant (Screen B)**: Eliminates nested, conflicting scrollbars by declaring `.main-content` as the solitary vertical scroll container (`overflow-y: auto`, `overscroll-behavior-y: contain`, `scrollbar-gutter: stable`). Ancestor elements (`html`, `body`, `#root`, `.app-container`) are locked with `overflow: hidden !important; height: 100%`, and child code blocks are restricted to horizontal scrolling (`overflow-y: visible`).
2. **Anti-Trap Sash & 60fps Batching (Workbench Splitter)**: Eliminates mouseup event swallowing and "zombie drag locks" when the cursor sweeps across Screen B's webview iframe by disabling iframe hit-testing (`body.is-resizing iframe { pointer-events: none !important; }`), combined with `requestAnimationFrame` (rAF) layout batching and `window.blur` / `lostpointercapture` failsafes in `SidebarResizer`.

---

## 2. Swarm Synthesis & Research Consensus Matrix

| Domain Area | Key Findings | Architectural Decision |
| :--- | :--- | :--- |
| **Scroll Root** | Multiple `overflow-y: auto` layers create nested scroll traps and jittery card docking. | Exactly ONE vertical scroll container (`.main-content`). Roots locked at `height: 100dvh; overflow: hidden`. |
| **Overscroll & Bouncing** | Touch/wheel propagation escapes to host window, causing pane bounce. | `overscroll-behavior-y: contain; overscroll-behavior-x: none;` on `.main-content`. |
| **Subpixel Jitter** | Scrollbar toggling resizes container, triggering responsive container query thrashing. | `scrollbar-gutter: stable;` reserves scrollbar channel, guaranteeing identical width. |
| **Iframe Mouse Trap** | Moving sash fast causes cursor to enter iframe; iframe swallows `mousemove` and `mouseup`. | Dynamic `body.is-resizing` adds `pointer-events: none !important` to all iframes during drag. |
| **60fps Drag Loop** | High-polling mice (1000Hz) trigger unthrottled DOM writes and layout thrashing. | Zero-Read `requestAnimationFrame` loop in `SidebarResizer`: read once on `pointerdown`, batch writes on rAF. |
| **Drag Interruption** | User Alt-Tabs or moves mouse outside window during drag, leaving sash locked. | Dual-failsafe: `window.addEventListener('blur')` and `sash.addEventListener('lostpointercapture')` cancel drag. |

---

## 3. Container Hierarchy & Layout Contract

```
[Window / HTML Shell]
html, body (height: 100dvh; overflow: hidden !important; overscroll-behavior: none !important;)
  │
  └── div#root (height: 100%; display: flex; flex-direction: column; overflow: hidden !important;)
        │
        └── div.app-container (flex: 1 1 0%; min-height: 0; overflow: hidden !important; container-type: inline-size;)
              │
              ├── header.chat-header-bar (flex-shrink: 0; height: 35px; pinned chrome)
              │
              ├── main.main-content [SOVEREIGN SCROLLER]
              │     (flex: 1 1 0%; min-height: 0; overflow-y: auto; overflow-x: hidden;)
              │     (overscroll-behavior-y: contain; scrollbar-gutter: stable; contain: layout style;)
              │     │
              │     ├── .top-zone (position: sticky; top: 16px in dual-zone grid)
              │     └── .bottom-zone (.smart-card-grid)
              │
              └── footer.status-bar (flex-shrink: 0; pinned chrome)
```

---

## 4. Implementation Target Files

1. **`packages/antislop-webview/src/index.css`**:
   - Enforce `overflow: hidden !important` on `html, body`, `#root`, `.app-container`.
   - Update `.main-content` with `overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain; scrollbar-gutter: stable; contain: layout style; transform: translateZ(0); will-change: scroll-position;`.
2. **`packages/antislop-webview/src/components/Common/CodePreview.css`**:
   - Ensure `.code-preview-viewport` has `overflow-y: visible !important; overflow-x: auto; max-height: none;` to prevent nested vertical scroll traps.
3. **`packages/antislop-desktop/src/workbench/workbench.css`**:
   - Verify `body.is-resizing iframe, body.is-resizing .secondary-webview-frame { pointer-events: none !important; }`.
   - Verify `body.is-resizing .zone-secondary-sidebar { transition: none !important; }`.
4. **`packages/antislop-desktop/src/workbench/workbench.js`**:
   - Refactor `SidebarResizer` with rAF batching, `setPointerCapture`, `window.addEventListener('blur')`, and throttled Monaco layout.
5. **`packages/antislop-desktop/test/v0_3_0_tahap3_sash_scroll.test.ts`**:
   - Vitest test suite asserting single-scroll CSS invariants, sash drag iframe isolation, and rAF batching.
