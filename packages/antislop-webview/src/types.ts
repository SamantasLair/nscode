import type {
  ContractViolatedDTO,
  SmartCardDTO,
} from '@antislop/protocol';

export interface DiagnosticState {
  contractViolated: ContractViolatedDTO | null;
  streamingTokens: string;
  isStreaming: boolean;
  cards: SmartCardDTO[];
  activeFileUri: string | null;
  activeLanguageId: string | null;
  watchdogConnected: boolean;
  watchdogLatencyMs: number;
  isAnalyzing: boolean;
  error: string | null;
}
