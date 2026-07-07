import type { CompetitionType } from "@prisma/client";

type NormalizeCompetitionEditionNameInput = {
  competitionSlug: string;
  competitionType: CompetitionType | null | undefined;
  editionNumber?: number | null;
  officialName: string;
  shortName?: string | null;
};

const EKIDEN_LABEL_BY_COMPETITION_SLUG: Record<string, string> = {
  "hakone-ekiden": "箱根駅伝",
  "izumo-ekiden": "出雲駅伝",
  "all-japan-university-ekiden": "全日本大学駅伝",
  "new-year-ekiden": "ニューイヤー駅伝",
  "national-prefectural-ekiden-men": "全国男子駅伝",
  "national-high-school-ekiden": "全国高校駅伝",
};

export function normalizeCompetitionEditionNames(input: NormalizeCompetitionEditionNameInput) {
  const label = EKIDEN_LABEL_BY_COMPETITION_SLUG[input.competitionSlug];

  if (!label || !input.editionNumber || !input.competitionType?.includes("ekiden")) {
    return {
      officialName: input.officialName,
      shortName: input.shortName ?? null,
    };
  }

  const normalizedName = `第${input.editionNumber}回${label}`;

  return {
    officialName: input.officialName,
    shortName: input.shortName ?? normalizedName,
  };
}
