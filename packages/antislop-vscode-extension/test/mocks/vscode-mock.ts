import { vi } from 'vitest';

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(
    startLine: number | Position,
    startCharacter: number | Position,
    endLine?: number,
    endCharacter?: number
  ) {
    if (typeof startLine === 'number') {
      this.start = new Position(startLine, startCharacter as number);
      this.end = new Position(endLine ?? startLine, endCharacter ?? (startCharacter as number));
    } else {
      this.start = startLine;
      this.end = startCharacter as Position;
    }
  }
}

export class Uri {
  private constructor(public readonly scheme: string, public readonly path: string) {}

  public static parse(value: string): Uri {
    return new Uri('file', value.replace(/^file:\/\//, ''));
  }

  public static file(value: string): Uri {
    return new Uri('file', value);
  }

  public static joinPath(base: Uri, ...paths: string[]): Uri {
    const joined = [base.path, ...paths].join('/').replace(/\/+/g, '/');
    return new Uri(base.scheme, joined);
  }

  public toString(): string {
    return `file://${this.path}`;
  }

  public get fsPath(): string {
    return this.path;
  }
}

export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
  Beside: -1,
};

export const OverviewRulerLane = {
  Left: 1,
  Center: 2,
  Right: 4,
  Full: 7,
};

export const DecorationRangeBehavior = {
  OpenOpen: 0,
  ClosedClosed: 1,
  OpenClosed: 2,
  ClosedOpen: 3,
};

export const TextEditorRevealType = {
  Default: 0,
  InCenter: 1,
  InCenterIfOutsideViewport: 2,
  AtTop: 3,
};

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export class Diagnostic {
  public source?: string;
  public code?: string | number | { value: string | number; target: Uri };

  constructor(
    public readonly range: Range,
    public readonly message: string,
    public readonly severity: number = DiagnosticSeverity.Error
  ) {}
}

export class MockTextDocument {
  constructor(
    public readonly uri: Uri,
    public content: string = 'function hello() {\n  return "world";\n}\n',
    public fileName: string = '/workspace/test.ts',
    public languageId: string = 'typescript',
    public isDirty: boolean = false,
    public version: number = 1
  ) {}

  public get lineCount(): number {
    return this.content.split('\n').length;
  }

  public lineAt(line: number): { text: string } {
    const lines = this.content.split('\n');
    return { text: lines[line] ?? '' };
  }

  public getText(): string {
    return this.content;
  }
}

export class MockTextEditor {
  public decorations = new Map<any, Range[]>();
  public revealedRanges: Array<{ range: Range; type?: number }> = [];
  public editCalls: any[] = [];

  constructor(public readonly document: MockTextDocument) {}

  public setDecorations(type: any, ranges: Range[]): void {
    this.decorations.set(type, [...ranges]);
  }

  public revealRange(range: Range, type?: number): void {
    this.revealedRanges.push({ range, type });
  }

  public edit(callback: (editBuilder: any) => void): Promise<boolean> {
    this.editCalls.push(callback);
    return Promise.resolve(true);
  }
}

export class MockWebview {
  public html: string = '';
  public cspSource: string = 'vscode-webview:';
  private messageListeners: Array<(msg: any) => void> = [];
  public postedMessages: any[] = [];

  public asWebviewUri(uri: Uri): Uri {
    return uri;
  }

  public postMessage(message: any): Promise<boolean> {
    this.postedMessages.push(message);
    return Promise.resolve(true);
  }

  public onDidReceiveMessage(listener: (msg: any) => void): { dispose: () => void } {
    this.messageListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.messageListeners.indexOf(listener);
        if (idx !== -1) this.messageListeners.splice(idx, 1);
      },
    };
  }

  public simulateMessage(msg: any): void {
    for (const listener of [...this.messageListeners]) {
      listener(msg);
    }
  }
}

export class MockWebviewPanel {
  public webview = new MockWebview();
  public isDisposed = false;
  private disposeListeners: Array<() => void> = [];
  public viewColumn: number;

  constructor(
    public readonly viewType: string,
    public title: string,
    showOptions: any,
    public readonly options: any
  ) {
    this.viewColumn = typeof showOptions === 'number' ? showOptions : showOptions?.viewColumn ?? 1;
  }

  public reveal(viewColumn?: number, _preserveFocus?: boolean): void {
    if (viewColumn) this.viewColumn = viewColumn;
  }

  public onDidDispose(listener: () => void): { dispose: () => void } {
    this.disposeListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.disposeListeners.indexOf(listener);
        if (idx !== -1) this.disposeListeners.splice(idx, 1);
      },
    };
  }

  public dispose(): void {
    this.isDisposed = true;
    for (const l of this.disposeListeners) {
      l();
    }
  }
}

export function createMockVscode() {
  const activeEditorListeners: Array<(editor: MockTextEditor | undefined) => void> = [];
  const docCloseListeners: Array<(doc: MockTextDocument) => void> = [];
  const diagnosticListeners: Array<(event: { uris: Uri[] }) => void> = [];
  const terminalShellListeners: Array<(event: any) => void> = [];
  const terminalCloseListeners: Array<(terminal: any) => void> = [];
  const commands = new Map<string, (...args: any[]) => any>();
  const documents = new Map<string, MockTextDocument>();
  const diagnostics = new Map<string, Diagnostic[]>();

  let activeEditor: MockTextEditor | undefined;
  const visibleEditors: MockTextEditor[] = [];

  return {
    Position,
    Range,
    Uri,
    ViewColumn,
    OverviewRulerLane,
    DecorationRangeBehavior,
    TextEditorRevealType,
    DiagnosticSeverity,
    Diagnostic,
    window: {
      activeTextEditor: activeEditor,
      visibleTextEditors: visibleEditors,
      createTextEditorDecorationType: vi.fn().mockImplementation((options) => ({
        key: `dec-${Math.random()}`,
        options,
        dispose: vi.fn(),
      })),
      showTextDocument: vi.fn().mockImplementation(async (doc: MockTextDocument, options?: any) => {
        let editor = visibleEditors.find((e) => e.document.uri.toString() === doc.uri.toString());
        if (!editor) {
          editor = new MockTextEditor(doc);
          visibleEditors.push(editor);
        }
        activeEditor = editor;
        return editor;
      }),
      createWebviewPanel: vi.fn().mockImplementation((viewType, title, showOptions, options) => {
        return new MockWebviewPanel(viewType, title, showOptions, options);
      }),
      onDidChangeActiveTextEditor: vi.fn().mockImplementation((listener) => {
        activeEditorListeners.push(listener);
        return {
          dispose: () => {
            const idx = activeEditorListeners.indexOf(listener);
            if (idx !== -1) activeEditorListeners.splice(idx, 1);
          },
        };
      }),
      onDidEndTerminalShellExecution: vi.fn().mockImplementation((listener) => {
        terminalShellListeners.push(listener);
        return {
          dispose: () => {
            const idx = terminalShellListeners.indexOf(listener);
            if (idx !== -1) terminalShellListeners.splice(idx, 1);
          },
        };
      }),
      onDidCloseTerminal: vi.fn().mockImplementation((listener) => {
        terminalCloseListeners.push(listener);
        return {
          dispose: () => {
            const idx = terminalCloseListeners.indexOf(listener);
            if (idx !== -1) terminalCloseListeners.splice(idx, 1);
          },
        };
      }),
      // Helper to simulate editor change
      simulateActiveEditorChange: (editor: MockTextEditor | undefined) => {
        activeEditor = editor;
        for (const l of activeEditorListeners) l(editor);
      },
      simulateTerminalExecution: async (event: any) => {
        for (const l of terminalShellListeners) await l(event);
      },
      simulateTerminalClose: async (terminal: any) => {
        for (const l of terminalCloseListeners) await l(terminal);
      },
    },
    workspace: {
      openTextDocument: vi.fn().mockImplementation(async (uri: Uri) => {
        let doc = documents.get(uri.toString());
        if (!doc) {
          doc = new MockTextDocument(uri);
          documents.set(uri.toString(), doc);
        }
        return doc;
      }),
      onDidCloseTextDocument: vi.fn().mockImplementation((listener) => {
        docCloseListeners.push(listener);
        return {
          dispose: () => {
            const idx = docCloseListeners.indexOf(listener);
            if (idx !== -1) docCloseListeners.splice(idx, 1);
          },
        };
      }),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation((key: string, defaultValue: any) => {
          if (key === 'sidecar.url') return 'ws://127.0.0.1:4949';
          if (key === 'sidecar.token') return 'test-token';
          return defaultValue;
        }),
      }),
      simulateDocumentClose: (doc: MockTextDocument) => {
        for (const l of docCloseListeners) l(doc);
      },
    },
    languages: {
      getDiagnostics: vi.fn().mockImplementation((uri: Uri) => {
        return diagnostics.get(uri.toString()) ?? [];
      }),
      setDiagnostics: (uri: Uri, diags: Diagnostic[]) => {
        diagnostics.set(uri.toString(), diags);
      },
      onDidChangeDiagnostics: vi.fn().mockImplementation((listener) => {
        diagnosticListeners.push(listener);
        return {
          dispose: () => {
            const idx = diagnosticListeners.indexOf(listener);
            if (idx !== -1) diagnosticListeners.splice(idx, 1);
          },
        };
      }),
      simulateDiagnosticsChange: (event: { uris: Uri[] }) => {
        for (const l of diagnosticListeners) l(event);
      },
    },
    commands: {
      registerCommand: vi.fn().mockImplementation((id: string, handler: (...args: any[]) => any) => {
        commands.set(id, handler);
        return {
          dispose: () => commands.delete(id),
        };
      }),
      executeCommand: vi.fn().mockImplementation(async (id: string, ...args: any[]) => {
        const handler = commands.get(id);
        if (handler) return await handler(...args);
      }),
      getRegisteredCommands: () => commands,
    },
  };
}

export const mockVscode = createMockVscode();
