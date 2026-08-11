import type { MembershipWindow, RelationStageKey } from "@/lib/player-relations/types";

export function getStageLabel(organizationType: string | null | undefined): RelationStageKey | null {
  switch (organizationType) {
    case "junior_high_school":
      return "junior_high_school";
    case "high_school":
      return "high_school";
    case "university":
      return "university";
    case "corporate_team":
      return "corporate_team";
    default:
      return null;
  }
}

function toBoundaryYear(date: Date | null | undefined, fallback: number | null | undefined) {
  if (date) {
    return date.getUTCFullYear();
  }

  return fallback ?? null;
}

export function windowsOverlap(left: MembershipWindow, right: MembershipWindow) {
  const leftStart = toBoundaryYear(left.startDate, left.startYear);
  const leftEnd = toBoundaryYear(left.endDate, left.endYear) ?? new Date().getUTCFullYear();
  const rightStart = toBoundaryYear(right.startDate, right.startYear);
  const rightEnd = toBoundaryYear(right.endDate, right.endYear) ?? new Date().getUTCFullYear();

  if (leftStart === null || rightStart === null) {
    return left.organizationId === right.organizationId;
  }

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function countOverlapYears(left: MembershipWindow, right: MembershipWindow) {
  const leftStart = toBoundaryYear(left.startDate, left.startYear);
  const leftEnd = toBoundaryYear(left.endDate, left.endYear) ?? new Date().getUTCFullYear();
  const rightStart = toBoundaryYear(right.startDate, right.startYear);
  const rightEnd = toBoundaryYear(right.endDate, right.endYear) ?? new Date().getUTCFullYear();

  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) {
    return left.organizationId === right.organizationId ? 1 : 0;
  }

  const start = Math.max(leftStart, rightStart);
  const end = Math.min(leftEnd, rightEnd);

  return Math.max(0, end - start + 1);
}
