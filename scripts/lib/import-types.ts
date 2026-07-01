import { z } from "zod";

export const raceEntryPbSchema = z.object({
  discipline: z.string(),
  mark: z.string().min(1),
});

export const teamSnapshotSchema = z.object({
  leg: z.number().int().positive(),
  cumulativeRank: z.number().int().positive().nullable(),
  cumulativeMark: z.string().min(1).nullable(),
  gapFromLeader: z.string().min(1).nullable(),
  notes: z.string().nullable().optional(),
});

export const teamResultSchema = z.object({
  organizationSlug: z.string().min(1),
  organizationNameJa: z.string().min(1),
  organizationType: z.enum(["university", "high_school", "club", "corporate_team"]).default("university"),
  organizationPrefecture: z.string().min(1).nullable().optional(),
  finalRank: z.number().int().positive().nullable().optional(),
  finalMark: z.string().min(1).nullable().optional(),
  notes: z.string().nullable().optional(),
  snapshot: teamSnapshotSchema,
});

export const raceEntrySchema = z.object({
  slug: z.string().min(1),
  displayNameJa: z.string().min(1),
  displayNameKana: z.string().min(1).nullable().optional(),
  displayNameRoman: z.string().min(1).nullable().optional(),
  raceOrganizationSlug: z.string().min(1),
  raceOrganizationNameJa: z.string().min(1),
  raceOrganizationType: z.enum(["university", "high_school", "club", "corporate_team"]).default("university"),
  raceOrganizationPrefecture: z.string().min(1).nullable().optional(),
  universitySlug: z.string().min(1).nullable().optional(),
  universityNameJa: z.string().min(1).nullable().optional(),
  highSchoolSlug: z.string().min(1).nullable().optional(),
  highSchoolNameJa: z.string().min(1).nullable().optional(),
  highSchoolPrefecture: z.string().min(1).nullable().optional(),
  grade: z.number().int().min(1).max(10).nullable().optional(),
  mark: z.string().min(1),
  rank: z.number().int().positive().nullable(),
  teamRank: z.number().int().positive().nullable().optional(),
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
  teamResults: z.array(teamResultSchema).default([]),
});

export type RaceImportPayload = z.infer<typeof raceImportPayloadSchema>;
