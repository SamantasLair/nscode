import http from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientSession, SidecarServerOptions } from './types.js';
import { HeartbeatWatchdog } from './watchdog.js';
import { ContextAggregator } from './context-aggregator.js';
import { PedagogicalEngine } from './pedagogical-engine.js';
import { RpcRouter } from './rpc-router.js';

export function isLoopbackAddress(ip?: string): boolean {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    ip === 'localhost'
  );
}

export class SidecarServer {
  private host: string;
  private port: number;
  private authToken?: string;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private watchdog: HeartbeatWatchdog;
  private contextAggregator: ContextAggregator;
  private pedagogicalEngine: PedagogicalEngine;
  private rpcRouter: RpcRouter;
  private sessions: Map<string, ClientSession> = new Map();
  private boundPort: number = 0;

  constructor(options: SidecarServerOptions = {}) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 4949;
    this.authToken = options.authToken;

    this.contextAggregator = (options.contextAggregator as ContextAggregator) ?? new ContextAggregator();
    this.pedagogicalEngine = (options.pedagogicalEngine as PedagogicalEngine) ?? new PedagogicalEngine();
    this.rpcRouter = new RpcRouter({
      contextAggregator: this.contextAggregator,
      pedagogicalEngine: this.pedagogicalEngine,
    });

    this.watchdog = new HeartbeatWatchdog({
      intervalMs: options.watchdogIntervalMs ?? 5000,
      maxMissedPings: options.maxMissedPings ?? 2,
      onSocketTerminated: (session, reason) => {
        this.sessions.delete(session.id);
      },
    });
  }

  public async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: Math.floor(process.uptime()) }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      const clientIp = req.socket.remoteAddress;

      if (!isLoopbackAddress(clientIp)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      if (this.authToken) {
        let providedToken: string | undefined;

        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          providedToken = authHeader.substring(7).trim();
        }

        if (!providedToken && req.url) {
          try {
            const parsedUrl = new URL(req.url, `http://${this.host}`);
            providedToken = parsedUrl.searchParams.get('token') ?? undefined;
          } catch {
          }
        }

        if (!providedToken || providedToken !== this.authToken) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const sessionId = randomUUID();
      const clientIp = req.socket.remoteAddress || '127.0.0.1';

      const session: ClientSession = {
        id: sessionId,
        ws,
        authenticated: true,
        connectedAt: Date.now(),
        lastPingTimestamp: Date.now(),
        missedPings: 0,
        clientIp,
      };

      this.sessions.set(sessionId, session);
      this.watchdog.registerSession(session);

      ws.on('message', async (data: Buffer | string) => {
        try {
          const rawMessage = typeof data === 'string' ? data : data.toString('utf-8');
          const response = await this.rpcRouter.handleMessage(rawMessage, (notification) => {
            if (ws.readyState === 1 /* OPEN */) {
              ws.send(JSON.stringify(notification));
            }
          });

          if (response && ws.readyState === 1 /* OPEN */) {
            ws.send(response);
          }
        } catch (err) {
          if (ws.readyState === 1 /* OPEN */) {
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32603,
                  message: 'Internal JSON-RPC processing error',
                  data: err instanceof Error ? err.message : String(err),
                },
              })
            );
          }
        }
      });

      ws.on('close', () => {
        this.watchdog.unregisterSession(sessionId);
        this.sessions.delete(sessionId);
      });

      ws.on('error', () => {
        this.watchdog.unregisterSession(sessionId);
        this.sessions.delete(sessionId);
      });
    });

    this.watchdog.start();

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr !== null) {
          this.boundPort = addr.port;
        } else {
          this.boundPort = this.port;
        }
        resolve();
      });

      this.server!.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    this.watchdog.stop();

    for (const [, session] of this.sessions) {
      try {
        session.ws.terminate();
      } catch {
        // Ignore termination errors during shutdown
      }
    }
    this.sessions.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }
  }

  public getPort(): number {
    return this.boundPort || this.port;
  }

  public getHost(): string {
    return this.host;
  }

  public getUrl(): string {
    return `ws://${this.host}:${this.getPort()}`;
  }

  public getSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  public getRouter(): RpcRouter {
    return this.rpcRouter;
  }

  public getAggregator(): ContextAggregator {
    return this.contextAggregator;
  }

  public getWatchdog(): HeartbeatWatchdog {
    return this.watchdog;
  }

  public getPedagogicalEngine(): PedagogicalEngine {
    return this.pedagogicalEngine;
  }
}
