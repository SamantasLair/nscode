import React, { useState, useMemo, useCallback } from 'react';
import type { HighlightLinePayload } from '@antislop/protocol';
import { vscodeApi } from '../../vscode-api.js';
import { tokenize, tokenizeLines, type MicroToken } from './micro-tokenizer.js';
import type { CodePreviewProps, ParsedCodeLine, HighlightRange } from './CodePreview.types.js';
import './CodePreview.css';

export const CodePreview: React.FC<CodePreviewProps> = ({
  code,
  languageId,
  fileUri,
  startLineNumber = 1,
  highlightedLine,
  mode = 'auto',
  title,
  maxHeight,
  showLineNumbers = true,
  showCopyButton = true,
  isUnlocked = true,
  enableIpcHighlight = true,
  onLineClick,
  onError,
  fallback,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const [activeIpcLine, setActiveIpcLine] = useState<number | null>(null);
  const [showLockTooltip, setShowLockTooltip] = useState(false);

  // Normalize highlight ranges
  const isLineHighlighted = useCallback(
    (lineNum: number | null): boolean => {
      if (lineNum === null || highlightedLine === undefined) return false;
      if (typeof highlightedLine === 'number') {
        return lineNum === highlightedLine;
      }
      if (Array.isArray(highlightedLine)) {
        return highlightedLine.includes(lineNum);
      }
      const range = highlightedLine as HighlightRange;
      const end = range.endLine ?? range.startLine;
      return lineNum >= range.startLine && lineNum <= end;
    },
    [highlightedLine]
  );

  // Auto-detect diff syntax if mode is 'auto'
  const isDiffMode = useMemo(() => {
    if (mode === 'diff') return true;
    if (mode === 'code') return false;
    const lines = (code || '').split('\n', 10);
    return lines.some(
      (l) =>
        l.startsWith('@@') ||
        (l.startsWith('+') && !l.startsWith('+++')) ||
        (l.startsWith('-') && !l.startsWith('--'))
    );
  }, [code, mode]);

  // Parse lines with line numbers, diff markers, and tokenize code content
  const parsedLines: ParsedCodeLine[] = useMemo(() => {
    try {
      const rawLines = (code || '').split(/\r?\n/);
      let currentLineNum = startLineNumber;
      let currentOldLineNum = startLineNumber;

      if (isDiffMode) {
        return rawLines.map((raw) => {
          if (raw.startsWith('@@')) {
            const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
              currentOldLineNum = parseInt(match[1]!, 10);
              currentLineNum = parseInt(match[2]!, 10);
            }
            return {
              lineNumber: null,
              oldLineNumber: null,
              type: 'hunk-header' as const,
              prefix: '@@',
              tokens: [{ kind: 2, type: 'token-comment', value: raw, line: 1, col: 1 }],
              raw,
              isHighlighted: false,
            };
          }
          if (raw.startsWith('+') && !raw.startsWith('+++')) {
            const lineNum = currentLineNum++;
            const content = raw.slice(1);
            return {
              lineNumber: lineNum,
              oldLineNumber: null,
              type: 'added' as const,
              prefix: '+',
              tokens: tokenize(content, { language: languageId }),
              raw,
              isHighlighted: isLineHighlighted(lineNum),
            };
          }
          if (raw.startsWith('-') && !raw.startsWith('---')) {
            const oldNum = currentOldLineNum++;
            const content = raw.slice(1);
            return {
              lineNumber: null,
              oldLineNumber: oldNum,
              type: 'removed' as const,
              prefix: '-',
              tokens: tokenize(content, { language: languageId }),
              raw,
              isHighlighted: false,
            };
          }
          // Neutral context line
          const lineNum = currentLineNum++;
          currentOldLineNum++;
          const content = raw.startsWith(' ') ? raw.slice(1) : raw;
          return {
            lineNumber: lineNum,
            oldLineNumber: currentOldLineNum,
            type: 'neutral' as const,
            prefix: ' ',
            tokens: tokenize(content, { language: languageId }),
            raw,
            isHighlighted: isLineHighlighted(lineNum),
          };
        });
      }

      // Standard pure code mode: use tokenizeLines across entire code to preserve multiline state
      const allLineTokens = tokenizeLines(code || '', { language: languageId });
      return rawLines.map((raw, idx) => {
        const lineNum = currentLineNum++;
        return {
          lineNumber: lineNum,
          type: 'neutral' as const,
          prefix: '',
          tokens: allLineTokens[idx] || tokenize(raw, { language: languageId }),
          raw,
          isHighlighted: isLineHighlighted(lineNum),
        };
      });
    } catch (err) {
      if (onError) onError(err);
      return [];
    }
  }, [code, isDiffMode, startLineNumber, languageId, isLineHighlighted, onError]);

  // Click on line number triggers HIGHLIGHT_LINE IPC to Layar A
  const handleLineClick = (lineNum: number | null) => {
    if (lineNum === null) return;
    setActiveIpcLine(lineNum);

    const payload: HighlightLinePayload | undefined = fileUri
      ? { fileUri, line: lineNum }
      : undefined;

    if (fileUri && enableIpcHighlight) {
      vscodeApi.highlightLine({
        fileUri,
        line: lineNum,
      });
    }

    if (onLineClick) {
      onLineClick(lineNum, payload);
    }

    setTimeout(() => setActiveIpcLine(null), 1800);
  };

  // Smart copy: strips diff prefix markers on diff mode
  const handleCopy = async () => {
    if (!isUnlocked) {
      setShowLockTooltip(true);
      setTimeout(() => setShowLockTooltip(false), 3000);
      return;
    }

    try {
      let textToCopy: string;
      if (isDiffMode) {
        textToCopy = parsedLines
          .filter((l) => l.type !== 'removed' && l.type !== 'hunk-header')
          .map((l) => l.tokens.map((t) => t.value).join(''))
          .join('\n');
      } else {
        textToCopy = code;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('[CodePreview] Clipboard copy failed:', err);
    }
  };

  if (parsedLines.length === 0 && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className={`code-preview-root ${className}`}>
      {/* Top Bar / Header */}
      <div className="code-preview-header">
        <div className="code-preview-meta">
          {title && <span className="preview-filename">{title}</span>}
          {languageId && <span className="preview-language-tag">{languageId}</span>}
          {isDiffMode && <span className="preview-diff-badge">DIFF</span>}
          {fileUri && (
            <span className="preview-file-uri" title={fileUri}>
              {fileUri.split(/[\\/]/).pop()}
            </span>
          )}
        </div>

        <div className="code-preview-actions">
          {/* Word Wrap Toggle */}
          <button
            type="button"
            className={`preview-action-btn ${wrapLines ? 'active' : ''}`}
            title={wrapLines ? 'Matikan Word Wrap' : 'Aktifkan Word Wrap'}
            aria-label="Toggle Word Wrap"
            onClick={() => setWrapLines((prev) => !prev)}
          >
            Wrap
          </button>

          {/* Copy Button with Cognitive Gate Protection */}
          {showCopyButton && (
            <div className="copy-action-wrapper">
              <button
                type="button"
                className={`preview-action-btn copy-btn ${isUnlocked ? 'unlocked' : 'locked'}`}
                aria-label={isUnlocked ? 'Salin Kode' : 'Salin Terkunci'}
                onClick={handleCopy}
                onMouseEnter={() => !isUnlocked && setShowLockTooltip(true)}
                onMouseLeave={() => setShowLockTooltip(false)}
              >
                <span className="btn-icon">{copied ? '✓' : isUnlocked ? '⎘' : '🔒'}</span>
                <span>{copied ? 'Tersalin' : isUnlocked ? 'Salin' : 'Terkunci'}</span>
              </button>

              {showLockTooltip && !isUnlocked && (
                <div className="preview-lock-tooltip" role="tooltip">
                  <strong>Anti-Atrophy Invariant:</strong> Selesaikan tantangan kognitif untuk membuka fitur salin kode!
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Code Viewport with Overflow Protection */}
      <div
        className={`code-preview-viewport ${wrapLines ? 'wrap-enabled' : ''}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div className="code-preview-table" role="region" aria-label="Code Block">
          {parsedLines.map((line, idx) => {
            const isTargetHighlight = line.isHighlighted || activeIpcLine === line.lineNumber;
            const rowClass = [
              'code-preview-row',
              `row-${line.type}`,
              isTargetHighlight ? 'row-highlighted' : '',
            ]
              .filter(Boolean)
              .join(' ');

            if (line.type === 'hunk-header') {
              return (
                <div key={idx} className="code-preview-row hunk-header-row">
                  <div className="gutter-sticky-column hunk-gutter">@@</div>
                  <div className="code-content-column hunk-text">{line.raw}</div>
                </div>
              );
            }

            return (
              <div key={idx} className={rowClass}>
                {/* Sticky Gutter (Line Number + Diff Glyph) */}
                <div className="gutter-sticky-column">
                  {showLineNumbers && (
                    <button
                      type="button"
                      className={`gutter-lineno ${fileUri ? 'interactive' : ''}`}
                      title={
                        fileUri && line.lineNumber
                          ? `Sorot baris ${line.lineNumber} di Editor Layar A`
                          : undefined
                      }
                      onClick={() => handleLineClick(line.lineNumber)}
                      tabIndex={fileUri ? 0 : -1}
                    >
                      {line.lineNumber ?? line.oldLineNumber ?? ''}
                    </button>
                  )}

                  {isDiffMode && (
                    <span className={`diff-glyph glyph-${line.type}`}>
                      {line.prefix}
                    </span>
                  )}
                </div>

                {/* Tokenized Code Content Column */}
                <div className="code-content-column">
                  {line.tokens.length > 0 ? (
                    line.tokens.map((token: MicroToken, tIdx: number) => (
                      <span key={tIdx} className={token.type}>
                        {token.value}
                      </span>
                    ))
                  ) : (
                    <span>{' '}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
