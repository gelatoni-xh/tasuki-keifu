import type { CompetitionType, EventDiscipline, MembershipRole, OrganizationType, PersonType } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { getDictionary, interpolate } from "@/lib/i18n";

export function formatDiscipline(discipline: EventDiscipline, locale: Locale = "ja") {
  return getDictionary(locale).discipline[discipline];
}

export function formatStatus(status: string, locale: Locale = "ja") {
  const labels: Record<string, string> = getDictionary(locale).status;

  return labels[status] ?? status;
}

export function formatOrganizationType(type: OrganizationType, locale: Locale = "ja") {
  return getDictionary(locale).organizationType[type] ?? type;
}

export function formatPersonType(type: PersonType, locale: Locale = "ja") {
  return getDictionary(locale).personType[type] ?? type;
}

export function formatMembershipRole(role: MembershipRole, locale: Locale = "ja") {
  return getDictionary(locale).membershipRole[role] ?? role;
}

export function formatCompetitionType(type: CompetitionType, locale: Locale = "ja") {
  return getDictionary(locale).competitionType[type] ?? type;
}

export function formatDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function formatRank(rank: number | null | undefined, locale: Locale = "ja") {
  if (!rank) {
    return "";
  }

  if (locale === "en") {
    const suffix = rank % 10 === 1 && rank % 100 !== 11
      ? "st"
      : rank % 10 === 2 && rank % 100 !== 12
        ? "nd"
        : rank % 10 === 3 && rank % 100 !== 13
          ? "rd"
          : "th";

    return `${rank}${suffix}`;
  }

  return `${rank}位`;
}

export function formatRankWithNotes(
  rank: number | null | undefined,
  notes: string | null | undefined,
  locale: Locale = "ja",
) {
  const noteParts = notes?.split("/").map((part) => part.trim()).filter(Boolean) ?? [];

  if (noteParts.includes("OP")) {
    return "OP";
  }

  if (!rank && noteParts.includes("SDS")) {
    return "SDS";
  }

  return formatRank(rank, locale);
}

export function formatRaceMark(mark: string | null | undefined, locale: Locale = "ja") {
  if (!mark) {
    return "";
  }

  return mark;
}

type RaceResultNoteFormatOptions = {
  suppressRepresentativeNotes?: boolean;
};

function formatSingleRaceResultNote(
  note: string,
  locale: Locale,
  options: RaceResultNoteFormatOptions,
) {
  const trimmed = note.trim();
  if (!trimmed) {
    return null;
  }

  if (options.suppressRepresentativeNotes && (trimmed === "都道府県代表" || trimmed.startsWith("地区代表:"))) {
    return null;
  }

  const furusatoMatch = trimmed.match(/^\[(F\d+)\]:(.+)$/u);
  if (furusatoMatch) {
    const [, code, origin] = furusatoMatch;
    const dictionary = getDictionary(locale);

    return `${interpolate(dictionary.common.furusatoSystemLabel, {
      code,
      origin: origin.trim(),
    })}: ${dictionary.common.furusatoSystemDescription}`;
  }

  return trimmed;
}

export function formatRaceResultNotes(
  notes: string | null | undefined,
  locale: Locale = "ja",
  options: RaceResultNoteFormatOptions = {},
) {
  const rawParts = notes?.split("/").map((part) => part.trim()).filter(Boolean) ?? [];
  const hasSectionAward = rawParts.includes("区間賞");
  const parts = rawParts
    .filter((part) => !(hasSectionAward && part === "同タイム区間1位"))
    .map((part) => formatSingleRaceResultNote(part, locale, options))
    .filter(Boolean);

  return parts.join(" / ");
}
