import { z } from 'zod';

export const DiagnosticSeveritySchema = z.enum(['fatal', 'error', 'warning']);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

export const IngressVectorSchema = z.enum([
  'terminal',
  'lsp',
  'test_assertion',
  'manual',
]);
export type IngressVector = z.infer<typeof IngressVectorSchema>;

export const DiagnosticCategorySchema = z.enum([
  'memory_safety',
  'type_contract',
  'concurrency',
  'resource_leak',
  'logic_assertion',
  'syntax_parse',
  'runtime_exception',
]);
export type DiagnosticCategory = z.infer<typeof DiagnosticCategorySchema>;

export const SpanSemanticRoleSchema = z.enum([
  'primary_fault',
  'allocation',
  'deallocation',
  'move_ownership',
  'first_borrow',
  'reborrow',
  'declaration',
  'mutation',
]);
export type SpanSemanticRole = z.infer<typeof SpanSemanticRoleSchema>;

export const TextSpanRangeSchema = z
  .object({
    startLine: z.number().int().min(1, 'startLine must be >= 1'),
    startColumn: z.number().int().min(1, 'startColumn must be >= 1'),
    endLine: z.number().int().min(1, 'endLine must be >= 1'),
    endColumn: z.number().int().min(1, 'endColumn must be >= 1'),
  })
  .refine(
    (data) =>
      data.endLine > data.startLine ||
      (data.endLine === data.startLine && data.endColumn >= data.startColumn),
    { message: 'end position must be greater than or equal to start position' }
  );
export type TextSpanRange = z.infer<typeof TextSpanRangeSchema>;

export const SourceSpanSchema = z.object({
  fileUri: z.string().min(1, 'fileUri must not be empty'),
  range: TextSpanRangeSchema,
  label: z.string().min(1, 'label must not be empty'),
});
export type SourceSpanDTO = z.infer<typeof SourceSpanSchema>;

export const RelatedSpanSchema = z.object({
  fileUri: z.string().optional(),
  range: TextSpanRangeSchema,
  label: z.string().min(1, 'label must not be empty'),
  role: SpanSemanticRoleSchema,
});
export type RelatedSpanDTO = z.infer<typeof RelatedSpanSchema>;

export const ContractViolatedSchema = z.object({
  id: z.string().uuid(),
  errorCode: z.string().min(1, 'errorCode is required'),
  category: DiagnosticCategorySchema,
  title: z.string().min(3, 'title must be at least 3 characters'),
  contract: z.string().min(10, 'contract must be a rigorous formal explanation'),
  ruleExplanation: z.string().min(10, 'ruleExplanation is required'),
  rootCause: z.string().min(10, 'rootCause breakdown is required'),
  mentalModel: z.string().min(10, 'mentalModel explanation is required'),
  sourceLocation: SourceSpanSchema,
  relatedSpans: z.array(RelatedSpanSchema).default([]),
  ingressVector: IngressVectorSchema,
  rawError: z.string().min(1, 'rawError excerpt is required'),
  severity: DiagnosticSeveritySchema,
  timestamp: z.number().int().positive(),
});
export type ContractViolatedDTO = z.infer<typeof ContractViolatedSchema>;
