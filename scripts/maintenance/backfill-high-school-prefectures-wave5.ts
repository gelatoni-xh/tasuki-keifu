import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type PrefecturePatch = {
  slug: string;
  nameJa: string;
  prefecture: string;
};

const PATCHES: PrefecturePatch[] = [
  { slug: "hs-e585b5e5baab", nameJa: "兵庫", prefecture: "兵庫県" },
  { slug: "hs-古川工高", nameJa: "古川工高", prefecture: "宮城県" },
  { slug: "hs-e59b9be697a5e5b882e8beb2", nameJa: "四日市農芸", prefecture: "三重県" },
  { slug: "hs-e59f8ee69db1", nameJa: "城東", prefecture: "徳島県" },
  { slug: "hs-e59fbae794ba", nameJa: "基町", prefecture: "広島県" },
  { slug: "hs-大垣日大高", nameJa: "大垣日大高", prefecture: "岐阜県" },
  { slug: "hs-大塚高", nameJa: "大塚高", prefecture: "大阪府" },
  { slug: "hs-e5a4a7e69bb2", nameJa: "大曲", prefecture: "秋田県" },
  { slug: "hs-大東大一高", nameJa: "大東大一高", prefecture: "東京都" },
  { slug: "hs-e5a4a7e998aae6b885e9a2a8", nameJa: "大阪清風", prefecture: "大阪府" },
  { slug: "hs-e5a4a9e7ab9c", nameJa: "天竜", prefecture: "静岡県" },
  { slug: "hs-e5a588e889afe882b2e88bb1", nameJa: "奈良育英", prefecture: "奈良県" },
  { slug: "hs-富士宮西高", nameJa: "富士宮西高", prefecture: "静岡県" },
  { slug: "hs-富士河口湖高", nameJa: "富士河口湖高", prefecture: "山梨県" },
  { slug: "hs-e5af8ce5b1b1e58d97", nameJa: "富山南", prefecture: "富山県" },
  { slug: "hs-富山商業高", nameJa: "富山商業高", prefecture: "富山県" },
  { slug: "hs-e5b0bce5b48ee7a8b2e59c92", nameJa: "尼崎稲園", prefecture: "兵庫県" },
  { slug: "hs-e5b1a5e6ada3e7a4be", nameJa: "履正社", prefecture: "大阪府" },
  { slug: "hs-e5b1b1e5b48e", nameJa: "山崎", prefecture: "兵庫県" },
  { slug: "hs-山形中央高", nameJa: "山形中央高", prefecture: "山形県" },
  { slug: "hs-e5b2a1e5b1b1e69c9de697a5", nameJa: "岡山朝日", prefecture: "岡山県" },
  { slug: "hs-e5b2b8e5928ce794b0", nameJa: "岸和田", prefecture: "大阪府" },
  { slug: "hs-e5b8afe5ba83", nameJa: "帯広", prefecture: "北海道" },
  { slug: "hs-e5b89de5b9a1", nameJa: "常盤", prefecture: "群馬県" },
  { slug: "hs-e5ba83e5b3b6e59bbde99a9b", nameJa: "広島国際学院", prefecture: "広島県" },
  { slug: "hs-弘前実業高", nameJa: "弘前実業高", prefecture: "青森県" },
  { slug: "hs-e5bfbde5ada6e9a4a8", nameJa: "志學館", prefecture: "鹿児島県" },
  { slug: "hs-e685b6e8aaa0", nameJa: "慶誠", prefecture: "熊本県" },
  { slug: "hs-e6898be7a8b2", nameJa: "手稲", prefecture: "北海道" },
  { slug: "hs-e695a6e8b380", nameJa: "敦賀気比", prefecture: "福井県" },
];

async function applyPatches(prismaClient: PrismaClient, patches: PrefecturePatch[]) {
  const summary = [];

  for (const patch of patches) {
    const organization = await prismaClient.organization.findUnique({
      where: { slug: patch.slug },
      select: {
        id: true,
        slug: true,
        nameJa: true,
        prefecture: true,
      },
    });

    if (!organization) {
      summary.push({ slug: patch.slug, status: "missing" });
      continue;
    }

    if (organization.nameJa !== patch.nameJa) {
      throw new Error(`Name mismatch for ${patch.slug}: expected ${patch.nameJa}, got ${organization.nameJa}`);
    }

    if (organization.prefecture === patch.prefecture) {
      summary.push({ slug: patch.slug, status: "already_set", prefecture: patch.prefecture });
      continue;
    }

    await prismaClient.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organization.id },
        data: { prefecture: patch.prefecture },
      });

      await tx.auditLog.create({
        data: {
          entityType: "Organization",
          entityId: organization.id,
          action: AuditAction.update,
          fieldName: "prefecture",
          oldValue: organization.prefecture as never,
          newValue: patch.prefecture as never,
          reasonType: AuditReasonType.source_update,
          reasonNote: `Backfilled organization prefecture for ${organization.nameJa}`,
          actorType: AuditActorType.system,
        },
      });
    });

    summary.push({ slug: patch.slug, status: "updated", prefecture: patch.prefecture });
  }

  return summary;
}

async function main() {
  const summary = await applyPatches(prisma, PATCHES);
  console.log(JSON.stringify({ updated: summary }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
