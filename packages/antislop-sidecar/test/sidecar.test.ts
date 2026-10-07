import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import http from 'http';
import {
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
  SmartCardSchema,
  ContractViolatedSchema,
  createMethodNotFoundError,
} from '@antislop/protocol';
import {
  SidecarServer,
  HeartbeatWatchdog,
  ContextAggregator,
  PedagogicalEngine,
  StreamBatcher,
  RpcRouter,
  type ClientSession,
} from '../src/index.js';

const TEST_PORT = 4959;
const AUTH_TOKEN = 'test-token-anti-slop-123';

function waitForSocketOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}

function sendRpcRequest(ws: WebSocket, req: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.Data) => {
      ws.off('message', onMessage);
      try {
        const parsed = JSON.parse(data.toString());
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify(req));
  });
}

describe('Antislop Sidecar Daemon Test Suite', () => {
  let server: SidecarServer;

  beforeEach(async () => {
    server = new SidecarServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      authToken: AUTH_TOKEN,
      watchdogIntervalMs: 100, // fast heartbeat for tests
      maxMissedPings: 2,
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('1. Server Lifecycle, Authentication & Health', () => {
    it('successfully connects with Bearer token in HTTP header', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`, {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      });

      await waitForSocketOpen(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(server.getSessions().length).toBe(1);
      ws.close();
    });

    it('successfully connects with token in URL query parameter', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}?token=${AUTH_TOKEN}`);

      await waitForSocketOpen(ws);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('rejects connection with HTTP 401 when token is missing', async () => {
      let rejected = false;
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

      await new Promise<void>((resolve) => {
        ws.on('error', (err: any) => {
          if (err.message.includes('401')) {
            rejected = true;
          }
          resolve();
        });
        ws.on('open', () => {
          resolve();
        });
      });

      expect(rejected).toBe(true);
      expect(ws.readyState).not.toBe(WebSocket.OPEN);
    });

    it('rejects connection with HTTP 401 when token is invalid', async () => {
      let rejected = false;
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`, {
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      });

      await new Promise<void>((resolve) => {
        ws.on('error', (err: any) => {
          if (err.message.includes('401')) {
            rejected = true;
          }
          resolve();
        });
        ws.on('open', () => {
          resolve();
        });
      });

      expect(rejected).toBe(true);
    });

    it('provides HTTP /health endpoint returning status ok', async () => {
      const healthData = await new Promise<{ status: string; uptime: number }>((resolve, reject) => {
        http.get(`http://127.0.0.1:${TEST_PORT}/health`, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(JSON.parse(body)));
          res.on('error', reject);
        });
      });

      expect(healthData.status).toBe('ok');
      expect(typeof healthData.uptime).toBe('number');
    });
  });

  describe('2. Strict Zero-Mutation Router & Read-Only Whitelist', () => {
    let ws: WebSocket;

    beforeEach(async () => {
      ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}?token=${AUTH_TOKEN}`);
      await waitForSocketOpen(ws);
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('executes rpc.ping and returns pong', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 1,
        method: 'rpc.ping',
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result.status).toBe('pong');
      expect(typeof response.result.timestamp).toBe('number');
    });

    it('executes context.getActiveBuffer and returns in-memory state', async () => {
      server.getAggregator().updateActiveBuffer({
        uri: 'file:///workspace/src/example.ts',
        fileName: 'example.ts',
        languageId: 'typescript',
        content: 'const x: number = 42;',
        version: 2,
        isDirty: true,
        lineCount: 1,
      });

      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 2,
        method: 'context.getActiveBuffer',
      });

      expect(response.id).toBe(2);
      expect(response.result.fileName).toBe('example.ts');
      expect(response.result.isDirty).toBe(true);
      expect(response.result.content).toBe('const x: number = 42;');
    });

    it('executes context.getTerminalBuffer and returns terminal output', async () => {
      server.getAggregator().setTerminalBufferProvider(async () => ({
        terminalId: 'term-main',
        lines: ['yarn test', 'FAIL tests/app.test.ts', 'AssertionError: expected true to be false'],
        lastExitCode: 1,
        timestamp: Date.now(),
      }));

      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 3,
        method: 'context.getTerminalBuffer',
        params: { lines: 50 },
      });

      expect(response.id).toBe(3);
      expect(response.result.lastExitCode).toBe(1);
      expect(response.result.lines.length).toBe(3);
    });

    it('executes context.getGitDiff and returns diff', async () => {
      server.getAggregator().setGitDiffProvider(async () => ({
        isRepository: true,
        diff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new',
        filesChangedCount: 1,
        staged: false,
      }));

      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 4,
        method: 'context.getGitDiff',
      });

      expect(response.id).toBe(4);
      expect(response.result.filesChangedCount).toBe(1);
      expect(response.result.diff).toContain('+new');
    });

    it('executes context.getLspDiagnostics and returns diagnostics', async () => {
      server.getAggregator().setLspDiagnosticsProvider(async () => ({
        diagnostics: [
          {
            uri: 'file:///src/app.ts',
            range: {
              start: { line: 10, character: 2 },
              end: { line: 10, character: 15 },
            },
            severity: 1,
            code: 'TS2304',
            source: 'typescript',
            message: "Cannot find name 'foo'",
          },
        ],
        totalCount: 1,
        errorCount: 1,
        warningCount: 0,
      }));

      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 5,
        method: 'context.getLspDiagnostics',
      });

      expect(response.id).toBe(5);
      expect(response.result.totalCount).toBe(1);
      expect(response.result.diagnostics[0].code).toBe('TS2304');
    });

    it('strictly rejects file.write with -32601 and zeroMutationInvariant: true', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 101,
        method: 'file.write',
        params: { path: '/tmp/slop.txt', content: 'hack' },
      });

      expect(response.id).toBe(101);
      expect(response.error.code).toBe(-32601);
      expect(response.error.data.zeroMutationInvariant).toBe(true);
      expect(response.error.data.violationType).toBe('ZERO_MUTATION_INVARIANT_VIOLATION');
    });

    it('strictly rejects buffer.patch with -32601 and zeroMutationInvariant: true', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 102,
        method: 'buffer.patch',
        params: { line: 10, text: 'patched' },
      });

      expect(response.id).toBe(102);
      expect(response.error.code).toBe(-32601);
      expect(response.error.data.zeroMutationInvariant).toBe(true);
    });

    it('strictly rejects editor.applyEdit with -32601 and zeroMutationInvariant: true', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 103,
        method: 'editor.applyEdit',
        params: { edits: [] },
      });

      expect(response.id).toBe(103);
      expect(response.error.code).toBe(-32601);
      expect(response.error.data.zeroMutationInvariant).toBe(true);
    });

    it('strictly rejects system.exec with -32601 and zeroMutationInvariant: true', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 104,
        method: 'system.exec',
        params: { command: 'rm -rf /' },
      });

      expect(response.id).toBe(104);
      expect(response.error.code).toBe(-32601);
      expect(response.error.data.zeroMutationInvariant).toBe(true);
    });

    it('strictly rejects ide.autoPatch with -32601 and zeroMutationInvariant: true', async () => {
      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 105,
        method: 'ide.autoPatch',
        params: { target: 'all' },
      });

      expect(response.id).toBe(105);
      expect(response.error.code).toBe(-32601);
      expect(response.error.data.zeroMutationInvariant).toBe(true);
    });

    it('returns parse error -32700 for invalid JSON string', async () => {
      const response = await new Promise<any>((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
        ws.send('{ invalid json payload');
      });

      expect(response.error.code).toBe(-32700);
      expect(response.id).toBeNull();
    });

    it('processes batch requests for multiple whitelisted queries', async () => {
      const batch = [
        { jsonrpc: '2.0', id: 201, method: 'rpc.ping' },
        { jsonrpc: '2.0', id: 202, method: 'context.getActiveBuffer' },
      ];

      const response = await sendRpcRequest(ws, batch as any);
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBe(2);
      expect(response[0].id).toBe(201);
      expect(response[1].id).toBe(202);
    });
  });

  describe('3. Heartbeat Watchdog & Dead Socket Detection', () => {
    it('resets missedPings on receiving pong', () => {
      const watchdog = new HeartbeatWatchdog({
        intervalMs: 100,
        maxMissedPings: 2,
      });

      const fakeSession: ClientSession = {
        id: 's-1',
        ws: {
          readyState: 1,
          ping: () => {},
          terminate: () => {},
          on: () => {},
        } as unknown as WebSocket,
        authenticated: true,
        connectedAt: Date.now(),
        lastPingTimestamp: Date.now(),
        missedPings: 1,
        clientIp: '127.0.0.1',
      };

      watchdog.registerSession(fakeSession);
      expect(fakeSession.missedPings).toBe(1);

      watchdog.handlePong(fakeSession);
      expect(fakeSession.missedPings).toBe(0);
    });

    it('terminates socket when missed pings reach threshold of 2', () => {
      let terminated = false;
      let terminatedReason = '';

      const watchdog = new HeartbeatWatchdog({
        intervalMs: 50,
        maxMissedPings: 2,
        onSocketTerminated: (session, reason) => {
          terminated = true;
          terminatedReason = reason;
        },
      });

      let terminateCalled = false;
      const fakeSession: ClientSession = {
        id: 's-dead',
        ws: {
          readyState: 1,
          ping: () => {},
          terminate: () => {
            terminateCalled = true;
          },
          on: () => {},
        } as unknown as WebSocket,
        authenticated: true,
        connectedAt: Date.now(),
        lastPingTimestamp: Date.now(),
        missedPings: 2, // Already missed 2 pings
        clientIp: '127.0.0.1',
      };

      watchdog.registerSession(fakeSession);
      watchdog.checkHeartbeats();

      expect(terminateCalled).toBe(true);
      expect(terminated).toBe(true);
      expect(terminatedReason).toContain('Missed 2 consecutive pings');
      expect(watchdog.getTrackedSessionCount()).toBe(0);
    });
  });

  describe('4. Continue.dev Context Aggregator', () => {
    it('uses in-memory buffer as single source of truth without reading disk', async () => {
      const aggregator = new ContextAggregator();
      aggregator.updateActiveBuffer({
        uri: 'file:///memory/active.ts',
        fileName: 'active.ts',
        languageId: 'typescript',
        content: 'export const inMemory = true;',
        version: 5,
        isDirty: true,
        lineCount: 1,
      });

      const buffer = await aggregator.getActiveBuffer();
      expect(buffer.isDirty).toBe(true);
      expect(buffer.content).toBe('export const inMemory = true;');
    });

    it('isolates provider failures via Promise.allSettled in aggregateAll', async () => {
      const aggregator = new ContextAggregator();
      aggregator.setGitDiffProvider(async () => {
        throw new Error('Not a git repository');
      });
      aggregator.setTerminalBufferProvider(async () => ({
        terminalId: 'term-ok',
        lines: ['exit 0'],
        lastExitCode: 0,
        timestamp: Date.now(),
      }));

      const aggregated = await aggregator.aggregateAll();
      expect(aggregated.gitDiff).toBeUndefined(); // Failed provider gracefully omitted
      expect(aggregated.terminalBuffer?.terminalId).toBe('term-ok'); // Other provider succeeded
    });
  });

  describe('5. Pedagogical Smart Card Engine & Big-O Verification', () => {
    const engine = new PedagogicalEngine();

    const languages = ['c', 'cpp', 'java', 'csharp', 'python', 'php'] as const;

    for (const lang of languages) {
      it(`synthesizes 3 valid cards conforming to schemas and Big-O regexes for ${lang}`, async () => {
        const result = await engine.analyzeError({
          languageId: lang,
          rawError: `Fatal error in [${lang}] module`,
          fileUri: `file:///src/main.${lang}`,
        });

        expect(result.contractViolated).toBeDefined();
        expect(ContractViolatedSchema.safeParse(result.contractViolated).success).toBe(true);

        expect(result.cards.length).toBe(3);
        const [idiomatic, minimalist, performance] = result.cards;

        expect(idiomatic.variant).toBe('idiomatic');
        expect(minimalist.variant).toBe('minimalist');
        expect(performance.variant).toBe('performance');

        for (const card of result.cards) {
          // Schema assertion
          const parseResult = SmartCardSchema.safeParse(card);
          expect(parseResult.success).toBe(true);

          // Big-O regex assertions
          expect(BIG_O_TIME_REGEX.test(card.complexity.timeComplexity)).toBe(true);
          expect(BIG_O_SPACE_REGEX.test(card.complexity.spaceComplexity)).toBe(true);

          // Complexity strings must NOT have illegal asymmetry
          expect(card.complexity.timeComplexity).not.toContain('auxiliary');
          expect(card.complexity.spaceComplexity).not.toContain('amortized');

          // Memory allocation profile assertions
          expect(card.memoryImpact.allocationType).toBeDefined();
          expect(card.memoryImpact.cacheLocality).toBe('l1_optimal');
          expect(card.memoryImpact.heapAllocationsEstimate.length).toBeGreaterThan(0);
          expect(card.memoryImpact.stackFrameImpact.length).toBeGreaterThan(0);

          // Language breakdown assertions
          expect(card.languageBreakdown.targetLanguage).toBe(lang);
          expect(card.languageBreakdown.commonPitfalls.length).toBeGreaterThan(0);
          expect(card.languageBreakdown.learningObjective.length).toBeGreaterThan(0);

          // Embedded cloze challenge assertions
          expect(card.clozeChallenge).toBeDefined();
          expect(card.clozeChallenge?.blanks.length).toBeGreaterThanOrEqual(1);
          expect(card.clozeChallenge?.blanks[0].distractors.length).toBeGreaterThanOrEqual(2);
        }
      });
    }

    it('generates dynamic language-specific memory allocation profiles for Java and C++', async () => {
      const javaResult = await engine.analyzeError({
        languageId: 'java',
        rawError: 'java.lang.NullPointerException at com.example.App.main()',
        fileUri: 'file:///workspace/src/App.java',
      });
      const javaPerfCard = javaResult.cards.find((c) => c.variant === 'performance');
      expect(javaPerfCard).toBeDefined();
      expect(javaPerfCard!.memoryImpact.allocationType).toBe('arena_pooled');
      const mentionsOffHeapOrDirect =
        javaPerfCard!.memoryImpact.heapAllocationsEstimate.includes('DirectByteBuffer') ||
        javaPerfCard!.memoryImpact.heapAllocationsEstimate.includes('off-heap') ||
        javaPerfCard!.memoryImpact.notes.includes('direct native memory');
      expect(mentionsOffHeapOrDirect).toBe(true);

      // Java Minimalist Card:
      const javaMinCard = javaResult.cards.find((c) => c.variant === 'minimalist');
      expect(javaMinCard).toBeDefined();
      expect(javaMinCard!.memoryImpact.allocationType).toBe('zero_alloc');
      expect(javaMinCard!.memoryImpact.heapAllocationsEstimate).toContain('constant pool');

      const cppResult = await engine.analyzeError({
        languageId: 'cpp',
        rawError: 'segmentation fault (core dumped)',
        fileUri: 'file:///workspace/src/main.cpp',
      });
      const cppPerfCard = cppResult.cards.find((c) => c.variant === 'performance');
      expect(cppPerfCard).toBeDefined();
      expect(cppPerfCard!.memoryImpact.allocationType).toBe('zero_alloc');
      expect(cppPerfCard!.memoryImpact.stackFrameImpact).toContain('registers');

      // C++ Minimalist Card:
      const cppMinCard = cppResult.cards.find((c) => c.variant === 'minimalist');
      expect(cppMinCard).toBeDefined();
      expect(cppMinCard!.memoryImpact.allocationType).toBe('zero_alloc');
      expect(cppMinCard!.memoryImpact.notes).toContain('no heap involvement');
    });
  });

  describe('6. Streaming Pipeline & 50ms Backpressure Batcher', () => {
    it('batches rapid tokens within 50ms interval into single chunk', async () => {
      const emittedChunks: any[] = [];
      const batcher = new StreamBatcher({
        batchIntervalMs: 50,
        correlationId: 'batch-test-1',
        targetZone: 'top_contract',
        emitter: (chunk) => emittedChunks.push(chunk),
      });

      // Push 5 tokens rapidly
      batcher.push('Contract ');
      batcher.push('violation ');
      batcher.push('detected ');
      batcher.push('at ');
      batcher.push('runtime.');

      expect(emittedChunks.length).toBe(0); // Not emitted yet

      // Wait 70ms for batch timer
      await new Promise((r) => setTimeout(r, 70));

      expect(emittedChunks.length).toBe(1);
      expect(emittedChunks[0].token).toBe('Contract violation detected at runtime.');
      expect(emittedChunks[0].sequenceNumber).toBe(0);
      expect(emittedChunks[0].isLastChunk).toBe(false);
    });

    it('eagerly flushes tail token on stream completion with isLastChunk: true', () => {
      const emittedChunks: any[] = [];
      const batcher = new StreamBatcher({
        batchIntervalMs: 50,
        correlationId: 'tail-test',
        targetZone: 'top_contract',
        emitter: (chunk) => emittedChunks.push(chunk),
      });

      batcher.push('Immediate flush token');
      batcher.complete();

      expect(emittedChunks.length).toBe(1);
      expect(emittedChunks[0].token).toBe('Immediate flush token');
      expect(emittedChunks[0].isLastChunk).toBe(true);
    });

    it('streams complete diagnostics analysis over WebSocket with notifications', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}?token=${AUTH_TOKEN}`);
      await waitForSocketOpen(ws);

      const notifications: any[] = [];
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.method) {
          notifications.push(parsed);
        }
      });

      const response = await sendRpcRequest(ws, {
        jsonrpc: '2.0',
        id: 701,
        method: 'diagnostics.analyzeError',
        params: {
          correlationId: 'corr-ws-stream-1',
          rawError: 'NullPointerException at com.example.App.process()',
          languageId: 'java',
          fileUri: 'file:///workspace/src/App.java',
        },
      });

      expect(response.id).toBe(701);
      expect(response.result.accepted).toBe(true);
      expect(response.result.correlationId).toBe('corr-ws-stream-1');

      // Wait for notifications to stream
      await new Promise((r) => setTimeout(r, 200));

      const methodNames = notifications.map((n) => n.method);
      expect(methodNames).toContain('diagnostics.contractViolated');
      expect(methodNames).toContain('diagnostics.tokenChunk');
      expect(methodNames).toContain('diagnostics.smartCardsReady');
      expect(methodNames).toContain('diagnostics.analysisCompleted');

      ws.close();
    });
  });
});
