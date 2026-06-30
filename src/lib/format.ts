import type { CompetitionType, EventDiscipline, MembershipRole, OrganizationType, PersonType } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

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

export function formatRaceMark(mark: string | null | undefined, locale: Locale = "ja") {
  if (!mark) {
    return "";
  }

  if (locale !== "ja") {
    return mark;
  }

  const normalized = mark.trim();
  const fractionMatch = normalized.match(/^(.+)\.(\d+)$/);
  const timePart = fractionMatch?.[1] ?? normalized;
  const fractionPart = fractionMatch?.[2] ?? null;
  const segments = timePart.split(":").map((segment) => Number(segment));

  if (segments.some((segment) => Number.isNaN(segment))) {
    return mark;
  }

  if (segments.length === 3) {
    const [hours, minutes, seconds] = segments;
    return `${hours}時間${minutes}分${seconds}秒${fractionPart ? `.${fractionPart}` : ""}`;
  }

  if (segments.length === 2) {
    const [minutes, seconds] = segments;
    return `${minutes}分${seconds}秒${fractionPart ? `.${fractionPart}` : ""}`;
  }

  if (segments.length === 1) {
    return `${segments[0]}秒${fractionPart ? `.${fractionPart}` : ""}`;
  }

  return mark;
}
