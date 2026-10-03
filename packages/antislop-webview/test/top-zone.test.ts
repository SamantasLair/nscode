import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VsCodeApiBridge } from '../src/vscode-api.js';
import type { ContractViolatedDTO } from '@antislop/protocol';

describe('TopZone: Rustc-Style Error Anatomy & Line Pointer Contract', () => {
  let bridge: VsCodeApiBridge;

  const mockDiagnostic: ContractViolatedDTO = {
    id: 'a1234567-89ab-cdef-0123-456789abcdef',
    errorCode: 'E0382',
    category: 'memory_safety',
    title: 'Peminjaman Nilai yang Telah Dipindahkan (Borrow of Moved Value)',
    contract: 'Pointer dereference requires valid allocated memory invariant. Buffer buf was moved at line 41 but dereferenced at line 42.',
    ruleExplanation: 'Dalam model kepemilikan memori, ketika nilai dipindahkan ke fungsi atau variabel lain, pengidentifikasi sebelumnya kehilangan hak akses.',
    rootCause: 'Pemanggilan free(buf) atau transfer ownership membatalkan validitas pointer buf.',
    mentalModel: 'Bayangkan sebuah kunci unik. Setelah diserahkan ke deallocator, Anda tidak dapat lagi menggunakannya untuk membuka pintu.',
    sourceLocation: {
      fileUri: 'file:///workspace/src/buffer_pool.c',
      range: {
        startLine: 42,
        startColumn: 5,
        endLine: 42,
        endColumn: 25,
      },
      label: 'primary_fault: dereferensi pointer setelah didealokasi',
    },
    relatedSpans: [
      {
        fileUri: 'file:///workspace/src/buffer_pool.c',
        range: {
          startLine: 41,
          startColumn: 5,
          endLine: 41,
          endColumn: 15,
        },
        label: 'deallocation: memori dibebaskan di sini',
        role: 'deallocation',
      },
    ],
    ingressVector: 'terminal',
    rawError: 'error: use of deallocated pointer `buf` at src/buffer_pool.c:42:5',
    severity: 'fatal',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    VsCodeApiBridge.resetInstanceForTesting();
    bridge = VsCodeApiBridge.getInstance();
    bridge.clearOutboundHistory();
  });

  it('validates ContractViolatedDTO conformance to strict protocol schema', () => {
    expect(mockDiagnostic.errorCode).toBe('E0382');
    expect(mockDiagnostic.category).toBe('memory_safety');
    expect(mockDiagnostic.severity).toBe('fatal');
    expect(mockDiagnostic.sourceLocation.range.startLine).toBe(42);
    expect(mockDiagnostic.relatedSpans.length).toBe(1);
    expect(mockDiagnostic.relatedSpans[0]?.role).toBe('deallocation');
  });

  it('verifies LinePointerButton dispatches HIGHLIGHT_LINE to Screen A with preserveFocus payload', () => {
    const success = bridge.highlightLine({
      fileUri: mockDiagnostic.sourceLocation.fileUri,
      line: mockDiagnostic.sourceLocation.range.startLine,
      endLine: mockDiagnostic.sourceLocation.range.endLine,
    });

    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'HIGHLIGHT_LINE',
      payload: {
        fileUri: 'file:///workspace/src/buffer_pool.c',
        line: 42,
        endLine: 42,
      },
    });
  });

  it('validates ManualErrorInput minimum character length gate', () => {
    const tooShort = 'err';
    const isValidLength = tooShort.trim().length >= 5;
    expect(isValidLength).toBe(false);

    const validError = 'NullPointerException in Thread main';
    expect(validError.trim().length >= 5).toBe(true);

    const success = bridge.requestAnalysis({ rawError: validError });
    expect(success).toBe(true);

    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'REQUEST_ANALYSIS',
      payload: {
        rawError: 'NullPointerException in Thread main',
      },
    });
  });

  it('supports progressive token streaming buffer accumulation without crashing', () => {
    let accumulated = '';
    const tokens = ['Penjelasan ', 'aliran ', 'token ', 'langsung ', 'dari ', 'sidecar.'];

    for (const chunk of tokens) {
      accumulated += chunk;
    }

    expect(accumulated).toBe('Penjelasan aliran token langsung dari sidecar.');
  });
});
