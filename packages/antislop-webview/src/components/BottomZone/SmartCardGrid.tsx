import React, { useState, useEffect } from 'react';
import type { SmartCardDTO, TargetLanguage } from '@antislop/protocol';
import { transitionGateSession, type CognitiveFrictionSessionDTO, type GateTransitionEvent } from '@antislop/protocol';
import { SmartCard } from './SmartCard.js';

export interface SmartCardGridProps {
  cards: SmartCardDTO[];
  activeFileUri?: string | null;
  targetLanguage?: TargetLanguage;
  onPracticeCompleted?: (cardId: string, accuracy: number) => void;
}

export const SmartCardGrid: React.FC<SmartCardGridProps> = ({
  cards,
  onPracticeCompleted,
}) => {
  const [sessions, setSessions] = useState<Record<string, CognitiveFrictionSessionDTO>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'idiomatic' | 'minimalist' | 'performance'>('all');

  // Initialize or synchronize sessions when cards change
  useEffect(() => {
    setSessions((prev) => {
      const next = { ...prev };
      for (const card of cards) {
        if (!next[card.id]) {
          next[card.id] = {
            sessionId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random()}`,
            cardId: card.id,
            status: 'LOCKED',
            clozeSolved: false,
            typeAlongSolved: false,
            clipboardUnlocked: false,
            directAutoPatchAllowed: false,
            clozeAttempts: 0,
          };
        }
      }
      return next;
    });
  }, [cards]);

  const handleGateTransition = (cardId: string, event: GateTransitionEvent) => {
    setSessions((prev) => {
      const current = prev[cardId];
      if (!current) return prev;
      const updated = transitionGateSession(current, event);
      return { ...prev, [cardId]: updated };
    });
  };

  const handleCompleted = (cardId: string, accuracy: number) => {
    if (onPracticeCompleted) {
      onPracticeCompleted(cardId, accuracy);
    }
  };

  if (!cards || cards.length === 0) {
    return (
      <div className="bottom-zone-empty" role="status">
        <h3>Belum Ada Solusi Pedagogis</h3>
        <p>Jalankan kode atau tempelkan jejak kesalahan di Layar A untuk menghasilkan 3 kartu solusi terstruktur.</p>
      </div>
    );
  }

  const filteredCards = activeTab === 'all'
    ? cards
    : cards.filter((c) => c.variant === activeTab);

  return (
    <section className="bottom-zone-container" aria-label="Matriks Solusi Pedagogis">
      <div className="bottom-zone-header">
        <div className="header-title-group">
          <h2>Matriks Solusi Pedagogis (3 Pendekatan)</h2>
          <span className="badge-subtitle">Pilih varian untuk melatih pemahaman sintaks</span>
        </div>

        <div className="variant-tabs" role="tablist" aria-label="Filter Varian">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Semua ({cards.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'idiomatic'}
            className={`tab-btn tab-idiomatic ${activeTab === 'idiomatic' ? 'active' : ''}`}
            onClick={() => setActiveTab('idiomatic')}
          >
            Idiomatik
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'minimalist'}
            className={`tab-btn tab-minimalist ${activeTab === 'minimalist' ? 'active' : ''}`}
            onClick={() => setActiveTab('minimalist')}
          >
            Minimalis
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'performance'}
            className={`tab-btn tab-performance ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            Performa
          </button>
        </div>
      </div>

      <div className="smart-card-grid">
        {filteredCards.map((card) => {
          const session = sessions[card.id] || {
            sessionId: card.id,
            cardId: card.id,
            status: 'LOCKED',
            clozeSolved: false,
            typeAlongSolved: false,
            clipboardUnlocked: false,
            directAutoPatchAllowed: false,
            clozeAttempts: 0,
          };

          return (
            <SmartCard
              key={card.id}
              card={card}
              session={session}
              onTransition={(event) => handleGateTransition(card.id, event)}
              onPracticeCompleted={(acc) => handleCompleted(card.id, acc)}
            />
          );
        })}
      </div>
    </section>
  );
};
