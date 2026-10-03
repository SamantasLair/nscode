import {
  validateIncomingRequest,
  createMethodNotFoundError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcErrorResponse,
  type JsonRpcNotification,
  type TokenChunkParams,
  type ContractViolatedDTO,
  type SmartCardDTO,
} from '@antislop/protocol';
import type { ContextAggregator } from './context-aggregator.js';
import type { PedagogicalEngine } from './pedagogical-engine.js';
import { StreamBatcher } from './stream-batcher.js';

export type NotificationSender = (notification: JsonRpcNotification<unknown>) => void;

export interface RpcRouterOptions {
  contextAggregator: ContextAggregator;
  pedagogicalEngine: PedagogicalEngine;
}

export class RpcRouter {
  private contextAggregator: ContextAggregator;
  private pedagogicalEngine: PedagogicalEngine;

  constructor(options: RpcRouterOptions) {
    this.contextAggregator = options.contextAggregator;
    this.pedagogicalEngine = options.pedagogicalEngine;
  }

  public async handleMessage(
    rawMessage: string,
    sendNotification?: NotificationSender
  ): Promise<string | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch (err) {
      const parseErrorResponse: JsonRpcErrorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error: Invalid JSON was received by the server',
          data: err instanceof Error ? err.message : String(err),
        },
      };
      return JSON.stringify(parseErrorResponse);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request: empty batch',
          },
        });
      }
      const responses: JsonRpcResponse<unknown>[] = [];
      for (const item of parsed) {
        const resp = await this.executeSingleRequest(item, sendNotification);
        if (resp) {
          responses.push(resp);
        }
      }
      return responses.length > 0 ? JSON.stringify(responses) : null;
    }

    const response = await this.executeSingleRequest(parsed, sendNotification);
    return response ? JSON.stringify(response) : null;
  }

  public async executeSingleRequest(
    raw: unknown,
    sendNotification?: NotificationSender
  ): Promise<JsonRpcResponse<unknown> | null> {
    const validation = validateIncomingRequest(raw);

    if (!validation.success) {
      return validation.errorResponse;
    }

    const req = validation.request;

    // In JSON-RPC 2.0, if request has no ID, it is a notification and must not receive a response
    const isNotification = req.id === undefined || req.id === null;

    try {
      switch (validation.method) {
        case 'rpc.ping': {
          const result = {
            status: 'pong' as const,
            timestamp: Date.now(),
            uptimeSeconds: Math.floor(process.uptime()),
            version: '0.1.0',
          };
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        case 'diagnostics.analyzeError': {
          const params = (req.params as Record<string, unknown>) || {};
          const correlationId =
            typeof params.correlationId === 'string' && params.correlationId.length > 0
              ? params.correlationId
              : `corr-${Date.now()}`;

          // Start asynchronous streaming process if sendNotification is provided
          if (sendNotification) {
            this.runStreamingAnalysis(params, correlationId, sendNotification).catch((err) => {
              sendNotification({
                jsonrpc: '2.0',
                method: 'diagnostics.analysisFailed',
                params: {
                  correlationId,
                  errorMessage: err instanceof Error ? err.message : String(err),
                  timestamp: Date.now(),
                },
              });
            });
          }

          const result = {
            correlationId,
            accepted: true,
            timestamp: Date.now(),
            estimatedTokens: 120,
          };
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        case 'context.getActiveBuffer': {
          const result = await this.contextAggregator.getActiveBuffer();
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        case 'context.getTerminalBuffer': {
          const params = (req.params as Record<string, unknown>) || {};
          const lines = typeof params.lines === 'number' ? params.lines : 500;
          const result = await this.contextAggregator.getTerminalBuffer(lines);
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        case 'context.getGitDiff': {
          const params = (req.params as Record<string, unknown>) || {};
          const stagedOnly = Boolean(params.stagedOnly);
          const fileUri = typeof params.fileUri === 'string' ? params.fileUri : undefined;
          const result = await this.contextAggregator.getGitDiff(stagedOnly, fileUri);
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        case 'context.getLspDiagnostics': {
          const params = (req.params as Record<string, unknown>) || {};
          const uri = typeof params.uri === 'string' ? params.uri : undefined;
          const result = await this.contextAggregator.getLspDiagnostics(uri);
          return isNotification ? null : { jsonrpc: '2.0', id: req.id, result };
        }

        default: {
          return createMethodNotFoundError(req.id, (req as any).method || 'unknown');
        }
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32603,
          message: 'Internal JSON-RPC error occurred',
          data: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async runStreamingAnalysis(
    params: Record<string, unknown>,
    correlationId: string,
    sendNotification: NotificationSender
  ): Promise<void> {
    const startTime = Date.now();
    const aggregatedContext = await this.contextAggregator.aggregateAll(
      typeof params.fileUri === 'string' ? params.fileUri : undefined
    );

    const { contractViolated, cards } = await this.pedagogicalEngine.analyzeError({
      correlationId,
      rawError: typeof params.rawError === 'string' ? params.rawError : undefined,
      fileUri: typeof params.fileUri === 'string' ? params.fileUri : undefined,
      languageId: typeof params.languageId === 'string' ? params.languageId : undefined,
      exitCode: typeof params.exitCode === 'number' ? params.exitCode : undefined,
      stackTrace: typeof params.stackTrace === 'string' ? params.stackTrace : undefined,
      context: aggregatedContext,
    });

    // 1. Emit Contract Violated notification
    sendNotification({
      jsonrpc: '2.0',
      method: 'diagnostics.contractViolated',
      params: contractViolated,
    });

    // 2. Stream tokens via StreamBatcher (50ms batching backpressure)
    const batcher = new StreamBatcher({
      batchIntervalMs: 50,
      correlationId,
      targetZone: 'top_contract',
      emitter: (chunk: TokenChunkParams) => {
        sendNotification({
          jsonrpc: '2.0',
          method: 'diagnostics.tokenChunk',
          params: chunk,
        });
      },
    });

    const explanationWords = contractViolated.ruleExplanation.split(' ');
    for (const word of explanationWords) {
      batcher.push(word + ' ');
    }
    batcher.complete();

    // 3. Emit Smart Cards Ready notification
    sendNotification({
      jsonrpc: '2.0',
      method: 'diagnostics.smartCardsReady',
      params: {
        correlationId,
        cards,
      },
    });

    // 4. Emit Analysis Completed notification
    sendNotification({
      jsonrpc: '2.0',
      method: 'diagnostics.analysisCompleted',
      params: {
        correlationId,
        durationMs: Date.now() - startTime,
        cardCount: cards.length,
      },
    });
  }
}
