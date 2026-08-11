import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

type Dictionary = ReturnType<typeof getDictionary>;

export function formatRelationLabel(locale: Locale, dictionary: Dictionary, label: string) {
  switch (label) {
    case "same_hometown":
      return dictionary.players.sharedHometown;
    case "same_junior_high_origin":
      return locale === "ja" ? "中学出身" : locale === "en" ? "Junior high background" : locale === "ko" ? "중학교 출신" : locale === "zh-Hant" ? "國中出身" : "初中出身";
    case "same_high_school_origin":
      return dictionary.players.sharedHighSchool;
    case "same_university_origin":
      return dictionary.players.sharedUniversity;
    case "same_corporate_team_origin":
      return locale === "ja" ? "実業団出身" : locale === "en" ? "Corporate team background" : locale === "ko" ? "실업단 출신" : locale === "zh-Hant" ? "實業團出身" : "实业团出身";
    case "same_junior_high_team":
      return dictionary.players.sharedTeamStages.junior_high_school;
    case "same_high_school_team":
      return dictionary.players.sharedTeamStages.high_school;
    case "same_university_team":
      return dictionary.players.sharedTeamStages.university;
    case "frequent_matchup":
      return locale === "ja" ? "対戦多数" : locale === "en" ? "Frequent matchups" : locale === "ko" ? "대결이 많음" : locale === "zh-Hant" ? "多次對決" : "多次对决";
    case "long_term_matchup":
      return locale === "ja" ? "長期対戦" : locale === "en" ? "Long-term matchup" : locale === "ko" ? "장기 대결" : locale === "zh-Hant" ? "長期對決" : "长期对决";
    case "cross_stage_matchup":
      return locale === "ja" ? "複数期にまたがる対戦" : locale === "en" ? "Cross-stage matchup" : locale === "ko" ? "다단계 대결" : locale === "zh-Hant" ? "跨階段對決" : "跨阶段对决";
    default:
      return label;
  }
}
