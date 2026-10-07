import { describe, it, expect } from 'vitest';
import {
  READ_ONLY_RPC_METHODS,
  READ_ONLY_METHODS,
  isReadOnlyRpcMethod,
  isReadOnlyMethod,
  validateIncomingRequest,
  createMethodNotFoundError,
  AnalyzeErrorParamsSchema,
  GetTerminalBufferParamsSchema,
  ActiveBufferResultSchema,
  TokenChunkParamsSchema,
  ContractViolatedNotificationParamsSchema,
  SmartCardsReadyNotificationParamsSchema,
  ContractViolatedSchema,
  TextSpanRangeSchema,
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
  ComplexityMetricSchema,
  MemoryImpactSchema,
  SmartCardSchema,
  ClozeChallengeSchema,
  TypeAlongPracticeSchema,
  CognitiveFrictionSessionSchema,
  transitionGateSession,
  type CognitiveFrictionSessionDTO,
  WebviewToExtensionMessageSchema,
  ExtensionToWebviewMessageSchema,
  BridgeWireCoordinatesSchema,
  BridgeWireSplinePathSchema,
  computeBridgeWireSpline,
  FalsificationDomainSchema,
  FalsificationCaseSchema,
  PopperGateReportSchema,
  MaieuticPhaseSchema,
  MaieuticContextEnvelopeSchema,
  MaieuticResponseSchema,
} from '../src/index.js';

describe('packages/antislop-protocol: Unit Test Suite', () => {
  describe('1. JSON-RPC 2.0 Framing & Read-Only Whitelist', () => {
    it('verifies exactly 6 read-only methods are whitelisted', () => {
      expect(READ_ONLY_RPC_METHODS).toHaveLength(6);
      expect(READ_ONLY_RPC_METHODS).toEqual([
        'rpc.ping',
        'diagnostics.analyzeError',
        'context.getActiveBuffer',
        'context.getTerminalBuffer',
        'context.getGitDiff',
        'context.getLspDiagnostics',
      ]);
      expect(READ_ONLY_METHODS).toEqual(READ_ONLY_RPC_METHODS);
    });

    it('identifies whitelisted methods correctly via guards', () => {
      for (const method of READ_ONLY_RPC_METHODS) {
        expect(isReadOnlyRpcMethod(method)).toBe(true);
        expect(isReadOnlyMethod(method)).toBe(true);
      }
      expect(isReadOnlyRpcMethod('file.write')).toBe(false);
      expect(isReadOnlyRpcMethod('buffer.patch')).toBe(false);
      expect(isReadOnlyRpcMethod('system.exec')).toBe(false);
    });

    it('accepts valid incoming read-only requests', () => {
      const validReq = {
        jsonrpc: '2.0',
        id: 'req-001',
        method: 'rpc.ping',
        params: { timestamp: Date.now() },
      };
      const result = validateIncomingRequest(validReq);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.method).toBe('rpc.ping');
        expect(result.request.id).toBe('req-001');
      }
    });

    it('rejects malformed requests lacking required JSON-RPC 2.0 fields', () => {
      const badReq = { id: 1, params: {} };
      const result = validateIncomingRequest(badReq);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorResponse.error.code).toBe(-32600);
      }
    });

    it('strictly rejects write and patch mutation methods with error code -32601', () => {
      const mutationMethods = [
        'file.write',
        'buffer.patch',
        'editor.applyEdit',
        'workspace.applyEdit',
        'fs.writeFile',
        'system.exec',
        'terminal.sendText',
        'ide.autoPatch',
      ];

      for (const method of mutationMethods) {
        const req = {
          jsonrpc: '2.0',
          id: `mut-${method}`,
          method,
          params: { path: 'src/main.ts', text: 'illegal patch' },
        };
        const result = validateIncomingRequest(req);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorResponse.error.code).toBe(-32601);
          expect(result.errorResponse.error.message).toContain(
            'write/mutation operations are strictly prohibited'
          );
          expect(
            (result.errorResponse.error.data as any).zeroMutationInvariant
          ).toBe(true);
          expect((result.errorResponse.error.data as any).method).toBe(method);
        }
      }
    });

    it('generates well-formed method not found error payloads', () => {
      const err = createMethodNotFoundError('test-id', 'buffer.patch');
      expect(err.jsonrpc).toBe('2.0');
      expect(err.id).toBe('test-id');
      expect(err.error.code).toBe(-32601);
      expect(err.error.data?.zeroMutationInvariant).toBe(true);
      expect(err.error.data?.method).toBe('buffer.patch');
    });

    it('validates parameter and result schemas', () => {
      expect(
        AnalyzeErrorParamsSchema.safeParse({
          errorTrace: 'Segfault at 0x0',
          source: 'terminal',
          languageId: 'cpp',
        }).success
      ).toBe(true);

      expect(
        AnalyzeErrorParamsSchema.safeParse({
          errorTrace: '',
          source: 'terminal',
        }).success
      ).toBe(false);

      expect(
        GetTerminalBufferParamsSchema.safeParse({ lines: 250 }).success
      ).toBe(true);
      expect(
        GetTerminalBufferParamsSchema.safeParse({ lines: 99999 }).success
      ).toBe(false);

      const activeBuffer = {
        uri: 'file:///workspace/src/app.py',
        fileName: 'app.py',
        languageId: 'python',
        content: 'print("hello world")',
        version: 1,
        isDirty: false,
        lineCount: 1,
      };
      expect(ActiveBufferResultSchema.safeParse(activeBuffer).success).toBe(true);

      const tokenChunk = {
        correlationId: 'c-1',
        token: 'def foo():',
        targetZone: 'top_contract',
        sequenceNumber: 0,
      };
      expect(TokenChunkParamsSchema.safeParse(tokenChunk).success).toBe(true);

      const contractNotification = {
        correlationId: 'c-1',
        contractViolated: 'Type Contract Violated',
        rule: 'TS2322',
        brokenInvariant: 'Type string is not assignable to type number',
        explanation: 'Assigned text to integer variable',
        targetFile: 'src/index.ts',
        targetRange: {
          startLine: 10,
          startColumn: 1,
          endLine: 10,
          endColumn: 15,
        },
        languageId: 'typescript',
      };
      expect(
        ContractViolatedNotificationParamsSchema.safeParse(contractNotification)
          .success
      ).toBe(true);
    });
  });

  describe('2. Error Anatomy & Contract Violations', () => {
    it('validates compliant ContractViolatedDTO', () => {
      const validContract = {
        id: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
        errorCode: 'CPP_USE_AFTER_FREE',
        category: 'memory_safety',
        title: 'Use-After-Free: Pointer Dereferenced After Deallocation',
        contract:
          'Memory Safety Invariant Broken: A memory block released back to allocator must not be dereferenced.',
        ruleExplanation:
          'When heap memory is deallocated, referencing it constitutes Undefined Behavior.',
        rootCause:
          'At line 42 pointer was deleted; at line 48 member was accessed.',
        mentalModel:
          'Hotel Room Key Metaphor: Using key after checkout accesses reclaimed room.',
        sourceLocation: {
          fileUri: 'file:///workspace/src/main.cpp',
          range: {
            startLine: 48,
            startColumn: 9,
            endLine: 48,
            endColumn: 28,
          },
          label: 'Dangling pointer access here',
        },
        relatedSpans: [
          {
            range: {
              startLine: 42,
              startColumn: 5,
              endLine: 42,
              endColumn: 25,
            },
            label: 'Deallocation occurred here',
            role: 'deallocation',
          },
        ],
        ingressVector: 'terminal',
        rawError: 'AddressSanitizer: heap-use-after-free at line 48',
        severity: 'fatal',
        timestamp: Date.now(),
      };

      const parse = ContractViolatedSchema.safeParse(validContract);
      expect(parse.success).toBe(true);
    });

    it('rejects inverted or invalid line ranges in TextSpanRangeSchema', () => {
      // endLine < startLine
      const invertedRange = {
        startLine: 20,
        startColumn: 5,
        endLine: 10,
        endColumn: 10,
      };
      expect(TextSpanRangeSchema.safeParse(invertedRange).success).toBe(false);

      // same line but endColumn < startColumn
      const invertedCol = {
        startLine: 10,
        startColumn: 20,
        endLine: 10,
        endColumn: 5,
      };
      expect(TextSpanRangeSchema.safeParse(invertedCol).success).toBe(false);
    });
  });

  describe('3. Smart Cards & Quantitative Metrics', () => {
    it('validates Big-O regex constraints', () => {
      const validTimeComplexities = [
        'O(1)',
        'O(n)',
        'O(log n)',
        'O(n log n)',
        'O(n^2)',
        'O(n + k)',
        'O(1 amortized)',
      ];
      for (const tc of validTimeComplexities) {
        expect(BIG_O_TIME_REGEX.test(tc)).toBe(true);
      }

      const invalidTimeComplexities = [
        'fast',
        'linear',
        'O',
        'O()',
        'O(n) + O(1)',
      ];
      for (const tc of invalidTimeComplexities) {
        expect(BIG_O_TIME_REGEX.test(tc)).toBe(false);
      }

      const validSpaceComplexities = [
        'O(1)',
        'O(n)',
        'O(k)',
        'O(1 auxiliary)',
      ];
      for (const sc of validSpaceComplexities) {
        expect(BIG_O_SPACE_REGEX.test(sc)).toBe(true);
      }
    });

    it('validates full SmartCardDTO with 3 solution variants', () => {
      const variants = ['idiomatic', 'minimalist', 'performance'] as const;

      for (const variant of variants) {
        const card = {
          id: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
          correlationId: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
          variant,
          title: `Solution ${variant}`,
          codeSnippet: 'auto ptr = std::make_unique<int>(42);',
          whyItWorks: 'RAII binds memory lifecycle to object scope.',
          complexity: {
            timeComplexity: 'O(1)',
            spaceComplexity: 'O(1 auxiliary)',
            complexityProof: 'Allocation executes in single allocator step O(1).',
          },
          memoryImpact: {
            allocationType: 'heap',
            heapAllocationsEstimate: '1',
            stackFrameImpact: '8-byte smart pointer wrapper',
            gcLifecycleImpact: 'Deterministic destruction upon scope exit',
            cacheLocality: 'sequential_stride',
            notes: 'Zero GC overhead; RAII deterministic release',
          },
          languageBreakdown: {
            targetLanguage: 'cpp',
            primaryConstruct: 'std::unique_ptr<T>',
            runtimeMechanism: 'Inlined destructor calls delete on scope exit.',
            commonPitfalls: ['Calling .release() without storing raw pointer leaks'],
            learningObjective: 'Master modern C++ RAII resource management',
          },
          tradeOffs: {
            pros: ['Eliminates leaks', 'Deterministic cleanup'],
            cons: ['Cannot be shared without shared_ptr'],
            readability: 'high',
            maintainability: 'high',
            productionSuitability: 'Modern C++ standard best practice',
          },
        };

        const result = SmartCardSchema.safeParse(card);
        expect(result.success).toBe(true);
      }
    });

    it('rejects SmartCardDTO with non-compliant Big-O or missing metrics', () => {
      const invalidCard = {
        id: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        correlationId: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
        variant: 'idiomatic',
        title: 'Invalid Big-O Card',
        codeSnippet: 'foo()',
        whyItWorks: 'Just works',
        complexity: {
          timeComplexity: 'ultra-fast', // Invalid Big-O!
          spaceComplexity: 'O(1)',
          complexityProof: 'short proof',
        },
        memoryImpact: {
          allocationType: 'heap',
          heapAllocationsEstimate: '1',
          stackFrameImpact: 'minimal',
          gcLifecycleImpact: 'none',
          cacheLocality: 'l1_optimal',
          notes: 'notes',
        },
        languageBreakdown: {
          targetLanguage: 'python',
          primaryConstruct: 'with open(...)',
          runtimeMechanism: 'Context manager protocol',
          commonPitfalls: ['Unclosed descriptors'],
          learningObjective: 'Resource hygiene',
        },
        tradeOffs: {
          pros: ['Clean'],
          cons: ['None'],
          readability: 'high',
          maintainability: 'high',
          productionSuitability: 'Standard',
        },
      };

      const result = SmartCardSchema.safeParse(invalidCard);
      expect(result.success).toBe(false);
    });
  });

  describe('4. Cognitive Friction Gate & Anti-Atrophy Invariants', () => {
    it('validates ClozeChallenge schema and blank token requirements', () => {
      const cloze = {
        challengeId: '8e9f0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b',
        cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        maskedSnippet: 'auto buf = std::<<BLANK_0>><uint8_t[]>(size);',
        blanks: [
          {
            id: 'b0',
            index: 0,
            token: 'make_unique',
            hint: 'C++14 smart pointer factory',
            distractors: ['make_shared', 'alloc', 'malloc'],
            category: 'method_call',
            unmasked: false,
          },
        ],
        unmaskMode: 'sequential',
        maxAttemptsPerBlank: 3,
        penaltyCooldownMs: 1500,
        revealAfterFailures: true,
      };

      expect(ClozeChallengeSchema.safeParse(cloze).success).toBe(true);
    });

    it('strictly enforces anti-paste invariant on TypeAlongPractice (allowPaste: false)', () => {
      const validPractice = {
        practiceId: '9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
        cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        prompt: 'Type the smart pointer initialization:',
        targetKeystrokes: 'auto buf = std::make_unique<uint8_t[]>(size);',
        languageId: 'cpp',
        minAccuracyPercent: 95.0,
        maxAllowedErrors: 2,
        allowPaste: false,
        caseSensitive: true,
      };
      expect(TypeAlongPracticeSchema.safeParse(validPractice).success).toBe(true);

      const invalidPractice = {
        ...validPractice,
        allowPaste: true, // Forbidden! Must be literal false
      };
      expect(TypeAlongPracticeSchema.safeParse(invalidPractice).success).toBe(false);
    });

    it('strictly enforces Golden Invariant: directAutoPatchAllowed is immutable false', () => {
      const sessionAttemptingAutoPatch = {
        sessionId: '9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
        cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        status: 'UNLOCKED',
        clozeSolved: true,
        typeAlongSolved: true,
        clipboardUnlocked: true,
        directAutoPatchAllowed: true, // Violation of Golden Invariant!
        clozeAttempts: 1,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(sessionAttemptingAutoPatch);
      expect(result.success).toBe(false);
    });

    it('enforces clipboard locked unless status is UNLOCKED', () => {
      const illegalPrematureCopy = {
        sessionId: '9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
        cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: true, // Illegal when LOCKED!
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(illegalPrematureCopy);
      expect(result.success).toBe(false);
    });

    it('executes valid state machine transitions through transitionGateSession', () => {
      let session: CognitiveFrictionSessionDTO = {
        sessionId: '9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
        cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };

      session = transitionGateSession(session, { type: 'START_CLOZE' });
      expect(session.status).toBe('CLOZE_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, { type: 'CLOZE_COMPLETED' });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);
      expect(session.clipboardUnlocked).toBe(true);

      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });
      expect(session.status).toBe('TYPE_ALONG_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 98.5,
      });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);
      expect(session.typeAlongSolved).toBe(true);
      expect(session.typeAlongAccuracy).toBe(98.5);
      expect(session.clipboardUnlocked).toBe(true);
      expect(session.directAutoPatchAllowed).toBe(false); // Inviolable!

      // Assert parsed by Zod schema
      expect(CognitiveFrictionSessionSchema.safeParse(session).success).toBe(true);
    });
  });

  describe('5. Webview & Extension Message Protocol', () => {
    it('validates HIGHLIGHT_LINE message from Webview', () => {
      const msg = {
        type: 'HIGHLIGHT_LINE',
        payload: {
          fileUri: 'file:///workspace/src/app.ts',
          line: 42,
          endLine: 45,
        },
      };
      expect(WebviewToExtensionMessageSchema.safeParse(msg).success).toBe(true);
    });

    it('validates REQUEST_ANALYSIS and PRACTICE_COMPLETED messages', () => {
      const reqAnalysis = {
        type: 'REQUEST_ANALYSIS',
        payload: { rawError: 'Segmentation fault' },
      };
      expect(
        WebviewToExtensionMessageSchema.safeParse(reqAnalysis).success
      ).toBe(true);

      const practiceDone = {
        type: 'PRACTICE_COMPLETED',
        payload: { cardId: 'c-101', accuracy: 96.0 },
      };
      expect(
        WebviewToExtensionMessageSchema.safeParse(practiceDone).success
      ).toBe(true);

      const collapseScreenB = {
        type: 'COLLAPSE_SCREEN_B',
        payload: {},
      };
      expect(
        WebviewToExtensionMessageSchema.safeParse(collapseScreenB).success
      ).toBe(true);
    });

    it('validates Extension to Webview messages', () => {
      const setActive = {
        type: 'SET_ACTIVE_FILE',
        payload: { fileUri: 'file:///workspace/main.c', languageId: 'c' },
      };
      expect(
        ExtensionToWebviewMessageSchema.safeParse(setActive).success
      ).toBe(true);

      const watchdog = {
        type: 'WATCHDOG_STATUS',
        payload: { connected: true, latencyMs: 4.2 },
      };
      expect(
        ExtensionToWebviewMessageSchema.safeParse(watchdog).success
      ).toBe(true);
    });
  });

  describe('6. Iteration 2: Schema Alignments & Notification Typing', () => {
    const sampleCard = {
      id: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
      correlationId: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
      variant: 'idiomatic' as const,
      title: 'Idiomatic Resource Management',
      codeSnippet: 'std::unique_ptr<int> p = std::make_unique<int>(42);',
      whyItWorks: 'RAII binds memory lifecycle to lexical scope.',
      complexity: {
        timeComplexity: 'O(1)',
        spaceComplexity: 'O(1)',
        complexityProof: 'Direct allocation requires single step.',
      },
      memoryImpact: {
        allocationType: 'heap' as const,
        heapAllocationsEstimate: '1',
        stackFrameImpact: '8-byte pointer',
        gcLifecycleImpact: 'Immediate destruction on scope exit',
        cacheLocality: 'l1_optimal' as const,
        notes: 'Zero runtime overhead.',
      },
      languageBreakdown: {
        targetLanguage: 'cpp' as const,
        primaryConstruct: 'std::unique_ptr',
        runtimeMechanism: 'Inlined destructor',
        commonPitfalls: ['Manual delete call'],
        learningObjective: 'Master RAII',
      },
      tradeOffs: [
        'Guarantees leak-free lifecycle',
        'Exclusive ownership semantics',
      ],
    };

    describe('SmartCardSchema tradeOffs union', () => {
      it('accepts string[] tradeOffs per PROJECT.md interface contract', () => {
        const cardWithStringTradeOffs = {
          ...sampleCard,
          tradeOffs: ['Clean syntax', 'Predictable memory footprint'],
        };
        const result = SmartCardSchema.safeParse(cardWithStringTradeOffs);
        expect(result.success).toBe(true);
      });

      it('accepts structured TradeOffAnalysisDTO object', () => {
        const cardWithStructuredTradeOffs = {
          ...sampleCard,
          tradeOffs: {
            pros: ['Deterministic destruction'],
            cons: ['Non-copyable'],
            readability: 'high' as const,
            maintainability: 'high' as const,
            productionSuitability: 'Modern industry standard',
          },
        };
        const result = SmartCardSchema.safeParse(cardWithStructuredTradeOffs);
        expect(result.success).toBe(true);
      });

      it('rejects invalid tradeOffs types (e.g. number or boolean)', () => {
        const invalidCard = { ...sampleCard, tradeOffs: 42 };
        expect(SmartCardSchema.safeParse(invalidCard).success).toBe(false);
      });
    });

    describe('SmartCardSchema optional inline clozeChallenge', () => {
      it('accepts card with fully-formed inline clozeChallenge', () => {
        const cardWithCloze = {
          ...sampleCard,
          clozeChallenge: {
            challengeId: '8e9f0a1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b',
            cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
            maskedSnippet: 'auto ptr = std::<<BLANK_0>><int>(42);',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'make_unique',
                hint: 'Factory function for unique_ptr',
                distractors: ['make_shared', 'malloc', 'alloc'],
                category: 'method_call' as const,
                unmasked: false,
              },
            ],
            unmaskMode: 'sequential' as const,
            maxAttemptsPerBlank: 3,
            penaltyCooldownMs: 1500,
            revealAfterFailures: true,
          },
        };
        const result = SmartCardSchema.safeParse(cardWithCloze);
        expect(result.success).toBe(true);
      });

      it('accepts card when clozeChallenge is omitted (optional field)', () => {
        const cardWithoutCloze = { ...sampleCard };
        delete (cardWithoutCloze as any).clozeChallenge;
        expect(SmartCardSchema.safeParse(cardWithoutCloze).success).toBe(true);
      });

      it('rejects card with malformed inline clozeChallenge', () => {
        const cardWithBadCloze = {
          ...sampleCard,
          clozeChallenge: {
            challengeId: 'not-a-uuid',
            cardId: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
            maskedSnippet: '',
            blanks: [],
          },
        };
        expect(SmartCardSchema.safeParse(cardWithBadCloze).success).toBe(false);
      });
    });

    describe('JSON-RPC Notification Typed Schemas', () => {
      it('validates SmartCardsReadyNotificationParamsSchema with typed SmartCardSchema items', () => {
        const validNotification = {
          correlationId: 'corr-1234',
          cards: [sampleCard],
        };
        const result = SmartCardsReadyNotificationParamsSchema.safeParse(validNotification);
        expect(result.success).toBe(true);
      });

      it('rejects SmartCardsReadyNotificationParamsSchema with untyped or malformed card items', () => {
        const invalidNotification = {
          correlationId: 'corr-1234',
          cards: [{ id: 'not-a-card', title: 'Fake' }],
        };
        expect(SmartCardsReadyNotificationParamsSchema.safeParse(invalidNotification).success).toBe(false);
      });

      it('rejects SmartCardsReadyNotificationParamsSchema with empty cards array', () => {
        const emptyNotification = {
          correlationId: 'corr-1234',
          cards: [],
        };
        expect(SmartCardsReadyNotificationParamsSchema.safeParse(emptyNotification).success).toBe(false);
      });

      it('validates ContractViolatedNotificationParamsSchema with refined TextSpanRangeSchema', () => {
        const validNotification = {
          correlationId: 'corr-5678',
          contractViolated: 'Use-After-Free',
          rule: 'CPP_MEM_01',
          brokenInvariant: 'Deallocated memory dereferenced',
          explanation: 'Pointer was accessed after deletion',
          targetFile: 'src/main.cpp',
          targetRange: {
            startLine: 12,
            startColumn: 5,
            endLine: 12,
            endColumn: 25,
          },
          languageId: 'cpp',
        };
        const result = ContractViolatedNotificationParamsSchema.safeParse(validNotification);
        expect(result.success).toBe(true);
      });

      it('rejects ContractViolatedNotificationParamsSchema with inverted targetRange', () => {
        const invertedNotification = {
          correlationId: 'corr-5678',
          contractViolated: 'Use-After-Free',
          rule: 'CPP_MEM_01',
          brokenInvariant: 'Deallocated memory dereferenced',
          explanation: 'Pointer was accessed after deletion',
          targetFile: 'src/main.cpp',
          targetRange: {
            startLine: 20,
            startColumn: 1,
            endLine: 10, // Inverted! endLine < startLine
            endColumn: 1,
          },
          languageId: 'cpp',
        };
        expect(ContractViolatedNotificationParamsSchema.safeParse(invertedNotification).success).toBe(false);
      });
    });
  });

  describe('7. Radical Innovations: BridgeWire & Popper Gate Contracts', () => {
    it('validates BridgeWireCoordinatesSchema with required and optional fields', () => {
      const validCoords = { x1: 100, y1: 50, x2: 400, y2: 250, active: true, strokeWidth: 2, colorVar: '--accent' };
      const parsed = BridgeWireCoordinatesSchema.safeParse(validCoords);
      expect(parsed.success).toBe(true);

      const minimalCoords = { x1: 0, y1: 0, x2: 10, y2: 10 };
      expect(BridgeWireCoordinatesSchema.safeParse(minimalCoords).success).toBe(true);

      const invalidCoords = { x1: '10', y1: 0, x2: 10, y2: 10 };
      expect(BridgeWireCoordinatesSchema.safeParse(invalidCoords).success).toBe(false);
    });

    it('computes bridge wire spline accurately according to mathematical formula', () => {
      const res = computeBridgeWireSpline(0, 100, 200, 300);
      expect(res.cx1).toBeGreaterThan(0);
      expect(res.cy1).toBe(100);
      expect(res.cx2).toBeLessThan(200);
      expect(res.cy2).toBe(300);
      expect(res.path).toBe(`M 0,100 C ${res.cx1},100 ${res.cx2},300 200,300`);
      expect(res.length).toBeGreaterThan(200);

      // Custom tension override
      const customRes = computeBridgeWireSpline(0, 0, 100, 0, 0.5);
      expect(customRes.cx1).toBe(50);
      expect(customRes.cx2).toBe(50);
      expect(customRes.path).toBe('M 0,0 C 50,0 50,0 100,0');
    });

    it('validates BridgeWireSplinePathSchema', () => {
      const valid = { path: 'M 0,0 C 20,0 80,100 100,100', length: 141.42, tension: 0.35 };
      expect(BridgeWireSplinePathSchema.safeParse(valid).success).toBe(true);
      expect(BridgeWireSplinePathSchema.safeParse({ path: 'M 0,0', length: 'invalid' }).success).toBe(false);
    });

    it('validates FalsificationDomainSchema enums strictly', () => {
      const validDomains = ['null_undefined', 'empty_container', 'numeric_boundary', 'type_mismatch', 'reentrancy', 'async_race'];
      for (const d of validDomains) {
        expect(FalsificationDomainSchema.safeParse(d).success).toBe(true);
      }
      expect(FalsificationDomainSchema.safeParse('invalid_domain').success).toBe(false);
    });

    it('validates FalsificationCaseSchema with expected outcome domain', () => {
      const validCase = {
        id: 'fc-001',
        domain: 'numeric_boundary',
        inputDescription: 'Zero division check',
        testValue: 0,
        expectedOutcome: 'fallback_return',
        rationale: 'Must return fallback 0 instead of throwing NaN or infinite',
      };
      expect(FalsificationCaseSchema.safeParse(validCase).success).toBe(true);

      const invalidCase = { ...validCase, expectedOutcome: 'unsupported_outcome' };
      expect(FalsificationCaseSchema.safeParse(invalidCase).success).toBe(false);
    });

    it('validates PopperGateReportSchema', () => {
      const validReport = {
        targetSymbol: 'calculateAverage',
        paramSignatures: ['values: number[]'],
        boundaryCases: [
          {
            id: 'case-1',
            domain: 'empty_container',
            inputDescription: 'Empty list',
            testValue: [],
            expectedOutcome: 'fallback_return',
            rationale: 'Empty list should return 0',
          },
        ],
        cognitiveScore: 95,
        passesPopperFalsification: true,
      };
      expect(PopperGateReportSchema.safeParse(validReport).success).toBe(true);

      const outOfBoundsReport = { ...validReport, cognitiveScore: 105 };
      expect(PopperGateReportSchema.safeParse(outOfBoundsReport).success).toBe(false);
    });

    it('validates MaieuticPhaseSchema, ContextEnvelope, and Response schemas', () => {
      const validPhases = ['probe', 'invariant', 'synthesis', 'resolution'];
      for (const p of validPhases) {
        expect(MaieuticPhaseSchema.safeParse(p).success).toBe(true);
      }

      const validEnvelope = {
        symbol: 'processToken',
        lineNumber: 42,
        diagnosticCode: 'TS2532',
        diagnosticMessage: 'Object is possibly undefined',
        userStatement: 'Why is this failing on null?',
      };
      expect(MaieuticContextEnvelopeSchema.safeParse(validEnvelope).success).toBe(true);

      const validResponse = {
        phase: 'probe',
        dialecticQuestion: 'What guarantee prevents null at line 42?',
        antiSpoonfeedAssertion: true,
        suggestedReflection: 'Inspect the return type of the caller.',
      };
      expect(MaieuticResponseSchema.safeParse(validResponse).success).toBe(true);

      const spoonfeedViolation = {
        ...validResponse,
        antiSpoonfeedAssertion: false,
      };
      expect(MaieuticResponseSchema.safeParse(spoonfeedViolation).success).toBe(false);
    });
  });
});
