export function getEkidenAwards(notes: string | null) {
  const tokens = (notes ?? "").split("/").map((token) => token.trim());
  if (tokens.includes("OP")) return [];
  const awards: Array<"sectionWinner" | "sectionRecord" | "sectionRecordTie"> = [];
  if (tokens.includes("区間賞")) awards.push("sectionWinner");
  if (tokens.some((token) => token === "区間新" || token === "区間新記録")) awards.push("sectionRecord");
  if (awards.length && tokens.includes("区間タイ")) awards.push("sectionRecordTie");
  return awards;
}

type RankedEdition = {
  teamCompetitionResults: Array<{
    finalRank: number | null;
    notes: string | null;
    organization: { slug: string; nameJa: string };
  }>;
};

export function rankFeaturedTeams(editions: RankedEdition[]) {
  const teams = new Map<string, { slug: string; nameJa: string; points: number; ranks: number[] }>();
  editions.forEach((edition, index) => {
    edition.teamCompetitionResults.forEach(({ finalRank, notes, organization }) => {
      if (!finalRank || finalRank < 1 || finalRank > 5 || notes?.split("/").some((token) => token.trim() === "OP")) return;
      const team = teams.get(organization.slug) ?? {
        ...organization,
        points: 0,
        ranks: Array<number>(editions.length).fill(Infinity),
      };
      team.points += (5 - index) * (6 - finalRank);
      team.ranks[index] = finalRank;
      teams.set(team.slug, team);
    });
  });
  return [...teams.values()].sort((left, right) => {
    if (left.points !== right.points) return right.points - left.points;
    for (let index = 0; index < editions.length; index++) {
      if (left.ranks[index] !== right.ranks[index]) return left.ranks[index] - right.ranks[index];
    }
    return left.slug.localeCompare(right.slug);
  }).slice(0, 5).map(({ slug, nameJa, points }) => ({ slug, nameJa, points }));
}
