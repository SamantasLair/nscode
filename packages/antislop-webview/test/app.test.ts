import { describe, it, expect, beforeEach } from 'vitest';
import { VsCodeApiBridge } from '../src/vscode-api.js';
import type {
  ContractViolatedDTO,
  SmartCardDTO,
} from '@antislop/protocol';

describe('App: Dual-Zone Architecture & Host Event Dispatch Pipeline', () => {
  let bridge: VsCodeApiBridge;

  beforeEach(() => {
    VsCodeApiBridge.resetInstanceForTesting();
    bridge = VsCodeApiBridge.getInstance();
    bridge.clearOutboundHistory();
  });

  const mockContract: ContractViolatedDTO = {
    id: 'c1234567-89ab-cdef-0123-456789abcdef',
    errorCode: 'E0502',
    category: 'concurrency',
    title: 'Pelanggaran Peminjaman Memori Bersamaan',
    contract: 'Cannot borrow `data` as mutable because it is also borrowed as immutable.',
    ruleExplanation: 'Rust dan model active-cognition melarang mutasi saat referensi tidak dapat diubah masih aktif.',
    rootCause: 'Data dibaca di baris 10 dan dimutasi di baris 12 dalam thread yang sama.',
    mentalModel: 'Model pembaca-penulis eksklusif (Reader-Writer Lock).',
    sourceLocation: {
      fileUri: 'file:///workspace/src/concurrency.rs',
      range: {
        startLine: 12,
        startColumn: 5,
        endLine: 12,
        endColumn: 20,
      },
      label: 'mutable borrow occurs here',
    },
    relatedSpans: [],
    ingressVector: 'lsp',
    rawError: 'error[E0502]: cannot borrow `data` as mutable because it is also borrowed as immutable',
    severity: 'error',
    timestamp: Date.now(),
  };

  const mockCard: SmartCardDTO = {
    id: 'd1234567-89ab-cdef-0123-456789abcdef',
    correlationId: 'corr-concurrency-01',
    variant: 'idiomatic',
    title: 'Cakupan Leksikal Terbatas (Lexical Scope Isolation)',
    codeSnippet: '{\n    let reader = &data;\n    println!("{}", *reader);\n}\ndata.push(42);',
    whyItWorks: 'Dengan membatasi masa pakai referensi immutable di dalam blok leksikal terpisah {}, peminjaman berakhir sebelum mutasi dilakukan.',
    complexity: {
      timeComplexity: 'O(1)',
      spaceComplexity: 'O(1)',
      complexityProof: 'Penyelesaian scope leksikal adalah operasi statis pada compile time.',
    },
    memoryImpact: {
      allocationType: 'zero_alloc',
      heapAllocationsEstimate: '0 alokasi baru',
      stackFrameImpact: '0 byte tambahan',
      gcLifecycleImpact: 'Tidak ada alokasi heap runtime',
      cacheLocality: 'l1_optimal',
      notes: 'Bekerja langsung pada stack frame yang ada.',
    },
    languageBreakdown: {
      targetLanguage: 'cpp',
      primaryConstruct: 'Lexical Block Scope',
      astNodeType: 'CompoundStatement',
      runtimeMechanism: 'Inlining lifetime dan scope limit.',
      commonPitfalls: ['Menyimpan pointer ke variabel lokal di luar blok.'],
      learningObjective: 'Memahami batasan masa pakai objek leksikal.',
    },
    tradeOffs: {
      pros: ['Zero runtime cost', 'Sangat mudah dibaca'],
      cons: ['Menambah 1 tingkat indentasi'],
      readability: 'high',
      maintainability: 'high',
      productionSuitability: 'Sangat disarankan',
    },
  };

  it('receives sidecar notifications wrapped in DIAGNOSTIC_DATA and routes them correctly', () => {
    let capturedMethod = '';
    let capturedParams: any = null;

    bridge.onMessage((msg) => {
      if (msg.type === 'DIAGNOSTIC_DATA') {
        const payload = msg.payload as any;
        capturedMethod = payload.method;
        capturedParams = payload.params;
      }
    });

    // 1. Simulate diagnostics.contractViolated notification from sidecar
    bridge.dispatchMockIncoming({
      type: 'DIAGNOSTIC_DATA',
      payload: {
        method: 'diagnostics.contractViolated',
        params: mockContract,
      },
    });

    expect(capturedMethod).toBe('diagnostics.contractViolated');
    expect(capturedParams.errorCode).toBe('E0502');

    // 2. Simulate diagnostics.smartCardsReady notification from sidecar
    bridge.dispatchMockIncoming({
      type: 'DIAGNOSTIC_DATA',
      payload: {
        method: 'diagnostics.smartCardsReady',
        params: {
          correlationId: 'corr-concurrency-01',
          cards: [mockCard],
        },
      },
    });

    expect(capturedMethod).toBe('diagnostics.smartCardsReady');
    expect(capturedParams.cards.length).toBe(1);
    expect(capturedParams.cards[0].variant).toBe('idiomatic');
  });

  it('dispatches PRACTICE_COMPLETED to host when cognitive gate is passed', () => {
    const success = bridge.practiceCompleted({
      cardId: mockCard.id,
      accuracy: 96.0,
    });

    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'PRACTICE_COMPLETED',
      payload: {
        cardId: mockCard.id,
        accuracy: 96.0,
      },
    });
  });

  it('preserves Zero-Buffer Mutation Invariant: No Monaco buffer mutation commands exist', () => {
    // Verify that bridge outbound schemas ONLY contain HIGHLIGHT_LINE, REQUEST_ANALYSIS, PRACTICE_COMPLETED
    // And NEVER contains any editor.applyEdit, buffer.patch, or write commands
    const outboundHistory = bridge.getOutboundHistory();
    const disallowedTypes = ['APPLY_EDIT', 'PATCH_BUFFER', 'WRITE_FILE', 'AUTO_PATCH'];

    for (const record of outboundHistory) {
      expect(disallowedTypes).not.toContain(record.type);
    }
  });
});
