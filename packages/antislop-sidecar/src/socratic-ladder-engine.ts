import { randomUUID } from 'crypto';
import {
  type SocraticLadderSessionDTO,
  type TargetLanguage,
  type BlankTokenCategory,
  SocraticLadderSessionSchema,
} from '@antislop/protocol';

export interface DiffInputPayload {
  id?: string;
  filePath?: string;
  originalContent?: string;
  proposedContent?: string;
  description?: string;
  category?: string;
}

export interface ExtractedDiffContext {
  targetSymbol: string;
  scopeContext: string;
  detectedLanguage: TargetLanguage;
  category: 'defensive_bounds' | 'concurrency' | 'memory_lifecycle' | 'state_isolation';
  guardKeyword: string;
  addedTokens: string[];
  deletedTokens: string[];
}

const GRAMMAR_LEXICON: Record<TargetLanguage, {
  keywords: string[];
  guardConstructs: string[];
  types: string[];
  operators: string[];
}> = {
  python: {
    keywords: ['if', 'elif', 'else', 'def', 'class', 'return', 'raise', 'try', 'except', 'finally', 'with', 'as', 'lambda', 'yield', 'async', 'await', 'pass'],
    guardConstructs: ['is not None', 'is None', 'len(', 'hasattr(', 'isinstance('],
    types: ['Optional', 'Union', 'List', 'Dict', 'Tuple', 'Any', 'Callable'],
    operators: ['==', '!=', 'is', 'is not', 'in', 'not in', 'and', 'or', 'not'],
  },
  cpp: {
    keywords: ['if', 'else', 'switch', 'case', 'return', 'throw', 'try', 'catch', 'virtual', 'const', 'constexpr', 'explicit', 'noexcept', 'decltype', 'auto'],
    guardConstructs: ['nullptr', 'static_cast', 'dynamic_cast', 'std::optional', 'std::unique_ptr', 'std::shared_ptr'],
    types: ['size_t', 'int32_t', 'uint64_t', 'std::string_view', 'std::span', 'bool'],
    operators: ['==', '!=', '->', '::', '&&', '||', '!', '<=>'],
  },
  c: {
    keywords: ['if', 'else', 'switch', 'case', 'return', 'goto', 'sizeof', 'typedef', 'struct', 'union', 'enum', 'static', 'const', 'volatile'],
    guardConstructs: ['NULL', 'exit', 'abort', 'free', 'errno'],
    types: ['size_t', 'ssize_t', 'uint8_t', 'intptr_t', 'void*', 'char*'],
    operators: ['==', '!=', '->', '&&', '||', '!', '&', '*'],
  },
  java: {
    keywords: ['if', 'else', 'switch', 'case', 'return', 'throw', 'throws', 'try', 'catch', 'finally', 'synchronized', 'volatile', 'transient', 'final'],
    guardConstructs: ['Objects.requireNonNull', 'Optional.ofNullable', 'isEmpty()', 'isPresent()'],
    types: ['Optional', 'CompletableFuture', 'ConcurrentHashMap', 'AtomicReference', 'String', 'boolean'],
    operators: ['==', '!=', 'instanceof', '&&', '||', '!'],
  },
  csharp: {
    keywords: ['if', 'else', 'switch', 'case', 'return', 'throw', 'try', 'catch', 'finally', 'lock', 'using', 'async', 'await', 'readonly', 'record'],
    guardConstructs: ['ArgumentNullException.ThrowIfNull', 'is not null', '??', '?.', 'GetValueOrDefault()'],
    types: ['Task', 'ValueTask', 'CancellationToken', 'ReadOnlySpan', 'Memory', 'bool'],
    operators: ['==', '!=', '??', '?.', 'is', 'as', '&&', '||', '!'],
  },
  php: {
    keywords: ['if', 'else', 'elseif', 'switch', 'case', 'return', 'throw', 'try', 'catch', 'finally', 'match', 'readonly', 'fn', 'yield'],
    guardConstructs: ['isset(', '!empty(', 'is_null(', 'array_key_exists(', 'str_contains('],
    types: ['mixed', 'array', 'callable', 'string', 'bool', 'int', 'object'],
    operators: ['===', '!==', '??', '?->', 'instanceof', '&&', '||', '!'],
  },
};

export class SocraticLadderEngine {
  public synthesizeLadder(
    diff: DiffInputPayload,
    diagnostics?: { code?: string; message?: string; range?: { startLine: number } }
  ): SocraticLadderSessionDTO {
    const diffCtx = this.extractContext(diff, diagnostics);
    const challengeId = diff.id ? `ladder-${diff.id}` : `ladder-${randomUUID()}`;
    const diffId = diff.id || 'diff-0';
    const filePath = diff.filePath || 'workspace/src/module';

    const reflection = this.buildReflectionStep(diffCtx, filePath);
    const invariant = this.buildInvariantStep(diffCtx, filePath);
    const blueprint = this.buildBlueprintStep(diffCtx, filePath);
    const cloze = this.buildClozeStep(diffCtx, challengeId);

    const session: SocraticLadderSessionDTO = {
      challengeId,
      diffId,
      filePath,
      category: diffCtx.category,
      currentLevel: 1,
      isFullyUnlocked: false,
      directAutoPatchAllowed: false, // Golden Invariant
      levels: {
        reflection,
        invariant,
        blueprint,
        cloze,
      },
    };

    const parsed = SocraticLadderSessionSchema.safeParse(session);
    if (!parsed.success) {
      throw new Error(`SocraticLadderSessionSchema validation failed: ${parsed.error.message}`);
    }

    return parsed.data;
  }

  public extractContext(
    diff: DiffInputPayload,
    diagnostics?: { code?: string; message?: string }
  ): ExtractedDiffContext {
    const filePath = (diff.filePath || '').toLowerCase();
    const orig = diff.originalContent || '';
    const prop = diff.proposedContent || '';
    const desc = (diff.description || '').toLowerCase();
    const diagMsg = (diagnostics?.message || '').toLowerCase();

    // 1. Detect language
    let detectedLanguage: TargetLanguage = 'python';
    if (filePath.endsWith('.c') || filePath.endsWith('.h')) detectedLanguage = 'c';
    else if (filePath.endsWith('.cpp') || filePath.endsWith('.cc') || filePath.endsWith('.hpp')) detectedLanguage = 'cpp';
    else if (filePath.endsWith('.java')) detectedLanguage = 'java';
    else if (filePath.endsWith('.cs')) detectedLanguage = 'csharp';
    else if (filePath.endsWith('.php')) detectedLanguage = 'php';
    else if (filePath.endsWith('.ts') || filePath.endsWith('.js') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) detectedLanguage = 'csharp'; // Use modern managed fallback

    // 2. Extract tokens from added vs deleted lines
    const propLines = prop.split('\n');
    const origLines = orig.split('\n');
    const origSet = new Set(origLines.map(l => l.trim()));
    const addedLines = propLines.filter(l => !origSet.has(l.trim()) && l.trim().length > 0);
    const deletedLines = origLines.filter(l => !propLines.includes(l) && l.trim().length > 0);

    const addedTokens: string[] = [];
    for (const line of addedLines) {
      const tokens = line.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      addedTokens.push(...tokens);
    }
    const deletedTokens: string[] = [];
    for (const line of deletedLines) {
      const tokens = line.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      deletedTokens.push(...tokens);
    }

    // 3. Category classification (based on diagnostics or AST/token keywords)
    let category: 'defensive_bounds' | 'concurrency' | 'memory_lifecycle' | 'state_isolation' = 'defensive_bounds';
    if (
      desc.includes('async') ||
      desc.includes('concurren') ||
      desc.includes('race') ||
      desc.includes('promise') ||
      diagMsg.includes('race') ||
      addedTokens.includes('async') ||
      addedTokens.includes('await') ||
      addedTokens.includes('AbortController') ||
      addedTokens.includes('Promise') ||
      addedTokens.includes('synchronized') ||
      addedTokens.includes('lock')
    ) {
      category = 'concurrency';
    } else if (
      desc.includes('cleanup') ||
      desc.includes('leak') ||
      desc.includes('lifecycle') ||
      desc.includes('dispose') ||
      addedTokens.includes('dispose') ||
      addedTokens.includes('free') ||
      addedTokens.includes('removeEventListener') ||
      addedTokens.includes('clearInterval')
    ) {
      category = 'memory_lifecycle';
    } else if (
      desc.includes('isolat') ||
      desc.includes('immutab') ||
      desc.includes('pure') ||
      addedTokens.includes('freeze') ||
      addedTokens.includes('clone') ||
      addedTokens.includes('slice') ||
      addedTokens.includes('structuredClone')
    ) {
      category = 'state_isolation';
    }

    // 4. Identify target symbol
    const meaningfulTokens = addedTokens.filter(
      (t) =>
        t.length > 2 &&
        !['function', 'const', 'let', 'var', 'return', 'import', 'from', 'export', 'class', 'true', 'false', 'null', 'undefined', 'async', 'await', 'void', 'int', 'def'].includes(t)
    );
    const targetSymbol = meaningfulTokens[0] || 'targetRef';

    // 5. Identify scope context
    const fnMatch = prop.match(/function\s+([a-zA-Z0-9_]+)|def\s+([a-zA-Z0-9_]+)|([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/);
    const scopeContext = fnMatch ? (fnMatch[1] || fnMatch[2] || fnMatch[3] || 'activeScope') : 'activeScope';

    // 6. Guard keyword
    const guardKeyword = addedTokens.find(t => ['if', 'while', 'assert', 'guard', 'try', 'throw'].includes(t)) || 'if';

    return {
      targetSymbol,
      scopeContext,
      detectedLanguage,
      category,
      guardKeyword,
      addedTokens: Array.from(new Set(addedTokens)),
      deletedTokens: Array.from(new Set(deletedTokens)),
    };
  }

  private buildReflectionStep(ctx: ExtractedDiffContext, filePath: string) {
    const rawFileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    const lexicon = GRAMMAR_LEXICON[ctx.detectedLanguage] || GRAMMAR_LEXICON.python;

    let question = '';
    let correctText = '';
    let distractor1 = '';
    let distractor2 = '';
    let hint = '';

    if (ctx.category === 'concurrency') {
      question = `What invariant does the proposed asynchronous coordination pattern in "${rawFileName}" safeguard?`;
      correctText = `It guarantees that out-of-order network responses or concurrent calls do not overwrite newer state.`;
      distractor1 = `Enforces synchronous execution of asynchronous tasks by intercepting runtime scheduler loops.`;
      distractor2 = `Guarantees zero network latency by pre-allocating network socket buffers before handshake.`;
      hint = `Consider what happens when a second asynchronous request resolves before the first one completes.`;
    } else if (ctx.category === 'memory_lifecycle') {
      question = `What is the primary architectural purpose of the disposal lifecycle hooks in "${rawFileName}"?`;
      correctText = `To unregister listeners and release event subscriptions, preventing persistent memory leaks.`;
      distractor1 = `To reduce the bundle size of the compiled JavaScript file on disk.`;
      distractor2 = `To serialize active closure scope references into persistent local storage.`;
      hint = `What happens to event listener closures if a tab or component is repeatedly created and destroyed?`;
    } else if (ctx.category === 'state_isolation') {
      question = `Why does the proposed change in "${rawFileName}" enforce state isolation and immutability?`;
      correctText = `To prevent in-place object mutations from corrupting shared state across adjacent components.`;
      distractor1 = `To bypass runtime garbage collection by storing mutable objects in global read-only memory.`;
      distractor2 = `To restrict variable binding scopes to top-level lexical environment declarations.`;
      hint = `Think about what occurs if two views concurrently mutate the same object reference.`;
    } else {
      question = `Why does the proposed change in "${rawFileName}" introduce boundary validation before accessing properties?`;
      correctText = `To guard against null or undefined references, preventing runtime TypeError exceptions during edge cases.`;
      distractor1 = `To convert untyped runtime objects into primitive scalar types before function evaluation.`;
      distractor2 = `To disable lexical scope resolution when traversing nested variable hierarchies.`;
      hint = `Observe what occurs if the incoming data payload is null, undefined, or omitted by the caller.`;
    }

    return {
      level: 1 as const,
      type: 'reflection' as const,
      title: 'Level 1: Socratic Reflection',
      prompt: question,
      targetSymbol: ctx.targetSymbol,
      astNodeType: ctx.category,
      scopeContext: ctx.scopeContext,
      options: [
        {
          id: 'opt-0',
          text: correctText,
          isCorrect: true,
          explanation: `Correct: Precondition verification on "${ctx.targetSymbol}" guarantees execution stability.`,
          feedback: `Correct: Precondition verification on "${ctx.targetSymbol}" guarantees execution stability.`,
        },
        {
          id: 'opt-1',
          text: distractor1,
          isCorrect: false,
          explanation: `Incorrect: Lexical analysis shows "${ctx.targetSymbol}" requires bounded validation, not runtime transformation.`,
          feedback: `Incorrect: Lexical analysis shows "${ctx.targetSymbol}" requires bounded validation, not runtime transformation.`,
        },
        {
          id: 'opt-2',
          text: distractor2,
          isCorrect: false,
          explanation: `Incorrect: This violates the formal invariant of the target execution environment.`,
          feedback: `Incorrect: This violates the formal invariant of the target execution environment.`,
        },
      ],
      hint,
      completed: false,
      selectedOptionId: null,
    };
  }

  private buildInvariantStep(ctx: ExtractedDiffContext, filePath: string) {
    const rawFileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
    let rule = '';
    let pre = '';
    let post = '';
    let correctText = '';
    let distractor1 = '';
    let distractor2 = '';
    let hint = '';

    if (ctx.category === 'concurrency') {
      rule = `∀ seq(t1, t2): t1 < t2 ⇒ state(apply(t1, t2)) = state(t2)`;
      pre = `Incoming dispatch must attach monotonic epoch or active AbortSignal.`;
      post = `Superseded responses with epoch < currentEpoch are safely discarded without state mutation.`;
      correctText = `Monotonic epoch or abort token prevents stale response thrashing across concurrent executions.`;
      distractor1 = `All concurrent operations block asynchronously until the first operation completes.`;
      distractor2 = `State variables are assigned to thread-local memory caches without barrier synchronization.`;
      hint = `Verify that subsequent dispatches invalidate or supersede preceding operations.`;
    } else if (ctx.category === 'memory_lifecycle') {
      rule = `∀ handle ∈ ResourceHandles: unmount(handle) ⇒ ref_count(handle) = 0`;
      pre = `Resource or subscription is allocated and active within component lifecycle.`;
      post = `On lifecycle termination, handle is explicitly closed or unregistered, clearing retained closures.`;
      correctText = `Guarantees symmetric resource deallocation: every registered listener is cleanly removed on disposal.`;
      distractor1 = `Transfers event listener bindings to parent window context to prevent garbage collection.`;
      distractor2 = `Invokes garbage collection synchronously on every component render pass.`;
      hint = `Examine whether resource allocation is paired with an exact disposal routine.`;
    } else if (ctx.category === 'state_isolation') {
      rule = `∀ s ∈ State: mutate(s) ⇒ s' = clone(s) ∧ ref(s') ≠ ref(s)`;
      pre = `Caller holds reference to shared or contextual state data.`;
      post = `Updated state creates distinct reference identity, leaving preceding state snapshot immutable.`;
      correctText = `Zero-mutation guarantee: consumers receive independent copies, protecting state integrity.`;
      distractor1 = `Directly mutates object properties while keeping reference identities identical.`;
      distractor2 = `Overrides Object.prototype to suppress property setter invocations.`;
      hint = `Consider the boundary between internal component state and external props.`;
    } else {
      rule = `∀ x ∈ ${ctx.targetSymbol}: valid(x) ⇔ (x ≠ null ∧ x ≠ undefined ∧ bounds(x) ∈ [0, len))`;
      pre = `Caller passes parameter '${ctx.targetSymbol}' which may be undefined or uninitialized.`;
      post = `'${ctx.targetSymbol}' is verified to satisfy non-null and valid boundary invariant before dereferencing.`;
      correctText = `Guarantees precondition validity: dereference occurs only after verifying non-null bounds.`;
      distractor1 = `Allows unchecked property access and relies on default prototype fallback mechanisms.`;
      distractor2 = `Silences runtime exceptions by catching all errors without verifying preconditions.`;
      hint = `Observe how early guard return protects downstream property accesses.`;
    }

    return {
      level: 2 as const,
      type: 'invariant' as const,
      title: 'Level 2: Invariant & System Constraint',
      rule,
      precondition: pre,
      postcondition: post,
      formalProof: `By structural induction on ${ctx.scopeContext}, satisfying precondition implies zero uncaught faults.`,
      violationConsequence: `Unchecked invocation leads to runtime crash, race condition, or memory retention.`,
      options: [
        {
          id: 'opt-inv-0',
          text: correctText,
          isCorrect: true,
          explanation: `Correct: Mathematical invariant satisfies system contract.`,
          feedback: `Correct: Mathematical invariant satisfies system contract.`,
        },
        {
          id: 'opt-inv-1',
          text: distractor1,
          isCorrect: false,
          explanation: `Incorrect: This violates the formal precondition.`,
          feedback: `Incorrect: This violates the formal precondition.`,
        },
        {
          id: 'opt-inv-2',
          text: distractor2,
          isCorrect: false,
          explanation: `Incorrect: This leads to undefined behavior under edge cases.`,
          feedback: `Incorrect: This leads to undefined behavior under edge cases.`,
        },
      ],
      hint,
      completed: false,
      selectedOptionId: null,
    };
  }

  private buildBlueprintStep(ctx: ExtractedDiffContext, filePath: string) {
    let paradigmShift = '';
    let strategy = '';
    let pseudocode = '';
    let correctText = '';
    let distractor1 = '';
    let distractor2 = '';
    let hint = '';

    if (ctx.category === 'concurrency') {
      paradigmShift = `Shift from Fire-and-Forget to Guarded Monotonic Dispatch`;
      strategy = `Attach sequence token or AbortController to actively cancel in-flight stale operations.`;
      pseudocode = `function dispatchAsync(params):\n  abortPreviousController()\n  signal = createAbortSignal()\n  data = await fetch(params, { signal })\n  if (not signal.aborted):\n    commitState(data)`;
      correctText = `Abort previous in-flight requests and verify signal state before committing async results.`;
      distractor1 = `Queue all incoming requests in an unbounded FIFO array without cancellation tokens.`;
      distractor2 = `Execute concurrent requests in reverse order to ensure the fastest response wins.`;
      hint = `Notice the check for signal.aborted before mutating state in the blueprint.`;
    } else if (ctx.category === 'memory_lifecycle') {
      paradigmShift = `Shift from Implicit Retention to Explicit Deterministic Disposal`;
      strategy = `Track subscriptions in a disposable registry and execute unbind on teardown.`;
      pseudocode = `function mount():\n  disposables.add(element.on('event', handler))\nfunction unmount():\n  for sub in disposables:\n    sub.dispose()\n  disposables.clear()`;
      correctText = `Register event handlers in a lifecycle collection and dispose all subscriptions on unmount.`;
      distractor1 = `Keep event subscriptions alive across unmounts to reuse them on subsequent mounts.`;
      distractor2 = `Remove DOM elements while leaving event listeners registered to window global scope.`;
      hint = `Notice how disposables are systematically cleared upon unmount.`;
    } else if (ctx.category === 'state_isolation') {
      paradigmShift = `Shift from In-Place Mutation to Pure Immutable State Projection`;
      strategy = `Create shallow/deep copies before modifying fields and return fresh state references.`;
      pseudocode = `function updateState(prevState, patch):\n  nextState = copy(prevState)\n  nextState.apply(patch)\n  return freeze(nextState)`;
      correctText = `Create an isolated copy, apply mutations to the copy, and return the new frozen reference.`;
      distractor1 = `Mutate prevState directly and return the same object reference to save allocation cost.`;
      distractor2 = `Delete modified properties from prevState before reassigning new values.`;
      hint = `Notice that nextState is a separate copy from prevState.`;
    } else {
      paradigmShift = `Shift from Unsafe Property Access to Early-Exit Guard Clause`;
      strategy = `Validate presence and bounds at function boundary, returning fallback if invalid.`;
      pseudocode = `function ${ctx.scopeContext}(${ctx.targetSymbol}):\n  if (!${ctx.targetSymbol}):\n    return fallbackSafeValue\n  // Guaranteed safe access below\n  return process(${ctx.targetSymbol})`;
      correctText = `Validate ${ctx.targetSymbol} with an early return guard before accessing properties.`;
      distractor1 = `Access ${ctx.targetSymbol} directly and handle undefined properties in the caller scope.`;
      distractor2 = `Wrap entire call stack in global unhandled rejection handler without local checks.`;
      hint = `Notice how the early return guard creates a safe scope for subsequent operations.`;
    }

    return {
      level: 3 as const,
      type: 'blueprint' as const,
      title: 'Level 3: Logic Blueprint',
      paradigmShift,
      algorithmicStrategy: strategy,
      pseudocode,
      options: [
        {
          id: 'opt-bp-0',
          text: correctText,
          isCorrect: true,
          explanation: `Correct: Blueprint strategy aligns with architectural invariant.`,
          feedback: `Correct: Blueprint strategy aligns with architectural invariant.`,
        },
        {
          id: 'opt-bp-1',
          text: distractor1,
          isCorrect: false,
          explanation: `Incorrect: This contradicts the logic blueprint.`,
          feedback: `Incorrect: This contradicts the logic blueprint.`,
        },
        {
          id: 'opt-bp-2',
          text: distractor2,
          isCorrect: false,
          explanation: `Incorrect: This approach introduces architectural anti-patterns.`,
          feedback: `Incorrect: This approach introduces architectural anti-patterns.`,
        },
      ],
      hint,
      completed: false,
      selectedOptionId: null,
    };
  }

  private buildClozeStep(ctx: ExtractedDiffContext, challengeId: string) {
    const lexicon = GRAMMAR_LEXICON[ctx.detectedLanguage] || GRAMMAR_LEXICON.python;

    let maskedSnippet = '';
    let targetToken = '';
    let hint = '';
    let distractors: string[] = [];
    let category: BlankTokenCategory = 'keyword';

    if (ctx.category === 'concurrency') {
      maskedSnippet = `if (signal.{BLANK_0}) {\n  return;\n}`;
      targetToken = 'aborted';
      hint = 'Property indicating whether an asynchronous operation has been cancelled';
      distractors = ['completed', 'resolved', 'pending'];
      category = 'variable_binding';
    } else if (ctx.category === 'memory_lifecycle') {
      maskedSnippet = `if (listener) {\n  target.{BLANK_0}('change', listener);\n}`;
      targetToken = 'removeEventListener';
      hint = 'DOM/Event emitter method to unregister an active event listener';
      distractors = ['addEventListener', 'dispatchEvent', 'emit'];
      category = 'method_call';
    } else if (ctx.category === 'state_isolation') {
      maskedSnippet = `const next = Object.{BLANK_0}({}, current);`;
      targetToken = 'assign';
      hint = 'Standard method to create a shallow clone of an object into a fresh target';
      distractors = ['freeze', 'seal', 'keys'];
      category = 'method_call';
    } else {
      maskedSnippet = `if (!${ctx.targetSymbol}) {\n  {BLANK_0};\n}`;
      targetToken = 'return';
      hint = 'Control flow keyword to exit the current function immediately';
      distractors = ['break', 'continue', 'throw'];
      category = 'keyword';
    }

    return {
      level: 4 as const,
      type: 'cloze' as const,
      title: 'Level 4: Interactive Syntax Verification (Cloze)',
      maskedSnippet,
      blanks: [
        {
          id: `blank-${challengeId}-0`,
          index: 0,
          token: targetToken,
          hint,
          distractors,
          category,
          unmasked: false,
        },
      ],
      hint: `Complete the key syntax token to verify your implementation comprehension before unlocking the diff.`,
      completed: false,
    };
  }
}
