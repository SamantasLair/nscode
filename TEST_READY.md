# TEST_READY: Screen B Guided Cognition & Monaco Zero-Buffer Pointer (Milestone v0.2.0)

**Author:** `test_writer_m2`  
**Timestamp:** 2026-10-03T01:08:00Z  
**Package:** `packages/antislop-desktop`  
**Test File:** `packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts`  
**Status:** READY FOR VERIFICATION  

---

## 1. Test Suite Summary & Structure

The comprehensive Vitest test suite for **Milestone v0.2.0** has been constructed in strict compliance with the 4-tier methodology outlined in `TEST_INFRA.md`. All tests are genuine, isolated, and validate real requirements against interface contracts in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

| Tier | Focus Area | Test Cases | Status |
|---|---|---|---|
| **Tier 1: Feature Coverage** | Visual tokens, 3-tier layout, placeholder, target extraction, stack rendering, Monaco pointer, guidance trigger, summary cards | 7 test cases | ACTIVE |
| **Tier 2: Boundary & Corner Cases** | Empty/whitespace prompts, boundary/reversed line numbers, missing files, multiple targets in 1 prompt, long/special paths, offline fallback | 6 test cases | ACTIVE |
| **Tier 3: Cross-Feature Interactions** | Prompt extraction -> line reveal, cross-tab file navigation, target click -> guidance trigger, stack independence | 4 test cases | ACTIVE |
| **Tier 4: Real-World Scenarios** | Full developer journey ("Apa yang akan kita kerjakan hari ini?"), Strict Zero Buffer Mutation Invariant | 2 test cases | ACTIVE |

Total new test assertions: **19 comprehensive specification tests** across 4 tiers.

---

## 2. Tested Interface Contracts

1. **`guidance:scoutPattern` IPC Backend (`packages/antislop-desktop/src/main.ts`)**:
   - Handler registered and responding to requests.
   - Extracts file excerpt and constructs `TechnicalSummaryCard`.
   - Embeds authoritative reference documentation (MDN, Node.js docs, StackOverflow, TypeScript Handbook).
   - Graceful fallback for non-existent or inaccessible files.

2. **Preload Context Bridge (`packages/antislop-desktop/src/preload.ts`)**:
   - Exposes `window.electronGuidance.scoutPattern(target)` in the renderer world.

3. **Screen B UI Layout & Theme (`index.html` & `workbench.css`)**:
   - 3-tier view: Top header with breadcrumb, Middle stack & summary cards container, Bottom prompt container.
   - Placeholder text: *"Apa yang akan kita kerjakan hari ini?"*.
   - VS Code Dark+ color palette (`#18181b`, `#27272a`, `#252526`, `#2d2d2d`, `#007acc`, `#858585`).
   - Anti-slop constraints: zero emojis, zero horizontal overflow (`max-width: 100%`, `overflow-x: hidden`, `word-break: break-word`).

4. **Monaco Zero-Buffer Pointer (`workbench.js`)**:
   - Viewport scrolling via `editor.revealLineInCenter(lineNumber)`.
   - Cursor positioning via `editor.setPosition({ lineNumber, column: 1 })`.
   - Text selection via `editor.setSelection(...)`.
   - Non-destructive highlight via `highlightLine(line, message)`.
   - **IMMUTABLE INVARIANT**: Zero buffer mutation (`openDoc.isDirty === false`, zero calls to `editor.setValue()` or `editor.applyEdits()`).

---

## 3. How to Run

### Run Targeted Milestone v0.2.0 Test Suite
```bash
npx vitest run packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts
```

### Run Full Monorepo Regression Suite
```bash
corepack yarn test
```

### Verify Desktop Package Build
```bash
corepack yarn --cwd packages/antislop-desktop build
```
