# AntiSlop IDE Test Infrastructure Specification

AIAssistedAntiSlopIDE is an active-cognition desktop IDE built on Eclipse Theia and the Antigravity Sovereign Protocol designed to eliminate AI-induced developer skill atrophy. The test infrastructure provides an exhaustive, multi-tiered verification harness ensuring the IDE's core architectural pillars and invariants remain mathematically intact.

---

## 1. Test Architecture & Monorepo Toolchain

- **Test Runner**: [Vitest v3](https://vitest.dev) configured at workspace root (`vitest.config.ts`).
- **Runtime Environment**: Node.js >= 20.0.0 (Node 22 / Node 24 support) on Windows and POSIX.
- **Package Manager**: Corepack Yarn 1.22.22 (Yarn Classic workspaces).
- **Coverage Engine**: V8 provider with text, json, and html reporting.
- **Module Resolution**: Vitest path aliases direct `@antislop/protocol`, `@antislop/sidecar`, `@antislop/vscode-extension`, and `@antislop/theia-shell-extension` to their canonical TypeScript sources.

### Monorepo Test Layout
```
AIAssistedAntiSlopIDE/
├── package.json
├── vitest.config.ts                          # Central test configuration & aliases
├── TEST_INFRA.md                             # Test infrastructure specification
├── packages/
│   ├── antislop-protocol/test/               # Protocol unit tests (schemas & RPC whitelist)
│   ├── antislop-sidecar/test/                # Sidecar unit & adversarial tests
│   ├── antislop-vscode-extension/test/       # VS Code extension unit & mock tests
│   │   └── mocks/vscode-mock.ts              # Headless VS Code Monaco API sandbox
│   ├── theia-shell-extension/test/           # Lumino DockPanel layout tests
│   └── antislop-webview/test/                # Screen B UI component tests
└── tests/                                    # E2E Test Track (Milestone verification)
    ├── tier1-protocol/                       # Tier 1: Protocol & Zero-Mutation Invariants
    │   ├── protocol-invariants.test.ts
    │   └── adversarial-gate.test.ts
    ├── tier2-watchdog/                       # Tier 2: 5s Heartbeat & Daemon IPC Lifecycle
    │   └── watchdog-lifecycle.test.ts
    ├── tier3-decoration/                     # Tier 3: Zero-Buffer Decoration Engine
    │   └── zero-buffer-decoration.test.ts
    └── tier4-integration/                    # Tier 4: End-to-End Cognitive Flow
        └── e2e-cognitive-flow.test.ts
```

---

## 2. The 4-Tier Testing Methodology (+ Tier 5 Adversarial)

The verification harness enforces a progressive 5-tier pyramid guaranteeing complete coverage from protocol type contracts up to end-to-end active cognition flows:

```
                  ┌────────────────────────────────────────┐
                  │    Tier 5: Adversarial & Stress        │
                  │ (Fuzzing, 1MB Payloads, Rapid Churn)   │
                  └───────────────────▲────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │    Tier 4: End-to-End Cognitive Flow   │
                  │  (Full 6-Stage User Journey Pipeline)  │
                  └───────────────────▲────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │  Tier 3: Zero-Buffer Decoration Engine │
                  │ (Visual Highlighting, Immutability)    │
                  └───────────────────▲────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │  Tier 2: Watchdog & Daemon IPC Bridge  │
                  │ (CLI Spawn, 5s Heartbeat, Crash SLA)   │
                  └───────────────────▲────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │   Tier 1: Protocol & Schema Invariants │
                  │  (Zero-Mutation Whitelist, Big-O, Zod) │
                  └────────────────────────────────────────┘
```

### Tier 1: Protocol & Schema Invariants
- **Location**: `tests/tier1-protocol/` & `packages/antislop-protocol/test/`
- **Focus**:
  - **Zero-Mutation RPC Whitelist**: Exactly 6 read-only methods (`rpc.ping`, `diagnostics.analyzeError`, `context.getActiveBuffer`, `context.getTerminalBuffer`, `context.getGitDiff`, `context.getLspDiagnostics`). Any write/patch method (`file.write`, `buffer.patch`, `editor.applyEdit`) is rejected with code `-32601` and `{ zeroMutationInvariant: true }`.
  - **Big-O Complexity Bounds**: Rigorous regex validation (`BIG_O_TIME_REGEX`, `BIG_O_SPACE_REGEX`) rejecting conversational slop (e.g. `fast`, `instantaneous`).
  - **Memory Profile Bounds**: Strict allocation categorization (`stack`, `heap`, `zero_alloc`, `gc_managed`) and cache locality ratings.
  - **Cognitive Friction State Machine**: Mathematical state transition ladder (`LOCKED` -> `CLOZE_PENDING` / `TYPE_ALONG_PENDING` -> `UNLOCKED`), with absolute schema-level rejection of `directAutoPatchAllowed: true`.
  - **Multi-Language Syntax Coverage**: Multi-language AST models for C, C++, Java, C#, Python, and PHP.

### Tier 2: Watchdog & Sidecar IPC Lifecycle
- **Location**: `tests/tier2-watchdog/` & `packages/antislop-sidecar/test/`
- **Focus**:
  - **Headless CLI Daemon Spawn**: Standalone Node binary (`packages/antislop-sidecar/dist/bin.js`) spawned dynamically on loopback test ports (e.g. 4955, 4956) with parameter parsing (`--port`, `--host`, `--token`).
  - **Security Gate**: Loopback IP filtering and Bearer token authorization (401 on unauthorized connections).
  - **5-Second Heartbeat**: Bidirectional `rpc.ping` / `pong` exchange with non-negative latency tracking (`Date.now() - sendTime`).
  - **Two-Ping Timeout Detection**: Automatic socket termination if 2 consecutive heartbeats fail (10s threshold).
  - **Fatal Crash Simulation & Recovery SLA (<5s)**: Abrupt OS signal termination (`process.kill(pid, 'SIGTERM')`), automated supervisor detection, dynamic child process respawn (new PID), and active buffer state rehydration.
  - **Process Hygiene**: Verification that zero orphan processes remain alive after test completion.

### Tier 3: Zero-Buffer Decoration Engine
- **Location**: `tests/tier3-decoration/` & `packages/antislop-vscode-extension/test/`
- **Focus**:
  - **Buffer Immutability Invariant**: Visual line highlighting via `createTextEditorDecorationType` and `setDecorations`.
  - **Inviolable Checks**:
    - `document.isDirty === false` (never dirtied).
    - `document.getText() === originalContent` (byte-for-byte pristine).
    - `editor.editCalls.length === 0` (zero calls to `editor.edit`).
    - `workspace.applyEdit` is never called.
    - Undo/redo stack remains completely clean.
  - **Focus Preservation**: Visual reveal uses `{ viewColumn: ViewColumn.One, preserveFocus: true }`, ensuring Screen B retains user focus.
  - **Coordinate Clamping**: Safe boundary clamping for line 0 and lines exceeding `document.lineCount`.
  - **Multiline Spanning**: Multiline highlight ranges when `endLine` is provided.
  - **Highlight Disposal**: Tab switch (`onDidChangeActiveTextEditor`) and document close (`onDidCloseTextDocument`) automatically clear stale highlights.
  - **Pre-Existing Dirty Buffer Protection**: Ensures already dirty documents are preserved without modification.

### Tier 4: End-to-End Active Cognition Flow
- **Location**: `tests/tier4-integration/`
- **Focus**: Complete 6-stage pedagogical user journey:
  1. **Stage 1 (Terminal Capture)**: Terminal non-zero exit (`exitCode: 1`) intercepted by `TerminalWatcher`, ANSI escape codes stripped, and traceback extracted.
  2. **Stage 2 (Sidecar Analysis)**: `RpcRouter` + `PedagogicalEngine` processes error against in-memory buffer, synthesizes `ContractViolatedDTO` and 3 `SmartCardDTO` solutions (Idiomatic, Minimalist, Performance), and batches token streams.
  3. **Stage 3 (Webview Delivery)**: `ScreenBWebviewProvider` initializes in `ViewColumn.Two` (`retainContextWhenHidden: true`), transmits `DIAGNOSTIC_DATA`, and initializes cognitive session in `LOCKED` status.
  4. **Stage 4 (Cross-Editor Highlight)**: Webview posts `{ type: "HIGHLIGHT_LINE", payload: { fileUri, line } }`, `DecorationManager` decorates Screen A line with `preserveFocus: true`, and asserts `document.isDirty === false`.
  5. **Stage 5 (Cognitive Challenge)**: Copy is locked. Developer completes Cloze unmasking or Type-Along practice mode with accuracy >= 90.0% (sub-threshold accuracy rejects unlock).
  6. **Stage 6 (Copy Unlock & Invariant Confirmation)**: `session.clipboardUnlocked === true`, while `session.directAutoPatchAllowed === false`. Asserts ZERO 1-click auto-patch buttons or RPC write methods exist.

### Tier 5: Adversarial Hardening & Stress Testing
- **Location**: `packages/antislop-sidecar/test/adversarial-challenge.test.ts` & `tests/tier1-protocol/adversarial-gate.test.ts`
- **Focus**:
  - Malicious JSON-RPC payloads (prototype pollution, missing JSON-RPC version, null IDs).
  - High-volume batch requests (100 operations in a single batch).
  - 1MB buffer payload stress testing without memory exhaustion.
  - Rapid connection churn & WebSocket socket termination fuzzing.

---

## 3. Test Runner Commands Matrix

| Scope | Command | Description |
|-------|---------|-------------|
| **Full Monorepo** | `corepack yarn test` | Executes all package tests and E2E test suites |
| **Tier 1** | `npx vitest run tests/tier1-protocol packages/antislop-protocol` | Verifies protocol invariants and Zod schemas |
| **Tier 2** | `corepack yarn test tests/tier2-watchdog` | Verifies sidecar CLI spawn, 5s heartbeat, and crash recovery |
| **Tier 3** | `corepack yarn test tests/tier3-decoration` | Verifies Zero-Buffer mutation and line decoration |
| **Tier 4** | `corepack yarn test tests/tier4-integration` | Verifies the complete 6-stage active cognition pipeline |
| **E2E Track** | `npx vitest run tests/tier2-watchdog tests/tier3-decoration tests/tier4-integration` | Runs full integration test track |
| **Coverage** | `corepack yarn test --coverage` | Generates V8 code coverage report |

---

## 4. Invariants Enforced by Test Harness

| Invariant | Target Component | Verifying Test Suite | Failure Condition | Target SLA |
|-----------|------------------|----------------------|-------------------|------------|
| **Zero-Buffer Mutation** | `DecorationManager` | Tier 3 & Tier 4 | `document.isDirty === true` or `editor.editCalls.length > 0` | 0ms / Instant |
| **Read-Only Whitelist** | `RpcRouter` | Tier 1 & Tier 2 | Method not in 6 whitelisted methods returning code other than `-32601` | 0ms / Protocol gate |
| **No Auto-Patch** | `CognitiveGate` | Tier 1, 4 | `directAutoPatchAllowed: true` accepted by Zod schema | Inviolable |
| **Heartbeat Interval** | `HeartbeatWatchdog` | Tier 2 | Pings not emitted every 5s or missed pings not triggering disconnect | 5000ms |
| **Crash Recovery** | `WatchdogClient` | Tier 2 | Supervisor fails to respawn daemon or reconnect | < 5000ms (<5s SLA) |
| **Cognitive Friction Gate** | `ScreenBWebview` | Tier 1 & Tier 4 | Clipboard unlocked before challenge completed with >=90% accuracy | Strict gate |

---

## 5. Mock Architecture & VS Code Sandbox

To enable rapid, deterministic headless testing without launching heavy Electron / VS Code GUI instances, the test harness utilizes `packages/antislop-vscode-extension/test/mocks/vscode-mock.ts`:

- **`MockTextDocument`**: Maintains in-memory text buffer, line count, `lineAt(n)`, `getText()`, and trackable `isDirty` boolean.
- **`MockTextEditor`**: Records all decoration applications in `decorations: Map<Type, Range[]>`, revealed viewports in `revealedRanges`, and edit operations in `editCalls: Function[]`.
- **`MockWebview`**: Intercepts `postMessage` into `postedMessages: any[]` and provides `simulateMessage(msg)` for inbound webview event dispatch.
- **`MockWebviewPanel`**: Replicates `ViewColumn.Two` split panel lifecycle, retainContextWhenHidden flags, and disposal callbacks.
- **`mockVscode.window.simulateTerminalExecution`**: Simulates modern VS Code 1.80+ shell execution streams (`execution.read()`) with exit codes and ANSI escape codes.

---

## 6. Continuous Integration & Certification Checklist

Before certifying any build or pull request:
1. `corepack yarn build` passes with zero TypeScript errors.
2. `corepack yarn test` passes with **100% pass rate** across all suites.
3. Zero skipped (`it.skip`) or unverified tests.
4. Goodhart's Invariant: No assertions weakened, no error boundaries relaxed.
5. Zero lingering background processes or unclosed WebSocket ports.
