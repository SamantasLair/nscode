import React, { useState } from 'react';
import type { SmartCardDTO, GateTransitionEvent, CognitiveFrictionSessionDTO } from '@antislop/protocol';
import { BigOBadges } from './BigOBadges.js';
import { MemoryProfileView } from './MemoryProfileView.js';
import { LanguageIdiomView } from './LanguageIdiomView.js';
import { TradeOffsView } from './TradeOffsView.js';
import { LockedCopyButton } from '../CognitiveGate/LockedCopyButton.js';
import { ClozeChallenge } from '../CognitiveGate/ClozeChallenge.js';
import { TypeAlongPractice } from '../CognitiveGate/TypeAlongPractice.js';

export interface SmartCardProps {
  card: SmartCardDTO;
  session: CognitiveFrictionSessionDTO;
  onTransition: (event: GateTransitionEvent) => void;
  onPracticeCompleted: (accuracy: number) => void;
}

export const SmartCard: React.FC<SmartCardProps> = ({
  card,
  session,
  onTransition,
  onPracticeCompleted,
}) => {
  const [activeMode, setActiveMode] = useState<'view' | 'cloze' | 'type_along'>('view');

  const variantLabels = {
    idiomatic: { title: 'Idiomatik (Best Practice)', badgeClass: 'badge-idiomatic' },
    minimalist: { title: 'Minimalis (Direct Guard)', badgeClass: 'badge-minimalist' },
    performance: { title: 'Performa (Zero-Alloc)', badgeClass: 'badge-performance' },
  };

  const handleClozeSuccess = () => {
    onTransition({ type: 'CLOZE_COMPLETED' });
    onPracticeCompleted(100);
    setActiveMode('view');
  };

  const handleTypeAlongSuccess = (accuracy: number) => {
    onTransition({ type: 'TYPE_ALONG_COMPLETED', accuracyPercent: accuracy });
    if (accuracy >= 90.0) {
      onPracticeCompleted(accuracy);
      setActiveMode('view');
    }
  };

  const timeComplexity = card.complexity?.timeComplexity ?? card.bigO?.time ?? 'O(1)';
  const spaceComplexity = card.complexity?.spaceComplexity ?? card.bigO?.space ?? 'O(1)';
  const complexityProof = card.complexity?.complexityProof ?? 'Derivasi asimptotik sesuai algoritma.';

  return (
    <article className={`smart-card card-${card.variant}`} aria-labelledby={`card-title-${card.id}`}>
      {/* Header */}
      <div className="card-header">
        <span className={`variant-pill ${variantLabels[card.variant].badgeClass}`}>
          {variantLabels[card.variant].title}
        </span>
        <h3 id={`card-title-${card.id}`} className="card-title">{card.title}</h3>
      </div>

      {/* Quantitative Big-O Badges */}
      <BigOBadges
        timeComplexity={timeComplexity}
        spaceComplexity={spaceComplexity}
        complexityProof={complexityProof}
      />

      {/* Interactive Mode Selector / Status */}
      <div className="mode-selector-bar">
        <button
          type="button"
          className={`mode-btn ${activeMode === 'view' ? 'active' : ''}`}
          onClick={() => setActiveMode('view')}
        >
          Lihat Kode
        </button>
        {card.clozeChallenge && (
          <button
            type="button"
            className={`mode-btn ${activeMode === 'cloze' ? 'active' : ''} ${session.clozeSolved ? 'solved' : ''}`}
            onClick={() => {
              setActiveMode('cloze');
              if (session.status !== 'UNLOCKED') {
                onTransition({ type: 'START_CLOZE' });
              }
            }}
          >
            Syntax Verification (Cloze) {session.clozeSolved && '✓'}
          </button>
        )}
        <button
          type="button"
          className={`mode-btn ${activeMode === 'type_along' ? 'active' : ''} ${session.typeAlongSolved ? 'solved' : ''}`}
          onClick={() => {
            setActiveMode('type_along');
            if (session.status !== 'UNLOCKED') {
              onTransition({ type: 'START_TYPE_ALONG' });
            }
          }}
        >
          Guided Typing {session.typeAlongSolved && '✓'}
        </button>
      </div>

      {/* Code or Cognitive Gate Sandbox Area */}
      <div className="card-sandbox-area">
        {activeMode === 'view' && (
          <div className="code-viewer-container">
            <pre className="code-block">
              <code>{card.codeSnippet}</code>
            </pre>
          </div>
        )}

        {activeMode === 'cloze' && card.clozeChallenge && (
          <ClozeChallenge
            challenge={card.clozeChallenge}
            cardId={card.id}
            onSuccess={handleClozeSuccess}
          />
        )}

        {activeMode === 'type_along' && (
          <TypeAlongPractice
            cardId={card.id}
            snippet={card.codeSnippet}
            languageId={card.languageBreakdown?.targetLanguage}
            onCompleted={handleTypeAlongSuccess}
          />
        )}
      </div>

      {/* Why It Works Section */}
      <div className="card-section why-it-works">
        <h4>Mengapa Pendekatan Ini Berhasil</h4>
        <p>{card.whyItWorks}</p>
      </div>

      {/* Quantitative Memory Profile */}
      {card.memoryImpact && <MemoryProfileView memoryImpact={card.memoryImpact} />}

      {/* Language Idiom & Syntax Breakdown */}
      {card.languageBreakdown && <LanguageIdiomView languageBreakdown={card.languageBreakdown} />}

      {/* Trade-Offs Matrix */}
      {card.tradeOffs && <TradeOffsView tradeOffs={card.tradeOffs} />}

      {/* Action Footer: Locked Copy Button ONLY */}
      <div className="card-footer">
        <LockedCopyButton
          codeSnippet={card.codeSnippet}
          isUnlocked={session.clipboardUnlocked}
          cardVariant={card.variant}
        />
        {/* INVIOLABLE GOLDEN INVARIANT: ZERO AUTO-PATCH BUTTON HERE */}
      </div>
    </article>
  );
};
