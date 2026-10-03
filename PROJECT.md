# Project: NSCode - Dynamic Screen B Agentic, Context Bridge, Mode Morphing & Zero-Buffer Diff Inspection (v0.2.2)

## Architecture
- **Host IPC & Preload Bridge (`packages/antislop-desktop/src/main.ts` & `preload.ts`)**:
  - Leverages existing verified `fs:writeFile`, `fs:readFile`, `fs:listFiles` Electron IPC handlers.
- **Workbench Shell Layout & Styling (`packages/antislop-desktop/src/workbench/index.html` & `workbench.css`)**:
  - Screen B Mode Switcher Tabs (`#screen-b-mode-tabs`, `#tab-screen-b-chat`, `#tab-screen-b-plan`, `#tab-screen-b-review`).
  - Screen B Mode View Containers:
    - Chat View (`#screen-b-view-chat`): `#screen-b-interaction-container`, `#target-line-stack-container`, `#technical-summary-cards-container`.
    - Plan View (`#screen-b-view-plan`): `#plan-empty-pane`, `#plan-active-pane`, `#plan-title`, `#plan-status-badge`, `#btn-plan-pause`, `#btn-plan-resume`, `#btn-plan-cancel`, `#plan-progress-bar-fill`, `#plan-progress-text`, `#plan-subtask-list`, `#plan-affected-list`, `#plan-logs-console`.
    - Review View (`#screen-b-view-review`): `#review-empty-pane`, `#review-active-pane`, `#review-file-count`, `#review-total-added`, `#review-total-deleted`, `#btn-review-accept-all`, `#btn-review-discard-all`, `#review-file-list`.
  - Layar A Diff Mount: `#diff-editor-mount` sibling to `#editor-mount` in `#editor-area`.
  - Authentic VS Code Dark+ palette (`#1e1e1e`, `#252526`, `#2d2d2d`, `#007acc`, Segoe UI font, Codicon icons, zero emojis).
- **Workbench Controller (`packages/antislop-desktop/src/workbench/workbench.js`)**:
  - **R1 Context Bridge**: `sendSelectionToScreenB(editor)`, `registerEditorActions(editor)` for right-click context menu "Kirim ke Screen B" (`sendToScreenB`) and `Ctrl+Alt+A` / `Cmd+Alt+A`, `toRelativeWorkspacePath`, `getActiveDocumentRelativePath`, target card insertion into `targetStack` with code snippet preview, auto-morph to chat, auto-expand sidebar, prompt focus.
  - **R2 Dynamic Mode Morphing**: `setScreenBMode('chat' | 'plan' | 'review')`, tab synchronization, container visibility toggling, broadcasting `screenB:modeChanged`.
  - **R3 Agentic Task Plan State Machine**: `createTaskPlan`, `pauseTaskPlan`, `resumeTaskPlan`, `cancelTaskPlan`, `advanceSubtask`, `addExecutionLog`, subtask status transitions (`pending` -> `in_progress` -> `completed` / `failed`), progress calculation, dispatching `screenB:planUpdate` and `screenB:taskProgress` via `EditorEventBridge`.
  - **R4 Layar A Zero-Buffer Diff Inspection**: `setReviewDiffs`, `addReviewDiff`, `openReviewDiff(diffId)`, `closeReviewDiff()`, `acceptReviewDiff(diffId)`, `discardReviewDiff(diffId)`, `acceptAllReviewDiffs()`, `discardAllReviewDiffs()`. Uses virtual models `agent-orig://${filePath}` and `agent-proposed://${filePath}` with `monaco.editor.createDiffEditor` in `#diff-editor-mount`. Disk write occurs strictly upon explicit `[ Accept ]`. Seamless restoration of standard editor without tab destruction.
- **Test Infrastructure (`packages/antislop-desktop/test/`)**:
  - `v0_2_2_dynamic_screen_b_agentic.test.ts`: Comprehensive Vitest specification covering R1 through R5 (39 tests).
  - `v0_2_2_adversarial_challenger_1.test.ts`: Adversarial test suite covering Context Bridge & Plan State Machine (20 tests).
  - `v0_2_2_adversarial_challenger_2.test.ts`: Adversarial test suite covering Zero-Buffer Diff Inspection (21 tests).

## Feature Inventory
Every feature from the Survey phase appears here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Monaco Context Menu "Kirim ke Screen B" | Monaco action with label "Kirim ke Screen B", id `sendToScreenB`, navigation context group | M1 | Survey (Explorer 1) |
| 2 | Keyboard Shortcut `Ctrl+Alt+A` / `Cmd+Alt+A` | Keybinding bound in Monaco and in global window keydown listener | M1 | Survey (Explorer 1) |
| 3 | Active Document & Relative Path Resolution | `getActiveDocumentRelativePath` resolving relative workspace path | M1 | Survey (Explorer 1) |
| 4 | Selection & Snippet Capture | Extraction of start/end line numbers and selected text snippet with zero-width cursor fallback | M1 | Survey (Explorer 1) |
| 5 | Target Context Card Stacking | Insertion of target card into `targetStack` with snippet preview in `.target-code-preview` | M1 | Survey (Explorer 1) |
| 6 | Auto Mode Switch & Prompt Focus | Automatic switch to Chat mode, expanding sidebar, and focusing `#prompt-input-box` | M1 | Survey (Explorer 1) |
| 7 | Dynamic Mode Switcher (`setScreenBMode`) | Seamless switching between Chat, Plan, Review with `#screen-b-mode-tabs` active states | M1 | Survey (Explorer 2) |
| 8 | Plan Mode UI Container & Controls | Subtask checklist with status indicators, affected files list, execution log console, Pause/Resume/Cancel | M1 | Survey (Explorer 2) |
| 9 | Agentic Task Plan State Machine | State machine for plans & subtasks (`pending`, `in_progress`, `completed`, `failed`), progress tracking | M1 | Survey (Explorer 2) |
| 10 | `EditorEventBridge` Telemetry | Event dispatching for `screenB:planUpdate`, `screenB:taskProgress`, `screenB:contextBridged` | M1 | Survey (Explorer 2) |
| 11 | Review Mode UI Container & Badges | Modified files list with diff counters (`+X / -Y`), Accept All, Discard All actions | M1 | Survey (Explorer 2) |
| 12 | Monaco Diff Editor Mounting in Layar A | Toggling `#diff-editor-mount` and `#editor-mount`, mounting `createDiffEditor` side-by-side | M1 | Survey (Explorer 3) |
| 13 | Virtual Model URI Isolation | Using `agent-orig://${path}` and `agent-proposed://${path}` to preserve zero-buffer invariant | M1 | Survey (Explorer 3) |
| 14 | Diff Accept & Discard Lifecycle | `acceptReviewDiff` writes to disk and clears dirty state; `discardReviewDiff` cancels without disk mutation | M1 | Survey (Explorer 3) |
| 15 | Batch Accept All & Discard All | Bulk application or cancellation across all pending diffs in review queue | M1 | Survey (Explorer 3) |
| 16 | Seamless Standard Editor Restoration | `closeReviewDiff` restores standard editor and active doc model without tab destruction | M1 | Survey (Explorer 3) |
| 17 | Vitest Test Suite v0.2.2 | `test/v0_2_2_dynamic_screen_b_agentic.test.ts` with comprehensive unit tests for R1-R5 | M2 | Survey (Explorer 3) |
| 18 | Monorepo Regression & Build Integrity | 100% pass across all 447 baseline tests + new tests, clean package build | M3 | Survey (Explorer 3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Workbench v0.2.2 Implementation Track | R1, R2, R3, R4 in `index.html`, `workbench.css`, `workbench.js` | none | DONE |
| M2 | E2E Programmatic Test Suite Track | R5 comprehensive test suite in `packages/antislop-desktop/test/v0_2_2_dynamic_screen_b_agentic.test.ts` | none | DONE |
| M3 | Final Verification Gate & Hardening | Full monorepo verification (all 447 baseline + new tests 100%), package build, Reviewer, Challenger, Forensic Audit | M1, M2 | DONE |

## Interface Contracts
### `EditorEventBridge` Event Contracts
- Singleton instance: `window.editorEventBridge`
- Events:
  - `'screenB:contextBridged'`: `{ filePath: string, startLine: number, endLine: number, codeSnippet: string, target: any }`
  - `'screenB:modeChanged'`: `{ mode: 'chat' | 'plan' | 'review' }`
  - `'screenB:planUpdate'`: `{ plan: TaskPlan, action: 'created' | 'paused' | 'resumed' | 'cancelled' | 'subtaskProgress' | 'completed' }`
  - `'screenB:taskProgress'`: `{ planId: string, subtaskId?: string, status?: string, progress: number, logMessage?: string }`
  - `'screenB:diffAccepted'`: `{ diffId: string, filePath: string }`
  - `'screenB:diffDiscarded'`: `{ diffId: string, filePath: string }`

### Plan State Machine Contract
- Data model:
  - `TaskPlan`: `{ id, title, status: 'in_progress'|'paused'|'completed'|'cancelled', subtasks: Subtask[], currentSubtaskIndex, progress, logs }`
  - `Subtask`: `{ id, title, status: 'pending'|'in_progress'|'completed'|'failed', description, targetFiles: string[] }`
- Global API:
  - `window.createTaskPlan(planData)`
  - `window.pauseTaskPlan()`
  - `window.resumeTaskPlan()`
  - `window.cancelTaskPlan()`
  - `window.advanceSubtask(subtaskId, resultStatus, logMessage)`
  - `window.addExecutionLog(message, level)`

### Review Diff & Zero-Buffer Diff Preview Contract
- Data model:
  - `ReviewDiffItem`: `{ id, filePath, originalContent, proposedContent, linesAdded, linesDeleted, status: 'pending'|'applied'|'discarded', description }`
- Global API:
  - `window.setReviewDiffs(diffs)`
  - `window.addReviewDiff(diffItem)`
  - `window.openReviewDiff(diffId)`
  - `window.closeReviewDiff()`
  - `window.acceptReviewDiff(diffId)`
  - `window.discardReviewDiff(diffId)`
  - `window.acceptAllReviewDiffs()`
  - `window.discardAllReviewDiffs()`

### Context Bridge Contract
- Global API:
  - `window.sendSelectionToScreenB(editorInstance?)`
  - `window.registerEditorActions(editorInstance)`
  - `window.getActiveDocumentRelativePath()`
  - `window.toRelativeWorkspacePath(path)`

## Code Layout
- Exclusive Owner M1:
  - `packages/antislop-desktop/src/workbench/index.html`
  - `packages/antislop-desktop/src/workbench/workbench.css`
  - `packages/antislop-desktop/src/workbench/workbench.js`
- Exclusive Owner M2:
  - `packages/antislop-desktop/test/v0_2_2_dynamic_screen_b_agentic.test.ts`
- Adversarial Hardening (Challengers):
  - `packages/antislop-desktop/test/v0_2_2_adversarial_challenger_1.test.ts`
  - `packages/antislop-desktop/test/v0_2_2_adversarial_challenger_2.test.ts`
