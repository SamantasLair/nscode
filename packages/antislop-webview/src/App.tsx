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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

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
          // Highlight reset trigger
          break;

        case 'DIAGNOSTIC_DATA': {
          const payload = msg.payload as any;
          if (!payload) break;

          // Sidecar & Antigravity notification routing
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
            // Direct payload format
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
    setChatMessages([]);
    setContractViolated(null);
    setCards([]);
    setStreamingTokens('');
    setIsStreaming(false);
  };

  return (
    <div className="app-container">
      {/* Layar B Header: Cursor Copilot Chat Aesthetic (R5) */}
      <header className="chat-header-bar">
        <div className="chat-header-tabs">
          <button
            type="button"
            className={`chat-header-tab ${activeNavTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveNavTab('chat')}
          >
            CHAT
          </button>
          <button
            type="button"
            className={`chat-header-tab ${activeNavTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveNavTab('sessions')}
          >
            SESSIONS
          </button>
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className="chat-action-btn"
            title="New Chat"
            onClick={handleNewChat}
          >
            +
          </button>
          <button
            type="button"
            className="chat-action-btn"
            title="More Actions"
          >
            ...
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* Chat Conversation Thread */}
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

        {/* Live Streaming Chunk Bubble */}
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

        {/* Top Zone: Contract Violated & Manual Error Input */}
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

        {/* Bottom Zone: 3-Card Solution Matrix */}
        <section className="bottom-zone" aria-label="Zona Matriks Solusi Pedagogis">
          <SmartCardGrid
            cards={cards}
            activeFileUri={activeFileUri}
            onPracticeCompleted={handlePracticeCompleted}
          />
        </section>
      </main>

      {/* Persistent System Status Bar */}
      <StatusBar
        connected={watchdogConnected}
        latencyMs={watchdogLatencyMs}
        activeFileUri={activeFileUri}
        activeLanguageId={activeLanguageId}
      />
    </div>
  );
};
