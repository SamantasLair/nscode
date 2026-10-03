import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', async () => {
  const mod = await import('../../packages/antislop-vscode-extension/test/mocks/vscode-mock.js');
  return mod.mockVscode;
});

import {
  mockVscode,
  MockTextDocument,
  MockTextEditor,
} from '../../packages/antislop-vscode-extension/test/mocks/vscode-mock.js';
import { DecorationManager } from '@antislop/vscode-extension';
import type { HighlightLinePayload } from '@antislop/protocol';

describe('Tier 3: Zero-Buffer Mutation Decoration Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVscode.window.visibleTextEditors.length = 0;
  });

  // =========================================================================
  // Suite 1: Inviolable Zero-Buffer Mutation Invariant
  // =========================================================================
  describe('1. Inviolable Zero-Buffer Mutation Invariant', () => {
    it('applies line decoration while guaranteeing pristine buffer text, isDirty === false, and zero edit calls', async () => {
      const manager = new DecorationManager();
      const fileUri = mockVscode.Uri.file('/workspace/src/critical-algorithm.ts');
      const pristineContent = [
        'export function calculateChecksum(input: string): number {',
        '  let sum = 0;',
        '  for (let i = 0; i < input.length; i++) {',
        '    sum = (sum * 31 + input.charCodeAt(i)) & 0xffffffff;',
        '  }',
        '  return sum;',
        '}',
      ].join('\n');

      const doc = new MockTextDocument(
        fileUri,
        pristineContent,
        '/workspace/src/critical-algorithm.ts',
        'typescript',
        false // isDirty: false
      );
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);

      const editor = new MockTextEditor(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      const payload: HighlightLinePayload = {
        fileUri: fileUri.toString(),
        line: 4, // 1-indexed line 4: sum = (sum * 31 + input.charCodeAt(i)) & 0xffffffff;
      };

      const success = await manager.highlightLine(payload, { preserveFocus: true });
      expect(success).toBe(true);

      // INVIOLABLE BUFFER INTEGRITY ASSERTIONS:
      // 1. Document dirty state is strictly false
      expect(doc.isDirty).toBe(false);

      // 2. Document text is byte-for-byte identical to pristine content
      expect(doc.getText()).toBe(pristineContent);

      // 3. Zero editor.edit calls executed (undo/redo stack completely clean)
      expect(editor.editCalls).toHaveLength(0);

      // 4. workspace.applyEdit was never invoked
      expect(mockVscode.workspace.openTextDocument).toHaveBeenCalledTimes(1);

      // 5. Visual decoration styling verified
      const decorations = editor.decorations.get(manager.getFaultDecorationType());
      expect(decorations).toBeDefined();
      expect(decorations).toHaveLength(1);
      expect(decorations![0].start.line).toBe(3); // 1-indexed 4 -> 0-indexed 3
      expect(decorations![0].start.character).toBe(0);
      expect(decorations![0].end.line).toBe(3);
      expect(decorations![0].end.character).toBe(doc.lineAt(3).text.length);

      // 6. Viewport revealed without stealing focus from Screen B
      expect(editor.revealedRanges).toHaveLength(1);
      expect(editor.revealedRanges[0].range.start.line).toBe(3);
      expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(doc, {
        viewColumn: mockVscode.ViewColumn.One,
        preserveFocus: true,
      });

      manager.dispose();
    });

    it('creates decoration types with strict non-mutating visual styling tokens', () => {
      const manager = new DecorationManager();
      const faultType = manager.getFaultDecorationType();

      expect(faultType).toBeDefined();
      expect(mockVscode.window.createTextEditorDecorationType).toHaveBeenCalledWith(
        expect.objectContaining({
          isWholeLine: true,
          backgroundColor: 'rgba(239, 68, 68, 0.18)',
          border: '1px solid rgba(239, 68, 68, 0.45)',
          overviewRulerColor: 'rgba(239, 68, 68, 0.85)',
          rangeBehavior: mockVscode.DecorationRangeBehavior.ClosedClosed,
        })
      );

      manager.dispose();
    });
  });

  // =========================================================================
  // Suite 2: Range & Multiline Calculations with Boundary Clamping
  // =========================================================================
  describe('2. Coordinate Mapping, Multiline Spanning & Boundary Clamping', () => {
    it('accurately highlights multiline span when endLine is specified', async () => {
      const manager = new DecorationManager();
      const fileUri = mockVscode.Uri.file('/workspace/src/span-test.ts');
      const lines = [
        'function parseTokens() {',
        '  const a = 1;',
        '  const b = 2;',
        '  const c = 3;',
        '  return a + b + c;',
        '}',
      ];
      const doc = new MockTextDocument(fileUri, lines.join('\n'));
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      // Highlight multiline block: lines 2 to 4 (1-indexed)
      await manager.highlightLine({
        fileUri: fileUri.toString(),
        line: 2,
        endLine: 4,
      });

      const decorations = editor.decorations.get(manager.getFaultDecorationType());
      expect(decorations).toHaveLength(1);
      const spanRange = decorations![0];

      // 0-indexed: line 2 -> index 1; endLine 4 -> index 3
      expect(spanRange.start.line).toBe(1);
      expect(spanRange.start.character).toBe(0);
      expect(spanRange.end.line).toBe(3);
      expect(spanRange.end.character).toBe(lines[3]!.length);

      manager.dispose();
    });

    it('safely clamps line coordinates exceeding total document lines to the final line', async () => {
      const manager = new DecorationManager();
      const fileUri = mockVscode.Uri.file('/workspace/src/short.ts');
      const doc = new MockTextDocument(fileUri, 'line 1\nline 2\n'); // 3 lines total including trailing newline
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      // Line 999 in a 3-line document
      await manager.highlightLine({
        fileUri: fileUri.toString(),
        line: 999,
      });

      const decorations = editor.decorations.get(manager.getFaultDecorationType());
      expect(decorations).toHaveLength(1);
      // Must clamp to lineCount - 1
      expect(decorations![0].start.line).toBe(doc.lineCount - 1);

      manager.dispose();
    });

    it('safely clamps line 0 to line index 0 without crashing', async () => {
      const manager = new DecorationManager();
      const fileUri = mockVscode.Uri.file('/workspace/src/zero.ts');
      const doc = new MockTextDocument(fileUri, 'single line content');
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      await manager.highlightLine({
        fileUri: fileUri.toString(),
        line: 0,
      });

      const decorations = editor.decorations.get(manager.getFaultDecorationType());
      expect(decorations).toHaveLength(1);
      expect(decorations![0].start.line).toBe(0);

      manager.dispose();
    });
  });

  // =========================================================================
  // Suite 3: Highlight Disposal & Tab Switch Hygiene
  // =========================================================================
  describe('3. Highlight Disposal, Tab Switch Hygiene & Document Close', () => {
    it('clears visual highlights on previous editor when active editor tab switches to another file', async () => {
      const manager = new DecorationManager();
      const uriA = mockVscode.Uri.file('/workspace/fileA.ts');
      const uriB = mockVscode.Uri.file('/workspace/fileB.ts');

      const docA = new MockTextDocument(uriA, 'const a = 1;\n');
      const editorA = new MockTextEditor(docA);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(docA);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editorA);

      await manager.highlightLine({ fileUri: uriA.toString(), line: 1 });
      expect(editorA.decorations.get(manager.getFaultDecorationType())).toHaveLength(1);
      expect(manager.getActiveHighlight()?.fileUri).toBe(uriA.toString());

      // Simulate switching to fileB in Screen A
      const docB = new MockTextDocument(uriB, 'const b = 2;\n');
      const editorB = new MockTextEditor(docB);
      mockVscode.window.simulateActiveEditorChange(editorB);

      // Stale highlights on editorA must be completely cleared
      expect(editorA.decorations.get(manager.getFaultDecorationType())).toEqual([]);
      expect(manager.getActiveHighlight()).toBeNull();

      manager.dispose();
    });

    it('does NOT clear highlights if active editor changes within the same file', async () => {
      const manager = new DecorationManager();
      const uriA = mockVscode.Uri.file('/workspace/fileA.ts');

      const docA = new MockTextDocument(uriA, 'const a = 1;\n');
      const editorA = new MockTextEditor(docA);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(docA);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editorA);

      await manager.highlightLine({ fileUri: uriA.toString(), line: 1 });
      expect(editorA.decorations.get(manager.getFaultDecorationType())).toHaveLength(1);

      // Same file active change event
      mockVscode.window.simulateActiveEditorChange(editorA);
      expect(editorA.decorations.get(manager.getFaultDecorationType())).toHaveLength(1);
      expect(manager.getActiveHighlight()).not.toBeNull();

      manager.dispose();
    });

    it('clears highlights when highlighted text document is closed', async () => {
      const manager = new DecorationManager();
      const uri = mockVscode.Uri.file('/workspace/closedDoc.ts');
      const doc = new MockTextDocument(uri, 'const closed = true;\n');
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      await manager.highlightLine({ fileUri: uri.toString(), line: 1 });
      expect(manager.getActiveHighlight()).not.toBeNull();

      // Simulate closing the document
      mockVscode.workspace.simulateDocumentClose(doc);
      expect(manager.getActiveHighlight()).toBeNull();

      manager.dispose();
    });

    it('clears all highlights across all visible text editors via clearHighlights()', async () => {
      const manager = new DecorationManager();
      const uri1 = mockVscode.Uri.file('/workspace/vis1.ts');
      const uri2 = mockVscode.Uri.file('/workspace/vis2.ts');

      const doc1 = new MockTextDocument(uri1);
      const doc2 = new MockTextDocument(uri2);
      const editor1 = new MockTextEditor(doc1);
      const editor2 = new MockTextEditor(doc2);

      mockVscode.window.visibleTextEditors.push(editor1, editor2);

      // Apply decoration directly
      editor1.setDecorations(manager.getFaultDecorationType(), [
        new mockVscode.Range(0, 0, 0, 10),
      ]);
      editor2.setDecorations(manager.getFaultDecorationType(), [
        new mockVscode.Range(1, 0, 1, 15),
      ]);

      manager.clearHighlights();

      expect(editor1.decorations.get(manager.getFaultDecorationType())).toEqual([]);
      expect(editor2.decorations.get(manager.getFaultDecorationType())).toEqual([]);
      expect(manager.getActiveHighlight()).toBeNull();

      manager.dispose();
    });
  });

  // =========================================================================
  // Suite 4: Pre-Existing Dirty Document Integrity
  // =========================================================================
  describe('4. Pre-Existing Dirty Document Protection', () => {
    it('preserves pre-existing dirty document state without adding edits or modifying content', async () => {
      const manager = new DecorationManager();
      const uri = mockVscode.Uri.file('/workspace/dirty.ts');
      const dirtyContent = '// Unsaved developer edits\nconst temp = "unsaved";\n';

      const doc = new MockTextDocument(
        uri,
        dirtyContent,
        '/workspace/dirty.ts',
        'typescript',
        true // isDirty was already true before AI error was highlighted
      );
      const editor = new MockTextEditor(doc);
      mockVscode.workspace.openTextDocument.mockResolvedValueOnce(doc);
      mockVscode.window.showTextDocument.mockResolvedValueOnce(editor);

      const result = await manager.highlightLine({
        fileUri: uri.toString(),
        line: 2,
      });

      expect(result).toBe(true);
      // Remained dirty, but was NOT touched or edited by the tool
      expect(doc.isDirty).toBe(true);
      expect(doc.getText()).toBe(dirtyContent);
      expect(editor.editCalls).toHaveLength(0);

      manager.dispose();
    });

    it('returns false gracefully when target document cannot be opened', async () => {
      const manager = new DecorationManager();
      mockVscode.workspace.openTextDocument.mockRejectedValueOnce(
        new Error('FileNotFound: /nonexistent/file.ts')
      );

      const result = await manager.highlightLine({
        fileUri: 'file:///nonexistent/file.ts',
        line: 1,
      });

      expect(result).toBe(false);
      manager.dispose();
    });
  });
});
