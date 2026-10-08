# STRATEGIC DEEP RESEARCH DOSSIER: NEXT-HORIZON OPPORTUNITIES FOR NSCODE & SCREEN B

## 1. Eksekutif Ringkasan
Setelah menyelesaikan fondasi inti Layar B (Tahap 1–5: Token Parity, Semantic Syntax Highlighting, Single-Scroll 60fps, 22px Target Chip Accordion, dan Full Verification Gate 55/55 tests), eksplorasi **Deep Swarm Research** dengan 20 sub-agen (4 Domain Captains + 16 Leaf Workers) memetakan 4 domain strategis untuk evolusi berikutnya:

1. **Domain 1: Cognitive Workflows & Autonomous Plan Execution** (UX & Flow)
2. **Domain 2: Sub-Millisecond Performance & Virtualization** (Engine & Rendering)
3. **Domain 3: Dynamic Socratic Ladder & Proactive Maieutic Duck** (AI Cognition)
4. **Domain 4: IDE Tooling, LSP Diagnostics & Subagent Cockpit** (Ecosystem Integration)

---

## 2. Matriks Peluang Strategis (Prioritas & ROI)

| Domain | Inisiatif / Fitur | Nilai Tambah (Impact) | Kompleksitas | Rekomendasi Prioritas |
|---|---|---|---|---|
| **Ecosystem** | **LSP Diagnostics Streaming ke Smart Cards** | Mengalirkan error compiler/linter Monaco langsung ke Smart Card Layar B secara real-time. | Rendah | **P1 (Quick Win)** |
| **Cognition** | **Proactive Maieutic Duck Nudge** | Bebek Sokratik menyapa otomatis saat mendeteksi 3x test failure beruntun atau rapid churn. | Rendah | **P1 (Quick Win)** |
| **Workflow** | **Autonomous Plan Mode Subtask Runner** | Menjalankan subtask plan satu per satu dengan progress bar, test verification, & rollback. | Sedang | **P2 (High Value)** |
| **Engine** | **Telemetry Throttle (16ms rAF clamp)** | Menghindari banjir `postMessage` saat scroll cepat pada 10.000 baris kode. | Rendah | **P2 (Stability)** |
| **Workflow** | **Review Mode Interactive Hunk Staging** | Menerima/menolak perubahan diff per-hunk atau per-baris langsung dari Layar B. | Sedang | **P3 (Feature)** |
| **Workflow** | **IndexedDB Multi-Thread Chat Persistence** | Riwayat percakapan persisten, pencarian riwayat obrolan, dan ekspor ke Markdown. | Sedang | **P3 (Feature)** |
| **Engine** | **Virtualization pada CodePreview (>500 baris)** | Windowing baris diff raksasa untuk mempertahankan 60fps saat rendering file besar. | Tinggi | **P4 (Scale)** |
| **AI / Edge** | **Local WebLLM / ONNX Sidecar Fallback** | AI offline ultra-cepat (Qwen 2.5 Coder 0.5B/1.5B via WebGPU) untuk autokomplet instan 0-latency. | Tinggi | **P5 (Long Horizon)** |

---

## 3. Rincian Teknis per Domain

### A. Domain 1: Cognitive Workflows & Autonomous Plan Execution
- **Latar Masalah:** Layar B saat ini memiliki Plan Mode (`createTaskPlan`, `renderPlanPane`) dan Review Mode, tetapi eksekusi subtask masih memerlukan intervensi manual langkah demi langkah.
- **Rekomendasi Solusi:**
  1. **Subtask Auto-Executor:** Tombol *"Jalankan Rencana"* yang secara otomatis mengeksekusi subtask `in_progress`, memverifikasi hasil dengan test runner lokal, dan menandai `completed` atau `failed` dengan rollback transaksi.
  2. **Enriched Prompt Envelope:** Tambahkan lingkup AST sekitar kursor (surrounding function/class scope) dan ringkasan `git status` langsung ke dalam prompt envelope (`buildScreenBPromptEnvelope`) agar LLM memiliki konteks penuh tanpa harus manual copy-paste.
  3. **Multi-Thread Chat Persistence:** Simpan riwayat percakapan di `IndexedDB` dengan skema `conversations` dan `messages`, dilengkapi fitur ekspor Markdown satu klik.

### B. Domain 2: Sub-Millisecond Performance & Virtualization
- **Latar Masalah:** Target stack dan CodePreview saat ini menggunakan rendering DOM standar. Jika terdapat >100 target atau diff >1.000 baris, browser berpotensi mengalami layout thrashing.
- **Rekomendasi Solusi:**
  1. **Telemetry rAF Throttling:** Pada `updateCursorTelemetry()`, gunakan throttling berbasis `requestAnimationFrame` (16ms) agar event `postMessage` ke iframe dibatasi ke 60 frame per detik, menghemat siklus CPU saat pengguna scrolling cepat.
  2. **`content-visibility: auto` pada Target Stack:** Terapkan properti CSS native `content-visibility: auto; contain-intrinsic-size: 22px;` pada kartu target line untuk mengeliminasi beban rendering elemen off-screen tanpa dependensi npm tambahan.
  3. **CodePreview Windowing Threshold:** Tambahkan limit rendering virtualisasi sederhana (hanya merender 40 baris di viewport) jika `lineCount > 500`.

### C. Domain 3: Dynamic Socratic Ladder & Proactive Maieutic Duck
- **Latar Masalah:** Socratic Gate dan Maieutic Duck saat ini bekerja berdasarkan tantangan eksplisit atau template generik.
- **Rekomendasi Solusi:**
  1. **Proactive Intervention Triggers:**
     - *Failure Loop:* 3 kali kegagalan pengujian berturut-turut dalam 60 detik memicu Duck muncul dengan pertanyaan pemandu (misal: *"Saya melihat pengujian boundary case gagal di baris 42. Apa asumsi tipe data yang belum terpenuhi?"*).
     - *Frustration / Churn Loop:* Penghapusan dan penulisan ulang berulang pada blok kode yang sama.
  2. **AST-Driven Anti-Pattern Scanner:** Deteksi ringan (regex/AST heuristics) untuk anti-slop violations:
     - Catch block kosong (`catch (e) {}` swallows).
     - Komentar placeholder generik (`// TODO: implement`).
     - Hardcoded credentials / API key.
  3. **3-Level Socratic Ladder:**
     - *Tingkat 1 (Socratic Question):* Memandu pemahaman invarian.
     - *Tingkat 2 (Scaffolding / Pseudo-code):* Memberikan kerangka kerja logika.
     - *Tingkat 3 (Code Solution):* Memberikan patch konkret jika developer benar-benar menemui jalan buntu.

### D. Domain 4: IDE Tooling & Sub-Agent Cockpit
- **Latar Masalah:** Status aktivitas agen dan diagnostik linter masih terpisah antara panel editor Monaco dan Layar B.
- **Rekomendasi Solusi:**
  1. **LSP Diagnostics Smart Cards:** Sambungkan event `monaco.editor.onDidChangeMarkers` untuk secara otomatis mengisi Layar B dengan kartu diagnostik (Error / Warning) yang dapat diklik langsung untuk menuju baris bersangkutan.
  2. **Sub-Agent Swarm Cockpit:** Visualisasi status multi-agen real-time di header Layar B (menampilkan agen yang sedang bekerja, model tier yang aktif: `flash_lite` vs `flash`, dan sisa token budget).
  3. **Git Status & Branch Pill:** Indikator cabang git aktif dan jumlah uncommitted hunks di samping breadcrumb workspace.
