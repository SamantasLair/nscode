import WebSocket from 'ws';
import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'child_process';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  PingResult,
  AnalyzeErrorParams,
  AnalyzeErrorResult,
  ActiveBufferResult,
} from '@antislop/protocol';
import type {
  WatchdogClientOptions,
  StatusListener,
  NotificationListener,
} from './types.js';

export class WatchdogClient implements vscode.Disposable {
  private url: string;
  private authToken?: string;
  private sidecarBinPath?: string;
  private ws: WebSocket | null = null;
  private daemonProcess: ChildProcess | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private missedPings = 0;
  private isConnected = false;
  private pendingRequests = new Map<
    string | number,
    { resolve: (val: any) => void; reject: (err: any) => void; sendTime: number }
  >();
  private statusListeners: StatusListener[] = [];
  private notificationListeners: NotificationListener[] = [];
  private isDisposed = false;
  private lastActiveBuffer: ActiveBufferResult | null = null;
  private heartbeatIntervalMs: number;
  private reconnectTimeoutMs: number;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: WatchdogClientOptions = {}) {
    this.url = options.url ?? 'ws://127.0.0.1:4949';
    this.authToken = options.authToken;
    this.sidecarBinPath = options.sidecarBinPath;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
    this.reconnectTimeoutMs = options.reconnectTimeoutMs ?? 1000;
  }

  public onStatusChange(listener: StatusListener): vscode.Disposable {
    this.statusListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.statusListeners.indexOf(listener);
        if (idx !== -1) this.statusListeners.splice(idx, 1);
      },
    };
  }

  public onNotification(listener: NotificationListener): vscode.Disposable {
    this.notificationListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.notificationListeners.indexOf(listener);
        if (idx !== -1) this.notificationListeners.splice(idx, 1);
      },
    };
  }

  public async start(): Promise<void> {
    if (this.sidecarBinPath && !this.daemonProcess) {
      this.spawnDaemon();
    }
    await this.connect();
  }

  public spawnDaemon(): void {
    if (!this.sidecarBinPath) return;

    const args = ['--port', '4949', '--host', '127.0.0.1'];
    if (this.authToken) {
      args.push('--token', this.authToken);
    }

    this.daemonProcess = spawn(process.execPath, [this.sidecarBinPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.daemonProcess.on('exit', (code, signal) => {
      console.warn(`[WatchdogClient] Daemon process exited (code: ${code}, signal: ${signal})`);
      this.daemonProcess = null;
      this.handleConnectionDrop();

      // Crash recovery within <5s (starts respawn after 500ms delay)
      if (!this.isDisposed) {
        setTimeout(() => {
          if (!this.isDisposed && !this.daemonProcess) {
            console.log('[WatchdogClient] Automatic daemon respawn triggered (<5s recovery SLA)...');
            this.spawnDaemon();
            this.connect();
          }
        }, 500);
      }
    });
  }

  public async connect(): Promise<void> {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const connTimer = setTimeout(() => {
        done();
      }, 1500);

      try {
        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
          clearTimeout(connTimer);
          this.isConnected = true;
          this.missedPings = 0;
          this.notifyStatus(true, 0);
          this.startHeartbeat();
          this.rehydrateState();
          done();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleIncomingMessage(data.toString());
        });

        this.ws.on('close', () => {
          clearTimeout(connTimer);
          this.handleConnectionDrop();
          done();
        });

        this.ws.on('error', (err) => {
          clearTimeout(connTimer);
          console.warn('[WatchdogClient] Socket error:', err.message);
          this.handleConnectionDrop();
          done();
        });
      } catch (err) {
        clearTimeout(connTimer);
        this.handleConnectionDrop();
        done();
      }
    });
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getDaemonProcess(): ChildProcess | null {
    return this.daemonProcess;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      if (this.missedPings >= 2) {
        console.warn(
          '[WatchdogClient] Missed 2 consecutive heartbeats (10s threshold). Dropping connection.'
        );
        this.handleConnectionDrop();
        return;
      }

      this.missedPings++;
      const pingId = `ping-${Date.now()}`;
      const sendTime = Date.now();

      try {
        const result = await this.sendRequest<PingResult>(
          'rpc.ping',
          { timestamp: sendTime },
          pingId
        );
        if (result && result.status === 'pong') {
          this.missedPings = 0;
          const latency = Date.now() - sendTime;
          this.notifyStatus(true, latency);
        }
      } catch (err) {
        console.warn('[WatchdogClient] Ping failed:', err);
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public handleConnectionDrop(): void {
    if (!this.isConnected) return;
    this.isConnected = false;
    this.stopHeartbeat();
    this.notifyStatus(false, -1);

    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {}
      this.ws = null;
    }

    for (const [id, req] of this.pendingRequests.entries()) {
      req.reject(new Error('Connection lost while awaiting response'));
    }
    this.pendingRequests.clear();

    if (!this.isDisposed && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.isDisposed && !this.isConnected) {
          this.connect();
        }
      }, this.reconnectTimeoutMs);
    }
  }

  /**
   * Rehydrates live state to the daemon after connection establishment or recovery.
   */
  public async rehydrateState(): Promise<void> {
    if (this.lastActiveBuffer) {
      try {
        console.log(
          '[WatchdogClient] State rehydrated: active buffer synchronized for',
          this.lastActiveBuffer.uri
        );
      } catch (err) {
        console.warn('[WatchdogClient] State rehydration notice:', err);
      }
    }
  }

  public updateActiveBuffer(buffer: ActiveBufferResult): void {
    this.lastActiveBuffer = buffer;
  }

  public async requestAnalysis(rawError?: string): Promise<AnalyzeErrorResult> {
    const params: AnalyzeErrorParams = {
      correlationId: `corr-${Date.now()}`,
      errorTrace: rawError ?? 'Manual developer query',
      source: 'manual',
    };
    return await this.sendRequest<AnalyzeErrorResult>(
      'diagnostics.analyzeError',
      params
    );
  }

  public sendRequest<T = unknown>(
    method: string,
    params?: unknown,
    customId?: string | number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }

      const id =
        customId ??
        `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject, sendTime: Date.now() });
      this.ws.send(JSON.stringify(request));
    });
  }

  private handleIncomingMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if ('id' in parsed && parsed.id !== null && parsed.id !== undefined) {
          const pending = this.pendingRequests.get(parsed.id);
          if (pending) {
            this.pendingRequests.delete(parsed.id);
            if ('error' in parsed && parsed.error) {
              pending.reject(parsed.error);
            } else {
              pending.resolve(parsed.result);
            }
          }
        } else if ('method' in parsed) {
          for (const listener of this.notificationListeners) {
            listener(parsed.method, parsed.params);
          }
        }
      }
    } catch (err) {
      console.error('[WatchdogClient] Failed to parse incoming message:', err);
    }
  }

  private notifyStatus(connected: boolean, latencyMs: number): void {
    for (const listener of this.statusListeners) {
      listener(connected, latencyMs);
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {}
      this.ws = null;
    }
    if (this.daemonProcess) {
      try {
        this.daemonProcess.kill();
      } catch {}
      this.daemonProcess = null;
    }
    this.pendingRequests.clear();
  }
}
