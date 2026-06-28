import type { Membership, Organization } from "@prisma/client";
import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";

type MembershipWithOrganization = Membership & {
  organization: Organization;
};

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
