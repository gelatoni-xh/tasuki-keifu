import { prisma } from "../lib/prisma";
import { bumpCacheInvalidationScope } from "../lib/cache-invalidation";

const unconfirmedTypes = ["unknown", "company", "club"] as const;
const batchId = "unconfirmed-organization-cleanup-2026-11-17";

function requireApply() {
  if (process.argv.includes("--apply") && process.env.UNCONFIRMED_ORG_CLEANUP_CONFIRM === batchId) return;
  throw new Error(`Refusing to mutate data. Re-run with --apply and UNCONFIRMED_ORG_CLEANUP_CONFIRM=${batchId}`);
}

async function main() {
  requireApply();
  const result = await prisma.$transaction(async (tx) => {
    const organizations = await tx.organization.findMany({
      where: { type: { in: [...unconfirmedTypes] } },
      include: {
        memberships: true,
        raceResults: { select: { id: true, organizationId: true, organizationNameSnapshot: true } },
        sourceReferences: { select: { id: true, sourceId: true, sourceEntityType: true, sourceEntityKey: true } },
        nameVariants: { select: { id: true, value: true, type: true } },
        teamCompetitionResults: { select: { id: true } },
      },
    });
    if (organizations.some((organization) => organization.teamCompetitionResults.length > 0)) {
      throw new Error("Unconfirmed organizations still have TeamCompetitionResult references");
    }

    const organizationIds = organizations.map((organization) => organization.id);
    const raceResults = organizations.flatMap((organization) => organization.raceResults.map((raceResult) => ({
      ...raceResult,
      organizationName: organization.nameJa,
    })));
    const memberships = organizations.flatMap((organization) => organization.memberships);
    await tx.auditLog.createMany({
      data: raceResults.map((raceResult) => ({
        entityType: "RaceResult",
        entityId: raceResult.id,
        action: "update" as const,
        fieldName: "organizationId",
        oldValue: { organizationId: raceResult.organizationId, organizationNameSnapshot: raceResult.organizationNameSnapshot },
        newValue: { organizationId: null, organizationNameSnapshot: raceResult.organizationNameSnapshot ?? raceResult.organizationName },
        reasonType: "source_correction" as const,
        reasonNote: "下线未确认组织，保留比赛来源参赛名称",
        batchId,
      })),
    });
    await tx.$executeRaw`UPDATE "RaceResult" rr SET "organizationNameSnapshot" = COALESCE(rr."organizationNameSnapshot", o."nameJa"), "organizationId" = NULL FROM "Organization" o WHERE rr."organizationId" = o.id AND o.type IN ('unknown', 'company', 'club')`;
    await tx.auditLog.createMany({
      data: memberships.map((membership) => ({
        entityType: "Membership",
        entityId: membership.id,
        action: "delete" as const,
        oldValue: JSON.parse(JSON.stringify(membership)),
        reasonType: "source_correction" as const,
        reasonNote: "下线未确认组织，不保留组织 Membership",
        batchId,
      })),
    });
    await tx.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.auditLog.createMany({
      data: organizations.map((organization) => ({
        entityType: "Organization",
        entityId: organization.id,
        action: "delete" as const,
        oldValue: {
          id: organization.id,
          slug: organization.slug,
          nameJa: organization.nameJa,
          type: organization.type,
          sourceReferenceIds: organization.sourceReferences.map((reference) => reference.id),
          nameVariantIds: organization.nameVariants.map((variant) => variant.id),
        },
        reasonType: "source_correction" as const,
        reasonNote: "下线未确认参赛名称组织，比赛名称已写入 RaceResult 快照",
        batchId,
      })),
    });
    await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
    return { organizations: organizations.length, raceResultsUpdated: raceResults.length, membershipsDeleted: memberships.length, organizationsDeleted: organizations.length };
  }, { maxWait: 30_000, timeout: 300_000 });
  await bumpCacheInvalidationScope(prisma, "player-detail");
  await bumpCacheInvalidationScope(prisma, "competition-detail");
  console.log(JSON.stringify({ batchId, applied: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
