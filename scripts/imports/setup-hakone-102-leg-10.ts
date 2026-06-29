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
    where: { id: 'source-ntv-hakone-102-leg-10' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 10区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/10.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 10区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-10',
      name: '日本テレビ 第102回箱根駅伝 10区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/10.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 10区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'tokyo-jitsugyo-high-school', nameJa: '東京実業高校', type: OrganizationType.high_school, prefecture: '東京都' });
  await upsertOrganization({ slug: 'tokyo-nodai-daini-high-school', nameJa: '東京農業大学第二高校', type: OrganizationType.high_school, prefecture: '群馬県' });
  await upsertOrganization({ slug: 'toyoura-high-school', nameJa: '豊浦高校', type: OrganizationType.high_school, prefecture: '山口県' });
  await upsertOrganization({ slug: 'ichiritsu-funabashi-high-school', nameJa: '市立船橋高校', type: OrganizationType.high_school, prefecture: '千葉県' });
  await upsertOrganization({ slug: 'hirata-high-school', nameJa: '平田高校', type: OrganizationType.high_school, prefecture: '島根県' });
  await upsertOrganization({ slug: 'shodoshima-chuo-high-school', nameJa: '小豆島中央高校', type: OrganizationType.high_school, prefecture: '香川県' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-10' },
    update: {
      competitionEditionId: edition.id,
      name: '10区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 10,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-10',
      competitionEditionId: edition.id,
      name: '10区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 10,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
