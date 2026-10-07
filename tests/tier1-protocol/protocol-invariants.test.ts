import { describe, it, expect } from 'vitest';
import {
  READ_ONLY_RPC_METHODS,
  READ_ONLY_METHODS,
  isReadOnlyRpcMethod,
  isReadOnlyMethod,
  validateIncomingRequest,
  createMethodNotFoundError,
  ContractViolatedSchema,
  TextSpanRangeSchema,
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
  ComplexityMetricSchema,
  MemoryImpactSchema,
  SmartCardSchema,
  TargetLanguageSchema,
  type TargetLanguage,
  ClozeChallengeSchema,
  TypeAlongPracticeSchema,
  CognitiveFrictionSessionSchema,
  transitionGateSession,
  type CognitiveFrictionSessionDTO,
  WebviewToExtensionMessageSchema,
  ExtensionToWebviewMessageSchema,
} from '@antislop/protocol';

describe('Tier 1: Protocol Invariants & Schema Verification Harness', () => {
  describe('Invariant 1: Zero-Mutation RPC Whitelist Firebreak', () => {
    it('guarantees that exactly 6 methods exist in the read-only whitelist', () => {
      expect(READ_ONLY_RPC_METHODS).toHaveLength(6);
      expect(READ_ONLY_METHODS).toHaveLength(6);
      expect(READ_ONLY_RPC_METHODS).toContain('rpc.ping');
      expect(READ_ONLY_RPC_METHODS).toContain('diagnostics.analyzeError');
      expect(READ_ONLY_RPC_METHODS).toContain('context.getActiveBuffer');
      expect(READ_ONLY_RPC_METHODS).toContain('context.getTerminalBuffer');
      expect(READ_ONLY_RPC_METHODS).toContain('context.getGitDiff');
      expect(READ_ONLY_RPC_METHODS).toContain('context.getLspDiagnostics');
    });

    it('rejects any write, edit, or patch mutation with JSON-RPC error code -32601', () => {
      const hostileMutations = [
        'file.write',
        'file.delete',
        'file.create',
        'buffer.patch',
        'buffer.insert',
        'buffer.replace',
        'editor.applyEdit',
        'workspace.applyEdit',
        'fs.writeFile',
        'system.exec',
        'system.runCommand',
        'terminal.sendText',
        'ide.autoPatch',
        'ide.applyFix',
      ];

      for (const method of hostileMutations) {
        expect(isReadOnlyRpcMethod(method)).toBe(false);
        expect(isReadOnlyMethod(method)).toBe(false);

        const request = {
          jsonrpc: '2.0',
          id: `attack-${method}`,
          method,
          params: { target: 'src/main.rs', patch: 'diff' },
        };

        const result = validateIncomingRequest(request);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errorResponse.error.code).toBe(-32601);
          expect(result.errorResponse.error.message).toContain(
            'write/mutation operations are strictly prohibited'
          );
          const data = result.errorResponse.error.data as any;
          expect(data.zeroMutationInvariant).toBe(true);
          expect(data.method).toBe(method);
          expect(data.violationType).toBe('ZERO_MUTATION_INVARIANT_VIOLATION');
          expect(data.allowedMethods).toEqual(READ_ONLY_RPC_METHODS);
        }
      }
    });

    it('allows valid requests for all 6 whitelisted methods', () => {
      for (const method of READ_ONLY_RPC_METHODS) {
        const req = {
          jsonrpc: '2.0',
          id: `valid-${method}`,
          method,
          params: {},
        };
        const validation = validateIncomingRequest(req);
        expect(validation.success).toBe(true);
        if (validation.success) {
          expect(validation.method).toBe(method);
        }
      }
    });
  });

  describe('Invariant 2: Formal Big-O Complexity Bounds', () => {
    it('accepts rigorous Big-O time complexity strings', () => {
      const validCases = [
        'O(1)',
        'O(n)',
        'O(log n)',
        'O(n log n)',
        'O(n^2)',
        'O(2^n)',
        'O(n!)',
        'O(n + m)',
        'O(1 amortized)',
        'O(log k amortized)',
      ];

      for (const expr of validCases) {
        expect(BIG_O_TIME_REGEX.test(expr)).toBe(true);
        const parse = ComplexityMetricSchema.safeParse({
          timeComplexity: expr,
          spaceComplexity: 'O(1)',
          complexityProof: 'Detailed derivation of time complexity bounds.',
        });
        expect(parse.success).toBe(true);
      }
    });

    it('accepts rigorous Big-O space complexity strings', () => {
      const validCases = [
        'O(1)',
        'O(n)',
        'O(k)',
        'O(n log n)',
        'O(1 auxiliary)',
        'O(n auxiliary)',
      ];

      for (const expr of validCases) {
        expect(BIG_O_SPACE_REGEX.test(expr)).toBe(true);
        const parse = ComplexityMetricSchema.safeParse({
          timeComplexity: 'O(1)',
          spaceComplexity: expr,
          complexityProof: 'Detailed derivation of space complexity bounds.',
        });
        expect(parse.success).toBe(true);
      }
    });

    it('falsifies and rejects informal or hallucinated complexity metrics', () => {
      const invalidTime = [
        'fast',
        'N*N',
        'O',
        'O()',
        'instantaneous',
        'linear time',
        'O(n) + O(1)',
        'O(infinite)',
        'O(fast)',
        'O(this is slop)',
        'O(n auxiliary)',
        'O(1 auxiliary)',
      ];

      for (const expr of invalidTime) {
        expect(BIG_O_TIME_REGEX.test(expr)).toBe(false);
        const parse = ComplexityMetricSchema.safeParse({
          timeComplexity: expr,
          spaceComplexity: 'O(1)',
          complexityProof: 'Proof explanation text here.',
        });
        expect(parse.success).toBe(false);
      }

      const invalidSpace = [
        'O(1 amortized)',
        'O(n amortized)',
        'O(infinite)',
        'O(fast)',
        'O(this is slop)',
      ];

      for (const expr of invalidSpace) {
        expect(BIG_O_SPACE_REGEX.test(expr)).toBe(false);
        const parse = ComplexityMetricSchema.safeParse({
          timeComplexity: 'O(1)',
          spaceComplexity: expr,
          complexityProof: 'Proof explanation text here.',
        });
        expect(parse.success).toBe(false);
      }
    });
  });

  describe('Invariant 3: Memory Allocation Profile Bounds', () => {
    it('validates supported allocation types and cache locality ratings', () => {
      const allocationTypes = [
        'stack',
        'heap',
        'zero_alloc',
        'gc_managed',
        'arena_pooled',
        'hybrid',
      ] as const;

      const cacheRatings = [
        'l1_optimal',
        'sequential_stride',
        'pointer_chasing_poor',
        'unaffected',
      ] as const;

      for (const allocationType of allocationTypes) {
        for (const cacheLocality of cacheRatings) {
          const profile = {
            allocationType,
            heapAllocationsEstimate: allocationType === 'stack' ? '0' : '1',
            stackFrameImpact: '8 bytes',
            gcLifecycleImpact: 'Immediate stack cleanup',
            cacheLocality,
            notes: 'Verified memory footprint layout.',
          };
          expect(MemoryImpactSchema.safeParse(profile).success).toBe(true);
        }
      }
    });
  });

  describe('Invariant 4: Cognitive Friction Gate & Absolute Auto-Patch Prohibition', () => {
    it('strictly forbids directAutoPatchAllowed being true under any circumstances', () => {
      const illegalAutoPatch = {
        sessionId: 'e2b3c4d5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
        cardId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        status: 'UNLOCKED',
        clozeSolved: true,
        typeAlongSolved: true,
        clipboardUnlocked: true,
        directAutoPatchAllowed: true, // FATAL VIOLATION OF GOLDEN INVARIANT
        clozeAttempts: 2,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(illegalAutoPatch);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('directAutoPatchAllowed');
      }
    });

    it('forbids clipboard unlock if session is not in UNLOCKED state', () => {
      const prematureCopyStates = [
        'LOCKED',
        'CLOZE_PENDING',
        'CLOZE_PASSED',
        'TYPE_ALONG_PENDING',
        'TYPE_ALONG_PASSED',
      ] as const;

      for (const status of prematureCopyStates) {
        const prematureSession = {
          sessionId: 'e2b3c4d5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
          cardId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          status,
          clozeSolved: false,
          typeAlongSolved: false,
          clipboardUnlocked: true, // FORBIDDEN!
          directAutoPatchAllowed: false,
          clozeAttempts: 0,
        };

        const result = CognitiveFrictionSessionSchema.safeParse(prematureSession);
        expect(result.success).toBe(false);
      }
    });

    it('enforces allowPaste: false in TypeAlongPracticeSchema', () => {
      const valid = {
        practiceId: 'e2b3c4d5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
        cardId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        prompt: 'Type the RAII construct:',
        targetKeystrokes: 'std::unique_ptr<int> p = std::make_unique<int>(1);',
        languageId: 'cpp',
        minAccuracyPercent: 95.0,
        maxAllowedErrors: 1,
        allowPaste: false,
        caseSensitive: true,
      };
      expect(TypeAlongPracticeSchema.safeParse(valid).success).toBe(true);

      const invalid = { ...valid, allowPaste: true };
      expect(TypeAlongPracticeSchema.safeParse(invalid).success).toBe(false);
    });

    it('advances through the full cognitive state transition ladder deterministically', () => {
      let state: CognitiveFrictionSessionDTO = {
        sessionId: 'e2b3c4d5-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
        cardId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };
      expect(CognitiveFrictionSessionSchema.safeParse(state).success).toBe(true);

      state = transitionGateSession(state, { type: 'START_CLOZE' });
      expect(state.status).toBe('CLOZE_PENDING');
      expect(state.clipboardUnlocked).toBe(false);

      state = transitionGateSession(state, { type: 'CLOZE_COMPLETED' });
      expect(state.status).toBe('UNLOCKED');
      expect(state.clozeSolved).toBe(true);
      expect(state.clipboardUnlocked).toBe(true);

      state = transitionGateSession(state, { type: 'START_TYPE_ALONG' });
      expect(state.status).toBe('TYPE_ALONG_PENDING');
      expect(state.clipboardUnlocked).toBe(false);

      state = transitionGateSession(state, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 97.8,
      });
      expect(state.status).toBe('UNLOCKED');
      expect(state.clozeSolved).toBe(true);
      expect(state.typeAlongSolved).toBe(true);
      expect(state.clipboardUnlocked).toBe(true);
      expect(state.directAutoPatchAllowed).toBe(false); // Immutable!
      expect(CognitiveFrictionSessionSchema.safeParse(state).success).toBe(true);
    });
  });

  describe('Invariant 5: Multi-Language Syntax Breakdown Coverage', () => {
    const targetLanguages: TargetLanguage[] = [
      'c',
      'cpp',
      'java',
      'csharp',
      'python',
      'php',
    ];

    it('supports all 5+ core project languages in TargetLanguageSchema', () => {
      for (const lang of targetLanguages) {
        expect(TargetLanguageSchema.safeParse(lang).success).toBe(true);
      }
      expect(TargetLanguageSchema.safeParse('cobol').success).toBe(false);
    });

    it('validates multi-language Smart Cards conforming to language-specific internals', () => {
      const languageCards: Array<{
        lang: TargetLanguage;
        construct: string;
        mechanism: string;
        pitfall: string;
      }> = [
        {
          lang: 'c',
          construct: 'free() + ptr = NULL',
          mechanism: 'Overwrites pointer address in stack frame; subsequent access faults MMU page',
          pitfall: 'Aliased raw pointers still point to freed address',
        },
        {
          lang: 'cpp',
          construct: 'std::unique_ptr<T>',
          mechanism: 'RAII destructor inlined by compiler on stack unwinding',
          pitfall: 'Calling .release() without storing raw pointer leaks memory',
        },
        {
          lang: 'java',
          construct: 'try-with-resources (AutoCloseable)',
          mechanism: 'Emits bytecode finally block invoking close() with suppressed exception chaining',
          pitfall: 'Catching Throwable can mask VirtualMachineError',
        },
        {
          lang: 'csharp',
          construct: 'using var (IDisposable)',
          mechanism: 'CLR generates try/finally calling Dispose() upon leaving scope',
          pitfall: 'Asynchronous disposable requires await using with IAsyncDisposable',
        },
        {
          lang: 'python',
          construct: 'with open(...) as f:',
          mechanism: 'CPython emits SETUP_WITH and invokes __enter__ and __exit__',
          pitfall: 'Forgetting encoding defaults to platform-dependent locale encoding',
        },
        {
          lang: 'php',
          construct: 'declare(strict_types=1);',
          mechanism: 'Zend Engine bypasses zval type coercion opcodes',
          pitfall: 'Only affects function calls made from within the declaring file',
        },
      ];

      for (const item of languageCards) {
        const card = {
          id: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
          correlationId: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
          variant: 'idiomatic' as const,
          title: `${item.lang.toUpperCase()} Pedagogical Fix`,
          codeSnippet: '// sample code snippet',
          whyItWorks: 'Enforces correct language idioms and contract safety.',
          complexity: {
            timeComplexity: 'O(1)',
            spaceComplexity: 'O(1)',
            complexityProof: 'Single execution step without auxiliary memory.',
          },
          memoryImpact: {
            allocationType: 'zero_alloc' as const,
            heapAllocationsEstimate: '0',
            stackFrameImpact: '0 bytes',
            gcLifecycleImpact: 'Zero GC allocations',
            cacheLocality: 'l1_optimal' as const,
            notes: 'Zero memory allocation overhead.',
          },
          languageBreakdown: {
            targetLanguage: item.lang,
            primaryConstruct: item.construct,
            runtimeMechanism: item.mechanism,
            commonPitfalls: [item.pitfall],
            learningObjective: `Master ${item.lang} memory and resource hygiene`,
          },
          tradeOffs: {
            pros: ['Clean idiom', 'Memory safe'],
            cons: ['Requires modern compiler/runtime'],
            readability: 'high' as const,
            maintainability: 'high' as const,
            productionSuitability: 'Standard industry recommendation',
          },
        };

        const result = SmartCardSchema.safeParse(card);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Invariant 6: SmartCardSchema Trade-Offs Union & Inline Cloze Challenge Integration', () => {
    const baseCard = {
      id: '2d3e4f5a-6b7c-8d9e-0f1a-2b3c4d5e6f7a',
      correlationId: '7f1d8c2e-4b2a-4a8f-9e32-11c5e93d8b01',
      variant: 'idiomatic' as const,
      title: 'RAII Resource Management',
      codeSnippet: 'auto ptr = std::make_unique<int>(42);',
      whyItWorks: 'RAII binds memory lifecycle to lexical scope.',
      complexity: {
        timeComplexity: 'O(1)',
        spaceComplexity: 'O(1)',
        complexityProof: 'Single allocator call without auxiliary buffers.',
      },
      memoryImpact: {
        allocationType: 'heap' as const,
        heapAllocationsEstimate: '1',
        stackFrameImpact: '8-byte smart pointer wrapper',
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
    };

    it('accepts string[] tradeOffs per PROJECT.md interface contract', () => {
      const cardWithStringTradeOffs = {
        ...baseCard,
        tradeOffs: ['Clean syntax', 'Deterministic memory footprint'],
      };
      const result = SmartCardSchema.safeParse(cardWithStringTradeOffs);
      expect(result.success).toBe(true);
    });

    it('accepts structured TradeOffAnalysisDTO object in tradeOffs', () => {
      const cardWithStructuredTradeOffs = {
        ...baseCard,
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

    it('embeds clozeChallenge directly on SmartCardSchema cleanly', () => {
      const cardWithInlineCloze = {
        ...baseCard,
        tradeOffs: ['Clean RAII'],
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

      const result = SmartCardSchema.safeParse(cardWithInlineCloze);
      expect(result.success).toBe(true);
    });
  });
});
