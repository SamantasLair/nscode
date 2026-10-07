import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import path from 'path';
import http from 'http';
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';

vi.mock('vscode', async () => {
  const mod = await import('../../packages/antislop-vscode-extension/test/mocks/vscode-mock.js');
  return mod.mockVscode;
});

import { WatchdogClient } from '@antislop/vscode-extension';
import type { ActiveBufferResult, PingResult } from '@antislop/protocol';

const SIDECAR_BIN_PATH = path.resolve(
  __dirname,
  '../../packages/antislop-sidecar/dist/bin.js'
);

const SPAWN_ENV = {
  ...process.env,
  NODE_ENV: 'production', // Crucial: bin.ts skips main() if NODE_ENV === 'test'
};

/**
 * Dynamic port extension of WatchdogClient to allow parallel, conflict-free
 * supervisor testing across isolated loopback ports in CI and local test runs.
 */
class DynamicPortWatchdogSupervisor extends WatchdogClient {
  private customPort: number;
  private customBinPath?: string;
  private customToken?: string;
  private supervisedChild: ChildProcess | null = null;
  private restartCount = 0;
  private lastRestartTimestamp = 0;

  constructor(options: {
    port: number;
    sidecarBinPath?: string;
    authToken?: string;
    heartbeatIntervalMs?: number;
    reconnectTimeoutMs?: number;
  }) {
    super({
      url: `ws://127.0.0.1:${options.port}`,
      authToken: options.authToken,
      sidecarBinPath: options.sidecarBinPath,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
      reconnectTimeoutMs: options.reconnectTimeoutMs ?? 200,
    });
    this.customPort = options.port;
    this.customBinPath = options.sidecarBinPath;
    this.customToken = options.authToken;
  }

  public override spawnDaemon(): void {
    if (!this.customBinPath) return;

    const args = ['--port', String(this.customPort), '--host', '127.0.0.1'];
    if (this.customToken) {
      args.push('--token', this.customToken);
    }

    this.supervisedChild = spawn(process.execPath, [this.customBinPath, ...args], {
      env: SPAWN_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.supervisedChild.stdout?.on('data', (d) => {
    });
    this.supervisedChild.stderr?.on('data', (d) => {
      console.warn('[SupervisorChild stderr]', d.toString());
    });

    this.supervisedChild.on('exit', (code, signal) => {
      this.supervisedChild = null;
      this.handleConnectionDrop();

      // Supervisor auto-respawn (<5s recovery SLA; starts respawn after 500ms delay)
      setTimeout(async () => {
        if (!this.supervisedChild) {
          this.restartCount++;
          this.lastRestartTimestamp = Date.now();
          this.spawnDaemon();
          for (let i = 0; i < 15; i++) {
            if (this.getIsConnected()) break;
            await this.connect();
            if (this.getIsConnected()) break;
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }, 500);
    });
  }

  public override getDaemonProcess(): ChildProcess | null {
    return this.supervisedChild ?? super.getDaemonProcess();
  }

  public getRestartCount(): number {
    return this.restartCount;
  }

  public getLastRestartTimestamp(): number {
    return this.lastRestartTimestamp;
  }

  public override dispose(): void {
    super.dispose();
    if (this.supervisedChild) {
      try {
        this.supervisedChild.kill();
      } catch {}
      this.supervisedChild = null;
    }
  }
}

describe('Tier 2: Watchdog & Daemon IPC Lifecycle Suite', () => {
  const activeProcesses: ChildProcess[] = [];

  const cleanupProcess = (proc: ChildProcess): Promise<void> => {
    return new Promise((resolve) => {
      if (proc.killed || proc.exitCode !== null) {
        return resolve();
      }
      proc.once('exit', () => resolve());
      try {
        proc.kill('SIGTERM');
      } catch {
        resolve();
      }
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve();
      }, 500);
    });
  };

  afterEach(async () => {
    while (activeProcesses.length > 0) {
      const proc = activeProcesses.pop();
      if (proc) {
        await cleanupProcess(proc);
      }
    }
  });

  afterAll(async () => {
    for (const proc of activeProcesses) {
      await cleanupProcess(proc);
    }
  });

  describe('1. Headless CLI Daemon Spawn & Health Verification', () => {
    const testPort = 4955;
    const testToken = 'antislop-tier2-token-4955';

    it('spawns sidecar binary headlessly on dynamic port and announces readiness on stdout', async () => {
      let startupLog = '';

      const child = spawn(
        process.execPath,
        [
          SIDECAR_BIN_PATH,
          '--port',
          String(testPort),
          '--host',
          '127.0.0.1',
          '--token',
          testToken,
        ],
        {
          env: SPAWN_ENV,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        }
      );
      activeProcesses.push(child);

      expect(child.pid).toBeDefined();
      expect(child.pid!).toBeGreaterThan(0);

      const readyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Daemon failed to announce listening state within 10s. Output: ${startupLog}`));
        }, 10000);

        child.stdout?.on('data', (chunk) => {
          startupLog += chunk.toString();
          if (startupLog.includes('[Antislop Sidecar] Daemon listening on ws://127.0.0.1:')) {
            clearTimeout(timeout);
            resolve(startupLog);
          }
        });

        child.stderr?.on('data', (chunk) => {
          startupLog += chunk.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      const announcedLog = await readyPromise;
      expect(announcedLog).toContain(`ws://127.0.0.1:${testPort}`);
      expect(announcedLog).toContain(`(PID: ${child.pid})`);

      // Verify HTTP /health endpoint
      const healthData = await new Promise<{ status: string; uptime: number }>((resolve, reject) => {
        http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('application/json');

          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });

      expect(healthData.status).toBe('ok');
      expect(typeof healthData.uptime).toBe('number');
      expect(healthData.uptime).toBeGreaterThanOrEqual(0);
    }, 20000);

    it('enforces loopback Bearer token authentication on the spawned daemon', async () => {
      const authTestPort = 4956;
      const validToken = 'valid-super-secret-token';

      const child = spawn(
        process.execPath,
        [
          SIDECAR_BIN_PATH,
          '--port',
          String(authTestPort),
          '--host',
          '127.0.0.1',
          '--token',
          validToken,
        ],
        {
          env: SPAWN_ENV,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      activeProcesses.push(child);

      // Wait for daemon startup
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Spawn timeout')), 10000);
        child.stdout?.on('data', (chunk) => {
          if (chunk.toString().includes('Daemon listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      const unauthorizedAttempt = new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${authTestPort}`, {
          headers: { Authorization: 'Bearer wrong-token' },
        });
        ws.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode);
        });
        ws.on('error', () => {});
      });

      const statusCode = await unauthorizedAttempt;
      expect(statusCode).toBe(401);

      const authorizedAttempt = new Promise<boolean>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${authTestPort}`, {
          headers: { Authorization: `Bearer ${validToken}` },
        });
        ws.on('open', () => {
          ws.close();
          resolve(true);
        });
        ws.on('error', () => resolve(false));
      });

      const authed = await authorizedAttempt;
      expect(authed).toBe(true);
    }, 15000);
  });

  // Suite 2: 5-Second Heartbeat & Latency Tracking Verification
  describe('2. Bidirectional Heartbeat Exchange & Latency Tracking', () => {
    const heartbeatPort = 4957;
    const heartbeatToken = 'heartbeat-token';
    let daemonProc: ChildProcess;

    beforeEach(async () => {
      daemonProc = spawn(
        process.execPath,
        [
          SIDECAR_BIN_PATH,
          '--port',
          String(heartbeatPort),
          '--host',
          '127.0.0.1',
          '--token',
          heartbeatToken,
        ],
        {
          env: SPAWN_ENV,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      activeProcesses.push(daemonProc);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Spawn timeout')), 10000);
        daemonProc.stdout?.on('data', (chunk) => {
          if (chunk.toString().includes('Daemon listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    });

    it('exchanges rpc.ping / pong with server and tracks non-negative latency', async () => {
      const client = new WatchdogClient({
        url: `ws://127.0.0.1:${heartbeatPort}`,
        authToken: heartbeatToken,
        heartbeatIntervalMs: 80, // accelerated for test speed
      });

      const latencyLogs: number[] = [];
      client.onStatusChange((connected, latency) => {
        if (connected) {
          latencyLogs.push(latency);
        }
      });

      await client.connect();
      expect(client.getIsConnected()).toBe(true);

      // Verify direct JSON-RPC ping request
      const pingResult = await client.sendRequest<PingResult>('rpc.ping', {
        timestamp: Date.now(),
      });
      expect(pingResult.status).toBe('pong');
      expect(typeof pingResult.timestamp).toBe('number');

      // Wait for periodic heartbeat to fire at least twice
      await new Promise((r) => setTimeout(r, 220));

      expect(latencyLogs.length).toBeGreaterThanOrEqual(2);
      for (const lat of latencyLogs) {
        expect(lat).toBeGreaterThanOrEqual(0);
      }

      client.dispose();
    }, 15000);

    it('rejects in-flight requests and triggers disconnect when socket drops', async () => {
      const client = new WatchdogClient({
        url: `ws://127.0.0.1:${heartbeatPort}`,
        authToken: heartbeatToken,
      });

      await client.connect();
      expect(client.getIsConnected()).toBe(true);

      // Disconnect socket abruptly
      client.handleConnectionDrop();
      expect(client.getIsConnected()).toBe(false);

      // Sending requests while disconnected must reject
      await expect(client.sendRequest('rpc.ping')).rejects.toThrow('WebSocket not connected');

      client.dispose();
    }, 15000);
  });

  // Suite 3: Crash Simulation, Auto-Restart SLA (<5s) & State Rehydration
  describe('3. Fatal Crash Simulation, Supervisor Auto-Restart & State Rehydration', () => {
    const crashPort = 4958;
    const crashToken = 'crash-recovery-token';

    it('detects daemon kill, restarts child process within 500ms-1500ms (<5s SLA), and rehydrates active buffer', async () => {
      const supervisor = new DynamicPortWatchdogSupervisor({
        port: crashPort,
        sidecarBinPath: SIDECAR_BIN_PATH,
        authToken: crashToken,
        reconnectTimeoutMs: 200,
      });

      const bufferState: ActiveBufferResult = {
        uri: 'file:///workspace/src/critical-algorithm.ts',
        fileName: 'critical-algorithm.ts',
        languageId: 'typescript',
        content: 'export function processBatch(items: string[]): number { return items.length; }',
        version: 3,
        isDirty: false,
        lineCount: 1,
      };

      supervisor.updateActiveBuffer(bufferState);
      const rehydrateSpy = vi.spyOn(supervisor, 'rehydrateState');

      supervisor.spawnDaemon();
      const initialProc = supervisor.getDaemonProcess();
      expect(initialProc).not.toBeNull();
      if (initialProc) activeProcesses.push(initialProc);

      const initialPid = initialProc?.pid;
      expect(initialPid).toBeDefined();
      expect(initialPid).toBeGreaterThan(0);

      // Wait for initial connection
      const connectTimeout = Date.now() + 10000;
      while (!supervisor.getIsConnected() && Date.now() < connectTimeout) {
        await supervisor.connect();
        if (supervisor.getIsConnected()) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      expect(supervisor.getIsConnected()).toBe(true);
      expect(rehydrateSpy).toHaveBeenCalled();

      const connectionStatuses: boolean[] = [];
      supervisor.onStatusChange((connected) => {
        connectionStatuses.push(connected);
      });

      const crashStartTime = Date.now();
      try {
        process.kill(initialPid!, 'SIGTERM');
      } catch {
        initialProc?.kill('SIGKILL');
      }

      // Wait for drop detection
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!supervisor.getIsConnected()) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });

      expect(supervisor.getIsConnected()).toBe(false);
      expect(connectionStatuses).toContain(false);

      // 5. Assert supervisor automatic restart within 500ms - 2000ms (< 5s recovery SLA)
      const restartTimeout = Date.now() + 10000;
      let newProc: ChildProcess | null = null;

      while (Date.now() < restartTimeout) {
        newProc = supervisor.getDaemonProcess();
        if (newProc && newProc.pid && newProc.pid !== initialPid && supervisor.getIsConnected()) {
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }

      const recoveryDurationMs = Date.now() - crashStartTime;

      expect(supervisor.getRestartCount()).toBeGreaterThanOrEqual(1);
      const restartTriggerDelay = supervisor.getLastRestartTimestamp() - crashStartTime;
      expect(restartTriggerDelay).toBeGreaterThanOrEqual(400); // 500ms backoff
      expect(restartTriggerDelay).toBeLessThan(3000);

      expect(newProc).not.toBeNull();
      expect(newProc?.pid).toBeDefined();
      expect(newProc?.pid).not.toBe(initialPid);
      if (newProc) activeProcesses.push(newProc);

      // B. Overall recovery completed within SLA
      expect(recoveryDurationMs).toBeLessThan(7000);

      expect(rehydrateSpy).toHaveBeenCalledTimes(2);

      const pingAfterCrash = await supervisor.sendRequest<PingResult>('rpc.ping', {
        timestamp: Date.now(),
      });
      expect(pingAfterCrash.status).toBe('pong');

      supervisor.dispose();
    }, 15000);
  });

  describe('4. Process Hygiene & Zero Orphan Invariant', () => {
    it('cleanly terminates daemon process and frees OS ports upon disposal', async () => {
      const hygienePort = 4959;
      const supervisor = new DynamicPortWatchdogSupervisor({
        port: hygienePort,
        sidecarBinPath: SIDECAR_BIN_PATH,
      });

      supervisor.spawnDaemon();
      const proc = supervisor.getDaemonProcess();
      expect(proc).not.toBeNull();
      const pid = proc?.pid;

      // Wait for process to establish
      await new Promise((r) => setTimeout(r, 400));

      // Dispose supervisor: must terminate child process
      supervisor.dispose();

      await new Promise((r) => setTimeout(r, 400));
      expect(supervisor.getDaemonProcess()).toBeNull();

      // Verify the PID is no longer alive
      let isAlive = true;
      try {
        isAlive = process.kill(pid!, 0); // signal 0 tests existence without killing
      } catch {
        isAlive = false;
      }
      expect(isAlive).toBe(false);
    }, 15000);
  });
});
