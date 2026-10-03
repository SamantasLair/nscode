import React, { useState } from 'react';

export interface LockedCopyButtonProps {
  codeSnippet: string;
  isUnlocked: boolean;
  cardVariant: string;
}

export const LockedCopyButton: React.FC<LockedCopyButtonProps> = ({
  codeSnippet,
  isUnlocked,
}) => {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = async () => {
    if (!isUnlocked) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(codeSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy code snippet to clipboard:', err);
    }
  };

  return (
    <div className="locked-copy-container">
      <button
        type="button"
        disabled={!isUnlocked}
        aria-disabled={!isUnlocked}
        className={`copy-btn ${isUnlocked ? 'unlocked' : 'locked'}`}
        onClick={handleCopy}
        onMouseEnter={() => !isUnlocked && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {isUnlocked ? (
          <>
            <span className="icon">⎘</span>
            <span>{copied ? 'Tersalin!' : 'Salin Kode'}</span>
          </>
        ) : (
          <>
            <span className="icon">[LOCKED]</span>
            <span>Salin Terkunci (Selesaikan Tantangan)</span>
          </>
        )}
      </button>

      {showTooltip && !isUnlocked && (
        <div className="lock-tooltip" role="tooltip">
          <strong>Anti-Atrophy Invariant:</strong> Selesaikan verifikasi token atau latihan ketik di atas untuk membuka fitur salin kode!
        </div>
      )}
    </div>
  );
};
