import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('vscode', async () => {
  const mod = await import('./mocks/vscode-mock.js');
  return mod.mockVscode;
});

import { mockVscode, MockTextDocument, MockTextEditor } from './mocks/vscode-mock.js';

import {
  DecorationManager,
  ScreenBWebviewProvider,
  WatchdogClient,
  TerminalWatcher,
  LspDiagnosticsWatcher,
  activate,
  deactivate,
} from '../src/index.js';
import WebSocket, { WebSocketServer } from 'ws';
import type { HighlightLinePayload, ActiveBufferResult } from '@antislop/protocol';

describe('VS Code Extension: AntiSlop Active Cognition Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVscode.window.visibleTextEditors.length = 0;
  });

  describe('DecorationManager: Zero-Buffer Mutation Line Highlighting', () => {
    it('applies visual decorations without mutating document buffer or undo stack', async () => {
      const manager = new DecorationManager();
      const docUri = mockVscode.Uri.file('/workspace/app.ts');
      const doc = new MockTextDocument(docUri, 'line 1\nline 2\nconst x = 42;\nline 4\n', '/workspace/app.ts', 'typescript', false);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);

      const editor = new MockTextEditor(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      const payload: HighlightLinePayload = {
        fileUri: docUri.toString(),
        line: 3, // line 3: "const x = 42;"
      };

      const result = await manager.highlightLine(payload, { preserveFocus: true });
      expect(result).toBe(true);

      // INVIOLABLE ASSERTIONS:
      // 1. Zero edits: editor.edit() MUST NEVER be called
      expect(editor.editCalls).toHaveLength(0);

      // 2. Buffer untouched: document.isDirty MUST remain false
      expect(doc.isDirty).toBe(false);

      // 3. Visual decoration applied
      const decorations = editor.decorations.get(manager.getFaultDecorationType());
      expect(decorations).toBeDefined();
      expect(decorations).toHaveLength(1);
      expect(decorations![0].start.line).toBe(2); // 1-indexed line 3 -> 0-indexed line 2

      // 4. Focus preserved and revealed in center
      expect(editor.revealedRanges).toHaveLength(1);
      expect(editor.revealedRanges[0].range.start.line).toBe(2);
      expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(doc, {
        viewColumn: mockVscode.ViewColumn.One,
        preserveFocus: true,
      });

      manager.dispose();
    });

    it('clears stale highlights when switching active editor to a different file', async () => {
      const manager = new DecorationManager();
      const file1Uri = mockVscode.Uri.file('/workspace/file1.ts');
      const file2Uri = mockVscode.Uri.file('/workspace/file2.ts');

      const doc1 = new MockTextDocument(file1Uri);
      const editor1 = new MockTextEditor(doc1);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc1);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor1);

      await manager.highlightLine({ fileUri: file1Uri.toString(), line: 1 });
      expect(editor1.decorations.get(manager.getFaultDecorationType())).toHaveLength(1);

      // Simulate switching to file2
      const doc2 = new MockTextDocument(file2Uri);
      const editor2 = new MockTextEditor(doc2);
      mockVscode.window.simulateActiveEditorChange(editor2);

      // Highlight on editor1 must be cleared to prevent stale visual highlights
      expect(editor1.decorations.get(manager.getFaultDecorationType())).toEqual([]);
      expect(manager.getActiveHighlight()).toBeNull();

      manager.dispose();
    });

    it('clears highlights when highlighted document is closed', async () => {
      const manager = new DecorationManager();
      const docUri = mockVscode.Uri.file('/workspace/doc.ts');
      const doc = new MockTextDocument(docUri);
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      await manager.highlightLine({ fileUri: docUri.toString(), line: 2 });
      expect(manager.getActiveHighlight()).not.toBeNull();

      mockVscode.workspace.simulateDocumentClose(doc);
      expect(manager.getActiveHighlight()).toBeNull();

      manager.dispose();
    });

    it('clears all highlights across visible editors via clearHighlights()', async () => {
      const manager = new DecorationManager();
      const docUri = mockVscode.Uri.file('/workspace/test.ts');
      const doc = new MockTextDocument(docUri);
      const editor = new MockTextEditor(doc);
      mockVscode.window.visibleTextEditors.push(editor);

      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      await manager.highlightLine({ fileUri: docUri.toString(), line: 1 });
      expect(editor.decorations.get(manager.getFaultDecorationType())).toHaveLength(1);

      manager.clearHighlights();
      expect(editor.decorations.get(manager.getFaultDecorationType())).toEqual([]);

      manager.dispose();
    });
  });

  describe('ScreenBWebviewProvider: Dual-Screen Layout & Zod Protocol', () => {
    let decorationManager: DecorationManager;
    let provider: ScreenBWebviewProvider;

    beforeEach(() => {
      decorationManager = new DecorationManager();
      provider = new ScreenBWebviewProvider(
        mockVscode.Uri.file('/extension'),
        decorationManager
      );
    });

    afterEach(() => {
      provider.dispose();
      decorationManager.dispose();
    });

    it('spawns Webview in ViewColumn.Two with retainContextWhenHidden: true', () => {
      const panel = provider.show(true);
      expect(panel).toBeDefined();
      expect(panel.viewColumn).toBe(mockVscode.ViewColumn.Two);
      expect(panel.options.retainContextWhenHidden).toBe(true);
      expect(panel.options.enableScripts).toBe(true);
    });

    it('posts typed ExtensionToWebviewMessage to webview', () => {
      const panel = provider.show();
      const mockWebview = panel.webview as any;

      const sent = provider.postMessage({
        type: 'SET_ACTIVE_FILE',
        payload: { fileUri: 'file:///workspace/app.ts', languageId: 'typescript' },
      });

      expect(sent).toBe(true);
      expect(mockWebview.postedMessages).toHaveLength(1);
      expect(mockWebview.postedMessages[0].type).toBe('SET_ACTIVE_FILE');
    });

    it('handles HIGHLIGHT_LINE inbound message from webview and triggers decoration', async () => {
      const panel = provider.show();
      const mockWebview = panel.webview as any;
      const highlightSpy = vi.spyOn(decorationManager, 'highlightLine').mockResolvedValue(true);

      mockWebview.simulateMessage({
        type: 'HIGHLIGHT_LINE',
        payload: { fileUri: 'file:///workspace/main.ts', line: 10 },
      });

      // Allow microtask to process
      await new Promise((r) => setTimeout(r, 10));

      expect(highlightSpy).toHaveBeenCalledWith({
        fileUri: 'file:///workspace/main.ts',
        line: 10,
      });
    });

    it('safely ignores malformed or unvalidated messages without throwing', async () => {
      const panel = provider.show();
      const mockWebview = panel.webview as any;
      const highlightSpy = vi.spyOn(decorationManager, 'highlightLine');

      // Invalid line coordinate (-5)
      mockWebview.simulateMessage({
        type: 'HIGHLIGHT_LINE',
        payload: { fileUri: 'file:///workspace/main.ts', line: -5 },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(highlightSpy).not.toHaveBeenCalled();
    });
  });

  describe('WatchdogClient: 5s Heartbeat, Reconnect & State Rehydration', () => {
    let testServer: WebSocketServer;
    const testPort = 4955;
    const testUrl = `ws://127.0.0.1:${testPort}`;

    beforeEach(async () => {
      testServer = new WebSocketServer({ port: testPort });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    });

    it('connects with Bearer auth and exchanges rpc.ping / pong with latency tracking', async () => {
      testServer.on('connection', (ws) => {
        ws.on('message', (raw) => {
          const req = JSON.parse(raw.toString());
          if (req.method === 'rpc.ping') {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: { status: 'pong', timestamp: Date.now() },
            }));
          }
        });
      });

      const client = new WatchdogClient({
        url: testUrl,
        authToken: 'secret-bearer-token',
        heartbeatIntervalMs: 50, // fast interval for testing
      });

      const statusReports: Array<{ connected: boolean; latency: number }> = [];
      client.onStatusChange((connected, latency) => {
        statusReports.push({ connected, latency });
      });

      await client.connect();
      expect(client.getIsConnected()).toBe(true);

      // Wait for at least one ping/pong exchange
      await new Promise((r) => setTimeout(r, 120));

      expect(statusReports.length).toBeGreaterThanOrEqual(1);
      expect(statusReports[0].connected).toBe(true);
      expect(statusReports[0].latency).toBeGreaterThanOrEqual(0);

      client.dispose();
    });

    it('sends JSON-RPC requests and resolves typed responses', async () => {
      testServer.on('connection', (ws) => {
        ws.on('message', (raw) => {
          const req = JSON.parse(raw.toString());
          if (req.method === 'diagnostics.analyzeError') {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: req.id,
              result: { correlationId: req.params.correlationId },
            }));
          }
        });
      });

      const client = new WatchdogClient({ url: testUrl });
      await client.connect();

      const result = await client.requestAnalysis('TypeError: undefined is not a function');
      expect(result).toBeDefined();
      expect(result.correlationId).toContain('corr-');

      client.dispose();
    });

    it('rehydrates active editor buffer upon reconnecting', async () => {
      const client = new WatchdogClient({ url: testUrl });
      const buffer: ActiveBufferResult = {
        uri: 'file:///workspace/test.ts',
        fileName: 'test.ts',
        languageId: 'typescript',
        content: 'const x = 1;',
        version: 1,
        isDirty: false,
        lineCount: 1,
      };

      client.updateActiveBuffer(buffer);
      const rehydrateSpy = vi.spyOn(client, 'rehydrateState');

      await client.connect();
      expect(rehydrateSpy).toHaveBeenCalled();

      client.dispose();
    });

    it('transitions to disconnected state when socket is abruptly closed', async () => {
      const client = new WatchdogClient({ url: testUrl, reconnectTimeoutMs: 5000 });
      const statuses: boolean[] = [];
      client.onStatusChange((connected) => statuses.push(connected));

      await client.connect();
      expect(client.getIsConnected()).toBe(true);

      // Abruptly terminate server-side socket
      for (const clientSocket of testServer.clients) {
        clientSocket.terminate();
      }

      await new Promise((r) => setTimeout(r, 50));
      expect(client.getIsConnected()).toBe(false);
      expect(statuses).toContain(false);

      client.dispose();
    });
  });

  describe('TerminalWatcher & LSP Diagnostics', () => {
    it('captures non-zero terminal exit codes and strips ANSI escape sequences', async () => {
      let capturedTrace = '';
      let capturedCode = 0;

      const watcher = new TerminalWatcher(undefined, {
        onTerminalError: (trace, exitCode) => {
          capturedTrace = trace;
          capturedCode = exitCode;
        },
      });

      // Simulate shell execution error with ANSI color codes
      const rawOutput = '\u001b[31mError:\u001b[0m Cannot find module "express"';
      await mockVscode.window.simulateTerminalExecution({
        exitCode: 1,
        execution: {
          read: async function* () {
            yield rawOutput;
          },
        },
      });

      expect(capturedCode).toBe(1);
      expect(capturedTrace).toBe('Error: Cannot find module "express"');
      expect(watcher.getLastCapturedError()?.exitCode).toBe(1);

      watcher.dispose();
    });

    it('ignores terminal execution when exitCode is 0', async () => {
      let callCount = 0;
      const watcher = new TerminalWatcher(undefined, {
        onTerminalError: () => {
          callCount++;
        },
      });

      await mockVscode.window.simulateTerminalExecution({
        exitCode: 0,
        execution: {
          read: async function* () {
            yield 'Success build';
          },
        },
      });

      expect(callCount).toBe(0);
      watcher.dispose();
    });

    it('converts VS Code Diagnostic to protocol DiagnosticDTO with 1-4 severity scale', async () => {
      let receivedDiags: any[] = [];
      const watcher = new LspDiagnosticsWatcher(undefined, {
        debounceMs: 20,
        onDiagnosticsChanged: (_uri, diags) => {
          receivedDiags = diags;
        },
      });

      const fileUri = mockVscode.Uri.file('/workspace/index.ts');
      const vsDiag = new mockVscode.Diagnostic(
        new mockVscode.Range(0, 0, 0, 10),
        'Type error on symbol',
        mockVscode.DiagnosticSeverity.Error // 0 in VS Code
      );
      vsDiag.source = 'typescript';
      vsDiag.code = 2304;

      mockVscode.languages.setDiagnostics(fileUri, [vsDiag]);
      mockVscode.languages.simulateDiagnosticsChange({ uris: [fileUri] });

      await new Promise((r) => setTimeout(r, 60));

      expect(receivedDiags).toHaveLength(1);
      const dto = receivedDiags[0];
      expect(dto.message).toBe('Type error on symbol');
      expect(dto.severity).toBe(1); // 1 = Error in LSP
      expect(dto.source).toBe('typescript');
      expect(dto.code).toBe('2304');

      watcher.dispose();
    });
  });

  describe('Extension Lifecycle & Command Registration', () => {
    it('activates and registers all required extension commands', async () => {
      const context: any = {
        subscriptions: [],
        extensionUri: mockVscode.Uri.file('/ext'),
      };

      await activate(context);

      const registered = mockVscode.commands.getRegisteredCommands();
      expect(registered.has('antislop.openDiagnosticScreen')).toBe(true);
      expect(registered.has('antislop.openScreenB')).toBe(true);
      expect(registered.has('antislop.clearHighlights')).toBe(true);
      expect(registered.has('antislop.highlightLine')).toBe(true);

      // Execute clear highlights command
      await mockVscode.commands.executeCommand('antislop.clearHighlights');

      deactivate();
      expect(context.subscriptions.length).toBeGreaterThan(0);
    });
  });
});
