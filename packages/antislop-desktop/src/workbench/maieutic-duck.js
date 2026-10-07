/**
 * maieutic-duck.js
 * Maieutic Duck: Socratic Dialectic Co-Pilot for NSCode Screen B.
 * Implements Socratic inquiry to guide developers toward discovering
 * precondition boundaries and invariant guards without spoonfeeding solutions.
 */

(function () {
  'use strict';

  /**
   * Helper to escape HTML characters in strings.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  class MaieuticDuckController {
    constructor() {
      this.state = {
        turns: 0,
        phase: 'probe', // 'probe' | 'invariant' | 'synthesis' | 'resolution'
        contextEnvelope: null,
        isVisible: false,
      };
      this.directSolutionAllowed = false;
      this.dialogue = [];
      this.container = null;

      this.startDialecticSession = this.startDialecticSession.bind(this);
      this.sendUserReflection = this.sendUserReflection.bind(this);
      this.renderPane = this.renderPane.bind(this);
    }

    /**
     * Anti-spoonfeed invariant property getter.
     * Always strictly returns false.
     */
    get directSolutionAllowed() {
      return false;
    }

    set directSolutionAllowed(_) {
      // Immutable anti-spoonfeed invariant
    }

    /**
     * Resolves the canonical Socratic question for a given dialectic phase and context envelope.
     *
     * @param {'probe' | 'invariant' | 'synthesis' | 'resolution'} phase
     * @param {object} envelope
     * @returns {string} Socratic question
     */
    getQuestionForPhase(phase, envelope) {
      const env = envelope || this.state.contextEnvelope || {};
      const symbol = env.symbol || 'anonymous';
      const line = env.lineNumber !== undefined ? env.lineNumber : (env.line !== undefined ? env.line : '?');

      switch (phase) {
        case 'probe':
          return `Pada ${symbol} (baris ${line}), apa kondisi prasyarat (precondition) yang harus dijamin sebelum eksekusi berlanjut?`;
        case 'invariant':
          return `Jika input berada pada batas ekstrem atau invalid, invarian apa yang mencegah korupsi state?`;
        case 'synthesis':
          return `Bagaimana struktur arsitektur atau guard clause Anda akan merekonsiliasi kondisi ini?`;
        case 'resolution':
          return `Anda telah mengidentifikasi akar penyebab dan batas invariant secara mandiri. Terapkan logika ini di Layar A.`;
        default:
          return `Pada ${symbol} (baris ${line}), apa kondisi prasyarat (precondition) yang harus dijamin sebelum eksekusi berlanjut?`;
      }
    }

    /**
     * Resolves the suggested reflection prompt for a given dialectic phase.
     *
     * @param {'probe' | 'invariant' | 'synthesis' | 'resolution'} phase
     * @returns {string} Suggested reflection
     */
    getSuggestedReflectionForPhase(phase) {
      switch (phase) {
        case 'probe':
          return `Periksa parameter masukan dan asumsi pemanggil sebelum eksekusi berlanjut.`;
        case 'invariant':
          return `Identifikasi invarian formal dan batas ekstrem yang tidak boleh dilanggar.`;
        case 'synthesis':
          return `Rancang guard clause awal atau assertion untuk menolak state invalid sedini mungkin.`;
        case 'resolution':
          return `Refleksikan solusi mandiri Anda ke dalam implementasi kode aktif di Layar A.`;
        default:
          return `Refleksikan kondisi prasyarat dan batas logika sistem.`;
      }
    }

    /**
     * Initializes a new dialectic session with a target context envelope.
     * Transitions state to 'probe' phase.
     *
     * @param {object} envelope Context envelope { symbol, lineNumber, diagnosticMessage }
     * @returns {object} Initial session response
     */
    startDialecticSession(envelope = {}) {
      const normalizedEnvelope = {
        symbol: envelope.symbol || 'targetSymbol',
        lineNumber: envelope.lineNumber !== undefined ? envelope.lineNumber : (envelope.line !== undefined ? envelope.line : 1),
        diagnosticMessage: envelope.diagnosticMessage || '',
        userStatement: envelope.userStatement || '',
      };

      this.state.contextEnvelope = normalizedEnvelope;
      this.state.turns = 0;
      this.state.phase = 'probe';
      this.state.isVisible = true;

      const question = this.getQuestionForPhase('probe', normalizedEnvelope);
      const suggested = this.getSuggestedReflectionForPhase('probe');

      this.dialogue = [
        {
          sender: 'duck',
          phase: 'probe',
          text: question,
          timestamp: Date.now(),
        },
      ];

      if (this.container) {
        this.renderPane(this.container);
      }

      return {
        phase: 'probe',
        socraticQuestion: question,
        antiSpoonfeedAssertion: true,
        suggestedReflection: suggested,
      };
    }

    /**
     * Advances the dialectic state machine upon receiving user reflection text.
     * State sequence: probe -> invariant -> synthesis -> resolution.
     *
     * @param {string} userText
     * @returns {object} Resulting dialectic response
     */
    sendUserReflection(userText = '') {
      if (!this.state.contextEnvelope) {
        this.startDialecticSession({ symbol: 'targetSymbol', lineNumber: 1 });
      }

      const rawText = String(userText || '').trim();
      this.state.turns += 1;

      // Phase state transitions: probe -> invariant -> synthesis -> resolution
      if (this.state.phase === 'probe') {
        this.state.phase = 'invariant';
      } else if (this.state.phase === 'invariant') {
        this.state.phase = 'synthesis';
      } else if (this.state.phase === 'synthesis') {
        this.state.phase = 'resolution';
      } else {
        this.state.phase = 'resolution';
      }

      // Enforce anti-spoonfeed warning if user explicitly demands code/solution
      const lower = rawText.toLowerCase();
      const isDemandingCode =
        lower.includes('code') ||
        lower.includes('kode') ||
        lower.includes('solusi') ||
        lower.includes('solution') ||
        lower.includes('fix it') ||
        lower.includes('write the code') ||
        lower.includes('beri saya kode');

      const antiSpoonfeedPrefix = isDemandingCode
        ? '[Anti-Spoonfeed Invariant Active] Generator solusi otomatis dinonaktifkan. Anda harus merumuskan logika secara mandiri. '
        : '';

      const baseQuestion = this.getQuestionForPhase(this.state.phase, this.state.contextEnvelope);
      const socraticQuestion = `${antiSpoonfeedPrefix}${baseQuestion}`;
      const suggestedReflection = this.getSuggestedReflectionForPhase(this.state.phase);

      if (rawText.length > 0) {
        this.dialogue.push({
          sender: 'user',
          text: rawText,
          timestamp: Date.now(),
        });
      }

      this.dialogue.push({
        sender: 'duck',
        phase: this.state.phase,
        text: socraticQuestion,
        timestamp: Date.now(),
      });

      if (this.container) {
        this.renderPane(this.container);
      }

      return {
        phase: this.state.phase,
        socraticQuestion,
        antiSpoonfeedAssertion: true,
        suggestedReflection,
      };
    }

    /**
     * Renders the interactive MaieuticDuck panel in Layar B.
     *
     * @param {HTMLElement} [containerEl]
     */
    renderPane(containerEl) {
      if (containerEl) {
        this.container = containerEl;
      } else if (!this.container && typeof document !== 'undefined') {
        this.container = document.getElementById('maieutic-duck-container');
      }

      if (!this.container) return;

      const env = this.state.contextEnvelope || { symbol: 'No Symbol', lineNumber: '?' };
      const currentPhase = this.state.phase || 'probe';

      const phaseLabels = [
        { id: 'probe', label: '1. Probe' },
        { id: 'invariant', label: '2. Invariant' },
        { id: 'synthesis', label: '3. Synthesis' },
        { id: 'resolution', label: '4. Resolution' },
      ];

      const stepsHtml = phaseLabels
        .map((p) => {
          const isActive = p.id === currentPhase;
          return `<span class="maieutic-phase-step ${isActive ? 'active' : ''}">${escapeHtml(p.label)}</span>`;
        })
        .join('<span class="maieutic-phase-sep">&gt;</span>');

      let bubblesHtml = '';
      if (this.dialogue.length === 0) {
        bubblesHtml = `
          <div class="maieutic-duck-bubble duck">
            <div class="bubble-header">
              <span class="duck-badge">DUCK (PROBE)</span>
            </div>
            <div class="bubble-content">
              Mulai sesi dialektika dengan memanggil <code>startDialecticSession({ symbol, lineNumber })</code>.
            </div>
          </div>
        `;
      } else {
        bubblesHtml = this.dialogue
          .map((msg) => {
            const isDuck = msg.sender === 'duck';
            const senderClass = isDuck ? 'duck' : 'user';
            const label = isDuck ? `DUCK (${(msg.phase || currentPhase).toUpperCase()})` : 'YOU';
            return `
              <div class="maieutic-duck-bubble ${senderClass}">
                <div class="bubble-header">
                  <span class="bubble-sender">${escapeHtml(label)}</span>
                </div>
                <div class="bubble-content">${escapeHtml(msg.text)}</div>
              </div>
            `;
          })
          .join('');
      }

      this.container.innerHTML = `
        <div class="maieutic-duck-card" data-phase="${escapeHtml(currentPhase)}">
          <div class="maieutic-duck-header">
            <div class="maieutic-title-group">
              <span class="codicon codicon-comment-discussion maieutic-duck-icon"></span>
              <span class="maieutic-title">Maieutic Duck: Socratic Co-Pilot</span>
              <span class="maieutic-target-badge">${escapeHtml(env.symbol)}:${escapeHtml(env.lineNumber)}</span>
            </div>
            <div class="maieutic-phase-badge phase-${escapeHtml(currentPhase)}">
              ${escapeHtml(currentPhase.toUpperCase())}
            </div>
          </div>

          <div class="maieutic-stepper-bar">
            ${stepsHtml}
          </div>

          <div class="maieutic-anti-spoonfeed-banner">
            <span class="codicon codicon-shield"></span>
            <span>Anti-Spoonfeed Invariant Active: Direct Solution Generation Prohibited</span>
          </div>

          <div class="maieutic-duck-body">
            <div class="maieutic-thread" id="maieutic-thread-scroll">
              ${bubblesHtml}
            </div>

            <div class="maieutic-input-container">
              <textarea
                class="maieutic-duck-input"
                id="maieutic-reflection-input"
                placeholder="Tuliskan refleksi arsitektur atau invarian Anda di sini... (Ctrl+Enter untuk kirim)"
                rows="2"
              ></textarea>
              <button type="button" class="maieutic-send-btn" id="maieutic-btn-send" title="Kirim Refleksi">
                <span class="codicon codicon-arrow-up"></span>
                <span>Refleksikan</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Auto-scroll conversation thread to bottom
      const threadEl = this.container.querySelector('#maieutic-thread-scroll');
      if (threadEl) {
        threadEl.scrollTop = threadEl.scrollHeight;
      }

      // Wire input & submit button
      const inputEl = this.container.querySelector('#maieutic-reflection-input');
      const sendBtn = this.container.querySelector('#maieutic-btn-send');

      const submitHandler = () => {
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (text) {
          this.sendUserReflection(text);
        }
      };

      if (sendBtn) {
        sendBtn.addEventListener('click', submitHandler);
      }

      if (inputEl) {
        inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitHandler();
          }
        });
      }
    }
  }

  // Attach singleton & class to window
  if (typeof window !== 'undefined') {
    window.MaieuticDuckController = MaieuticDuckController;
    if (!window.nscodeMaieuticDuck) {
      window.nscodeMaieuticDuck = new MaieuticDuckController();
    }
  }

  // CommonJS export support for unit testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MaieuticDuckController };
  }
})();
