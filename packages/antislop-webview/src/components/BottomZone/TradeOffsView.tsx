import React, { useState } from 'react';
import type { SmartCardTradeOffs, TradeOffAnalysisDTO } from '@antislop/protocol';

export interface TradeOffsViewProps {
  tradeOffs: SmartCardTradeOffs;
}

export const TradeOffsView: React.FC<TradeOffsViewProps> = ({ tradeOffs }) => {
  const [expanded, setExpanded] = useState(false);

  const isStructured = (val: SmartCardTradeOffs): val is TradeOffAnalysisDTO => {
    return typeof val === 'object' && val !== null && !Array.isArray(val) && 'pros' in val;
  };

  return (
    <div className="trade-offs-view">
      <button
        type="button"
        className="section-toggle-btn"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="icon">{expanded ? '▼' : '▶'}</span>
        <span className="title">Analisis Kompromi (Trade-Offs)</span>
      </button>

      {expanded && (
        <div className="trade-offs-details">
          {isStructured(tradeOffs) ? (
            <>
              <div className="pros-cons-grid">
                <div className="pros-column">
                  <span className="column-title">Kelebihan:</span>
                  <ul>
                    {tradeOffs.pros.map((p, idx) => (
                      <li key={idx} className="pro-item">✓ {p}</li>
                    ))}
                  </ul>
                </div>
                <div className="cons-column">
                  <span className="column-title">Kekurangan:</span>
                  <ul>
                    {tradeOffs.cons.map((c, idx) => (
                      <li key={idx} className="con-item">— {c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="scores-row">
                <div className="score-item">
                  <span className="score-label">Keterbacaan:</span>
                  <span className={`score-badge score-${tradeOffs.readability}`}>
                    {tradeOffs.readability}
                  </span>
                </div>
                <div className="score-item">
                  <span className="score-label">Pemeliharaan:</span>
                  <span className={`score-badge score-${tradeOffs.maintainability}`}>
                    {tradeOffs.maintainability}
                  </span>
                </div>
              </div>

              <div className="suitability-note">
                <strong>Kesesuaian Produksi:</strong> {tradeOffs.productionSuitability}
              </div>
            </>
          ) : (
            <ul className="simple-trade-offs-list">
              {(tradeOffs as string[]).map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
