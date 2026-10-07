import { z } from 'zod';

export const HighlightLinePayloadSchema = z.object({
  fileUri: z.string().min(1, 'fileUri is required'),
  line: z.number().int().positive('line must be a positive 1-indexed number'),
  endLine: z.number().int().positive().optional(),
});
export type HighlightLinePayload = z.infer<typeof HighlightLinePayloadSchema>;

export const RequestAnalysisPayloadSchema = z.object({
  rawError: z.string().optional(),
});
export type RequestAnalysisPayload = z.infer<typeof RequestAnalysisPayloadSchema>;

export const PracticeCompletedPayloadSchema = z.object({
  cardId: z.string().min(1, 'cardId is required'),
  accuracy: z.number().min(0).max(100),
});
export type PracticeCompletedPayload = z.infer<typeof PracticeCompletedPayloadSchema>;

export const CollapseScreenBPayloadSchema = z.record(z.unknown()).optional();
export type CollapseScreenBPayload = z.infer<typeof CollapseScreenBPayloadSchema>;

export const SocraticAdvanceLevelPayloadSchema = z.object({
  challengeId: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  optionId: z.string().optional(),
});
export type SocraticAdvanceLevelPayload = z.infer<typeof SocraticAdvanceLevelPayloadSchema>;

export const WebviewToExtensionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HIGHLIGHT_LINE'),
    payload: HighlightLinePayloadSchema,
  }),
  z.object({
    type: z.literal('REQUEST_ANALYSIS'),
    payload: RequestAnalysisPayloadSchema.optional(),
  }),
  z.object({
    type: z.literal('PRACTICE_COMPLETED'),
    payload: PracticeCompletedPayloadSchema,
  }),
  z.object({
    type: z.literal('COLLAPSE_SCREEN_B'),
    payload: CollapseScreenBPayloadSchema,
  }),
  z.object({
    type: z.literal('SOCRATIC_ADVANCE_LEVEL'),
    payload: SocraticAdvanceLevelPayloadSchema,
  }),
]);
export type WebviewToExtensionMessage = z.infer<typeof WebviewToExtensionMessageSchema>;

export const SetActiveFilePayloadSchema = z.object({
  fileUri: z.string().min(1),
  languageId: z.string().min(1),
});
export type SetActiveFilePayload = z.infer<typeof SetActiveFilePayloadSchema>;

export const WatchdogStatusPayloadSchema = z.object({
  connected: z.boolean(),
  latencyMs: z.number().nonnegative(),
});
export type WatchdogStatusPayload = z.infer<typeof WatchdogStatusPayloadSchema>;

export const ThemeTypeSchema = z.enum(['dark', 'light', 'hc-black', 'hc-light']);
export type ThemeType = z.infer<typeof ThemeTypeSchema>;

export const ThemeTokensPayloadSchema = z.object({
  themeId: z.string().min(1),
  themeType: ThemeTypeSchema,
  tokens: z.record(z.string()),
});
export type ThemeTokensPayload = z.infer<typeof ThemeTokensPayloadSchema>;

export const ExtensionToWebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SET_ACTIVE_FILE'),
    payload: SetActiveFilePayloadSchema,
  }),
  z.object({
    type: z.literal('CLEAR_HIGHLIGHTS'),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('DIAGNOSTIC_DATA'),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('WATCHDOG_STATUS'),
    payload: WatchdogStatusPayloadSchema,
  }),
  z.object({
    type: z.literal('THEME_CHANGED'),
    payload: ThemeTokensPayloadSchema,
  }),
  z.object({
    type: z.literal('SOCRATIC_LADDER_UPDATE'),
    payload: z.unknown(),
  }),
]);
export type ExtensionToWebviewMessage = z.infer<typeof ExtensionToWebviewMessageSchema>;

export type AntislopWebviewMessage =
  | WebviewToExtensionMessage
  | ExtensionToWebviewMessage;
