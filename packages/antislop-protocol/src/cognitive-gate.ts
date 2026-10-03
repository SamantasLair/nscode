import { z } from 'zod';
import { TextSpanRangeSchema, type TextSpanRange } from './error-anatomy.js';
import { TargetLanguageSchema, type TargetLanguage } from './smart-card.js';

export const BlankTokenCategorySchema = z.enum([
  'keyword',
  'type',
  'operator',
  'boundary_check',
  'method_call',
  'variable_binding',
]);
export type BlankTokenCategory = z.infer<typeof BlankTokenCategorySchema>;

export const ClozeBlankSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  token: z.string().min(1, 'token cannot be empty'),
  hint: z.string().min(3, 'hint is required'),
  distractors: z.array(z.string().min(1)).min(2, 'Must provide at least 2 distractors'),
  category: BlankTokenCategorySchema,
  range: TextSpanRangeSchema.optional(),
  unmasked: z.boolean().default(false),
});
export type ClozeBlankDTO = z.infer<typeof ClozeBlankSchema>;

export const ClozeChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  cardId: z.string().uuid(),
  maskedSnippet: z.string().min(5, 'maskedSnippet is required'),
  blanks: z.array(ClozeBlankSchema).min(1, 'Cloze must contain at least 1 blank'),
  unmaskMode: z.enum(['sequential', 'free_order']).default('sequential'),
  maxAttemptsPerBlank: z.number().int().min(1).default(3),
  penaltyCooldownMs: z.number().int().min(500).default(1500),
  revealAfterFailures: z.boolean().default(true),
});
export type ClozeChallengeDTO = z.infer<typeof ClozeChallengeSchema>;

export const TypeAlongPracticeSchema = z.object({
  practiceId: z.string().uuid(),
  cardId: z.string().uuid(),
  prompt: z.string().min(5, 'prompt is required'),
  targetKeystrokes: z.string().min(5, 'targetKeystrokes must be a non-trivial code sequence'),
  languageId: z.lazy(() => TargetLanguageSchema),
  minAccuracyPercent: z.number().min(80.0).max(100.0).default(95.0),
  maxAllowedErrors: z.number().int().nonnegative().default(3),
  allowPaste: z.literal(false), // Strict anti-paste invariant
  caseSensitive: z.boolean().default(true),
});
export type TypeAlongPracticeDTO = z.infer<typeof TypeAlongPracticeSchema>;

export const TypeAlongSubmissionSchema = z.object({
  practiceId: z.string().uuid(),
  cardId: z.string().uuid(),
  typedKeystrokes: z.string(),
  accuracyPercent: z.number().min(0).max(100),
  errorCount: z.number().int().nonnegative(),
  elapsedMs: z.number().int().positive(),
  wpm: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
export type TypeAlongSubmissionDTO = z.infer<typeof TypeAlongSubmissionSchema>;

export const GateSessionStatusSchema = z.enum([
  'LOCKED',
  'CLOZE_PENDING',
  'CLOZE_PASSED',
  'TYPE_ALONG_PENDING',
  'TYPE_ALONG_PASSED',
  'UNLOCKED',
]);
export type GateSessionStatus = z.infer<typeof GateSessionStatusSchema>;

/**
 * Standard minimum accuracy percentage threshold required to complete Type-Along practice
 */
export const MIN_TYPE_ALONG_ACCURACY_PERCENT = 90.0;

export const CognitiveFrictionSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    cardId: z.string().uuid(),
    status: GateSessionStatusSchema,
    clozeSolved: z.boolean(),
    typeAlongSolved: z.boolean(),
    clipboardUnlocked: z.boolean(),
    directAutoPatchAllowed: z.literal(false), // Inviolable Golden Invariant
    clozeAttempts: z.number().int().nonnegative().default(0),
    typeAlongAccuracy: z.number().min(0).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    // Invariant 1: Clipboard can ONLY be unlocked if status is UNLOCKED
    if (data.clipboardUnlocked && data.status !== 'UNLOCKED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clipboardUnlocked can only be true when status is UNLOCKED',
        path: ['clipboardUnlocked'],
      });
    }

    // Invariant 2: Status UNLOCKED requires at least one cognitive challenge to be solved
    if (data.status === 'UNLOCKED') {
      if (!data.clozeSolved && !data.typeAlongSolved) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'status UNLOCKED requires clozeSolved or typeAlongSolved to be true',
          path: ['status'],
        });
      }
      // Invariant 3: Status UNLOCKED requires clipboardUnlocked to be true
      if (!data.clipboardUnlocked) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'status UNLOCKED requires clipboardUnlocked to be true',
          path: ['clipboardUnlocked'],
        });
      }
    }
  });
export type CognitiveFrictionSessionDTO = z.infer<typeof CognitiveFrictionSessionSchema>;

export type GateTransitionEvent =
  | { type: 'START_CLOZE' }
  | { type: 'CLOZE_COMPLETED' }
  | { type: 'START_TYPE_ALONG' }
  | { type: 'TYPE_ALONG_COMPLETED'; accuracyPercent: number; minAccuracyPercent?: number }
  | { type: 'RESET' };

/**
 * State machine transition function enforcing valid cognitive gate progression.
 * Allows independent unlocking via either Cloze challenge OR Type-Along practice mode (or both).
 * Enforces accuracy threshold (default >= 90%) upon Type-Along completion.
 */
export function transitionGateSession(
  current: CognitiveFrictionSessionDTO,
  event: GateTransitionEvent
): CognitiveFrictionSessionDTO {
  switch (event.type) {
    case 'START_CLOZE':
      if (
        current.status === 'LOCKED' ||
        current.status === 'UNLOCKED' ||
        current.status === 'TYPE_ALONG_PASSED'
      ) {
        return {
          ...current,
          status: 'CLOZE_PENDING',
          clipboardUnlocked: false,
        };
      }
      return current;

    case 'CLOZE_COMPLETED':
      if (current.status === 'CLOZE_PENDING' || current.status === 'CLOZE_PASSED') {
        return {
          ...current,
          status: 'UNLOCKED',
          clozeSolved: true,
          clipboardUnlocked: true,
          directAutoPatchAllowed: false,
        };
      }
      return current;

    case 'START_TYPE_ALONG':
      if (
        current.status === 'LOCKED' ||
        current.status === 'CLOZE_PASSED' ||
        current.status === 'UNLOCKED'
      ) {
        return {
          ...current,
          status: 'TYPE_ALONG_PENDING',
          clipboardUnlocked: false,
        };
      }
      return current;

    case 'TYPE_ALONG_COMPLETED':
      if (current.status === 'TYPE_ALONG_PENDING') {
        const threshold = event.minAccuracyPercent ?? MIN_TYPE_ALONG_ACCURACY_PERCENT;
        if (event.accuracyPercent >= threshold) {
          return {
            ...current,
            status: 'UNLOCKED',
            typeAlongSolved: true,
            typeAlongAccuracy: event.accuracyPercent,
            clipboardUnlocked: true,
            directAutoPatchAllowed: false,
          };
        }
        // Below accuracy threshold: retain TYPE_ALONG_PENDING and clipboard locked
        return {
          ...current,
          status: 'TYPE_ALONG_PENDING',
          typeAlongSolved: false,
          typeAlongAccuracy: event.accuracyPercent,
          clipboardUnlocked: false,
          directAutoPatchAllowed: false,
        };
      }
      return current;

    case 'RESET':
      return {
        ...current,
        status: 'LOCKED',
        clozeSolved: false,
        typeAlongSolved: false,
        clipboardUnlocked: false,
        directAutoPatchAllowed: false,
        clozeAttempts: 0,
        typeAlongAccuracy: undefined,
      };

    default:
      return current;
  }
}
