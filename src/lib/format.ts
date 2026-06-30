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
