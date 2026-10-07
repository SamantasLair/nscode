import React from 'react';
import type { ContractViolatedDTO } from '@antislop/protocol';
import { LinePointerButton } from './LinePointerButton.js';

export interface ContractViolatedProps {
  diagnostic: ContractViolatedDTO;
  streamingTokens?: string;
  isStreaming?: boolean;
  activeFileUri?: string | null;
}

export const ContractViolated: React.FC<ContractViolatedProps> = ({
  diagnostic,
  streamingTokens,
  isStreaming = false,
  activeFileUri,
}) => {
  const {
    errorCode,
    category,
    title,
    contract,
    ruleExplanation,
    rootCause,
    mentalModel,
    sourceLocation,
    relatedSpans,
    severity,
    ingressVector,
    rawError,
  } = diagnostic;

  const isFileMatch = !activeFileUri || activeFileUri === sourceLocation.fileUri;

  const severityBadgeClass = {
    fatal: 'badge-severity-fatal',
    error: 'badge-severity-error',
    warning: 'badge-severity-warning',
  }[severity] || 'badge-severity-error';

  return (
    <article className="contract-violated-card" aria-labelledby="diagnostic-title">
      <div className="diagnostic-header">
        <div className="badge-group">
          <span className={`severity-badge ${severityBadgeClass}`}>
            {severity.toUpperCase()}
          </span>
          <span className="error-code-badge">[{errorCode}]</span>
          <span className="category-pill">{category.replace('_', ' ')}</span>
          <span className="ingress-pill">via {ingressVector}</span>
        </div>
        <h2 id="diagnostic-title" className="diagnostic-title">{title}</h2>
      </div>

      <div className="contract-callout" role="alert">
        <div className="contract-callout-header">
          <span className="icon" style={{ color: 'var(--accent-red)', fontWeight: 700 }}>[!]</span>
          <strong>KONTRAK TERLANGGAR (Broken Invariant):</strong>
        </div>
        <p className="contract-statement">{contract}</p>
      </div>

      <div className="source-location-section">
        <div className="location-info">
          <span className="location-file">{sourceLocation.fileUri}</span>
          <span className="location-range">
            [Baris {sourceLocation.range.startLine}:{sourceLocation.range.startColumn} – {sourceLocation.range.endLine}:{sourceLocation.range.endColumn}]
          </span>
          <span className="location-label">({sourceLocation.label})</span>
        </div>

        <LinePointerButton
          fileUri={sourceLocation.fileUri}
          line={sourceLocation.range.startLine}
          endLine={sourceLocation.range.endLine}
          isActiveFileMatch={isFileMatch}
        />
      </div>

      <div className="code-frame-container">
        <div className="code-frame-header">Cuplikan Kesalahan:</div>
        <pre className="raw-error-frame">
          <code>{rawError}</code>
        </pre>

        {relatedSpans && relatedSpans.length > 0 && (
          <div className="related-spans-list">
            <span className="related-spans-title">Lokasi Terkait:</span>
            {relatedSpans.map((span, idx) => (
              <div key={idx} className="related-span-item">
                <span className="role-tag">[{span.role}]</span>
                <span className="span-coords">
                  {span.fileUri ? `${span.fileUri}:` : ''}Baris {span.range.startLine}:{span.range.startColumn}
                </span>
                <span className="span-label">{span.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="diagnostic-section rule-section">
        <h3>Aturan Semantik</h3>
        <p>{ruleExplanation}</p>
      </div>

      <div className="diagnostic-section root-cause-section">
        <h3>Akar Masalah (Root Cause)</h3>
        <p>{rootCause}</p>
      </div>

      <div className="diagnostic-section mental-model-section">
        <h3>Model Mental Pedagogis</h3>
        <p>{mentalModel}</p>
      </div>

      {isStreaming && streamingTokens && (
        <div className="streaming-token-box" role="status">
          <span className="streaming-label">Aliran Analisis Langsung:</span>
          <span className="streaming-content">{streamingTokens}</span>
          <span className="streaming-cursor">▊</span>
        </div>
      )}
    </article>
  );
};
