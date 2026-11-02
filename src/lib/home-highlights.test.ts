import assert from "node:assert/strict";
import test from "node:test";
import { getEkidenAwards, rankFeaturedTeams } from "./home-highlights";

test("recognizes both record spellings and keeps record holders without a win", () => {
  assert.deepEqual(getEkidenAwards("区間新記録"), ["sectionRecord"]);
  assert.deepEqual(getEkidenAwards("区間新"), ["sectionRecord"]);
  assert.deepEqual(getEkidenAwards("区間賞 / 区間新 / [F1]:宮崎県"), ["sectionWinner", "sectionRecord"]);
});

test("does not confuse a tied record, unrelated notes or OP with a record", () => {
  assert.deepEqual(getEkidenAwards("区間タイ"), []);
  assert.deepEqual(getEkidenAwards("区間賞 / 区間タイ"), ["sectionWinner", "sectionRecordTie"]);
  assert.deepEqual(getEkidenAwards("OP / 区間賞 / 区間新"), []);
  assert.deepEqual(getEkidenAwards("都道府県代表"), []);
  assert.deepEqual(getEkidenAwards(null), []);
});

const result = (slug: string, finalRank: number, notes: string | null = null) => ({
  finalRank, notes, organization: { slug, nameJa: slug },
});

test("weights recent results and breaks equal scores by the most recent finish", () => {
  const ranked = rankFeaturedTeams([
    { teamCompetitionResults: [result("recent-winner", 1), result("older-winner", 2)] },
    { teamCompetitionResults: [result("recent-winner", 5), result("older-winner", 1)] },
    { teamCompetitionResults: [result("older-winner", 3)] },
    { teamCompetitionResults: [result("recent-winner", 3)] },
  ]);
  assert.equal(ranked[0].slug, "older-winner");
  assert.equal(ranked[0].points, 49);
  assert.equal(ranked[1].points, 35);
  const tied = rankFeaturedTeams([
    { teamCompetitionResults: [result("z-recent", 1), result("a-older", 2)] },
    { teamCompetitionResults: [result("a-older", 5)] },
    { teamCompetitionResults: [result("a-older", 5)] },
    { teamCompetitionResults: [result("z-recent", 5)] },
  ]);
  assert.equal(tied[0].points, tied[1].points);
  assert.equal(tied[0].slug, "z-recent");
});

test("excludes OP, missing and out-of-range ranks and limits recommendations to five", () => {
  const ranked = rankFeaturedTeams([{ teamCompetitionResults: [
    result("op", 1, "OP"), result("missing", 0), result("sixth", 6),
    ...Array.from({ length: 7 }, (_, index) => result(`team-${index}`, 1)),
  ] }]);
  assert.equal(ranked.length, 5);
  assert.ok(ranked.every((team) => team.slug.startsWith("team-")));
});
