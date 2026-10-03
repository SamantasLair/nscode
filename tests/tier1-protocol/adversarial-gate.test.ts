import { describe, it, expect } from 'vitest';
import {
  // Cognitive Gate
  CognitiveFrictionSessionSchema,
  transitionGateSession,
  type CognitiveFrictionSessionDTO,
  type GateSessionStatus,
  TypeAlongPracticeSchema,
  ClozeChallengeSchema,
  MIN_TYPE_ALONG_ACCURACY_PERCENT,
  // Error Anatomy
  TextSpanRangeSchema,
  type TextSpanRange,
  ContractViolatedSchema,
  // Smart Card
  BIG_O_TIME_REGEX,
  BIG_O_SPACE_REGEX,
  ComplexityMetricSchema,
  // JSON-RPC
  validateIncomingRequest,
  READ_ONLY_RPC_METHODS,
  isReadOnlyRpcMethod,
} from '@antislop/protocol';

describe('Adversarial Challenge Suite: Milestone 1 Invariant Stress-Testing', () => {
  const validUUID = 'a0000000-0000-0000-0000-000000000001';
  const cardUUID = 'b0000000-0000-0000-0000-000000000002';

  // =========================================================================
  // Challenge Vector 1: directAutoPatchAllowed Schema Parse Rejection
  // =========================================================================
  describe('Challenge Vector 1: directAutoPatchAllowed Inviolability', () => {
    it('ADVERSARIAL: Rejects directAutoPatchAllowed: true across all possible statuses', () => {
      const allStatuses: GateSessionStatus[] = [
        'LOCKED',
        'CLOZE_PENDING',
        'CLOZE_PASSED',
        'TYPE_ALONG_PENDING',
        'TYPE_ALONG_PASSED',
        'UNLOCKED',
      ];

      for (const status of allStatuses) {
        const maliciousPayload = {
          sessionId: validUUID,
          cardId: cardUUID,
          status,
          clozeSolved: true,
          typeAlongSolved: true,
          clipboardUnlocked: status === 'UNLOCKED',
          directAutoPatchAllowed: true, // EXPLICIT ATTACK
          clozeAttempts: 1,
        };

        const result = CognitiveFrictionSessionSchema.safeParse(maliciousPayload);
        expect(result.success).toBe(false);
        if (!result.success) {
          const fieldError = result.error.issues.find(
            (issue) => issue.path.includes('directAutoPatchAllowed')
          );
          expect(fieldError).toBeDefined();
        }
      }
    });

    it('ADVERSARIAL: Rejects truthy, numeric, and string coercions for directAutoPatchAllowed', () => {
      const nonBooleanFuzz = [1, 'true', '1', {}, [], null, undefined];

      for (const val of nonBooleanFuzz) {
        const payload = {
          sessionId: validUUID,
          cardId: cardUUID,
          status: 'UNLOCKED',
          clozeSolved: true,
          typeAlongSolved: true,
          clipboardUnlocked: true,
          directAutoPatchAllowed: val,
        };

        const result = CognitiveFrictionSessionSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });
  });

  // =========================================================================
  // Challenge Vector 2: clipboardUnlocked with Non-UNLOCKED Status
  // =========================================================================
  describe('Challenge Vector 2: Clipboard Unlock Guarding', () => {
    it('ADVERSARIAL: Rejects clipboardUnlocked: true when status is LOCKED', () => {
      const payload = {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: true, // Premature unlock attack
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'clipboardUnlocked can only be true when status is UNLOCKED'
        );
      }
    });

    it('ADVERSARIAL: Rejects clipboardUnlocked: true when status is CLOZE_PENDING', () => {
      const payload = {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'CLOZE_PENDING',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: true, // Premature unlock attack
        directAutoPatchAllowed: false,
        clozeAttempts: 1,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'clipboardUnlocked can only be true when status is UNLOCKED'
        );
      }
    });

    it('ADVERSARIAL: Rejects clipboardUnlocked: true across all non-UNLOCKED intermediate states', () => {
      const intermediateStates: GateSessionStatus[] = [
        'LOCKED',
        'CLOZE_PENDING',
        'CLOZE_PASSED',
        'TYPE_ALONG_PENDING',
        'TYPE_ALONG_PASSED',
      ];

      for (const status of intermediateStates) {
        const payload = {
          sessionId: validUUID,
          cardId: cardUUID,
          status,
          clozeSolved: true,
          typeAlongSolved: true,
          clipboardUnlocked: true, // MUST BE REJECTED
          directAutoPatchAllowed: false,
          clozeAttempts: 1,
        };

        const result = CognitiveFrictionSessionSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });

    it('ADVERSARIAL: Rejects status UNLOCKED when clipboardUnlocked is false', () => {
      const payload = {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'UNLOCKED',
        clozeSolved: true,
        typeAlongSolved: true,
        clipboardUnlocked: false, // Inconsistent with UNLOCKED status!
        directAutoPatchAllowed: false,
      };

      const result = CognitiveFrictionSessionSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'status UNLOCKED requires clipboardUnlocked to be true'
        );
      }
    });
  });

  // =========================================================================
  // Challenge Vector 3: State Machine Transitions via transitionGateSession
  // =========================================================================
  describe('Challenge Vector 3: State Machine Illegal Jumps & Transition Invariants', () => {
    function createInitialSession(status: GateSessionStatus = 'LOCKED'): CognitiveFrictionSessionDTO {
      return {
        sessionId: validUUID,
        cardId: cardUUID,
        status,
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };
    }

    it('ADVERSARIAL: Prohibits illegal jump from LOCKED directly to UNLOCKED via TYPE_ALONG_COMPLETED', () => {
      const locked = createInitialSession('LOCKED');

      // Attempting to skip CLOZE and jump straight to UNLOCKED
      const next = transitionGateSession(locked, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 100,
      });

      // Status MUST NOT become UNLOCKED; state MUST remain unchanged
      expect(next.status).toBe('LOCKED');
      expect(next.clipboardUnlocked).toBe(false);
      expect(next.typeAlongSolved).toBe(false);
      expect(next.directAutoPatchAllowed).toBe(false);
    });

    it('ADVERSARIAL: Prohibits illegal jump from LOCKED to CLOZE_PASSED without pending cloze', () => {
      const locked = createInitialSession('LOCKED');
      const next = transitionGateSession(locked, { type: 'CLOZE_COMPLETED' });

      expect(next.status).toBe('LOCKED');
      expect(next.clozeSolved).toBe(false);
    });

    it('PERMITS: Starting TYPE_ALONG directly from LOCKED state (alternative cognitive path)', () => {
      const locked = createInitialSession('LOCKED');
      const next = transitionGateSession(locked, { type: 'START_TYPE_ALONG' });

      expect(next.status).toBe('TYPE_ALONG_PENDING');
      expect(next.clipboardUnlocked).toBe(false);
      expect(next.typeAlongSolved).toBe(false);
    });

    it('ADVERSARIAL: Prohibits illegal jump from CLOZE_PENDING to UNLOCKED', () => {
      const clozePending = createInitialSession('CLOZE_PENDING');
      const next = transitionGateSession(clozePending, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 100,
      });

      expect(next.status).toBe('CLOZE_PENDING');
      expect(next.clipboardUnlocked).toBe(false);
    });

    it('ADVERSARIAL: Prohibits illegal jump from CLOZE_PASSED to UNLOCKED without TYPE_ALONG_PENDING', () => {
      const clozePassed: CognitiveFrictionSessionDTO = {
        ...createInitialSession('CLOZE_PASSED'),
        clozeSolved: true,
      };
      const next = transitionGateSession(clozePassed, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 100,
      });

      expect(next.status).toBe('CLOZE_PASSED');
      expect(next.clipboardUnlocked).toBe(false);
    });

    it('ADVERSARIAL: Dispatches unknown event types safely without state mutation', () => {
      const locked = createInitialSession('LOCKED');
      // Force an illegal arbitrary action cast
      const next = transitionGateSession(locked, { type: 'FORCE_UNLOCK_EXPLOIT' } as any);

      expect(next.status).toBe('LOCKED');
      expect(next.clipboardUnlocked).toBe(false);
      expect(next.directAutoPatchAllowed).toBe(false);
    });

    it('ADVERSARIAL: Validates that out-of-range accuracyPercent in TYPE_ALONG_COMPLETED is rejected by schema', () => {
      const pending: CognitiveFrictionSessionDTO = {
        ...createInitialSession('TYPE_ALONG_PENDING'),
        clozeSolved: true,
      };

      // Transition with invalid negative accuracy
      const negativeResult = transitionGateSession(pending, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: -15,
      });

      // The transition produces an object, but parsing it with schema MUST FAIL
      const parseNeg = CognitiveFrictionSessionSchema.safeParse(negativeResult);
      expect(parseNeg.success).toBe(false);

      // Transition with invalid >100 accuracy
      const overflowResult = transitionGateSession(pending, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 150,
      });
      const parseOver = CognitiveFrictionSessionSchema.safeParse(overflowResult);
      expect(parseOver.success).toBe(false);
    });

    it('ADVERSARIAL: RESET event unconditionally locks clipboard and zeroes directAutoPatchAllowed', () => {
      const unlockedSession: CognitiveFrictionSessionDTO = {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'UNLOCKED',
        clozeSolved: true,
        typeAlongSolved: true,
        clipboardUnlocked: true,
        directAutoPatchAllowed: false,
        clozeAttempts: 2,
        typeAlongAccuracy: 98,
      };

      const resetSession = transitionGateSession(unlockedSession, { type: 'RESET' });

      expect(resetSession.status).toBe('LOCKED');
      expect(resetSession.clozeSolved).toBe(false);
      expect(resetSession.typeAlongSolved).toBe(false);
      expect(resetSession.clipboardUnlocked).toBe(false);
      expect(resetSession.directAutoPatchAllowed).toBe(false);

      const parsed = CognitiveFrictionSessionSchema.safeParse(resetSession);
      expect(parsed.success).toBe(true);
    });
  });

  // =========================================================================
  // Challenge Vector 4: TextSpanRange Boundary Violations
  // =========================================================================
  describe('Challenge Vector 4: TextSpanRange Boundary Violations', () => {
    it('ADVERSARIAL: Rejects endLine < startLine across varied coordinates', () => {
      const invertedLineCases = [
        { startLine: 2, startColumn: 1, endLine: 1, endColumn: 1 },
        { startLine: 100, startColumn: 5, endLine: 99, endColumn: 50 },
        { startLine: 10, startColumn: 10, endLine: 1, endColumn: 100 },
      ];

      for (const range of invertedLineCases) {
        const result = TextSpanRangeSchema.safeParse(range);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toContain(
            'end position must be greater than or equal to start position'
          );
        }
      }
    });

    it('ADVERSARIAL: Rejects endColumn < startColumn when endLine === startLine', () => {
      const invertedColCases = [
        { startLine: 5, startColumn: 10, endLine: 5, endColumn: 9 },
        { startLine: 1, startColumn: 2, endLine: 1, endColumn: 1 },
        { startLine: 50, startColumn: 100, endLine: 50, endColumn: 1 },
      ];

      for (const range of invertedColCases) {
        const result = TextSpanRangeSchema.safeParse(range);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toContain(
            'end position must be greater than or equal to start position'
          );
        }
      }
    });

    it('ADVERSARIAL: Rejects non-positive coordinates (0 and negative numbers)', () => {
      const nonPositiveCases = [
        { startLine: 0, startColumn: 1, endLine: 1, endColumn: 1 },
        { startLine: 1, startColumn: 0, endLine: 1, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: 0, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: 1, endColumn: 0 },
        { startLine: -1, startColumn: 1, endLine: 1, endColumn: 1 },
        { startLine: 1, startColumn: -5, endLine: 1, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: -10, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: 1, endColumn: -20 },
      ];

      for (const range of nonPositiveCases) {
        const result = TextSpanRangeSchema.safeParse(range);
        expect(result.success).toBe(false);
      }
    });

    it('ADVERSARIAL: Rejects floating-point line/column numbers', () => {
      const floatCases = [
        { startLine: 1.5, startColumn: 1, endLine: 2, endColumn: 1 },
        { startLine: 1, startColumn: 1.2, endLine: 2, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: 2.7, endColumn: 1 },
        { startLine: 1, startColumn: 1, endLine: 2, endColumn: 3.14 },
      ];

      for (const range of floatCases) {
        const result = TextSpanRangeSchema.safeParse(range);
        expect(result.success).toBe(false);
      }
    });

    it('ADVERSARIAL: Accepts valid zero-width boundary (cursor point)', () => {
      const point = {
        startLine: 42,
        startColumn: 10,
        endLine: 42,
        endColumn: 10,
      };
      const result = TextSpanRangeSchema.safeParse(point);
      expect(result.success).toBe(true);
    });

    it('ADVERSARIAL: Accepts valid multiline range even when endColumn < startColumn', () => {
      // In text editors, a block from line 10 col 50 to line 12 col 5 is completely valid
      const multiline = {
        startLine: 10,
        startColumn: 50,
        endLine: 12,
        endColumn: 5,
      };
      const result = TextSpanRangeSchema.safeParse(multiline);
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Challenge Vector 5: Extended Invariant & Security Stress Tests
  // =========================================================================
  describe('Challenge Vector 5: Extended Anti-Slop Security Boundaries', () => {
    it('ADVERSARIAL: TypeAlongPracticeSchema strictly rejects allowPaste: true', () => {
      const hostilePractice = {
        practiceId: validUUID,
        cardId: cardUUID,
        prompt: 'Type the RAII construct:',
        targetKeystrokes: 'auto p = std::make_unique<int>(1);',
        languageId: 'cpp',
        minAccuracyPercent: 95.0,
        maxAllowedErrors: 1,
        allowPaste: true, // EXPLOIT: attempts to re-enable paste
        caseSensitive: true,
      };

      const result = TypeAlongPracticeSchema.safeParse(hostilePractice);
      expect(result.success).toBe(false);
    });

    it('ADVERSARIAL: Zero-mutation RPC whitelist rejects method tampering attacks', () => {
      const tamperingMethods = [
        '__proto__',
        'constructor',
        'prototype',
        'file.write',
        'FILE.WRITE',
        'rpc.ping; rm -rf /',
        'context.getActiveBuffer\nfile.write',
        'eval',
        'require',
        'import',
        'fs',
      ];

      for (const method of tamperingMethods) {
        expect(isReadOnlyRpcMethod(method)).toBe(false);

        const attackReq = {
          jsonrpc: '2.0',
          id: `hack-${method}`,
          method,
          params: {},
        };

        const validated = validateIncomingRequest(attackReq);
        expect(validated.success).toBe(false);
        if (!validated.success) {
          expect(validated.errorResponse.error.code).toBe(-32601);
          expect(
            (validated.errorResponse.error.data as any).zeroMutationInvariant
          ).toBe(true);
        }
      }
    });

    it('ADVERSARIAL: Big-O Regex rejects ReDoS and injection payloads', () => {
      const evilPayloads = [
        'O(' + 'a'.repeat(500) + '!)', // Long string
        'O(n); DROP TABLE sessions;', // SQL injection attempt
        'O(n)<script>alert(1)</script>', // XSS attempt
        'O(n) && process.exit(1)', // Code injection attempt
        'O(-n)', // Negative variable
        'O(1/0)', // Division by zero
      ];

      for (const payload of evilPayloads) {
        expect(BIG_O_TIME_REGEX.test(payload)).toBe(false);
        expect(BIG_O_SPACE_REGEX.test(payload)).toBe(false);
      }
    });

    it('ADVERSARIAL: Big-O Regex strictly rejects non-mathematical words and slop', () => {
      const slopWords = [
        'O(infinite)',
        'O(fast)',
        'O(this is slop)',
        'O()',
        'O(amortized)',
        'O(auxiliary)',
        'O(1amortized)',
        'O(1auxiliary)',
      ];

      for (const slop of slopWords) {
        expect(BIG_O_TIME_REGEX.test(slop)).toBe(false);
        expect(BIG_O_SPACE_REGEX.test(slop)).toBe(false);
      }
    });

    it('ADVERSARIAL: Enforces unidirectional qualifiers between time and space complexity', () => {
      // Time complexity rejects auxiliary
      expect(BIG_O_TIME_REGEX.test('O(n auxiliary)')).toBe(false);
      expect(BIG_O_TIME_REGEX.test('O(1 auxiliary)')).toBe(false);
      expect(BIG_O_TIME_REGEX.test('O(n) auxiliary')).toBe(false);

      // Space complexity rejects amortized
      expect(BIG_O_SPACE_REGEX.test('O(1 amortized)')).toBe(false);
      expect(BIG_O_SPACE_REGEX.test('O(n amortized)')).toBe(false);
      expect(BIG_O_SPACE_REGEX.test('O(n) amortized')).toBe(false);

      // Positive qualifier acceptance
      expect(BIG_O_TIME_REGEX.test('O(1 amortized)')).toBe(true);
      expect(BIG_O_TIME_REGEX.test('O(n amortized)')).toBe(true);
      expect(BIG_O_SPACE_REGEX.test('O(1 auxiliary)')).toBe(true);
      expect(BIG_O_SPACE_REGEX.test('O(n auxiliary)')).toBe(true);
    });
  });

  // =========================================================================
  // Challenge Vector 6: Cognitive Friction Gate Iteration 2 Paths & Accuracy
  // =========================================================================
  describe('Challenge Vector 6: Cognitive Gate Iteration 2 Alternative Paths & Accuracy Verification', () => {
    function initialLockedSession(): CognitiveFrictionSessionDTO {
      return {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
      };
    }

    it('VERIFIES: Independent Cloze path successfully unlocks gate session', () => {
      let session = initialLockedSession();

      session = transitionGateSession(session, { type: 'START_CLOZE' });
      expect(session.status).toBe('CLOZE_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, { type: 'CLOZE_COMPLETED' });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);
      expect(session.typeAlongSolved).toBe(false);
      expect(session.clipboardUnlocked).toBe(true);
      expect(session.directAutoPatchAllowed).toBe(false);

      const parse = CognitiveFrictionSessionSchema.safeParse(session);
      expect(parse.success).toBe(true);
    });

    it('VERIFIES: Independent Type-Along path successfully unlocks gate session on >= 90% accuracy', () => {
      let session = initialLockedSession();

      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });
      expect(session.status).toBe('TYPE_ALONG_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 92.4,
      });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(false);
      expect(session.typeAlongSolved).toBe(true);
      expect(session.typeAlongAccuracy).toBe(92.4);
      expect(session.clipboardUnlocked).toBe(true);

      const parse = CognitiveFrictionSessionSchema.safeParse(session);
      expect(parse.success).toBe(true);
    });

    it('ENFORCES: Type-Along completion with accuracy < 90% retains TYPE_ALONG_PENDING without unlocking', () => {
      let session = initialLockedSession();
      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });

      // Attempt with 89.9% (below 90% threshold)
      const failedSession = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 89.9,
      });
      expect(failedSession.status).toBe('TYPE_ALONG_PENDING');
      expect(failedSession.typeAlongSolved).toBe(false);
      expect(failedSession.typeAlongAccuracy).toBe(89.9);
      expect(failedSession.clipboardUnlocked).toBe(false);

      // Schema parse must succeed as a valid pending session
      const parse = CognitiveFrictionSessionSchema.safeParse(failedSession);
      expect(parse.success).toBe(true);
    });

    it('ENFORCES: Type-Along completion with accuracy 0% retains pending and locked status', () => {
      let session = initialLockedSession();
      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });

      const failedSession = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 0,
      });
      expect(failedSession.status).toBe('TYPE_ALONG_PENDING');
      expect(failedSession.typeAlongSolved).toBe(false);
      expect(failedSession.clipboardUnlocked).toBe(false);
    });

    it('ENFORCES: Custom minAccuracyPercent parameter is respected when provided', () => {
      let session = initialLockedSession();
      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });

      // Require 95% minimum
      const attempt = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 92.0,
        minAccuracyPercent: 95.0,
      });
      expect(attempt.status).toBe('TYPE_ALONG_PENDING');
      expect(attempt.typeAlongSolved).toBe(false);

      const passAttempt = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 95.5,
        minAccuracyPercent: 95.0,
      });
      expect(passAttempt.status).toBe('UNLOCKED');
      expect(passAttempt.typeAlongSolved).toBe(true);
    });

    it('ANTI-CHEAT: Rejects UNLOCKED status when neither challenge has been solved', () => {
      const forgedSession = {
        sessionId: validUUID,
        cardId: cardUUID,
        status: 'UNLOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: true,
        directAutoPatchAllowed: false,
      };

      const parse = CognitiveFrictionSessionSchema.safeParse(forgedSession);
      expect(parse.success).toBe(false);
      if (!parse.success) {
        expect(parse.error.issues[0]?.message).toContain(
          'status UNLOCKED requires clozeSolved or typeAlongSolved to be true'
        );
      }
    });

    it('VERIFIES: Completing both challenges marks clozeSolved and typeAlongSolved as true', () => {
      let session = initialLockedSession();
      session = transitionGateSession(session, { type: 'START_CLOZE' });
      session = transitionGateSession(session, { type: 'CLOZE_COMPLETED' });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);

      // User continues to Type-Along practice
      session = transitionGateSession(session, { type: 'START_TYPE_ALONG' });
      expect(session.status).toBe('TYPE_ALONG_PENDING');
      expect(session.clipboardUnlocked).toBe(false);

      session = transitionGateSession(session, {
        type: 'TYPE_ALONG_COMPLETED',
        accuracyPercent: 98.0,
      });
      expect(session.status).toBe('UNLOCKED');
      expect(session.clozeSolved).toBe(true);
      expect(session.typeAlongSolved).toBe(true);
      expect(session.clipboardUnlocked).toBe(true);

      const parse = CognitiveFrictionSessionSchema.safeParse(session);
      expect(parse.success).toBe(true);
    });
  });
});
