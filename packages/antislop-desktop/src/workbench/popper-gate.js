/**
 * popper-gate.js
 * PopperGate: Counterfactual Stress-Tester and Falsification Harness.
 * Active-cognition boundary generator and prediction evaluation engine for NSCode Screen B.
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

  /**
   * Formats a boundary test value into a readable string representation.
   */
  function formatTestValue(val) {
    if (val === undefined) return 'undefined';
    if (val === null) return 'null';
    if (typeof val === 'number') {
      if (Number.isNaN(val)) return 'NaN';
      if (val === Number.MAX_SAFE_INTEGER) return 'Number.MAX_SAFE_INTEGER (9007199254740991)';
      return String(val);
    }
    if (typeof val === 'string') {
      if (val === '') return '"" (Empty string)';
      if (val.trim() === '' && val.length > 0) {
        return `"${val.replace(/\n/g, '\\n')}" (Whitespace / Delimiter)`;
      }
      if (val.length > 32) {
        return `"${val.slice(0, 16)}..." (${val.length} chars)`;
      }
      return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '[] (Empty array)';
      if (val.length === 1 && val[0] === null) return '[null] (Array with null element)';
      return `Array(${val.length})`;
    }
    if (typeof val === 'function') {
      return val.toString().slice(0, 30) + '...';
    }
    if (typeof val === 'object') {
      if (Object.keys(val).length === 0) return '{} (Empty object)';
      try {
        return JSON.stringify(val);
      } catch {
        return '[Object]';
      }
    }
    return String(val);
  }

  /**
   * Normalizes outcome representation for resilient prediction matching.
   */
  function normalizeOutcome(val) {
    if (!val) return '';
    const s = String(val).toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (s.includes('throw') || s.includes('exception')) return 'throw';
    if (s.includes('fallback') || s.includes('graceful')) return 'fallback';
    if (s.includes('hang') || s.includes('corruption') || s.includes('silent')) return 'corruption';
    return s;
  }

  class PopperGateController {
    constructor() {
      this.state = {
        currentSymbol: '',
        cases: [],
        activeCaseIndex: 0,
        score: 0,
        passesFalsification: false,
        isVisible: false,
      };
      this.container = null;
      this.lastEvaluation = null;

      this.submitPrediction = this.submitPrediction.bind(this);
      this.nextCase = this.nextCase.bind(this);
      this.prevCase = this.prevCase.bind(this);
      this.renderCard = this.renderCard.bind(this);
    }

    /**
     * Generates boundary falsification cases dynamically from symbol name and parameter types.
     * Capped at 16 cases without static dummy values.
     *
     * @param {string} symbolName
     * @param {string[]} paramTypes
     * @returns {Array<object>} Generated boundary cases
     */
    generateCases(symbolName = 'targetSymbol', paramTypes = ['number', 'string']) {
      const targetSymbol = String(symbolName || 'targetSymbol').trim();
      const effectiveTypes = Array.isArray(paramTypes) && paramTypes.length > 0 ? paramTypes : ['unknown'];
      const cases = [];

      effectiveTypes.forEach((rawType, paramIndex) => {
        const typeStr = String(rawType).trim().toLowerCase();
        const paramName = `param${paramIndex}`;
        const uid = () => Math.random().toString(36).substring(2, 8);

        // 1. Array / Collection
        if (
          typeStr.includes('[]') ||
          typeStr.includes('array') ||
          typeStr.includes('list') ||
          typeStr.includes('set') ||
          typeStr.includes('collection')
        ) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-empty_arr-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Empty array [] passed to ${paramName} in ${targetSymbol}`,
              testValue: [],
              expectedOutcome: 'fallback_return',
              rationale: `Empty collection must trigger safe default return rather than throwing index out of bounds or empty reduce errors.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-null_element-${uid()}`,
              domain: 'null_undefined',
              inputDescription: `Array containing null element [null] passed to ${paramName} in ${targetSymbol}`,
              testValue: [null],
              expectedOutcome: 'throw_handled',
              rationale: `Poisoned null inside array collection must be caught and handled during iteration without unhandled runtime panic.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-sparse_array-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Sparse array allocated with 100 empty slots passed to ${paramName} in ${targetSymbol}`,
              testValue: new Array(100),
              expectedOutcome: 'fallback_return',
              rationale: `Holey array with empty slots verifies that iteration logic handles sparse array holes gracefully.`,
            }
          );
        }
        // 2. Object / Record / Dict
        else if (
          typeStr.includes('object') ||
          typeStr.includes('record') ||
          typeStr.includes('dict') ||
          typeStr.includes('map') ||
          typeStr.includes('{')
        ) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-empty_obj-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Empty object {} passed to ${paramName} in ${targetSymbol}`,
              testValue: {},
              expectedOutcome: 'fallback_return',
              rationale: `Empty object tests missing key resolution and ensures fallback defaults are returned.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-null_ref-${uid()}`,
              domain: 'null_undefined',
              inputDescription: `Null object reference passed to ${paramName} in ${targetSymbol}`,
              testValue: null,
              expectedOutcome: 'throw_handled',
              rationale: `Null object reference must be validated at the boundary before dereferencing properties.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-undefined_ref-${uid()}`,
              domain: 'null_undefined',
              inputDescription: `Undefined reference passed to ${paramName} in ${targetSymbol}`,
              testValue: undefined,
              expectedOutcome: 'throw_handled',
              rationale: `Undefined parameter must be trapped or filled by default argument fallback.`,
            }
          );
        }
        // 3. String / Text
        else if (
          typeStr.includes('string') ||
          typeStr.includes('str') ||
          typeStr.includes('text') ||
          typeStr.includes('char')
        ) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-empty_str-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Empty string "" passed to ${paramName} in ${targetSymbol}`,
              testValue: '',
              expectedOutcome: 'fallback_return',
              rationale: `Empty string checks truthiness guards and ensures zero-length handling returns expected baseline.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-whitespace-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Whitespace-only string "   " passed to ${paramName} in ${targetSymbol}`,
              testValue: '   ',
              expectedOutcome: 'fallback_return',
              rationale: `Whitespace-only input tests whether trimming is enforced prior to payload processing.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-newline-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Newline string "\\n" passed to ${paramName} in ${targetSymbol}`,
              testValue: '\n',
              expectedOutcome: 'fallback_return',
              rationale: `Newline input tests delimiter parsing and multiline boundary stability.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-buffer_overflow-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Long buffer string (256 repetitions) passed to ${paramName} in ${targetSymbol}`,
              testValue: 'a'.repeat(256),
              expectedOutcome: 'fallback_return',
              rationale: `Long string boundary verifies capacity resilience and prevents regex catastrophic backtracking.`,
            }
          );
        }
        // 4. Number / Float / Int
        else if (
          typeStr.includes('number') ||
          typeStr.includes('int') ||
          typeStr.includes('float') ||
          typeStr.includes('double') ||
          typeStr.includes('byte')
        ) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-zero-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Zero (0) boundary passed to ${paramName} in ${targetSymbol}`,
              testValue: 0,
              expectedOutcome: 'fallback_return',
              rationale: `Zero value tests falsy boundary guards and verifies immunity to division-by-zero faults.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-negative-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Negative integer (-1) passed to ${paramName} in ${targetSymbol}`,
              testValue: -1,
              expectedOutcome: 'throw_handled',
              rationale: `Negative boundary tests non-negative domain invariants and must be rejected with handled error.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-nan-${uid()}`,
              domain: 'type_mismatch',
              inputDescription: `NaN (Not-a-Number) passed to ${paramName} in ${targetSymbol}`,
              testValue: NaN,
              expectedOutcome: 'throw_handled',
              rationale: `NaN arithmetic poisoning must be intercepted before triggering silent corruption.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-max_safe_int-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}) passed to ${paramName} in ${targetSymbol}`,
              testValue: Number.MAX_SAFE_INTEGER,
              expectedOutcome: 'fallback_return',
              rationale: `Upper magnitude boundary tests against numeric overflow and precision truncation.`,
            }
          );
        }
        // 5. Boolean
        else if (typeStr.includes('boolean') || typeStr.includes('bool')) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-false-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Boolean false passed to ${paramName} in ${targetSymbol}`,
              testValue: false,
              expectedOutcome: 'fallback_return',
              rationale: `Boolean false verifies falsy flag branch logic without falling through into unintended defaults.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-true-${uid()}`,
              domain: 'numeric_boundary',
              inputDescription: `Boolean true passed to ${paramName} in ${targetSymbol}`,
              testValue: true,
              expectedOutcome: 'fallback_return',
              rationale: `Boolean true verifies affirmative execution branch against invariant specifications.`,
            }
          );
        }
        // 6. Function / Async / Callback
        else if (
          typeStr.includes('function') ||
          typeStr.includes('callback') ||
          typeStr.includes('promise') ||
          typeStr.includes('async')
        ) {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-async_race-${uid()}`,
              domain: 'async_race',
              inputDescription: `Concurrent async invocation callback passed to ${paramName} in ${targetSymbol}`,
              testValue: () => Promise.resolve(),
              expectedOutcome: 'throw_handled',
              rationale: `Async race tests reentrancy and unsettled promise collisions.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-reentrancy-${uid()}`,
              domain: 'reentrancy',
              inputDescription: `Recursive reentrant callback passed to ${paramName} in ${targetSymbol}`,
              testValue: () => {},
              expectedOutcome: 'throw_handled',
              rationale: `Reentrant execution before lock release must be intercepted to avoid recursive deadlocks.`,
            }
          );
        }
        // Fallback / Unknown
        else {
          cases.push(
            {
              id: `falsify-${targetSymbol}-${paramName}-empty_obj-${uid()}`,
              domain: 'empty_container',
              inputDescription: `Empty object {} passed to ${paramName} in ${targetSymbol}`,
              testValue: {},
              expectedOutcome: 'fallback_return',
              rationale: `Empty object tests missing key resolution and ensures fallback defaults are returned.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-null_ref-${uid()}`,
              domain: 'null_undefined',
              inputDescription: `Null object reference passed to ${paramName} in ${targetSymbol}`,
              testValue: null,
              expectedOutcome: 'throw_handled',
              rationale: `Null object reference must be validated at the boundary before dereferencing properties.`,
            },
            {
              id: `falsify-${targetSymbol}-${paramName}-undefined_ref-${uid()}`,
              domain: 'null_undefined',
              inputDescription: `Undefined reference passed to ${paramName} in ${targetSymbol}`,
              testValue: undefined,
              expectedOutcome: 'throw_handled',
              rationale: `Undefined parameter must be trapped or filled by default argument fallback.`,
            }
          );
        }
      });

      // Cap boundary cases at 16 dynamically
      const slicedCases = cases.slice(0, 16);

      this.state.currentSymbol = targetSymbol;
      this.state.cases = slicedCases;
      this.state.activeCaseIndex = 0;
      this.state.isVisible = true;

      if (this.container) {
        this.renderCard(this.container);
      }

      return slicedCases;
    }

    /**
     * Submits a user prediction for the active test case.
     * Updates score (+15 for correct, -10 for incorrect, clamped 0-100),
     * updates DOM, and sets passesFalsification = score >= 60.
     *
     * @param {string} predictedOutcome
     * @returns {object} Evaluation result
     */
    submitPrediction(predictedOutcome) {
      if (!this.state.cases || this.state.cases.length === 0) {
        return {
          isCorrect: false,
          deltaScore: 0,
          score: this.state.score,
          passesFalsification: this.state.passesFalsification,
          explanation: 'No falsification cases available.',
        };
      }

      const activeCase = this.state.cases[this.state.activeCaseIndex];
      if (!activeCase) {
        return {
          isCorrect: false,
          deltaScore: 0,
          score: this.state.score,
          passesFalsification: this.state.passesFalsification,
          explanation: 'Active case index out of range.',
        };
      }

      const normPred = normalizeOutcome(predictedOutcome);
      const normExp = normalizeOutcome(activeCase.expectedOutcome);
      const rawExactMatch =
        String(predictedOutcome).toLowerCase().trim().replace(/[\s-]+/g, '_') ===
        String(activeCase.expectedOutcome).toLowerCase().trim().replace(/[\s-]+/g, '_');

      const isCorrect = normPred === normExp || rawExactMatch;
      const deltaScore = isCorrect ? 15 : -10;

      this.state.score = Math.max(0, Math.min(100, this.state.score + deltaScore));
      this.state.passesFalsification = this.state.score >= 60;

      const explanation = isCorrect
        ? `Falsification hypothesis verified: Input (${activeCase.inputDescription}) correctly predicted to yield [${activeCase.expectedOutcome}]. ${activeCase.rationale}`
        : `Falsification mismatch: Input (${activeCase.inputDescription}) is expected to yield [${activeCase.expectedOutcome}] because: ${activeCase.rationale}. (Your prediction: [${predictedOutcome}])`;

      this.lastEvaluation = {
        isCorrect,
        deltaScore,
        score: this.state.score,
        passesFalsification: this.state.passesFalsification,
        explanation,
        predictedOutcome,
        activeCaseId: activeCase.id,
      };

      activeCase.userPrediction = predictedOutcome;
      activeCase.isCorrect = isCorrect;

      if (this.container) {
        this.renderCard(this.container);
      }

      return {
        isCorrect,
        deltaScore,
        score: this.state.score,
        passesFalsification: this.state.passesFalsification,
        explanation,
        activeCaseIndex: this.state.activeCaseIndex,
      };
    }

    /**
     * Navigates to the next test case.
     */
    nextCase() {
      if (this.state.cases && this.state.activeCaseIndex < this.state.cases.length - 1) {
        this.state.activeCaseIndex += 1;
        this.lastEvaluation = null;
        if (this.container) {
          this.renderCard(this.container);
        }
      }
    }

    /**
     * Navigates to the previous test case.
     */
    prevCase() {
      if (this.state.activeCaseIndex > 0) {
        this.state.activeCaseIndex -= 1;
        this.lastEvaluation = null;
        if (this.container) {
          this.renderCard(this.container);
        }
      }
    }

    /**
     * Sets active case by zero-based index.
     *
     * @param {number} index
     */
    setCaseIndex(index) {
      if (this.state.cases && index >= 0 && index < this.state.cases.length) {
        this.state.activeCaseIndex = index;
        this.lastEvaluation = null;
        if (this.container) {
          this.renderCard(this.container);
        }
      }
    }

    /**
     * Renders the PopperGate counterfactual stress-test card in Layar B.
     *
     * @param {HTMLElement} [containerEl]
     */
    renderCard(containerEl) {
      if (containerEl) {
        this.container = containerEl;
      } else if (!this.container && typeof document !== 'undefined') {
        this.container = document.getElementById('popper-gate-container');
      }

      if (!this.container) return;

      const cases = this.state.cases || [];
      const totalCases = cases.length;
      const activeIdx = this.state.activeCaseIndex;
      const activeCase = cases[activeIdx];

      if (totalCases === 0 || !activeCase) {
        this.container.innerHTML = `
          <div class="popper-gate-card empty-state" data-falsification-pass="${this.state.passesFalsification}">
            <div class="popper-gate-header">
              <div class="popper-gate-title-group">
                <span class="codicon codicon-beaker popper-gate-icon"></span>
                <span class="popper-gate-title">PopperGate: Falsification Stress-Tester</span>
                <span class="popper-gate-symbol-badge">${escapeHtml(this.state.currentSymbol || 'No Symbol')}</span>
              </div>
              <div class="popper-gate-score-badge ${this.state.passesFalsification ? 'pass' : 'testing'}">
                Score: ${this.state.score}/100
              </div>
            </div>
            <div class="popper-gate-body">
              <p class="popper-gate-empty-msg">No boundary stress-test cases loaded. Invoke generateCases(symbolName, paramTypes) to begin.</p>
            </div>
          </div>
        `;
        return;
      }

      const caseNum = activeIdx + 1;
      const evalInfo = this.lastEvaluation && this.lastEvaluation.activeCaseId === activeCase.id
        ? this.lastEvaluation
        : null;

      let feedbackHtml = '';
      if (evalInfo) {
        const iconClass = evalInfo.isCorrect ? 'codicon-pass-filled text-success' : 'codicon-error text-danger';
        const bannerClass = evalInfo.isCorrect ? 'feedback-correct' : 'feedback-incorrect';
        feedbackHtml = `
          <div class="popper-gate-feedback-banner ${bannerClass}">
            <div class="popper-gate-feedback-header">
              <span class="codicon ${iconClass}"></span>
              <span class="feedback-title">${evalInfo.isCorrect ? 'PREDICTION CORRECT (+15)' : 'PREDICTION MISMATCH (-10)'}</span>
            </div>
            <p class="popper-gate-feedback-text">${escapeHtml(evalInfo.explanation)}</p>
          </div>
        `;
      }

      const passStatusClass = this.state.passesFalsification ? 'status-pass' : 'status-pending';
      const passStatusText = this.state.passesFalsification ? 'PASSED (&ge;60)' : 'UNVERIFIED (&lt;60)';

      this.container.innerHTML = `
        <div class="popper-gate-card" data-falsification-pass="${this.state.passesFalsification}">
          <div class="popper-gate-header">
            <div class="popper-gate-title-group">
              <span class="codicon codicon-beaker popper-gate-icon"></span>
              <span class="popper-gate-title">PopperGate: Falsification Stress-Tester</span>
              <span class="popper-gate-symbol-badge" title="Target Symbol">${escapeHtml(this.state.currentSymbol)}</span>
            </div>
            <div class="popper-gate-score-badge ${this.state.passesFalsification ? 'pass' : 'testing'}" id="popper-gate-score-display">
              Score: ${this.state.score}/100
            </div>
          </div>

          <div class="popper-gate-body">
            <div class="popper-gate-case-meta">
              <span class="popper-gate-case-counter">Case ${caseNum} of ${totalCases}</span>
              <span class="popper-gate-domain-tag">${escapeHtml(activeCase.domain || 'boundary')}</span>
            </div>

            <div class="popper-gate-input-display">
              <div class="popper-gate-input-desc">${escapeHtml(activeCase.inputDescription)}</div>
              <div class="popper-gate-test-value-row">
                <span class="popper-gate-label">Current Boundary Input:</span>
                <code class="popper-gate-test-value">${escapeHtml(formatTestValue(activeCase.testValue))}</code>
              </div>
            </div>

            <div class="popper-gate-prediction-section">
              <div class="popper-gate-prediction-label">Predict Expected Outcome:</div>
              <div class="popper-gate-prediction-buttons">
                <button type="button" class="popper-gate-prediction-btn" data-outcome="Throw Exception" title="Function should throw an explicit handled error">
                  <span class="codicon codicon-warning"></span>
                  <span>Throw Exception</span>
                </button>
                <button type="button" class="popper-gate-prediction-btn" data-outcome="Graceful Fallback" title="Function should gracefully return safe fallback default">
                  <span class="codicon codicon-pass"></span>
                  <span>Graceful Fallback</span>
                </button>
                <button type="button" class="popper-gate-prediction-btn" data-outcome="Silent Hang / Corruption" title="Unbounded execution, freeze, or corrupted state">
                  <span class="codicon codicon-error"></span>
                  <span>Silent Hang / Corruption</span>
                </button>
              </div>
            </div>

            ${feedbackHtml}

            <div class="popper-gate-nav-bar">
              <button type="button" class="popper-gate-nav-btn btn-prev" ${activeIdx === 0 ? 'disabled' : ''}>
                <span class="codicon codicon-chevron-left"></span> Prev
              </button>
              <div class="popper-gate-gate-pill ${passStatusClass}">
                Gate: ${passStatusText}
              </div>
              <button type="button" class="popper-gate-nav-btn btn-next" ${activeIdx >= totalCases - 1 ? 'disabled' : ''}>
                Next <span class="codicon codicon-chevron-right"></span>
              </button>
            </div>
          </div>
        </div>
      `;

      // Wire prediction buttons
      const predBtns = this.container.querySelectorAll('.popper-gate-prediction-btn');
      predBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const outcome = btn.getAttribute('data-outcome');
          this.submitPrediction(outcome);
        });
      });

      // Wire navigation buttons
      const prevBtn = this.container.querySelector('.popper-gate-nav-btn.btn-prev');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.prevCase());
      }
      const nextBtn = this.container.querySelector('.popper-gate-nav-btn.btn-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.nextCase());
      }
    }
  }

  // Attach singleton & class to window
  if (typeof window !== 'undefined') {
    window.PopperGateController = PopperGateController;
    if (!window.nscodePopperGate) {
      window.nscodePopperGate = new PopperGateController();
    }
  }

  // CommonJS export support for unit testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PopperGateController };
  }
})();
