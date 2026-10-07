import { describe, it, expect, beforeEach } from 'vitest';
import {
  PopperGateFalsifier,
  MaieuticDuckEngine,
} from '../src/index.js';
import {
  type FalsificationCase,
  type MaieuticContextEnvelope,
  PopperGateReportSchema,
  MaieuticResponseSchema,
} from '@antislop/protocol';

describe('packages/antislop-sidecar: Radical Innovations Test Suite', () => {
  describe('PopperGateFalsifier', () => {
    let falsifier: PopperGateFalsifier;

    beforeEach(() => {
      falsifier = new PopperGateFalsifier();
    });

    it('generates boundary cases for numeric parameter types', () => {
      const cases = falsifier.generateBoundaryCases('calculateTax', ['number']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);

      const testValues = cases.map((c) => c.testValue);
      expect(testValues).toContain(0);
      expect(testValues).toContain(-1);
      expect(testValues.some((v) => Number.isNaN(v))).toBe(true);
      expect(testValues).toContain(Number.MAX_SAFE_INTEGER);

      // Verify no static dummy values: targetSymbol is interpolated
      for (const c of cases) {
        expect(c.inputDescription).toContain('calculateTax');
        expect(c.id).toContain('calculateTax');
      }
    });

    it('generates boundary cases for string parameter types', () => {
      const cases = falsifier.generateBoundaryCases('formatName', ['string']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);

      const testValues = cases.map((c) => c.testValue);
      expect(testValues).toContain('');
      expect(testValues).toContain('   ');
      expect(testValues).toContain('\n');
      expect(testValues).toContain('a'.repeat(256));
    });

    it('generates boundary cases for array / list parameter types', () => {
      const cases = falsifier.generateBoundaryCases('sortTokens', ['string[]']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);

      const testValues = cases.map((c) => c.testValue);
      expect(testValues.some((v) => Array.isArray(v) && v.length === 0)).toBe(true);
      expect(testValues.some((v) => Array.isArray(v) && v.length === 1 && v[0] === null)).toBe(true);
      expect(testValues.some((v) => Array.isArray(v) && v.length === 100)).toBe(true);
    });

    it('generates boundary cases for object parameter types', () => {
      const cases = falsifier.generateBoundaryCases('processConfig', ['Record<string, unknown>']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);

      const testValues = cases.map((c) => c.testValue);
      expect(testValues.some((v) => v !== null && typeof v === 'object' && Object.keys(v).length === 0)).toBe(true);
      expect(testValues).toContain(null);
      expect(testValues).toContain(undefined);
    });

    it('generates boundary cases for boolean parameter types', () => {
      const cases = falsifier.generateBoundaryCases('toggleOption', ['boolean']);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);

      const testValues = cases.map((c) => c.testValue);
      expect(testValues).toContain(false);
      expect(testValues).toContain(true);
    });

    it('caps boundary cases at exactly 16 even with many parameters', () => {
      const cases = falsifier.generateBoundaryCases('complexMegaFunction', [
        'number',
        'string',
        'string[]',
        'boolean',
        'object',
        'async () => void',
      ]);
      expect(cases.length).toBe(16);
    });

    it('handles empty parameter types gracefully without static dummy values', () => {
      const cases = falsifier.generateBoundaryCases('noArgSymbol', []);
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.length).toBeLessThanOrEqual(16);
      for (const c of cases) {
        expect(c.inputDescription).toContain('noArgSymbol');
      }
    });

    it('evaluates user predictions accurately with delta scores', () => {
      const mockCase: FalsificationCase = {
        id: 'case-test-1',
        domain: 'numeric_boundary',
        inputDescription: 'Negative index test',
        testValue: -1,
        expectedOutcome: 'throw_handled',
        rationale: 'Negative index violates bounds',
      };

      // Correct prediction
      const correctEval = falsifier.evaluatePrediction(mockCase, 'throw_handled');
      expect(correctEval.isCorrect).toBe(true);
      expect(correctEval.deltaScore).toBe(15);
      expect(correctEval.explanation).toContain('verified');

      // Normalized casing / hyphens
      const normalizedEval = falsifier.evaluatePrediction(mockCase, 'THROW HANDLED');
      expect(normalizedEval.isCorrect).toBe(true);

      // Incorrect prediction
      const incorrectEval = falsifier.evaluatePrediction(mockCase, 'fallback_return');
      expect(incorrectEval.isCorrect).toBe(false);
      expect(incorrectEval.deltaScore).toBe(-10);
      expect(incorrectEval.explanation).toContain('mismatch');
    });

    it('generates a valid PopperGateReport', () => {
      const cases = falsifier.generateBoundaryCases('computeSum', ['number[]']);
      const report = falsifier.generateReport('computeSum', ['values: number[]'], cases, 85, true);

      expect(PopperGateReportSchema.safeParse(report).success).toBe(true);
      expect(report.cognitiveScore).toBe(85);
      expect(report.passesPopperFalsification).toBe(true);
      expect(report.targetSymbol).toBe('computeSum');
    });
  });

  describe('MaieuticDuckEngine', () => {
    let duck: MaieuticDuckEngine;

    beforeEach(() => {
      duck = new MaieuticDuckEngine();
    });

    it('advances through dialectic phases: probe -> invariant -> synthesis -> resolution', () => {
      const baseEnvelope: MaieuticContextEnvelope = {
        symbol: 'parseInput',
        lineNumber: 88,
        diagnosticCode: 'TS2345',
        diagnosticMessage: 'Argument of type null is not assignable',
        userStatement: 'I am getting an error when parsing.',
      };

      // Turn 1 -> probe
      const res1 = duck.processDialecticTurn(baseEnvelope);
      expect(res1.phase).toBe('probe');
      expect(res1.antiSpoonfeedAssertion).toBe(true);
      expect(res1.dialecticQuestion).toContain('parseInput');
      expect(res1.dialecticQuestion).toContain('preconditions');
      expect(MaieuticResponseSchema.safeParse(res1).success).toBe(true);

      // Turn 2 -> invariant
      const res2 = duck.processDialecticTurn({
        ...baseEnvelope,
        userStatement: 'The input can sometimes be null or empty string.',
      });
      expect(res2.phase).toBe('invariant');
      expect(res2.antiSpoonfeedAssertion).toBe(true);
      expect(res2.dialecticQuestion).toContain('invariant');
      expect(MaieuticResponseSchema.safeParse(res2).success).toBe(true);

      // Turn 3 -> synthesis
      const res3 = duck.processDialecticTurn({
        ...baseEnvelope,
        userStatement: 'If null, it should return a default fallback rather than throw.',
      });
      expect(res3.phase).toBe('synthesis');
      expect(res3.antiSpoonfeedAssertion).toBe(true);
      expect(res3.dialecticQuestion).toContain('Synthesizing');
      expect(MaieuticResponseSchema.safeParse(res3).success).toBe(true);

      // Turn 4 -> resolution
      const res4 = duck.processDialecticTurn({
        ...baseEnvelope,
        userStatement: 'I will add an early return guard check.',
      });
      expect(res4.phase).toBe('resolution');
      expect(res4.antiSpoonfeedAssertion).toBe(true);
      expect(res4.dialecticQuestion).toContain('Popperian falsification');
      expect(MaieuticResponseSchema.safeParse(res4).success).toBe(true);
    });

    it('enforces anti-spoonfeed invariant when user requests code directly', () => {
      const res = duck.processDialecticTurn({
        symbol: 'evalExpr',
        lineNumber: 12,
        userStatement: 'Just give me the code to fix this, please.',
      });

      expect(res.antiSpoonfeedAssertion).toBe(true);
      expect(res.dialecticQuestion).toContain('[Anti-Spoonfeed Invariant Active]');
      expect(res.dialecticQuestion).toContain('will not write the solution code');
    });

    it('resets sessions cleanly', () => {
      duck.processDialecticTurn({
        symbol: 'fnA',
        lineNumber: 10,
        userStatement: 'Hello',
      });
      expect(duck.getSession('fnA').turn).toBe(1);

      duck.resetSession('fnA');
      expect(duck.getSession('fnA').turn).toBe(0);
    });
  });
});
