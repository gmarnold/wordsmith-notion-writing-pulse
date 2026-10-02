import { z } from "zod";

export const notionRootTypeSchema = z.enum(["page", "database"]);
export type NotionRootType = z.infer<typeof notionRootTypeSchema>;

export const manuscriptSourceSchema = z.object({
  id: z.string(),
  manuscriptId: z.string().optional(),
  notionPageId: z.string(),
  title: z.string(),
  included: z.boolean(),
  sortOrder: z.number().int().nullable(),
  wordCount: z.number().int().nonnegative().optional(),
});

export const manuscriptSchema = z.object({
  id: z.string(),
  name: z.string(),
  notionRootId: z.string(),
  notionRootType: notionRootTypeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  sources: z.array(manuscriptSourceSchema).default([]),
});

export const inspectRequestSchema = z.object({
  notionUrlOrId: z.string().min(1),
});

export const createManuscriptRequestSchema = z.object({
  name: z.string().min(1).max(200),
  notionRootId: z.string().min(1),
  notionRootType: notionRootTypeSchema,
  sources: z
    .array(
      z.object({
        notionPageId: z.string().min(1),
        title: z.string().min(1),
        included: z.boolean().default(true),
        sortOrder: z.number().int().nullable().default(null),
      }),
    )
    .min(1),
});

export const syncStatusSchema = z.enum(["running", "success", "partial_failure", "failed"]);

export const syncRunSchema = z.object({
  id: z.string(),
  manuscriptId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  status: syncStatusSchema,
  errorSummary: z.string().nullable(),
});

export const statsSchema = z.object({
  timezone: z.string(),
  manuscriptId: z.string(),
  manuscriptName: z.string(),
  totalWords: z.number().int(),
  previousTotalWords: z.number().int().nullable(),
  deltaSincePreviousSync: z.number().int().nullable(),
  netWordsToday: z.number().int(),
  netChangeThisWeek: z.number().int(),
  netChangeThisMonth: z.number().int(),
  lastSyncedAt: z.string().nullable(),
  chapters: z.array(
    z.object({
      sourceId: z.string(),
      title: z.string(),
      wordCount: z.number().int(),
    }),
  ),
  recentSyncs: z.array(
    z.object({
      syncRunId: z.string(),
      capturedAt: z.string(),
      totalWords: z.number().int(),
      delta: z.number().int().nullable(),
    }),
  ),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type Manuscript = z.infer<typeof manuscriptSchema>;
export type ManuscriptSource = z.infer<typeof manuscriptSourceSchema>;
export type InspectRequest = z.infer<typeof inspectRequestSchema>;
export type CreateManuscriptRequest = z.infer<typeof createManuscriptRequestSchema>;
export type SyncRun = z.infer<typeof syncRunSchema>;
export type Stats = z.infer<typeof statsSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export const settingsSchema = z.object({
  timezone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Use an IANA timezone")
    .default("UTC"),
  goals: z
    .object({
      DAILY: z.number().int().positive().nullable(),
      WEEKLY: z.number().int().positive().nullable(),
      MONTHLY: z.number().int().positive().nullable(),
      TOTAL: z.number().int().positive().nullable(),
    })
    .default({ DAILY: null, WEEKLY: null, MONTHLY: null, TOTAL: null }),
  wordCountPropertyId: z.string().nullable().default(null),
  lastCountedPropertyId: z.string().nullable().default(null),
});
export type Settings = z.infer<typeof settingsSchema>;
