import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VsCodeApiBridge } from '../src/vscode-api.js';
import type { ExtensionToWebviewMessage } from '@antislop/protocol';

describe('VsCodeApiBridge: Typed Webview-Host Communication & Protocol Fidelity', () => {
  let bridge: VsCodeApiBridge;

  beforeEach(() => {
    VsCodeApiBridge.resetInstanceForTesting();
    bridge = VsCodeApiBridge.getInstance();
    bridge.clearOutboundHistory();
  });

  afterEach(() => {
    VsCodeApiBridge.resetInstanceForTesting();
  });

  it('provides a safe singleton instance in standalone development mode', () => {
    expect(bridge).toBeDefined();
    expect(bridge.getIsStandaloneBrowser()).toBe(true);

    const instance2 = VsCodeApiBridge.getInstance();
    expect(instance2).toBe(bridge);
  });

  it('validates and dispatches HIGHLIGHT_LINE outbound messages according to protocol schema', () => {
    const success = bridge.highlightLine({
      fileUri: 'file:///workspace/src/allocator.c',
      line: 42,
      endLine: 45,
    });

    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'HIGHLIGHT_LINE',
      payload: {
        fileUri: 'file:///workspace/src/allocator.c',
        line: 42,
        endLine: 45,
      },
    });
  });

  it('strictly rejects invalid HIGHLIGHT_LINE payloads (empty URI or invalid line numbers)', () => {
    const success = bridge.highlightLine({
      fileUri: '',
      line: -5,
    } as any);

    expect(success).toBe(false);
    expect(bridge.getOutboundHistory().length).toBe(0);
  });

  it('validates and dispatches REQUEST_ANALYSIS outbound messages', () => {
    const success = bridge.requestAnalysis({
      rawError: 'Segmentation fault (core dumped) at 0x0000',
    });

    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'REQUEST_ANALYSIS',
      payload: {
        rawError: 'Segmentation fault (core dumped) at 0x0000',
      },
    });
  });

  it('validates and dispatches PRACTICE_COMPLETED outbound messages', () => {
    const success = bridge.practiceCompleted({
      cardId: 'b78a8f11-094e-4f11-8be9-cf0224bf1cf2',
      accuracy: 94.5,
    });

    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'PRACTICE_COMPLETED',
      payload: {
        cardId: 'b78a8f11-094e-4f11-8be9-cf0224bf1cf2',
        accuracy: 94.5,
      },
    });
  });

  it('strictly rejects PRACTICE_COMPLETED with accuracy out of 0-100 bounds', () => {
    const success = bridge.practiceCompleted({
      cardId: 'b78a8f11-094e-4f11-8be9-cf0224bf1cf2',
      accuracy: 120.0,
    } as any);

    expect(success).toBe(false);
    expect(bridge.getOutboundHistory().length).toBe(0);
  });

  it('validates and dispatches COLLAPSE_SCREEN_B outbound message to close sidebar', () => {
    const success = bridge.collapseSidebar();
    expect(success).toBe(true);
    const history = bridge.getOutboundHistory();
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      type: 'COLLAPSE_SCREEN_B',
      payload: {},
    });
  });

  it('subscribes to and receives typed inbound messages from extension host', () => {
    const received: ExtensionToWebviewMessage[] = [];
    const unsubscribe = bridge.onMessage((msg) => {
      received.push(msg);
    });

    bridge.dispatchMockIncoming({
      type: 'SET_ACTIVE_FILE',
      payload: {
        fileUri: 'file:///workspace/src/main.rs',
        languageId: 'rust',
      },
    });

    bridge.dispatchMockIncoming({
      type: 'WATCHDOG_STATUS',
      payload: {
        connected: true,
        latencyMs: 12,
      },
    });

    expect(received.length).toBe(2);
    expect(received[0]?.type).toBe('SET_ACTIVE_FILE');
    expect(received[1]?.type).toBe('WATCHDOG_STATUS');

    unsubscribe();
    bridge.dispatchMockIncoming({
      type: 'CLEAR_HIGHLIGHTS',
    });

    // Should not receive messages after unsubscribe
    expect(received.length).toBe(2);
  });

  it('filters out malformed or untyped messages from other sources', () => {
    const received: ExtensionToWebviewMessage[] = [];
    bridge.onMessage((msg) => {
      received.push(msg);
    });

    // Simulate random untyped window message
    bridge.dispatchMockIncoming({
      type: 'UNKNOWN_FOREIGN_EVENT',
      foo: 'bar',
    } as any);

    expect(received.length).toBe(0);
  });
});
