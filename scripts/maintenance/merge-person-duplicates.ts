import { AuditAction, AuditActorType, AuditReasonType } from "@prisma/client";

import { prisma } from "../lib/prisma";

type MergePair = {
  keepSlug: string;
  dropSlug: string;
  note: string;
};

const mergePairs: MergePair[] = [
  {
    keepSlug: "miyamoto-haruto",
    dropSlug: "haruto-miyamoto",
    note: "历史导入误把罗马字顺序差异当成新人物，保留 GivenName FamilyName 规范写法。",
  },
  {
    keepSlug: "munakata-kazura",
    dropSlug: "kazura-munakata",
    note: "历史导入误把罗马字顺序差异当成新人物，保留 GivenName FamilyName 规范写法。",
  },
  {
    keepSlug: "baba-kento",
    dropSlug: "kento-baba",
    note: "历史导入误把罗马字顺序差异当成新人物，保留 GivenName FamilyName 规范写法。",
  },
];

async function writeMergeAudit(entityId: string, oldValue: unknown, newValue: unknown, reasonNote: string) {
  await prisma.auditLog.create({
    data: {
      entityType: "Person",
      entityId,
      action: AuditAction.merge,
      oldValue: oldValue as never,
      newValue: newValue as never,
      reasonType: AuditReasonType.entity_merge,
      reasonNote,
      actorType: AuditActorType.import_script,
      batchId: "merge-person-duplicates-20260629",
    },
  });
}

async function mergePair(pair: MergePair) {
  const keep = await prisma.person.findUnique({
    where: { slug: pair.keepSlug },
    include: {
      memberships: true,
      personalBests: true,
      raceResults: true,
      nameVariants: true,
      sourceReferences: true,
    },
  });
  const drop = await prisma.person.findUnique({
    where: { slug: pair.dropSlug },
    include: {
      memberships: true,
      personalBests: true,
      raceResults: true,
      nameVariants: true,
      sourceReferences: true,
    },
  });

  if (!keep || !drop) {
    throw new Error(`Missing keep/drop person for ${pair.keepSlug} <- ${pair.dropSlug}`);
  }

  await prisma.$transaction(async (tx) => {
    for (const membership of drop.memberships) {
      const exists = await tx.membership.findFirst({
        where: {
          personId: keep.id,
          organizationId: membership.organizationId,
          type: membership.type,
          startDate: membership.startDate,
          endDate: membership.endDate,
          grade: membership.grade,
        },
      });

      if (!exists) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { personId: keep.id },
        });
      } else {
        await tx.membership.delete({ where: { id: membership.id } });
      }
    }

    for (const pb of drop.personalBests) {
      const exists = await tx.personalBest.findFirst({
        where: {
          personId: keep.id,
          discipline: pb.discipline,
          mark: pb.mark,
        },
      });

      if (!exists) {
        await tx.personalBest.update({
          where: { id: pb.id },
          data: { personId: keep.id },
        });
      } else {
        await tx.personalBest.delete({ where: { id: pb.id } });
      }
    }

    for (const result of drop.raceResults) {
      const exists = await tx.raceResult.findFirst({
        where: {
          personId: keep.id,
          raceId: result.raceId,
        },
      });

      if (!exists) {
        await tx.raceResult.update({
          where: { id: result.id },
          data: { personId: keep.id },
        });
      } else {
        await tx.raceResult.delete({ where: { id: result.id } });
      }
    }

    for (const variant of drop.nameVariants) {
      const exists = await tx.nameVariant.findFirst({
        where: {
          personId: keep.id,
          value: variant.value,
          type: variant.type,
          language: variant.language,
        },
      });

      if (!exists) {
        await tx.nameVariant.update({
          where: { id: variant.id },
          data: { personId: keep.id },
        });
      } else {
        await tx.nameVariant.delete({ where: { id: variant.id } });
      }
    }

    for (const ref of drop.sourceReferences) {
      const exists = await tx.sourceReference.findFirst({
        where: {
          sourceId: ref.sourceId,
          sourceEntityType: ref.sourceEntityType,
          sourceEntityKey: ref.sourceEntityKey,
          personId: keep.id,
        },
      });

      if (!exists) {
        await tx.sourceReference.update({
          where: { id: ref.id },
          data: { personId: keep.id },
        });
      } else {
        await tx.sourceReference.delete({ where: { id: ref.id } });
      }
    }

    await writeMergeAudit(
      keep.id,
      {
        keepSlug: keep.slug,
        dropSlug: drop.slug,
      },
      {
        kept: keep.slug,
        removed: drop.slug,
      },
      pair.note,
    );

    await tx.person.delete({
      where: { id: drop.id },
    });
  });

  console.log(`Merged ${pair.dropSlug} -> ${pair.keepSlug}`);
}

async function main() {
  for (const pair of mergePairs) {
    await mergePair(pair);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
