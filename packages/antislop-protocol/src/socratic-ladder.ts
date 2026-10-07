import { z } from 'zod';
import { ClozeBlankSchema, type ClozeBlankDTO } from './cognitive-gate.js';

export const SocraticLadderLevelKeySchema = z.enum([
  'reflection',
  'invariant',
  'blueprint',
  'cloze',
]);
export type SocraticLadderLevelKey = z.infer<typeof SocraticLadderLevelKeySchema>;

export const SocraticOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
  feedback: z.string().optional(),
});
export type SocraticOption = z.infer<typeof SocraticOptionSchema>;

export const SocraticReflectionStepSchema = z.object({
  level: z.literal(1),
  type: z.literal('reflection'),
  title: z.string().min(1),
  prompt: z.string().min(1),
  targetSymbol: z.string().min(1),
  astNodeType: z.string().optional(),
  scopeContext: z.string().optional(),
  options: z.array(SocraticOptionSchema).min(2),
  hint: z.string().min(1),
  completed: z.boolean().default(false),
  selectedOptionId: z.string().nullable().default(null),
});
export type SocraticReflectionStep = z.infer<typeof SocraticReflectionStepSchema>;

export const SocraticInvariantStepSchema = z.object({
  level: z.literal(2),
  type: z.literal('invariant'),
  title: z.string().min(1),
  rule: z.string().min(1),
  precondition: z.string().min(1),
  postcondition: z.string().min(1),
  formalProof: z.string().optional(),
  violationConsequence: z.string().optional(),
  options: z.array(SocraticOptionSchema).min(2),
  hint: z.string().min(1),
  completed: z.boolean().default(false),
  selectedOptionId: z.string().nullable().default(null),
});
export type SocraticInvariantStep = z.infer<typeof SocraticInvariantStepSchema>;

export const SocraticBlueprintStepSchema = z.object({
  level: z.literal(3),
  type: z.literal('blueprint'),
  title: z.string().min(1),
  paradigmShift: z.string().min(1),
  algorithmicStrategy: z.string().min(1),
  pseudocode: z.string().min(1),
  options: z.array(SocraticOptionSchema).min(2),
  hint: z.string().min(1),
  completed: z.boolean().default(false),
  selectedOptionId: z.string().nullable().default(null),
});
export type SocraticBlueprintStep = z.infer<typeof SocraticBlueprintStepSchema>;

export const SocraticClozeStepSchema = z.object({
  level: z.literal(4),
  type: z.literal('cloze'),
  title: z.string().min(1),
  maskedSnippet: z.string().min(1),
  blanks: z.array(ClozeBlankSchema).min(1),
  hint: z.string().min(1),
  completed: z.boolean().default(false),
});
export type SocraticClozeStep = z.infer<typeof SocraticClozeStepSchema>;

export const SocraticLadderSessionSchema = z
  .object({
    challengeId: z.string().min(1),
    diffId: z.string().min(1),
    filePath: z.string().min(1),
    category: z.string().min(1),
    currentLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    isFullyUnlocked: z.boolean(),
    directAutoPatchAllowed: z.literal(false), // Golden Invariant
    levels: z.object({
      reflection: SocraticReflectionStepSchema,
      invariant: SocraticInvariantStepSchema,
      blueprint: SocraticBlueprintStepSchema,
      cloze: SocraticClozeStepSchema,
    }),
  })
  .superRefine((data, ctx) => {
    // Invariant: isFullyUnlocked requires all 4 steps to be completed
    if (data.isFullyUnlocked) {
      const allCompleted =
        data.levels.reflection.completed &&
        data.levels.invariant.completed &&
        data.levels.blueprint.completed &&
        data.levels.cloze.completed;
      if (!allCompleted) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'isFullyUnlocked cannot be true until all 4 scaffolding levels are completed',
          path: ['isFullyUnlocked'],
        });
      }
    }
  });
export type SocraticLadderSessionDTO = z.infer<typeof SocraticLadderSessionSchema>;

export type SocraticLadderTransitionEvent =
  | {
      type: 'ANSWER_OPTION';
      level: 1 | 2 | 3;
      optionId: string;
    }
  | {
      type: 'SOLVE_CLOZE';
    }
  | {
      type: 'SET_LEVEL';
      level: 1 | 2 | 3 | 4;
    }
  | {
      type: 'RESET';
    };

export function transitionSocraticLadder(
  session: SocraticLadderSessionDTO,
  event: SocraticLadderTransitionEvent
): { session: SocraticLadderSessionDTO; success: boolean; feedback?: string } {
  switch (event.type) {
    case 'ANSWER_OPTION': {
      if (event.level === 1) {
        const step = session.levels.reflection;
        const opt = step.options.find((o) => o.id === event.optionId);
        if (!opt) return { session, success: false, feedback: 'Option not found' };

        const updatedStep = {
          ...step,
          selectedOptionId: opt.id,
          completed: opt.isCorrect,
        };
        const nextLevel = opt.isCorrect ? ((Math.max(session.currentLevel, 2) as 2 | 3 | 4)) : session.currentLevel;
        const updatedSession: SocraticLadderSessionDTO = {
          ...session,
          currentLevel: nextLevel,
          levels: {
            ...session.levels,
            reflection: updatedStep,
          },
        };
        return {
          session: updatedSession,
          success: opt.isCorrect,
          feedback: opt.feedback || opt.explanation,
        };
      }

      if (event.level === 2) {
        const step = session.levels.invariant;
        const opt = step.options.find((o) => o.id === event.optionId);
        if (!opt) return { session, success: false, feedback: 'Option not found' };

        const updatedStep = {
          ...step,
          selectedOptionId: opt.id,
          completed: opt.isCorrect,
        };
        const nextLevel = opt.isCorrect ? ((Math.max(session.currentLevel, 3) as 3 | 4)) : session.currentLevel;
        const updatedSession: SocraticLadderSessionDTO = {
          ...session,
          currentLevel: nextLevel,
          levels: {
            ...session.levels,
            invariant: updatedStep,
          },
        };
        return {
          session: updatedSession,
          success: opt.isCorrect,
          feedback: opt.feedback || opt.explanation,
        };
      }

      if (event.level === 3) {
        const step = session.levels.blueprint;
        const opt = step.options.find((o) => o.id === event.optionId);
        if (!opt) return { session, success: false, feedback: 'Option not found' };

        const updatedStep = {
          ...step,
          selectedOptionId: opt.id,
          completed: opt.isCorrect,
        };
        const nextLevel = opt.isCorrect ? (4 as const) : session.currentLevel;
        const updatedSession: SocraticLadderSessionDTO = {
          ...session,
          currentLevel: nextLevel,
          levels: {
            ...session.levels,
            blueprint: updatedStep,
          },
        };
        return {
          session: updatedSession,
          success: opt.isCorrect,
          feedback: opt.feedback || opt.explanation,
        };
      }

      return { session, success: false };
    }

    case 'SOLVE_CLOZE': {
      const updatedCloze = {
        ...session.levels.cloze,
        completed: true,
      };
      const allCompleted =
        session.levels.reflection.completed &&
        session.levels.invariant.completed &&
        session.levels.blueprint.completed &&
        true;

      const updatedSession: SocraticLadderSessionDTO = {
        ...session,
        isFullyUnlocked: allCompleted,
        levels: {
          ...session.levels,
          cloze: updatedCloze,
        },
      };
      return {
        session: updatedSession,
        success: true,
        feedback: 'Socratic Cognitive Ladder completely unlocked!',
      };
    }

    case 'SET_LEVEL': {
      // Can only navigate to level <= current unlocked maximum level
      const maxAvailable = session.levels.blueprint.completed
        ? 4
        : session.levels.invariant.completed
        ? 3
        : session.levels.reflection.completed
        ? 2
        : 1;

      if (event.level <= maxAvailable) {
        return {
          session: {
            ...session,
            currentLevel: event.level,
          },
          success: true,
        };
      }
      return { session, success: false, feedback: 'Prerequisite level not yet completed' };
    }

    case 'RESET': {
      return {
        session: {
          ...session,
          currentLevel: 1,
          isFullyUnlocked: false,
          levels: {
            reflection: { ...session.levels.reflection, completed: false, selectedOptionId: null },
            invariant: { ...session.levels.invariant, completed: false, selectedOptionId: null },
            blueprint: { ...session.levels.blueprint, completed: false, selectedOptionId: null },
            cloze: { ...session.levels.cloze, completed: false },
          },
        },
        success: true,
      };
    }

    default:
      return { session, success: false };
  }
}
