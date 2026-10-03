# Original User Request

## 2026-10-02T15:14:26Z

This is a single self-contained fix; keep it small and focused. Implement complete VS Code-style right-click Context Menu and file operations (New File, New Folder, Rename with `F2`, Delete with confirmation, Reveal in File Explorer, Copy Path) in the NSCode Explorer tree with Electron IPC backend.

Working directory: C:\laragon\www\_Projek\NSCode  
Integrity mode: development

## Requirements

### R1. Native File System CRUD & Shell Integration IPC
Implement robust Electron IPC backend handlers in `packages/antislop-desktop/src/main.ts` and expose typed bridges in `packages/antislop-desktop/src/preload.ts`:
- `fs:createFile`: Create a new empty file at specified directory path.
- `fs:createDirectory`: Create a new folder at specified directory path.
- `fs:rename`: Rename an existing file or directory path.
- `fs:delete`: Delete a file or directory (with validation protection against deleting workspace root).
- `shell:revealInFolder`: Reveal target item in native OS file explorer (`electron.shell.showItemInFolder`).
- All handlers must use native standard Node.js APIs (`fs/promises`, `path`) without introducing heavy external runtime dependencies.

### R2. Interactive Explorer Context Menu UI & Tree Operations
Implement a custom VS Code Dark+ styled floating Context Menu attached to the Explorer tree in `packages/antislop-desktop/src/workbench/workbench.js` & `workbench.css`:
- Right-clicking any tree item (file or directory) or empty tree space opens the context menu at mouse coordinates.
- Actions:
  - **New File**: Inline input or prompt to create file inside target directory (or sibling folder if file was clicked).
  - **New Folder**: Inline input or prompt to create folder in target directory.
  - **Rename**: Triggers inline renaming on the item with existing name pre-filled.
  - **Delete**: Prompts native confirmation dialog before deleting from disk.
  - **Reveal in File Explorer**: Triggers native OS file reveal.
  - **Copy Path** / **Copy Relative Path**: Copies respective path to system clipboard.
- Dismiss menu on click outside, `Escape` key, or menu item selection.

### R3. Keyboard Shortcuts & Focus Ergonomics
Wire keyboard navigation and standard VS Code Explorer shortcuts:
- `F2`: Trigger rename on the currently selected tree item.
- `Delete` / `Backspace`: Trigger delete confirmation on the currently selected tree item.
- Auto-refresh Explorer tree and synchronize open tabs if a renamed/deleted file was open in Monaco.

### R4. Automated Programmatic Test Suite
Add a comprehensive Vitest test suite (`packages/antislop-desktop/test/v0_1_2_explorer_crud.test.ts`) validating:
- IPC handler registration and safety constraints.
- File and folder creation, rename, and deletion lifecycle.
- Tree event listeners for contextmenu and keyboard shortcuts.
- Tab auto-update/close behavior on file deletion or rename.

## Acceptance Criteria

### Explorer Context Menu & File Actions
- [ ] Right-clicking any tree node opens the context menu at mouse position with all 6 core actions.
- [ ] Clicking "New File" / "New Folder" creates the item on disk and updates the Explorer tree immediately.
- [ ] Pressing `F2` or clicking "Rename" allows renaming the item on disk and updates any active open tab.
- [ ] Pressing `Delete` or clicking "Delete" shows a confirmation prompt and deletes the item on disk.
- [ ] Clicking "Reveal in File Explorer" triggers `shell.showItemInFolder`.
- [ ] Clicking "Copy Path" / "Copy Relative Path" copies the respective path to system clipboard.

### Build & Test Integrity
- [ ] Monorepo test suite passes 100% with zero regressions.
- [ ] All new unit tests in `v0_1_2_explorer_crud.test.ts` pass cleanly.
- [ ] `corepack yarn --cwd packages/antislop-desktop build` compiles cleanly without errors.


## 2026-10-03T00:13:59Z

Implement a minimalist, VS Code Dark+ harmonized Guided Cognition architecture for Screen B (Layar B AI Assistant) that coordinates seamlessly with Screen A (Monaco Editor): initiate workflows from a central prompt box ("Apa yang akan kita kerjakan hari ini?"), pinpoint and stack exact file line targets for inspection without blind auto-patching, provide on-demand guidance and fast external pattern search via concise technical summary cards, and keep the developer in complete cognitive control.

Working directory: C:\laragon\www\_Projek\NSCode  
Integrity mode: development

## Requirements

### R1. Screen B Visual & Layout Harmonization (Pure VS Code Dark+)
- Unify Screen B's visual tokens to match Screen A's VS Code Dark+ palette:
  - Background: `#1e1e1e` / `#18181b`
  - Panes & Cards: `#252526` / `#27272a`
  - Borders: `#2d2d2d` / `#3f3f46`
  - Typography: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Cascadia Code, monospace`
  - Accent Blue: `#007acc`, Muted Gray: `#858585`
- Zero childish UI tropes, zero emojis, zero unnecessary visual clutter or extra bloated layouts.
- Structured into a clean, minimalist 3-tier view:
  1. Top: Minimal header with active workspace breadcrumb.
  2. Middle: Interaction thread and **Target Line Stack** container.
  3. Bottom: Unified chat prompt box with placeholder *"Apa yang akan kita kerjakan hari ini?"*.

### R2. Target Line Stacking & Monaco Zero-Buffer Pointer
- All change requests (feature building, refactoring, or bug investigation) initiate from the central chat prompt.
- Screen B analyzes the prompt and identifies exact candidate files and line numbers (e.g. `src/main.ts:288-305`).
- **Target Line Stack**:
  - Displays identified target locations as stacked, interactive badges/cards.
  - Clicking any stacked target sends a zero-buffer cursor navigation command to Screen A Monaco editor (`editor.revealLineInCenter`, cursor positioning, non-destructive line highlighting).
  - Strictly prohibits blind automatic file mutation: the source code remains 100% untouched upon target stack creation.

### R3. On-Demand Guidance & Fast Pattern Scout ("Minta Saran Pengerjaan")
- Each stacked target item provides an explicit action button: *"Minta Saran Pengerjaan"* / *"Cari Masalah Serupa"*.
- When clicked:
  - Triggers a fast background scout using lightweight models (`flash` / `flash_lite`) to analyze root cause and retrieve similar patterns or official documentation.
  - Displays a clean **Technical Summary Card** in Screen B containing:
    1. Root cause / architectural explanation.
    2. Verified reference links (MDN, Node docs, StackOverflow).
    3. An optional diff suggestion preview that the developer can review and adopt with full understanding.
  - Leaves the developer in full control without silent auto-patches.

### R4. Automated Programmatic Test Suite
- Comprehensive Vitest test suite (`packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts`) validating:
  - Screen B theme token parity with Screen A (VS Code Dark+).
  - Chat input dispatch and target line extraction.
  - Target Stack data model and click-to-reveal Monaco IPC events.
  - On-demand guidance trigger without buffer mutation.

## Acceptance Criteria

### Screen B UI & Theme Parity
- [ ] Screen B background, borders, and typography match Screen A VS Code Dark+ with zero mobile/horizontal overflow.
- [ ] Central prompt box starts with placeholder *"Apa yang akan kita kerjakan hari ini?"*.

### Target Stacking & Zero-Buffer Line Pointer
- [ ] Submitting a prompt extracts and renders target items displaying exact file path and line numbers.
- [ ] Clicking a target stack item scrolls and highlights the exact line in Layar A Monaco editor.
- [ ] No code in Layar A is modified automatically upon target stack creation.

### On-Demand Guidance & Build Integrity
- [ ] Clicking "Minta Saran Pengerjaan" displays technical explanation and pattern guidance without auto-patching.
- [ ] All 376+ existing monorepo tests continue to pass (zero regression).
- [ ] All new Screen B guidance unit tests pass 100%.
- [ ] `corepack yarn --cwd packages/antislop-desktop build` compiles cleanly with exit code 0.
