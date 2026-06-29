import { z } from "zod";

export const raceEntryPbSchema = z.object({
  discipline: z.string(),
  mark: z.string().min(1),
});

export const raceEntrySchema = z.object({
  slug: z.string().min(1),
  displayNameJa: z.string().min(1),
  displayNameRoman: z.string().min(1),
  universitySlug: z.string().min(1),
  highSchoolSlug: z.string().min(1),
  grade: z.number().int().min(1).max(10),
  mark: z.string().min(1),
  rank: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  pbs: z.array(raceEntryPbSchema).default([]),
  sourceEntityKey: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
});

export const raceImportPayloadSchema = z.object({
  batchKey: z.string().min(1),
  sourceId: z.string().min(1),
  raceSlug: z.string().min(1),
  summary: z.string().min(1),
  pbNotes: z.string().min(1),
  entries: z.array(raceEntrySchema).min(1),
});

export type RaceImportPayload = z.infer<typeof raceImportPayloadSchema>;
