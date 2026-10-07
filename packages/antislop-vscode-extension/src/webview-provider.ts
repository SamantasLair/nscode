import * as vscode from 'vscode';
import {
  WebviewToExtensionMessageSchema,
  type ExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
} from '@antislop/protocol';
import type { DecorationManager } from './decoration-manager.js';
import type { WatchdogClient } from './watchdog-client.js';

export class ScreenBWebviewProvider implements vscode.Disposable {
  public static readonly viewType = 'antislop.screenB';
  private panel: vscode.WebviewPanel | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly messageListeners: Array<
    (message: WebviewToExtensionMessage) => void
  > = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly decorationManager: DecorationManager,
    private readonly watchdogClient?: WatchdogClient
  ) {}

  /**
   * Spawns or reveals the Screen B Webview panel in ViewColumn.Two.
   * Enforces retainContextWhenHidden: true.
   */
  public show(preserveFocus: boolean = true): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two, preserveFocus);
      return this.panel;
    }

    this.panel = vscode.window.createWebviewPanel(
      ScreenBWebviewProvider.viewType,
      'AntiSlop: Cognitive Diagnostics & Sandbox',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true, // INVIOLABLE: Retains active Cloze and typing progress
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'resources'),
        ],
      }
    );

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (rawMessage) => this.handleWebviewMessage(rawMessage),
      null,
      this.disposables
    );

    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      null,
      this.disposables
    );

    return this.panel;
  }

  public getPanel(): vscode.WebviewPanel | null {
    return this.panel;
  }

  public onMessage(listener: (message: WebviewToExtensionMessage) => void): vscode.Disposable {
    this.messageListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.messageListeners.indexOf(listener);
        if (idx !== -1) this.messageListeners.splice(idx, 1);
      },
    };
  }

  /**
   * Sends a typed message to the Webview.
   */
  public postMessage(message: ExtensionToWebviewMessage): boolean {
    if (!this.panel) return false;
    return Boolean(this.panel.webview.postMessage(message));
  }

  private async handleWebviewMessage(raw: unknown): Promise<void> {
    const parseResult = WebviewToExtensionMessageSchema.safeParse(raw);
    if (!parseResult.success) {
      console.warn('[WebviewProvider] Received invalid webview message:', parseResult.error);
      return;
    }

    const msg: WebviewToExtensionMessage = parseResult.data;

    for (const listener of this.messageListeners) {
      listener(msg);
    }

    switch (msg.type) {
      case 'HIGHLIGHT_LINE':
        await this.decorationManager.highlightLine(msg.payload);
        break;
      case 'REQUEST_ANALYSIS':
        if (this.watchdogClient) {
          await this.watchdogClient.requestAnalysis(msg.payload?.rawError);
        }
        break;
      case 'PRACTICE_COMPLETED':
        break;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; connect-src ${webview.cspSource} ws://127.0.0.1:4949 http://127.0.0.1:4949;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AntiSlop Screen B</title>
</head>
<body>
  <div id="root">
    <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--vscode-foreground);">
      <h2>AntiSlop Cognitive Diagnostics & Sandbox (Screen B)</h2>
      <p>Dual-screen active cognition system initialized in ViewColumn.Two.</p>
      <div id="connection-status">Connecting to Sidecar Daemon (ws://127.0.0.1:4949)...</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'WATCHDOG_STATUS') {
        const el = document.getElementById('connection-status');
        if (el) {
          el.innerText = msg.payload.connected 
            ? 'Connected to Sidecar (' + msg.payload.latencyMs + 'ms)' 
            : 'Disconnected from Sidecar (reconnecting...)';
        }
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
