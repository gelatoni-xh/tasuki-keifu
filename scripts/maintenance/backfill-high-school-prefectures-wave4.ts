import { AuditAction, AuditActorType, AuditReasonType, type PrismaClient } from "@prisma/client";

import { prisma } from "../lib/prisma";

type PrefecturePatch = {
  slug: string;
  nameJa: string;
  prefecture: string;
};

const PATCHES: PrefecturePatch[] = [
  { slug: "hs-e382afe383a9e383bce382af", nameJa: "クラーク記念国際", prefecture: "北海道" },
  { slug: "hs-e4bb99e58fb0e7acace4ba8c", nameJa: "仙台第二", prefecture: "宮城県" },
  { slug: "hs-e4bc8ae58ba2e5ada6e59c92", nameJa: "伊勢学園", prefecture: "三重県" },
  { slug: "hs-e4bc8ae982a3e58c97", nameJa: "伊那北", prefecture: "長野県" },
  { slug: "hs-e4bc9ae6b4a5e5ada6e9b3b3", nameJa: "会津学鳳", prefecture: "福島県" },
  { slug: "hs-e4bd90e6b8a1", nameJa: "佐渡", prefecture: "新潟県" },
  { slug: "hs-佐野日大高", nameJa: "佐野日大高", prefecture: "栃木県" },
  { slug: "hs-e58089e695b7e5a4a9e59f8e", nameJa: "倉敷天城", prefecture: "岡山県" },
  { slug: "hs-光明相模原高", nameJa: "光明相模原高", prefecture: "神奈川県" },
  { slug: "hs-八代高", nameJa: "八代高", prefecture: "熊本県" },
  { slug: "hs-八幡浜高", nameJa: "八幡浜高", prefecture: "愛媛県" },
  { slug: "hs-e585abe688b8e5ada6e999a2", nameJa: "八戸学院光星", prefecture: "青森県" },
  { slug: "hs-八頭高", nameJa: "八頭高", prefecture: "鳥取県" },
  { slug: "hs-e589b5e68890e9a4a8", nameJa: "創成館", prefecture: "長崎県" },
  { slug: "hs-北越高", nameJa: "北越高", prefecture: "新潟県" },
  { slug: "hs-e58c97e9878e", nameJa: "北野", prefecture: "大阪府" },
  { slug: "hs-e58d97e5ae87e5928c", nameJa: "南宇和", prefecture: "愛媛県" },
  { slug: "hs-e58fa4e5b79d", nameJa: "古川", prefecture: "宮城県" },
  { slug: "hs-e58fa4e5b79de5ada6e59c92", nameJa: "古川学園", prefecture: "宮城県" },
  { slug: "hs-向上高", nameJa: "向上高", prefecture: "神奈川県" },
  { slug: "hs-喜多方高", nameJa: "喜多方高", prefecture: "福島県" },
  { slug: "hs-四学香川西高", nameJa: "四学香川西高", prefecture: "香川県" },
  { slug: "hs-四日市中央工高", nameJa: "四日市中央工高", prefecture: "三重県" },
  { slug: "hs-e59b9be69da1e795b7", nameJa: "四条畷", prefecture: "大阪府" },
  { slug: "hs-e59bbde58886e4b8ade5a4ae", nameJa: "国分中央", prefecture: "鹿児島県" },
  { slug: "hs-福岡大大濠高", nameJa: "福岡大大濠高", prefecture: "福岡県" },
  { slug: "hs-e7ab8be591bde9a4a8e5ae88", nameJa: "立命館守山", prefecture: "滋賀県" },
  { slug: "hs-e7ab9ce382b1e5b48ee7acac", nameJa: "竜ケ崎第一", prefecture: "茨城県" },
  { slug: "hs-美祢青嶺高", nameJa: "美祢青嶺高", prefecture: "山口県" },
  { slug: "hs-e88196e5928ce5ada6e59c92", nameJa: "聖和学園", prefecture: "宮城県" },
  { slug: "hs-西武文理高", nameJa: "西武文理高", prefecture: "埼玉県" },
  { slug: "hs-鳴門高", nameJa: "鳴門高", prefecture: "徳島県" },
  { slug: "hs-鶴丸高", nameJa: "鶴丸高", prefecture: "鹿児島県" },
  { slug: "hs-e9bb92e6b2a2e5b0bbe58c97", nameJa: "黒沢尻北", prefecture: "岩手県" }
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
