import type {
  ActiveBufferResult,
  TerminalBufferResult,
  GitDiffResult,
  LspDiagnosticsResult,
} from '@antislop/protocol';
import type { AggregatedContext, IContextAggregator } from './types.js';

export type ActiveBufferProviderFn = () => Promise<ActiveBufferResult>;
export type TerminalBufferProviderFn = (lines?: number) => Promise<TerminalBufferResult>;
export type GitDiffProviderFn = (stagedOnly?: boolean, fileUri?: string) => Promise<GitDiffResult>;
export type LspDiagnosticsProviderFn = (uri?: string) => Promise<LspDiagnosticsResult>;

export class ContextAggregator implements IContextAggregator {
  private activeBufferProvider: ActiveBufferProviderFn | null = null;
  private terminalBufferProvider: TerminalBufferProviderFn | null = null;
  private gitDiffProvider: GitDiffProviderFn | null = null;
  private lspDiagnosticsProvider: LspDiagnosticsProviderFn | null = null;

  // In-memory buffer registry (active editor single source of truth)
  private inMemoryActiveBuffer: ActiveBufferResult | null = null;

  /**
   * Set active buffer in-memory state.
   * Single-source-of-truth from Theia editor - strictly avoids fs.readFileSync.
   */
  public updateActiveBuffer(buffer: ActiveBufferResult): void {
    this.inMemoryActiveBuffer = buffer;
  }

  public setActiveBufferProvider(provider: ActiveBufferProviderFn): void {
    this.activeBufferProvider = provider;
  }

  public setTerminalBufferProvider(provider: TerminalBufferProviderFn): void {
    this.terminalBufferProvider = provider;
  }

  public setGitDiffProvider(provider: GitDiffProviderFn): void {
    this.gitDiffProvider = provider;
  }

  public setLspDiagnosticsProvider(provider: LspDiagnosticsProviderFn): void {
    this.lspDiagnosticsProvider = provider;
  }

  public async getActiveBuffer(): Promise<ActiveBufferResult> {
    if (this.activeBufferProvider) {
      return await this.activeBufferProvider();
    }
    if (this.inMemoryActiveBuffer) {
      return this.inMemoryActiveBuffer;
    }
    // Default empty in-memory buffer if none provided
    return {
      uri: 'file:///untitled',
      fileName: 'untitled',
      languageId: 'plaintext',
      content: '',
      version: 1,
      isDirty: false,
      lineCount: 0,
    };
  }

  public async getTerminalBuffer(lines: number = 500): Promise<TerminalBufferResult> {
    if (this.terminalBufferProvider) {
      return await this.terminalBufferProvider(lines);
    }
    return {
      terminalId: 'default-terminal',
      lines: [],
      lastExitCode: null,
      timestamp: Date.now(),
    };
  }

  public async getGitDiff(stagedOnly: boolean = false, fileUri?: string): Promise<GitDiffResult> {
    if (this.gitDiffProvider) {
      return await this.gitDiffProvider(stagedOnly, fileUri);
    }
    return {
      isRepository: false,
      diff: '',
      filesChangedCount: 0,
      staged: stagedOnly,
    };
  }

  public async getLspDiagnostics(uri?: string): Promise<LspDiagnosticsResult> {
    if (this.lspDiagnosticsProvider) {
      return await this.lspDiagnosticsProvider(uri);
    }
    return {
      diagnostics: [],
      totalCount: 0,
      errorCount: 0,
      warningCount: 0,
    };
  }

  /**
   * Aggregates all context streams using Promise.allSettled to guarantee fault tolerance.
   * If any provider fails, other context streams are preserved.
   */
  public async aggregateAll(uri?: string): Promise<AggregatedContext> {
    const results = await Promise.allSettled([
      this.getActiveBuffer(),
      this.getTerminalBuffer(),
      this.getGitDiff(false, uri),
      this.getLspDiagnostics(uri),
    ]);

    const aggregated: AggregatedContext = {};

    if (results[0].status === 'fulfilled') {
      aggregated.activeBuffer = results[0].value;
    }
    if (results[1].status === 'fulfilled') {
      aggregated.terminalBuffer = results[1].value;
    }
    if (results[2].status === 'fulfilled') {
      aggregated.gitDiff = results[2].value;
    }
    if (results[3].status === 'fulfilled') {
      aggregated.lspDiagnostics = results[3].value;
    }

    return aggregated;
  }
}
