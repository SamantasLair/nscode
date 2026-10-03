import type { WebSocket } from 'ws';
import type {
  ActiveBufferResult,
  TerminalBufferResult,
  GitDiffResult,
  LspDiagnosticsResult,
  SmartCardDTO,
  ContractViolatedDTO,
} from '@antislop/protocol';

export interface ClientSession {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  connectedAt: number;
  lastPingTimestamp: number;
  missedPings: number;
  clientIp: string;
}

export interface SidecarServerOptions {
  port?: number;
  host?: string;
  authToken?: string;
  watchdogIntervalMs?: number;
  maxMissedPings?: number;
  pedagogicalEngine?: IPedagogicalEngine;
  contextAggregator?: IContextAggregator;
}

export interface IContextProvider<T> {
  name: string;
  provideContext(): Promise<T>;
}

export interface AggregatedContext {
  activeBuffer?: ActiveBufferResult;
  terminalBuffer?: TerminalBufferResult;
  gitDiff?: GitDiffResult;
  lspDiagnostics?: LspDiagnosticsResult;
}

export interface IContextAggregator {
  getActiveBuffer(): Promise<ActiveBufferResult>;
  getTerminalBuffer(lines?: number): Promise<TerminalBufferResult>;
  getGitDiff(stagedOnly?: boolean, fileUri?: string): Promise<GitDiffResult>;
  getLspDiagnostics(uri?: string): Promise<LspDiagnosticsResult>;
  aggregateAll(uri?: string): Promise<AggregatedContext>;
  setActiveBufferProvider(provider: () => Promise<ActiveBufferResult>): void;
  setTerminalBufferProvider(provider: (lines?: number) => Promise<TerminalBufferResult>): void;
  setGitDiffProvider(provider: (stagedOnly?: boolean, fileUri?: string) => Promise<GitDiffResult>): void;
  setLspDiagnosticsProvider(provider: (uri?: string) => Promise<LspDiagnosticsResult>): void;
}

export interface IPedagogicalEngine {
  analyzeError(params: {
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
  }>;
}
