import * as vscode from 'vscode';
import type { HighlightLinePayload } from '@antislop/protocol';
import type { HighlightOptions, HighlightState } from './types.js';

/**
 * Zero-Buffer Mutation Line Highlighting Engine
 *
 * Adheres strictly to the AntiSlop Invariant:
 * 1. Only uses visual TextEditorDecorationType (zero buffer edits).
 * 2. Never calls editor.edit() or workspace.applyEdit().
 * 3. Never mutates document text or pushes to the undo/redo stack.
 * 4. Preserves document.isDirty state (asserts document.isDirty === false if document was clean).
 * 5. Automatically disposes stale highlights on active editor tab changes.
 */
export class DecorationManager implements vscode.Disposable {
  private readonly faultDecorationType: vscode.TextEditorDecorationType;
  private readonly relatedDecorationType: vscode.TextEditorDecorationType;
  private activeHighlight: HighlightState | null = null;
  private readonly decoratedEditors = new Set<vscode.TextEditor>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // Persistent singletons to prevent VS Code handle leaks
    this.faultDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(239, 68, 68, 0.18)',
      border: '1px solid rgba(239, 68, 68, 0.45)',
      overviewRulerColor: 'rgba(239, 68, 68, 0.85)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.relatedDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      border: '1px dashed rgba(59, 130, 246, 0.5)',
      overviewRulerColor: 'rgba(59, 130, 246, 0.7)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.disposables.push(
      this.faultDecorationType,
      this.relatedDecorationType,
      vscode.window.onDidChangeActiveTextEditor((editor) =>
        this.handleActiveEditorChange(editor)
      ),
      vscode.workspace.onDidCloseTextDocument((doc) =>
        this.handleDocumentClosed(doc)
      )
    );
  }

  /**
   * Applies visual decoration to the specified file and line range.
   * Guarantees zero text mutation and preserves focus in Screen B.
   */
  public async highlightLine(
    payload: HighlightLinePayload,
    options: HighlightOptions = { preserveFocus: true, clearPrevious: true }
  ): Promise<boolean> {
    if (options.clearPrevious ?? true) {
      this.clearHighlights();
    }

    try {
      const uri = vscode.Uri.parse(payload.fileUri);
      const document = await vscode.workspace.openTextDocument(uri);

      // Verify clean document invariant before decoration
      const wasDirtyBefore = document.isDirty;

      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: options.preserveFocus ?? true,
      });

      // 1-indexed protocol coordinates -> 0-indexed VS Code Position
      const lineCount = Math.max(1, document.lineCount);
      const startLineIdx = Math.min(
        Math.max(0, payload.line - 1),
        lineCount - 1
      );
      const endLineIdx = payload.endLine
        ? Math.min(Math.max(0, payload.endLine - 1), lineCount - 1)
        : startLineIdx;

      const lineText = document.lineAt(endLineIdx).text;
      const range = new vscode.Range(
        new vscode.Position(startLineIdx, 0),
        new vscode.Position(endLineIdx, lineText.length)
      );

      // Apply decoration directly without buffer modification
      editor.setDecorations(this.faultDecorationType, [range]);
      this.decoratedEditors.add(editor);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // INVIOLABLE ASSERTION: Document buffer must NEVER become dirty as a result of decoration
      if (!wasDirtyBefore && document.isDirty) {
        throw new Error(
          '[DecorationManager] Fatal invariant violation: Zero-Buffer Mutation contract broken! document.isDirty became true.'
        );
      }

      this.activeHighlight = {
        fileUri: payload.fileUri,
        line: payload.line,
        endLine: payload.endLine,
        range,
      };

      return true;
    } catch (err) {
      console.error('[DecorationManager] Failed to highlight line:', err);
      return false;
    }
  }

  /**
   * Clears highlights across all visible text editors and resets internal state.
   */
  public clearHighlights(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.faultDecorationType, []);
      editor.setDecorations(this.relatedDecorationType, []);
    }
    for (const editor of this.decoratedEditors) {
      try {
        editor.setDecorations(this.faultDecorationType, []);
        editor.setDecorations(this.relatedDecorationType, []);
      } catch {}
    }
    this.decoratedEditors.clear();
    this.activeHighlight = null;
  }

  /**
   * Automatically disposes stale highlights when active editor tab switches to another file.
   */
  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.activeHighlight) return;
    if (editor.document.uri.toString() !== this.activeHighlight.fileUri) {
      this.clearHighlights();
    }
  }

  /**
   * Cleans up highlight state when target document is closed.
   */
  private handleDocumentClosed(document: vscode.TextDocument): void {
    if (
      this.activeHighlight &&
      document.uri.toString() === this.activeHighlight.fileUri
    ) {
      this.clearHighlights();
    }
  }

  public getActiveHighlight(): HighlightState | null {
    return this.activeHighlight;
  }

  public getFaultDecorationType(): vscode.TextEditorDecorationType {
    return this.faultDecorationType;
  }

  public dispose(): void {
    this.clearHighlights();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
