import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import {
  SocraticLadderEngine,
} from '../../antislop-sidecar/src/socratic-ladder-engine';
import {
  SocraticLadderSessionSchema,
  transitionSocraticLadder,
} from '../../antislop-protocol/src/socratic-ladder';

// Mock electron
vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.2.8',
      isPackaged: false,
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
      loadFile: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    })),
    dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
    ipcMain: { handle: vi.fn() },
    shell: { showItemInFolder: vi.fn(), openPath: vi.fn(), openExternal: vi.fn() },
    clipboard: { writeText: vi.fn(), readText: vi.fn() },
  };
});

export interface MockElement {
  id: string;
  tagName: string;
  className: string;
  classList: {
    add: (...cls: string[]) => void;
    remove: (...cls: string[]) => void;
    contains: (cls: string) => boolean;
    toggle: (cls: string, force?: boolean) => boolean;
  };
  style: Record<string, string>;
  dataset: Record<string, string>;
  textContent: string;
  innerHTML: string;
  value: string;
  disabled: boolean;
  title: string;
  children: MockElement[];
  parentNode: MockElement | null;
  attributes: Record<string, string>;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  getAttribute: (attr: string) => string | null;
  setAttribute: (attr: string, val: string) => void;
  removeAttribute: (attr: string) => void;
  hasAttribute: (attr: string) => boolean;
  addEventListener: (event: string, handler: Function) => void;
  removeEventListener: (event: string, handler: Function) => void;
  appendChild: (child: MockElement) => MockElement;
  prepend: (child: MockElement) => void;
  removeChild: (child: MockElement) => MockElement;
  querySelector: (sel: string) => MockElement | null;
  querySelectorAll: (sel: string) => MockElement[];
  closest: (sel: string) => MockElement | null;
  focus: () => void;
  click: () => void;
  __listeners?: Record<string, Function[]>;
  __wired?: boolean;
}

function createMockElement(id: string = '', tagName: string = 'div'): MockElement {
  const listeners: Record<string, Function[]> = {};
  const classes = new Set<string>();
  const styles: Record<string, string> = {};
  const dataset: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  const children: MockElement[] = [];

  const el: MockElement = {
    id,
    tagName: tagName.toUpperCase(),
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val: string) {
      classes.clear();
      if (val) {
        val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },
    classList: {
      add: (...cls: string[]) => cls.forEach(c => classes.add(c)),
      remove: (...cls: string[]) => cls.forEach(c => classes.delete(c)),
      contains: (cls: string) => classes.has(cls),
      toggle: (cls: string, force?: boolean) => {
        if (force === true) { classes.add(cls); return true; }
        if (force === false) { classes.delete(cls); return false; }
        if (classes.has(cls)) { classes.delete(cls); return false; }
        classes.add(cls);
        return true;
      },
    },
    style: styles,
    dataset,
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    title: '',
    children,
    parentNode: null,
    attributes: attrs,
    scrollTop: 0,
    scrollHeight: 100,
    clientHeight: 100,
    getAttribute: (attr: string) => attrs[attr] || null,
    setAttribute: (attr: string, val: string) => { attrs[attr] = String(val); },
    removeAttribute: (attr: string) => { delete attrs[attr]; },
    hasAttribute: (attr: string) => attr in attrs,
    addEventListener: (event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    },
    appendChild: (child: MockElement) => {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    prepend: (child: MockElement) => {
      child.parentNode = el;
      children.unshift(child);
    },
    removeChild: (child: MockElement) => {
      const idx = children.indexOf(child);
      if (idx >= 0) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        const findId = (node: MockElement): MockElement | null => {
          if (node.id === targetId) return node;
          for (const c of node.children) {
            const found = findId(c);
            if (found) return found;
          }
          return null;
        };
        return findId(el);
      }
      return null;
    },
    querySelectorAll: (_sel: string) => [],
    closest: (_sel: string) => null,
    focus: vi.fn(),
    click: () => {
      if (listeners['click']) {
        listeners['click'].forEach(h => h({ target: el, preventDefault: vi.fn() }));
      }
    },
    __listeners: listeners,
  };

  return el;
}

function setupWorkbenchSandbox(workbenchJsContent: string) {
  const elementRegistry = new Map<string, MockElement>();

  const getOrCreateEl = (id: string, tagName: string = 'div'): MockElement => {
    if (!elementRegistry.has(id)) {
      const el = createMockElement(id, tagName);
      elementRegistry.set(id, el);
    }
    return elementRegistry.get(id)!;
  };

  // Register all necessary elements for Screen B and Socratic Gate
  getOrCreateEl('review-pane');
  getOrCreateEl('review-empty-pane');
  getOrCreateEl('review-active-pane');
  getOrCreateEl('review-diff-list');
  getOrCreateEl('btn-review-accept-all', 'button');
  getOrCreateEl('btn-review-discard-all', 'button');
  getOrCreateEl('status-gate');
  getOrCreateEl('gate-lock-icon', 'span');
  getOrCreateEl('gate-status-text', 'span');

  // Socratic Gate DOM
  const gateCard = getOrCreateEl('socratic-gate-card');
  getOrCreateEl('socratic-gate-header');
  getOrCreateEl('socratic-gate-status-pill', 'span');
  getOrCreateEl('socratic-gate-badge-icon', 'span');

  // Stepper elements
  getOrCreateEl('socratic-ladder-stepper');
  for (let i = 1; i <= 4; i++) {
    getOrCreateEl(`socratic-step-${i}`, 'button');
  }
  for (let i = 1; i <= 3; i++) {
    getOrCreateEl(`socratic-conn-${i}`);
  }

  // Blueprint & Content elements
  getOrCreateEl('socratic-blueprint-box');
  getOrCreateEl('socratic-blueprint-title', 'span');
  getOrCreateEl('socratic-blueprint-code-text', 'code');
  getOrCreateEl('socratic-target-file', 'span');
  getOrCreateEl('socratic-question-container');
  getOrCreateEl('socratic-question-text', 'p');
  getOrCreateEl('socratic-concept-question', 'span');
  getOrCreateEl('socratic-options-list');
  getOrCreateEl('socratic-feedback-banner');
  getOrCreateEl('socratic-feedback-icon', 'span');
  getOrCreateEl('socratic-feedback-text', 'span');
  getOrCreateEl('socratic-explanation-card');
  getOrCreateEl('socratic-explanation-text', 'p');
  getOrCreateEl('socratic-hint-btn', 'button');
  getOrCreateEl('socratic-hint-btn-label', 'span');
  getOrCreateEl('socratic-hint-container');
  getOrCreateEl('socratic-hint-text', 'p');

  // Fake Document Object
  const documentMock = {
    getElementById: (id: string) => elementRegistry.get(id) || null,
    createElement: (tag: string) => createMockElement('', tag),
    querySelector: (sel: string) => {
      if (sel.startsWith('#')) return elementRegistry.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: (_sel: string) => [],
    body: createMockElement('body', 'body'),
  };

  const sandbox: Record<string, any> = {
    document: documentMock,
    window: {},
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    setTimeout: (fn: Function) => fn(),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    Date,
    Math,
    JSON,
    escapeHtml: (s: string) => s,
  };

  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(workbenchJsContent, context);
  } catch (err) {
    // Some DOM elements may not exist in minimal mock, ignore top-level wiring exceptions
  }

  return {
    sandbox,
    elementRegistry,
  };
}

describe('Milestone v0.2.8: Zero-Hardcode Socratic Scaffolding Protocol (Tahap 3)', () => {
  const workbenchJsPath = path.resolve(__dirname, '../src/workbench/workbench.js');
  const workbenchJs = fs.readFileSync(workbenchJsPath, 'utf-8');

  const sampleDiffFixture = {
    id: 'diff-sec-01',
    filePath: 'packages/auth/token_verifier.ts',
    originalContent: 'function verifyToken(token) {\n  return token.roles.includes("admin");\n}',
    proposedContent: 'function verifyToken(token) {\n  if (!token || !token.roles) return false;\n  return token.roles.includes("admin");\n}',
    description: 'Add defensive boundary check to guard against undefined token roles',
  };

  const sampleAsyncDiffFixture = {
    id: 'diff-concur-02',
    filePath: 'packages/network/fetcher.ts',
    originalContent: 'async function fetchLatest() {\n  const res = await fetch("/api");\n  updateState(res);\n}',
    proposedContent: 'async function fetchLatest(abortController) {\n  const res = await fetch("/api", { signal: abortController.signal });\n  if (!abortController.signal.aborted) updateState(res);\n}',
    description: 'Add AbortController concurrency guard against race conditions',
  };

  // SUITE 1: SIDECAR DYNAMIC SOCRATIC LADDER ENGINE & PROTOCOL FIDELITY
  describe('Suite 1: Sidecar Dynamic Engine & Protocol Schemas', () => {
    it('1.1 extracts AST identifier and classifies category accurately without hardcoded static templates', () => {
      const engine = new SocraticLadderEngine();
      const ctx = engine.extractContext(sampleDiffFixture);

      expect(ctx.category).toBe('defensive_bounds');
      expect(ctx.targetSymbol).toBe('token');
      expect(ctx.guardKeyword).toBe('if');
    });

    it('1.2 synthesizes valid 4-level SocraticLadderSessionDTO complying strictly with Zod schema', () => {
      const engine = new SocraticLadderEngine();
      const session = engine.synthesizeLadder(sampleDiffFixture);

      // Validate against protocol Zod schema
      const parseResult = SocraticLadderSessionSchema.safeParse(session);
      expect(parseResult.success).toBe(true);

      // Verify all 4 levels are present
      expect(session.levels.reflection).toBeDefined();
      expect(session.levels.invariant).toBeDefined();
      expect(session.levels.blueprint).toBeDefined();
      expect(session.levels.cloze).toBeDefined();
      expect(session.currentLevel).toBe(1);
      expect(session.isFullyUnlocked).toBe(false);
    });

    it('1.3 enforces Zero-Slop Distractor Invariant (no joke distractors, no emoji)', () => {
      const engine = new SocraticLadderEngine();
      const session = engine.synthesizeLadder(sampleDiffFixture);

      const allDistractorTexts = [
        ...session.levels.reflection.options.map(o => o.text),
        ...session.levels.invariant.options.map(o => o.text),
        ...session.levels.blueprint.options.map(o => o.text),
        ...session.levels.cloze.blanks[0].distractors,
      ];

      for (const text of allDistractorTexts) {
        expect(text.toLowerCase()).not.toContain('reboot operating system');
        expect(text.toLowerCase()).not.toContain('bypassing v8');
        expect(text.toLowerCase()).not.toContain('3 keys');
        // Zero-emoji invariant
        expect(/[\u{1F300}-\u{1F9FF}]/u.test(text)).toBe(false);
      }
    });

    it('1.4 Golden Invariant: directAutoPatchAllowed is strictly false across all levels', () => {
      const engine = new SocraticLadderEngine();
      const session = engine.synthesizeLadder(sampleDiffFixture);

      expect(session.directAutoPatchAllowed).toBe(false);
      // Invariant: directAutoPatchAllowed cannot be mutated to true
      expect(() => {
        SocraticLadderSessionSchema.parse({
          ...session,
          directAutoPatchAllowed: true as any,
        });
      }).toThrow();
    });

    it('1.5 protocol state transition requires completing all 4 levels before isFullyUnlocked becomes true', () => {
      const engine = new SocraticLadderEngine();
      let session = engine.synthesizeLadder(sampleDiffFixture);

      // Solve level 1 (Reflection)
      const correctL1Opt = session.levels.reflection.options.find(o => o.isCorrect)!.id;
      let res = transitionSocraticLadder(session, {
        type: 'ANSWER_OPTION',
        level: 1,
        optionId: correctL1Opt,
      });
      session = res.session;
      expect(session.levels.reflection.completed).toBe(true);
      expect(session.currentLevel).toBe(2);
      expect(session.isFullyUnlocked).toBe(false);

      // Solve level 2 (Invariant)
      const correctL2Opt = session.levels.invariant.options.find(o => o.isCorrect)!.id;
      res = transitionSocraticLadder(session, {
        type: 'ANSWER_OPTION',
        level: 2,
        optionId: correctL2Opt,
      });
      session = res.session;
      expect(session.levels.invariant.completed).toBe(true);
      expect(session.currentLevel).toBe(3);
      expect(session.isFullyUnlocked).toBe(false);

      // Solve level 3 (Blueprint)
      const correctL3Opt = session.levels.blueprint.options.find(o => o.isCorrect)!.id;
      res = transitionSocraticLadder(session, {
        type: 'ANSWER_OPTION',
        level: 3,
        optionId: correctL3Opt,
      });
      session = res.session;
      expect(session.levels.blueprint.completed).toBe(true);
      expect(session.currentLevel).toBe(4);
      expect(session.isFullyUnlocked).toBe(false);

      // Solve level 4 (Cloze)
      res = transitionSocraticLadder(session, {
        type: 'SOLVE_CLOZE',
      });
      session = res.session;
      expect(session.levels.cloze.completed).toBe(true);
      expect(session.isFullyUnlocked).toBe(true);
    });
  });

  // SUITE 2: WORKBENCH 4-LEVEL STEPPER DOM & STEP NAVIGATION
  describe('Suite 2: Workbench 4-Level Stepper UI & Navigation', () => {
    it('2.1 renders 4-level stepper nodes (#socratic-step-1 to 4) and 3 connectors in DOM', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);

      const challenge = sandbox.screenBController?.getSocraticChallenge();
      expect(challenge).toBeDefined();
      expect(challenge.levels).toBeDefined();
      expect(challenge.levels[1]).toBeDefined();
      expect(challenge.levels[2]).toBeDefined();
      expect(challenge.levels[3]).toBeDefined();
      expect(challenge.levels[4]).toBeDefined();

      const step1 = elementRegistry.get('socratic-step-1');
      const step2 = elementRegistry.get('socratic-step-2');
      const step3 = elementRegistry.get('socratic-step-3');
      const step4 = elementRegistry.get('socratic-step-4');

      expect(step1).toBeDefined();
      expect(step1?.classList.contains('active')).toBe(true);
      expect(step2?.classList.contains('active')).toBe(false);
      expect(step3?.classList.contains('active')).toBe(false);
      expect(step4?.classList.contains('active')).toBe(false);
    });

    it('2.2 setSocraticStep forbids jumping to uncompleted steps', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);

      // Attempt to jump directly to Level 3 without solving Level 1
      sandbox.screenBController.setSocraticStep(3);

      const challenge = sandbox.screenBController.getSocraticChallenge();
      expect(challenge.currentLevel).toBe(1); // Should remain at 1
    });

    it('2.3 Level 3 displays #socratic-blueprint-box with architectural pseudocode', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      const challenge = sandbox.screenBController.getSocraticChallenge();
      challenge.maxCompletedLevel = 2; // Simulate L1 and L2 solved
      sandbox.screenBController.setSocraticStep(3);

      expect(challenge.currentLevel).toBe(3);
      const bpBox = elementRegistry.get('socratic-blueprint-box');
      expect(bpBox?.style.display).toBe('block');
      const bpCode = elementRegistry.get('socratic-blueprint-code-text');
      expect(bpCode?.textContent).toContain('function process');
    });

    it('2.4 Level 4 displays syntax cloze snippet in #socratic-blueprint-box', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      const challenge = sandbox.screenBController.getSocraticChallenge();
      challenge.maxCompletedLevel = 3;
      sandbox.screenBController.setSocraticStep(4);

      expect(challenge.currentLevel).toBe(4);
      const bpBox = elementRegistry.get('socratic-blueprint-box');
      expect(bpBox?.style.display).toBe('block');
      const bpCode = elementRegistry.get('socratic-blueprint-code-text');
      expect(bpCode?.textContent).toContain('{BLANK_0}');
    });
  });

  // SUITE 3: STRICT 4-LEVEL PROGRESSION & GOLDEN INVARIANT
  describe('Suite 3: Strict 4-Level Scaffolding Progression', () => {
    it('3.1 in strict ladder mode, solving Level 1 advances to Level 2 without unlocking the gate', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      sandbox.screenBController.setSocraticStrictLadder(true);

      const challenge = sandbox.screenBController.getSocraticChallenge();
      const correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);

      const res = sandbox.screenBController.answerSocraticChallenge(correctIdx);
      expect(res.success).toBe(true);
      expect(res.isUnlocked).toBe(false);
      expect(res.advancedToLevel).toBe(2);

      expect(sandbox.screenBController.isSocraticGateUnlocked()).toBe(false);
      expect(challenge.currentLevel).toBe(2);
      expect(challenge.question).toContain('precondition invariant');
    });

    it('3.2 solving all 4 levels sequentially unlocks gate and marks all stepper nodes completed', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      sandbox.screenBController.setSocraticStrictLadder(true);

      const challenge = sandbox.screenBController.getSocraticChallenge();

      // Step 1 -> 2
      let correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      let res = sandbox.screenBController.answerSocraticChallenge(correctIdx);
      expect(res.advancedToLevel).toBe(2);

      // Step 2 -> 3
      correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      res = sandbox.screenBController.answerSocraticChallenge(correctIdx);
      expect(res.advancedToLevel).toBe(3);

      // Step 3 -> 4
      correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      res = sandbox.screenBController.answerSocraticChallenge(correctIdx);
      expect(res.advancedToLevel).toBe(4);

      // Step 4 (Cloze) -> Unlock!
      correctIdx = challenge.options.findIndex((o: any) => o.isCorrect);
      res = sandbox.screenBController.answerSocraticChallenge(correctIdx);
      expect(res.isUnlocked).toBe(true);

      expect(sandbox.screenBController.isSocraticGateUnlocked()).toBe(true);

      const pill = elementRegistry.get('socratic-gate-status-pill');
      expect(pill?.textContent).toMatch(/UNLOCKED/i);

      // All stepper nodes are completed
      for (let i = 1; i <= 4; i++) {
        const step = elementRegistry.get(`socratic-step-${i}`);
        expect(step?.classList.contains('completed')).toBe(true);
      }
    });

    it('3.3 selecting incorrect option at any level displays feedback and keeps gate locked', () => {
      const { sandbox, elementRegistry } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      sandbox.screenBController.setSocraticStrictLadder(true);

      const challenge = sandbox.screenBController.getSocraticChallenge();
      const incorrectIdx = challenge.options.findIndex((o: any) => !o.isCorrect);

      const res = sandbox.screenBController.answerSocraticChallenge(incorrectIdx);
      expect(res.success).toBe(false);
      expect(res.isUnlocked).toBe(false);
      expect(sandbox.screenBController.isSocraticGateUnlocked()).toBe(false);

      const banner = elementRegistry.get('socratic-feedback-banner');
      expect(banner?.style.display).toBe('flex');
      expect(banner?.classList.contains('feedback-error')).toBe(true);
    });

    it('3.4 Golden Invariant: directAutoPatchAllowed remains false throughout entire session', () => {
      const { sandbox } = setupWorkbenchSandbox(workbenchJs);
      const setDiffs = sandbox.screenBController?.setReviewDiffs || sandbox.window?.setReviewDiffs;

      setDiffs([sampleDiffFixture]);
      const challenge = sandbox.screenBController.getSocraticChallenge();
      expect(challenge.directAutoPatchAllowed).toBe(false);

      // Unlock gate
      sandbox.screenBController.unlockSocraticGate();
      expect(sandbox.screenBController.isSocraticGateUnlocked()).toBe(true);
      expect(challenge.directAutoPatchAllowed).toBe(false);
    });
  });
});
