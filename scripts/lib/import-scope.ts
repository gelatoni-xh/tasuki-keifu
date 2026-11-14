/** Explicit user exclusions; source documents may remain as profile evidence. */
export function assertCompetitionImportInScope(input: {
  competitionSlug?: string;
  editionSlugs?: string[];
  raceSlugs?: string[];
  raceNames?: string[];
  sourceId?: string;
}) {
  const femaleRace = [...(input.raceSlugs ?? []), ...(input.raceNames ?? [])]
    .some(value => /女子|\bwomen(?:['’]?s)?\b|\bfemales?\b/i.test(value));
  const excluded = input.competitionSlug === "hakone-qualifier"
    || input.editionSlugs?.includes("hakone-qualifier-103")
    || input.raceSlugs?.some(slug => slug === "hakone-qualifier-103" || slug.startsWith("hakone-qualifier-103-"))
    || input.sourceId === "source-hakone-103-qualifier-official"
    || femaleRace;
  if (excluded) {
    if (femaleRace) {
      throw new Error("Women's race imports are currently out of scope. Do not bootstrap women's events or import their results.");
    }
    throw new Error("Hakone qualifier competition import is out of scope and was explicitly withdrawn by the owner. Do not recreate its events or exclusive people.");
  }
}
