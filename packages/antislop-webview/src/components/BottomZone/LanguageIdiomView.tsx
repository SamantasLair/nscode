import React, { useState } from 'react';
import type { LanguageSyntaxBreakdownDTO } from '@antislop/protocol';

export interface LanguageIdiomViewProps {
  languageBreakdown: LanguageSyntaxBreakdownDTO;
}

export const LanguageIdiomView: React.FC<LanguageIdiomViewProps> = ({ languageBreakdown }) => {
  const [expanded, setExpanded] = useState(false);

  const langNames: Record<string, string> = {
    c: 'C (ISO C11)',
    cpp: 'C++ (Modern C++20)',
    java: 'Java (LTS)',
    csharp: 'C# (.NET Core)',
    python: 'Python (CPython 3.11+)',
    php: 'PHP (PHP 8+)',
  };

  return (
    <div className="language-idiom-view">
      <button
        type="button"
        className="section-toggle-btn"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="icon">{expanded ? '▼' : '▶'}</span>
        <span className="title">
          Mekanika Bahasa ({langNames[languageBreakdown.targetLanguage] || languageBreakdown.targetLanguage}):
        </span>
        <span className="construct-tag">{languageBreakdown.primaryConstruct}</span>
      </button>

      {expanded && (
        <div className="language-idiom-details">
          {languageBreakdown.astNodeType && (
            <div className="detail-item">
              <span className="detail-label">Tipe Simpul AST:</span>
              <span className="detail-val ast-node">{languageBreakdown.astNodeType}</span>
            </div>
          )}

          <div className="detail-item">
            <span className="detail-label">Mekanisme Runtime:</span>
            <p className="detail-val">{languageBreakdown.runtimeMechanism}</p>
          </div>

          <div className="detail-item">
            <span className="detail-label">Tujuan Pembelajaran:</span>
            <p className="detail-val learning-objective">{languageBreakdown.learningObjective}</p>
          </div>

          {languageBreakdown.commonPitfalls && languageBreakdown.commonPitfalls.length > 0 && (
            <div className="pitfalls-section">
              <span className="pitfalls-label">Jebakan Umum (Pitfalls):</span>
              <ul className="pitfalls-list">
                {languageBreakdown.commonPitfalls.map((pitfall, i) => (
                  <li key={i}>{pitfall}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
