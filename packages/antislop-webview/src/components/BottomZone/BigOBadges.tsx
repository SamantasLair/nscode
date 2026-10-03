import React, { useState } from 'react';

export interface BigOBadgesProps {
  timeComplexity: string;
  spaceComplexity: string;
  complexityProof: string;
}

export const BigOBadges: React.FC<BigOBadgesProps> = ({
  timeComplexity,
  spaceComplexity,
  complexityProof,
}) => {
  const [showProof, setShowProof] = useState(false);

  const getBadgeClass = (complexityStr: string) => {
    if (complexityStr.includes('O(1)')) return 'complexity-o1';
    if (complexityStr.includes('log')) return 'complexity-ologn';
    if (complexityStr.includes('^2')) return 'complexity-on2';
    if (complexityStr.includes('n')) return 'complexity-on';
    return 'complexity-default';
  };

  return (
    <div className="big-o-badges-container" aria-label="Kompleksitas Asimptotik Big-O">
      <div className="badges-row">
        <div className={`complexity-badge ${getBadgeClass(timeComplexity)}`}>
          <span className="badge-type">Waktu:</span>
          <span className="badge-value">{timeComplexity}</span>
        </div>
        <div className={`complexity-badge ${getBadgeClass(spaceComplexity)}`}>
          <span className="badge-type">Ruang:</span>
          <span className="badge-value">{spaceComplexity}</span>
        </div>
        <button
          type="button"
          className="btn-toggle-proof"
          onClick={() => setShowProof(!showProof)}
          aria-expanded={showProof}
          title="Tampilkan bukti penurunan matematis Big-O"
        >
          {showProof ? 'Sembunyikan Bukti' : 'Bukti Penurunan'}
        </button>
      </div>

      {showProof && (
        <div className="complexity-proof-box" role="region" aria-label="Bukti Penurunan Matematis">
          <strong>Bukti Penurunan Asimptotik:</strong>
          <p>{complexityProof}</p>
        </div>
      )}
    </div>
  );
};
