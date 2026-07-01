import { AuditAction, AuditActorType, AuditReasonType } from "@prisma/client";

import { prisma } from "../lib/prisma";

async function mergeDuplicatePerson(canonicalSlug: string, duplicateSlug: string, reasonNote: string) {
  const [canonical, duplicate] = await Promise.all([
    prisma.person.findUnique({
      where: { slug: canonicalSlug },
      include: {
        memberships: true,
        raceResults: true,
        sourceReferences: true,
        nameVariants: true,
      },
    }),
    prisma.person.findUnique({
      where: { slug: duplicateSlug },
      include: {
        memberships: true,
        raceResults: true,
        sourceReferences: true,
        nameVariants: true,
      },
    }),
  ]);

  if (!canonical || !duplicate) {
    throw new Error(`Missing person for merge ${canonicalSlug} <- ${duplicateSlug}`);
  }

  await prisma.$transaction(async (tx) => {
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
        reasonNote,
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
}

async function resolveIsakaHikaru() {
  const canonical = await prisma.person.findUnique({
    where: { slug: "hikaru-isaka" },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!canonical) {
    throw new Error("Missing canonical person hikaru-isaka");
  }

  const wrongMembership = canonical.memberships.find(
    (membership) => membership.organization.slug === "suijo-high-school",
  );
  const correctMembership = canonical.memberships.find(
    (membership) => membership.organization.slug === "hs-水戸葵陵高",
  );

  if (wrongMembership && !correctMembership) {
    await prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: wrongMembership.id },
        data: {
          organizationId: "cmqyycsuq000pskye37t8hcox",
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Person",
          entityId: canonical.id,
          action: AuditAction.update,
          fieldName: "memberships",
          oldValue: {
            organizationSlug: "suijo-high-school",
            organizationNameJa: "水城高校",
          } as never,
          newValue: {
            organizationSlug: "hs-水戸葵陵高",
            organizationNameJa: "水戸葵陵高",
          } as never,
          reasonType: AuditReasonType.source_update,
          reasonNote: "Corrected Hikaru Isaka high school to 水戸葵陵高 based on Tokyo University of Agriculture roster evidence",
          actorType: AuditActorType.system,
        },
      });
    });
  }

  await mergeDuplicatePerson(
    "hikaru-isaka",
    "person-e4ba95e59d8220e585892de6",
    "Merged duplicate person 井坂 光 after confirming 水戸葵陵高 -> 東京農業大学 identity",
  );
}

async function resolveNumataHikaru() {
  const duplicate = await prisma.person.findUnique({
    where: { slug: "person-e6b2bce794b020e699832de8" },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (!duplicate) {
    throw new Error("Missing duplicate person person-e6b2bce794b020e699832de8");
  }

  const wrongMembership = duplicate.memberships.find(
    (membership) => membership.organization.slug === "saikyo-high-school",
  );

  if (wrongMembership) {
    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: { id: wrongMembership.id },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Person",
          entityId: duplicate.id,
          action: AuditAction.update,
          fieldName: "memberships",
          oldValue: {
            organizationSlug: "saikyo-high-school",
            organizationNameJa: "西京高校",
            prefecture: "京都府",
          } as never,
          newValue: null,
          reasonType: AuditReasonType.source_update,
          reasonNote: "Removed ambiguous Kyoto Saikyo membership before merge; external evidence supports 山口県立西京高校",
          actorType: AuditActorType.system,
        },
      });
    });
  }

  await mergeDuplicatePerson(
    "person-e6b2bce794b020e699832de5",
    "person-e6b2bce794b020e699832de8",
    "Merged duplicate person 沼田 晃 after confirming 山口県立西京高校 -> 関西大学 identity",
  );
}

async function main() {
  await resolveIsakaHikaru();
  await resolveNumataHikaru();

  console.log(JSON.stringify({
    resolved: ["井坂 光", "沼田 晃"],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
