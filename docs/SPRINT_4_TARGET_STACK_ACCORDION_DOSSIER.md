# DOSSIER TAHAP 4: TARGET STACK 22PX CHIP ACCORDION & KINETIC MOTION

## 1. Eksekutif Ringkasan
Tahap 4 dari inisiatif implementasi Best Practice Layar B NSCode telah diselesaikan dengan **20 sub-agen swarming** (4 Domain Captains + 16 Leaf Workers) dan verifikasi zero-trust:
- **Status:** SELESAI & TERVERIFIKASI PENUH (14/14 tests pass, 44/44 total lintas Tahap 1-4).
- **Zero-Regression:** Seluruh rangkaian pengujian theming sebelumnya (`v0_2_6_zero_hardcode_theming.test.ts`, 11/11 tests) tetap lulus 100%.

---

## 2. Arsitektur Komponen & Spesifikasi Teknis

### A. 22px Collapsed Chip Mode (`.target-line-card.chip-collapsed`)
- **Tinggi Keras:** `height: 22px; max-height: 22px; min-height: 22px; padding: 0 8px;`.
- **Elemen Compact:** Menampilkan ikon file code, badge path (`.target-file-badge` dengan `text-overflow: ellipsis`), range badge (`:startLine[-endLine]`), dan tombol dismiss (`.target-btn-dismiss`).
- **Supresi Snippet:** `.target-code-preview` dan `.target-card-actions` di-set `display: none !important; opacity: 0; pointer-events: none;` untuk mencegah visual bleed atau layout reflow.
- **Aksesibilitas:** Menetapkan `role="button"`, `tabindex="0"`, dan `aria-expanded="false"`.

### B. Kinetic Motion 160ms Transition Curve
- **Kurva Transisi:** `160ms cubic-bezier(0.4, 0, 0.2, 1)` (Material / VS Code Standard Fast Motion).
- **Properti yang Dianimasikan:** `max-height`, `border-color`, `background-color`, `box-shadow`.
- **GPU Layer Promotion:** `transform: translateZ(0);` menjamin rendering 60fps tanpa forced synchronous layout thrashing.
- **Mode Expanded (`.target-line-card.chip-expanded`):**
  - Mengembang secara kinetik hingga `max-height: 300px`.
  - Border aktif berubah ke `var(--vscode-focusBorder, #007acc)`.
  - Menampilkan snippet kode (`.target-code-preview`) serta tombol aksi (`.target-btn-reveal` dan `.btn-request-guidance`).

### C. State Machine & Strict Accordion Behavior (`workbench.js`)
- **State Single-Focus:** Menyimpan `expandedTargetId` di tingkat modul.
- **Auto-Collapse Sibling:** Mengklik kartu B otomatis mengempiskan kartu A (`chip-collapsed`) dan memperluas kartu B (`chip-expanded`).
- **Navigasi Keyboard:** Menekan `Enter` atau `Space` (` `) memicu toggle expand/collapse dan lompatan navigasi ke editor Monaco.
- **Event Isolation:** Tombol hapus (`.target-btn-dismiss`), sorot baris (`.target-btn-reveal`), dan tombol panduan (`.btn-request-guidance`) memanggil `e.stopPropagation()` untuk mencegah tabrakan aksi.

### D. Monaco Cursor Telemetry & Screen B Synchronization
- **Sinkronisasi Header Layar B:** Fungsi `updateCursorTelemetry()` kini secara sinkron memperbarui elemen `#screen-b-cursor-pos` (`Ln X, Col Y`) di header Layar B bersamaan dengan status bar Monaco (`#status-cursor-pos`).
- **Breadcrumb Sync:** Memanggil `updateScreenBBreadcrumb(filePath)` untuk memastikan nama file aktif selalu selaras.
- **Webview Iframe Zero-Latency IPC:** Mengirim pesan `postMessage` bertipe `CURSOR_TELEMETRY_UPDATE` ke iframe Layar B (`.secondary-webview-frame`).

---

## 3. Matriks Verifikasi Uji (Vitest)
File pengujian: `packages/antislop-desktop/test/v0_3_0_tahap4_target_stack.test.ts` (14/14 Lulus):

| No | Spesifikasi Pengujian | Hasil |
|---|---|---|
| 1 | `.target-line-card.chip-collapsed` menetapkan batasan tinggi 22px dan clipping overflow | **PASSED** |
| 2 | Mode collapsed menyembunyikan preview snippet dan bar aksi | **PASSED** |
| 3 | `.target-line-card.chip-expanded` mengembang mulus hingga 300px dengan highlight fokus | **PASSED** |
| 4 | Kurva kinetik 160ms cubic-bezier(0.4, 0, 0.2, 1) dan GPU promotion terdefinisi | **PASSED** |
| 5 | Token Monaco parity tanpa hardcoded color pada komponen stack | **PASSED** |
| 6 | Styling scope indicator `#screen-b-cursor-pos` di `workbench.css` | **PASSED** |
| 7 | Struktur breadcrumb header di `index.html` memiliki `#screen-b-cursor-pos` | **PASSED** |
| 8 | Render default kartu target dalam mode `.chip-collapsed` (`aria-expanded="false"`, `tabindex="0"`) | **PASSED** |
| 9 | Klik pada kartu mengalihkan ke `.chip-expanded` dan memanggil `revealTargetInMonaco` | **PASSED** |
| 10 | Klik kedua mengempiskan kartu kembali ke chip 22px | **PASSED** |
| 11 | Auto-collapse sibling cards dalam strict accordion mode | **PASSED** |
| 12 | Navigasi keyboard `Enter` dan `Space` mengalihkan ekspansi kartu | **PASSED** |
| 13 | Tombol dismiss menghapus target tanpa memicu ekspansi kartu atau navigasi Monaco | **PASSED** |
| 14 | Telemetri kursor Monaco menyelaraskan `#screen-b-cursor-pos` dan mengirim IPC ke iframe | **PASSED** |
