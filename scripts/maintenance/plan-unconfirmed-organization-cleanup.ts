import { prisma } from "../lib/prisma";

const unconfirmedTypes = ["unknown", "company", "club"] as const;

async function main() {
  const organizations = await prisma.organization.findMany({
    where: { type: { in: [...unconfirmedTypes] } },
    select: {
      id: true,
      slug: true,
      nameJa: true,
      type: true,
      memberships: { select: { id: true, personId: true } },
      raceResults: { select: { id: true, organizationNameSnapshot: true } },
      sourceReferences: { select: { id: true } },
      nameVariants: { select: { id: true } },
      teamCompetitionResults: { select: { id: true } },
    },
    orderBy: [{ type: "asc" }, { nameJa: "asc" }],
  });

  const rows = organizations.map((organization) => ({
    id: organization.id,
    slug: organization.slug,
    nameJa: organization.nameJa,
    type: organization.type,
    memberships: organization.memberships.length,
    raceResults: organization.raceResults.length,
    raceResultsMissingSnapshot: organization.raceResults.filter((result) => !result.organizationNameSnapshot).length,
    sourceReferences: organization.sourceReferences.length,
    nameVariants: organization.nameVariants.length,
    teamCompetitionResults: organization.teamCompetitionResults.length,
  }));
  const totals = rows.reduce((accumulator, row) => ({
    organizations: accumulator.organizations + 1,
    memberships: accumulator.memberships + row.memberships,
    raceResults: accumulator.raceResults + row.raceResults,
    raceResultsMissingSnapshot: accumulator.raceResultsMissingSnapshot + row.raceResultsMissingSnapshot,
    sourceReferences: accumulator.sourceReferences + row.sourceReferences,
    nameVariants: accumulator.nameVariants + row.nameVariants,
    teamCompetitionResults: accumulator.teamCompetitionResults + row.teamCompetitionResults,
  }), {
    organizations: 0,
    memberships: 0,
    raceResults: 0,
    raceResultsMissingSnapshot: 0,
    sourceReferences: 0,
    nameVariants: 0,
    teamCompetitionResults: 0,
  });
  const blockers = [
    ...(totals.memberships > 0 ? [`仍有 ${totals.memberships} 条 Membership 未清理`] : []),
    ...(totals.raceResultsMissingSnapshot > 0 ? [`仍有 ${totals.raceResultsMissingSnapshot} 条 RaceResult 缺少来源名称快照`] : []),
    ...(totals.teamCompetitionResults > 0 ? [`仍有 ${totals.teamCompetitionResults} 条 TeamCompetitionResult 引用未确认组织`] : []),
  ];

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    readOnly: true,
    readyForFinalCleanup: blockers.length === 0,
    blockers,
    totals,
    organizations: rows,
    plannedActions: [
      "在事务内为所有 RaceResult 补齐 organizationNameSnapshot。",
      "将未确认组织的 RaceResult.organizationId 置空。",
      "清理未确认组织的 SourceReference、NameVariant 和 Organization 记录；执行前必须审核同名正式组织候选。",
      "为每个变更写入 AuditLog，并核对迁移前后计数。",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
