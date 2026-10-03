import React from 'react';

export interface StatusBarProps {
  connected: boolean;
  latencyMs: number;
  activeFileUri?: string | null;
  activeLanguageId?: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  connected,
  latencyMs,
  activeFileUri,
  activeLanguageId,
}) => {
  const fileName = activeFileUri ? activeFileUri.split(/[\\/]/).pop() : 'Belum ada file aktif';

  return (
    <footer className="status-bar" aria-label="Status Sistem">
      <div className="status-left">
        <span className={`status-indicator ${connected ? 'online' : 'offline'}`} />
        <span className="status-text">
          {connected ? `Sidecar Terhubung (${latencyMs}ms)` : 'Sidecar Terputus (Mencoba menghubungkan kembali...)'}
        </span>
      </div>

      <div className="status-right">
        {activeFileUri && (
          <span className="active-file-indicator">
            {fileName} {activeLanguageId ? `(${activeLanguageId})` : ''}
          </span>
        )}
      </div>
    </footer>
  );
};
