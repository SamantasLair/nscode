import React, { useState, useEffect } from 'react';
import type { ClozeChallengeDTO, ClozeBlankDTO } from '@antislop/protocol';

export interface ClozeChallengeProps {
  challenge: ClozeChallengeDTO;
  cardId: string;
  onSuccess: () => void;
  onFailure?: (attempts: number) => void;
}

export const ClozeChallenge: React.FC<ClozeChallengeProps> = ({
  challenge,
  onSuccess,
}) => {
  const [unmaskedIndices, setUnmaskedIndices] = useState<Set<number>>(new Set());
  const [currentBlankIdx, setCurrentBlankIdx] = useState<number>(0);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);
  const [attempts, setAttempts] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeBlank: ClozeBlankDTO | undefined = challenge.blanks[currentBlankIdx];

  const options = React.useMemo(() => {
    if (!activeBlank) return [];
    const list = [activeBlank.token, ...activeBlank.distractors];
    return [...list].sort();
  }, [activeBlank]);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemainingMs((prev) => Math.max(0, prev - 100));
    }, 100);
    return () => clearInterval(interval);
  }, [cooldownRemainingMs]);

  const handleSelectOption = (chosen: string) => {
    if (cooldownRemainingMs > 0 || !activeBlank) return;

    if (chosen === activeBlank.token) {
      const nextUnmasked = new Set(unmaskedIndices);
      nextUnmasked.add(activeBlank.index);
      setUnmaskedIndices(nextUnmasked);
      setErrorMessage(null);
      setAttempts(0);

      if (currentBlankIdx + 1 < challenge.blanks.length) {
        setCurrentBlankIdx(currentBlankIdx + 1);
      } else {
        onSuccess();
      }
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setErrorMessage(`Pilihan "${chosen}" tidak tepat. Perhatikan kaidah sintaks dan model memori!`);
      setCooldownRemainingMs(challenge.penaltyCooldownMs || 1500);

      if (nextAttempts >= challenge.maxAttemptsPerBlank && challenge.revealAfterFailures) {
        setErrorMessage(`Petunjuk: ${activeBlank.hint}`);
      }
    }
  };

  const renderMaskedCode = () => {
    const raw = challenge.maskedSnippet;
    const parts = raw.split(/(\{BLANK_\d+\})/g);

    return parts.map((part, i) => {
      const match = part.match(/\{BLANK_(\d+)\}/);
      if (match) {
        const blankIdx = parseInt(match[1]!, 10);
        const blankObj = challenge.blanks.find((b) => b.index === blankIdx);
        const isUnmasked = unmaskedIndices.has(blankIdx);
        const isActive = blankIdx === currentBlankIdx && !isUnmasked;

        if (isUnmasked && blankObj) {
          return (
            <span key={i} className="cloze-token unmasked">
              {blankObj.token}
            </span>
          );
        }

        return (
          <span
            key={i}
            className={`cloze-token masked ${isActive ? 'active-target' : ''}`}
          >
            {isActive ? `[ ${blankObj?.category || 'pilih'} ]` : '[ ? ]'}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const isCompleted = unmaskedIndices.size === challenge.blanks.length;

  return (
    <div className="cloze-challenge-container">
      <div className="cloze-header">
        <h4>Teka-teki Token Kognitif (Cloze Challenge)</h4>
        <span className="cloze-progress">
          {unmaskedIndices.size} / {challenge.blanks.length} token terpecahkan
        </span>
      </div>

      <pre className="cloze-code-display">
        <code>{renderMaskedCode()}</code>
      </pre>

      {!isCompleted && activeBlank && (
        <div className="cloze-interactive-pane">
          <div className="hint-banner">
            <strong>Petunjuk ({activeBlank.category}):</strong> {activeBlank.hint}
          </div>

          <div className="distractor-chips-group">
            {options.map((opt, idx) => (
              <button
                key={idx}
                disabled={cooldownRemainingMs > 0}
                className="token-chip"
                onClick={() => handleSelectOption(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          {cooldownRemainingMs > 0 && (
            <div className="cooldown-indicator">
              Jeda penalti: {(cooldownRemainingMs / 1000).toFixed(1)} detik...
            </div>
          )}

          {errorMessage && <div className="cloze-error-banner">{errorMessage}</div>}
        </div>
      )}

      {isCompleted && (
        <div className="cloze-success-banner">
          <strong>Verifikasi Sintaks Selesai.</strong> Seluruh token sintaks berhasil dipecahkan. Tombol Salin Kode telah dibuka.
        </div>
      )}
    </div>
  );
};
