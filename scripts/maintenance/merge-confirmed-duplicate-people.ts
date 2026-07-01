import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type MergePatch = {
  canonicalSlug: string;
  duplicateSlug: string;
  displayNameJa: string;
};

const PATCHES: MergePatch[] = [
  {
    canonicalSlug: "takaishi-itsuki",
    duplicateSlug: "person-e9ab99e79fb320e6a8b92de9",
    displayNameJa: "髙石 樹",
  },
  {
    canonicalSlug: "ueda-shodai",
    duplicateSlug: "person-e4b88ae794b020e7bf94e5a4",
    displayNameJa: "上田 翔大",
  },
  {
    canonicalSlug: "yuta-kinugawa",
    duplicateSlug: "person-e8a1a3e5b79d20e58b87e5a4",
    displayNameJa: "衣川 勇太",
  },
  {
    canonicalSlug: "person-e6b2bce794b020e699832de5",
    duplicateSlug: "person-e6b2bce794b020e699832de8",
    displayNameJa: "沼田 晃",
  },
  {
    canonicalSlug: "nao-nanatsue",
    duplicateSlug: "person-e4b883e69e9d20e79bb42de9",
    displayNameJa: "七枝 直",
  },
];

async function mergePeople(prismaClient: PrismaClient, patch: MergePatch) {
  const [canonical, duplicate] = await Promise.all([
    prismaClient.person.findUnique({
      where: { slug: patch.canonicalSlug },
      include: {
        memberships: true,
        raceResults: true,
        sourceReferences: true,
        nameVariants: true,
      },
    }),
    prismaClient.person.findUnique({
      where: { slug: patch.duplicateSlug },
      include: {
        memberships: true,
        raceResults: true,
        sourceReferences: true,
        nameVariants: true,
      },
    }),
  ]);

  if (!canonical || !duplicate) {
    return {
      canonicalSlug: patch.canonicalSlug,
      duplicateSlug: patch.duplicateSlug,
      displayNameJa: patch.displayNameJa,
      skipped: true,
      reason: "missing_person",
    };
  }

  if (canonical.displayNameJa !== patch.displayNameJa || duplicate.displayNameJa !== patch.displayNameJa) {
    throw new Error(`Display name mismatch for merge ${patch.canonicalSlug} <- ${patch.duplicateSlug}`);
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.raceResult.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    await tx.sourceReference.updateMany({
      where: { personId: duplicate.id },
      data: { personId: canonical.id },
    });

    for (const variant of duplicate.nameVariants) {
      const exists = await tx.nameVariant.findFirst({
        where: {
          personId: canonical.id,
          value: variant.value,
        },
      });

      if (!exists) {
        await tx.nameVariant.create({
          data: {
            personId: canonical.id,
            value: variant.value,
            type: variant.type,
            sourceId: variant.sourceId,
            isPrimary: false,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        entityType: "Person",
        entityId: canonical.id,
        action: AuditAction.merge,
        oldValue: {
          mergedPersonId: duplicate.id,
          mergedPersonSlug: duplicate.slug,
          mergedPersonNameJa: duplicate.displayNameJa,
        } as never,
        newValue: {
          canonicalPersonId: canonical.id,
          canonicalPersonSlug: canonical.slug,
          canonicalPersonNameJa: canonical.displayNameJa,
        } as never,
        reasonType: AuditReasonType.entity_merge,
        reasonNote: `Merged duplicate person ${duplicate.displayNameJa} into ${canonical.displayNameJa}`,
        actorType: AuditActorType.system,
      },
    });

    await tx.nameVariant.deleteMany({
      where: { personId: duplicate.id },
    });

    await tx.person.delete({
      where: { id: duplicate.id },
    });
  });

  return {
    canonicalSlug: canonical.slug,
    duplicateSlug: duplicate.slug,
    displayNameJa: canonical.displayNameJa,
    skipped: false,
  };
}

async function main() {
  const summary = [];

  for (const patch of PATCHES) {
    summary.push(await mergePeople(prisma, patch));
  }

  console.log(JSON.stringify({ merged: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
