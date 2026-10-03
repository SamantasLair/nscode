# Tasks: Milestone v0.1.1 (Source Control, Search, & Tooling Patch)

## Checklist Eksekusi
- [x] **1. Monorepo Version Bump ke `0.1.1`**
  - [x] Perbarui `package.json` root (`version: 0.1.1`)
  - [x] Perbarui `packages/antislop-desktop/package.json` (`version: 0.1.1`)
  - [x] Perbarui `packages/antislop-protocol/package.json` (`version: 0.1.1`)
  - [x] Perbarui `packages/antislop-sidecar/package.json` (`version: 0.1.1`)
  - [x] Perbarui `packages/antislop-vscode-extension/package.json` (`version: 0.1.1`)
  - [x] Perbarui `packages/theia-shell-extension/package.json` (`version: 0.1.1`)
  - [x] Perbarui `packages/antislop-webview/package.json` (`version: 0.1.1`)
  - [x] Perbarui teks `v0.1.1` pada Titlebar, Status Bar, dan About dialog di `workbench.js`

- [x] **2. IPC Handlers Git & Search Backend (`main.ts` & `preload.ts`)**
  - [x] Tambahkan `git:status` (eksekusi `git status --porcelain=v1 -b`, deteksi repo dan status file)
  - [x] Tambahkan `git:init` (inisialisasi repositori jika belum ada)
  - [x] Tambahkan `git:diff` (ambil konten HEAD untuk Monaco Diff Editor)
  - [x] Tambahkan `git:stage` & `git:unstage` (`git add`, `git restore --staged`)
  - [x] Tambahkan `git:commit` (eksekusi commit hanya saat dipicu interaksi user di UI)
  - [x] Tambahkan `fs:searchFiles` (pencarian teks/regex di seluruh file workspace)
  - [x] Expose typed bridges `window.electronGit` dan `window.electronSearch` di `preload.ts`

- [x] **3. UI Primary Sidebar Containers & Diff Mount (`index.html` & `workbench.css`)**
  - [x] Strukturkan multi-view container di `#primary-sidebar` (`#view-explorer`, `#view-search`, `#view-scm`)
  - [x] Markup Source Control panel: header, commit box, Changes/Staged accordion, status badges (`M`/`A`/`D`/`U`), fallback non-repo
  - [x] Markup Search panel: input search/replace, toggle case/word/regex, include/exclude, results container
  - [x] Tambahkan container Diff Editor di area editor
  - [x] Styling VS Code Dark+ CSS untuk item git, badge, dan search result tree

- [x] **4. Logika Interaktif Workbench (`workbench.js`)**
  - [x] Routing Activity Bar (`act-explorer`, `act-search`, `act-scm`, `act-settings`, `act-accounts`)
  - [x] Integrasi Git: auto-refresh status, aksi stage/unstage/discard, render commit box
  - [x] Integrasi Monaco Diff Editor: klik berkas yang dimodifikasi membuka perbandingan side-by-side
  - [x] Integrasi Search: realtime/debounced search, rendering hasil, klik hasil membuka berkas dan melompat ke baris yang cocok
  - [x] Wiring menu `View -> Open View: Search / SCM` dan Settings modal (`act-settings`, `Ctrl+,`)

- [x] **5. Pengujian & Verifikasi**
  - [x] Buat unit test `packages/antislop-desktop/test/v0_1_1_git_search_features.test.ts` (28 tests passing)
  - [x] Jalankan test suite monorepo (`corepack yarn test` -> 299 / 299 tests passing 100%)
  - [x] Kompilasi `corepack yarn --cwd packages/antislop-desktop build` berhasil dengan exit code 0

- [x] **6. Fitur Open Folder & Tree View Workspace (`main.ts` & `workbench.js`)**
  - [x] Perbaiki `fs:openDirectory` mengembalikan objek lengkap `{ canceled, path, name }`
  - [x] Perbaiki `fs:readDirectory` mengembalikan `{ error, rootPath, nodes, tree }` untuk dual kompatibilitas
  - [x] Terapkan UI State Empty Folder autentik VS Code dengan tombol interaktif `[ Open Folder ]`
  - [x] Dukungan shortcut ganda: `Ctrl+K Ctrl+O` (VS Code Chord) dan `Ctrl+O` (Direct)
  - [x] Dukungan CLI argv: Membuka folder langsung lewat argumen CLI saat peluncuran app
  - [x] Wiring tombol toolbar explorer: New File (`btn-tree-new-file`), New Folder (`btn-tree-new-folder`), Refresh, dan Collapse All
  - [x] Sinkronisasi otomatis ke Source Control (Git) dan search placeholder saat folder workspace dibuka

- [x] **7. Auto Clean-up Legacy Releases & Optimasi Storage (`clean-legacy-releases.js`)**
  - [x] Skrip otomasi `packages/antislop-desktop/scripts/clean-legacy-releases.js`
  - [x] Hook otomatis `predist` sebelum pemaketan `dist` (memastikan installer versi lama terhapus otomatis)
  - [x] Perintah mandiri `corepack yarn clean:legacy` di root & package desktop
  - [x] Langsung membebaskan **176.51 MB** penyimpanan lokal (menghapus installer v0.1.0 yang usang)
  - [x] Unit test `packages/antislop-desktop/test/auto-clean-releases.test.ts` (3 tests, total suite: 302/302 tests passing 100%)

- [x] **8. File & Folder Icon Theme & Visual Polish (`/teamwork-swarm`)**
  - [x] Perbaiki akar masalah kotak kosong `[]` pada berkas Python, DB, JSON, Text dengan menyertakan kelas dasar `codicon` deterministik
  - [x] Dukungan glif autentik bawaan Codicon: `.codicon-python`, `.codicon-database`, `.codicon-json`, `.codicon-markdown`, `.codicon-file-text`, `.codicon-source-control`, `.codicon-server-process`
  - [x] Perbaiki orientasi panah chevron folder (`0deg` default mengarah ke kanan `>`, `.expanded` rotasi `90deg` mengarah ke bawah `v`)
  - [x] Berikan warna emas warm VS Code (`#dcb67a`) untuk ikon folder tertutup dan terbuka
  - [x] Tambahkan token warna bahasa di `workbench.css` (Python `#3572A5`, JS `#f1e05a`, TS `#3178c6`, DB `#e38c00`, Markdown `#519aba`, dll.)
  - [x] Implementasi sistem modular TypeScript `iconTheme.ts` (`IconThemeRegistry`, tema `'seti'` & `'minimal'`, dynamic resolving)
  - [x] Automated test suite `packages/antislop-desktop/test/icon-theme.test.ts` (14 unit tests passing 100%)

- [x] **9. Explorer Operations & Context Menu (Milestone v0.1.2 - Selesai 100%)**
  - [x] Electron IPC backend handlers (`main.ts` & `preload.ts`): `fs:createFile`, `fs:createDirectory`, `fs:rename`, `fs:delete`, `shell:revealInFolder`
  - [x] Proteksi keamanan path: pencegahan manipulasi root workspace/ancestor, proteksi moving folder ke dalam descendant sendiri, sanitasi nama berkas terlarang di Windows (`CON`, `PRN`, `AUX`, `NUL`, karakter ilegal)
  - [x] Context Menu UI (`workbench.css` & `workbench.js`): floating context menu VS Code Dark+, viewport boundary containment, right-click file/directory/empty tree
  - [x] Keyboard shortcuts & ergonomi: `F2` inline rename, `Delete` confirmation dialog, copy path/relative path, auto-refresh tree, sinkronisasi tab aktif Monaco
  - [x] 10 edge-cases adversarial teratasi: slash normalization, pembersihan cache `expandedDirs`, `navHistory` dead path cleanup, EISDIR guards, window blur menu dismissal, SCM refresh
  - [x] Automated test suite `packages/antislop-desktop/test/v0_1_2_explorer_crud.test.ts` (60 / 60 tests passing 100%)
  - [x] Total monorepo tests: **376 / 376 tests passing (100%)**

- [x] **10. Screen B Guided Cognition & Target Stacking (Milestone v0.2.0 - Selesai 100%)**
  - [x] Version bump monorepo ke `0.2.0` pada seluruh 7 package.json dan About dialog
  - [x] Screen B Visual & Layout Harmonization (R1): Penyelarasan token warna VS Code Dark+ (`#1e1e1e`, `#252526`, `#2d2d2d`, aksen `#007acc`, tipografi monospace/Segoe UI), struktur 3-tier view, bebas emoji, zero horizontal overflow
  - [x] Target Line Stacking & Monaco Zero-Buffer Pointer (R2): Parsing target file & exact line numbers dari chat box, penumpukan target di inspection stack, klik target mengarahkan kursor/highlight Monaco Layar A tanpa mengubah buffer berkas (`openDoc.isDirty = false`)
  - [x] On-Demand Guidance & Fast Pattern Scout (R3): Tombol *"Minta Saran Pengerjaan"* memicu IPC `guidance:scoutPattern`, menyajikan Technical Summary Card (akar masalah, link dokumentasi resmi MDN/Node/StackOverflow, saran diff opsional) tanpa auto-patching
  - [x] Automated Programmatic Test Suite (R4): Test suite `packages/antislop-desktop/test/v0_2_0_screen_b_guidance.test.ts` (19 tests) lulus 100%
  - [x] Independent Victory Audit: Disahkan secara bulat oleh 5 reviewer/challenger dan Post-Victory Auditor (`VICTORY CONFIRMED`)
  - [x] Total monorepo tests: **395 / 395 tests passing (100%)** melintasi 22 test files





