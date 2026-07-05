import type { CompetitionType } from "@prisma/client";

export const publicCompetitionTypes: CompetitionType[] = [
  "university_ekiden",
  "high_school_ekiden",
  "corporate_ekiden",
  "mixed_ekiden",
  "track_meet",
  "road_race",
  "marathon",
];

export function isPublicCompetitionType(type: CompetitionType | null | undefined) {
  if (!type) {
    return false;
  }

  return publicCompetitionTypes.includes(type);
}
