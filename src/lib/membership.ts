import type { Membership, MembershipRole, Organization, PersonType } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

export type MembershipWithOrganization = Membership & {
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
    getCurrentMemberships(memberships, now)
      .sort((left, right) => getMembershipRolePriority(right.role) - getMembershipRolePriority(left.role))[0] ?? null
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

export function isCurrentMembership(
  membership: Pick<Membership, "startDate" | "endDate">,
  now = new Date(),
) {
  if (!membership.startDate && !membership.endDate) {
    return false;
  }

  const startsBeforeNow = !membership.startDate || membership.startDate <= now;
  const hasNotEnded = !membership.endDate || membership.endDate >= now;

  return startsBeforeNow && hasNotEnded;
}

export function isMembershipPeriodUnknown(
  membership: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
) {
  return !membership.startDate && !membership.endDate && !membership.startYear && !membership.endYear;
}

export function getCurrentMemberships(memberships: MembershipWithOrganization[], now = new Date()) {
  return memberships.filter((membership) => isCurrentMembership(membership, now));
}

export function getMembershipRolePriority(role: MembershipRole | null | undefined) {
  switch (role) {
    case "coach":
      return 3;
    case "staff":
      return 2;
    case "athlete":
    default:
      return 1;
  }
}

export function groupMembershipsByRole<T extends Pick<Membership, "role">>(memberships: T[]) {
  return {
    athlete: memberships.filter((membership) => membership.role === "athlete"),
    coach: memberships.filter((membership) => membership.role === "coach"),
    staff: memberships.filter((membership) => membership.role === "staff"),
  };
}

export function derivePersonTypeFromMemberships(
  memberships: Array<Pick<Membership, "role" | "startDate" | "endDate">>,
  fallback: PersonType = "athlete",
  now = new Date(),
): PersonType {
  const currentMemberships = memberships.filter((membership) => isCurrentMembership(membership, now));

  if (currentMemberships.length > 0) {
    return [...currentMemberships].sort(
      (left, right) => getMembershipRolePriority(right.role) - getMembershipRolePriority(left.role),
    )[0]?.role ?? fallback;
  }

  const latestHistoricalMembership = [...memberships]
    .filter((membership) => membership.endDate)
    .sort((left, right) => (right.endDate?.getTime() ?? 0) - (left.endDate?.getTime() ?? 0))[0];

  return latestHistoricalMembership?.role ?? fallback;
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

function getMembershipTimelineBounds(
  membership: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
  now = new Date(),
) {
  const start = membership.startYear ?? membership.startDate?.getUTCFullYear() ?? null;

  if (!start) {
    return null;
  }

  const end = membership.endYear ?? membership.endDate?.getUTCFullYear() ?? now.getUTCFullYear();

  return { start, end };
}

export function getMembershipOverlapYears(
  first: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
  second: Pick<Membership, "startDate" | "endDate" | "startYear" | "endYear">,
  now = new Date(),
) {
  const firstBounds = getMembershipTimelineBounds(first, now);
  const secondBounds = getMembershipTimelineBounds(second, now);

  if (!firstBounds || !secondBounds) {
    return 0;
  }

  const start = Math.max(firstBounds.start, secondBounds.start);
  const end = Math.min(firstBounds.end, secondBounds.end);

  return end > start ? end - start : 0;
}
