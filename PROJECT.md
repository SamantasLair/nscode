# Project: NSCode - Screen B Antigravity Sub-Agent Dynamic Discovery & In-Flight Isolated Ruleset (v0.2.5)

## Architecture
- **Dynamic Sub-Agent Discovery & Invocation (R1)**:
  - `main.ts`:
    - IPC handler `antigravity:getAgents`: executes `resolveAgyBinaryPath() agents` with 5s timeout. Parses output lines into `{ available: true, agents: [{ id, name }] }`. Graceful fallback `{ available: false, agents: [] }` if binary not found or errors.
    - IPC handler `antigravity:runCommand`: accepts `agent?: string`. When specified and not 'default', appends `['--agent', params.agent]` to spawned CLI process arguments.
  - `preload.ts`:
    - Exposes `getAgents: () => ipcRenderer.invoke('antigravity:getAgents')` on `window.electronAntigravity`.
    - Updates `runCommand` signature to accept `agent?: string`.
  - `index.html` & `workbench.css`:
    - `#agent-select-dropdown` inserted inside `.prompt-actions-right` in `#antigravity-prompt-container` directly before `#model-select-dropdown`.
    - Styled with VS Code Dark+ tokens (`#252526` bg, `#3f3f46` border, `#cccccc` text, 11px font size, clean focus/disabled state).
  - `workbench.js`:
    - `initAntigravityBridge()` invokes `electronAntigravity.getAgents()`. Populates `#agent-select-dropdown` with discovered agents or built-in system fallbacks (`research`, `security-boundary-verifier`, `build-error-resolver`, `consistency-auditor`, `meta-auditor`, `silent-failure-hunter`, `specification-gap-auditor`).
    - Tracks `selectedAgent`. Passes `agent: selectedAgent || undefined` to `window.electronAntigravity.runCommand()`.
    - Exposes controller helpers on `window.screenBController` and `window`.

- **100% Isolated In-Flight Screen B Ruleset (R2)**:
  - `workbench.js`:
    - In-memory constant `SCREEN_B_OPERATIONAL_RULESET` embedding Anti-Slop principles (zero conversational fluff, surgical code modifications), Socratic cognitive guidance (Golden Invariant: zero direct auto-patching, conceptual explanation of trade-offs and invariants), and zero-buffer streaming integrity (display-only output, zero Monaco/disk mutations during generation).
    - `buildScreenBPromptEnvelope(userPrompt, editorContext)` helper dynamically prepends `SCREEN_B_OPERATIONAL_RULESET` into memory before dispatching to `electronAntigravity.runCommand()`.
    - Chat UI bubble displays strictly the user's prompt (`appendUserMessage(userPrompt)`).
    - 100% in-flight in memory; ZERO disk files written or touched.
    - `C:\Users\DELL\.gemini\GEMINI.md` is strictly untouched (MD5 hash: `BB220CB5B3230E9A127EB14FDF05BEC1`).
    - External terminal sessions (`terminal:create` in `main.ts`) remain 100% unpolluted.

- **Automated Verification and Build Integrity (R3)**:
  - Test suite: `packages/antislop-desktop/test/v0_2_5_screen_b_agent_isolation.test.ts`.
  - Adversarial suite: `packages/antislop-desktop/test/v0_2_5_adversarial_challenger_2.test.ts`.
  - Verifies:
    1. IPC handler registration and agent discovery parsing.
    2. Graceful fallback when CLI binary absent.
    3. UI dropdown population and selection event handling.
    4. `--agent <selected_agent>` CLI argument propagation.
    5. Prompt envelope in-flight ruleset injection with Anti-Slop, Socratic, and zero-buffer directives.
    6. Non-blocking UI streaming.
    7. Zero disk file mutation and MD5 hash preservation of `C:\Users\DELL\.gemini\GEMINI.md`.
  - Regression validation: All tests pass (30/30 v0.2.5, 62/62 regression, 25/25 adversarial, total 117 tests), desktop package build exit code 0.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | IPC Handler `antigravity:getAgents` | Executes `agy agents` via `execFile` and parses lines | M1 | Survey (Explorer 1) |
| 2 | Preload Bridge `getAgents` | Exposes `window.electronAntigravity.getAgents` | M1 | Survey (Explorer 1) |
| 3 | CLI Argument `--agent` Propagation | `antigravity:runCommand` passes `['--agent', params.agent]` | M1 | Survey (Explorer 1) |
| 4 | Screen B Dropdown UI Element | `<select id="agent-select-dropdown">` in `index.html` | M1 | Survey (Explorer 1) |
| 5 | Screen B Dropdown Styling | VS Code Dark+ CSS tokens in `workbench.css` | M1 | Survey (Explorer 1) |
| 6 | Agent State & Dropdown Wiring | Populate dropdown, handle `change`, pass `selectedAgent` in `workbench.js` | M1 | Survey (Explorer 1) |
| 7 | Fallback Sub-Agent List | Fallback list when CLI absent so dropdown is never empty | M1 | Survey (Explorer 1) |
| 8 | Operational Ruleset Constant | In-memory `SCREEN_B_OPERATIONAL_RULESET` in `workbench.js` | M1 | Survey (Explorer 2) |
| 9 | In-Flight Envelope Builder | `buildScreenBPromptEnvelope(userPrompt, editorContext)` in `workbench.js` | M1 | Survey (Explorer 2) |
| 10 | UI Decoupled Prompt Bubble | `appendUserMessage` displays only user prompt | M1 | Survey (Explorer 2) |
| 11 | Global Configuration Quarantine | Zero reads/writes to `~/.gemini/GEMINI.md` | M1 | Survey (Explorer 2) |
| 12 | Terminal Environment Isolation | External terminals run unpolluted shell environments | M1 | Survey (Explorer 2) |
| 13 | Unit Test Suite v0.2.5 | `packages/antislop-desktop/test/v0_2_5_screen_b_agent_isolation.test.ts` | M1 | Survey (Explorer 3) |
| 14 | MD5 Hash Preservation Assertion | Programmatic verification that `GEMINI.md` MD5 remains `BB220CB5B3230E9A127EB14FDF05BEC1` | M1 | Survey (Explorer 3) |
| 15 | Monorepo Regression & Build Integrity | All tests pass, build compiles cleanly with exit code 0 | M1 | Survey (Explorer 3) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Sub-Agent Discovery, Isolated Ruleset & Verification Suite | Features 1-15 across `main.ts`, `preload.ts`, `index.html`, `workbench.css`, `workbench.js`, and `v0_2_5_screen_b_agent_isolation.test.ts` | none | DONE |

## Interface Contracts
### `antigravity:getAgents` IPC Contract
```typescript
interface AgentInfo {
  id: string;
  name: string;
}

interface GetAgentsResult {
  available: boolean;
  agents: AgentInfo[];
}
```

### `antigravity:runCommand` Updated IPC Contract
```typescript
interface RunCommandParams {
  prompt: string;
  correlationId: string;
  cwd?: string;
  model?: string;
  agent?: string;
}
```

### Screen B Ruleset Envelope Contract
```typescript
function buildScreenBPromptEnvelope(userPrompt: string, editorContext?: string): string
```
Output envelope format:
```
[Screen B Active Ruleset:
- Anti-Slop: Zero conversational fluff, direct dense solutions, surgical code modifications.
- Socratic Cognitive Guidance: Golden Invariant: zero blind auto-patching; explain trade-offs and architectural invariants before proposing changes.
- Zero-Buffer Streaming Integrity: Display-only streaming output; zero Monaco editor buffer or disk file mutations during generation.]

[Context: ...]
<userPrompt>
```

## Code Layout
- Implementation Files:
  - `packages/antislop-desktop/src/main.ts`
  - `packages/antislop-desktop/src/preload.ts`
  - `packages/antislop-desktop/src/workbench/index.html`
  - `packages/antislop-desktop/src/workbench/workbench.css`
  - `packages/antislop-desktop/src/workbench/workbench.js`
- Test Files:
  - `packages/antislop-desktop/test/v0_2_5_screen_b_agent_isolation.test.ts`
  - `packages/antislop-desktop/test/v0_2_5_adversarial_challenger_2.test.ts`
