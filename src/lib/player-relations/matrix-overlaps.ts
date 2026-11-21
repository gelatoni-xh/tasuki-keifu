import { prisma } from "@/lib/prisma";

type Window = { personId: string; organizationId: string; startDate: Date | null; endDate: Date | null; startYear: number | null; endYear: number | null; endState: string | null; organization: { type: string } };
type Stage = "highSchool" | "university" | "corporateTeam";

export function overlapYears(a: Window, b: Window, now = new Date()): number | undefined {
  const start = (w: Window) => w.startDate ?? (w.startYear === null ? null : new Date(Date.UTC(w.startYear, 0, 1)));
  const end = (w: Window) => w.endDate ?? (w.endYear !== null ? new Date(Date.UTC(w.endYear, 11, 31)) : w.endState === "ongoing" ? now : null);
  const as = start(a), bs = start(b), ae = end(a), be = end(b);
  if (!as || !bs || !ae || !be) return undefined;
  const elapsed = Math.min(ae.getTime(), be.getTime()) - Math.max(as.getTime(), bs.getTime());
  return elapsed > 0 ? Math.round(elapsed / (365.2425 * 86400000)) || undefined : undefined;
}

export async function getMatrixOverlaps(personId: string, relatedIds: string[]) {
  const memberships = await prisma.membership.findMany({
    where: { personId: { in: [personId, ...relatedIds] }, role: "athlete" },
    select: { personId: true, organizationId: true, startDate: true, endDate: true, startYear: true, endYear: true, endState: true, organization: { select: { type: true } } },
  });
  const base = memberships.filter((entry) => entry.personId === personId);
  const result = new Map<string, Partial<Record<Stage, number>>>();
  for (const other of memberships) {
    if (other.personId === personId) continue;
    const stage = ({ high_school: "highSchool", university: "university", corporate_team: "corporateTeam" } as Record<string, Stage>)[other.organization.type];
    if (!stage) continue;
    for (const own of base) {
      if (own.organizationId !== other.organizationId) continue;
      const years = overlapYears(own, other);
      if (years) {
        const entry = result.get(other.personId) ?? {};
        entry[stage] = Math.max(entry[stage] ?? 0, years);
        result.set(other.personId, entry);
      }
    }
  }
  return result;
}
