import {
  BaseWidget,
  Message,
  Emitter,
  type Event,
  MockHTMLElement,
} from './theia-contracts.js';
import {
  WebviewToExtensionMessageSchema,
  type WebviewToExtensionMessage,
  type ExtensionToWebviewMessage,
} from '@antislop/protocol';

export interface AntislopWidgetOptions {
  webviewUrl?: string;
}

export class AntislopWidget extends BaseWidget {
  public static readonly ID = 'antislop-screen-b-widget';
  public static readonly LABEL = 'AntiSlop Screen B: Cognitive Diagnostics';

  private iframeNode: HTMLIFrameElement | null = null;
  private readonly webviewUrl: string;
  private readonly onMessageEmitter = new Emitter<WebviewToExtensionMessage>();
  public readonly onMessage: Event<WebviewToExtensionMessage> =
    this.onMessageEmitter.event;

  private messageListener: ((event: MessageEvent) => void) | null = null;
  public closeAttemptCount = 0;

  constructor(options?: AntislopWidgetOptions) {
    super();
    this.id = AntislopWidget.ID;
    this.title.label = AntislopWidget.LABEL;
    this.title.caption =
      'AntiSlop Active-Cognition Root-Cause Diagnostics & Smart Cards';
    this.title.closable = false; // INVIOLABLE: Accidental closure lock
    this.title.iconClass = 'fa fa-brain';
    this.addClass('antislop-screen-b-container');

    this.webviewUrl = options?.webviewUrl ?? 'http://127.0.0.1:5173';
    this.createIframe();
    this.bindWindowListener();
  }

  private createIframe(): void {
    if (typeof document !== 'undefined' && document.createElement) {
      const iframe = document.createElement('iframe');
      iframe.id = 'antislop-screen-b-iframe';
      iframe.className = 'antislop-screen-b-iframe';
      iframe.src = this.webviewUrl;
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups'
      );
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.display = 'block';

      this.node.appendChild(iframe);
      this.iframeNode = iframe;
    } else {
      // Mock DOM environment for Node.js
      const mockIframe: any = new MockHTMLElement();
      mockIframe.id = 'antislop-screen-b-iframe';
      mockIframe.className = 'antislop-screen-b-iframe';
      mockIframe.src = this.webviewUrl;
      mockIframe.sandbox = {
        value: 'allow-scripts allow-same-origin allow-forms allow-popups',
        contains: (token: string) =>
          mockIframe.sandbox.value.includes(token),
      };
      mockIframe.contentWindow = {
        postMessage: (_msg: any, _targetOrigin?: string) => {},
      };
      this.node.appendChild(mockIframe);
      this.iframeNode = mockIframe as HTMLIFrameElement;
    }
  }

  private bindWindowListener(): void {
    if (typeof window === 'undefined') return;

    this.messageListener = (event: MessageEvent) => {
      // Security: Validate message origin / source
      if (this.iframeNode && event.source === this.iframeNode.contentWindow) {
        const parseResult = WebviewToExtensionMessageSchema.safeParse(
          event.data
        );
        if (parseResult.success) {
          this.onMessageEmitter.fire(parseResult.data);
        }
      }
    };

    window.addEventListener('message', this.messageListener);
  }

  /**
   * Post a typed message to Screen B webview.
   */
  public postMessage(message: ExtensionToWebviewMessage): boolean {
    if (this.iframeNode && this.iframeNode.contentWindow) {
      this.iframeNode.contentWindow.postMessage(message, '*');
      return true;
    }
    return false;
  }

  /**
   * INVIOLABLE GOLDEN INVARIANT:
   * Screen B is unclosable. Overriding onCloseRequest swallows close requests.
   * Accidental clicks, close shortcuts (Ctrl+W), or external commands cannot dismiss Screen B.
   */
  protected override onCloseRequest(_msg: Message): void {
    this.closeAttemptCount++;
    // SWALLOW close request. Do NOT call super.onCloseRequest() or this.dispose()!
  }

  public getIframe(): HTMLIFrameElement | null {
    return this.iframeNode;
  }

  public getWebviewUrl(): string {
    return this.webviewUrl;
  }

  public override dispose(): void {
    if (typeof window !== 'undefined' && this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
    this.onMessageEmitter.dispose();
    super.dispose();
  }
}
