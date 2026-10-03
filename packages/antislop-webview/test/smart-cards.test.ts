import { describe, it, expect } from 'vitest';
import {
  SmartCardSchema,
  type SmartCardDTO,
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
} from '@antislop/protocol';

describe('BottomZone: 3-Card Solution Matrix & Engineering Metrics', () => {
  const mockIdiomaticCard: SmartCardDTO = {
    id: 'c0000000-0000-0000-0000-000000000001',
    correlationId: '00000000-0000-0000-0000-000000000001',
    variant: 'idiomatic',
    title: 'Manajemen Kepemilikan Memori dengan RAII & Smart Pointer',
    codeSnippet: 'std::unique_ptr<Buffer> buf = std::make_unique<Buffer>();\n// Memori dibersihkan secara otomatis saat keluar cakupan leksikal',
    whyItWorks: 'Dengan memanfaatkan idiom RAII (Resource Acquisition Is Initialization), destructor std::unique_ptr secara otomatis memanggil deallocator saat objek keluar dari scope.',
    complexity: {
      timeComplexity: 'O(1)',
      spaceComplexity: 'O(1)',
      complexityProof: 'Alokasi dan dealokasi smart pointer membungkus malloc/free dalam waktu konstan O(1) tanpa iterasi tambahan.',
    },
    memoryImpact: {
      allocationType: 'heap',
      heapAllocationsEstimate: '1 alokasi (sizeof(Buffer))',
      stackFrameImpact: 'sizeof(void*) = 8 byte pada call stack',
      gcLifecycleImpact: 'Bukan runtime GC (Native C++ destructor)',
      cacheLocality: 'l1_optimal',
      notes: 'Smart pointer pointer payload tersimpan kontigu dalam cache line L1.',
    },
    languageBreakdown: {
      targetLanguage: 'cpp',
      primaryConstruct: 'std::unique_ptr<T>',
      astNodeType: 'TemplateSpecializationType',
      runtimeMechanism: 'Destructor inlining pada lexical scope exit tanpa virtual dispatch overhead.',
      commonPitfalls: [
        'Memanggil .release() tanpa menyimpan pointer mentah menyebabkan kebocoran memori.',
        'Mengonversi raw pointer ganda ke dua unique_ptr memicu double-free.',
      ],
      learningObjective: 'Menguasai konsep deterministik resource management dalam modern C++.',
    },
    tradeOffs: {
      pros: [
        'Menjamin kekebalan penuh terhadap use-after-free dan double-free.',
        'Zero runtime abstraction overhead dibandingkan raw pointer yang dikelola manual.',
      ],
      cons: [
        'Memerlukan pemahaman konsep move semantics dan non-copyable type.',
      ],
      readability: 'high',
      maintainability: 'high',
      productionSuitability: 'Standar industri C++20 untuk kode kritis produksi.',
    },
  };

  const mockMinimalistCard: SmartCardDTO = {
    id: 'c0000000-0000-0000-0000-000000000002',
    correlationId: '00000000-0000-0000-0000-000000000001',
    variant: 'minimalist',
    title: 'Null Guard Clause & Immediate Pointer Nullification',
    codeSnippet: 'if (buf != NULL) {\n    free(buf);\n    buf = NULL;\n}',
    whyItWorks: 'Menyetel pointer kembali ke NULL segera setelah free() mencegah dereferensi dangling pointer pada baris kode berikutnya.',
    complexity: {
      timeComplexity: 'O(1)',
      spaceComplexity: 'O(1)',
      complexityProof: 'Pemeriksaan pointer dan penulisan NULL adalah operasi register instruksi tunggal O(1).',
    },
    memoryImpact: {
      allocationType: 'zero_alloc',
      heapAllocationsEstimate: '0 alokasi baru',
      stackFrameImpact: '0 byte tambahan',
      gcLifecycleImpact: 'Langsung membebaskan heap chunk glibc',
      cacheLocality: 'unaffected',
      notes: 'Instruksi register CPU tanpa beban alokasi.',
    },
    languageBreakdown: {
      targetLanguage: 'c',
      primaryConstruct: 'Pointer Nullification',
      astNodeType: 'IfStatement',
      runtimeMechanism: 'Menghapus alamat heap dari register/stack variable untuk mencegah use-after-free.',
      commonPitfalls: [
        'Hanya melindungi alias variabel saat ini; alias pointer lain tetap dangling.',
      ],
      learningObjective: 'Memahami prinsip defensive programming pada C tingkat rendah.',
    },
    tradeOffs: [
      'Sangat ringkas dan tidak membutuhkan dependensi eksternal.',
      'Dapat diinjeksi langsung pada kode lama (legacy compatibility).',
    ],
  };

  const mockPerformanceCard: SmartCardDTO = {
    id: 'c0000000-0000-0000-0000-000000000003',
    correlationId: '00000000-0000-0000-0000-000000000001',
    variant: 'performance',
    title: 'Stack-Allocated Arena Buffer Reuse (Zero Dynamic Alloc)',
    codeSnippet: 'char stack_buf[4096];\n// Penggunaan buffer statis lokal call stack tanpa malloc',
    whyItWorks: 'Mengalokasikan memori langsung pada stack frame thread mengeksekusi dalam 1 instruksi mesin (sub rsp, size) tanpa lock heap allocator.',
    complexity: {
      timeComplexity: 'O(1)',
      spaceComplexity: 'O(1) auxiliary',
      complexityProof: 'Modifikasi pointer stack frame SP terjadi dalam 1 siklus CPU O(1).',
    },
    memoryImpact: {
      allocationType: 'stack',
      heapAllocationsEstimate: '0 byte heap',
      stackFrameImpact: '4096 byte pada frame fungsi',
      gcLifecycleImpact: 'Tidak ada tekanan heap sama sekali',
      cacheLocality: 'l1_optimal',
      notes: 'Buffer stack berada pada top-of-stack di L1 cache thread CPU.',
    },
    languageBreakdown: {
      targetLanguage: 'c',
      primaryConstruct: 'Stack-Allocated Fixed Buffer',
      astNodeType: 'VariableDeclaration',
      runtimeMechanism: 'Alokasi stack otomatis di-unwind saat fungsi selesai kembali (epilogue).',
      commonPitfalls: [
        'Ukuran buffer terlalu besar dapat memicu stack overflow pada thread dengan batas stack kecil.',
      ],
      learningObjective: 'Optimalisasi alokasi memori berkecepatan tinggi tanpa interaksi kernel.',
    },
    tradeOffs: {
      pros: [
        'Throughput tertinggi (zero allocation overhead).',
        'Menghilangkan fragmentasi heap secara total.',
      ],
      cons: [
        'Ukuran buffer harus diketahui saat kompilasi atau dibatasi ukuran stack frame.',
      ],
      readability: 'high',
      maintainability: 'medium',
      productionSuitability: 'Direkomendasikan untuk path data throughput tinggi.',
    },
  };

  it('validates Idiomatic, Minimalist, and Performance cards conform to SmartCardSchema', () => {
    expect(SmartCardSchema.safeParse(mockIdiomaticCard).success).toBe(true);
    expect(SmartCardSchema.safeParse(mockMinimalistCard).success).toBe(true);
    expect(SmartCardSchema.safeParse(mockPerformanceCard).success).toBe(true);
  });

  it('strictly validates Big-O Time complexity against BIG_O_TIME_REGEX', () => {
    expect(BIG_O_TIME_REGEX.test(mockIdiomaticCard.complexity.timeComplexity)).toBe(true);
    expect(BIG_O_TIME_REGEX.test(mockMinimalistCard.complexity.timeComplexity)).toBe(true);
    expect(BIG_O_TIME_REGEX.test(mockPerformanceCard.complexity.timeComplexity)).toBe(true);

    // Advanced mathematical forms
    expect(BIG_O_TIME_REGEX.test('O(n log n)')).toBe(true);
    expect(BIG_O_TIME_REGEX.test('O(1) amortized')).toBe(true);
    expect(BIG_O_TIME_REGEX.test('O(n^2)')).toBe(true);

    // Rejects invalid strings
    expect(BIG_O_TIME_REGEX.test('O(1) auxiliary')).toBe(false); // auxiliary is for space!
    expect(BIG_O_TIME_REGEX.test('fast')).toBe(false);
  });

  it('strictly validates Big-O Space complexity against BIG_O_SPACE_REGEX', () => {
    expect(BIG_O_SPACE_REGEX.test(mockIdiomaticCard.complexity.spaceComplexity)).toBe(true);
    expect(BIG_O_SPACE_REGEX.test(mockMinimalistCard.complexity.spaceComplexity)).toBe(true);
    expect(BIG_O_SPACE_REGEX.test(mockPerformanceCard.complexity.spaceComplexity)).toBe(true);

    // Space formats
    expect(BIG_O_SPACE_REGEX.test('O(1) auxiliary')).toBe(true);
    expect(BIG_O_SPACE_REGEX.test('O(n)')).toBe(true);

    // Rejects amortized in space
    expect(BIG_O_SPACE_REGEX.test('O(1) amortized')).toBe(false);
  });

  it('verifies quantitative memory allocation profile properties', () => {
    expect(mockIdiomaticCard.memoryImpact.allocationType).toBe('heap');
    expect(mockIdiomaticCard.memoryImpact.cacheLocality).toBe('l1_optimal');
    expect(mockMinimalistCard.memoryImpact.allocationType).toBe('zero_alloc');
    expect(mockPerformanceCard.memoryImpact.allocationType).toBe('stack');
  });

  it('verifies multi-language syntax breakdown covering primary construct, pitfalls, and objectives', () => {
    expect(mockIdiomaticCard.languageBreakdown.targetLanguage).toBe('cpp');
    expect(mockIdiomaticCard.languageBreakdown.commonPitfalls.length).toBeGreaterThanOrEqual(1);
    expect(mockIdiomaticCard.languageBreakdown.learningObjective.length).toBeGreaterThan(5);

    expect(mockMinimalistCard.languageBreakdown.targetLanguage).toBe('c');
  });

  it('verifies trade-offs supports both structured analysis and string arrays', () => {
    expect(typeof mockIdiomaticCard.tradeOffs).toBe('object');
    expect('pros' in (mockIdiomaticCard.tradeOffs as any)).toBe(true);

    expect(Array.isArray(mockMinimalistCard.tradeOffs)).toBe(true);
    expect((mockMinimalistCard.tradeOffs as string[]).length).toBe(2);
  });
});
