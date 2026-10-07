import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

vi.mock('vscode', async () => {
  const mod = await import('../../packages/antislop-vscode-extension/test/mocks/vscode-mock.js');
  return mod.mockVscode;
});

import {
  mockVscode,
  MockTextDocument,
  MockTextEditor,
} from '../../packages/antislop-vscode-extension/test/mocks/vscode-mock.js';

import {
  DecorationManager,
  ScreenBWebviewProvider,
  TerminalWatcher,
  LspDiagnosticsWatcher,
} from '@antislop/vscode-extension';

import {
  PedagogicalEngine,
  RpcRouter,
  ContextAggregator,
} from '@antislop/sidecar';

import {
  ContractViolatedSchema,
  SmartCardSchema,
  CognitiveFrictionSessionSchema,
  transitionGateSession,
  READ_ONLY_RPC_METHODS,
  isReadOnlyRpcMethod,
  WebviewToExtensionMessageSchema,
  ExtensionToWebviewMessageSchema,
  type CognitiveFrictionSessionDTO,
  type HighlightLinePayload,
  type ContractViolatedDTO,
  type SmartCardDTO,
} from '@antislop/protocol';

describe('Tier 4: End-to-End Active Cognition Flow Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVscode.window.visibleTextEditors.length = 0;
  });

  describe('Full 6-Stage Active Cognition Pipeline Verification', () => {
    it('executes Stage 1 through Stage 6 with absolute buffer integrity and zero auto-patch buttons', async () => {
      const targetFileUri = mockVscode.Uri.file('/workspace/src/main.rs');
      const pristineCode = [
        'fn main() {',
        '    let mut data = vec![1, 2, 3];',
        '    let ref_data = &data;',
        '    data.push(4); // Line 4: Mutating while borrowed',
        '    println!("{:?}", ref_data);',
        '}',
      ].join('\n');

      const document = new MockTextDocument(
        targetFileUri,
        pristineCode,
        '/workspace/src/main.rs',
        'rust',
        false // Document is pristine (isDirty === false)
      );
      mockVscode.workspace.openTextDocument.mockResolvedValue(document);

      const editor = new MockTextEditor(document);
      mockVscode.window.showTextDocument.mockResolvedValue(editor);

      const decorationManager = new DecorationManager();
      const webviewProvider = new ScreenBWebviewProvider(
        mockVscode.Uri.file('/extension'),
        decorationManager
      );

      let capturedTerminalError = '';
      let capturedExitCode = 0;

      const terminalWatcher = new TerminalWatcher(undefined, {
        onTerminalError: (trace, code) => {
          capturedTerminalError = trace;
          capturedExitCode = code;
        },
      });

      // Simulate compiler failing with non-zero exit code (exitCode: 1) and ANSI colored stack trace
      const rawCompilerOutput = [
        '\u001b[31merror[E0502]: cannot borrow `data` as mutable because it is also borrowed as immutable\u001b[0m',
        ' --> src/main.rs:4:5',
        '  |',
        '3 |     let ref_data = &data;',
        '  |                    ----- immutable borrow occurs here',
        '4 |     data.push(4);',
        '  |     ^^^^^^^^^^^^ mutable borrow occurs here',
        '5 |     println!("{:?}", ref_data);',
        '  |                      -------- immutable borrow later used here',
      ].join('\n');

      await mockVscode.window.simulateTerminalExecution({
        exitCode: 1,
        execution: {
          read: async function* () {
            yield rawCompilerOutput;
          },
        },
      });

      expect(capturedExitCode).toBe(1);
      expect(capturedTerminalError).toContain('error[E0502]: cannot borrow `data` as mutable');
      expect(capturedTerminalError).not.toContain('\u001b[31m'); // ANSI codes stripped cleanly
      expect(terminalWatcher.getLastCapturedError()?.exitCode).toBe(1);

      const pedagogicalEngine = new PedagogicalEngine();
      const contextAggregator = new ContextAggregator();
      const rpcRouter = new RpcRouter({
        contextAggregator,
        pedagogicalEngine,
      });

      const correlationId = randomUUID();
      const receivedNotifications: Array<{ method: string; params: any }> = [];

      const rpcResponseJson = await rpcRouter.handleMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'test-req-1',
          method: 'diagnostics.analyzeError',
          params: {
            correlationId,
            errorTrace: capturedTerminalError,
            fileUri: targetFileUri.toString(),
            languageId: 'rust',
            exitCode: capturedExitCode,
          },
        }),
        (notification) => {
          receivedNotifications.push(notification as any);
        }
      );

      const rpcResponse = JSON.parse(rpcResponseJson!);
      expect(rpcResponse.result.accepted).toBe(true);
      expect(rpcResponse.result.correlationId).toBe(correlationId);

      // Wait for asynchronous streaming and pedagogical synthesis to complete
      await new Promise((r) => setTimeout(r, 120));

      const contractNotif = receivedNotifications.find(
        (n) => n.method === 'diagnostics.contractViolated'
      );
      const smartCardsNotif = receivedNotifications.find(
        (n) => n.method === 'diagnostics.smartCardsReady'
      );

      expect(contractNotif).toBeDefined();
      expect(smartCardsNotif).toBeDefined();

      const contractViolated: ContractViolatedDTO = contractNotif!.params;
      const generatedCards: SmartCardDTO[] = smartCardsNotif!.params.cards;

      expect(ContractViolatedSchema.safeParse(contractViolated).success).toBe(true);
      expect(contractViolated.ruleExplanation).toBeDefined();
      expect(contractViolated.sourceLocation.fileUri).toBe(targetFileUri.toString());

      expect(generatedCards).toHaveLength(3);
      const variants = generatedCards.map((c) => c.variant);
      expect(variants).toContain('idiomatic');
      expect(variants).toContain('minimalist');
      expect(variants).toContain('performance');

      for (const card of generatedCards) {
        expect(SmartCardSchema.safeParse(card).success).toBe(true);
        expect(card.complexity.timeComplexity).toBeDefined();
        expect(card.complexity.spaceComplexity).toBeDefined();
        expect(card.memoryImpact.allocationType).toBeDefined();
        expect(card.whyItWorks).toBeDefined();
      }

      const panel = webviewProvider.show(true);
      expect(panel).toBeDefined();
      expect(panel.viewColumn).toBe(mockVscode.ViewColumn.Two);
      expect(panel.options.retainContextWhenHidden).toBe(true);

      const mockWebview = panel.webview as any;

      // Extension host forwards diagnostic data to Screen B Webview
      const posted = webviewProvider.postMessage({
        type: 'DIAGNOSTIC_DATA',
        payload: {
          correlationId,
          contractViolated,
          cards: generatedCards,
        },
      });

      expect(posted).toBe(true);
      expect(mockWebview.postedMessages).toHaveLength(1);
      expect(mockWebview.postedMessages[0].type).toBe('DIAGNOSTIC_DATA');
      expect(
        ExtensionToWebviewMessageSchema.safeParse(mockWebview.postedMessages[0]).success
      ).toBe(true);

      // Webview initializes cognitive session for the chosen card
      const targetCard = generatedCards.find((c) => c.variant === 'idiomatic')!;
      let session: CognitiveFrictionSessionDTO = {
        sessionId: randomUUID(),
        cardId: targetCard.id,
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };

      expect(CognitiveFrictionSessionSchema.safeParse(session).success).toBe(true);
      expect(session.status).toBe('LOCKED');
      expect(session.clipboardUnlocked).toBe(false);

      // User clicks "Sorot Baris di Layar A" in Screen B webview
      const highlightMessage = {
        type: 'HIGHLIGHT_LINE' as const,
        payload: {
          fileUri: targetFileUri.toString(),
          line: 4, // Highlight line 4 in Screen A
        },
      };

      expect(WebviewToExtensionMessageSchema.safeParse(highlightMessage).success).toBe(true);
      mockWebview.simulateMessage(highlightMessage);

      // Wait for decoration dispatch microtask
      await new Promise((r) => setTimeout(r, 20));

      const faultDecorations = editor.decorations.get(decorationManager.getFaultDecorationType());
      expect(faultDecorations).toBeDefined();
      expect(faultDecorations).toHaveLength(1);
      expect(faultDecorations![0].start.line).toBe(3); // 1-indexed 4 -> 0-indexed 3

      expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(document, {
        viewColumn: mockVscode.ViewColumn.One,
        preserveFocus: true,
      });

      // C. INVIOLABLE BUFFER INTEGRITY:
      expect(document.isDirty).toBe(false);
      expect(document.getText()).toBe(pristineCode);
      expect(editor.editCalls).toHaveLength(0);

      // 1. Premature copy attempt must be locked
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });
      expect(session.status).toBe('TYPE_ALONG_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      // 3. Falsification check: Type-Along completed with sub-threshold accuracy (< 90.0%)
      const subThresholdSession = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 78.5, // < 90.0% threshold
      });
      expect(subThresholdSession.status).toBe('TYPE_ALONG_PENDING');
      expect(subThresholdSession.typeAlongSolved).toBe(false);
      expect(subThresholdSession.clipboardUnlocked).toBe(false);

      // 4. Developer types code with high precision (96.8% >= 90.0% threshold)
      session = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 96.8,
      });

      expect(session.status).toBe('UNLOCKED');
      expect(session.typeAlongSolved).toBe(true);

      // STAGE 6: Clipboard Copy Unlock & Absolute Auto-Patch Prohibition
      // 1. Solution copy is now unlocked
      expect(session.clipboardUnlocked).toBe(true);

      // 2. INVIOLABLE GOLDEN INVARIANTS:
      expect(session.directAutoPatchAllowed).toBe(false);

      const illegalForgeAttempt = {
        ...session,
        directAutoPatchAllowed: true,
      };
      expect(CognitiveFrictionSessionSchema.safeParse(illegalForgeAttempt).success).toBe(false);

      expect(READ_ONLY_RPC_METHODS).not.toContain('file.write');
      expect(READ_ONLY_RPC_METHODS).not.toContain('buffer.patch');
      expect(READ_ONLY_RPC_METHODS).not.toContain('editor.applyEdit');
      expect(isReadOnlyRpcMethod('ide.autoPatch')).toBe(false);

      const illegalMessage = {
        type: 'AUTO_APPLY_FIX',
        payload: { code: 'some fix' },
      };
      expect(WebviewToExtensionMessageSchema.safeParse(illegalMessage).success).toBe(false);

      expect(document.isDirty).toBe(false);
      expect(document.getText()).toBe(pristineCode);
      expect(editor.editCalls).toHaveLength(0);

      terminalWatcher.dispose();
      webviewProvider.dispose();
      decorationManager.dispose();
    });

    it('supports Stage 5 Cloze unmasking path to unlock clipboard', () => {
      let session: CognitiveFrictionSessionDTO = {
        sessionId: randomUUID(),
        cardId: randomUUID(),
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };

      session = transitionGateSession(session, { type: 'START_CLOZE' });
      expect(session.status).toBe('CLOZE_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, { type: 'CLOZE_COMPLETED' });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);
      expect(session.clipboardUnlocked).toBe(true);
      expect(session.directAutoPatchAllowed).toBe(false);
    });
  });

  describe('Multi-Vector Ingestion: LSP Diagnostics Flow', () => {
    it('captures LSP diagnostics and translates to sidecar pedagogical query', async () => {
      let forwardedDiagnostics: any[] = [];

      const lspWatcher = new LspDiagnosticsWatcher(undefined, {
        debounceMs: 10,
        onDiagnosticsChanged: (_uri, diags) => {
          forwardedDiagnostics = diags;
        },
      });

      const fileUri = mockVscode.Uri.file('/workspace/src/app.ts');
      const vsDiag = new mockVscode.Diagnostic(
        new mockVscode.Range(5, 2, 5, 20),
        "Property 'missingField' does not exist on type 'User'",
        mockVscode.DiagnosticSeverity.Error
      );
      vsDiag.source = 'ts-checker';
      vsDiag.code = 2339;

      mockVscode.languages.setDiagnostics(fileUri, [vsDiag]);
      mockVscode.languages.simulateDiagnosticsChange({ uris: [fileUri] });

      await new Promise((r) => setTimeout(r, 40));

      expect(forwardedDiagnostics).toHaveLength(1);
      expect(forwardedDiagnostics[0].message).toContain('Property \'missingField\' does not exist');
      expect(forwardedDiagnostics[0].severity).toBe(1); // 1 = Error
      expect(forwardedDiagnostics[0].code).toBe('2339');

      lspWatcher.dispose();
    });
  });
});
