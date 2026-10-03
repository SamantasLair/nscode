import React, { useState } from 'react';
import { vscodeApi } from '../../vscode-api.js';

export interface LinePointerButtonProps {
  fileUri: string;
  line: number;
  endLine?: number;
  isActiveFileMatch?: boolean;
}

export const LinePointerButton: React.FC<LinePointerButtonProps> = ({
  fileUri,
  line,
  endLine,
  isActiveFileMatch = true,
}) => {
  const [highlighted, setHighlighted] = useState(false);

  const handleClick = () => {
    vscodeApi.highlightLine({
      fileUri,
      line,
      endLine,
    });
    setHighlighted(true);
  };

  const lineDisplay = endLine && endLine !== line ? `Baris ${line}–${endLine}` : `Baris ${line}`;

  return (
    <div className="line-pointer-container">
      <button
        type="button"
        className={`line-pointer-btn ${highlighted ? 'highlighted' : ''}`}
        onClick={handleClick}
        aria-label={`Sorot ${lineDisplay} di Layar A`}
      >
        <span className="icon">{highlighted ? '✓' : '→'}</span>
        <span>
          {highlighted
            ? `Tersorot di Layar A (${lineDisplay})`
            : `Sorot ${lineDisplay} di Layar A`}
        </span>
      </button>
      {!isActiveFileMatch && (
        <span className="file-mismatch-hint">
          (File aktif berbeda — klik tombol untuk menyorot dan membuka file sumber)
        </span>
      )}
    </div>
  );
};
