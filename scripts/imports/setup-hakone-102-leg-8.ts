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
    where: { id: 'source-ntv-hakone-102-leg-8' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 8区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/8.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 8区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-8',
      name: '日本テレビ 第102回箱根駅伝 8区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/8.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 8区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'kamiina-agriculture-high-school', nameJa: '上伊那農業高校', type: OrganizationType.high_school, prefecture: '長野県' });
  await upsertOrganization({ slug: 'tsuchiura-nichidai-high-school', nameJa: '土浦日本大学高校', type: OrganizationType.high_school, prefecture: '茨城県' });
  await upsertOrganization({ slug: 'matsuura-high-school', nameJa: '松浦高校', type: OrganizationType.high_school, prefecture: '長崎県' });
  await upsertOrganization({ slug: 'kuri-gakuen-high-school', nameJa: '九里学園高校', type: OrganizationType.high_school, prefecture: '山形県' });
  await upsertOrganization({ slug: 'tottori-johoku-high-school', nameJa: '鳥取城北高校', type: OrganizationType.high_school, prefecture: '鳥取県' });
  await upsertOrganization({ slug: 'kawasaki-tachibana-high-school', nameJa: '川崎橘高校', type: OrganizationType.high_school, prefecture: '神奈川県' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-8' },
    update: {
      competitionEditionId: edition.id,
      name: '8区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 8,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-8',
      competitionEditionId: edition.id,
      name: '8区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 8,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
