import { randomUUID } from 'crypto';
import {
  type FalsificationCase,
  type FalsificationDomain,
  type PopperGateReport,
  FalsificationCaseSchema,
  PopperGateReportSchema,
} from '@antislop/protocol';

export interface PredictionEvaluation {
  isCorrect: boolean;
  explanation: string;
  deltaScore: number;
}

export class PopperGateFalsifier {
  /**
   * Synthesizes boundary test cases dynamically from parameter types.
   * Generates up to 16 boundary cases with zero static dummy values.
   */
  public generateBoundaryCases(targetSymbol: string, paramTypes: string[]): FalsificationCase[] {
    const cases: FalsificationCase[] = [];

    // If no parameter types are provided, generate universal boundary cases for the target symbol
    const effectiveTypes =
      paramTypes.length > 0
        ? paramTypes
        : ['unknown'];

    effectiveTypes.forEach((rawType, paramIndex) => {
      const typeStr = rawType.trim().toLowerCase();
      const paramName = `param${paramIndex}`;

      // Array / List / Collection types
      if (
        typeStr.includes('[]') ||
        typeStr.includes('array') ||
        typeStr.includes('list') ||
        typeStr.includes('set') ||
        typeStr.includes('collection')
      ) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-empty_arr-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Empty array [] passed to ${paramName} in ${targetSymbol}`,
            testValue: [],
            expectedOutcome: 'fallback_return',
            rationale: `Empty collection must trigger safe default return rather than throwing index out of bounds or empty reduce errors.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-null_element-${randomUUID().slice(0, 8)}`,
            domain: 'null_undefined',
            inputDescription: `Array containing null element [null] passed to ${paramName} in ${targetSymbol}`,
            testValue: [null],
            expectedOutcome: 'throw_handled',
            rationale: `Poisoned null inside array collection must be caught and handled during iteration without unhandled runtime panic.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-sparse_array-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Sparse array allocated with 100 empty slots passed to ${paramName} in ${targetSymbol}`,
            testValue: new Array(100),
            expectedOutcome: 'fallback_return',
            rationale: `Holey array with empty slots verifies that iteration logic handles sparse array holes gracefully.`,
          })
        );
      }
      // Object / Record / Dict / Map types (checked before string/number to catch Record<string, ...>)
      else if (
        typeStr.includes('object') ||
        typeStr.includes('record') ||
        typeStr.includes('dict') ||
        typeStr.includes('map') ||
        typeStr.includes('{')
      ) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-empty_obj-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Empty object {} passed to ${paramName} in ${targetSymbol}`,
            testValue: {},
            expectedOutcome: 'fallback_return',
            rationale: `Empty object tests missing key resolution and ensures fallback defaults are returned.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-null_ref-${randomUUID().slice(0, 8)}`,
            domain: 'null_undefined',
            inputDescription: `Null object reference passed to ${paramName} in ${targetSymbol}`,
            testValue: null,
            expectedOutcome: 'throw_handled',
            rationale: `Null object reference must be validated at the boundary before dereferencing properties.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-undefined_ref-${randomUUID().slice(0, 8)}`,
            domain: 'null_undefined',
            inputDescription: `Undefined reference passed to ${paramName} in ${targetSymbol}`,
            testValue: undefined,
            expectedOutcome: 'throw_handled',
            rationale: `Undefined parameter must be trapped or filled by default argument fallback.`,
          })
        );
      }
      // String types
      else if (typeStr.includes('string') || typeStr.includes('str') || typeStr.includes('text') || typeStr.includes('char')) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-empty_str-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Empty string "" passed to ${paramName} in ${targetSymbol}`,
            testValue: '',
            expectedOutcome: 'fallback_return',
            rationale: `Empty string checks truthiness guards and ensures zero-length handling returns expected baseline.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-whitespace-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Whitespace-only string "   " passed to ${paramName} in ${targetSymbol}`,
            testValue: '   ',
            expectedOutcome: 'fallback_return',
            rationale: `Whitespace-only input tests whether trimming is enforced prior to payload processing.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-newline-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Newline string "\\n" passed to ${paramName} in ${targetSymbol}`,
            testValue: '\n',
            expectedOutcome: 'fallback_return',
            rationale: `Newline input tests delimiter parsing and multiline boundary stability.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-buffer_overflow-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Long buffer string (256 repetitions) passed to ${paramName} in ${targetSymbol}`,
            testValue: 'a'.repeat(256),
            expectedOutcome: 'fallback_return',
            rationale: `Long string boundary verifies capacity resilience and prevents regex catastrophic backtracking.`,
          })
        );
      }
      // Number / Integer / Float types
      else if (
        typeStr.includes('number') ||
        typeStr.includes('int') ||
        typeStr.includes('float') ||
        typeStr.includes('double') ||
        typeStr.includes('byte')
      ) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-zero-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Zero (0) boundary passed to ${paramName} in ${targetSymbol}`,
            testValue: 0,
            expectedOutcome: 'fallback_return',
            rationale: `Zero value tests falsy boundary guards and verifies immunity to division-by-zero faults.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-negative-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Negative integer (-1) passed to ${paramName} in ${targetSymbol}`,
            testValue: -1,
            expectedOutcome: 'throw_handled',
            rationale: `Negative boundary tests non-negative domain invariants and must be rejected with handled error.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-nan-${randomUUID().slice(0, 8)}`,
            domain: 'type_mismatch',
            inputDescription: `NaN (Not-a-Number) passed to ${paramName} in ${targetSymbol}`,
            testValue: NaN,
            expectedOutcome: 'throw_handled',
            rationale: `NaN arithmetic poisoning must be intercepted before triggering silent corruption.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-max_safe_int-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}) passed to ${paramName} in ${targetSymbol}`,
            testValue: Number.MAX_SAFE_INTEGER,
            expectedOutcome: 'fallback_return',
            rationale: `Upper magnitude boundary tests against numeric overflow and precision truncation.`,
          })
        );
      }
      // Boolean types
      else if (typeStr.includes('boolean') || typeStr.includes('bool')) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-false-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Boolean false passed to ${paramName} in ${targetSymbol}`,
            testValue: false,
            expectedOutcome: 'fallback_return',
            rationale: `Boolean false verifies falsy flag branch logic without falling through into unintended defaults.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-true-${randomUUID().slice(0, 8)}`,
            domain: 'numeric_boundary',
            inputDescription: `Boolean true passed to ${paramName} in ${targetSymbol}`,
            testValue: true,
            expectedOutcome: 'fallback_return',
            rationale: `Boolean true verifies affirmative execution branch against invariant specifications.`,
          })
        );
      }
      // Function / Callback / Async types
      else if (
        typeStr.includes('function') ||
        typeStr.includes('callback') ||
        typeStr.includes('promise') ||
        typeStr.includes('async')
      ) {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-async_race-${randomUUID().slice(0, 8)}`,
            domain: 'async_race',
            inputDescription: `Concurrent async invocation callback passed to ${paramName} in ${targetSymbol}`,
            testValue: () => Promise.resolve(),
            expectedOutcome: 'throw_handled',
            rationale: `Async race tests reentrancy and unsettled promise collisions.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-reentrancy-${randomUUID().slice(0, 8)}`,
            domain: 'reentrancy',
            inputDescription: `Recursive reentrant callback passed to ${paramName} in ${targetSymbol}`,
            testValue: () => {},
            expectedOutcome: 'throw_handled',
            rationale: `Reentrant execution before lock release must be intercepted to avoid recursive deadlocks.`,
          })
        );
      }
      // Object / Record / Dictionary or fallback types
      else {
        cases.push(
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-empty_obj-${randomUUID().slice(0, 8)}`,
            domain: 'empty_container',
            inputDescription: `Empty object {} passed to ${paramName} in ${targetSymbol}`,
            testValue: {},
            expectedOutcome: 'fallback_return',
            rationale: `Empty object tests missing key resolution and ensures fallback defaults are returned.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-null_ref-${randomUUID().slice(0, 8)}`,
            domain: 'null_undefined',
            inputDescription: `Null object reference passed to ${paramName} in ${targetSymbol}`,
            testValue: null,
            expectedOutcome: 'throw_handled',
            rationale: `Null object reference must be validated at the boundary before dereferencing properties.`,
          }),
          FalsificationCaseSchema.parse({
            id: `falsify-${targetSymbol}-${paramName}-undefined_ref-${randomUUID().slice(0, 8)}`,
            domain: 'null_undefined',
            inputDescription: `Undefined reference passed to ${paramName} in ${targetSymbol}`,
            testValue: undefined,
            expectedOutcome: 'throw_handled',
            rationale: `Undefined parameter must be trapped or filled by default argument fallback.`,
          })
        );
      }
    });

    // Enforce upper limit of 16 boundary cases
    return cases.slice(0, 16);
  }

  /**
   * Evaluates user's predicted outcome against the falsification test case.
   */
  public evaluatePrediction(
    falsificationCase: FalsificationCase,
    userPrediction: string
  ): PredictionEvaluation {
    const normalizedPrediction = userPrediction
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_');

    const isCorrect = normalizedPrediction === falsificationCase.expectedOutcome.toLowerCase();
    const deltaScore = isCorrect ? 15 : -10;

    const explanation = isCorrect
      ? `Falsification hypothesis verified: Input (${falsificationCase.inputDescription}) correctly predicted to yield [${falsificationCase.expectedOutcome}]. ${falsificationCase.rationale}`
      : `Falsification mismatch: Input (${falsificationCase.inputDescription}) is expected to yield [${falsificationCase.expectedOutcome}] because: ${falsificationCase.rationale}. (Your prediction: [${userPrediction}])`;

    return {
      isCorrect,
      explanation,
      deltaScore,
    };
  }

  /**
   * Generates a formal PopperGateReport validated by PopperGateReportSchema.
   */
  public generateReport(
    targetSymbol: string,
    paramSignatures: string[],
    boundaryCases: FalsificationCase[],
    cognitiveScore = 100,
    passesPopperFalsification = true
  ): PopperGateReport {
    return PopperGateReportSchema.parse({
      targetSymbol,
      paramSignatures,
      boundaryCases,
      cognitiveScore: Math.max(0, Math.min(100, cognitiveScore)),
      passesPopperFalsification,
    });
  }
}
