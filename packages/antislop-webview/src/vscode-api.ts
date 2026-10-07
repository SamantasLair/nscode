import {
  WebviewToExtensionMessageSchema,
  ExtensionToWebviewMessageSchema,
  type WebviewToExtensionMessage,
  type ExtensionToWebviewMessage,
  type HighlightLinePayload,
  type RequestAnalysisPayload,
  type PracticeCompletedPayload,
  type ThemeTokensPayload,
} from '@antislop/protocol';

export interface VsCodeRawApi<TState = unknown> {
  postMessage(message: unknown): void;
  setState(state: TState): TState;
  getState(): TState | undefined;
}

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => VsCodeRawApi<T>;
    __antislopDev?: {
      dispatchMockMessage: (msg: ExtensionToWebviewMessage) => void;
      mockOutboundHistory: WebviewToExtensionMessage[];
    };
  }
}

export class VsCodeApiBridge {
  private static instance: VsCodeApiBridge | null = null;
  private readonly rawApi: VsCodeRawApi | null = null;
  private readonly isStandaloneBrowser: boolean;
  private readonly listeners = new Set<(msg: ExtensionToWebviewMessage) => void>();
  private readonly outboundHistory: WebviewToExtensionMessage[] = [];

  private constructor() {
    if (typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
      try {
        this.rawApi = window.acquireVsCodeApi();
        this.isStandaloneBrowser = false;
      } catch (err) {
        console.warn('[VsCodeApiBridge] acquireVsCodeApi already acquired or failed, falling back to mock:', err);
        this.rawApi = this.createMockApi();
        this.isStandaloneBrowser = true;
      }
    } else {
      this.rawApi = this.createMockApi();
      this.isStandaloneBrowser = true;
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleWindowMessage);

      if (this.isStandaloneBrowser) {
        window.__antislopDev = {
          dispatchMockMessage: (msg: ExtensionToWebviewMessage) => this.dispatchMockIncoming(msg),
          mockOutboundHistory: this.outboundHistory,
        };
      }
    }
  }

  public static getInstance(): VsCodeApiBridge {
    if (!VsCodeApiBridge.instance) {
      VsCodeApiBridge.instance = new VsCodeApiBridge();
    }
    return VsCodeApiBridge.instance;
  }

  public static resetInstanceForTesting(): void {
    if (VsCodeApiBridge.instance && typeof window !== 'undefined') {
      window.removeEventListener('message', VsCodeApiBridge.instance.handleWindowMessage);
    }
    VsCodeApiBridge.instance = null;
  }

  public getIsStandaloneBrowser(): boolean {
    return this.isStandaloneBrowser;
  }

  public postMessage(msg: WebviewToExtensionMessage): boolean {
    const parseResult = WebviewToExtensionMessageSchema.safeParse(msg);
    if (!parseResult.success) {
      console.error('[VsCodeApiBridge] Invalid outbound message rejected by schema:', parseResult.error);
      return false;
    }

    this.outboundHistory.push(parseResult.data);

    if (this.rawApi) {
      this.rawApi.postMessage(parseResult.data);
      return true;
    }
    return false;
  }

  public highlightLine(payload: HighlightLinePayload): boolean {
    return this.postMessage({
      type: 'HIGHLIGHT_LINE',
      payload,
    });
  }

  public requestAnalysis(payload?: RequestAnalysisPayload): boolean {
    return this.postMessage({
      type: 'REQUEST_ANALYSIS',
      payload,
    });
  }

  public practiceCompleted(payload: PracticeCompletedPayload): boolean {
    return this.postMessage({
      type: 'PRACTICE_COMPLETED',
      payload,
    });
  }

  public collapseSidebar(): boolean {
    return this.postMessage({
      type: 'COLLAPSE_SCREEN_B',
      payload: {},
    });
  }

  public onMessage(listener: (msg: ExtensionToWebviewMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public handleWindowMessage = (event: MessageEvent): void => {
    const raw = event.data;
    if (!raw || typeof raw !== 'object') return;

    const parseResult = ExtensionToWebviewMessageSchema.safeParse(raw);
    if (!parseResult.success) {
      return;
    }

    const typedMsg = parseResult.data;
    if (typedMsg.type === 'THEME_CHANGED') {
      applyThemeTokens(typedMsg.payload);
    }

    for (const listener of this.listeners) {
      try {
        listener(typedMsg);
      } catch (err) {
        console.error('[VsCodeApiBridge] Error in message listener:', err);
      }
    }
  };

  private createMockApi(): VsCodeRawApi {
    let mockState: unknown = undefined;
    return {
      postMessage: (msg: unknown) => {
        if (typeof console !== 'undefined' && console.log) {
          console.log('[VsCodeApiBridge Mock Outbound]', msg);
        }
      },
      setState: (state: unknown) => {
        mockState = state;
        return state;
      },
      getState: () => mockState,
    };
  }

  public dispatchMockIncoming(msg: ExtensionToWebviewMessage): void {
    if (typeof window !== 'undefined') {
      const event = new MessageEvent('message', { data: msg });
      window.dispatchEvent(event);
    } else {
      this.handleWindowMessage({ data: msg } as MessageEvent);
    }
  }

  public getOutboundHistory(): readonly WebviewToExtensionMessage[] {
    return this.outboundHistory;
  }

  public clearOutboundHistory(): void {
    this.outboundHistory.length = 0;
  }
}

export const vscodeApi = VsCodeApiBridge.getInstance();

export function applyThemeTokens(payload: ThemeTokensPayload): void {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById('dynamic-theme-tokens') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamic-theme-tokens';
    document.head.appendChild(styleEl);
  }
  const declarations = Object.entries(payload.tokens)
    .map(([key, val]) => `  ${key}: ${val};`)
    .join('\n');
  styleEl.textContent = `:root {\n${declarations}\n}`;
  if (document.body) {
    document.body.setAttribute('data-theme-id', payload.themeId);
    document.body.setAttribute('data-theme-type', payload.themeType);
  }
}
