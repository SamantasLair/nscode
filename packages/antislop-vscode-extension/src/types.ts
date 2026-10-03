import type * as vscode from 'vscode';
import type {
  HighlightLinePayload,
  ActiveBufferResult,
  LspDiagnosticDTO,
} from '@antislop/protocol';

export interface HighlightOptions {
  preserveFocus?: boolean;
  clearPrevious?: boolean;
}

export interface HighlightState {
  fileUri: string;
  line: number;
  endLine?: number;
  range: vscode.Range;
}

export interface WatchdogClientOptions {
  url?: string;
  authToken?: string;
  sidecarBinPath?: string;
  heartbeatIntervalMs?: number;
  reconnectTimeoutMs?: number;
}

export type StatusListener = (connected: boolean, latencyMs: number) => void;
export type NotificationListener = (method: string, params: unknown) => void;

export interface TerminalWatcherOptions {
  onTerminalError?: (trace: string, exitCode: number) => void;
}

export interface LspDiagnosticsOptions {
  debounceMs?: number;
  onDiagnosticsChanged?: (uri: string, diagnostics: LspDiagnosticDTO[]) => void;
}
