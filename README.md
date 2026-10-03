# NSCode (NoSlop Code)

> **"Make Coders Great Again. No Slop."** 🧢🚫

[![Version](https://img.shields.io/badge/version-0.1.1-blue.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-302%20passing-brightgreen.svg)](tasks.md)
[![Philosophy](https://img.shields.io/badge/philosophy-zero%20ai%20slop-crimson.svg)](#the-anti-slop-philosophy)

**NSCode** is an active-cognition desktop code editor built to combat AI-induced developer skill atrophy. Designed with authentic VS Code ergonomics, surgical precision, and zero AI slop, NSCode keeps developers' problem-solving muscles sharp while providing first-class modern IDE tooling.

---

## ⚡ The Anti-Slop Philosophy

In the era of indiscriminate AI token spam and speculative copy-paste coding, developers are losing their cognitive problem-solving instincts. 

**NSCode enforces 3 Golden Invariants:**
1. **Zero Silent Auto-Patching**: The editor never injects speculative AI ghost code into your buffer without conscious cognitive verification.
2. **Active Cognition (Screen A & Screen B)**: Screen A holds your raw Monaco editor buffer. Screen B provides socratic feedback, error anatomy, and mental model reinforcement without writing over your thoughts.
3. **Surgical Precision & Native Tooling**: No sluggish web wrappers, no emoji-cluttered UI slop, and no uninspected dependencies. Fast, offline-ready, and lightweight.

---

## ✨ Key Features (Milestone v0.1.1)

- 🗂️ **Authentic VS Code 5-Zone Workbench Shell**:
  - Titlebar with Command Palette (`Ctrl+P`, `F1`) and layout controls.
  - 48px Activity Bar with multi-view switching.
  - 260px Collapsible Primary Sidebar (Explorer, Search, Source Control).
  - Multi-tab Monaco Editor Group with Breadcrumbs and Side-by-Side Diff Viewer.
  - Interactive Bottom Panel (Terminal Shell, Output Logger).
- 📂 **Full Open Folder & Recursive Workspace Explorer**:
  - Open folders via UI button, `Ctrl+K Ctrl+O` chord, direct `Ctrl+O`, menu, or CLI (`nscode <path>`).
  - Dynamic folder open/closed codicons, new file/folder toolbar actions, and collapse-all.
- 🌿 **Integrated Git Source Control (SCM)**:
  - Real-time Git status detection (`git status --porcelain=v1 -b`).
  - Stage, unstage, discard changes, and commit directly from the sidebar.
  - Side-by-Side Monaco Diff Editor for working tree inspections.
- 🔍 **Workspace Search**:
  - Instant text & regex file search with Match Case, Match Whole Word, and Regex toggles.
  - Click search results to navigate straight to the file and line.
- 🧹 **Automated Storage Clean-Up (`clean:legacy`)**:
  - Self-pruning release pipeline that automatically purges legacy installers and freed storage on every build.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 20.0.0`
- [Yarn](https://yarnpkg.com/) `1.22.22` (via Corepack)

### Development
```bash
# Install monorepo dependencies
corepack yarn install

# Run desktop app in development mode
corepack yarn --cwd packages/antislop-desktop start
```

### Run Tests
```bash
# Run the entire test suite (302+ tests)
corepack yarn test
```

### Build & Package Standalone Windows Executables
```bash
# Clean legacy releases, compile TypeScript, and package standalone .exe
corepack yarn dist:desktop
```
Executables are generated in `packages/antislop-desktop/release/`:
- `NSCode 0.1.1.exe` (Portable)
- `NSCode Setup 0.1.1.exe` (Windows Installer)
- `win-unpacked/NSCode.exe` (Direct Unpacked Executable)

---

## 📜 Monorepo Architecture

```text
├── packages/
│   ├── antislop-desktop/          # Electron desktop host & VS Code Dark+ workbench shell
│   ├── antislop-protocol/         # Strict Zod schemas & JSON-RPC 2.0 cognitive contracts
│   ├── antislop-sidecar/          # WebSocket daemon for Antigravity & LLM bridge
│   ├── antislop-vscode-extension/ # Standard VS Code extension package
│   ├── theia-shell-extension/     # Eclipse Theia shell integration
│   └── antislop-webview/          # React Screen B Active-Cognition UI
```

---

## 📄 License

MIT © AntiSlop Team. Make Coders Great Again.
