import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, DataStatus, EventDiscipline, OrganizationType, SourceType } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

async function upsertOrganization(input: { slug: string; nameJa: string; type: OrganizationType; prefecture?: string }) {
  return prisma.organization.upsert({
    where: { slug: input.slug },
    update: input,
    create: { ...input, status: DataStatus.pending },
  });
}

async function main() {
  const source = await prisma.source.upsert({
    where: { id: 'source-ntv-hakone-102-leg-6' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 6区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/6.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 6区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-6',
      name: '日本テレビ 第102回箱根駅伝 6区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/6.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 6区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'aomori-yamada-high-school', nameJa: '青森山田高校', type: OrganizationType.high_school, prefecture: '青森県' });
  await upsertOrganization({ slug: 'izumo-technical-high-school', nameJa: '出雲工業高校', type: OrganizationType.high_school, prefecture: '島根県' });
  await upsertOrganization({ slug: 'hokkaido-sakae-high-school', nameJa: '北海道栄高校', type: OrganizationType.high_school, prefecture: '北海道' });
  await upsertOrganization({ slug: 'miyazaki-nichidai-high-school', nameJa: '宮崎日本大学高校', type: OrganizationType.high_school, prefecture: '宮崎県' });
  await upsertOrganization({ slug: 'kashima-gakuen-high-school', nameJa: '鹿島学園高校', type: OrganizationType.high_school, prefecture: '茨城県' });
  await upsertOrganization({ slug: 'josei-high-school', nameJa: '城西高校', type: OrganizationType.high_school, prefecture: '徳島県' });
  await upsertOrganization({ slug: 'kokoku-high-school', nameJa: '興國高校', type: OrganizationType.high_school, prefecture: '大阪府' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-6' },
    update: {
      competitionEditionId: edition.id,
      name: '6区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 6,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-6',
      competitionEditionId: edition.id,
      name: '6区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 6,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
