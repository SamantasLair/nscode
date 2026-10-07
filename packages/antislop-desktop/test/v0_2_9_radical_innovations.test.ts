import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import {
  computeBridgeWireSpline,
  BridgeWireCoordinatesSchema,
  BridgeWireSplinePathSchema,
  PopperGateReportSchema,
  FalsificationCaseSchema,
  FalsificationDomainSchema,
  FalsificationExpectedOutcomeSchema,
  MaieuticPhaseSchema,
  MaieuticContextEnvelopeSchema,
  MaieuticResponseSchema,
  type FalsificationCase,
  type MaieuticContextEnvelope,
} from '../../antislop-protocol/src/index.js';
import {
  PopperGateFalsifier,
  MaieuticDuckEngine,
} from '../../antislop-sidecar/src/index.js';

describe('Milestone v0.2.9: Radical Innovations Verification Suite', () => {
  const workbenchHtmlPath = path.resolve(__dirname, '../src/workbench/index.html');
  const workbenchCssPath = path.resolve(__dirname, '../src/workbench/workbench.css');
  const bridgewireJsPath = path.resolve(__dirname, '../src/workbench/bridgewire.js');
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');

  // =========================================================================
  // A. BridgeWire: Live Kinetic Spline Connector Suite
  // =========================================================================
  describe('A. BridgeWire (Live Kinetic Spline Connector)', () => {
    let BridgeWireController: any;
    let mockSvg: any;
    let mockSpline: any;
    let originalWindow: any;
    let originalDoc: any;

    beforeEach(() => {
      originalWindow = (global as any).window;
      originalDoc = (global as any).document;

      mockSpline = {
        setAttribute: vi.fn(),
        getAttribute: vi.fn().mockReturnValue('url(#bw-dot-end)'),
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn().mockReturnValue(false),
        },
      };

      mockSvg = {
        style: {},
      };

      (global as any).document = {
        getElementById: vi.fn((id: string) => {
          if (id === 'bridgewire-overlay-canvas') return mockSvg;
          if (id === 'bridgewire-active-spline') return mockSpline;
          return null;
        }),
        querySelector: vi.fn(),
      };

      (global as any).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      delete require.cache[require.resolve('../src/workbench/bridgewire.js')];
      const mod = require('../src/workbench/bridgewire.js');
      BridgeWireController = mod.BridgeWireController;
    });

    afterEach(() => {
      (global as any).window = originalWindow;
      (global as any).document = originalDoc;
    });

    it('validates cubic Bezier path formula produces valid SVG paths (M ... C ...)', () => {
      const controller = new BridgeWireController();

      // Test 1: Standard forward curve (100, 200) -> (500, 300)
      const path1 = controller.computeSpline(100, 200, 500, 300);
      expect(path1).toMatch(/^M \d+\.\d+,\d+\.\d+ C \d+\.\d+,\d+\.\d+ \d+\.\d+,\d+\.\d+ \d+\.\d+,\d+\.\d+$/);
      expect(path1).toBe('M 100.0,200.0 C 340.0,200.0 260.0,300.0 500.0,300.0');

      // Test 2: Protocol pure math function produces matching cubic Bezier structure
      const splineCalc = computeBridgeWireSpline(100, 200, 500, 300);
      expect(splineCalc.path).toMatch(/^M 100,200 C \d+(\.\d+)?,200 \d+(\.\d+)?,300 500,300$/);
      expect(splineCalc.cx1).toBe(340);
      expect(splineCalc.cy1).toBe(200);
      expect(splineCalc.cx2).toBe(260);
      expect(splineCalc.cy2).toBe(300);
      expect(splineCalc.length).toBeGreaterThan(Math.hypot(400, 100)); // Arc length > straight line distance

      // Test 3: Path schema validation from protocol
      const pathSchemaValidation = BridgeWireSplinePathSchema.safeParse({
        path: splineCalc.path,
        length: splineCalc.length,
        tension: 0.6,
      });
      expect(pathSchemaValidation.success).toBe(true);

      // Test 4: Coordinate schema validation
      const coordValidation = BridgeWireCoordinatesSchema.safeParse({
        x1: 100,
        y1: 200,
        x2: 500,
        y2: 300,
        active: true,
      });
      expect(coordValidation.success).toBe(true);
    });

    it('validates dynamic tension calculation derived from horizontal delta dx', () => {
      const controller = new BridgeWireController();

      // Case 1: Minimal horizontal delta dx = 40 => abs(dx)/400 = 0.1 => clamped to min 0.2
      const pathSmallDx = controller.computeSpline(100, 100, 140, 150);
      // dx = 40, tension = 0.2 => cx1 = 100 + 40*0.2 = 108.0, cx2 = 140 - 40*0.2 = 132.0
      expect(pathSmallDx).toBe('M 100.0,100.0 C 108.0,100.0 132.0,150.0 140.0,150.0');

      // Case 2: Intermediate horizontal delta dx = 200 => abs(dx)/400 = 0.5 => tension 0.5
      const pathMidDx = controller.computeSpline(100, 100, 300, 100);
      // dx = 200, tension = 0.5 => cx1 = 100 + 200*0.5 = 200.0, cx2 = 300 - 200*0.5 = 200.0
      expect(pathMidDx).toBe('M 100.0,100.0 C 200.0,100.0 200.0,100.0 300.0,100.0');

      // Case 3: Large horizontal delta dx = 600 => abs(dx)/400 = 1.5 => clamped to max 0.6
      const pathLargeDx = controller.computeSpline(100, 100, 700, 100);
      // dx = 600, tension = 0.6 => cx1 = 100 + 600*0.6 = 460.0, cx2 = 700 - 600*0.6 = 340.0
      expect(pathLargeDx).toBe('M 100.0,100.0 C 460.0,100.0 340.0,100.0 700.0,100.0');

      // Case 4: Zero horizontal delta dx = 0 => clamped to min 0.2
      const splineZeroDx = computeBridgeWireSpline(100, 50, 100, 350);
      expect(splineZeroDx.cx1).toBe(100);
      expect(splineZeroDx.cx2).toBe(100);
      expect(splineZeroDx.path).toBe('M 100,50 C 100,50 100,350 100,350');

      // Case 5: Custom tension override via protocol function
      const splineCustomTension = computeBridgeWireSpline(0, 0, 100, 0, 0.35);
      expect(splineCustomTension.cx1).toBe(35);
      expect(splineCustomTension.cx2).toBe(65);
    });

    it('validates Monaco editor scrolled position resolver integration (no hardcoded pixel offsets)', () => {
      const controller = new BridgeWireController();

      // Dynamic viewport A: Monaco editor at left: 80, top: 50, line scrolled at left: 160, top: 220, line height: 24
      const mockEditorA = {
        getDomNode: vi.fn().mockReturnValue({
          getBoundingClientRect: () => ({ left: 80, top: 50, width: 700, height: 500 }),
        }),
        getScrolledVisiblePosition: vi.fn().mockReturnValue({
          left: 160,
          top: 220,
          height: 24,
        }),
        onDidScrollChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };

      const mockCardTargetA = {
        getBoundingClientRect: () => ({ left: 900, top: 150, width: 350, height: 120 }),
      };

      controller.connect({ editor: mockEditorA, lineNumber: 55, column: 1 }, mockCardTargetA);
      expect(controller.state.active).toBe(true);

      const pathA = controller.render();
      // start x = 80 + 160 = 240.0, start y = 50 + 220 + 24/2 = 282.0
      // end x = 900.0, end y = 150 + 120/2 = 210.0
      expect(pathA).toContain('M 240.0,282.0 C');
      expect(pathA).toContain('900.0,210.0');

      // Dynamic viewport B: Monaco editor at different offset (left: 40, top: 10), line scrolled to (left: 90, top: 400), height 18
      const mockEditorB = {
        getDomNode: vi.fn().mockReturnValue({
          getBoundingClientRect: () => ({ left: 40, top: 10, width: 800, height: 600 }),
        }),
        getScrolledVisiblePosition: vi.fn().mockReturnValue({
          left: 90,
          top: 400,
          height: 18,
        }),
        onDidScrollChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      };

      const mockCardTargetB = {
        getBoundingClientRect: () => ({ left: 1100, top: 300, width: 250, height: 80 }),
      };

      controller.connect({ editor: mockEditorB, lineNumber: 102 }, mockCardTargetB);
      const pathB = controller.render();
      // start x = 40 + 90 = 130.0, start y = 10 + 400 + 18/2 = 419.0
      // end x = 1100.0, end y = 300 + 80/2 = 340.0
      expect(pathB).toContain('M 130.0,419.0 C');
      expect(pathB).toContain('1100.0,340.0');

      // Validates Monaco onDidScrollChange listener marks controller state dirty
      let scrollCallback: Function = () => {};
      const mockDisposable = { dispose: vi.fn() };
      const scrollableEditor = {
        onDidScrollChange: vi.fn((cb) => {
          scrollCallback = cb;
          return mockDisposable;
        }),
      };

      controller.startListening(scrollableEditor);
      expect(scrollableEditor.onDidScrollChange).toHaveBeenCalled();
      controller.state.isDirty = false;

      // Scroll event fires
      scrollCallback();
      expect(controller.state.isDirty).toBe(true);

      // Cleanup
      controller.stopListening();
      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('validates CSS tokens (uses var(--vscode-focusBorder) and var(--vscode-editorError-foreground))', () => {
      const css = fs.readFileSync(workbenchCssPath, 'utf-8');

      // Focus border token for default kinetic spline
      expect(css).toMatch(/\.bridgewire-spline\s*\{[^}]*stroke:\s*var\(--vscode-focusBorder,\s*#007acc\);/);

      // Error foreground token for contract-violated error spline
      expect(css).toMatch(/\.bridgewire-spline\.error\s*\{[^}]*stroke:\s*var\(--vscode-editorError-foreground,\s*#f14c4c\);/);

      // Focus border token for connector end marker dot
      expect(css).toMatch(/\.bridgewire-marker\s*\{[^}]*fill:\s*var\(--vscode-focusBorder,\s*#007acc\);/);

      // Keyframes dash animation and SVG blur glow
      expect(css).toContain('@keyframes bw-dash');
      expect(css).toContain('url(#bw-glow)');

      // Verify controller dynamically applies .error class when error option is true
      const controller = new BridgeWireController();
      controller.connect({ x: 0, y: 0 }, { x: 100, y: 100 }, { isError: true });
      expect(mockSpline.classList.add).toHaveBeenCalledWith('error');

      controller.connect({ x: 0, y: 0 }, { x: 100, y: 100 }, { isError: false });
      expect(mockSpline.classList.remove).toHaveBeenCalledWith('error');
    });
  });

  // =========================================================================
  // B. PopperGate: Counterfactual Stress-Tester & Automated Falsifier Suite
  // =========================================================================
  describe('B. PopperGate (Counterfactual Stress-Tester & Automated Falsifier)', () => {
    let falsifier: PopperGateFalsifier;

    beforeEach(() => {
      falsifier = new PopperGateFalsifier();
    });

    it('validates AST-driven boundary case synthesis across number, string, array, object parameter types', () => {
      // 1. Number parameter boundary synthesis
      const numCases = falsifier.generateBoundaryCases('calculateTax', ['number']);
      expect(numCases.length).toBeGreaterThan(0);
      const numTestValues = numCases.map((c) => c.testValue);
      expect(numTestValues).toContain(0);
      expect(numTestValues).toContain(-1);
      expect(numTestValues.some((v) => Number.isNaN(v))).toBe(true);
      expect(numTestValues).toContain(Number.MAX_SAFE_INTEGER);

      const numDomains = numCases.map((c) => c.domain);
      expect(numDomains).toContain('numeric_boundary');
      expect(numDomains).toContain('type_mismatch');

      // 2. String parameter boundary synthesis
      const strCases = falsifier.generateBoundaryCases('sanitizeUsername', ['string']);
      expect(strCases.length).toBeGreaterThan(0);
      const strTestValues = strCases.map((c) => c.testValue);
      expect(strTestValues).toContain(''); // empty string
      expect(strTestValues).toContain('   '); // whitespace only
      expect(strTestValues).toContain('\n'); // newline boundary
      expect(strTestValues).toContain('a'.repeat(256)); // buffer expansion boundary

      const strDomains = strCases.map((c) => c.domain);
      expect(strDomains).toContain('empty_container');

      // 3. Array parameter boundary synthesis
      const arrCases = falsifier.generateBoundaryCases('batchProcessItems', ['string[]']);
      expect(arrCases.length).toBeGreaterThan(0);
      const arrTestValues = arrCases.map((c) => c.testValue);
      expect(arrTestValues.some((v) => Array.isArray(v) && v.length === 0)).toBe(true); // empty array
      expect(arrTestValues.some((v) => Array.isArray(v) && v.length === 1 && v[0] === null)).toBe(true); // null element
      expect(arrTestValues.some((v) => Array.isArray(v) && v.length === 100)).toBe(true); // sparse holey array

      // 4. Object / Record parameter boundary synthesis
      const objCases = falsifier.generateBoundaryCases('applyConfig', ['Record<string, unknown>']);
      expect(objCases.length).toBeGreaterThan(0);
      const objTestValues = objCases.map((c) => c.testValue);
      expect(objTestValues.some((v) => v !== null && typeof v === 'object' && Object.keys(v).length === 0)).toBe(true); // empty object {}
      expect(objTestValues).toContain(null); // null reference
      expect(objTestValues).toContain(undefined); // undefined reference

      // 5. Multi-parameter compound synthesis capped at 16 cases
      const compoundCases = falsifier.generateBoundaryCases('complexHandler', [
        'number',
        'string',
        'number[]',
        'Record<string, any>',
        'boolean',
        'async () => void',
      ]);
      expect(compoundCases.length).toBe(16);

      // Verify all cases strictly validate against FalsificationCaseSchema
      for (const c of compoundCases) {
        expect(FalsificationCaseSchema.safeParse(c).success).toBe(true);
      }
    });

    it('validates 0 static dummy values (all synthesized dynamically)', () => {
      const symbolA = 'verifySignature';
      const casesA = falsifier.generateBoundaryCases(symbolA, ['string']);

      const symbolB = 'evaluateCondition';
      const casesB = falsifier.generateBoundaryCases(symbolB, ['number']);

      // 1. Symbol name is dynamically interpolated into all case descriptions and IDs
      for (const c of casesA) {
        expect(c.inputDescription).toContain(symbolA);
        expect(c.id).toContain(symbolA);
        expect(c.id).not.toContain(symbolB);
        // ID contains dynamic random UUID segment
        expect(c.id).toMatch(new RegExp(`^falsify-${symbolA}-param0-.*-[a-f0-9]{8}$`));
      }

      for (const c of casesB) {
        expect(c.inputDescription).toContain(symbolB);
        expect(c.id).toContain(symbolB);
        expect(c.id).not.toContain(symbolA);
        expect(c.id).toMatch(new RegExp(`^falsify-${symbolB}-param0-.*-[a-f0-9]{8}$`));
      }

      // 2. Zero static placeholder identifiers or static descriptions across different executions
      const caseIdsA = new Set(casesA.map((c) => c.id));
      const caseIdsB = new Set(casesB.map((c) => c.id));
      const intersection = [...caseIdsA].filter((id) => caseIdsB.has(id));
      expect(intersection.length).toBe(0);
    });

    it('validates user prediction evaluation and Popperian cognitive score tracking (0-100 scale, passesFalsification threshold)', () => {
      const mockFalsificationCase: FalsificationCase = {
        id: 'falsify-divide-param1-zero-12345678',
        domain: 'numeric_boundary',
        inputDescription: 'Zero (0) divisor passed to param1 in divide',
        testValue: 0,
        expectedOutcome: 'fallback_return',
        rationale: 'Division by zero must return fallback safe value instead of throwing unhandled exception',
      };

      // 1. Correct user prediction adds +15 cognitive score delta
      const evalCorrect = falsifier.evaluatePrediction(mockFalsificationCase, 'fallback_return');
      expect(evalCorrect.isCorrect).toBe(true);
      expect(evalCorrect.deltaScore).toBe(15);
      expect(evalCorrect.explanation).toContain('Falsification hypothesis verified');

      // 2. Prediction normalization handles whitespace, casing, and hyphens
      const evalNormalized = falsifier.evaluatePrediction(mockFalsificationCase, '  FALLBACK-RETURN  ');
      expect(evalNormalized.isCorrect).toBe(true);
      expect(evalNormalized.deltaScore).toBe(15);

      // 3. Incorrect user prediction penalizes with -10 cognitive score delta
      const evalIncorrect = falsifier.evaluatePrediction(mockFalsificationCase, 'throw_handled');
      expect(evalIncorrect.isCorrect).toBe(false);
      expect(evalIncorrect.deltaScore).toBe(-10);
      expect(evalIncorrect.explanation).toContain('Falsification mismatch');

      // 4. Popperian cognitive score tracking on 0-100 scale
      let cognitiveScore = 100;
      const FALSIFICATION_THRESHOLD = 70;

      // Incorrect prediction reduces score
      cognitiveScore = Math.max(0, Math.min(100, cognitiveScore + evalIncorrect.deltaScore));
      expect(cognitiveScore).toBe(90);
      expect(cognitiveScore >= FALSIFICATION_THRESHOLD).toBe(true);

      // Three consecutive incorrect predictions drops score below threshold
      cognitiveScore = Math.max(0, Math.min(100, cognitiveScore + evalIncorrect.deltaScore * 3));
      expect(cognitiveScore).toBe(60);
      const passesPopperFalsification = cognitiveScore >= FALSIFICATION_THRESHOLD;
      expect(passesPopperFalsification).toBe(false);

      // Clamping to bounds [0, 100]
      const clampedZeroReport = falsifier.generateReport('testSym', [], [], -50, false);
      expect(clampedZeroReport.cognitiveScore).toBe(0);

      const clampedMaxReport = falsifier.generateReport('testSym', [], [], 150, true);
      expect(clampedMaxReport.cognitiveScore).toBe(100);
    });

    it('validates PopperGateReportSchema validation', () => {
      const validCases = falsifier.generateBoundaryCases('computeSum', ['number[]']);
      const validReport = falsifier.generateReport(
        'computeSum',
        ['items: number[]'],
        validCases,
        85,
        true
      );

      // 1. Compliant report parses successfully
      const parseResult = PopperGateReportSchema.safeParse(validReport);
      expect(parseResult.success).toBe(true);
      expect(validReport.cognitiveScore).toBe(85);
      expect(validReport.passesPopperFalsification).toBe(true);
      expect(validReport.boundaryCases.length).toBeGreaterThan(0);

      // 2. Report with score > 100 is rejected by schema
      const outOfBoundsHigh = {
        ...validReport,
        cognitiveScore: 105,
      };
      expect(PopperGateReportSchema.safeParse(outOfBoundsHigh).success).toBe(false);

      // 3. Report with score < 0 is rejected by schema
      const outOfBoundsLow = {
        ...validReport,
        cognitiveScore: -5,
      };
      expect(PopperGateReportSchema.safeParse(outOfBoundsLow).success).toBe(false);

      // 4. Report with invalid domain in boundary case is rejected
      const invalidCaseReport = {
        ...validReport,
        boundaryCases: [
          {
            id: 'bad-case',
            domain: 'unsupported_domain_name',
            inputDescription: 'bad',
            testValue: null,
            expectedOutcome: 'fallback_return',
            rationale: 'none',
          },
        ],
      };
      expect(PopperGateReportSchema.safeParse(invalidCaseReport).success).toBe(false);
    });
  });

  // =========================================================================
  // C. MaieuticDuck: Socratic Dialectic Debugger Suite
  // =========================================================================
  describe('C. MaieuticDuck (Socratic Dialectic Debugger)', () => {
    let duckEngine: MaieuticDuckEngine;

    beforeEach(() => {
      duckEngine = new MaieuticDuckEngine();
    });

    it('validates dialectic state machine transitions (probe -> invariant -> synthesis -> resolution)', () => {
      // 1. Verify resolvePhaseForTurn mapping
      expect(duckEngine.resolvePhaseForTurn(0)).toBe('probe');
      expect(duckEngine.resolvePhaseForTurn(1)).toBe('probe');
      expect(duckEngine.resolvePhaseForTurn(2)).toBe('invariant');
      expect(duckEngine.resolvePhaseForTurn(3)).toBe('synthesis');
      expect(duckEngine.resolvePhaseForTurn(4)).toBe('resolution');
      expect(duckEngine.resolvePhaseForTurn(10)).toBe('resolution');

      const targetSymbol = 'quickSortPartition';
      const envelope: MaieuticContextEnvelope = {
        symbol: targetSymbol,
        lineNumber: 48,
        diagnosticCode: 'TS2345',
        diagnosticMessage: 'Argument of type undefined is not assignable',
        userStatement: 'I am getting an unhandled undefined error here.',
      };

      // Turn 1: probe
      const turn1 = duckEngine.processDialecticTurn(envelope);
      expect(turn1.phase).toBe('probe');
      expect(turn1.dialecticQuestion).toContain('preconditions');
      expect(duckEngine.getSession(targetSymbol).turn).toBe(1);

      // Turn 2: invariant
      const turn2 = duckEngine.processDialecticTurn({
        ...envelope,
        userStatement: 'The partition index can exceed the array bounds if low >= high.',
      });
      expect(turn2.phase).toBe('invariant');
      expect(turn2.dialecticQuestion).toContain('invariant');
      expect(duckEngine.getSession(targetSymbol).turn).toBe(2);

      // Turn 3: synthesis
      const turn3 = duckEngine.processDialecticTurn({
        ...envelope,
        userStatement: 'I must ensure low < high as an invariant before swapping.',
      });
      expect(turn3.phase).toBe('synthesis');
      expect(turn3.dialecticQuestion).toContain('Synthesizing');
      expect(duckEngine.getSession(targetSymbol).turn).toBe(3);

      // Turn 4: resolution
      const turn4 = duckEngine.processDialecticTurn({
        ...envelope,
        userStatement: 'I will guard against inverted indices with an early return.',
      });
      expect(turn4.phase).toBe('resolution');
      expect(turn4.dialecticQuestion).toContain('Popperian falsification');
      expect(duckEngine.getSession(targetSymbol).turn).toBe(4);

      // All responses strictly adhere to MaieuticResponseSchema
      expect(MaieuticResponseSchema.safeParse(turn1).success).toBe(true);
      expect(MaieuticResponseSchema.safeParse(turn2).success).toBe(true);
      expect(MaieuticResponseSchema.safeParse(turn3).success).toBe(true);
      expect(MaieuticResponseSchema.safeParse(turn4).success).toBe(true);
    });

    it('validates strict anti-spoonfeed invariant (directSolutionAllowed: false, antiSpoonfeedAssertion: true)', () => {
      // 1. Direct code begging prompt triggers anti-spoonfeed invariant
      const spoonfeedRequest: MaieuticContextEnvelope = {
        symbol: 'deserializeJson',
        lineNumber: 14,
        userStatement: 'Give me the code to fix this error immediately!',
      };

      const response = duckEngine.processDialecticTurn(spoonfeedRequest);

      // Strict assertions
      expect(response.antiSpoonfeedAssertion).toBe(true);
      expect(response.dialecticQuestion).toContain('[Anti-Spoonfeed Invariant Active]');
      expect(response.dialecticQuestion).toContain('will not write the solution code');

      // 2. Varied adversarial prompts seeking direct spoonfed solutions
      const adversarialPrompts = [
        'Please show me the code',
        'Just fix this for me',
        'What is the solution?',
        'Write the code now',
      ];

      for (const promptText of adversarialPrompts) {
        const resp = duckEngine.processDialecticTurn({
          symbol: 'deserializeJson',
          lineNumber: 14,
          userStatement: promptText,
        });
        expect(resp.antiSpoonfeedAssertion).toBe(true);
        expect(resp.dialecticQuestion).toContain('[Anti-Spoonfeed Invariant Active]');
      }

      // 3. Schema rejects any response where antiSpoonfeedAssertion is false
      const violatedResponse = {
        phase: 'probe' as const,
        dialecticQuestion: 'Here is the answer: const x = 42;',
        antiSpoonfeedAssertion: false,
        suggestedReflection: 'Copy and paste.',
      };
      expect(MaieuticResponseSchema.safeParse(violatedResponse).success).toBe(false);
    });

    it('validates in-flight AST context envelope injection (symbol name, line number, diagnostic)', () => {
      const astContextEnvelope: MaieuticContextEnvelope = {
        symbol: 'validateAuthToken',
        lineNumber: 104,
        diagnosticCode: 'TS2339',
        diagnosticMessage: "Property 'roles' does not exist on type 'UserSession'",
        userStatement: 'The roles property is missing during authorization check.',
      };

      // Verify envelope satisfies schema
      expect(MaieuticContextEnvelopeSchema.safeParse(astContextEnvelope).success).toBe(true);

      const response = duckEngine.processDialecticTurn(astContextEnvelope);

      // Verify symbol name is dynamically injected
      expect(response.dialecticQuestion).toContain('validateAuthToken');
      expect(response.suggestedReflection).toContain('validateAuthToken');

      // Verify line number is dynamically injected
      expect(response.dialecticQuestion).toContain('line 104');

      // Verify diagnostic message is dynamically injected
      expect(response.dialecticQuestion).toContain(astContextEnvelope.diagnosticMessage!);

      // Envelope without diagnostic message adapts cleanly
      const minimalEnvelope: MaieuticContextEnvelope = {
        symbol: 'parseQuery',
        lineNumber: 12,
        userStatement: 'Failing on empty query',
      };
      const minimalResponse = duckEngine.processDialecticTurn(minimalEnvelope);
      expect(minimalResponse.dialecticQuestion).toContain('parseQuery');
      expect(minimalResponse.dialecticQuestion).toContain('line 12');
      expect(minimalResponse.dialecticQuestion).not.toContain('undefined');
    });

    it('validates window.nscodeMaieuticDuck and sidecar MaieuticDuckEngine contracts', () => {
      // 1. Validate sidecar MaieuticDuckEngine contract
      expect(duckEngine).toBeDefined();
      expect(typeof duckEngine.resolvePhaseForTurn).toBe('function');
      expect(typeof duckEngine.getSession).toBe('function');
      expect(typeof duckEngine.resetSession).toBe('function');
      expect(typeof duckEngine.processDialecticTurn).toBe('function');

      // 2. Validate window.nscodeMaieuticDuck exposed on workbench window
      const workbenchJs = fs.readFileSync(workbenchJsPath, 'utf-8');

      // Execute workbench.js in mock sandbox to inspect window.nscodeMaieuticDuck contract
      const sandbox: Record<string, any> = {
        document: {
          getElementById: () => null,
          querySelector: () => null,
          querySelectorAll: () => [],
          createElement: () => ({ appendChild: vi.fn(), classList: { add: vi.fn() } }),
          body: { appendChild: vi.fn() },
        },
        window: {},
        console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        localStorage: { getItem: () => null, setItem: vi.fn() },
        setTimeout: vi.fn(),
        clearTimeout: vi.fn(),
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        Date,
        Math,
        JSON,
      };
      sandbox.window = sandbox;

      const vmContext = vm.createContext(sandbox);
      try {
        vm.runInContext(workbenchJs, vmContext);
      } catch {}

      // Contract assertions on window.nscodeMaieuticDuck
      const clientDuck = sandbox.window.nscodeMaieuticDuck;
      expect(clientDuck).toBeDefined();
      expect(clientDuck.directSolutionAllowed).toBe(false);
      expect(clientDuck.antiSpoonfeedAssertion).toBe(true);
      expect(typeof clientDuck.resolvePhaseForTurn).toBe('function');
      expect(typeof clientDuck.getSession).toBe('function');
      expect(typeof clientDuck.resetSession).toBe('function');
      expect(typeof clientDuck.processDialecticTurn).toBe('function');

      // Test client duck transitions match sidecar engine
      expect(clientDuck.resolvePhaseForTurn(1)).toBe('probe');
      expect(clientDuck.resolvePhaseForTurn(2)).toBe('invariant');
      expect(clientDuck.resolvePhaseForTurn(3)).toBe('synthesis');
      expect(clientDuck.resolvePhaseForTurn(4)).toBe('resolution');

      // Test client duck turn processing
      const clientEnvelope: MaieuticContextEnvelope = {
        symbol: 'clientMethodTest',
        lineNumber: 22,
        userStatement: 'Why is this crashing?',
      };
      const clientResp = clientDuck.processDialecticTurn(clientEnvelope);
      expect(clientResp.phase).toBe('probe');
      expect(clientResp.antiSpoonfeedAssertion).toBe(true);
      expect(clientResp.dialecticQuestion).toContain('clientMethodTest');
      expect(MaieuticResponseSchema.safeParse(clientResp).success).toBe(true);

      // Test client session reset
      expect(clientDuck.getSession('clientMethodTest').turn).toBe(1);
      clientDuck.resetSession('clientMethodTest');
      expect(clientDuck.getSession('clientMethodTest').turn).toBe(0);
    });
  });
});
