# Tasks: Screen B Radical Evolution & Pedagogical Scaffolding

## Status Eksekusi Roadmap
- [x] **Tahap 1: Dynamic Zero-Hardcode Theming & Iframe Token Bridge (SELESAI - 100%)**
- [x] **Tahap 2: Dynamic Zero-Hardcode Layout & Fluid Ergonomics (SELESAI - 100%)**
- [x] **Tahap 3: Zero-Hardcode Socratic Scaffolding Protocol (SELESAI - 100%)**
- [x] **Tahap 4: Zero-Hardcode Radical Innovations (SELESAI - 100%)**

---

## Tahap 1 — Dynamic Zero-Hardcode Theming & Iframe Token Bridge (COMPLETED)
- [x] **1. Protokol Pesan Tema Lintas Boundary (@antislop/protocol)**
  - [x] Tambahkan `ThemeTokensPayloadSchema` di `packages/antislop-protocol/src/webview-messages.ts`
  - [x] Tambahkan jenis pesan `THEME_CHANGED` ke `ExtensionToWebviewMessageSchema`
  - [x] Compile `@antislop/protocol` (`corepack yarn build:protocol`)
  - [x] Verifikasi tes protokol di `packages/antislop-protocol/test/protocol.test.ts` (79/79 passing)

- [x] **2. Webview Reaktif Dynamic Head Style Injection (@antislop/webview)**
  - [x] Perbarui `packages/antislop-webview/src/vscode-api.ts` untuk menangani event `THEME_CHANGED`
  - [x] Implementasikan dynamic style tag injection `<style id="dynamic-theme-tokens">` ke `<head>` iframe
  - [x] Tambahkan helper `applyThemeTokens(payload)` di `vscode-api.ts`
  - [x] Refaktor `packages/antislop-webview/src/index.css`: petakan semua variabel ke `var(--vscode-*)`, hapus GitHub Dark `#0d1117` dan `#161b22`
  - [x] Refaktor `packages/antislop-webview/src/App.tsx` & `ContractViolated.tsx`: bersihkan inline styles hardcoded
  - [x] Build produksi `@antislop/webview` sukses (exit code 0)

- [x] **3. Host Desktop Theme Registry & Dynamic Dispatcher (@antislop/desktop)**
  - [x] Implementasikan `THEME_REGISTRY` di `workbench.js` mendukung `vs-dark`, `vs`, `hc-black`
  - [x] Tambahkan fungsi `dispatchThemeToWebview()` dan `applyTheme(themeId)`
  - [x] Pasang listener `iframe.onload` untuk hidrasi tema seketika saat webview siap
  - [x] Refaktor `workbench.css`: hapus Tailwind Zinc hardcoded `#18181b` dan `#27272a` pada container Layar B, petakan ke `var(--vscode-*)`
  - [x] Tambahkan perintah `Preferences: Color Theme` di Command Palette dan dukungan sub-mode `?theme`
  - [x] Ekspor `window.nscodeTheme` API

- [x] **4. Pengujian & Verifikasi Mutlak (Zero Hardcoding)**
  - [x] Buat unit test suite `packages/antislop-desktop/test/v0_2_6_zero_hardcode_theming.test.ts` (7/7 passing)
  - [x] Perbaiki 2 kegagalan uji warisan (`v0_1_1_git_search_features.test.ts` dan `tests/empirical-blitz-swarm.test.ts`)
  - [x] Verifikasi full monorepo test suite: **37/37 test files, 803/803 tests passing (0 failures)**
  - [x] Validasi full monorepo build (`corepack yarn build`, `tsc -b`) exit code 0

---

## Tahap 2 — Dynamic Zero-Hardcode Layout & Fluid Ergonomics (COMPLETED)
- [x] **1. Fluid Layout via Container Queries (@antislop-webview)**
  - [x] Deklarasi `container-type: inline-size` pada `.app-container`, `.main-content`, dan `.smart-card`
  - [x] Ganti `minmax(340px, 1fr)` kaku dengan `minmax(min(100%, 320px), 1fr)`
  - [x] Responsive layout rules `@container main (min-width: 860px)` (dual-zone side-by-side) dan `@container main (max-width: 359px)` (stacked form actions & single column cards)
  - [x] Card internal container queries `@container card (max-width: 360px)` (grid pros/cons 1-kolom, mode buttons stacked)
  - [x] Eliminasi inline `maxWidth: '340px'` di `App.tsx`, delegasikan ke kelas `.chat-welcome-container` fluid
  - [x] Build `@antislop/webview` sukses (exit code 0) & 29/29 tests passing

- [x] **2. Dynamic Sliding Pill Tab Switcher (@antislop-desktop)**
  - [x] Tambahkan elemen `<div class="screen-b-mode-pill-indicator" id="screen-b-mode-pill"></div>` di `index.html`
  - [x] Definisikan styling `.screen-b-mode-pill-indicator` di `workbench.css` dengan `var(--tab-active-x)`, `var(--tab-active-width)`, dan transisi `cubic-bezier(0.16, 1, 0.3, 1)`
  - [x] Implementasikan fungsi `updateScreenBModePill(targetTab)` berbasis relative delta `getBoundingClientRect()` murni
  - [x] Hubungkan ke `setScreenBMode(mode)`, startup lifecycle, `window.addEventListener('resize')`, dan `ResizeObserver`
  - [x] Pertahankan `border-bottom: 2px solid #007acc` backward compatibility invariant

- [x] **3. Elastic Auto-Grow Prompt Box (@antislop-desktop)**
  - [x] Deklarasikan dimensi semantik `--prompt-min-height: 40px` dan `--prompt-max-height: 180px` pada `:root` di `workbench.css`
  - [x] Refaktor `.prompt-input-box`: `min-height`, `max-height`, `height`, `overflow-y`, dan transisi halus
  - [x] Implementasikan `adjustPromptBoxHeight()` berbasis `textarea.scrollHeight` pada top-level module scope
  - [x] Hubungkan event listener `input` pada `#prompt-input-box` di `initAntigravityBridge()`
  - [x] Implementasikan `resetPromptBoxHeight()` dan panggil otomatis pasca submit di `runAntigravityPrompt()`

- [x] **4. Pengujian & Verifikasi Mutlak**
  - [x] Buat unit test suite `packages/antislop-desktop/test/v0_2_7_zero_hardcode_layout.test.ts` (9/9 passing)
  - [x] Full monorepo verification: **38/38 test files, 812/812 tests passing (0 failures)**
  - [x] TypeScript compiler build (`tsc -b`): Exit code 0

---

## Tahap 3 — Zero-Hardcode Socratic Scaffolding Protocol (COMPLETED)
- [x] **1. Protokol Skema Tangga Kognitif Sokratik (@antislop/protocol)**
  - [x] Definisikan `packages/antislop-protocol/src/socratic-ladder.ts` (Level 1–4, Transisi, Invarian)
  - [x] Ekspor di `packages/antislop-protocol/src/index.ts` & `webview-messages.ts`
  - [x] Validasi build protokol (`corepack yarn build:protocol`)
- [x] **2. Dynamic Socratic Ladder Engine (@antislop/sidecar)**
  - [x] Implementasikan `packages/antislop-sidecar/src/socratic-ladder-engine.ts`
  - [x] Ekstraksi token dari Diff/AST & Grammar Lexicon resmi (tanpa slop distractors)
  - [x] Generator 4 level bertingkat secara dinamis
- [x] **3. Integrasi Workbench & 4-Level Stepper UI (@antislop/desktop)**
  - [x] Refaktor `generateSocraticChallenge()` & `answerSocraticChallenge()` di `workbench.js`
  - [x] Implementasikan render 4-Level Stepper di `#socratic-gate-card`
  - [x] Tambahkan styling semantik di `workbench.css` dengan token `var(--vscode-*)`
  - [x] Jaga backward compatibility 100% dengan `v0_2_4_socratic_cognitive_gate.test.ts`
- [x] **4. Pengujian & Verifikasi Komprehensif**
  - [x] Buat unit test suite `packages/antislop-desktop/test/v0_2_8_socratic_scaffolding.test.ts` (13/13 passing)
  - [x] Verifikasi `v0_2_4_socratic_cognitive_gate.test.ts` (27/27 passing, 100%)
  - [x] Full monorepo vitest passing (**39/39 test files, 825/825 tests passing**)
  - [x] Full monorepo build passing (`corepack yarn build`, `tsc -b`: exit code 0)

---

## Tahap 4 — Zero-Hardcode Radical Innovations (COMPLETED)
- [x] **1. BridgeWire: Live Kinetic Spline Connector**
  - [x] Skema protokol `BridgeWireCoordinatesSchema` dan `computeBridgeWireSpline` di `@antislop/protocol`
  - [x] Implementasi `BridgeWireController` di `packages/antislop-desktop/src/workbench/bridgewire.js`
  - [x] SVG overlay layer `#bridgewire-overlay-canvas` di `index.html` dengan filter glow dan kinetik marker
  - [x] Kinetic dash animation dan styling zero-hardcoding via `var(--vscode-*)` di `workbench.css`
  - [x] Kalkulasi koordinat dinamis Monaco editor (`getScrolledVisiblePosition`) ke target card Layar B
  - [x] Unit test `packages/antislop-desktop/test/bridgewire.test.ts` (12/12 passing)
- [x] **2. PopperGate: AST-Driven Automated Falsifier**
  - [x] Skema protokol `FalsificationDomainSchema`, `FalsificationCaseSchema`, `PopperGateReportSchema` di `@antislop/protocol`
  - [x] Sidecar engine `PopperGateFalsifier` di `packages/antislop-sidecar/src/popper-gate-falsifier.ts` (sintesis 16 boundary cases murni tanpa dummy data)
  - [x] Implementasi `PopperGateController` di `packages/antislop-desktop/src/workbench/popper-gate.js`
  - [x] Panel stress-test counterfactual dan scoring kognitif di Layar B
  - [x] Styling responsif via token `var(--vscode-*)` di `workbench.css`
- [x] **3. MaieuticDuck: Socratic Dialectic Partner**
  - [x] Skema protokol `MaieuticPhaseSchema`, `MaieuticContextEnvelopeSchema`, `MaieuticResponseSchema` di `@antislop/protocol`
  - [x] Sidecar engine `MaieuticDuckEngine` di `packages/antislop-sidecar/src/maieutic-duck-engine.ts` (state machine 4-fase: probe -> invariant -> synthesis -> resolution)
  - [x] Kebijakan ketat anti-spoonfeeding (`directSolutionAllowed: false`, `antiSpoonfeedAssertion: true`)
  - [x] Implementasi `MaieuticDuckController` di `packages/antislop-desktop/src/workbench/maieutic-duck.js`
  - [x] Panel interaktif Layar B di `index.html` dan `workbench.css`
- [x] **4. Pengujian & Verifikasi Monorepo Lengkap**
  - [x] Test suite `packages/antislop-sidecar/test/radical-innovations.test.ts` (12/12 passing)
  - [x] Test suite `packages/antislop-desktop/test/v0_2_9_radical_innovations.test.ts` (12/12 passing)
  - [x] Test suite `packages/antislop-desktop/test/v0_2_9_popper_maieutic.test.ts` (17/17 passing)
  - [x] Full Monorepo Vitest: **43/43 test files, 885/885 tests passing (100% pass rate, 0 failures)**
  - [x] Full Monorepo Build (`tsc -b`, `corepack yarn build`): Exit code 0
