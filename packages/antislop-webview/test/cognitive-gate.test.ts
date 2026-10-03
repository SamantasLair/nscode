import { describe, it, expect, beforeEach } from 'vitest';
import {
  transitionGateSession,
  type CognitiveFrictionSessionDTO,
  CognitiveFrictionSessionSchema,
  MIN_TYPE_ALONG_ACCURACY_PERCENT,
  type ClozeChallengeDTO,
  type TypeAlongPracticeDTO,
} from '@antislop/protocol';

describe('CognitiveGate: Anti-Atrophy Friction, Golden Invariant & Clipboard Protection', () => {
  let session: CognitiveFrictionSessionDTO;

  beforeEach(() => {
    session = {
      sessionId: '00000000-0000-0000-0000-000000000001',
      cardId: '00000000-0000-0000-0000-000000000002',
      status: 'LOCKED',
      clozeSolved: false,
      typeAlongSolved: false,
      clipboardUnlocked: false,
      directAutoPatchAllowed: false,
      clozeAttempts: 0,
    };
  });

  it('enforces Inviolable Golden Invariant: directAutoPatchAllowed is strictly literal false', () => {
    expect(session.directAutoPatchAllowed).toBe(false);

    // Schema must reject any attempt to allow auto-patching
    const hostile = {
      ...session,
      directAutoPatchAllowed: true,
    };
    const parsed = CognitiveFrictionSessionSchema.safeParse(hostile);
    expect(parsed.success).toBe(false);
  });

  it('keeps clipboard strictly locked while in LOCKED, CLOZE_PENDING, or TYPE_ALONG_PENDING states', () => {
    expect(session.clipboardUnlocked).toBe(false);

    const s1 = transitionGateSession(session, { type: 'START_CLOZE' });
    expect(s1.status).toBe('CLOZE_PENDING');
    expect(s1.clipboardUnlocked).toBe(false);

    const s2 = transitionGateSession(session, { type: 'START_TYPE_ALONG' });
    expect(s2.status).toBe('TYPE_ALONG_PENDING');
    expect(s2.clipboardUnlocked).toBe(false);
  });

  it('unlocks clipboard only upon valid CLOZE_COMPLETED transition', () => {
    const pending = transitionGateSession(session, { type: 'START_CLOZE' });
    const completed = transitionGateSession(pending, { type: 'CLOZE_COMPLETED' });

    expect(completed.status).toBe('UNLOCKED');
    expect(completed.clozeSolved).toBe(true);
    expect(completed.clipboardUnlocked).toBe(true);
    expect(completed.directAutoPatchAllowed).toBe(false);

    // Conforms to Zod superRefine invariants
    const parsed = CognitiveFrictionSessionSchema.safeParse(completed);
    expect(parsed.success).toBe(true);
  });

  it('enforces minimum 90.0% accuracy gate for Type-Along practice mode', () => {
    expect(MIN_TYPE_ALONG_ACCURACY_PERCENT).toBe(90.0);

    const pending = transitionGateSession(session, { type: 'START_TYPE_ALONG' });

    // Below threshold: 84.5% accuracy -> MUST NOT UNLOCK
    const failedAttempt = transitionGateSession(pending, {
      type: 'TYPE_ALONG_COMPLETED',
      accuracyPercent: 84.5,
    });
    expect(failedAttempt.status).toBe('TYPE_ALONG_PENDING');
    expect(failedAttempt.typeAlongSolved).toBe(false);
    expect(failedAttempt.clipboardUnlocked).toBe(false);

    // At or above threshold: 92.0% accuracy -> UNLOCKS
    const successAttempt = transitionGateSession(pending, {
      type: 'TYPE_ALONG_COMPLETED',
      accuracyPercent: 92.0,
    });
    expect(successAttempt.status).toBe('UNLOCKED');
    expect(successAttempt.typeAlongSolved).toBe(true);
    expect(successAttempt.clipboardUnlocked).toBe(true);
    expect(successAttempt.typeAlongAccuracy).toBe(92.0);

    const parsed = CognitiveFrictionSessionSchema.safeParse(successAttempt);
    expect(parsed.success).toBe(true);
  });

  it('resets cognitive session cleanly back to LOCKED state', () => {
    const pending = transitionGateSession(session, { type: 'START_CLOZE' });
    const completed = transitionGateSession(pending, { type: 'CLOZE_COMPLETED' });
    expect(completed.clipboardUnlocked).toBe(true);

    const reset = transitionGateSession(completed, { type: 'RESET' });
    expect(reset.status).toBe('LOCKED');
    expect(reset.clipboardUnlocked).toBe(false);
    expect(reset.clozeSolved).toBe(false);
    expect(reset.typeAlongSolved).toBe(false);
  });

  it('validates ClozeChallenge schema constraints and penalty cooldown invariants', () => {
    const mockCloze: ClozeChallengeDTO = {
      challengeId: 'c1111111-1111-1111-1111-111111111111',
      cardId: '00000000-0000-0000-0000-000000000002',
      maskedSnippet: 'if (ptr != {BLANK_0}) { {BLANK_1}(ptr); }',
      blanks: [
        {
          id: 'b0',
          index: 0,
          token: 'NULL',
          hint: 'Konstanta pointer nol',
          distractors: ['0', 'false', 'undefined'],
          category: 'keyword',
          unmasked: false,
        },
        {
          id: 'b1',
          index: 1,
          token: 'free',
          hint: 'Fungsi dealokasi memori heap glibc',
          distractors: ['delete', 'release', 'drop'],
          category: 'method_call',
          unmasked: false,
        },
      ],
      unmaskMode: 'sequential',
      maxAttemptsPerBlank: 3,
      penaltyCooldownMs: 1500,
      revealAfterFailures: true,
    };

    expect(mockCloze.penaltyCooldownMs).toBe(1500);
    expect(mockCloze.blanks.length).toBe(2);
    expect(mockCloze.blanks[0]?.distractors.length).toBeGreaterThanOrEqual(2);
  });

  it('validates TypeAlongPractice schema constraints: strict allowPaste: false', () => {
    const mockPractice: TypeAlongPracticeDTO = {
      practiceId: '11111111-1111-1111-1111-111111111111',
      cardId: '00000000-0000-0000-0000-000000000002',
      prompt: 'Ketik sintaks penanganan pointer aman secara manual',
      targetKeystrokes: 'if (ptr != NULL) { free(ptr); ptr = NULL; }',
      languageId: 'c',
      minAccuracyPercent: 90.0,
      maxAllowedErrors: 2,
      allowPaste: false,
      caseSensitive: true,
    };

    expect(mockPractice.allowPaste).toBe(false);
    expect(mockPractice.minAccuracyPercent).toBeGreaterThanOrEqual(90.0);
  });
});
