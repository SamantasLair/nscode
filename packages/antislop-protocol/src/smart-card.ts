import { z } from 'zod';
import { ClozeChallengeSchema, type ClozeChallengeDTO } from './cognitive-gate.js';

const VAR_SYMBOLS = '[nmkvebpwcNMKVE]';
const NUM_SYMBOLS = '\\d+';
const FUNC_NAMES = '(?:log(?:_\\d+|\\d+)?|ln|sqrt)';

const PAREN_CONTENT = `(?:(?:${FUNC_NAMES}\\s+)*(?:${VAR_SYMBOLS}|${NUM_SYMBOLS})(?:\\s*[-+*^/!]\\s*(?:${FUNC_NAMES}\\s+)*(?:${VAR_SYMBOLS}|${NUM_SYMBOLS}))*)*`;
const PAREN_EXPR = `(?:(?:${FUNC_NAMES}\\s*)?\\(\\s*${PAREN_CONTENT}\\s*\\))`;
const EXPONENT = `(?:\\^\\s*(?:${VAR_SYMBOLS}|${NUM_SYMBOLS}|${PAREN_EXPR}))`;
const OPERAND = `(?:(?:${FUNC_NAMES}\\s*)*(?:${PAREN_EXPR}|${VAR_SYMBOLS}|${NUM_SYMBOLS})(?:!|${EXPONENT})*)`;
const OPERATOR = `(?:\\s*(?:[+*]|\\/(?!0(?!\\d))|-(?![-+*/^!]))\\s*|\\s+)`;
const INNER_MATH_EXPR = `(?:${OPERAND}(?:${OPERATOR}${OPERAND})*)`;

export const BIG_O_TIME_REGEX = new RegExp(
  `^(?!.*\\bauxiliary\\b)(?:O\\(\\s*${INNER_MATH_EXPR}(?:\\s+amortized)?\\s*\\)|O\\(\\s*${INNER_MATH_EXPR}\\s*\\)\\s+amortized)$`
);

export const BIG_O_SPACE_REGEX = new RegExp(
  `^(?!.*\\bamortized\\b)(?:O\\(\\s*${INNER_MATH_EXPR}(?:\\s+auxiliary)?\\s*\\)|O\\(\\s*${INNER_MATH_EXPR}\\s*\\)\\s+auxiliary)$`
);

export const SolutionApproachSchema = z.enum([
  'idiomatic',
  'minimalist',
  'performance',
]);
export type SolutionApproach = z.infer<typeof SolutionApproachSchema>;

export const TargetLanguageSchema = z.enum([
  'c',
  'cpp',
  'java',
  'csharp',
  'python',
  'php',
]);
export type TargetLanguage = z.infer<typeof TargetLanguageSchema>;

export const AllocationTypeSchema = z.enum([
  'stack',
  'heap',
  'zero_alloc',
  'gc_managed',
  'arena_pooled',
  'hybrid',
]);
export type AllocationType = z.infer<typeof AllocationTypeSchema>;

export const CacheLocalityRatingSchema = z.enum([
  'l1_optimal',
  'sequential_stride',
  'pointer_chasing_poor',
  'unaffected',
]);
export type CacheLocalityRating = z.infer<typeof CacheLocalityRatingSchema>;

export const QualitativeScoreSchema = z.enum(['high', 'medium', 'low']);
export type QualitativeScore = z.infer<typeof QualitativeScoreSchema>;

export const ComplexityMetricSchema = z.object({
  timeComplexity: z
    .string()
    .regex(
      BIG_O_TIME_REGEX,
      'timeComplexity must match valid Big-O format e.g. O(1), O(n), O(n log n)'
    ),
  spaceComplexity: z
    .string()
    .regex(
      BIG_O_SPACE_REGEX,
      'spaceComplexity must match valid Big-O format e.g. O(1), O(n), O(k)'
    ),
  complexityProof: z.string().min(10, 'complexityProof must be a detailed derivation'),
});
export type ComplexityMetricDTO = z.infer<typeof ComplexityMetricSchema>;

export const MemoryImpactSchema = z.object({
  allocationType: AllocationTypeSchema,
  heapAllocationsEstimate: z.string().min(1, 'heapAllocationsEstimate is required'),
  stackFrameImpact: z.string().min(3, 'stackFrameImpact is required'),
  gcLifecycleImpact: z.string().min(3, 'gcLifecycleImpact is required'),
  cacheLocality: CacheLocalityRatingSchema,
  notes: z.string().min(5, 'notes on memory layout are required'),
});
export type MemoryImpactDTO = z.infer<typeof MemoryImpactSchema>;

export const LanguageSyntaxBreakdownSchema = z.object({
  targetLanguage: TargetLanguageSchema,
  primaryConstruct: z.string().min(2, 'primaryConstruct is required'),
  astNodeType: z.string().optional(),
  runtimeMechanism: z.string().min(10, 'runtimeMechanism explanation is required'),
  commonPitfalls: z.array(z.string().min(5)).min(1, 'At least one common pitfall must be listed'),
  learningObjective: z.string().min(5, 'learningObjective is required'),
});
export type LanguageSyntaxBreakdownDTO = z.infer<typeof LanguageSyntaxBreakdownSchema>;

export const TradeOffAnalysisSchema = z.object({
  pros: z.array(z.string().min(3)).min(1, 'At least one pro required'),
  cons: z.array(z.string().min(3)).min(1, 'At least one con required'),
  readability: QualitativeScoreSchema,
  maintainability: QualitativeScoreSchema,
  productionSuitability: z.string().min(5, 'productionSuitability is required'),
});
export type TradeOffAnalysisDTO = z.infer<typeof TradeOffAnalysisSchema>;

/**
 * Trade-offs schema supporting either a structured analytical breakdown (TradeOffAnalysisDTO)
 * or a concise string array (per PROJECT.md interface contract).
 */
export const SmartCardTradeOffsSchema = z.union([
  TradeOffAnalysisSchema,
  z.array(z.string()),
]);
export type SmartCardTradeOffs = z.infer<typeof SmartCardTradeOffsSchema>;

export const SmartCardSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  variant: SolutionApproachSchema,
  title: z.string().min(3, 'title must be at least 3 characters'),
  codeSnippet: z.string().min(1, 'codeSnippet cannot be empty'),
  whyItWorks: z.string().min(10, 'whyItWorks must provide meaningful explanation'),
  complexity: ComplexityMetricSchema,
  memoryImpact: MemoryImpactSchema,
  languageBreakdown: LanguageSyntaxBreakdownSchema,
  tradeOffs: SmartCardTradeOffsSchema,
  clozeChallenge: z.lazy(() => ClozeChallengeSchema).optional(),
  clozeChallengeId: z.string().uuid().optional(),
  typeAlongPracticeId: z.string().uuid().optional(),
  // Convenience aliases for PROJECT.md compatibility
  bigO: z
    .object({
      time: z.string(),
      space: z.string(),
    })
    .optional(),
  memoryAllocation: z
    .object({
      heap: z.string(),
      stack: z.string(),
      notes: z.string(),
    })
    .optional(),
  languageIdiom: z
    .object({
      language: z.string(),
      concept: z.string(),
      breakdown: z.string(),
    })
    .optional(),
});
export type SmartCardDTO = z.infer<typeof SmartCardSchema>;
