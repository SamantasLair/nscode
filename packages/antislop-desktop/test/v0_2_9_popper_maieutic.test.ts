import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';

// Require the workbench JS controllers
const { PopperGateController } = require('../src/workbench/popper-gate.js');
const { MaieuticDuckController } = require('../src/workbench/maieutic-duck.js');

describe('Milestone v0.2.9: PopperGate & MaieuticDuck Suite', () => {
  const workbenchHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');

  describe('1. HTML Markup & Script Loading Structure', () => {
    it('verifies index.html loads popper-gate.js and maieutic-duck.js before other workbench scripts', () => {
      const html = fs.readFileSync(workbenchHtmlPath, 'utf-8');
      expect(html).toContain('<script src="popper-gate.js"></script>');
      expect(html).toContain('<script src="maieutic-duck.js"></script>');

      const popperIdx = html.indexOf('<script src="popper-gate.js"></script>');
      const maieuticIdx = html.indexOf('<script src="maieutic-duck.js"></script>');
      const bridgewireIdx = html.indexOf('<script src="bridgewire.js"></script>');
      const workbenchIdx = html.indexOf('<script src="workbench.js"></script>');

      expect(popperIdx).toBeGreaterThan(-1);
      expect(maieuticIdx).toBeGreaterThan(-1);
      expect(popperIdx).toBeLessThan(bridgewireIdx);
      expect(maieuticIdx).toBeLessThan(bridgewireIdx);
      expect(bridgewireIdx).toBeLessThan(workbenchIdx);
    });

    it('verifies index.html contains container mounts for popper-gate and maieutic-duck', () => {
      const html = fs.readFileSync(workbenchHtmlPath, 'utf-8');
      expect(html).toContain('id="popper-gate-container"');
      expect(html).toContain('id="maieutic-duck-container"');
    });
  });

  describe('2. Workbench CSS Rules & Design System Tokens', () => {
    it('verifies required PopperGate and MaieuticDuck CSS classes using var(--vscode-*)', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');

      // Required classes
      expect(css).toContain('.popper-gate-card');
      expect(css).toContain('.popper-gate-prediction-btn');
      expect(css).toContain('.popper-gate-score-badge');
      expect(css).toContain('.maieutic-duck-card');
      expect(css).toContain('.maieutic-duck-bubble');
      expect(css).toContain('.maieutic-duck-input');

      // Verify token usage
      expect(css).toMatch(/\.popper-gate-card\s*\{[^}]*background-color:\s*var\(--vscode-/);
      expect(css).toMatch(/\.popper-gate-prediction-btn\s*\{[^}]*background-color:\s*var\(--vscode-/);
      expect(css).toMatch(/\.maieutic-duck-card\s*\{[^}]*background-color:\s*var\(--vscode-/);
      expect(css).toMatch(/\.maieutic-duck-input\s*\{[^}]*background-color:\s*var\(--vscode-/);
    });
  });

  describe('3. PopperGateController State Machine & Stress-Testing', () => {
    let controller: any;

    beforeEach(() => {
      controller = new PopperGateController();
    });

    it('initializes with required state invariants', () => {
      expect(controller.state).toEqual({
        currentSymbol: '',
        cases: [],
        activeCaseIndex: 0,
        score: 0,
        passesFalsification: false,
        isVisible: false,
      });
    });

    it('generates boundary test cases for number parameter types', () => {
      const cases = controller.generateCases('calculateTax', ['number']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);
      expect(controller.state.currentSymbol).toBe('calculateTax');
      expect(controller.state.cases.length).toBe(cases.length);

      const testValues = cases.map((c: any) => c.testValue);
      expect(testValues).toContain(0);
      expect(testValues).toContain(-1);
      expect(testValues.some((v: any) => Number.isNaN(v))).toBe(true);
      expect(testValues).toContain(Number.MAX_SAFE_INTEGER);

      // Verify no static dummy values: targetSymbol is interpolated
      for (const c of cases) {
        expect(c.inputDescription).toContain('calculateTax');
        expect(c.id).toContain('calculateTax');
      }
    });

    it('generates boundary test cases for string parameter types', () => {
      const cases = controller.generateCases('formatUsername', ['string']);
      const testValues = cases.map((c: any) => c.testValue);
      expect(testValues).toContain('');
      expect(testValues).toContain('   ');
      expect(testValues).toContain('\n');
      expect(testValues).toContain('a'.repeat(256));
    });

    it('generates boundary test cases for array parameter types', () => {
      const cases = controller.generateCases('sortItems', ['string[]']);
      const testValues = cases.map((c: any) => c.testValue);
      expect(testValues.some((v: any) => Array.isArray(v) && v.length === 0)).toBe(true);
      expect(testValues.some((v: any) => Array.isArray(v) && v.length === 1 && v[0] === null)).toBe(true);
    });

    it('generates boundary test cases for object parameter types', () => {
      const cases = controller.generateCases('parseConfig', ['object']);
      const testValues = cases.map((c: any) => c.testValue);
      expect(testValues.some((v: any) => v !== null && typeof v === 'object' && Object.keys(v).length === 0)).toBe(true);
      expect(testValues).toContain(null);
    });

    it('caps boundary cases at exactly 16 even with many parameters', () => {
      const cases = controller.generateCases('megaSymbol', [
        'number',
        'string',
        'array',
        'object',
        'boolean',
        'function',
      ]);
      expect(cases.length).toBe(16);
    });

    it('evaluates prediction correctly with score increment and clamping', () => {
      controller.generateCases('checkInput', ['number']);
      // Case 0 for number is 0 (expectedOutcome: 'fallback_return')
      const case0 = controller.state.cases[0];
      expect(case0.expectedOutcome).toBe('fallback_return');

      // Correct prediction with button label "Graceful Fallback"
      const res1 = controller.submitPrediction('Graceful Fallback');
      expect(res1.isCorrect).toBe(true);
      expect(res1.deltaScore).toBe(15);
      expect(res1.score).toBe(15);
      expect(controller.state.score).toBe(15);
      expect(controller.state.passesFalsification).toBe(false); // < 60

      // Incorrect prediction
      const res2 = controller.submitPrediction('Throw Exception');
      expect(res2.isCorrect).toBe(false);
      expect(res2.deltaScore).toBe(-10);
      expect(res2.score).toBe(5);
      expect(controller.state.score).toBe(5);

      // Test lower clamp at 0
      controller.submitPrediction('Silent Hang / Corruption');
      expect(controller.state.score).toBe(0);

      // Score accumulation up to passing threshold (>= 60)
      for (let i = 0; i < 5; i++) {
        controller.submitPrediction('Graceful Fallback');
      }
      expect(controller.state.score).toBe(75);
      expect(controller.state.passesFalsification).toBe(true);

      // Test upper clamp at 100
      for (let i = 0; i < 5; i++) {
        controller.submitPrediction('Graceful Fallback');
      }
      expect(controller.state.score).toBe(100);
    });

    it('renders PopperGate stress-test card with required elements into container', () => {
      const mockContainer = {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: () => null,
      };

      controller.generateCases('quicksort', ['number[]']);
      controller.renderCard(mockContainer as any);

      expect(mockContainer.innerHTML).toContain('PopperGate: Falsification Stress-Tester');
      expect(mockContainer.innerHTML).toContain('quicksort');
      expect(mockContainer.innerHTML).toContain('Current Boundary Input:');
      expect(mockContainer.innerHTML).toContain('Throw Exception');
      expect(mockContainer.innerHTML).toContain('Graceful Fallback');
      expect(mockContainer.innerHTML).toContain('Silent Hang / Corruption');
      expect(mockContainer.innerHTML).toContain('Score: 0/100');
    });
  });

  describe('4. MaieuticDuckController Dialectic State Machine', () => {
    let duck: any;

    beforeEach(() => {
      duck = new MaieuticDuckController();
    });

    it('initializes with required state and strict anti-spoonfeed invariant', () => {
      expect(duck.state).toEqual({
        turns: 0,
        phase: 'probe',
        contextEnvelope: null,
        isVisible: false,
      });
      expect(duck.directSolutionAllowed).toBe(false);

      // Attempting to overwrite directSolutionAllowed must not change it
      duck.directSolutionAllowed = true;
      expect(duck.directSolutionAllowed).toBe(false);
    });

    it('starts dialectic session in probe phase with canonical Socratic question', () => {
      const envelope = {
        symbol: 'quicksort',
        lineNumber: 42,
        diagnosticMessage: 'Possible index out of bounds',
      };

      const res = duck.startDialecticSession(envelope);
      expect(duck.state.phase).toBe('probe');
      expect(duck.state.isVisible).toBe(true);
      expect(res.phase).toBe('probe');
      expect(res.antiSpoonfeedAssertion).toBe(true);
      expect(res.socraticQuestion).toBe(
        'Pada quicksort (baris 42), apa kondisi prasyarat (precondition) yang harus dijamin sebelum eksekusi berlanjut?'
      );
    });

    it('advances dialectic phases: probe -> invariant -> synthesis -> resolution', () => {
      duck.startDialecticSession({ symbol: 'partition', lineNumber: 18 });

      // Turn 1: probe -> invariant
      const t1 = duck.sendUserReflection('Input array could be empty or have only 1 element.');
      expect(duck.state.phase).toBe('invariant');
      expect(t1.phase).toBe('invariant');
      expect(t1.antiSpoonfeedAssertion).toBe(true);
      expect(t1.socraticQuestion).toBe(
        'Jika input berada pada batas ekstrem atau invalid, invarian apa yang mencegah korupsi state?'
      );

      // Turn 2: invariant -> synthesis
      const t2 = duck.sendUserReflection('The array bounds must satisfy low < high before dividing.');
      expect(duck.state.phase).toBe('synthesis');
      expect(t2.phase).toBe('synthesis');
      expect(t2.antiSpoonfeedAssertion).toBe(true);
      expect(t2.socraticQuestion).toBe(
        'Bagaimana struktur arsitektur atau guard clause Anda akan merekonsiliasi kondisi ini?'
      );

      // Turn 3: synthesis -> resolution
      const t3 = duck.sendUserReflection('I will add an early return guard if low >= high.');
      expect(duck.state.phase).toBe('resolution');
      expect(t3.phase).toBe('resolution');
      expect(t3.antiSpoonfeedAssertion).toBe(true);
      expect(t3.socraticQuestion).toBe(
        'Anda telah mengidentifikasi akar penyebab dan batas invariant secara mandiri. Terapkan logika ini di Layar A.'
      );

      // Turn 4: remains in resolution
      const t4 = duck.sendUserReflection('Logic verified.');
      expect(duck.state.phase).toBe('resolution');
      expect(t4.phase).toBe('resolution');
    });

    it('enforces anti-spoonfeed prefix if user demands direct code solution', () => {
      duck.startDialecticSession({ symbol: 'filterNodes', lineNumber: 99 });
      const res = duck.sendUserReflection('Please give me the code to fix this.');
      expect(res.antiSpoonfeedAssertion).toBe(true);
      expect(res.socraticQuestion).toContain('[Anti-Spoonfeed Invariant Active]');
    });

    it('renders MaieuticDuck interactive panel into container', () => {
      const mockContainer = {
        innerHTML: '',
        querySelector: () => null,
      };

      duck.startDialecticSession({ symbol: 'quicksort', lineNumber: 25 });
      duck.renderPane(mockContainer as any);

      expect(mockContainer.innerHTML).toContain('Maieutic Duck: Socratic Co-Pilot');
      expect(mockContainer.innerHTML).toContain('quicksort:25');
      expect(mockContainer.innerHTML).toContain('Anti-Spoonfeed Invariant Active');
      expect(mockContainer.innerHTML).toContain('maieutic-duck-input');
      expect(mockContainer.innerHTML).toContain('Refleksikan');
    });
  });

  describe('5. Global Window Attachment & Singleton Invariants', () => {
    it('verifies window singletons attach when window is available', () => {
      const mockWindow: any = {};
      const runInEnv = new Function('window', 'module', fs.readFileSync(path.resolve(__dirname, '../src/workbench/popper-gate.js'), 'utf-8'));
      runInEnv(mockWindow, {});

      expect(mockWindow.PopperGateController).toBeDefined();
      expect(mockWindow.nscodePopperGate).toBeDefined();
      expect(mockWindow.nscodePopperGate.state.score).toBe(0);

      const runDuckInEnv = new Function('window', 'module', fs.readFileSync(path.resolve(__dirname, '../src/workbench/maieutic-duck.js'), 'utf-8'));
      runDuckInEnv(mockWindow, {});

      expect(mockWindow.MaieuticDuckController).toBeDefined();
      expect(mockWindow.nscodeMaieuticDuck).toBeDefined();
      expect(mockWindow.nscodeMaieuticDuck.directSolutionAllowed).toBe(false);
    });
  });
});
