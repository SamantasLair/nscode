import { randomUUID } from 'crypto';
import {
  type SmartCardDTO,
  type ContractViolatedDTO,
  type TargetLanguage,
  type AllocationType,
  type CacheLocalityRating,
  type BlankTokenCategory,
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
  SmartCardSchema,
  ContractViolatedSchema,
} from '@antislop/protocol';
import type { IPedagogicalEngine, AggregatedContext } from './types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toValidUUID(id?: string): string {
  if (id && UUID_REGEX.test(id)) {
    return id;
  }
  return randomUUID();
}

function resolveTargetLanguage(lang?: string, fileUri?: string): TargetLanguage {
  const normalized = (lang || '').toLowerCase();
  const uri = (fileUri || '').toLowerCase();

  if (normalized.includes('cpp') || normalized.includes('c++') || uri.endsWith('.cpp') || uri.endsWith('.cc') || uri.endsWith('.hpp')) {
    return 'cpp';
  }
  if (normalized === 'c' || uri.endsWith('.c') || uri.endsWith('.h')) {
    return 'c';
  }
  if (normalized.includes('java') && !normalized.includes('script') || uri.endsWith('.java')) {
    return 'java';
  }
  if (normalized.includes('csharp') || normalized.includes('c#') || uri.endsWith('.cs')) {
    return 'csharp';
  }
  if (normalized.includes('python') || uri.endsWith('.py')) {
    return 'python';
  }
  if (normalized.includes('php') || uri.endsWith('.php')) {
    return 'php';
  }
  return 'python'; // Default baseline
}

export class PedagogicalEngine implements IPedagogicalEngine {
  public async analyzeError(params: {
    correlationId?: string;
    rawError?: string;
    fileUri?: string;
    languageId?: string;
    exitCode?: number;
    stackTrace?: string;
    context?: AggregatedContext;
  }): Promise<{
    correlationId: string;
    contractViolated: ContractViolatedDTO;
    cards: SmartCardDTO[];
  }> {
    const correlationId = toValidUUID(params.correlationId);
    const targetLanguage = resolveTargetLanguage(params.languageId, params.fileUri);
    const rawError = params.rawError || params.stackTrace || (params.exitCode !== undefined ? `Process exited with code ${params.exitCode}` : 'Uncaught runtime contract violation');
    const fileUri = params.fileUri || params.context?.activeBuffer?.uri || 'file:///workspace/src/main';

    const contractViolated = this.generateContractViolated({
      correlationId,
      rawError,
      fileUri,
      targetLanguage,
      line: params.context?.activeBuffer?.selection?.start?.line ?? 1,
    });

    const cards = this.generateSolutionCards({
      correlationId,
      targetLanguage,
      fileUri,
      rawError,
    });

    return {
      correlationId,
      contractViolated,
      cards,
    };
  }

  public generateContractViolated(options: {
    correlationId: string;
    rawError: string;
    fileUri: string;
    targetLanguage: TargetLanguage;
    line?: number;
  }): ContractViolatedDTO {
    const line = options.line && options.line > 0 ? options.line : 1;

    const dto: ContractViolatedDTO = {
      id: randomUUID(),
      errorCode: `E-${options.targetLanguage.toUpperCase()}-001`,
      category: 'runtime_exception',
      title: `Contract Invariant Violated in [${options.targetLanguage.toUpperCase()}]`,
      contract: `The execution unit must guarantee precondition satisfaction and bounded state invariants before resource access.`,
      ruleExplanation: `Dereferencing, indexing, or mutating unvalidated or unowned handles violates runtime memory and type safety contracts.`,
      rootCause: `State precondition failed: resource handle was null, undefined, or accessed outside its legal lifecycle boundary.`,
      mentalModel: `View resources as exclusive linear leases. Accessing a lease requires verifying its presence and lifetime validity before invocation.`,
      sourceLocation: {
        fileUri: options.fileUri,
        range: {
          startLine: line,
          startColumn: 1,
          endLine: line,
          endColumn: 80,
        },
        label: `Faulting execution point on line ${line}`,
      },
      relatedSpans: [
        {
          fileUri: options.fileUri,
          range: {
            startLine: line,
            startColumn: 1,
            endLine: line,
            endColumn: 20,
          },
          label: 'Precondition declaration boundary',
          role: 'declaration',
        },
      ],
      ingressVector: 'terminal',
      rawError: options.rawError,
      severity: 'error',
      timestamp: Date.now(),
    };

    const parsed = ContractViolatedSchema.safeParse(dto);
    if (!parsed.success) {
      throw new Error(`Failed to generate valid ContractViolatedDTO: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  public generateSolutionCards(options: {
    correlationId: string;
    targetLanguage: TargetLanguage;
    fileUri: string;
    rawError: string;
  }): SmartCardDTO[] {
    const idiomatic = this.createIdiomaticCard(options);
    const minimalist = this.createMinimalistCard(options);
    const performance = this.createPerformanceCard(options);

    const cards = [idiomatic, minimalist, performance];

    for (const card of cards) {
      // Mathematical assertion for Big-O regexes
      if (!BIG_O_TIME_REGEX.test(card.complexity.timeComplexity)) {
        throw new Error(`Invalid Big-O time complexity: ${card.complexity.timeComplexity}`);
      }
      if (!BIG_O_SPACE_REGEX.test(card.complexity.spaceComplexity)) {
        throw new Error(`Invalid Big-O space complexity: ${card.complexity.spaceComplexity}`);
      }

      const parsed = SmartCardSchema.safeParse(card);
      if (!parsed.success) {
        throw new Error(`Generated smart card does not adhere to SmartCardSchema: ${parsed.error.message}`);
      }
    }

    return cards;
  }

  private createIdiomaticCard(options: {
    correlationId: string;
    targetLanguage: TargetLanguage;
    fileUri: string;
    rawError: string;
  }): SmartCardDTO {
    const cardId = randomUUID();
    const config = this.getLanguageCardConfig(options.targetLanguage, 'idiomatic');

    return {
      id: cardId,
      correlationId: options.correlationId,
      variant: 'idiomatic',
      title: config.title,
      codeSnippet: config.snippet,
      whyItWorks: config.whyItWorks,
      complexity: {
        timeComplexity: 'O(1)',
        spaceComplexity: 'O(1) auxiliary',
        complexityProof: 'Single-pass bounded validation with constant-time stack frame allocation.',
      },
      memoryImpact: {
        allocationType: config.allocationType,
        heapAllocationsEstimate: config.heapAlloc,
        stackFrameImpact: config.stackImpact,
        gcLifecycleImpact: config.gcImpact,
        cacheLocality: 'l1_optimal',
        notes: config.memNotes,
      },
      languageBreakdown: {
        targetLanguage: options.targetLanguage,
        primaryConstruct: config.primaryConstruct,
        runtimeMechanism: config.runtimeMechanism,
        commonPitfalls: config.pitfalls,
        learningObjective: config.learningObjective,
      },
      tradeOffs: {
        pros: config.pros,
        cons: config.cons,
        readability: 'high',
        maintainability: 'high',
        productionSuitability: 'Recommended standard pattern for production codebases.',
      },
      clozeChallenge: {
        challengeId: randomUUID(),
        cardId,
        maskedSnippet: config.maskedSnippet,
        blanks: config.blanks,
        unmaskMode: 'sequential',
        maxAttemptsPerBlank: 3,
        penaltyCooldownMs: 1500,
        revealAfterFailures: true,
      },
    };
  }

  private createMinimalistCard(options: {
    correlationId: string;
    targetLanguage: TargetLanguage;
    fileUri: string;
    rawError: string;
  }): SmartCardDTO {
    const cardId = randomUUID();
    const config = this.getLanguageCardConfig(options.targetLanguage, 'minimalist');

    return {
      id: cardId,
      correlationId: options.correlationId,
      variant: 'minimalist',
      title: config.title,
      codeSnippet: config.snippet,
      whyItWorks: config.whyItWorks,
      complexity: {
        timeComplexity: 'O(1)',
        spaceComplexity: 'O(1) auxiliary',
        complexityProof: 'Direct inline conditional check without heap or stack allocations.',
      },
      memoryImpact: {
        allocationType: 'zero_alloc',
        heapAllocationsEstimate: config.heapAlloc,
        stackFrameImpact: config.stackImpact,
        gcLifecycleImpact: config.gcImpact,
        cacheLocality: 'l1_optimal',
        notes: config.memNotes,
      },
      languageBreakdown: {
        targetLanguage: options.targetLanguage,
        primaryConstruct: config.primaryConstruct,
        runtimeMechanism: config.runtimeMechanism,
        commonPitfalls: config.pitfalls,
        learningObjective: config.learningObjective,
      },
      tradeOffs: {
        pros: config.pros,
        cons: config.cons,
        readability: 'high',
        maintainability: 'medium',
        productionSuitability: 'Optimal for quick defensive checks with low complexity.',
      },
      clozeChallenge: {
        challengeId: randomUUID(),
        cardId,
        maskedSnippet: config.maskedSnippet,
        blanks: config.blanks,
        unmaskMode: 'sequential',
        maxAttemptsPerBlank: 3,
        penaltyCooldownMs: 1500,
        revealAfterFailures: true,
      },
    };
  }

  private createPerformanceCard(options: {
    correlationId: string;
    targetLanguage: TargetLanguage;
    fileUri: string;
    rawError: string;
  }): SmartCardDTO {
    const cardId = randomUUID();
    const config = this.getLanguageCardConfig(options.targetLanguage, 'performance');

    return {
      id: cardId,
      correlationId: options.correlationId,
      variant: 'performance',
      title: config.title,
      codeSnippet: config.snippet,
      whyItWorks: config.whyItWorks,
      complexity: {
        timeComplexity: 'O(1) amortized',
        spaceComplexity: 'O(1) auxiliary',
        complexityProof: 'Zero-allocation buffer reuse with pre-warmed cache line alignment.',
      },
      memoryImpact: {
        allocationType: config.allocationType,
        heapAllocationsEstimate: config.heapAlloc,
        stackFrameImpact: config.stackImpact,
        gcLifecycleImpact: config.gcImpact,
        cacheLocality: 'l1_optimal',
        notes: config.memNotes,
      },
      languageBreakdown: {
        targetLanguage: options.targetLanguage,
        primaryConstruct: config.primaryConstruct,
        runtimeMechanism: config.runtimeMechanism,
        commonPitfalls: config.pitfalls,
        learningObjective: config.learningObjective,
      },
      tradeOffs: {
        pros: config.pros,
        cons: config.cons,
        readability: 'medium',
        maintainability: 'high',
        productionSuitability: 'Ideal for latency-sensitive inner loops and high-throughput systems.',
      },
      clozeChallenge: {
        challengeId: randomUUID(),
        cardId,
        maskedSnippet: config.maskedSnippet,
        blanks: config.blanks,
        unmaskMode: 'sequential',
        maxAttemptsPerBlank: 3,
        penaltyCooldownMs: 1500,
        revealAfterFailures: true,
      },
    };
  }

  private getLanguageCardConfig(
    language: TargetLanguage,
    variant: 'idiomatic' | 'minimalist' | 'performance'
  ): {
    title: string;
    snippet: string;
    whyItWorks: string;
    allocationType: AllocationType;
    heapAlloc: string;
    stackImpact: string;
    gcImpact: string;
    memNotes: string;
    primaryConstruct: string;
    runtimeMechanism: string;
    pitfalls: string[];
    learningObjective: string;
    pros: string[];
    cons: string[];
    maskedSnippet: string;
    blanks: Array<{
      id: string;
      index: number;
      token: string;
      hint: string;
      distractors: string[];
      category: BlankTokenCategory;
      unmasked: boolean;
    }>;
  } {
    switch (language) {
      case 'c':
        if (variant === 'idiomatic') {
          return {
            title: 'Deterministic Free and Goto Cleanup Pattern',
            snippet: 'int process_data(char *data) {\n  if (!data) goto cleanup;\n  /* process */\n  return 0;\ncleanup:\n  free(data);\n  return -1;\n}',
            whyItWorks: 'Centralizes error unwinding through a structured goto cleanup block, preventing dangling pointers and resource leaks.',
            allocationType: 'stack',
            heapAlloc: '0 bytes in cleanup',
            stackImpact: '16 bytes (standard C stack frame)',
            gcImpact: 'No GC runtime in C; deterministic free() called directly on glibc heap',
            memNotes: 'Immediate heap reclamation via free().',
            primaryConstruct: 'goto error_unwind',
            runtimeMechanism: 'Explicit jump to label resetting frame pointers.',
            pitfalls: ['Forgetting to initialize pointers to NULL before cleanup.', 'Double free on already freed pointers.'],
            learningObjective: 'Master structured cleanup and single-exit functions in ISO C.',
            pros: ['Zero overhead', 'Single point of resource deallocation'],
            cons: ['Requires manual verification of all labels'],
            maskedSnippet: 'int process_data(char *data) {\n  if (!data) {BLANK_0};\n  return 0;\ncleanup:\n  free(data);\n  return -1;\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'goto cleanup',
                hint: 'Jump to cleanup label',
                distractors: ['return NULL', 'exit(1)', 'break'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'Direct Null-Check Guard Clause',
            snippet: 'if (data == NULL) {\n  return -1;\n}',
            whyItWorks: 'Fails fast before invalid pointer dereference occurs.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes',
            stackImpact: '0 bytes',
            gcImpact: 'No GC pressure',
            memNotes: 'Register comparison cmp rax, 0.',
            primaryConstruct: 'Early return guard',
            runtimeMechanism: 'Conditional jump instruction (jz/je).',
            pitfalls: ['Silent failures if error return codes are unchecked by caller.'],
            learningObjective: 'Apply fast-path validation guards to sanitize pointers.',
            pros: ['Extremely simple', 'Zero cognitive burden'],
            cons: ['Caller must check return status'],
            maskedSnippet: 'if (data == {BLANK_0}) {\n  return -1;\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'NULL',
                hint: 'Null pointer constant in C',
                distractors: ['0L', 'nullptr', 'false'],
                category: 'variable_binding',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Static Stack-Allocated Memory Arena',
            snippet: 'char buffer[256];\n/* operate on contiguous stack memory */',
            whyItWorks: 'Eliminates dynamic memory allocation entirely by placing fixed buffer on thread call stack.',
            allocationType: 'stack',
            heapAlloc: '0 bytes',
            stackImpact: '256 bytes on call stack',
            gcImpact: 'None',
            memNotes: 'Stack allocated; zero fragmentation.',
            primaryConstruct: 'Stack array buffer',
            runtimeMechanism: 'Sub rsp, 256 stack pointer decrement.',
            pitfalls: ['Stack overflow if buffer size exceeds available thread stack limit.'],
            learningObjective: 'Leverage stack memory over dynamic heap allocation for high-throughput primitives.',
            pros: ['Zero allocation cost', 'Ideal L1 cache locality'],
            cons: ['Fixed upper bound size'],
            maskedSnippet: 'char buffer[{BLANK_0}];',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: '256',
                hint: 'Fixed size buffer length',
                distractors: ['malloc(256)', 'sizeof(char*)', 'NULL'],
                category: 'boundary_check',
                unmasked: false,
              },
            ],
          };
        }

      case 'cpp':
        if (variant === 'idiomatic') {
          return {
            title: 'Modern C++ RAII Smart Pointer (std::unique_ptr)',
            snippet: 'auto resource = std::make_unique<Resource>();\nresource->execute();',
            whyItWorks: 'Enforces Resource Acquisition Is Initialization (RAII), ensuring deterministic destruction even when exceptions are thrown.',
            allocationType: 'heap',
            heapAlloc: 'sizeof(Resource) via operator new',
            stackImpact: '8 bytes (single raw pointer wrapper)',
            gcImpact: 'No GC; destructor called automatically at scope exit',
            memNotes: 'Zero-overhead abstraction over raw pointers.',
            primaryConstruct: 'std::unique_ptr and std::make_unique',
            runtimeMechanism: 'Compiler emits destructor invocation in exception unwinding tables.',
            pitfalls: ['Accidental double ownership if raw pointer is extracted.'],
            learningObjective: 'Eliminate raw pointer manual deletion with standard RAII semantics.',
            pros: ['Exception-safe', 'Zero manual cleanup boilerplate'],
            cons: ['Heap allocation required for resource object'],
            maskedSnippet: 'auto resource = {BLANK_0}<Resource>();\nresource->execute();',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'std::make_unique',
                hint: 'Factory function creating a unique_ptr',
                distractors: ['std::make_shared', 'new Resource', 'std::allocator'],
                category: 'method_call',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'Modern nullptr Guard Check',
            snippet: 'if (!resource) {\n  return std::nullopt;\n}',
            whyItWorks: 'Explicitly validates resource existence before invocation using std::optional return semantics.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes',
            stackImpact: '1 byte boolean discriminant in std::optional',
            gcImpact: 'None',
            memNotes: 'Stack allocated discriminant; no heap involvement.',
            primaryConstruct: 'std::optional return guard',
            runtimeMechanism: 'Stack copy of optional container with engaged flag.',
            pitfalls: ['Calling .value() without has_value() check.'],
            learningObjective: 'Express absence of value safely without magic null pointers.',
            pros: ['Clear monadic intent', 'Enforces caller handling'],
            cons: ['Slight stack footprint overhead for optional flag'],
            maskedSnippet: 'if (!resource) {\n  return {BLANK_0};\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'std::nullopt',
                hint: 'Disengaged optional representation',
                distractors: ['nullptr', 'NULL', 'false'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Zero-Copy std::string_view / std::span Contiguous Buffer',
            snippet: 'void process(std::span<const uint8_t> data) noexcept {\n  /* contiguous traversal */\n}',
            whyItWorks: 'Bypasses heap copies by passing non-owning pointer and length view directly in CPU registers.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes',
            stackImpact: '16 bytes (pointer + size_t size in registers)',
            gcImpact: 'None',
            memNotes: 'Sequential memory stride maximizes L1 cache line hits.',
            primaryConstruct: 'std::span<T> view',
            runtimeMechanism: 'Pass-by-value 128-bit register pair without heap allocation.',
            pitfalls: ['Dangling view if underlying container is modified or destructed.'],
            learningObjective: 'Master zero-copy abstractions for high-performance memory pipelines.',
            pros: ['Zero copies', 'L1 optimal memory throughput', 'noexcept guaranteed'],
            cons: ['Lifetime tied strictly to parent buffer'],
            maskedSnippet: 'void process({BLANK_0}<const uint8_t> data) noexcept {\n  /* contiguous traversal */\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'std::span',
                hint: 'Contiguous buffer view container in C++20',
                distractors: ['std::vector', 'std::array', 'std::string'],
                category: 'type',
                unmasked: false,
              },
            ],
          };
        }

      case 'java':
        if (variant === 'idiomatic') {
          return {
            title: 'Try-With-Resources AutoCloseable Idiom',
            snippet: 'try (var stream = Files.newInputStream(path)) {\n  stream.transferTo(out);\n}',
            whyItWorks: 'Guarantees resource closure on all code paths including unexpected runtime exceptions.',
            allocationType: 'gc_managed',
            heapAlloc: 'InputStream object on Young Generation Eden space',
            stackImpact: 'Single reference slot in JVM local variable table',
            gcImpact: 'Eligible for quick Minor GC collection after scope exits',
            memNotes: 'JVM emits bytecode close() in finally exception block.',
            primaryConstruct: 'try-with-resources statement',
            runtimeMechanism: 'JVM exception table generates synthetic finally block invoking close().',
            pitfalls: ['Suppressed exceptions in close() hiding primary business exceptions.'],
            learningObjective: 'Prevent file handle and socket exhaustion via Java AutoCloseable semantics.',
            pros: ['Compile-time verification of AutoCloseable', 'Clean syntax'],
            cons: ['Resource must implement AutoCloseable'],
            maskedSnippet: '{BLANK_0} (var stream = Files.newInputStream(path)) {\n  stream.transferTo(out);\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'try',
                hint: 'Statement initiating try-with-resources',
                distractors: ['using', 'with', 'synchronized'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'Objects.requireNonNull Defensive Validation',
            snippet: 'Objects.requireNonNull(input, "input parameter must not be null");',
            whyItWorks: 'Validates input upfront with informative error message rather than failing deeply with opaque NullPointerException.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes (string literal stored in JVM constant pool)',
            stackImpact: '1 stack operand frame for verification',
            gcImpact: 'Zero heap churn in normal execution',
            memNotes: 'Direct inline JIT intrinsic comparison.',
            primaryConstruct: 'Objects.requireNonNull',
            runtimeMechanism: 'JIT inlines as simple if (o == null) throw new NullPointerException.',
            pitfalls: ['Throwing NPE in business logic when fallback default is expected.'],
            learningObjective: 'Fail-fast at method boundaries to preserve state invariants.',
            pros: ['Standard library utility', 'Clear diagnostic message'],
            cons: ['Fails immediately with NullPointerException'],
            maskedSnippet: 'Objects.{BLANK_0}(input, "input parameter must not be null");',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'requireNonNull',
                hint: 'Method verifying object reference is not null',
                distractors: ['checkNotNull', 'validate', 'assertNotNull'],
                category: 'method_call',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Off-Heap Direct ByteBuffer Recycling',
            snippet: 'ByteBuffer buffer = ByteBuffer.allocateDirect(1024);\ntry {\n  buffer.put(bytes);\n} finally {\n  buffer.clear();\n}',
            whyItWorks: 'Allocates memory outside JVM garbage-collected heap, enabling native OS I/O zero-copy transfers.',
            allocationType: 'arena_pooled',
            heapAlloc: 'Small DirectByteBuffer wrapper object on heap; backing buffer off-heap',
            stackImpact: '1 object reference slot in frame',
            gcImpact: 'Bypasses Young/Old generation GC pauses during high-frequency throughput',
            memNotes: 'Memory managed via sun.misc.Unsafe direct native memory.',
            primaryConstruct: 'Direct ByteBuffer',
            runtimeMechanism: 'OS kernel DMA access without intermediate JVM buffer copying.',
            pitfalls: ['Off-heap memory leaks if DirectByteBuffer references are held.'],
            learningObjective: 'Bypass GC pressure in performance-critical data streaming loops.',
            pros: ['Zero-copy native IO', 'No GC pause interference'],
            cons: ['Higher allocation overhead; requires buffer pooling'],
            maskedSnippet: 'ByteBuffer buffer = ByteBuffer.{BLANK_0}(1024);',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'allocateDirect',
                hint: 'Factory method allocating native off-heap buffer',
                distractors: ['allocate', 'wrap', 'createNative'],
                category: 'method_call',
                unmasked: false,
              },
            ],
          };
        }

      case 'csharp':
        if (variant === 'idiomatic') {
          return {
            title: 'C# 8+ Using Declaration Pattern',
            snippet: 'using var connection = new SqlConnection(connString);\nconnection.Open();',
            whyItWorks: 'Automatically disposes IDisposable resources at the end of the enclosing variable scope.',
            allocationType: 'gc_managed',
            heapAlloc: 'Allocated on CLR Managed Heap Gen 0',
            stackImpact: 'Single pointer reference on execution stack',
            gcImpact: 'Disposed explicitly; GC collects object without running finalizer',
            memNotes: 'Roslyn compiler injects try/finally block under the hood.',
            primaryConstruct: 'using declaration',
            runtimeMechanism: 'IL emit try/finally invoking IDisposable.Dispose().',
            pitfalls: ['Extending resource lifetime inadvertently if scope is large.'],
            learningObjective: 'Master concise scope-bound resource disposal in modern C#.',
            pros: ['Eliminates excessive indentation', 'Guaranteed deterministic disposal'],
            cons: ['Lifetime tied strictly to enclosing lexical block'],
            maskedSnippet: '{BLANK_0} var connection = new SqlConnection(connString);',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'using',
                hint: 'C# keyword declaring scoped IDisposable resource',
                distractors: ['with', 'defer', 'scoped'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'Null-Coalescing Guard Expression',
            snippet: 'var validData = data ?? throw new ArgumentNullException(nameof(data));',
            whyItWorks: 'Enforces non-null invariant as an atomic inline expression.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes in successful flow',
            stackImpact: 'Evaluation stack operand',
            gcImpact: 'Zero allocations when valid',
            memNotes: 'Single comparison instruction in JIT native output.',
            primaryConstruct: '?? throw expression',
            runtimeMechanism: 'IL dup and brtrue.s branching.',
            pitfalls: ['Overusing in deep constructor chains without structured logging.'],
            learningObjective: 'Apply concise throw expressions for parameter contracts.',
            pros: ['Atomic assignment and validation', 'Idiomatic C# 7+ syntax'],
            cons: ['Interrupts execution immediately upon null'],
            maskedSnippet: 'var validData = data {BLANK_0} throw new ArgumentNullException(nameof(data));',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: '??',
                hint: 'Null-coalescing operator',
                distractors: ['?:', '||', '??='],
                category: 'operator',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Zero-Allocation ReadOnlySpan<T> and Stackalloc',
            snippet: 'Span<byte> buffer = stackalloc byte[128];\nProcessBuffer(buffer);',
            whyItWorks: 'Allocates memory directly on thread call stack with zero GC allocation or tracking overhead.',
            allocationType: 'stack',
            heapAlloc: '0 bytes (bypasses CLR Garbage Collector completely)',
            stackImpact: '128 bytes reserved on current stack frame',
            gcImpact: 'Completely invisible to GC; no GC pause impact',
            memNotes: 'High-speed contiguous memory with L1 cache affinity.',
            primaryConstruct: 'Span<T> and stackalloc',
            runtimeMechanism: 'Native localloc opcode reserving stack frame space.',
            pitfalls: ['Span<T> cannot be boxed or placed in async/await state machines.'],
            learningObjective: 'Achieve zero-allocation performance with C# ref structs.',
            pros: ['Zero garbage collection', 'Extremely high execution throughput'],
            cons: ['Ref struct constraints prevent use across async methods'],
            maskedSnippet: 'Span<byte> buffer = {BLANK_0} byte[128];',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'stackalloc',
                hint: 'Keyword allocating memory on the execution stack',
                distractors: ['new', 'alloc', 'stack'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        }

      case 'php':
        if (variant === 'idiomatic') {
          return {
            title: 'Strict Types & Try-Finally Resource Guard',
            snippet: "declare(strict_types=1);\n\n$handle = fopen('file.txt', 'r');\ntry {\n  $data = fread($handle, 1024);\n} finally {\n  if (is_resource($handle)) fclose($handle);\n}",
            whyItWorks: 'Enforces type invariants at compile time and guarantees stream closure in Zend Engine.',
            allocationType: 'gc_managed',
            heapAlloc: 'Zend memory manager zval handle allocation',
            stackImpact: 'Zend VM stack frame frame slot',
            gcImpact: 'Reclaimed immediately when reference count drops to zero',
            memNotes: 'Zend reference counting frees resource immediately.',
            primaryConstruct: 'declare(strict_types=1) & try/finally',
            runtimeMechanism: 'Zend opcodes ZEND_FAST_RET and ZEND_HANDLE_EXCEPTION ensure finally block execution.',
            pitfalls: ['Omitting is_resource() check before calling fclose() in finally.'],
            learningObjective: 'Master robust resource lifecycle and type enforcement in PHP 8+.',
            pros: ['Strict type coercion protection', 'Guaranteed file descriptor closure'],
            cons: ['Requires strict typing mode declared per-file'],
            maskedSnippet: "{BLANK_0}(strict_types=1);\n\n$handle = fopen('file.txt', 'r');",
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'declare',
                hint: 'Directive enforcing execution directives like strict_types',
                distractors: ['strict', 'pragma', 'assert'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'Nullsafe Operator (?->) and Null Coalescing (??)',
            snippet: '$userName = $user?->getProfile()?->getName() ?? "Anonymous";',
            whyItWorks: 'Short-circuits chained property/method access on null objects without triggering fatal Error exceptions.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 additional bytes allocated',
            stackImpact: 'Single zval evaluation stack slot',
            gcImpact: 'Zero additional garbage generated',
            memNotes: 'Evaluated inline in Zend VM executor loop.',
            primaryConstruct: 'Nullsafe operator ?->',
            runtimeMechanism: 'Zend opcode ZEND_NULLSAFE_PROP_R checks zval type and jumps on IS_NULL.',
            pitfalls: ['Masking root-cause missing state when user model should have been loaded.'],
            learningObjective: 'Safely traverse optional object graphs in PHP 8+.',
            pros: ['Compact readable syntax', 'Prevents Call to a member function on null errors'],
            cons: ['Can silently mask uninitialized domain models'],
            maskedSnippet: '$userName = $user{BLANK_0}getProfile()?->getName() ?? "Anonymous";',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: '?->',
                hint: 'Nullsafe method chaining operator in PHP 8+',
                distractors: ['->', '::', '?.>'],
                category: 'operator',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Memory-Bounded Generator (Yield) Iteration',
            snippet: 'function streamLines(string $file): \\Generator {\n  $f = fopen($file, "r");\n  try {\n    while (($line = fgets($f)) !== false) {\n      yield $line;\n    }\n  } finally {\n    fclose($f);\n  }\n}',
            whyItWorks: 'Streams file line by line with O(1) memory usage regardless of whether file is 10 KB or 10 GB.',
            allocationType: 'stack',
            heapAlloc: 'Constant ~32-byte single line zval buffer',
            stackImpact: 'Yield suspended Generator state machine',
            gcImpact: 'Immediate buffer reuse; zero cumulative memory bloat',
            memNotes: 'Zend VM pauses generator execution, yielding values one at a time.',
            primaryConstruct: 'Generator and yield',
            runtimeMechanism: 'Zend VM Generator state suspension with ZEND_YIELD opcode.',
            pitfalls: ['Attempting to rewind a generator that cannot be reset.'],
            learningObjective: 'Process large datasets in PHP without memory_limit crashes.',
            pros: ['Constant memory footprint', 'Enables processing arbitrary file sizes'],
            cons: ['Cannot randomly index generator results without converting to array'],
            maskedSnippet: 'while (($line = fgets($f)) !== false) {\n  {BLANK_0} $line;\n}',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'yield',
                hint: 'Keyword yielding value from generator function',
                distractors: ['return', 'echo', 'emit'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        }

      case 'python':
      default:
        if (variant === 'idiomatic') {
          return {
            title: 'Python Context Manager (with Statement)',
            snippet: 'with open(filename, "r", encoding="utf-8") as f:\n    data = f.read()',
            whyItWorks: 'Enforces PEP 343 Context Manager protocol (__enter__ and __exit__), guaranteeing file descriptor release even upon uncaught exceptions.',
            allocationType: 'gc_managed',
            heapAlloc: 'Single PyFile object in CPython heap',
            stackImpact: 'Single local name entry in PyFrameObject fast locals array',
            gcImpact: 'Reference count hits zero at scope exit; deallocated immediately without cycle GC',
            memNotes: 'Deterministic CPython refcounting reclamation.',
            primaryConstruct: 'with statement',
            runtimeMechanism: 'CPython bytecode emits SETUP_WITH and WITH_EXCEPT_START opcodes.',
            pitfalls: ['Opening multiple nested resources without contextlib.ExitStack.'],
            learningObjective: 'Master context manager lifecycle management in modern Python.',
            pros: ['Guaranteed resource cleanup', 'Extremely readable idiomatic Python'],
            cons: ['Resource must implement __enter__ and __exit__'],
            maskedSnippet: '{BLANK_0} open(filename, "r", encoding="utf-8") as f:\n    data = f.read()',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'with',
                hint: 'Keyword initiating Python context manager',
                distractors: ['using', 'try', 'resource'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else if (variant === 'minimalist') {
          return {
            title: 'EAFP Defensive Exception Guard',
            snippet: 'try:\n    value = cache[key]\nexcept KeyError:\n    value = default',
            whyItWorks: 'Embraces Pythonic EAFP (Easier to Ask for Forgiveness than Permission), eliminating race conditions between check and access.',
            allocationType: 'zero_alloc',
            heapAlloc: '0 bytes in the standard hit path',
            stackImpact: 'CPython exception handler entry',
            gcImpact: 'No GC allocations created in happy path',
            memNotes: 'Modern Python 3.11+ zero-cost exception tables.',
            primaryConstruct: 'try/except block',
            runtimeMechanism: 'CPython zero-cost exception handling using table lookup instead of runtime setup overhead.',
            pitfalls: ['Catching broad Exception instead of specific KeyError.'],
            learningObjective: 'Apply EAFP pattern over LBYL in dynamic dictionary lookups.',
            pros: ['Zero overhead on the happy path', 'Thread-safe atomic dictionary access'],
            cons: ['Slight exception construction cost on cache miss'],
            maskedSnippet: 'try:\n    value = cache[key]\n{BLANK_0} KeyError:\n    value = default',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: 'except',
                hint: 'Keyword handling caught exceptions in Python',
                distractors: ['catch', 'finally', 'rescue'],
                category: 'keyword',
                unmasked: false,
              },
            ],
          };
        } else {
          return {
            title: 'Slots Optimization & Pre-Allocated Arrays',
            snippet: 'class Node:\n    __slots__ = ("value", "next")\n    def __init__(self, value):\n        self.value = value\n        self.next = None',
            whyItWorks: 'Replaces per-instance dynamic __dict__ with fixed C-level struct pointers, slashing memory consumption by 60-70%.',
            allocationType: 'stack',
            heapAlloc: '48 bytes per instance (vs 152 bytes with __dict__)',
            stackImpact: 'Frame local pointer reference',
            gcImpact: 'Significantly lowers GC traversal overhead and fragmentation',
            memNotes: 'Fixed offset descriptor descriptors accessed in C speed.',
            primaryConstruct: '__slots__ class declaration',
            runtimeMechanism: 'PyTypeObject specifies tp_members directly without PyDictObject allocation.',
            pitfalls: ['Subclasses must also define __slots__ to maintain memory savings.'],
            learningObjective: 'Eliminate Python dynamic dictionary overhead for mass-allocated entities.',
            pros: ['60-70% lower memory per instance', 'Faster attribute access times'],
            cons: ['Cannot dynamically attach arbitrary undeclared attributes'],
            maskedSnippet: 'class Node:\n    {BLANK_0} = ("value", "next")\n    def __init__(self, value):\n        self.value = value\n        self.next = None',
            blanks: [
              {
                id: 'b0',
                index: 0,
                token: '__slots__',
                hint: 'Special attribute restricting instance attributes to fixed descriptors',
                distractors: ['__dict__', '__fields__', '__attrs__'],
                category: 'variable_binding',
                unmasked: false,
              },
            ],
          };
        }
    }
  }
}
