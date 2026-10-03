import * as vscode from 'vscode';
import type { LspDiagnosticDTO } from '@antislop/protocol';
import type { WatchdogClient } from './watchdog-client.js';
import type { LspDiagnosticsOptions } from './types.js';

export class LspDiagnosticsWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private latestDiagnosticsByUri = new Map<string, LspDiagnosticDTO[]>();

  constructor(
    private readonly watchdogClient?: WatchdogClient,
    private readonly options: LspDiagnosticsOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 300;
    this.registerListener();
  }

  private registerListener(): void {
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((event) => {
        this.handleDiagnosticsChange(event);
      })
    );
  }

  private handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      for (const uri of event.uris) {
        const vsDiagnostics = vscode.languages.getDiagnostics(uri);
        const dtos = this.convertDiagnostics(uri, vsDiagnostics);
        this.latestDiagnosticsByUri.set(uri.toString(), dtos);

        if (this.options.onDiagnosticsChanged) {
          this.options.onDiagnosticsChanged(uri.toString(), dtos);
        }
      }
    }, this.debounceMs);
  }

  /**
   * Converts VS Code Diagnostic objects into protocol-compliant DiagnosticDTOs.
   * Maps 0-indexed VS Code severities to 1-4 LSP severities:
   * Error (0 -> 1), Warning (1 -> 2), Information (2 -> 3), Hint (3 -> 4)
   */
  public convertDiagnostics(
    uri: vscode.Uri,
    diagnostics: readonly vscode.Diagnostic[]
  ): LspDiagnosticDTO[] {
    return diagnostics.map((diag) => {
      const codeVal =
        typeof diag.code === 'object' && diag.code !== null
          ? String(diag.code.value)
          : diag.code !== undefined
          ? String(diag.code)
          : undefined;

      const severity = Math.min(
        4,
        Math.max(1, (diag.severity ?? 0) + 1)
      ) as 1 | 2 | 3 | 4;

      return {
        uri: uri.toString(),
        message: diag.message,
        severity,
        source: diag.source,
        code: codeVal,
        range: {
          start: {
            line: diag.range.start.line,
            character: diag.range.start.character,
          },
          end: {
            line: diag.range.end.line,
            character: diag.range.end.character,
          },
        },
      };
    });
  }

  public getDiagnosticsForUri(uri: string): LspDiagnosticDTO[] {
    return this.latestDiagnosticsByUri.get(uri) ?? [];
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
