# NSCode Test Infrastructure: Screen B Guided Cognition & Monaco Zero-Buffer Pointer (Milestone v0.2.0)

## 1. Executive Summary & Architecture

This document establishes the testing infrastructure and authoritative verification methodology for **NSCode Milestone v0.2.0 (Screen B Guided Cognition & Monaco Zero-Buffer Pointer)**.

The Guided Cognition system coordinates **Screen B (Secondary Sidebar AI Assistant)** with **Screen A (Monaco Editor)** under a strict **Zero-Buffer Mutation Invariant**:
- Change requests initiate from a central prompt box (*"Apa yang akan kita kerjakan hari ini?"*).
- Candidate files and line numbers are extracted into an interactive **Target Line Stack**.
- Clicking a target executes zero-buffer viewport navigation and non-destructive cursor highlighting in Screen A.
- On-demand guidance (*"Minta Saran Pengerjaan"*) triggers background scouting via IPC (`guidance:scoutPattern`) and displays a structured **Technical Summary Card** without automatic code patching.

```
+-------------------------------------------------------------------------------------------------+
|                                 4-TIER TEST METHODOLOGY MATRIX                                 |
+-------------------------------------------------------------------------------------------------+
| TIER 1: Feature Coverage                                                                        |
|  - VS Code Dark+ Theme Tokens Parity (#1e1e1e, #18181b, #252526, #27272a, #2d2d2d, #007acc)    |
|  - 3-Tier Layout (Top Breadcrumb, Middle Stack Container, Bottom Prompt Container)               |
|  - Prompt Placeholder ("Apa yang akan kita kerjakan hari ini?")                                 |
|  - Regex Target Extraction (file:line, file:start-end, baris X sampai Y)                        |
|  - Target Line Stack Rendering (Badges, Buttons, Clear Stack)                                   |
|  - Click-to-Reveal Monaco Pointer (revealLineInCenter, setPosition, deltaDecorations)           |
|  - Guidance Trigger ("Minta Saran Pengerjaan" / "Cari Masalah Serupa")                         |
|  - Technical Summary Card (Root Cause, Verified Doc References, Diff Suggestion Preview)        |
+-------------------------------------------------------------------------------------------------+
| TIER 2: Boundary & Corner Cases                                                                |
|  - Empty / whitespace / unparseable prompts                                                     |
|  - Inverted or invalid line ranges (e.g. 50-20, line 0, negative lines)                        |
|  - Non-existent files or deleted workspace paths                                                |
|  - Multiple targets specified in a single prompt                                                |
|  - Extremely long paths and special characters (Unicode, spaces, deep nesting)                   |
|  - Offline scout fallback (deterministic heuristic analysis & authoritative links when offline)|
+-------------------------------------------------------------------------------------------------+
| TIER 3: Cross-Feature Interactions                                                              |
|  - Prompt Extraction -> Monaco Line Reveal coordination                                        |
|  - Document Switching: Target in another file switches tab before line reveal                  |
|  - Target Click -> On-Demand Guidance card generation                                           |
|  - Clear Stack interaction cleans up state without affecting open Monaco documents              |
+-------------------------------------------------------------------------------------------------+
| TIER 4: Real-World Application Scenarios                                                        |
|  - End-to-end developer workflow: "Apa yang akan kita kerjakan hari ini?"                       |
|  - Target Stack inspection without auto-patching                                                |
|  - On-demand guidance review and diff preview                                                   |
|  - Strict Zero Buffer Mutation verification (doc.isDirty === false, editCount === 0)            |
+-------------------------------------------------------------------------------------------------+
```

---

## 2. 4-Tier Test Methodology

### Tier 1: Feature Coverage (Base Functionality)
Tier 1 ensures every functional unit of Screen B and its integration with Screen A meets the specification contracts defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`:

1. **Theme Tokens & Styling Parity (R1)**:
   - Validates that Screen B adopts the canonical VS Code Dark+ palette (`#1e1e1e`, `#18181b`, `#252526`, `#27272a`, `#2d2d2d`, `#3f3f46`, `#007acc`, `#858585`).
   - Verifies absence of mobile/horizontal overflow, zero childish emojis, and anti-slop visual discipline.
2. **3-Tier Clean Layout (R1)**:
   - Top Tier: Workspace breadcrumb (`#secondary-breadcrumb` or `#screen-b-breadcrumb`).
   - Middle Tier: Interaction thread, Target Line Stack container (`#target-line-stack-container`), and Technical Summary Cards container (`#technical-summary-cards-container`).
   - Bottom Tier: Unified prompt container (`#antigravity-prompt-container`, `#prompt-input-box`) with placeholder *"Apa yang akan kita kerjakan hari ini?"*.
3. **Target Extraction Engine (R2)**:
   - Evaluates extraction of explicit targets (`src/main.ts:288-305`, `app.js:42`, `utils/helper.py#L10-L25`).
   - Evaluates natural language phrasing (`periksa src/main.ts baris 288 sampai 305`).
   - Evaluates contextual fallback to the currently active Monaco document when line numbers are referenced without an explicit file path.
4. **Target Line Stack Rendering (R2)**:
   - Renders interactive cards with file path, line range badges, and action triggers.
   - Provides clear stack action to reset active targets.
5. **Monaco Zero-Buffer Pointer (R2)**:
   - Triggers `editor.revealLineInCenter(lineNumber)`.
   - Positions cursor via `editor.setPosition({ lineNumber, column: 1 })`.
   - Applies non-destructive highlighting via `editor.deltaDecorations`.
6. **On-Demand Guidance & Fast Pattern Scout (R3)**:
   - Wires the *"Minta Saran Pengerjaan"* / *"Cari Masalah Serupa"* button.
   - Dispatches `guidance:scoutPattern` IPC handler in `main.ts` through `preload.ts` (`electronGuidance.scoutPattern`).
7. **Technical Summary Card (R3)**:
   - Renders structured card with root cause explanation, verified reference links, and diff suggestion preview.

### Tier 2: Boundary & Corner Cases (Resilience & Edge Conditions)
Tier 2 subjects the parsing and coordination engines to extreme inputs and abnormal environment states:

1. **Empty & Malformed Prompts**:
   - Empty string, whitespace-only, symbols without targets, conversational queries with no code references.
2. **Boundary Line Numbers**:
   - Single line numbers, zero, negative lines, reversed ranges (e.g. `100-50`), out-of-bounds line numbers exceeding file line count.
3. **Missing or Inaccessible Files**:
   - Target files that do not exist on disk, deleted files, paths with permission restrictions.
4. **Multiple Targets in a Single Prompt**:
   - Prompts mentioning 2 or more files and line ranges; confirms all targets are parsed and stacked without dropping items.
5. **Path Formatting Anomalies**:
   - Deep nested directories, paths with spaces, Windows backslashes (`\`) vs POSIX forward slashes (`/`), leading/trailing slashes.
6. **Offline / CLI Unavailable Fallback**:
   - When external AI CLI or network is unavailable, `guidance:scoutPattern` falls back to deterministic local heuristic analysis with valid documentation links.

### Tier 3: Cross-Feature Interactions (Integration & State Synchronization)
Tier 3 tests end-to-end event chains across modules:

1. **Prompt Extraction -> Monaco Line Reveal**:
   - User submits prompt -> target extracted -> target clicked -> Monaco editor scrolls to target line in center.
2. **Cross-Tab File Navigation**:
   - Target points to a file that is not currently open or not the active tab.
   - System calls `docManager.openFile()` or `docManager.switchTab()`, then navigates to the target line in the new active editor.
3. **Target Click -> Guidance Trigger Flow**:
   - Clicking *"Minta Saran Pengerjaan"* on a specific stacked target invokes the scout service for that target's coordinates and appends the Technical Summary Card to the interaction thread.
4. **Stack Management & Editor State Independence**:
   - Adding or clearing targets from the stack has zero side-effects on open editor buffers, tab order, or unsaved dirty states.

### Tier 4: Real-World Application Scenarios (Developer Journey & Golden Invariant)
Tier 4 reproduces complete developer usage workflows:

1. **Full Developer Journey**:
   - Developer opens project and types into prompt: *"Apa yang akan kita kerjakan hari ini? Periksa race condition di src/main.ts:288-305"*.
   - Target Line Stack displays `src/main.ts:288-305`.
   - Developer clicks target badge to inspect location in Monaco without modifying file.
   - Developer clicks *"Minta Saran Pengerjaan"*.
   - Technical Summary Card displays root cause explanation and verified docs (MDN, Node.js Docs, StackOverflow).
   - Developer reviews diff suggestion without auto-patching.
2. **The Golden Invariant: Zero Buffer Mutation Verification**:
   - `model.getValue()` before === `model.getValue()` after.
   - `openDoc.isDirty` remains `false`.
   - `editor.applyEdits()` is never called.
   - `editor.setValue()` is never called.
   - The developer remains in full cognitive control at all times.

---

## 3. Test Execution Harness & Mocking Conventions

The test suite in `packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts` executes in Vitest under standard Node.js (`environment: 'node'`) using a three-tier harness:

### 1. Electron IPC Interception
Using `vi.hoisted` and `vi.mock('electron')`, IPC handlers registered by `registerGuidanceIpc()` in `main.ts` are captured in an in-memory Map:
```typescript
const { ipcHandlers } = vi.hoisted(() => {
  const handlers = new Map<string, Function>();
  return { ipcHandlers: handlers };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    },
  },
  // ...
}));
```

### 2. Node `vm` Context for Workbench Frontend Execution
To execute frontend JavaScript (`workbench.js`) deterministically inside Vitest without requiring a heavy Chromium browser instance, a DOM and Monaco sandbox is created:
- Mocks DOM elements (`getElementById`, `querySelector`, `classList`, `addEventListener`).
- Mocks Monaco Editor (`revealLineInCenter`, `setPosition`, `setSelection`, `deltaDecorations`, `getValue`, `applyEdits`).
- Invariant spies assert that zero mutating edit calls are executed during target navigation or guidance generation.

### 3. Static Token & Contract Assertions
- Directly parses `index.html` and `workbench.css` via `fs.readFileSync` to ensure VS Code Dark+ color tokens, 3-tier layout markup, and zero-emoji compliance are preserved.

---

## 4. Test Suite Execution Command

To execute the Milestone v0.2.0 test suite:
```bash
npx vitest run packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts
```

To run the complete monorepo regression suite:
```bash
corepack yarn test
```

To verify production bundle build:
```bash
corepack yarn --cwd packages/antislop-desktop build
```
