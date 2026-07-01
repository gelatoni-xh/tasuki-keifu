import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type PrefecturePatch = {
  slug: string;
  nameJa: string;
  prefecture: string;
};

const PATCHES: PrefecturePatch[] = [
  { slug: "hs-田村高", nameJa: "田村高", prefecture: "福島県" },
  { slug: "hs-田辺工業高", nameJa: "田辺工業高", prefecture: "和歌山県" },
  { slug: "hs-e7a59ee8bebae697ad", nameJa: "神辺旭", prefecture: "広島県" },
  { slug: "hs-秋田工業高", nameJa: "秋田工業高", prefecture: "秋田県" },
  { slug: "hs-美濃加茂高", nameJa: "美濃加茂高", prefecture: "岐阜県" },
  { slug: "hs-聖望学園高", nameJa: "聖望学園高", prefecture: "埼玉県" },
  { slug: "hs-若葉総合高", nameJa: "若葉総合高", prefecture: "東京都" },
  { slug: "hs-藤岡中央高", nameJa: "藤岡中央高", prefecture: "群馬県" },
  { slug: "hs-e8a5bfe5aeaee9ab98e6a0a1", nameJa: "西宮高校", prefecture: "兵庫県" },
  { slug: "hs-e983bde59f8ee5b7a5e6a5ad", nameJa: "都城工業", prefecture: "宮崎県" },
  { slug: "hs-開志国際高", nameJa: "開志国際高", prefecture: "新潟県" },
  { slug: "hs-e9968be6989f", nameJa: "開星", prefecture: "島根県" },
  { slug: "hs-e996a2e8a5bfe5a4a7e5ada6", nameJa: "関西大学第一", prefecture: "大阪府" },
  { slug: "hs-鹿児島中央高", nameJa: "鹿児島中央高", prefecture: "鹿児島県" },
  { slug: "hs-いわき総合高", nameJa: "いわき総合高", prefecture: "福島県" },
  { slug: "hs-コザ高", nameJa: "コザ高", prefecture: "沖縄県" },
  { slug: "hs-e4b889e69ca8", nameJa: "三木", prefecture: "兵庫県" },
  { slug: "hs-e4b889e794b0e7a5a5e99bb2", nameJa: "三田祥雲館", prefecture: "兵庫県" },
  { slug: "hs-上伊那農高", nameJa: "上伊那農高", prefecture: "長野県" },
  { slug: "hs-e4b8ade4baace5a4a7e4b8ad", nameJa: "中京大中京", prefecture: "愛知県" },
  { slug: "hs-中央学院高", nameJa: "中央学院高", prefecture: "千葉県" },
  { slug: "hs-九国大付高", nameJa: "九国大付高", prefecture: "福岡県" },
  { slug: "hs-e4b99de5b79ee69687e58c96", nameJa: "九州文化学園", prefecture: "長崎県" },
  { slug: "hs-九産大九州高", nameJa: "九産大九州高", prefecture: "福岡県" },
  { slug: "hs-京産大付属高", nameJa: "京産大附属高", prefecture: "京都府" },
  { slug: "hs-e4baace983bde4b8a1e6b48b", nameJa: "京都両洋", prefecture: "京都府" },
  { slug: "hs-e4baace983bde5a496e5a4a7", nameJa: "京都外大西", prefecture: "京都府" },
  { slug: "hs-今治北高", nameJa: "今治北高", prefecture: "愛媛県" },
  { slug: "hs-e4bb99e58fb0e5a4a7e5ada6", nameJa: "仙台大学付属明成", prefecture: "宮城県" },
  { slug: "hs-e4bb99e58fb0e5a4a7e6988e", nameJa: "仙台大明成", prefecture: "宮城県" },
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
