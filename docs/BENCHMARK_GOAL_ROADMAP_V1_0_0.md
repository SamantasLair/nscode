# BENCHMARK GOAL ROADMAP: NSCode (v0.1.1 -> v1.0.0)

> **"Make Coders Great Again. No Slop."** 🧢🚫

Dokumen ini mendefinisikan peta jalan benchmark arsitektural dan fungsional dari versi `0.1.1` menuju target paritas 100% Visual Studio Code pada versi `1.0.0`, dengan keunggulan diferensiasi sistem *Active-Cognition Anti-Slop (Screen B)*.

---

## 1. Arsitektur Target & Tiga Pilar Paritas

```mermaid
flowchart TB
    subgraph CoreWorkbench ["Pilar 1: VS Code Core Shell & Workbench"]
        Monaco["Monaco Multi-Group Editor (Layar A)"]
        ActivityBar["Activity Bar + 5-Zone Shell Layout"]
        SCM["Source Control (Git Porcelain & 3-Way Diff)"]
        SearchTree["Workspace Search (Regex & Replace)"]
        Term["Integrated Terminal Multiplexer (node-pty)"]
    end

    subgraph StandardProtocols ["Pilar 2: Ekosistem Standar (LSP, DAP, OpenVSX)"]
        LSP["Language Server Protocol (IntelliSense & Diagnostics)"]
        DAP["Debug Adapter Protocol (Breakpoints & Callstack)"]
        ExtHost["Isolated Extension Host Process"]
        OpenVSX["Open VSX Registry (.vsix Support)"]
    end

    subgraph CognitiveAntiSlop ["Pilar 3: Anti-Slop AI Engine (Screen B)"]
        GeminiCLI["Antigravity / Gemini CLI Streaming Bridge"]
        RustcAnatomy["Rustc-Style Error Anatomy & Line Pointer"]
        CognitiveGate["Socratic Cognitive Verification Gate"]
        ZeroBuffer["Zero-Buffer Decoration Safety Guard"]
    end

    CoreWorkbench <--> StandardProtocols
    CoreWorkbench <--> CognitiveAntiSlop
```

---

## 2. Granular Milestone Matrix (v0.1.1 hingga v1.0.0)

| Versi | Status Milestone | Fokus Utama & Paritas VS Code | Integrasi Anti-Slop / Gemini CLI | Opsi Dream-RSI Engine |
| :--- | :--- | :--- | :--- | :---: |
| **v0.1.1** | **SELESAI (100%)** | Git SCM, Search in Files, Open Folder, Auto-Clean Releases | Sidecar daemon ready, CLI process streaming dasar | *Nonaktif* |
| **v0.1.2** | **SELESAI (100%)** | File Explorer CRUD (context menu, rename, delete), Icon Theme | Path boundary guards, full Monaco tab sync | *Nonaktif* |
| **v0.2.0** | **SELESAI (100%)** | Screen B Guided Cognition, Target Stacking, Zero-Buffer Pointer | On-demand fast pattern scout, Technical Summary Cards | *Nonaktif* |
| **v0.2.1** | **SELESAI (100%)** | Quick Open (`Ctrl+P`), Tab Dirty State (`●`), Status Telemetry (`Ln/Col`), Go to Line (`Ctrl+G`), Dynamic Screen B Modes | Decoupled EditorEventBridge, mode switcher tabs (Chat/Plan/Review) | *Nonaktif* |
| **v0.2.2** | **SELESAI (100%)** | Dynamic Screen B Agentic, Context Bridge (`Ctrl+Alt+A`), Mode Morphing (Chat/Plan/Review), Task Plan State Machine, Layar A Zero-Buffer Diff Inspection | Interactive subtasks, live execution logs console, zero-buffer virtual model diffs | *Nonaktif* |
| **v0.3.0** | *Feature Release* | Language Server Protocol (LSP) Client (TS, Python, C++), Hover | Error diagnostics diarahkan ke Rustc-style visual | **Opsional (LSP AST Engine)** |
| **v0.4.0** | *Feature Release* | Terminal Multiplexing (multi-tabs, bash/powershell), `tasks.json` | Output terminal & log dapat di-pipe ke Screen B | **Opsional (Stream Tuning)** |
| **v0.5.0** | **BETA MILESTONE** | **Daily-Driver Ready**: Git complete, LSP complete, Lint/Format | **Socratic Cognitive Gate aktif penuh (Anti-Slop)** | *Selektif* |
| **v0.6.0** | *Feature Release* | Debug Adapter Protocol (DAP), Breakpoints, Watch, Variables | AI Debugging Explainer tanpa blind auto-patch | **Opsional (DAP State Machine)** |
| **v0.7.0** | *Feature Release* | Git 3-Way Merge Conflict Editor, Git Timeline & Graph | AI Conflict Resolution Analysis & Explanation | **Opsional (3-Way Merge Trees)** |
| **v0.8.0** | *Major Architecture* | Extension Host Process Isolation, Open VSX Catalog, `.vsix` | Ekstensi dapat mendaftarkan Cognitive Tools | **Opsional (API Reverse Eng)** |
| **v0.9.0** | *Release Candidate* | Testing Explorer (`Ctrl+Shift+T`), Multi-Root Workspaces | AI Automated Test Verification & Falsification | **Opsional (Test Discovery)** |
| **v1.0.0** | **GENERAL AVAILABILITY** | **100% VS Code Functional Parity** + Ekosistem Ekstensi | **Sovereign Anti-Slop IDE siap produksi global** | **Opsional (Full Parity Audit)** |

---

## 3. Rincian Teknis Tiap Milestone

### Milestone v0.1.1: Functional Workbench Core, SCM & Open Folder (Selesai)
- **Status Capaian:**
  - **Source Control (Git)**: Status detection, accordion Staged/Changes, Stage/Unstage/Discard, commit action, Monaco Side-by-Side Diff Editor.
  - **Search across Files**: Regex, case, whole word toggles, tree navigation ke baris kode.
  - **Open Folder & Explorer**: Full recursive directory walking, dynamic open/closed folder codicons, toolbar New File/Folder/Refresh actions, authentic empty workspace state.
  - **Release Pipeline & Storage**: Automated clean-up legacy releases (`predist` hook & `yarn clean:legacy`).
  - **Verification**: 302 / 302 tests passing (100%).

### Milestone v0.1.2: Explorer Operations, Context Menu & Icon Themes (Selesai 100%)
- **Status Capaian:**
  - **File Explorer Interaktif & Context Menu**:
    - Context Menu klik kanan pada file tree (New File, New Folder, Rename, Delete, Reveal in File Explorer, Copy Relative Path).
    - Shortcut keyboard di Explorer: `Delete` / `Backspace` (hapus dengan konfirmasi dialog), `F2` (inline rename).
    - Proteksi keamanan path IPC (`fs:createFile`, `fs:createDirectory`, `fs:rename`, `fs:delete`, `shell:revealInFolder`).
    - 10 skenario batas edge-cases adversarial teratasi (slash normalization, cache hygiene `expandedDirs`/`navHistory`, window blur dismissal).
  - **Modular Icon Theme System**:
    - Dukungan lengkap glif asli Codicon (`.codicon-python`, `.codicon-database`, `.codicon-json`, dll.).
    - Rotasi panah chevron folder dinamis dan warna emas folder autentik (`#dcb67a`).
  - **Verification**: 376 / 376 monorepo tests passing (100%), 60 unit tests di `v0_1_2_explorer_crud.test.ts`.
  - **Tab & Buffer State Management**:
    - Dirty document indicator (`●` lingkaran putih) pada tab saat buffer berubah.
    - Dialog konfirmasi *"Do you want to save the changes you made to..."* jika tab tertutup saat dirty.
    - Drag-and-drop tab untuk reordering antar editor group.
  - **Quick Open (`Ctrl+P`)**:
    - Fuzzy search instan di seluruh file workspace menggunakan in-memory trie/fuzzy matcher.
    - Pratinjau file dan riwayat berkas yang baru saja dibuka (*Recently Opened*).
  - **Status Bar Interaktif**:
    - Indikator baris & kolom (`Ln X, Col Y`).
    - Pilihan indentasi (Spaces vs Tabs, Tab Size 2/4).
    - Encoding picker (UTF-8) dan EOL picker (LF vs CRLF).

### Milestone v0.2.0: Gemini CLI Integration in Screen B (Milestone Kunci)
- **Target Paritas & Diferensiasi:**
  - **Bidirectional Context Synchronization**:
    - Layar A secara realtime mengirimkan: path berkas aktif, seleksi kode yang disorot, dan posisi kursor ke Layar B via Sidecar WebSocket.
    - Tombol cepat *"Ask Gemini about Selection"* (`Ctrl+Alt+A`).
  - **Unified Gemini / Antigravity CLI Streaming**:
    - Streaming output dari Gemini CLI menampilkan thinking process, reasoning steps, dan blok kode dengan syntax highlighting VS Code Dark+.
    - Status daemon monitor: status koneksi, kuota/model status, latency monitor.
  - **Rustc-Style Error Anatomy & Line Pointer**:
    - Error traceback diparsing menjadi visual pointer yang menandai baris presisi di Monaco Editor Layar A tanpa memodifikasi buffer teks (Zero-Buffer Decoration).
  - **Cognitive Verification Gate (Anti-Slop Invariant)**:
    - IDE menolak auto-patching buta. Sebelum kode disalin atau diterapkan, Layar B menampilkan kartu tantangan pemahaman (Socratic Questioning) untuk mencegah developer skill atrophy.

### Milestone v0.2.1: Desktop Editor Ergonomics, Dirty Tabs, Telemetry & Dynamic Screen B (Selesai 100%)
- **Status Capaian:**
  - **Quick Open (`Ctrl+P`) & Workspace Fuzzy Search**:
    - In-memory subsequence fuzzy search algorithm dengan scoring cerdas (word boundary bonus +35, CamelCase bonus +35, consecutive bonus +25).
    - Resolving ikon file Codicon dinamis via `iconTheme.ts` dan styling highlight matching text (`.palette-highlight`).
    - Navigasi keyboard penuh (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`) dan bidirectional mode switching (`>` Command Palette <-> Quick Open file search).
  - **Tab Dirty State Management & Save Ergonomics**:
    - Pelacakan modifikasi buffer Monaco secara presisi via `model.getAlternativeVersionId()`.
    - Transformasi ikon close tab dari `×` menjadi solid white bullet (`●`), dan morphing kembali ke `×` saat hover.
    - Shortcut `Ctrl+S` untuk menyimpan buffer ke disk dan membersihkan dirty state.
    - Dialog modal konfirmasi penutupan tab dirty VS Code Dark+ (*"Do you want to save the changes you made to..."*) dengan opsi `[ Save ]`, `[ Don't Save ]`, dan `[ Cancel ]`.
    - Proteksi penutupan multi-tab (`closeAllTabs`) dan workspace switching guard.
  - **Status Bar Cursor Telemetry & Go to Line (`Ctrl+G`)**:
    - Telemetry koordinat kursor realtime (`Ln X, Col Y`) dan penghitungan karakter terseleksi (`(N selected)`).
    - Badge koordinat interaktif (`#status-cursor.status-clickable`) membuka Quick Open dengan prompt `:`.
    - Go to Line navigation (`Ctrl+G` atau `:line:col`) dengan boundary clamping otomatis (`1..maxLine`).
  - **Dynamic Screen B Mode Switcher & Event Bridge**:
    - Secondary sidebar mode switcher tabs di header Screen B (`Chat`, `Plan`, `Review`) dalam styling VS Code Dark+ (bebas emoji).
    - Arsitektur event bridge terisolasi (`EditorEventBridge`) yang menyiarkan event (`editor:cursorChange`, `editor:dirtyChange`, `editor:fileSwitched`, `screenB:modeChanged`) dengan isolasi error per listener dan broadcast ke iframe webview via `postMessage`.
  - **Verification & Build Integrity**:
    - 447 / 447 monorepo tests passing 100% melintasi 24 test suites (termasuk 38 unit tests di `v0_2_1_quick_open_dirty_tabs.test.ts` dan 14 tests di `v0_2_1_adversarial_challenger_2.test.ts`).
    - `corepack yarn --cwd packages/antislop-desktop build` berhasil dengan exit code 0.

### Milestone v0.2.2: Dynamic Screen B Agentic System, Mode Morphing & Zero-Buffer Diff Inspection (Selesai 100%)
- **Status Capaian:**
  - **Context Bridge dari Layar A ke Screen B (`Ctrl+Alt+A` & Monaco Context Menu)**:
    - Shortcut keyboard `Ctrl+Alt+A` / `Cmd+Alt+A` dan aksi menu klik kanan Monaco *"Kirim ke Screen B"* (`sendToScreenB`).
    - Menangkap secara atomik: path berkas relatif workspace (`toRelativeWorkspacePath`), koordinat baris ter-normalisasi (`startLine`, `endLine`), dan potongan kode terpilih (dengan fallback kursor satu baris).
    - Memasukkan kartu konteks aktif ke `targetStack` Screen B dengan cuplikan kode di `.target-code-preview`.
    - Auto-morph Screen B ke Chat mode, membuka sidebar otomatis jika tersembunyi, dan memfokuskan prompt input (`#prompt-input-box`).
    - Zero-Buffer invariant: seleksi dan stacking tidak memodifikasi isi berkas fisik di disk.
  - **Dynamic Screen B Mode Morphing (`Chat` <-> `Plan` <-> `Review`)**:
    - Mode switching terstruktur dengan container view terisolasi: `#screen-b-view-chat`, `#screen-b-view-plan`, dan `#screen-b-view-review`.
    - Navigasi tab interaktif via `#screen-b-mode-tabs` (`setScreenBMode`) dengan penanda aktif dan atribut aksesibilitas.
    - Morphing adaptif otomatis: otomatis beralih ke Plan Mode saat tugas multi-langkah diinisialisasi, beralih ke Review Mode saat diff usulan siap, dan beralih ke Chat Mode saat context bridge dipicu.
    - Desain antarmuka VS Code Dark+ autentik (`#1e1e1e`, `#252526`, `#2d2d2d`, aksen `#007acc`, tipografi Segoe UI, Codicon icons, zero emojis).
  - **Agentic Task Plan State Machine & Progress Dispatcher**:
    - State machine rencana tugas (`TaskPlan`, `Subtask`) dengan status deterministik (`pending`, `in_progress`, `completed`, `failed`) dan pelacakan progress percentage.
    - Kontrol interaktif operator: `[ Pause ]`, `[ Resume ]`, dan `[ Cancel ]`.
    - Visualisasi: checklist subtask kolapsibel dengan indikator Codicon (`codicon-circle-outline`, `codicon-loading codicon-modifier-spin`, `codicon-pass-filled`, `codicon-error`), pengelompokan berkas sasaran dengan glif berkas Codicon, dan konsol riwayat eksekusi live dengan timestamp.
    - Penyiaran telemetri realtime via `EditorEventBridge` (`screenB:planUpdate`, `screenB:taskProgress`).
  - **Layar A Zero-Buffer Diff Preview & Review Inspection**:
    - Antarmuka Review Mode menampilkan daftar berkas termodifikasi dengan badge diff line counter (`+X / -Y`), tombol `[ Review Diff ]`, `[ Accept All ]`, `[ Discard All ]`, serta per-file `[ Accept ]` dan `[ Discard ]`.
    - Pemasangan Monaco Diff Editor di `#diff-editor-mount` secara side-by-side menggunakan model URI virtual (`agent-orig://${filePath}` dan `agent-proposed://${filePath}`).
    - Zero-Buffer invariant: pratinjau diff sama sekali tidak menulis ke disk, tidak menandai berkas aktif sebagai dirty (`isDirty = false`), dan tidak merusak view state tab.
    - `acceptReviewDiff`: menulis perubahan usulan ke disk secara aman melalui `window.electronFS.writeFile`, memperbarui buffer Monaco aktif, menghapus dirty state, dan menandai diff berstatus applied.
    - `discardReviewDiff` & `closeReviewDiff`: membatalkan usulan secara bersih tanpa operasi disk dan memulihkan Monaco editor reguler tanpa penghancuran tab.
  - **Verification & Build Integrity**:
    - Seluruh rangkaian pengujian spesifikasi (`v0_2_2_dynamic_screen_b_agentic.test.ts` - 39 tests) dan rangkaian adversarial (`v0_2_2_adversarial_challenger_1.test.ts` - 20 tests, `v0_2_2_adversarial_challenger_2.test.ts` - 21 tests) mengonfirmasi 80 pengujian baru lulus 100%.
    - Kompilasi build package desktop (`corepack yarn --cwd packages/antislop-desktop build`) berhasil bersih dengan exit code 0.

### Milestone v0.3.0: Language Server Protocol (LSP) & Code Intelligence
- **Target Paritas VS Code:**
  - **LSP Client Architecture**:
    - Integrasi `monaco-languageclient` dan `vscode-ws-jsonrpc` ke backend Electron.
    - Dukungan out-of-the-box untuk TypeScript/JavaScript (`typescript-language-server`), Python (`pyright` / `jedi`), dan C/C++ (`clangd`).
  - **Fitur IntelliSense Penuh**:
    - Autocomplete kontekstual dengan signature dan dokumentasi inline.
    - Parameter Hints saat mengetik argumen fungsi (`Ctrl+Shift+Space`).
    - Hover Tooltips: Tipe data, docstrings, dan markdown preview saat hover di atas simbol.
    - Go to Definition (`F12`), Peek Definition (`Alt+F12`), Find References (`Shift+F12`).
    - Rename Symbol (`F2`) yang mengupdate seluruh referensi di seluruh workspace secara atomik.
  - **Bottom Panel: Problems Tab**:
    - Mengagregasi seluruh error dan warning dari LSP server secara realtime dengan badge jumlah error (`#problems-badge`).
    - Klik item problem langsung memusatkan editor ke baris dan kolom yang bermasalah.

### Milestone v0.4.0: Terminal Multiplexing & Task Runner
- **Target Paritas VS Code:**
  - **Integrated Terminal Multiplexer**:
    - Dukungan multi-tab terminal di bottom panel (PowerShell, Command Prompt, Git Bash, WSL).
    - Pilihan shell default berdasarkan deteksi OS.
    - Split terminal (membuka dua sesi terminal berdampingan).
    - Status terminal: clear, kill, restart, nama custom tab, dan ikon status proses.
  - **Task Runner (`tasks.json`)**:
    - Mendukung konfigurasi format standar `.vscode/tasks.json`.
    - Menjalankan script npm, build command, test command, atau custom CLI.
    - Problem matchers untuk mem-parse output build langsung ke panel Problems.
  - **Output Channels**:
    - Dropdown channel log di tab Output: `Tasks`, `Git`, `AntiSlop Daemon`, `Language Server`.
  - **Keyboard Shortcuts Configuration (`keybindings.json`)**:
    - UI editor shortcut (`Ctrl+K Ctrl+S`) untuk mengubah binding tombol sesuai preferensi pengguna.

### Milestone v0.5.0: BETA MILESTONE (Full Daily Driver Workflow)
- **Kriteria Penerimaan (Acceptance Gate):**
  - **Kelayakan Daily-Driver**: Developer dapat membuka repositori riil (misal Next.js, Python FastAPI, Go, atau Rust), melakukan coding harian, formatting (Prettier), linting (ESLint), commit git, run/test di terminal terintegrasi, dan mencari teks di workspace tanpa perlu membuka aplikasi editor lain.
  - **Dual-Screen Stability**: Layar A dan Layar B bekerja harmonis tanpa lag, memory leak, atau IPC race conditions.
  - **Packaging Standalone**: Biner installer NSIS dan portable zip untuk Windows x64 dengan ukuran optimal dan waktu startup < 1.5 detik.
  - **Zero Regresi**: 100% lulus seluruh rangkaian test suite (>350 unit & integration tests).

### Milestone v0.6.0: Debug Adapter Protocol (DAP) Engine
- **Target Paritas VS Code:**
  - **DAP Client Core**:
    - Kompatibilitas dengan adapter debug standar (Node.js debug, Python `debugpy`, C++ `lldb`/`gdb`).
    - Konfigurasi debugging berbasis `.vscode/launch.json`.
  - **UI Debugging Komprehensif (`Ctrl+Shift+D`)**:
    - Panel Primary Sidebar: Variables (Local, Global, Closure), Watch expressions, Call Stack, Breakpoints.
    - Editor Gutter Breakpoints: Klik untuk pasang breakpoint lingkaran merah, hover preview.
    - Floating Debug Action Bar: Pause/Continue (`F5`), Step Over (`F10`), Step Into (`F11`), Step Out (`Shift+F11`), Restart (`Ctrl+Shift+F5`), Stop (`Shift+F5`).
    - Debug Console: Interactive REPL untuk evaluasi ekspresi saat breakpoint aktif.

### Milestone v0.7.0: Advanced Git & 3-Way Merge Conflict Editor
- **Target Paritas VS Code:**
  - **Operasi Git Tingkat Lanjut**:
    - Branch switcher & branch creator dari Status Bar (`git checkout -b`).
    - Fetch, Pull, Push dengan status remote tracking (`↑1 ↓2`).
    - Git Stash (Stash changes, Pop stash).
  - **3-Way Merge Conflict Editor**:
    - Deteksi berkas konflik merge.
    - Tombol inline CodeLens: *"Accept Current Change"*, *"Accept Incoming Change"*, *"Accept Both Changes"*, *"Compare Changes"*.
  - **Git Graph & Timeline View**:
    - Riwayat commit berkas lokal dari waktu ke waktu (*File Timeline*).

### Milestone v0.8.0: Extension Host & Open VSX Marketplace Integration
- **Target Paritas VS Code:**
  - **Proses Extension Host Terisolasi**:
    - Sub-proses Node.js independen yang menjalankan ekstensi.
    - Implementasi subset VS Code Extension API (`vscode.*`).
  - **Integrasi Open VSX Registry**:
    - Activity Bar Extensions View (`Ctrl+Shift+X`).
    - Pencarian, instalasi satu-klik, disable, dan uninstall ekstensi dari [Open VSX Registry](https://open-vsx.org/).
    - Dukungan instalasi offline melalui berkas package `.vsix`.

### Milestone v0.9.0: Testing Explorer & Multi-Root Workspaces
- **Target Paritas VS Code:**
  - **Test Explorer (`Ctrl+Shift+T`)**:
    - Auto-discovery unit tests (Vitest, Jest, Mocha, PyTest, Go test).
    - Status pohon pengujian: Pass, Fail, Running, Skipped.
  - **Multi-Root Workspaces**:
    - Membuka lebih dari satu folder root dalam satu jendela (`.code-workspace`).
  - **Zen Mode & Kustomisasi Tampilan**:
    - Fullscreen Zen Mode (`Ctrl+K Z`) menyembunyikan semua UI bar dan memfokuskan layar hanya pada editor.

### Milestone v1.0.0: GENERAL AVAILABILITY (100% Parity + Anti-Slop Sovereign)
- **Target Capaian Final:**
  - **Paritas Penuh 100% VS Code**: Seluruh fungsi esensial workbench, editor, SCM, debugging, terminal, ekstensi, dan konfigurasi VS Code telah terpasang dan berfungsi sempurna.
  - **Superioritas Cognitive Anti-Slop**: IDE bukan sekadar cloning, melainkan editor generasi baru yang memadukan kekuatan VS Code dengan pendamping AI aktif yang mempertahankan kecerdasan dan keterampilan sang developer.
  - **Zero-Crash Enterprise Reliability**: Lulus lebih dari 500 pengujian otomatis (unit, stress, adversarial, dan UI integration) dengan zero-memory leak.

---

## 4. Opsi Akselerasi Lanjutan: Dream-RSI Exploration Protocol (`/dream-rsi`)

Sesuai evaluasi arsitektural, **Dream-RSI (Recursive Self-Improvement via Replay World Models)** dicantumkan sebagai **Akselerator Eksplorasi Opsional** pada milestone teknis berat.

### Aturan Aktivasi Selektif
1. **Mode Default (Standar & Blitz-Swarm)**: Digunakan untuk 80% pekerjaan rutin (UI styling, keyboard shortcut, CRUD operasi file, integrasi menu). Cepat, efisien, dan hemat kuota tanpa overhead ledger.
2. **Eskalasi Opsional (`/dream-rsi`)**: Diaktifkan saat menghadapi:
   - **v0.2.0**: Tuning parameter streaming PTY node-pty & mitigasi backpressure terminal berkecepatan tinggi.
   - **v0.3.0**: Arsitektur `vscode-ws-jsonrpc` Language Server Protocol (LSP) multi-proses untuk menjaga alokasi memori buffer Monaco.
   - **v0.6.0**: Pemetaan state machine Debug Adapter Protocol (DAP) multi-thread.
   - **v0.8.0**: Reverse engineering API kompatibilitas ekstensi VS Code (`vscode.d.ts`).
   - **v1.0.0**: Matriks audit falsifikasi regresi menyeluruh (>500 unit tests).

Dengan konfigurasi ini, NSCode mendapatkan kecepatan implementasi maksimal pada task umum sekaligus daya jelajah komputasi tingkat tinggi saat menghadapi bottleneck teknis kompleks.
