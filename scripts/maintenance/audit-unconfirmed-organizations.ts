import { prisma } from "../lib/prisma";

const unconfirmedTypes = ["unknown", "company", "club"] as const;

function comparableName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s・.,、。()（）「」『』]/g, "")
    .replace(/株式会社|有限会社/g, "");
}

async function main() {
  const organizations = await prisma.organization.findMany({
    where: { type: { in: [...unconfirmedTypes] } },
    select: {
      id: true,
      nameJa: true,
      type: true,
      _count: {
        select: { raceResults: true, memberships: true, sourceReferences: true, nameVariants: true },
      },
    },
    orderBy: [{ type: "asc" }, { nameJa: "asc" }],
  });
  const confirmed = await prisma.organization.findMany({
    where: { type: { notIn: [...unconfirmedTypes] } },
    select: { id: true, nameJa: true, type: true },
  });
  const confirmedByName = new Map<string, typeof confirmed>();
  for (const organization of confirmed) {
    const key = comparableName(organization.nameJa);
    confirmedByName.set(key, [...(confirmedByName.get(key) ?? []), organization]);
  }

  const summary = Object.fromEntries(
    unconfirmedTypes.map((type) => {
      const rows = organizations.filter((organization) => organization.type === type);
      return [type, {
        organizations: rows.length,
        raceResults: rows.reduce((sum, row) => sum + row._count.raceResults, 0),
        memberships: rows.reduce((sum, row) => sum + row._count.memberships, 0),
        sourceReferences: rows.reduce((sum, row) => sum + row._count.sourceReferences, 0),
        nameVariants: rows.reduce((sum, row) => sum + row._count.nameVariants, 0),
      }];
    }),
  );
  const candidates = organizations.flatMap((organization) => {
    const matches = confirmedByName.get(comparableName(organization.nameJa)) ?? [];
    return matches.map((match) => ({
      source: { id: organization.id, nameJa: organization.nameJa, type: organization.type },
      confirmed: match,
    }));
  });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary,
    candidates,
    organizations,
    nextMigrationRequirements: [
      "Backfill RaceResult.organizationNameSnapshot from the current organization name before deleting or detaching unconfirmed organizations.",
      "Review exact-name candidates and ambiguous names before changing any organization type or deleting records.",
      "Record every detach/delete and Membership removal in AuditLog within one transaction.",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
