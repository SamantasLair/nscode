import React, { useState, useEffect } from 'react';
import type {
  ContractViolatedDTO,
  SmartCardDTO,
  ExtensionToWebviewMessage,
} from '@antislop/protocol';
import { vscodeApi } from './vscode-api.js';
import { ContractViolated } from './components/TopZone/ContractViolated.js';
import { ManualErrorInput } from './components/TopZone/ManualErrorInput.js';
import { SmartCardGrid } from './components/BottomZone/SmartCardGrid.js';
import { StatusBar } from './components/Common/StatusBar.js';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp?: number;
}

interface ArchivedSession {
  id: string;
  title: string;
  fileUri?: string | null;
  timestamp: number;
  messageCount: number;
  messages: ChatMessage[];
}

const CHAT_STORAGE_KEY = 'nscode_webview_chat_history';
const SESSIONS_STORAGE_KEY = 'nscode_webview_sessions';

export const App: React.FC = () => {
  const [contractViolated, setContractViolated] = useState<ContractViolatedDTO | null>(null);
  const [cards, setCards] = useState<SmartCardDTO[]>([]);
  const [streamingTokens, setStreamingTokens] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeFileUri, setActiveFileUri] = useState<string | null>(null);
  const [activeLanguageId, setActiveLanguageId] = useState<string | null>(null);
  const [watchdogConnected, setWatchdogConnected] = useState<boolean>(false);
  const [watchdogLatencyMs, setWatchdogLatencyMs] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [activeNavTab, setActiveNavTab] = useState<'chat' | 'sessions'>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [savedSessions, setSavedSessions] = useState<ArchivedSession[]>(() => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
    } catch (_) {}
  }, [chatMessages]);

  useEffect(() => {
    const unsubscribe = vscodeApi.onMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case 'WATCHDOG_STATUS':
          setWatchdogConnected(msg.payload.connected);
          setWatchdogLatencyMs(msg.payload.latencyMs);
          break;

        case 'SET_ACTIVE_FILE':
          setActiveFileUri(msg.payload.fileUri);
          setActiveLanguageId(msg.payload.languageId);
          break;

        case 'CLEAR_HIGHLIGHTS':
          break;

        case 'DIAGNOSTIC_DATA': {
          const payload = msg.payload as any;
          if (!payload) break;

          if (payload.method && payload.params) {
            if (payload.method === 'chat.userMessage') {
              setChatMessages((prev) => [
                ...prev,
                {
                  id: payload.params.id || `msg-${Date.now()}`,
                  sender: 'user',
                  text: payload.params.text,
                  timestamp: Date.now(),
                },
              ]);
            } else if (payload.method === 'chat.reset') {
              setChatMessages([]);
              setContractViolated(null);
              setCards([]);
              setStreamingTokens('');
              setIsStreaming(false);
            } else if (payload.method === 'diagnostics.contractViolated') {
              setContractViolated(payload.params as ContractViolatedDTO);
              setIsAnalyzing(false);
            } else if (payload.method === 'diagnostics.smartCardsReady') {
              const cardsData = payload.params.cards || payload.params;
              if (Array.isArray(cardsData)) {
                setCards(cardsData);
              }
              setIsAnalyzing(false);
            } else if (payload.method === 'diagnostics.tokenChunk') {
              const chunk = payload.params.chunk || payload.params.tokens || payload.params.token || '';
              setStreamingTokens((prev) => prev + chunk);
              setIsStreaming(!payload.params.isFinal);
            } else if (payload.method === 'diagnostics.analysisCompleted') {
              setIsStreaming(false);
              setIsAnalyzing(false);
            }
          } else {
            if (payload.contractViolated) {
              setContractViolated(payload.contractViolated as ContractViolatedDTO);
            }
            if (Array.isArray(payload.cards)) {
              setCards(payload.cards as SmartCardDTO[]);
            }
            setIsAnalyzing(false);
          }
          break;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleManualSubmit = (_errorText: string) => {
    setIsAnalyzing(true);
    setStreamingTokens('');
    setIsStreaming(true);
  };

  const handlePracticeCompleted = (cardId: string, accuracy: number) => {
    vscodeApi.practiceCompleted({
      cardId,
      accuracy,
    });
  };

  const handleNewChat = () => {
    if (chatMessages.length > 0) {
      try {
        const firstUserMsg = chatMessages.find((m) => m.sender === 'user');
        const title = firstUserMsg
          ? firstUserMsg.text.substring(0, 36)
          : activeFileUri
          ? activeFileUri.split(/[\\/]/).pop() || 'Sesi AI'
          : 'Sesi AI';
        const newSession: ArchivedSession = {
          id: `session-${Date.now()}`,
          title,
          fileUri: activeFileUri,
          timestamp: Date.now(),
          messageCount: chatMessages.length,
          messages: [...chatMessages],
        };
        const updated = [newSession, ...savedSessions.filter((s) => s.id !== newSession.id)].slice(0, 30);
        setSavedSessions(updated);
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}
    }
    setChatMessages([]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch (_) {}
    setContractViolated(null);
    setCards([]);
    setStreamingTokens('');
    setIsStreaming(false);
  };

  return (
    <div className="app-container">
      <header className="chat-header-bar">
        <div className="chat-header-tabs dynamic-cognition-header">
          <span className={`cognition-pulse-dot ${isStreaming ? 'streaming' : contractViolated ? 'alert' : 'ready'}`} />
          <span className="cognition-title">
            {activeNavTab === 'sessions'
              ? 'RIWAYAT SESI'
              : isStreaming
              ? 'STREAMING AKTIF...'
              : contractViolated
              ? 'DIAGNOSTIK AKTIF'
              : 'COGNITION STREAM'}
          </span>
          {activeFileUri && activeNavTab !== 'sessions' && (
            <span className="cognition-file-pill" title={activeFileUri}>
              {activeFileUri.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className={`chat-action-btn session-toggle-btn ${activeNavTab === 'sessions' ? 'active' : ''}`}
            title={activeNavTab === 'sessions' ? 'Kembali ke Chat' : 'Riwayat Sesi'}
            onClick={() => setActiveNavTab((prev) => (prev === 'sessions' ? 'chat' : 'sessions'))}
          >
            <span style={{ fontSize: '12px' }}>◷</span>
          </button>
          <button
            type="button"
            className="chat-action-btn"
            title="New Chat"
            onClick={handleNewChat}
          >
            +
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="chat-action-btn"
              title="More Actions"
              onClick={() => setShowMoreMenu((prev) => !prev)}
            >
              ...
            </button>
            {showMoreMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 1000,
                  minWidth: '180px',
                  padding: '4px 0',
                }}
              >
                <div
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}
                  onClick={() => {
                    handleNewChat();
                    setShowMoreMenu(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Clear Diagnostic State
                </div>
                <div
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}
                  onClick={() => {
                    if (activeFileUri) {
                      vscodeApi.highlightLine({ fileUri: activeFileUri, line: 1 });
                    }
                    setShowMoreMenu(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Sync Highlights to Editor
                </div>
                <div
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}
                  onClick={() => {
                    alert('NSCode Session Transcripts: ' + JSON.stringify({ chatMessages, cards, activeFileUri }, null, 2));
                    setShowMoreMenu(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-blue-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  Export Session State
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="chat-action-btn chat-close-btn"
            title="Tutup Layar B (Ctrl+Alt+B)"
            aria-label="Tutup Layar B"
            onClick={() => vscodeApi.collapseSidebar()}
          >
            ✕
          </button>
        </div>
      </header>

      {activeNavTab === 'sessions' ? (
        <main className="main-content" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Riwayat Sesi Kognitif ({savedSessions.length})
            </div>
            <button
              type="button"
              onClick={() => setActiveNavTab('chat')}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              ← Kembali ke Chat
            </button>
          </div>
          {savedSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Belum ada riwayat sesi tersimpan.<br/>
              Sesi akan otomatis diarsipkan saat Anda memulai sesi baru (+).
            </div>
          ) : (
            savedSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '12px',
                  cursor: 'pointer',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => {
                  setChatMessages(session.messages);
                  setActiveNavTab('chat');
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px', marginBottom: '4px' }}>
                    {session.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {session.messageCount} pesan • {session.fileUri ? session.fileUri.split(/[\\/]/).pop() : 'Umum'} • {new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  type="button"
                  title="Hapus sesi ini"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px 8px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const updated = savedSessions.filter((s) => s.id !== session.id);
                    setSavedSessions(updated);
                    try {
                      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
                    } catch (_) {}
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </main>
      ) : (
        <main className="main-content">
          {chatMessages.length === 0 && !contractViolated && cards.length === 0 && !isStreaming && (
            <div className="chat-welcome-container">
              <div style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.9 }}>⚡</div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>NSCode Sovereign AI</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
                Asisten AI siap membantu diskusi, analisis, dan refactoring kode secara presisi.
              </p>
              {activeFileUri && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-primary)' }}>
                  <span>📄</span>
                  <span style={{ fontWeight: 500 }}>{activeFileUri.split(/[\\/]/).pop()}</span>
                </div>
              )}
            </div>
          )}

          {chatMessages.length > 0 && (
            <section className="chat-thread-container" aria-label="Conversation Thread">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-bubble chat-bubble-${msg.sender}`}>
                  <div className="chat-bubble-sender">
                    {msg.sender === 'user' ? 'You' : 'Assistant (Antigravity)'}
                  </div>
                  <div className="chat-bubble-content">{msg.text}</div>
                </div>
              ))}
            </section>
          )}

          {isStreaming && streamingTokens && (
            <section className="chat-streaming-container" aria-label="Streaming Response">
              <div className="chat-bubble chat-bubble-assistant">
                <div className="chat-bubble-sender">Assistant (Antigravity)</div>
                <div className="chat-bubble-content">
                  {streamingTokens}
                  <span className="streaming-cursor">▊</span>
                </div>
              </div>
            </section>
          )}

          {(contractViolated || cards.length > 0) && (
            <>
              <section className="top-zone" aria-label="Zona Diagnostik Layar B">
                {contractViolated ? (
                  <ContractViolated
                    diagnostic={contractViolated}
                    streamingTokens={streamingTokens}
                    isStreaming={isStreaming}
                    activeFileUri={activeFileUri}
                  />
                ) : (
                  <div className="top-zone-idle">
                    <h3>Active-Cognition Diagnostic Sandbox</h3>
                    <p>Menunggu sinyal kesalahan dari terminal atau LSP Layar A.</p>
                  </div>
                )}

                <ManualErrorInput
                  onSubmit={handleManualSubmit}
                  isLoading={isAnalyzing}
                />
              </section>

              <section className="bottom-zone" aria-label="Zona Matriks Solusi Pedagogis">
                <SmartCardGrid
                  cards={cards}
                  activeFileUri={activeFileUri}
                  onPracticeCompleted={handlePracticeCompleted}
                />
              </section>
            </>
          )}
        </main>
      )}

      <StatusBar
        connected={watchdogConnected}
        latencyMs={watchdogLatencyMs}
        activeFileUri={activeFileUri}
        activeLanguageId={activeLanguageId}
      />
    </div>
  );
};
