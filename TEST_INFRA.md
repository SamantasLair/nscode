# E2E Test Infra: NSCode Milestone v0.2.1

## Test Philosophy
- Requirement-driven, opaque-box & functional unit verification.
- Validates authentic VS Code editor ergonomics without assuming implementation quirks.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Quick Open (Ctrl+P) & Fuzzy Search | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Tab Dirty State Management (●) & Save | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | Status Bar Telemetry & Go to Line (Ctrl+G) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 4 | Screen B Mode Switcher & Event Bridge | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest 3.0.7 via `corepack yarn --cwd packages/antislop-desktop test`
- Location: `packages/antislop-desktop/test/v0_2_1_quick_open_dirty_tabs.test.ts`
- Environment: Node.js with DOM simulator, hoisted Electron IPC mock, and `vm.createContext` sandbox.
- Pass/Fail Semantics: 100% pass on all 38 test cases in test suite + 100% pass across all 395 baseline tests + zero build errors.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Open workspace, Ctrl+P to find file, navigate to line via Ctrl+G, edit and verify dirty ● | F1, F2, F3 | High |
| 2 | Edit file, attempt tab close, cancel dialog -> dirty tab preserved; close again and save -> disk written and tab cleanly closed | F2, F4 | High |
| 3 | Cursor movement & selection updates telemetry and broadcasts through EditorEventBridge to Screen B | F3, F4 | Medium |
| 4 | Switch Screen B modes (Chat -> Plan -> Review) while editor dirty state and cursor update dynamically | F2, F3, F4 | Medium |
| 5 | Command Palette bidirectional mode transitions (Quick Open -> `>` Command -> `:` Go to Line -> Escape) | F1, F3 | Medium |
