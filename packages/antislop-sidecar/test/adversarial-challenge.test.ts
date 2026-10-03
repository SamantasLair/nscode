import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import http from 'http';
import net from 'net';
import {
  READ_ONLY_RPC_METHODS,
  type JsonRpcErrorResponse,
  type ZeroMutationRejectionData,
} from '@antislop/protocol';
import {
  SidecarServer,
  RpcRouter,
  ContextAggregator,
  PedagogicalEngine,
  isLoopbackAddress,
} from '../src/index.js';

const AUTH_TOKEN = 'challenge-secret-token-xyz-987';

function waitForSocketOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timeout after 3000ms'));
    }, 3000);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function sendRawRpc(ws: WebSocket, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('RPC response timeout after 3000ms'));
    }, 3000);

    const onMessage = (data: WebSocket.Data) => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      resolve(data.toString());
    };
    ws.on('message', onMessage);
    ws.send(payload);
  });
}

describe('Milestone 2 Adversarial Challenge & Empirical Stress Harness', () => {
  let server: SidecarServer;
  let serverPort: number;

  beforeEach(async () => {
    // Ephemeral port 0 to prevent EADDRINUSE collisions in parallel test runs
    server = new SidecarServer({
      port: 0,
      host: '127.0.0.1',
      authToken: AUTH_TOKEN,
      watchdogIntervalMs: 500,
      maxMissedPings: 2,
    });
    await server.start();
    serverPort = server.getPort();
  });

  afterEach(async () => {
    await server.stop();
  });

  // =========================================================================
  // SUITE 1: Hostile Mutation Injection
  // =========================================================================
  describe('1. Hostile Mutation Injection & Method Whitelist Defense', () => {
    const FORBIDDEN_MUTATION_METHODS = [
      'file.write',
      'buffer.patch',
      'editor.applyEdit',
      'system.exec',
      'ide.autoPatch',
      'workspace.createFile',
      'terminal.runCommand',
      // Additional adversarial mutation targets
      'file.delete',
      'file.unlink',
      'shell.execute',
      'process.kill',
      'git.commit',
      'git.push',
      'workspace.applyWorkspaceEdit',
      'config.update',
      'debugger.evaluate',
    ];

    for (const method of FORBIDDEN_MUTATION_METHODS) {
      it(`strictly rejects hostile mutation method "${method}" with code -32601 and zeroMutationInvariant`, async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        });
        await waitForSocketOpen(ws);

        const requestId = `mut-${method}-${Date.now()}`;
        const rawResponse = await sendRawRpc(
          ws,
          JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            method,
            params: {
              target: '/critical/system/file',
              content: 'MALICIOUS_OVERWRITE_PAYLOAD',
              force: true,
            },
          })
        );

        const res: JsonRpcErrorResponse<ZeroMutationRejectionData> = JSON.parse(rawResponse);

        expect(res.jsonrpc).toBe('2.0');
        expect(res.id).toBe(requestId);
        expect(res.error).toBeDefined();
        expect(res.error.code).toBe(-32601);
        expect(res.error.message).toContain('Zero-Mutation Invariant');

        // Verify zero-mutation invariant audit envelope
        expect(res.error.data).toBeDefined();
        expect(res.error.data.method).toBe(method);
        expect(res.error.data.zeroMutationInvariant).toBe(true);
        expect(res.error.data.violationType).toBe('ZERO_MUTATION_INVARIANT_VIOLATION');
        expect(Array.isArray(res.error.data.allowedMethods)).toBe(true);
        expect(res.error.data.allowedMethods).toEqual(READ_ONLY_RPC_METHODS);

        ws.close();
      });
    }

    it('rejects case-tampered mutation methods (e.g. FILE.WRITE, File.Write)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      for (const tamperedMethod of ['FILE.WRITE', 'File.Write', 'FiLe.WrItE', 'SYSTEM.EXEC']) {
        const rawResponse = await sendRawRpc(
          ws,
          JSON.stringify({
            jsonrpc: '2.0',
            id: `tamper-${tamperedMethod}`,
            method: tamperedMethod,
            params: {},
          })
        );
        const res = JSON.parse(rawResponse);
        expect(res.error.code).toBe(-32601);
        expect(res.error.data.zeroMutationInvariant).toBe(true);
      }

      ws.close();
    });

    it('rejects path traversal inside read endpoints without leaking disk state', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      // Attempt reading arbitrary system file path traversal
      const rawResponse = await sendRawRpc(
        ws,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'traversal-1',
          method: 'context.getGitDiff',
          params: {
            fileUri: '../../../../../../../../../../Windows/System32/drivers/etc/hosts',
          },
        })
      );

      const res = JSON.parse(rawResponse);
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe('traversal-1');
      // Must not throw internal unhandled error or reveal filesystem
      expect(res.result).toBeDefined();
      expect(typeof res.result.diff).toBe('string');

      ws.close();
    });
  });

  // =========================================================================
  // SUITE 2: Bearer Authentication Stress
  // =========================================================================
  describe('2. Bearer Authentication Stress & Boundary Defense', () => {
    it('rejects upgrade with HTTP 401 when Authorization header is absent', async () => {
      let rejected = false;
      let statusCode = 0;

      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`);
      await new Promise<void>((resolve) => {
        ws.on('unexpected-response', (req, res) => {
          statusCode = res.statusCode;
          rejected = true;
          resolve();
        });
        ws.on('error', (err) => {
          if (err.message.includes('401')) {
            rejected = true;
            statusCode = 401;
          }
          resolve();
        });
      });

      expect(rejected).toBe(true);
      expect(statusCode).toBe(401);
    });

    it('rejects upgrade with HTTP 401 when Bearer token is empty string', async () => {
      let rejected = false;
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: 'Bearer ' },
      });
      await new Promise<void>((resolve) => {
        ws.on('error', (err) => {
          if (err.message.includes('401')) rejected = true;
          resolve();
        });
        ws.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejected = true;
          resolve();
        });
      });
      expect(rejected).toBe(true);
    });

    it('rejects upgrade with HTTP 401 on malformed Authorization schemes (Basic, Token, Digest)', async () => {
      const hostileHeaders = [
        'Basic dXNlcjpwYXNz',
        'Token challenge-secret-token-xyz-987',
        'Digest username="admin"',
        'Bearer', // Missing trailing space
        'bearer challenge-secret-token-xyz-987', // Lowercase scheme
        'BEARER challenge-secret-token-xyz-987', // Uppercase scheme
        `Bearer ${AUTH_TOKEN}_corrupted`,
        'Bearer null',
        'Bearer undefined',
        'Bearer [object Object]',
      ];

      for (const authHeader of hostileHeaders) {
        let rejected = false;
        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
          headers: { Authorization: authHeader },
        });

        await new Promise<void>((resolve) => {
          ws.on('error', (err) => {
            if (err.message.includes('401')) rejected = true;
            resolve();
          });
          ws.on('unexpected-response', (req, res) => {
            if (res.statusCode === 401) rejected = true;
            resolve();
          });
        });

        expect(rejected, `Header "${authHeader}" should be rejected with 401`).toBe(true);
      }
    });

    it('rejects massive 10KB corrupted Bearer token with HTTP 401 without crashing server', async () => {
      let rejected = false;
      const massiveToken = 'A'.repeat(10000);
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${massiveToken}` },
      });

      await new Promise<void>((resolve) => {
        ws.on('error', (err) => {
          if (err.message.includes('401')) rejected = true;
          resolve();
        });
        ws.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejected = true;
          resolve();
        });
      });

      expect(rejected).toBe(true);
    });

    it('handles query param fallback ?token= properly (success and failure modes)', async () => {
      // 1. Valid token in query param
      const wsValid = new WebSocket(`ws://127.0.0.1:${serverPort}?token=${AUTH_TOKEN}`);
      await waitForSocketOpen(wsValid);
      expect(wsValid.readyState).toBe(WebSocket.OPEN);
      wsValid.close();

      // 2. Empty query param (?token=)
      let rejectedEmpty = false;
      const wsEmpty = new WebSocket(`ws://127.0.0.1:${serverPort}?token=`);
      await new Promise<void>((resolve) => {
        wsEmpty.on('error', (err) => {
          if (err.message.includes('401')) rejectedEmpty = true;
          resolve();
        });
        wsEmpty.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejectedEmpty = true;
          resolve();
        });
      });
      expect(rejectedEmpty).toBe(true);

      // 3. Corrupted query param (?token=wrong)
      let rejectedCorrupt = false;
      const wsCorrupt = new WebSocket(`ws://127.0.0.1:${serverPort}?token=attacker_forged_token`);
      await new Promise<void>((resolve) => {
        wsCorrupt.on('error', (err) => {
          if (err.message.includes('401')) rejectedCorrupt = true;
          resolve();
        });
        wsCorrupt.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejectedCorrupt = true;
          resolve();
        });
      });
      expect(rejectedCorrupt).toBe(true);

      // 4. Multiple duplicate query params (?token=wrong&token=real)
      let rejectedMulti = false;
      const wsMulti = new WebSocket(
        `ws://127.0.0.1:${serverPort}?token=wrong&token=${AUTH_TOKEN}`
      );
      await new Promise<void>((resolve) => {
        wsMulti.on('error', (err) => {
          if (err.message.includes('401')) rejectedMulti = true;
          resolve();
        });
        wsMulti.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejectedMulti = true;
          resolve();
        });
      });
      expect(rejectedMulti).toBe(true);
    });

    it('header authentication takes precedence over query parameter', async () => {
      // Header has wrong token, query has valid token -> must reject
      let rejected = false;
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}?token=${AUTH_TOKEN}`, {
        headers: { Authorization: 'Bearer WRONG_TOKEN' },
      });

      await new Promise<void>((resolve) => {
        ws.on('error', (err) => {
          if (err.message.includes('401')) rejected = true;
          resolve();
        });
        ws.on('unexpected-response', (req, res) => {
          if (res.statusCode === 401) rejected = true;
          resolve();
        });
      });

      expect(rejected).toBe(true);
    });

    it('allows anonymous connections when server is initialized without authToken', async () => {
      const anonServer = new SidecarServer({
        port: 0,
        host: '127.0.0.1',
        authToken: undefined,
      });
      await anonServer.start();
      const anonPort = anonServer.getPort();

      const ws = new WebSocket(`ws://127.0.0.1:${anonPort}`);
      await waitForSocketOpen(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      await anonServer.stop();
    });
  });

  // =========================================================================
  // SUITE 3: Loopback & Hostile Bindings
  // =========================================================================
  describe('3. Loopback & Hostile Bindings', () => {
    describe('isLoopbackAddress unit evaluation', () => {
      it('approves standard loopback IP formats', () => {
        expect(isLoopbackAddress('127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('127.0.0.2')).toBe(true);
        expect(isLoopbackAddress('127.255.255.254')).toBe(true);
        expect(isLoopbackAddress('::1')).toBe(true);
        expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('localhost')).toBe(true);
      });

      it('rejects public, LAN, and external IP addresses', () => {
        expect(isLoopbackAddress('192.168.1.1')).toBe(false);
        expect(isLoopbackAddress('10.0.0.1')).toBe(false);
        expect(isLoopbackAddress('172.16.0.1')).toBe(false);
        expect(isLoopbackAddress('8.8.8.8')).toBe(false);
        expect(isLoopbackAddress('1.1.1.1')).toBe(false);
        expect(isLoopbackAddress('0.0.0.0')).toBe(false);
        expect(isLoopbackAddress('255.255.255.255')).toBe(false);
        expect(isLoopbackAddress('::ffff:192.168.1.1')).toBe(false);
        expect(isLoopbackAddress('example.com')).toBe(false);
      });

      it('analyzes boundary edge case: domain names starting with 127.', () => {
        // Documenting behavior: startsWith('127.') matches '127.evil.com'
        // In Node.js remoteAddress is always an IP, but if a forged string is passed:
        const isMatched = isLoopbackAddress('127.evil.com');
        expect(isMatched).toBe(true); // Demonstrates string-prefix vulnerability in pure function
      });
    });

    it('rejects IP spoofing headers (X-Forwarded-For, X-Real-IP, Forwarded) from bypassing socket check', async () => {
      // Connect to the server using raw net.Socket to simulate HTTP upgrade request with spoofed headers
      const rawSocket = net.connect(serverPort, '127.0.0.1');

      await new Promise<void>((resolve, reject) => {
        rawSocket.on('connect', () => {
          // Send HTTP upgrade request with spoofed forward headers
          const request = [
            `GET / HTTP/1.1`,
            `Host: 127.0.0.1:${serverPort}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==`,
            `Sec-WebSocket-Version: 13`,
            `Authorization: Bearer ${AUTH_TOKEN}`,
            `X-Forwarded-For: 192.168.1.100`, // Spoofed external IP
            `X-Real-IP: 10.0.0.5`,
            `Forwarded: for=8.8.8.8;proto=http;by=127.0.0.1`,
            `\r\n`,
          ].join('\r\n');

          rawSocket.write(request);
        });

        rawSocket.on('data', (data) => {
          const response = data.toString();
          // The underlying TCP socket is 127.0.0.1, so the server correctly ignores X-Forwarded-For
          // and accepts the legitimate loopback connection (HTTP 101 Switching Protocols)
          expect(response).toContain('101 Switching Protocols');
          rawSocket.end();
          resolve();
        });

        rawSocket.on('error', reject);
      });
    });

    it('immediately terminates connection with HTTP 403 when remoteAddress is non-loopback', async () => {
      // We simulate non-loopback behavior by creating an HTTP server upgrade event
      // with a mocked remoteAddress
      const mockReq: any = {
        headers: {
          authorization: `Bearer ${AUTH_TOKEN}`,
        },
        socket: {
          remoteAddress: '198.51.100.25', // Non-loopback public test IP
        },
        url: '/',
      };

      let writtenData = '';
      let destroyed = false;

      const mockSocket: any = {
        write: (chunk: string) => {
          writtenData += chunk;
        },
        destroy: () => {
          destroyed = true;
        },
      };

      // Emit simulated upgrade on the internal HTTP server
      (server as any).server.emit('upgrade', mockReq, mockSocket, Buffer.alloc(0));

      expect(writtenData).toContain('HTTP/1.1 403 Forbidden');
      expect(destroyed).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 4: JSON-RPC Framing & Batch Stress
  // =========================================================================
  describe('4. JSON-RPC Framing & Batch Stress', () => {
    it('returns code -32700 on malformed JSON payloads', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const malformedPayloads = [
        '{',
        '{"jsonrpc": "2.0", "method": "rpc.ping",',
        'undefined',
        '<xml>not json</xml>',
        '{"unclosed string',
        '["unclosed array"',
      ];

      for (const payload of malformedPayloads) {
        const rawRes = await sendRawRpc(ws, payload);
        const res = JSON.parse(rawRes);
        expect(res.jsonrpc).toBe('2.0');
        expect(res.id).toBeNull();
        expect(res.error).toBeDefined();
        expect(res.error.code).toBe(-32700);
        expect(res.error.message).toContain('Parse error');
      }

      ws.close();
    });

    it('returns code -32600 on structurally invalid JSON-RPC requests', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const invalidRequests = [
        'null',
        '123',
        '"just_a_primitive_string"',
        'true',
        '{}', // Missing jsonrpc, id, method
        JSON.stringify({ jsonrpc: '1.0', id: 1, method: 'rpc.ping' }), // Wrong version
        JSON.stringify({ jsonrpc: '2.0', id: true, method: 'rpc.ping' }), // Boolean id
        JSON.stringify({ jsonrpc: '2.0', id: ['array'], method: 'rpc.ping' }), // Array id
        JSON.stringify({ jsonrpc: '2.0', id: { obj: 1 }, method: 'rpc.ping' }), // Object id
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: '' }), // Empty method
      ];

      for (const payload of invalidRequests) {
        const rawRes = await sendRawRpc(ws, payload);
        const res = JSON.parse(rawRes);
        expect(res.jsonrpc).toBe('2.0');
        expect(res.error).toBeDefined();
        expect(res.error.code).toBe(-32600); // Invalid Request
      }

      ws.close();
    });

    it('handles empty batch request with -32600 error', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const rawRes = await sendRawRpc(ws, '[]');
      const res = JSON.parse(rawRes);
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBeNull();
      expect(res.error.code).toBe(-32600);
      expect(res.error.message).toContain('empty batch');

      ws.close();
    });

    it('processes mixed batches containing valid reads, forbidden mutations, and invalid requests', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const mixedBatch = [
        { jsonrpc: '2.0', id: 'b1-ping', method: 'rpc.ping' },
        { jsonrpc: '2.0', id: 'b2-write', method: 'file.write', params: { file: 'a.txt' } },
        { jsonrpc: '2.0', id: 'b3-invalid-schema', method: 'unknown.invalid' },
        { jsonrpc: '2.0', id: 'b4-exec', method: 'system.exec', params: { cmd: 'calc.exe' } },
        { jsonrpc: '2.0', id: 'b5-diff', method: 'context.getGitDiff' },
      ];

      const rawRes = await sendRawRpc(ws, JSON.stringify(mixedBatch));
      const responses: any[] = JSON.parse(rawRes);

      expect(Array.isArray(responses)).toBe(true);
      expect(responses.length).toBe(5);

      // Verify each response correlates to its request
      const r1 = responses.find((r) => r.id === 'b1-ping');
      expect(r1.result).toBeDefined();
      expect(r1.result.status).toBe('pong');

      const r2 = responses.find((r) => r.id === 'b2-write');
      expect(r2.error.code).toBe(-32601);
      expect(r2.error.data.zeroMutationInvariant).toBe(true);

      const r3 = responses.find((r) => r.id === 'b3-invalid-schema');
      expect(r3.error.code).toBe(-32601);

      const r4 = responses.find((r) => r.id === 'b4-exec');
      expect(r4.error.code).toBe(-32601);
      expect(r4.error.data.zeroMutationInvariant).toBe(true);

      const r5 = responses.find((r) => r.id === 'b5-diff');
      expect(r5.result).toBeDefined();
      expect(typeof r5.result.diff).toBe('string');

      ws.close();
    });

    it('processes high-volume batch (100 operations) deterministically', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const largeBatch: any[] = [];
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          largeBatch.push({ jsonrpc: '2.0', id: `batch-ping-${i}`, method: 'rpc.ping' });
        } else {
          largeBatch.push({
            jsonrpc: '2.0',
            id: `batch-mut-${i}`,
            method: 'terminal.runCommand',
            params: { command: 'rm -rf /' },
          });
        }
      }

      const rawRes = await sendRawRpc(ws, JSON.stringify(largeBatch));
      const responses: any[] = JSON.parse(rawRes);

      expect(responses.length).toBe(100);

      // Verify all pings succeeded and all mutations were rejected
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          const p = responses.find((r) => r.id === `batch-ping-${i}`);
          expect(p.result.status).toBe('pong');
        } else {
          const m = responses.find((r) => r.id === `batch-mut-${i}`);
          expect(m.error.code).toBe(-32601);
          expect(m.error.data.zeroMutationInvariant).toBe(true);
        }
      }

      ws.close();
    });
  });

  // =========================================================================
  // SUITE 5: Concurrency, Payloads & Prototype Pollution Protection
  // =========================================================================
  describe('5. Concurrency, Extreme Payloads & Prototype Pollution Protection', () => {
    it('defends against prototype pollution in JSON-RPC request objects', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const attackPayload =
        '{"jsonrpc":"2.0","id":"proto-pollute","method":"rpc.ping","__proto__":{"polluted":true,"isAdmin":true}}';

      const rawRes = await sendRawRpc(ws, attackPayload);
      const res = JSON.parse(rawRes);
      expect(res.id).toBe('proto-pollute');
      expect(res.result.status).toBe('pong');

      // Assert global Object.prototype was NOT compromised
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).isAdmin).toBeUndefined();

      ws.close();
    });

    it('survives extreme 1MB string payload in method params without memory exhaustion', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const massiveTrace = 'Error: Simulated Stack Overflow\n' + ' at callSite (file.ts:1:1)\n'.repeat(30000);

      const rawRes = await sendRawRpc(
        ws,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'massive-payload-1',
          method: 'diagnostics.analyzeError',
          params: {
            rawError: massiveTrace,
            languageId: 'typescript',
          },
        })
      );

      const res = JSON.parse(rawRes);
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe('massive-payload-1');
      expect(res.result.accepted).toBe(true);
      expect(res.result.correlationId).toBeDefined();

      ws.close();
    });

    it('handles 50 concurrent requests over a single socket without frame drops', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const count = 50;
      const responses: any[] = [];

      const onMessage = (data: WebSocket.Data) => {
        responses.push(JSON.parse(data.toString()));
      };
      ws.on('message', onMessage);

      // Concurrently fire 50 requests
      for (let i = 0; i < count; i++) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: `concurrent-${i}`,
            method: 'rpc.ping',
          })
        );
      }

      // Wait until all 50 responses arrive
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timed out waiting for concurrent responses. Received: ${responses.length}/${count}`));
        }, 5000);

        const checkInterval = setInterval(() => {
          if (responses.length >= count) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 20);
      });

      expect(responses.length).toBe(count);
      for (let i = 0; i < count; i++) {
        const found = responses.find((r) => r.id === `concurrent-${i}`);
        expect(found).toBeDefined();
        expect(found.result.status).toBe('pong');
      }

      ws.off('message', onMessage);
      ws.close();
    });
  });

  // =========================================================================
  // SUITE 6: HTTP Endpoints, Rapid Churn & Notification Invariants
  // =========================================================================
  describe('6. HTTP Endpoints, Rapid Churn & Notification Invariants', () => {
    it('rejects mutation sent as notification (without id) with code -32600', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });
      await waitForSocketOpen(ws);

      const rawRes = await sendRawRpc(
        ws,
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'file.write',
          params: { file: 'pwn.txt', content: 'hacked' },
        })
      );

      const res = JSON.parse(rawRes);
      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32600); // Invalid request because id is required for methods

      ws.close();
    });

    it('returns HTTP 200 with status ok on /health and /ping', async () => {
      for (const endpoint of ['/health', '/ping']) {
        const res = await new Promise<{ statusCode: number; data: any }>((resolve, reject) => {
          http.get(`http://127.0.0.1:${serverPort}${endpoint}`, (response) => {
            let body = '';
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => {
              resolve({
                statusCode: response.statusCode ?? 0,
                data: JSON.parse(body),
              });
            });
            response.on('error', reject);
          });
        });

        expect(res.statusCode).toBe(200);
        expect(res.data.status).toBe('ok');
        expect(typeof res.data.uptime).toBe('number');
      }
    });

    it('returns HTTP 404 on unmapped HTTP routes', async () => {
      const res = await new Promise<number>((resolve, reject) => {
        http.get(`http://127.0.0.1:${serverPort}/unmapped-endpoint`, (response) => {
          resolve(response.statusCode ?? 0);
        }).on('error', reject);
      });

      expect(res).toBe(404);
    });

    it('cleans up session registry after rapid connection churn', async () => {
      const churnCount = 15;
      for (let i = 0; i < churnCount; i++) {
        const ws = new WebSocket(`ws://127.0.0.1:${serverPort}`, {
          headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        });
        await waitForSocketOpen(ws);
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      // Wait a moment for close events to settle in event loop
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.getSessions().length).toBe(0);
    });
  });
});

