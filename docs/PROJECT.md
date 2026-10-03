# Project: AIAssistedAntiSlopIDE

## Architecture
AIAssistedAntiSlopIDE is an active-cognition desktop IDE built on Eclipse Theia that combats AI-induced developer skill atrophy. It enforces a strict dual-screen split (Screen A for human code editing, Screen B for root-cause error diagnostics and multi-fix pedagogical smart cards) with an inviolable Golden Invariant: zero direct AI auto-patching and cognitive friction to rebuild developer programming mastery.

### Architectural Pillars (Frankenstein Strategy)
1. **Workbench & Layout Mechanics**: Eclipse Theia Lumino `DockPanel` with a persistent 50:50 split (`area: 'main', mode: 'split-right'`) and locked tab (`title.closable = false`) + Open-VSX compatible VS Code Webview Panel (`ViewColumn.Two`) with typed `postMessage` protocol.
2. **Zero-Buffer Mutation Engine**: GitLens-style `vscode.window.createTextEditorDecorationType` with `preserveFocus: true` and active editor synchronization, guaranteeing zero edits to `TextDocument` and zero undo/redo stack pollution.
3. **Stateless Sidecar Daemon**: Localhost WebSocket JSON-RPC 2.0 daemon (port 4949) with Bearer token authentication; strict Zero-Mutation RPC Schema (read-only query methods only, all write endpoints strictly omitted); 5-second crash-only ping/pong watchdog with automatic child process restart and state rehydration; 50ms token stream batcher.
4. **Pedagogical Smart Cards & Context Aggregator**: Continue.dev `UnifiedContextAggregator` querying unsaved in-memory buffers and terminal error tracebacks; Rustc/TS Error Translator Top Zone ("Contract Violated" anatomy); 3-Card Solution Matrix (Idiomatic, Minimalist, Performance) with quantitative Big-O, memory profiles, and interactive Cloze / Type-Along Cognitive Friction Gate.
5. **Monorepo Package Boundaries**: Yarn Classic workspaces (`corepack yarn`) with 5 decoupled packages + test harness.

### Code Layout
```
AIAssistedAntiSlopIDE/
├── package.json                          # Monorepo root (Yarn workspaces)
├── tsconfig.base.json                    # Shared TypeScript configuration
├── vitest.config.ts                      # Root Vitest test configuration
├── packages/
│   ├── antislop-protocol/                # Milestone 1: Types, DTOs, Zod schemas, JSON-RPC definitions
│   │   ├── src/
│   │   │   ├── jsonrpc.ts                # JSON-RPC 2.0 framing & read-only whitelist
│   │   │   ├── smart-card.ts             # Big-O, memory profile, and solution schemas
│   │   │   ├── error-anatomy.ts          # Contract Violated / Rustc-style error schemas
│   │   │   ├── cognitive-gate.ts         # Cloze & Type-Along challenge schemas
│   │   │   └── index.ts
│   │   └── package.json
│   ├── antislop-sidecar/                 # Milestone 2: Stateless JSON-RPC Daemon
│   │   ├── src/
│   │   │   ├── server.ts                 # Localhost WebSocket server (port 4949)
│   │   │   ├── rpc-router.ts             # Zero-mutation router (read-only whitelist)
│   │   │   ├── watchdog.ts               # 5s heartbeat & session rehydration
│   │   │   ├── context-aggregator.ts     # Continue.dev context extractor adapter
│   │   │   ├── pedagogical-engine.ts     # 3-Card synthesis & Big-O analyzer
│   │   │   └── stream-batcher.ts         # 50ms backpressure batcher
│   │   └── package.json
│   ├── antislop-vscode-extension/        # Milestone 3: Open-VSX Extension
│   │   ├── src/
│   │   │   ├── extension.ts              # Entry point & activation
│   │   │   ├── webview-provider.ts       # Screen B webview lifecycle (ViewColumn.Two)
│   │   │   ├── decoration-manager.ts     # Zero-Buffer TextEditorDecorationType engine
│   │   │   ├── watchdog-client.ts        # 5s heartbeat ping/pong & daemon supervisor
│   │   │   ├── terminal-watcher.ts       # Terminal exit code != 0 error capture
│   │   │   └── lsp-diagnostics.ts        # LSP error ingestion listener
│   │   └── package.json
│   ├── theia-shell-extension/            # Milestone 3: Native Theia Lumino Contribution
│   │   ├── src/
│   │   │   ├── browser/
│   │   │   │   ├── antislop-frontend-module.ts # Theia DI module
│   │   │   │   ├── antislop-layout-contribution.ts # Lumino 50:50 persistent dock split
│   │   │   │   └── antislop-widget.ts    # Unclosable (closable=false) dock widget
│   │   │   └── package.json
│   │   └── package.json
│   └── antislop-webview/                 # Milestone 4: Screen B React/Vite UI
│       ├── src/
│       │   ├── App.tsx                   # Main dual-zone layout
│       │   ├── components/
│       │   │   ├── TopZone/              # Contract Violated / Root-cause explanation
│       │   │   │   ├── ContractViolated.tsx
│       │   │   │   └── LinePointerButton.tsx # "Sorot Baris Terkait" trigger
│       │   │   ├── BottomZone/           # 3-Card Solution Matrix
│       │   │   │   ├── SmartCardGrid.tsx
│       │   │   │   └── SmartCard.tsx     # Big-O & memory breakdown
│       │   │   └── CognitiveGate/        # Active cognition gate
│       │   │       ├── ClozeChallenge.tsx
│       │   │       └── TypeAlongPractice.tsx
│       │   └── vscode-api.ts             # Typed postMessage bridge
│       └── package.json
└── tests/                                # E2E Testing Track
    ├── tier1-protocol/                   # Protocol & Zero-Mutation whitelist tests
    ├── tier2-watchdog/                   # 5s Heartbeat & Daemon crash rehydration tests
    ├── tier3-decoration/                 # Zero-Buffer mutation & decoration tests
    └── tier4-integration/                # End-to-End user workflow verification
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Persistent Split Workspace | Lumino DockPanel 50:50 persistent layout split Screen A / Screen B | M3 | R1, spec_miner |
| 2 | Screen B Dock Closure Lock | Locked against accidental closure via `title.closable = false` | M3 | R1, spec_miner |
| 3 | Open-VSX Webview Integration | VS Code Webview Panel in `ViewColumn.Two` communicating via postMessage | M3 | R1, spec_miner |
| 4 | Zero-Buffer Line Highlighting | Visual line highlight via `createTextEditorDecorationType` with `preserveFocus: true` | M3 | R1, spec_miner |
| 5 | Buffer Immutability Guarantee | Verification that line highlighting never mutates `TextDocument` or undo stack | M3 | R1, spec_miner |
| 6 | Active File Stale Highlight Clean | Automatically disposes stale highlights on active editor change | M3 | R1, spec_miner |
| 7 | Terminal Error Ingestion | Auto-parse non-zero exit code terminal outputs and compiler traces | M3 | R2, spec_miner |
| 8 | LSP Diagnostics Ingestion | Capture diagnostic error events directly from Language Server Protocol | M3 | R2, spec_miner |
| 9 | Test Assertion Diff Ingestion | Capture assertion differences for silent logical errors | M3 | R2, spec_miner |
| 10 | Manual Error Paste Input Box | Manual error text input in Screen B for developer queries | M4 | R2, spec_miner |
| 11 | "Contract Violated First" Top Zone | Clear explanation of the semantic contract broken before presenting fix | M4 | R2, spec_miner |
| 12 | Cross-Editor Line Pointer Action | "Sorot Baris Terkait" button triggering Screen A decoration from Screen B | M4 | R2, spec_miner |
| 13 | 3-Card Solution Matrix | Generates Idiomatic, Minimalist, and Performance solution cards | M2 | R2, spec_miner |
| 14 | Quantitative Big-O Schema | Explicit Big-O notation for Time and Space on every smart card | M1 | R2, spec_miner |
| 15 | Quantitative Memory Profile | Explicit memory allocation and heap/stack implications on each card | M1 | R2, spec_miner |
| 16 | Language-Specific Syntax Breakdown| Deep analysis of C/C++, Java, C#, Python, and PHP syntax mechanics | M2 | R2, spec_miner |
| 17 | Technical Idiom Explanation | Explanation of "Why this works" and technical idioms used | M2 | R2, spec_miner |
| 18 | Prohibition of 1-Click Auto-Patch | Total absence of auto-apply buttons; zero code injected into editor | M4 | R2, spec_miner |
| 19 | Progressive Cloze Challenge | Cloze-style token blanking requiring human cognitive unmasking | M4 | R2, spec_miner |
| 20 | Type-Along Practice Mode | Guided typing challenge to reinforce neuro-motor syntax mastery | M4 | R2, spec_miner |
| 21 | Copy to Clipboard Protection | Copy button locked until cognitive challenge or cloze is solved | M4 | R2, spec_miner |
| 22 | Localhost WebSocket Daemon | JSON-RPC 2.0 communication over local WebSocket (port 4949) with token auth | M2 | R3, spec_miner |
| 23 | Strict Zero-Mutation RPC Schema | Daemon router strictly permits only read queries; omits all write methods | M1 | R3, spec_miner |
| 24 | RPC Whitelist Rejection | Router returns `-32601 Method not found` on any attempt to write or patch | M2 | R3, spec_miner |
| 25 | In-Memory Buffer Single Source | Queries live buffer state from Theia/Monaco rather than stale disk files | M2 | R3, spec_miner |
| 26 | Non-Blocking Streaming Pipeline | Streaming diagnostic tokens via 50ms batching without UI thread lag | M2 | R3, spec_miner |
| 27 | 5-Second Ping/Pong Heartbeat | Ping sent every 5 seconds; failure detected if 2 pings miss | M2 | R3, spec_miner |
| 28 | Crash-Only Child Process Restart | Extension detects daemon termination and restarts process within 5s | M3 | R3, spec_miner |
| 29 | Session State Rehydration | Automatically resends active editor buffer & error context on reconnect | M3 | R3, spec_miner |
| 30 | Frankenstein Theia Layout | Reusable Lumino docking contribution pattern | M3 | R4, spec_miner |
| 31 | Frankenstein GitLens Decoration | `TextEditorDecorationType` pattern for cross-editor decoration | M3 | R4, spec_miner |
| 32 | Frankenstein Continue Context | Continue.dev `ContextProviders` pattern for buffer and terminal capture | M2 | R4, spec_miner |
| 33 | Frankenstein Diagnostic UX | Rustc `--explain` and TS Error Translator visual anatomy | M4 | R4, spec_miner |
| 34 | Monorepo Workspace Toolchain | Yarn Classic (`corepack yarn`) workspaces with TypeScript and Vitest | M1 | explorer_1 |
| 35 | Tier 1 Protocol & Schema Suite | Vitest tests for JSON-RPC 2.0 framing, RPC whitelist, and Zod schemas | Test Track | spec_miner |
| 36 | Tier 2 Watchdog & Crash Suite | Headless daemon spawn, 5s heartbeat, crash recovery within 5 seconds | Test Track | spec_miner |
| 37 | Tier 3 Zero-Buffer Decoration Suite | Vitest/Theia mock testing `createTextEditorDecorationType` & immutability | Test Track | spec_miner |
| 38 | Tier 4 E2E User Journey Suite | Full flow verification: error ingestion -> Screen B -> decoration -> gate | Test Track | spec_miner |
| 39 | Tier 5 Adversarial Coverage Hardening| Fuzzing JSON-RPC inputs, boundary edge cases, and memory leak audit | M5 | Project Pattern |
| 40 | Final Acceptance Verification | 100% pass on all E2E test tiers and forensic audit certification | M5 | Project Pattern |
| 41 | 5-Zone VS Code Authentic Workbench Shell | 30px Titlebar, 48px Activity Bar, 260px Primary Sidebar, Editor Group (35px tabs + 22px breadcrumbs + minimap), 380px Secondary Sidebar, 22px #007acc Status Bar | M6 | R1, explorer_2 |
| 42 | Real File System IPC & Interactive Explorer | Electron main.ts fs:* handlers, preload electronFS, hierarchical tree with ignore filter and preset fallback | M6 | R2, explorer_2 |
| 43 | Multi-Tab Document Manager & State Preservation | Independent ITextModel per file, viewState save/restore, dirty indicator dot without undo stack corruption | M6 | R3, explorer_2 |
| 44 | Secondary Sidebar Screen B & Anti-Trap Sash | Layar B iframe embed, .is-resizing pointer-events:none anti-trap sash, 380px collapsible transitions | M6 | R4, explorer_3 |
| 45 | RPC Convergence, Webview Zod Bridge & Offline Assets | Canonical diagnostics.analyzeError, typed DIAGNOSTIC_DATA postMessage, local Monaco & Codicon offline bundling | M6 | R5, explorer_3 |
| 46 | Antigravity CLI Integration Bridge (agy) | Electron antigravity:* IPC handlers, Secondary Sidebar prompt box with execution controls, Status Bar item | M6 | R6, explorer_3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Protocol Foundation & Workspace Scaffolding | Monorepo setup, `antislop-protocol` (types, DTOs, Zod schemas, JSON-RPC 2.0 read-only whitelist, Big-O schemas) | none | **DONE** (79 tests passed) |
| M2 | Antigravity Sidecar Daemon | `antislop-sidecar` (stateless WebSocket daemon, read-only router, 5s heartbeat, Continue context extractor, 3-Card pedagogical engine) | M1 | **DONE** (152 tests passed) |
| M3 | Theia Extension & Zero-Buffer Highlighting | `antislop-vscode-extension` & `theia-shell-extension` (Lumino 50:50 persistent layout, Zero-Buffer decoration engine, 5s watchdog supervisor) | M1, M2 | **DONE** (181 tests passed) |
| M4 | Screen B Webview & Anti-Slop Cognitive Gate | `antislop-webview` (Top Zone Contract Violated, Bottom Zone 3-Card matrix, Cloze & Type-Along friction gate, copy lock) | M1, M2, M3 | **DONE** (Built & tested) |
| Test Track | Dual-Track E2E Test Suite | Test runner and 4-tier test suite (`tests/` for Tiers 1-4); `TEST_INFRA.md` published | M1 (runs in parallel with M2-M4) | **DONE** (All 4 Tiers verified) |
| M5 | Final E2E Pass & Adversarial Hardening | Phase 1: 100% pass on Tiers 1-4 tests; Phase 2: Tier 5 adversarial coverage hardening & forensic integrity audit | M1, M2, M3, M4, Test Track | **DONE** (229/229 tests pass across 15 suites) |
| M6 | Desktop Workbench Shell Transformation | `packages/antislop-desktop` (5-Zone VS Code Dark+ shell, real FS IPC, Monaco multi-tab state preservation, Screen B anti-trap sash, RPC convergence, Antigravity CLI bridge, offline assets) | M1, M2, M4 | **DONE** (264/264 monorepo tests pass, build:desktop clean, release executables verified) |

---

## Interface Contracts

### 1. `antislop-protocol` ↔ `antislop-sidecar` & `antislop-vscode-extension`
- **JSON-RPC Methods (Read-Only Whitelist)**:
  - `rpc.ping()` -> `{ status: "pong", timestamp: number }`
  - `diagnostics.analyzeError(params: AnalyzeErrorRequest)` -> `{ correlationId: string }`
  - `context.getActiveBuffer()` -> `{ uri: string, languageId: string, content: string, selection: Range }`
  - `context.getTerminalBuffer(params: { lines: number })` -> `{ lines: string[], lastExitCode: number }`
  - `context.getGitDiff()` -> `{ diff: string }`
  - `context.getLspDiagnostics(params: { uri: string })` -> `{ diagnostics: DiagnosticDTO[] }`
- **Prohibited Methods (Strict Rejection)**:
  - `file.write`, `buffer.patch`, `editor.applyEdit`, `system.exec` -> Return JSON-RPC error `-32601` ("Method not found: write operations strictly prohibited").

### 2. `antislop-sidecar` ↔ `antislop-webview`
- **Notification Events (Sidecar -> Webview via extension postMessage)**:
  - `diagnostics.tokenChunk`: `{ correlationId: string, token: string }` (batched every 50ms)
  - `diagnostics.contractViolated`: `ContractViolatedDTO` (rule, explanation, targetFile, targetRange)
  - `diagnostics.smartCardsReady`: `{ correlationId: string, cards: SmartCardDTO[] }`
- **SmartCardDTO**:
  ```typescript
  interface SmartCardDTO {
    id: string;
    variant: "idiomatic" | "minimalist" | "performance";
    title: string;
    codeSnippet: string;
    whyItWorks: string;
    bigO: { time: string; space: string };
    memoryAllocation: { heap: string; stack: string; notes: string };
    languageIdiom: { language: string; concept: string; breakdown: string };
    tradeOffs: string[];
    clozeChallenge: {
      maskedSnippet: string;
      blanks: { token: string; hint: string }[];
    };
  }
  ```

### 3. `antislop-webview` ↔ `antislop-vscode-extension`
- **Messages (Webview -> Extension)**:
  - `{ type: "HIGHLIGHT_LINE", payload: { fileUri: string, line: number, endLine?: number } }`
  - `{ type: "REQUEST_ANALYSIS", payload: { rawError?: string } }`
  - `{ type: "PRACTICE_COMPLETED", payload: { cardId: string, accuracy: number } }`
- **Messages (Extension -> Webview)**:
  - `{ type: "SET_ACTIVE_FILE", payload: { fileUri: string, languageId: string } }`
  - `{ type: "CLEAR_HIGHLIGHTS" }`
  - `{ type: "DIAGNOSTIC_DATA", payload: any }`
  - `{ type: "WATCHDOG_STATUS", payload: { connected: boolean, latencyMs: number } }`

### 4. Zero-Buffer Mutation Contract
- Any invocation of `HIGHLIGHT_LINE` MUST:
  1. Call `vscode.window.createTextEditorDecorationType({ isWholeLine: true, backgroundColor: '...' })`.
  2. Call `editor.setDecorations(decorationType, [range])`.
  3. Reveal range with `vscode.window.showTextDocument(document, { preserveFocus: true })`.
  4. NEVER call `editor.edit()`, `workspace.applyEdit()`, or modify `document.getText()`.
  5. Assert `document.isDirty === false`.

### 5. Desktop Standalone Packaging (`packages/antislop-desktop`)
- **Shell**: Electron v34.5.8 wrapper hosting Layar A (Active Monaco Editor) and Layar B (React 18 / Vite Sandbox) in a persistent 50:50 dock layout.
- **Sidecar Lifecycle**: Spawns `@antislop/sidecar` on localhost WebSocket port 4949 during `app.whenReady()`, terminates cleanly on `before-quit`.
- **Packaging Engine**: `electron-builder` v25.1.8 targeting Windows x64.
- **Release Binaries (`packages/antislop-desktop/release/`)**:
  - `AIAssistedAntiSlopIDE 0.1.0.exe` (Portable x64, ~78.8 MB) — Zero-install standalone executable.
  - `AIAssistedAntiSlopIDE Setup 0.1.0.exe` (NSIS Installer x64, ~79.0 MB) — Standard Windows installer with desktop and start menu shortcuts.
  - `win-unpacked/AIAssistedAntiSlopIDE.exe` (Directory distribution, ~181 MB).

### 6. Desktop Workbench Shell (`packages/antislop-desktop`)
- **5-Zone Layout**:
  - Window Titlebar (30px) with centered search/command bar and layout toggle icons.
  - Activity Bar (48px, #181818/#333333) with active tab indicator and Codicons.
  - Primary Sidebar (260px collapsible, #252526) with "EXPLORER", "WORKSPACE", "OPEN EDITORS", and interactive tree.
  - Editor Group (#1e1e1e) with 35px Tab Header, 22px Breadcrumbs Bar, and Monaco minimap.
  - Secondary Sidebar (380px collapsible, #18181b) hosting Screen B webview with anti-trap sash (`body.is-resizing iframe { pointer-events: none !important; }`).
  - Status Bar (22px, #007acc) with git branch, error count, daemon pulse (ONLINE 4949), big-O gauge, gate lock, Ln/Col, UTF-8, and `agy: Ready`.
- **File System IPC Handlers (`fs:*`)**:
  - `fs:openDirectory`: Open native system folder picker; set active workspace root.
  - `fs:getWorkspaceRoot`: Return active workspace root path.
  - `fs:readDirectory`: Recursive folder walker with ignore filters (`.git`, `node_modules`, `dist`, `release`, etc.) and maxDepth cap.
  - `fs:readFile`: Read UTF-8 text with 5MB guard and binary header detection.
  - `fs:writeFile`: Save document edits to disk.
- **Antigravity CLI IPC Handlers (`antigravity:*`)**:
  - `antigravity:checkStatus`: Check `agy --version` execution.
  - `antigravity:runCommand`: Stream command output (stdout/stderr) from `agy` to workbench.
- **Multi-Tab State Preservation**:
  - Independent `monaco.editor.ITextModel` per file.
  - Sub-16ms tab switching with `editor.saveViewState()` and `editor.restoreViewState()`.
  - Clean undo dirty tracking via `model.getAlternativeVersionId()`.
- **Offline Assets**:
  - Local Monaco Editor bundle in `dist/workbench/vs/` and Codicons in `dist/workbench/codicons/`.
- **RPC & Webview Protocol**:
  - Calls to sidecar use canonical `diagnostics.analyzeError`.
  - Notifications relayed to webview strictly typed as `{ type: 'DIAGNOSTIC_DATA', payload: { method, params } }`.

