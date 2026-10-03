# Project: NSCode - Screen B Guided Cognition & Monaco Zero-Buffer Pointer (v0.2.0)

## Architecture
- **Host Process (`packages/antislop-desktop/src/main.ts`)**:
  - Registers Electron IPC handler `guidance:scoutPattern` for fast background scouting (root cause analysis, verified doc references, diff preview).
  - Integrates with preload bridge.
- **Preload Bridge (`packages/antislop-desktop/src/preload.ts`)**:
  - Exposes `electronGuidance.scoutPattern(target)` to the renderer context.
- **Renderer Shell (`packages/antislop-desktop/src/workbench/index.html` & `workbench.css`)**:
  - Screen A (`#editor-area` with Monaco) and Screen B (`#secondary-sidebar`) live in the same renderer window.
  - Screen B structured into 3 tiers:
    1. Top: Minimal header with active workspace breadcrumb (`#screen-b-breadcrumb`).
    2. Middle: Interaction thread, Target Line Stack container (`#target-line-stack-container`), and Technical Summary Cards container (`#technical-summary-cards-container`), with `#webview-frame` preserved.
    3. Bottom: Unified chat prompt box with placeholder `"Apa yang akan kita kerjakan hari ini?"` in `#prompt-input-box`.
  - Harmonized with VS Code Dark+ palette (`#1e1e1e`, `#18181b`, `#252526`, `#27272a`, `#2d2d2d`, `#3f3f46`, `#007acc`, `#858585`).
- **Workbench Controller (`packages/antislop-desktop/src/workbench/workbench.js`)**:
  - Prompt target extractor parses input for file:line targets (e.g., `src/main.ts:288-305`).
  - Target Stack renders interactive cards.
  - Click-to-reveal navigates Monaco via `editor.revealLineInCenter`, `setPosition`, and `highlightLine` without touching document buffers (`isDirty === false`, zero edit calls).
  - "Minta Saran Pengerjaan" calls `electronGuidance.scoutPattern` and renders Technical Summary Card without auto-patching.
- **Test Infrastructure (`packages/antislop-desktop/test/`)**:
  - Vitest test suite `v0_2_0_screen_b_guidance.test.ts` covering theme tokens, target extraction, zero-buffer navigation, and guidance display (19/19 tests passing).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | IPC Handler `guidance:scoutPattern` | Electron IPC backend in main.ts for fast pattern scout | M1 | Survey (Explorer 3) |
| 2 | Preload Bridge `electronGuidance` | Typed bridge in preload.ts exposing scoutPattern | M1 | Survey (Explorer 3) |
| 3 | Screen B 3-Tier HTML Layout | index.html 3-tier view: breadcrumb, target stack container, prompt box placeholder | M1 | Survey (Explorer 1) |
| 4 | VS Code Dark+ CSS Tokens & Anti-Slop Styling | workbench.css styling with Dark+ tokens, card layouts, zero overflow, no emojis | M1 | Survey (Explorer 1) |
| 5 | Prompt Target Extraction | workbench.js regex/active doc parser for file:line targets | M1 | Survey (Explorer 2) |
| 6 | Target Line Stack Rendering | workbench.js interactive card rendering with badges & action buttons | M1 | Survey (Explorer 2) |
| 7 | Monaco Zero-Buffer Pointer | workbench.js click-to-reveal via revealLineInCenter with 0 buffer mutation | M1 | Survey (Explorer 2) |
| 8 | On-Demand Guidance Scout & Cards | workbench.js "Minta Saran Pengerjaan" triggering scout & rendering Technical Summary Card | M1 | Survey (Explorer 3) |
| 9 | Vitest Test Suite v0.2.0 | test/v0_2_0_screen_b_guidance.test.ts covering R1-R4 with 100% pass | M2 | Survey (Explorer 3) |
| 10 | Monorepo Regression & Build Integrity | 395/395 tests pass, package build succeeds | M3 | Survey (Explorer 3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Screen B Guided Cognition Implementation | R1, R2, R3 in `main.ts`, `preload.ts`, `index.html`, `workbench.css`, `workbench.js` | none | DONE |
| M2 | E2E Programmatic Test Suite Track | R4 in `test/v0_2_0_screen_b_guidance.test.ts` (Tiers 1-4) | none | DONE |
| M3 | Final Verification Gate | 100% test pass (M2 + 395 monorepo tests), package build, Reviewer, Challenger, Forensic Audit | M1, M2 | DONE |

## Interface Contracts
### `packages/antislop-desktop/src/main.ts` ↔ `preload.ts` & `workbench.js`
- IPC Channel: `'guidance:scoutPattern'`
- Input: `{ filePath: string, startLine: number, endLine?: number, context?: string }`
- Output:
  ```ts
  interface TechnicalSummaryCard {
    target: { filePath: string; startLine: number; endLine?: number };
    rootCause: string;
    explanation: string;
    references: Array<{ title: string; url: string }>;
    suggestedDiff?: {
      original: string;
      suggested: string;
      explanation: string;
    };
  }
  ```
- Error handling: Graceful fallback with offline heuristic explanation and doc links if offline/CLI unavailable.

### `packages/antislop-desktop/src/workbench/workbench.js` ↔ Monaco Editor
- Zero-Buffer Navigation Contract:
  - Calls `docManager.openFile(filePath)` if file not currently active.
  - Calls `editor.revealLineInCenter(lineNum)`.
  - Calls `editor.setPosition({ lineNumber: lineNum, column: 1 })`.
  - Calls `highlightLine(lineNum, message)`.
  - Invariant: `editor.setValue()` and `editor.applyEdits()` MUST NEVER be called. `openDoc.isDirty` MUST remain `false`.

## Code Layout
- `packages/antislop-desktop/src/main.ts`: IPC handlers registration.
- `packages/antislop-desktop/src/preload.ts`: Context bridge exposure.
- `packages/antislop-desktop/src/workbench/index.html`: Screen B DOM elements.
- `packages/antislop-desktop/src/workbench/workbench.css`: Dark+ theme styles & card layouts.
- `packages/antislop-desktop/src/workbench/workbench.js`: Target extraction, stack rendering, Monaco navigation, guidance scout.
- `packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts`: Comprehensive Vitest test suite.
