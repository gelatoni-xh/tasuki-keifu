export type SeoTier = "primary" | "secondary" | "thin";

const organizationFallbackSlugPattern = /^(hs|jhs|club|univ)-/;

export function isOpaquePlayerSlug(slug: string) {
  return slug.startsWith("person-");
}

export function isFallbackOrganizationSlug(slug: string) {
  return organizationFallbackSlugPattern.test(slug);
}

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

export function shouldIndexPlayerPage({
  slug,
  memberships,
  personalBests,
  results,
}: {
  slug: string;
  memberships: number;
  personalBests: number;
  results: number;
}) {
  const seoTier = getPlayerSeoTier({ memberships, personalBests, results });
  if (isIndexableSeoTier(seoTier)) {
    return true;
  }

  if (isOpaquePlayerSlug(slug)) {
    return false;
  }

  return memberships >= 1 || personalBests >= 1 || results >= 1;
}

export function shouldIndexOrganizationPage({
  slug,
  memberships,
  raceResults,
  teamResults,
}: {
  slug: string;
  memberships: number;
  raceResults: number;
  teamResults: number;
}) {
  const seoTier = getOrganizationSeoTier({ memberships, raceResults, teamResults });
  if (isIndexableSeoTier(seoTier)) {
    return true;
  }

  if (isFallbackOrganizationSlug(slug)) {
    return false;
  }

  return memberships >= 1 || raceResults >= 1 || teamResults >= 1;
}

export function shouldIndexCompetitionPage({
  raceCount,
  resultCount,
  teamResultCount,
}: {
  raceCount: number;
  resultCount: number;
  teamResultCount: number;
}) {
  const seoTier = getCompetitionSeoTier({ raceCount, resultCount, teamResultCount });
  if (isIndexableSeoTier(seoTier)) {
    return true;
  }

  return resultCount >= 1 || teamResultCount >= 1;
}
