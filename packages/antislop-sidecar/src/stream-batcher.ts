import type { TokenChunkParams } from '@antislop/protocol';

export type ChunkEmitter = (chunk: TokenChunkParams) => void;

export interface StreamBatcherOptions {
  batchIntervalMs?: number;
  correlationId: string;
  targetZone: 'top_contract' | 'deep_syntax' | 'smart_cards';
  emitter: ChunkEmitter;
}

export class StreamBatcher {
  private batchIntervalMs: number;
  private correlationId: string;
  private targetZone: 'top_contract' | 'deep_syntax' | 'smart_cards';
  private emitter: ChunkEmitter;

  private buffer: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sequenceNumber: number = 0;
  private isCompleted: boolean = false;

  constructor(options: StreamBatcherOptions) {
    this.batchIntervalMs = options.batchIntervalMs ?? 50;
    this.correlationId = options.correlationId;
    this.targetZone = options.targetZone;
    this.emitter = options.emitter;
  }

  public push(token: string): void {
    if (this.isCompleted) {
      throw new Error(`Cannot push tokens to completed stream for correlationId: ${this.correlationId}`);
    }
    this.buffer.push(token);

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush(false);
      }, this.batchIntervalMs);

      if (this.timer.unref) {
        this.timer.unref();
      }
    }
  }

  public flush(isLastChunk: boolean = false): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0 && !isLastChunk) {
      return;
    }

    const merged = this.buffer.join('');
    this.buffer = [];

    const chunk: TokenChunkParams = {
      correlationId: this.correlationId,
      token: merged,
      targetZone: this.targetZone,
      sequenceNumber: this.sequenceNumber++,
      isLastChunk,
    };

    this.emitter(chunk);
  }

  public complete(): void {
    if (this.isCompleted) {
      return;
    }
    this.isCompleted = true;
    this.flush(true);
  }

  public getSequenceNumber(): number {
    return this.sequenceNumber;
  }

  public getPendingBuffer(): string {
    return this.buffer.join('');
  }
}
