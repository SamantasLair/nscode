import React, { useState, useRef } from 'react';

export interface TypeAlongPracticeProps {
  cardId: string;
  snippet: string;
  languageId?: string;
  minAccuracyPercent?: number;
  onCompleted: (accuracy: number) => void;
}

export const TypeAlongPractice: React.FC<TypeAlongPracticeProps> = ({
  snippet,
  minAccuracyPercent = 90.0,
  onCompleted,
}) => {
  const [typedInput, setTypedInput] = useState<string>('');
  const [pasteBlockedAlert, setPasteBlockedAlert] = useState<boolean>(false);
  const [finished, setFinished] = useState<boolean>(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const target = snippet.trim();
  const typed = typedInput;

  let correctCount = 0;
  for (let i = 0; i < typed.length; i++) {
    if (i < target.length && typed[i] === target[i]) {
      correctCount++;
    }
  }

  const accuracy = typed.length > 0
    ? Math.min(100, Math.max(0, (correctCount / typed.length) * 100))
    : 100;

  const isComplete = typed.length >= target.length;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTypedInput(val);

    if (val.length >= target.length && !finished) {
      setFinished(true);
      const finalAccuracy = (correctCount / Math.max(1, val.length)) * 100;
      onCompleted(parseFloat(finalAccuracy.toFixed(1)));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // INVIOLABLE ANTI-PASTE INVARIANT
    e.preventDefault();
    setPasteBlockedAlert(true);
    setTimeout(() => setPasteBlockedAlert(false), 3500);
  };

  const handleReset = () => {
    setTypedInput('');
    setFinished(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const renderCharacterStream = () => {
    return target.split('').map((char, index) => {
      let statusClass = 'untyped';
      if (index < typed.length) {
        statusClass = typed[index] === char ? 'correct' : 'mismatch';
      }
      const isCursor = index === typed.length;

      return (
        <span key={index} className={`char-stream-item ${statusClass} ${isCursor ? 'cursor' : ''}`}>
          {char === '\n' ? '↵\n' : char}
        </span>
      );
    });
  };

  return (
    <div className="type-along-container">
      <div className="type-along-header">
        <h4>Latihan Ketik Terpandu (Type-Along Practice)</h4>
        <div className="metrics-pill-group">
          <span className={`accuracy-pill ${accuracy >= minAccuracyPercent ? 'good' : 'warning'}`}>
            Akurasi: {accuracy.toFixed(1)}% (Target: &ge;{minAccuracyPercent}%)
          </span>
          <span className="progress-pill">
            Progres: {Math.min(100, Math.round((typed.length / target.length) * 100))}%
          </span>
        </div>
      </div>

      {pasteBlockedAlert && (
        <div className="paste-blocked-alert" role="alert">
          <strong>Akses Ditolak:</strong> Penempelan (paste) dinonaktifkan untuk melatih retensi motorik.
        </div>
      )}

      {/* Target Character Stream */}
      <pre className="type-along-stream" onClick={() => inputRef.current?.focus()}>
        <code>{renderCharacterStream()}</code>
      </pre>

      {/* Native Typing Input */}
      <textarea
        ref={inputRef}
        value={typedInput}
        onChange={handleInputChange}
        onPaste={handlePaste}
        placeholder="Ketik baris kode di atas secara manual di sini..."
        className="type-along-input"
        rows={4}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />

      {isComplete && (
        <div className={`type-along-result ${accuracy >= minAccuracyPercent ? 'passed' : 'failed'}`}>
          {accuracy >= minAccuracyPercent ? (
            <div>
              <strong>Latihan Selesai:</strong> Akurasi Anda {accuracy.toFixed(1)}% memenuhi syarat (&ge;90%). Tombol Salin Kode kini terbuka.
            </div>
          ) : (
            <div>
              <strong>Akurasi {accuracy.toFixed(1)}% di bawah target 90.0%.</strong> Tombol salin belum terbuka. Silakan ulangi untuk mengasah ketelitian.
              <button type="button" className="btn-retry" onClick={handleReset}>
                Ulangi Latihan
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
