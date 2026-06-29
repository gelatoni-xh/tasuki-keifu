import type { Membership, Organization } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

type MembershipWithOrganization = Membership & {
  organization: Organization;
};

export type MembershipOverlap = "overlap" | "not_overlap" | "unknown";

export function sortMembershipsByStartDate(memberships: MembershipWithOrganization[]) {
  return [...memberships].sort((a, b) => {
    const aTime = a.startDate?.getTime() ?? 0;
    const bTime = b.startDate?.getTime() ?? 0;

    return aTime - bTime;
  });
}

export function getCurrentMembership(memberships: MembershipWithOrganization[], now = new Date()) {
  return (
    memberships.find((membership) => {
      if (!membership.startDate && !membership.endDate) {
        return false;
      }

      const startsBeforeNow = !membership.startDate || membership.startDate <= now;
      const hasNotEnded = !membership.endDate || membership.endDate >= now;

      return startsBeforeNow && hasNotEnded;
    }) ?? null
  );
}

export function getHighSchoolMembership(memberships: MembershipWithOrganization[]) {
  return (
    memberships.find((membership) => membership.organization.type === "high_school") ??
    null
  );
}

export function getUniversityMembership(memberships: MembershipWithOrganization[]) {
  return (
    memberships.find((membership) => membership.organization.type === "university") ??
    null
  );
}

function getAcademicYearStartYear(date: Date) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  return month >= 4 ? year : year - 1;
}

export function inferCurrentUniversityGrade(
  membership: MembershipWithOrganization | null,
  now = new Date(),
) {
  if (!membership?.startDate) {
    return null;
  }

  const startsBeforeNow = membership.startDate <= now;
  const hasNotEnded = !membership.endDate || membership.endDate >= now;

  if (!startsBeforeNow || !hasNotEnded) {
    return null;
  }

  const startAcademicYear = getAcademicYearStartYear(membership.startDate);
  const currentAcademicYear = getAcademicYearStartYear(now);
  const grade = currentAcademicYear - startAcademicYear + 1;

  return grade > 0 ? grade : null;
}

export function formatMembershipPeriod(membership: MembershipWithOrganization, locale: Locale = "ja") {
  const start = membership.startDate
    ? `${membership.startDate.getFullYear()}`
    : "";
  const end = membership.endDate
    ? `${membership.endDate.getFullYear()}`
    : getDictionary(locale).common.present;

  if (!start && !membership.endDate) {
    return "";
  }

  return `${start || "?"} - ${end}`;
}

export function getMembershipOverlap(
  first: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
  second: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
  now = new Date(),
): MembershipOverlap {
  if (first.startDate || first.endDate || second.startDate || second.endDate) {
    if (!first.startDate || !second.startDate) {
      return "unknown";
    }

    const firstEnd = first.endDate ?? now;
    const secondEnd = second.endDate ?? now;

    return first.startDate <= secondEnd && second.startDate <= firstEnd ? "overlap" : "not_overlap";
  }

  if (first.startYear && second.startYear) {
    const firstEndYear = first.endYear ?? now.getFullYear();
    const secondEndYear = second.endYear ?? now.getFullYear();

    return first.startYear <= secondEndYear && second.startYear <= firstEndYear ? "overlap" : "not_overlap";
  }

  return "unknown";
}
