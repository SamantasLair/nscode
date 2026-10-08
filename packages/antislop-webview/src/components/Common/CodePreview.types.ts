import type { ReactNode } from 'react';
import type { HighlightLinePayload } from '@antislop/protocol';
import type { MicroToken } from './micro-tokenizer.js';

export type DiffLineType = 'added' | 'removed' | 'neutral' | 'hunk-header';

export interface ParsedCodeLine {
  lineNumber: number | null;
  oldLineNumber?: number | null;
  type: DiffLineType;
  prefix: string;
  tokens: MicroToken[];
  raw: string;
  isHighlighted: boolean;
}

export interface HighlightRange {
  startLine: number;
  endLine?: number;
}

export interface CodePreviewProps {
  /** Raw code or unified diff string */
  code: string;
  /** Language identifier (e.g. 'typescript', 'python', 'cpp') */
  languageId?: string;
  /** File URI for HIGHLIGHT_LINE IPC jump integration */
  fileUri?: string;
  /** Starting line number for 1-indexed display (defaults to 1) */
  startLineNumber?: number;
  /** Highlight target: single line, line range, or array of line numbers */
  highlightedLine?: number | HighlightRange | number[];
  /** Mode: 'code' (pure code) | 'diff' (unified diff with +/- markers) | 'auto' */
  mode?: 'code' | 'diff' | 'auto';
  /** Title or filename to display in the header bar */
  title?: string;
  /** Maximum container height (e.g. '300px', 'min(60vh, 500px)') */
  maxHeight?: string | number;
  /** Show line numbers gutter (defaults to true) */
  showLineNumbers?: boolean;
  /** Show copy button (defaults to true) */
  showCopyButton?: boolean;
  /** Cognitive gate clipboard lock state (defaults to true / unlocked) */
  isUnlocked?: boolean;
  /** Allow clicking line number to trigger HIGHLIGHT_LINE IPC (defaults to true if fileUri present) */
  enableIpcHighlight?: boolean;
  /** Callback fired when a line number or gutter is clicked */
  onLineClick?: (line: number, payload?: HighlightLinePayload) => void;
  /** Optional error callback */
  onError?: (err: unknown) => void;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** Additional custom CSS class */
  className?: string;
}
