/** Explicit user exclusions; source documents may remain as profile evidence. */
export function assertCompetitionImportInScope(input: {
  competitionSlug?: string;
  editionSlugs?: string[];
  raceSlugs?: string[];
  sourceId?: string;
}) {
  const excluded = input.competitionSlug === "hakone-qualifier"
    || input.editionSlugs?.includes("hakone-qualifier-103")
    || input.raceSlugs?.some(slug => slug === "hakone-qualifier-103" || slug.startsWith("hakone-qualifier-103-"))
    || input.sourceId === "source-hakone-103-qualifier-official";
  if (excluded) {
    throw new Error("Hakone qualifier competition import is out of scope and was explicitly withdrawn by the owner. Do not recreate its events or exclusive people.");
  }
}
