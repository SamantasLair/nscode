import type { WebSocket } from 'ws';
import type { ClientSession } from './types.js';

export interface WatchdogOptions {
  intervalMs?: number;
  maxMissedPings?: number;
  onSocketTerminated?: (session: ClientSession, reason: string) => void;
}

export class HeartbeatWatchdog {
  private intervalMs: number;
  private maxMissedPings: number;
  private timer: NodeJS.Timeout | null = null;
  private sessions: Map<string, ClientSession> = new Map();
  private onSocketTerminated?: (session: ClientSession, reason: string) => void;

  constructor(options: WatchdogOptions = {}) {
    this.intervalMs = options.intervalMs ?? 5000;
    this.maxMissedPings = options.maxMissedPings ?? 2;
    this.onSocketTerminated = options.onSocketTerminated;
  }

  public registerSession(session: ClientSession): void {
    this.sessions.set(session.id, session);
    // Wire pong event if available on ws
    session.ws.on('pong', () => {
      this.handlePong(session);
    });
  }

  public unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  public handlePong(session: ClientSession): void {
    session.missedPings = 0;
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.checkHeartbeats();
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public checkHeartbeats(): void {
    const deadSessions: ClientSession[] = [];

    for (const [, session] of this.sessions) {
      if (session.missedPings >= this.maxMissedPings) {
        deadSessions.push(session);
        continue;
      }

      session.missedPings++;
      session.lastPingTimestamp = Date.now();

      try {
        if (session.ws.readyState === 1 /* OPEN */) {
          session.ws.ping();
        } else {
          deadSessions.push(session);
        }
      } catch {
        deadSessions.push(session);
      }
    }

    for (const dead of deadSessions) {
      this.sessions.delete(dead.id);
      try {
        dead.ws.terminate();
      } catch {
        // Ignore termination errors on dead sockets
      }
      if (this.onSocketTerminated) {
        this.onSocketTerminated(dead, `Missed ${dead.missedPings} consecutive pings`);
      }
    }
  }

  public getTrackedSessionCount(): number {
    return this.sessions.size;
  }

  public getSession(id: string): ClientSession | undefined {
    return this.sessions.get(id);
  }
}
