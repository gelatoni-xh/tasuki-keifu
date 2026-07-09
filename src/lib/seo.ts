export type SeoTier = "primary" | "secondary" | "thin";

export function getPlayerSeoTier({
  memberships,
  personalBests,
  results,
}: {
  memberships: number;
  personalBests: number;
  results: number;
}): SeoTier {
  if (results >= 5 || memberships >= 3 || personalBests >= 3) {
    return "primary";
  }

  if ((results >= 2 && memberships >= 1) || personalBests >= 1 || memberships >= 2) {
    return "secondary";
  }

  return "thin";
}

export function getOrganizationSeoTier({
  memberships,
  raceResults,
  teamResults,
}: {
  memberships: number;
  raceResults: number;
  teamResults: number;
}): SeoTier {
  if (memberships >= 15 || raceResults >= 28 || teamResults >= 4) {
    return "primary";
  }

  if (memberships >= 6 || raceResults >= 7 || teamResults >= 1) {
    return "secondary";
  }

  return "thin";
}

export function getCompetitionSeoTier({
  raceCount,
  resultCount,
  teamResultCount,
}: {
  raceCount: number;
  resultCount: number;
  teamResultCount: number;
}): SeoTier {
  if (raceCount >= 6 && resultCount >= 100 && teamResultCount >= 1) {
    return "primary";
  }

  if (resultCount >= 10 || raceCount >= 2) {
    return "secondary";
  }

  return "thin";
}

export function isIndexableSeoTier(seoTier: SeoTier) {
  return seoTier !== "thin";
}
