import * as vscode from 'vscode';
import type { WatchdogClient } from './watchdog-client.js';
import type { TerminalWatcherOptions } from './types.js';

export class TerminalWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastCapturedError: { trace: string; exitCode: number } | null = null;

  constructor(
    private readonly watchdogClient?: WatchdogClient,
    private readonly options: TerminalWatcherOptions = {}
  ) {
    this.registerListeners();
  }

  private registerListeners(): void {
    const windowAny = vscode.window as any;
    if (typeof windowAny.onDidEndTerminalShellExecution === 'function') {
      this.disposables.push(
        windowAny.onDidEndTerminalShellExecution(async (event: any) => {
          if (event.exitCode !== undefined && event.exitCode !== 0) {
            let trace = '';
            if (event.execution && typeof event.execution.read === 'function') {
              try {
                const stream = event.execution.read();
                for await (const chunk of stream) {
                  trace += String(chunk);
                }
              } catch (err) {
                console.warn('[TerminalWatcher] Failed to read execution stream:', err);
              }
            }

            const cleanTrace = this.stripAnsi(trace || `Command failed with exit code ${event.exitCode}`);
            await this.handleTerminalError(cleanTrace, event.exitCode);
          }
        })
      );
    }

    if (typeof vscode.window.onDidCloseTerminal === 'function') {
      this.disposables.push(
        vscode.window.onDidCloseTerminal(async (terminal) => {
          if (terminal.exitStatus && terminal.exitStatus.code !== undefined && terminal.exitStatus.code !== 0) {
            const fallbackTrace = `Terminal '${terminal.name}' exited abnormally with exit code ${terminal.exitStatus.code}`;
            await this.handleTerminalError(fallbackTrace, terminal.exitStatus.code);
          }
        })
      );
    }
  }

  public async handleTerminalError(trace: string, exitCode: number): Promise<void> {
    this.lastCapturedError = { trace, exitCode };

    if (this.options.onTerminalError) {
      this.options.onTerminalError(trace, exitCode);
    }

    if (this.watchdogClient && this.watchdogClient.getIsConnected()) {
      try {
        await this.watchdogClient.sendRequest('diagnostics.analyzeError', {
          correlationId: `term-${Date.now()}`,
          errorTrace: trace,
          exitCode,
          source: 'terminal',
        });
      } catch (err) {
        console.warn('[TerminalWatcher] Failed to forward error to sidecar:', err);
      }
    }
  }

  public getLastCapturedError(): { trace: string; exitCode: number } | null {
    return this.lastCapturedError;
  }

  public stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
