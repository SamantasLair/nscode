import * as vscode from 'vscode';
import { DecorationManager } from './decoration-manager.js';
import { ScreenBWebviewProvider } from './webview-provider.js';
import { WatchdogClient } from './watchdog-client.js';
import { TerminalWatcher } from './terminal-watcher.js';
import { LspDiagnosticsWatcher } from './lsp-diagnostics.js';
import type { HighlightLinePayload, ActiveBufferResult } from '@antislop/protocol';

let decorationManager: DecorationManager | null = null;
let webviewProvider: ScreenBWebviewProvider | null = null;
let watchdogClient: WatchdogClient | null = null;
let terminalWatcher: TerminalWatcher | null = null;
let lspWatcher: LspDiagnosticsWatcher | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  decorationManager = new DecorationManager();

  const config = vscode.workspace.getConfiguration('antislop');
  const sidecarUrl = config.get<string>('sidecar.url', 'ws://127.0.0.1:4949');
  const sidecarToken = config.get<string>('sidecar.token', '');

  watchdogClient = new WatchdogClient({
    url: sidecarUrl,
    authToken: sidecarToken,
  });

  webviewProvider = new ScreenBWebviewProvider(
    context.extensionUri,
    decorationManager,
    watchdogClient
  );

  watchdogClient.onStatusChange((connected, latencyMs) => {
    if (webviewProvider) {
      webviewProvider.postMessage({
        type: 'WATCHDOG_STATUS',
        payload: { connected, latencyMs: Math.max(0, latencyMs) },
      });
    }
  });

  watchdogClient.onNotification((method: string, params: unknown) => {
    if (webviewProvider) {
      webviewProvider.postMessage({
        type: 'DIAGNOSTIC_DATA',
        payload: { method, params },
      });
    }
  });

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document) {
        const uri = editor.document.uri.toString();
        const languageId = editor.document.languageId;

        if (webviewProvider) {
          webviewProvider.postMessage({
            type: 'SET_ACTIVE_FILE',
            payload: { fileUri: uri, languageId },
          });
        }

        if (watchdogClient) {
          const buffer: ActiveBufferResult = {
            uri,
            fileName: editor.document.fileName,
            languageId,
            content: editor.document.getText(),
            version: editor.document.version,
            isDirty: editor.document.isDirty,
            lineCount: editor.document.lineCount,
          };
          watchdogClient.updateActiveBuffer(buffer);
        }
      }
    })
  );

  terminalWatcher = new TerminalWatcher(watchdogClient);
  lspWatcher = new LspDiagnosticsWatcher(watchdogClient);

  const openCmd = vscode.commands.registerCommand(
    'antislop.openDiagnosticScreen',
    () => {
      webviewProvider?.show(true);
    }
  );

  const openAliasCmd = vscode.commands.registerCommand(
    'antislop.openScreenB',
    () => {
      webviewProvider?.show(true);
    }
  );

  const clearCmd = vscode.commands.registerCommand(
    'antislop.clearHighlights',
    () => {
      decorationManager?.clearHighlights();
      webviewProvider?.postMessage({ type: 'CLEAR_HIGHLIGHTS' });
    }
  );

  const highlightCmd = vscode.commands.registerCommand(
    'antislop.highlightLine',
    async (payload: HighlightLinePayload) => {
      if (decorationManager) {
        await decorationManager.highlightLine(payload);
      }
    }
  );

  context.subscriptions.push(
    decorationManager,
    watchdogClient,
    webviewProvider,
    terminalWatcher,
    lspWatcher,
    openCmd,
    openAliasCmd,
    clearCmd,
    highlightCmd
  );

  // Auto-connect watchdog asynchronously (non-blocking)
  void watchdogClient.connect().catch((err) => {
    console.warn('[Extension] Initial watchdog connection notice:', err.message);
  });
}

export function deactivate(): void {
  decorationManager?.dispose();
  watchdogClient?.dispose();
  webviewProvider?.dispose();
  terminalWatcher?.dispose();
  lspWatcher?.dispose();

  decorationManager = null;
  watchdogClient = null;
  webviewProvider = null;
  terminalWatcher = null;
  lspWatcher = null;
}
