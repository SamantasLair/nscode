import { z } from 'zod';

export const BridgeWireCoordinatesSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  active: z.boolean().optional(),
  strokeWidth: z.number().optional(),
  colorVar: z.string().optional(),
});
export type BridgeWireCoordinates = z.infer<typeof BridgeWireCoordinatesSchema>;

export const BridgeWireSplinePathSchema = z.object({
  path: z.string(),
  length: z.number(),
  tension: z.number(),
});
export type BridgeWireSplinePath = z.infer<typeof BridgeWireSplinePathSchema>;

export interface BridgeWireSplineCalculation {
  path: string;
  length: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
}

export function computeBridgeWireSpline(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tension?: number
): BridgeWireSplineCalculation {
  const dx = x2 - x1;
  const t = tension ?? Math.max(0.2, Math.min(0.6, Math.abs(dx) / 400));
  const cx1 = x1 + dx * t;
  const cy1 = y1;
  const cx2 = x2 - dx * t;
  const cy2 = y2;
  const path = `M ${x1},${y1} C ${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;

  // Numerical approximation of cubic Bezier curve arc length
  let length = 0;
  let prevX = x1;
  let prevY = y1;
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const stepT = i / steps;
    const invT = 1 - stepT;
    const curX =
      invT * invT * invT * x1 +
      3 * invT * invT * stepT * cx1 +
      3 * invT * stepT * stepT * cx2 +
      stepT * stepT * stepT * x2;
    const curY =
      invT * invT * invT * y1 +
      3 * invT * invT * stepT * cy1 +
      3 * invT * stepT * stepT * cy2 +
      stepT * stepT * stepT * y2;
    length += Math.hypot(curX - prevX, curY - prevY);
    prevX = curX;
    prevY = curY;
  }

  return {
    path,
    length: Math.round(length * 100) / 100,
    cx1,
    cy1,
    cx2,
    cy2,
  };
}

export const FalsificationDomainSchema = z.enum([
  'null_undefined',
  'empty_container',
  'numeric_boundary',
  'type_mismatch',
  'reentrancy',
  'async_race',
]);
export type FalsificationDomain = z.infer<typeof FalsificationDomainSchema>;

export const FalsificationExpectedOutcomeSchema = z.enum([
  'throw_handled',
  'throw_unhandled',
  'fallback_return',
  'infinite_hang',
  'silent_corruption',
]);
export type FalsificationExpectedOutcome = z.infer<typeof FalsificationExpectedOutcomeSchema>;

export const FalsificationCaseSchema = z.object({
  id: z.string(),
  domain: FalsificationDomainSchema,
  inputDescription: z.string(),
  testValue: z.any(),
  expectedOutcome: FalsificationExpectedOutcomeSchema,
  rationale: z.string(),
});
export type FalsificationCase = z.infer<typeof FalsificationCaseSchema>;

export const PopperGateReportSchema = z.object({
  targetSymbol: z.string(),
  paramSignatures: z.array(z.string()),
  boundaryCases: z.array(FalsificationCaseSchema),
  cognitiveScore: z.number().min(0).max(100),
  passesPopperFalsification: z.boolean(),
});
export type PopperGateReport = z.infer<typeof PopperGateReportSchema>;

export const MaieuticPhaseSchema = z.enum(['probe', 'invariant', 'synthesis', 'resolution']);
export type MaieuticPhase = z.infer<typeof MaieuticPhaseSchema>;

export const MaieuticContextEnvelopeSchema = z.object({
  symbol: z.string(),
  lineNumber: z.number(),
  diagnosticCode: z.string().optional(),
  diagnosticMessage: z.string().optional(),
  userStatement: z.string(),
});
export type MaieuticContextEnvelope = z.infer<typeof MaieuticContextEnvelopeSchema>;

export const MaieuticResponseSchema = z.object({
  phase: MaieuticPhaseSchema,
  dialecticQuestion: z.string(),
  antiSpoonfeedAssertion: z.literal(true),
  suggestedReflection: z.string(),
});
export type MaieuticResponse = z.infer<typeof MaieuticResponseSchema>;
