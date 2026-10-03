import React, { useState } from 'react';
import { vscodeApi } from '../../vscode-api.js';

export interface ManualErrorInputProps {
  onSubmit?: (rawError: string) => void;
  isLoading?: boolean;
}

export const ManualErrorInput: React.FC<ManualErrorInputProps> = ({
  onSubmit,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rawError, setRawError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rawError.trim();
    if (trimmed.length < 5) {
      setValidationError('Masukkan pesan error atau jejak stack trace minimal 5 karakter.');
      return;
    }

    setValidationError(null);
    vscodeApi.requestAnalysis({ rawError: trimmed });
    if (onSubmit) {
      onSubmit(trimmed);
    }
  };

  const handleClear = () => {
    setRawError('');
    setValidationError(null);
  };

  return (
    <section className="manual-error-section" aria-label="Input Error Manual">
      <button
        type="button"
        className="accordion-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="icon">{isOpen ? '▼' : '▶'}</span>
        <span>Input Error Manual / Tempel Jejak Stack Trace</span>
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="manual-error-form">
          <label htmlFor="manual-error-textarea" className="form-label">
            Tempelkan pesan kesalahan compiler atau jejak kegagalan runtime di sini:
          </label>
          <textarea
            id="manual-error-textarea"
            className="manual-error-textarea"
            value={rawError}
            onChange={(e) => {
              setRawError(e.target.value);
              if (validationError && e.target.value.trim().length >= 5) {
                setValidationError(null);
              }
            }}
            placeholder="Contoh: error[E0382]: borrow of moved value: `buf`&#10;  --> src/main.rs:42:5"
            rows={5}
            spellCheck="false"
          />

          {validationError && (
            <div className="validation-error-msg" role="alert">
              [!] {validationError}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={isLoading || rawError.trim().length < 5}
              className="btn-submit-analysis"
            >
              {isLoading ? 'Menganalisis...' : 'Kirim Analisis ke Layar B'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading || rawError.length === 0}
              className="btn-clear"
            >
              Bersihkan
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
