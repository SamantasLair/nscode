import { z } from 'zod';
import { TextSpanRangeSchema } from './error-anatomy.js';
import { SmartCardSchema } from './smart-card.js';

// ==========================================
// 1. JSON-RPC 2.0 Base Primitives & Constants
// ==========================================

export const JSONRPC_VERSION = '2.0' as const;
export type JsonRpcVersion = typeof JSONRPC_VERSION;

export const JSONRPC_ERROR_CODES = {
  // Standard JSON-RPC 2.0 codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Server error range (-32000 to -32099) reserved for application protocol invariants
  PROTOCOL_INVARIANT_VIOLATION: -32000,
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
} as const;

export type JsonRpcErrorCode =
  | (typeof JSONRPC_ERROR_CODES)[keyof typeof JSONRPC_ERROR_CODES]
  | number;

export const JsonRpcVersionSchema = z.literal('2.0');

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);

export const JsonRpcResponseIdSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
]);

export const JsonRpcErrorCodeSchema = z.number().int();

export const JsonRpcErrorObjectSchema = z.object({
  code: JsonRpcErrorCodeSchema,
  message: z.string().min(1),
  data: z.unknown().optional(),
});

export type JsonRpcId = string | number | null;

export interface JsonRpcErrorObject<TData = unknown> {
  code: JsonRpcErrorCode;
  message: string;
  data?: TData;
}

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: JsonRpcVersion;
  id: string | number;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = unknown> {
  jsonrpc: JsonRpcVersion;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: JsonRpcVersion;
  id: string | number | null;
  result: TResult;
}

export interface JsonRpcErrorResponse<TData = unknown> {
  jsonrpc: JsonRpcVersion;
  id: string | number | null;
  error: JsonRpcErrorObject<TData>;
}

export type JsonRpcResponse<TResult = unknown, TData = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse<TData>;

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export type JsonRpcBatch = JsonRpcMessage[];

// ==========================================
// 2. Read-Only Method Whitelist
// ==========================================

export const READ_ONLY_RPC_METHODS = [
  'rpc.ping',
  'diagnostics.analyzeError',
  'context.getActiveBuffer',
  'context.getTerminalBuffer',
  'context.getGitDiff',
  'context.getLspDiagnostics',
] as const;

export const READ_ONLY_METHODS = READ_ONLY_RPC_METHODS;

export const ReadOnlyMethodSchema = z.enum(READ_ONLY_RPC_METHODS);
export type ReadOnlyMethod = z.infer<typeof ReadOnlyMethodSchema>;
export type ReadOnlyRpcMethod = ReadOnlyMethod;

export function isReadOnlyRpcMethod(method: string): method is ReadOnlyRpcMethod {
  return (READ_ONLY_RPC_METHODS as readonly string[]).includes(method);
}

export function isReadOnlyMethod(method: string): method is ReadOnlyMethod {
  return isReadOnlyRpcMethod(method);
}

// ==========================================
// 3. Shared Position & Range DTOs
// ==========================================

export const PositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
export type PositionDTO = z.infer<typeof PositionSchema>;

export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});
export type RangeDTO = z.infer<typeof RangeSchema>;

export const LspDiagnosticSeveritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type LspDiagnosticSeverity = z.infer<typeof LspDiagnosticSeveritySchema>;

export const LspDiagnosticSchema = z.object({
  uri: z.string().min(1),
  range: RangeSchema,
  severity: LspDiagnosticSeveritySchema,
  code: z.union([z.string(), z.number()]).optional(),
  source: z.string().optional(),
  message: z.string().min(1),
  relatedInformation: z
    .array(
      z.object({
        uri: z.string(),
        range: RangeSchema,
        message: z.string(),
      })
    )
    .optional(),
});
export type LspDiagnosticDTO = z.infer<typeof LspDiagnosticSchema>;

// ==========================================
// 4. Method Parameter Schemas (Requests)
// ==========================================

export const PingParamsSchema = z
  .object({
    timestamp: z.number().optional(),
    nonce: z.string().optional(),
  })
  .optional();
export type PingParams = z.infer<typeof PingParamsSchema>;

export const AnalyzeErrorParamsSchema = z.object({
  correlationId: z.string().uuid().or(z.string().min(1)).optional(),
  errorTrace: z.string().min(1, 'errorTrace cannot be empty'),
  source: z.enum(['terminal', 'lsp', 'test_assertion', 'manual']),
  languageId: z.string().optional(),
  exitCode: z.number().int().nullable().optional(),
  fileUri: z.string().optional(),
  triggerLine: z.number().int().positive().optional(),
  activeBufferSnippet: z.string().optional(),
});
export type AnalyzeErrorParams = z.infer<typeof AnalyzeErrorParamsSchema>;

export const GetActiveBufferParamsSchema = z
  .object({
    includeFileTree: z.boolean().optional(),
    surroundingLines: z.number().int().positive().optional(),
  })
  .optional();
export type GetActiveBufferParams = z.infer<typeof GetActiveBufferParamsSchema>;

export const GetTerminalBufferParamsSchema = z
  .object({
    lines: z.number().int().min(1).max(5000).default(500).optional(),
    terminalId: z.string().optional(),
  })
  .optional();
export type GetTerminalBufferParams = z.infer<typeof GetTerminalBufferParamsSchema>;

export const GetGitDiffParamsSchema = z
  .object({
    stagedOnly: z.boolean().default(false).optional(),
    fileUri: z.string().optional(),
  })
  .optional();
export type GetGitDiffParams = z.infer<typeof GetGitDiffParamsSchema>;

export const GetLspDiagnosticsParamsSchema = z
  .object({
    uri: z.string().optional(),
    minSeverity: LspDiagnosticSeveritySchema.optional(),
  })
  .optional();
export type GetLspDiagnosticsParams = z.infer<typeof GetLspDiagnosticsParamsSchema>;

// ==========================================
// 5. Method Result Schemas (Responses)
// ==========================================

export const PingResultSchema = z.object({
  status: z.literal('pong'),
  timestamp: z.number(),
  uptimeSeconds: z.number().nonnegative().optional().default(0),
  version: z.string().min(1).optional().default('0.1.0'),
});
export type PingResult = z.infer<typeof PingResultSchema>;

export const AnalyzeErrorResultSchema = z.object({
  correlationId: z.string().min(1),
  accepted: z.boolean(),
  timestamp: z.number(),
  estimatedTokens: z.number().optional(),
});
export type AnalyzeErrorResult = z.infer<typeof AnalyzeErrorResultSchema>;

export const ActiveBufferResultSchema = z.object({
  uri: z.string().min(1),
  fileName: z.string().min(1),
  languageId: z.string().min(1),
  content: z.string(),
  version: z.number().int(),
  isDirty: z.boolean(),
  lineCount: z.number().int().nonnegative(),
  selection: RangeSchema.optional(),
  visibleRange: z
    .object({
      startLine: z.number().int().nonnegative(),
      endLine: z.number().int().nonnegative(),
    })
    .optional(),
});
export type ActiveBufferResult = z.infer<typeof ActiveBufferResultSchema>;

export const TerminalBufferResultSchema = z.object({
  terminalId: z.string().min(1),
  lines: z.array(z.string()),
  lastExitCode: z.number().int().nullable(),
  command: z.string().optional(),
  timestamp: z.number(),
});
export type TerminalBufferResult = z.infer<typeof TerminalBufferResultSchema>;

export const GitDiffResultSchema = z.object({
  isRepository: z.boolean(),
  branch: z.string().optional(),
  diff: z.string(),
  filesChangedCount: z.number().int().nonnegative(),
  staged: z.boolean(),
});
export type GitDiffResult = z.infer<typeof GitDiffResultSchema>;

export const LspDiagnosticsResultSchema = z.object({
  diagnostics: z.array(LspDiagnosticSchema),
  totalCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
});
export type LspDiagnosticsResult = z.infer<typeof LspDiagnosticsResultSchema>;

// ==========================================
// 6. Generic Framing Schemas
// ==========================================

export const JsonRpcRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcIdSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export const JsonRpcSuccessResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcResponseIdSchema,
  result: z.unknown(),
});

export const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: JsonRpcResponseIdSchema,
  error: JsonRpcErrorObjectSchema,
});

export const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
]);

export const JsonRpcMessageSchema = z.union([
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
]);

// ==========================================
// 7. Notification Event Schemas
// ==========================================

export const TokenChunkParamsSchema = z.object({
  correlationId: z.string().min(1),
  token: z.string(),
  targetZone: z.enum(['top_contract', 'deep_syntax', 'smart_cards']),
  sequenceNumber: z.number().int().nonnegative(),
  isLastChunk: z.boolean().optional(),
});
export type TokenChunkParams = z.infer<typeof TokenChunkParamsSchema>;

export const ContractViolatedNotificationParamsSchema = z.object({
  correlationId: z.string().min(1),
  contractViolated: z.string().min(1),
  rule: z.string().min(1),
  brokenInvariant: z.string().min(1),
  explanation: z.string().min(1),
  targetFile: z.string().min(1),
  targetRange: TextSpanRangeSchema,
  languageId: z.string().min(1),
});
export type ContractViolatedNotificationParams = z.infer<
  typeof ContractViolatedNotificationParamsSchema
>;

export const SmartCardsReadyNotificationParamsSchema = z.object({
  correlationId: z.string().min(1),
  cards: z.array(SmartCardSchema).min(1),
});
export type SmartCardsReadyNotificationParams = z.infer<
  typeof SmartCardsReadyNotificationParamsSchema
>;

export const AnalysisCompletedNotificationParamsSchema = z.object({
  correlationId: z.string().min(1),
  durationMs: z.number().nonnegative(),
  cardCount: z.number().int().nonnegative(),
});
export type AnalysisCompletedNotificationParams = z.infer<
  typeof AnalysisCompletedNotificationParamsSchema
>;

export const AnalysisFailedNotificationParamsSchema = z.object({
  correlationId: z.string().min(1),
  error: z.string().min(1),
  recoverable: z.boolean(),
});
export type AnalysisFailedNotificationParams = z.infer<
  typeof AnalysisFailedNotificationParamsSchema
>;

export const HeartbeatNotificationParamsSchema = z.object({
  timestamp: z.number(),
  daemonUptime: z.number().nonnegative(),
  memoryUsageMb: z.number().nonnegative(),
});
export type HeartbeatNotificationParams = z.infer<
  typeof HeartbeatNotificationParamsSchema
>;

// ==========================================
// 8. Zero-Mutation Protocol Guard & Router Helpers
// ==========================================

export interface ZeroMutationRejectionData {
  method: string;
  violationType: 'ZERO_MUTATION_INVARIANT_VIOLATION' | 'UNKNOWN_METHOD';
  zeroMutationInvariant: true;
  allowedMethods: readonly string[];
  timestamp: number;
}

export function createMethodNotFoundError(
  id: string | number | null,
  methodName: string
): JsonRpcErrorResponse<ZeroMutationRejectionData> {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message:
        'Method not found: write/mutation operations are strictly prohibited by the Zero-Mutation Invariant',
      data: {
        method: methodName,
        violationType: 'ZERO_MUTATION_INVARIANT_VIOLATION',
        zeroMutationInvariant: true,
        allowedMethods: READ_ONLY_RPC_METHODS,
        timestamp: Date.now(),
      },
    },
  };
}

export function validateIncomingRequest(raw: unknown):
  | {
      success: true;
      request: z.infer<typeof JsonRpcRequestSchema>;
      method: ReadOnlyMethod;
    }
  | { success: false; errorResponse: JsonRpcErrorResponse } {
  const parseResult = JsonRpcRequestSchema.safeParse(raw);
  if (!parseResult.success) {
    const rawId =
      raw &&
      typeof raw === 'object' &&
      'id' in raw &&
      (typeof (raw as any).id === 'string' || typeof (raw as any).id === 'number')
        ? (raw as any).id
        : null;

    return {
      success: false,
      errorResponse: {
        jsonrpc: '2.0',
        id: rawId,
        error: {
          code: -32600, // Invalid Request
          message:
            'Invalid Request: JSON payload does not conform to JSON-RPC 2.0 Request framing',
          data: parseResult.error.format(),
        },
      },
    };
  }

  const req = parseResult.data;
  const methodCheck = ReadOnlyMethodSchema.safeParse(req.method);
  if (!methodCheck.success) {
    return {
      success: false,
      errorResponse: createMethodNotFoundError(req.id, req.method),
    };
  }

  return {
    success: true,
    request: req,
    method: methodCheck.data,
  };
}
