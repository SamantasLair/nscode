# Project: NSCode - Live AI Streaming, Sidecar WebSocket Bridge, Reasoning Blocks & Real-Time Plan/Diff (v0.2.3)

## Architecture
- **Sidecar WebSocket Bridge & Telemetry (`packages/antislop-desktop/src/workbench/workbench.js`, `index.html`, `workbench.css`)**:
  - `SidecarWebSocketClient` / `connectSidecar()`: Resilient WebSocket client connecting to `ws://127.0.0.1:4949`.
  - Heartbeat telemetry: 5s JSON-RPC `rpc.ping` frame ping/pong with latency tracking (`latencyMs`).
  - Exponential backoff: reconnect interval starting at 1s doubling up to 16s with jitter on disconnect.
  - UI Indicators:
    - Status Bar (`#status-daemon`): Status dot (green/red), latency readout (`Xms`), and connection state text.
    - Screen B Header (`#screen-b-daemon-status`): Active model badge (`gemini-2.5-flash`), status dot, and latency readout.
  - Graceful offline fallback: when daemon is inactive, UI remains fully interactive with local heuristics and non-blocking retry in the background.
- **Screen B Chat Live Streaming & Decoupled Reasoning (`workbench.js`, `index.html`, `workbench.css`)**:
  - `#chat-thread-container`: Native host DOM container inside `#screen-b-view-chat` (preserving `#webview-frame` for backwards test compatibility).
  - `TypewriterRenderer`: Non-blocking 16ms animation frame buffer rendering incoming chunks smoothly without layout stutter or text jitter.
  - `StreamMessageParser`: Stateful boundary parser detecting and extracting `<thinking>...</thinking>` or protocol reasoning tokens across split chunk boundaries without leaking tags.
  - Collapsible Reasoning Card (`.thinking-card`): Dark+ styled inspection card featuring `codicon-lightbulb`, toggleable chevron (`codicon-chevron-down` / `codicon-chevron-right`), duration/token telemetry badges, and collapsible body.
  - Code Block Formatter: VS Code Dark+ token styling, language badge, and instant copy button (`codicon-copy` -> `codicon-check`) utilizing `window.electronClipboard.writeText`.
- **Real-Time Plan Mode Streaming (`workbench.js`, `index.html`, `workbench.css`)**:
  - Structured sidecar plan event dispatchers:
    - `plan:init`: calls `createTaskPlan(payload)` creating subtasks and initializing progress.
    - `plan:step_start`: activates subtask, updating status glyph to `codicon-loading codicon-modifier-spin`.
    - `plan:step_log`: appends real-time log entry via `addExecutionLog`.
    - `plan:step_done`: calls `advanceSubtask`, transitioning glyph to `codicon-pass-filled` and updating progress bar.
- **Streaming Diff Generation into Review Mode & Monaco Preview (`workbench.js`, `index.html`, `workbench.css`)**:
  - Handles `diff:file_proposed` payload (`filePath`, `originalContent`, `proposedContent`, `linesAdded`, `linesDeleted`, `description`).
  - Auto-morphs to Review Mode (`setScreenBMode('review')`) and updates diff counter badge (`.review-tab-badge`) on `#tab-screen-b-review`.
  - Clicking `[ Review Diff ]` triggers `openReviewDiff(diffId)` mounting Monaco Diff Editor in Layar A comparing `agent-orig://${filePath}` vs `agent-proposed://${filePath}` without disk mutation.
- **Automated Programmatic Test Suite (`packages/antislop-desktop/test/v0_2_3_live_ai_streaming.test.ts`)**:
  - Comprehensive Vitest specification with deterministic `MockWebSocket` testing:
    - WebSocket connection lifecycle, reconnect backoff, 5s heartbeat, and offline fallback.
    - Streaming chunk reception, typewriter queue buffering, and DOM updates.
    - Stateful reasoning stream parser and collapsible card toggles.
    - Real-time plan events and reactive status glyph updates.
    - Streaming diff proposals and zero-buffer Monaco diff mounting.
  - Regression validation: 100% pass across all 527 existing tests and clean desktop build.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Sidecar WebSocket Connection Lifecycle | Connect to `ws://127.0.0.1:4949`, auto-reconnect with exponential backoff (1s-16s) | M1 | Survey (Explorer 1) |
| 2 | 5s Heartbeat Ping/Pong & Latency | Periodic `rpc.ping` every 5000ms calculating round-trip latency in milliseconds | M1 | Survey (Explorer 1) |
| 3 | Status Bar Daemon Indicator | Status dot (green/red) and latency display in `#status-daemon` | M1 | Survey (Explorer 1) |
| 4 | Screen B Header Daemon Indicator | Model badge (`gemini-2.5-flash`), status dot, and latency in `#screen-b-daemon-status` | M1 | Survey (Explorer 1) |
| 5 | Offline Fallback & Non-blocking Retries | Graceful offline state with local heuristic fallback when daemon is down | M1 | Survey (Explorer 1) |
| 6 | Native Chat Thread Container | `#chat-thread-container` in `#screen-b-view-chat` while preserving `#webview-frame` | M1 | Survey (Explorer 2) |
| 7 | Non-Blocking Typewriter Buffer | 16ms animation buffer smoothly rendering text chunks without jerking | M1 | Survey (Explorer 2) |
| 8 | Decoupled Reasoning Stream Parser | Stateful parser isolating `<thinking>...</thinking>` across split chunk boundaries | M1 | Survey (Explorer 2) |
| 9 | Collapsible Dark+ Reasoning Card | `.thinking-card` with `codicon-lightbulb`, toggle chevron, token/time telemetry | M1 | Survey (Explorer 2) |
| 10 | Dark+ Code Block with Copy Button | Fenced code formatting with language badge and instant copy button via `electronClipboard` | M1 | Survey (Explorer 2) |
| 11 | Plan Streaming `plan:init` | Structured plan creation dynamically populating subtasks and progress in Plan Mode | M1 | Survey (Explorer 3) |
| 12 | Plan Streaming `plan:step_start` | Dynamic subtask activation updating glyph to `codicon-loading codicon-modifier-spin` | M1 | Survey (Explorer 3) |
| 13 | Plan Streaming `plan:step_log` | Real-time execution log appending to `#plan-logs-console` | M1 | Survey (Explorer 3) |
| 14 | Plan Streaming `plan:step_done` | Subtask completion updating glyph to `codicon-pass-filled` and incrementing progress | M1 | Survey (Explorer 3) |
| 15 | Streaming Diff `diff:file_proposed` | Registering proposed diff with file stats (+X/-Y) and updating Review Mode | M1 | Survey (Explorer 3) |
| 16 | Review Mode Tab Badge & Morphing | Unreviewed diff counter badge on Review tab and automatic mode morphing | M1 | Survey (Explorer 3) |
| 17 | Zero-Buffer Monaco Diff Preview | Mounting Monaco Diff Editor in Layar A comparing `agent-orig://` vs `agent-proposed://` | M1 | Survey (Explorer 3) |
| 18 | Automated Test Suite v0.2.3 | `packages/antislop-desktop/test/v0_2_3_live_ai_streaming.test.ts` covering R1-R5 | M2 | Survey (Explorer 3) |
| 19 | Monorepo Regression & Build Integrity | 100% pass across all 527 baseline tests + new tests, clean package build | M3 | Survey (Explorer 1/3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Workbench v0.2.3 Implementation Track | R1, R2, R3, R4 in `index.html`, `workbench.css`, `workbench.js` | none | PLANNED |
| M2 | E2E Programmatic Test Suite Track | R5 comprehensive test suite in `packages/antislop-desktop/test/v0_2_3_live_ai_streaming.test.ts` | none | PLANNED |
| M3 | Final Verification Gate & Hardening | Full monorepo verification (all 527 baseline + new tests 100%), package build, Reviewers, Challengers, Forensic Audit | M1, M2 | PLANNED |

## Interface Contracts
### Sidecar WebSocket Protocol & Events
- Endpoint: `ws://127.0.0.1:4949`
- Client -> Server Heartbeat:
  ```json
  { "jsonrpc": "2.0", "id": 12345, "method": "rpc.ping", "params": {} }
  ```
- Server -> Client Heartbeat Response:
  ```json
  { "jsonrpc": "2.0", "id": 12345, "result": { "status": "pong", "timestamp": 1727950000000, "uptimeSeconds": 100, "version": "0.1.0" } }
  ```
- Server -> Client Streaming Event Messages:
  - `chat:chunk`: `{ type: "chat:chunk", correlationId: string, chunk: string, isLast?: boolean }`
  - `plan:init`: `{ type: "plan:init", plan: { id: string, title: string, subtasks: Array<{ id: string, title: string, description?: string, targetFiles?: string[] }> } }`
  - `plan:step_start`: `{ type: "plan:step_start", planId: string, subtaskId: string }`
  - `plan:step_log`: `{ type: "plan:step_log", planId: string, subtaskId?: string, message: string, level?: "info"|"warn"|"error" }`
  - `plan:step_done`: `{ type: "plan:step_done", planId: string, subtaskId: string, status: "completed"|"failed", message?: string }`
  - `diff:file_proposed`: `{ type: "diff:file_proposed", diff: { id?: string, filePath: string, originalContent: string, proposedContent: string, linesAdded: number, linesDeleted: number, description?: string } }`

### Workbench Global State & API Extensions
- `window.sidecarClient`:
  - `connect(url?: string)`
  - `disconnect()`
  - `getStatus(): { isConnected: boolean, latencyMs: number, reconnectAttempts: number, model: string }`
  - `send(message: any)`
  - `onMessage(handler: (msg: any) => void)`
  - `onStatusChange(handler: (status: any) => void)`
- `window.handleSidecarMessage(msg: any)`: central message dispatcher routing to chat streaming, plan streaming, or diff streaming.
- `window.appendChatChunk(chunk: string, options?: { isLast?: boolean, correlationId?: string })`
- `window.toggleThinkingCard(cardId: string)`
- `window.copyCodeBlock(codeText: string, buttonElement: HTMLElement)`
- `window.handlePlanStreamEvent(event: any)`
- `window.handleDiffStreamEvent(event: any)`

## Code Layout
- Exclusive Owner M1 (Implementation):
  - `packages/antislop-desktop/src/workbench/index.html`
  - `packages/antislop-desktop/src/workbench/workbench.css`
  - `packages/antislop-desktop/src/workbench/workbench.js`
- Exclusive Owner M2 (Test Suite):
  - `packages/antislop-desktop/test/v0_2_3_live_ai_streaming.test.ts`
- Adversarial Hardening (Challengers):
  - `packages/antislop-desktop/test/v0_2_3_adversarial_challenger_1.test.ts`
  - `packages/antislop-desktop/test/v0_2_3_adversarial_challenger_2.test.ts`
