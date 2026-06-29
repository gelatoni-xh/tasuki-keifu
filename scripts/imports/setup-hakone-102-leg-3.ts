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
    where: { id: 'source-ntv-hakone-102-leg-3' },
    update: {
      name: '日本テレビ 第102回箱根駅伝 3区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/3.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 3区の区間順位、区間タイム、学年、出身校の参照元。',
    },
    create: {
      id: 'source-ntv-hakone-102-leg-3',
      name: '日本テレビ 第102回箱根駅伝 3区区間成績',
      url: 'https://www.ntv.co.jp/hakone/backnumber/102/team_kukan/3.html',
      type: SourceType.ntv,
      reliability: 4,
      notes: '第102回箱根駅伝 3区の区間順位、区間タイム、学年、出身校の参照元。',
    },
  });

  await upsertOrganization({ slug: 'tokyo-nogyo-daisan-high-school', nameJa: '東京農業大学第三高校', type: OrganizationType.high_school, prefecture: '埼玉県' });
  await upsertOrganization({ slug: 'jutoku-high-school', nameJa: '樹徳高校', type: OrganizationType.high_school, prefecture: '群馬県' });
  await upsertOrganization({ slug: 'hamamatsu-technical-high-school', nameJa: '浜松工業高校', type: OrganizationType.high_school, prefecture: '静岡県' });
  await upsertOrganization({ slug: 'kashima-gakuen-high-school', nameJa: '鹿島学園高校', type: OrganizationType.high_school, prefecture: '茨城県' });
  await upsertOrganization({ slug: 'chukyo-high-school', nameJa: '中京高校', type: OrganizationType.high_school, prefecture: '岐阜県' });
  await upsertOrganization({ slug: 'takudai-daiichi-high-school', nameJa: '拓殖大学第一高校', type: OrganizationType.high_school, prefecture: '東京都' });
  await upsertOrganization({ slug: 'takada-high-school', nameJa: '高田高校', type: OrganizationType.high_school, prefecture: '三重県' });
  await upsertOrganization({ slug: 'kyusandai-kyushu-high-school', nameJa: '九州産業大学付属九州高校', type: OrganizationType.high_school, prefecture: '福岡県' });
  await upsertOrganization({ slug: 'tokai-university-sagami-high-school', nameJa: '東海大学付属相模高校', type: OrganizationType.high_school, prefecture: '神奈川県' });
  await upsertOrganization({ slug: 'kamakura-gakuen-high-school', nameJa: '鎌倉学園高校', type: OrganizationType.high_school, prefecture: '神奈川県' });
  await upsertOrganization({ slug: 'kagaku-gijutsu-gakuen-high-school', nameJa: '科学技術学園高校', type: OrganizationType.high_school, prefecture: '東京都' });
  await upsertOrganization({ slug: 'hakuohdai-ashikaga-high-school', nameJa: '白鴎大学足利高校', type: OrganizationType.high_school, prefecture: '栃木県' });
  await upsertOrganization({ slug: 'senshu-matsudo-high-school', nameJa: '専修大学松戸高校', type: OrganizationType.high_school, prefecture: '千葉県' });

  const edition = await prisma.competitionEdition.findUnique({ where: { slug: 'hakone-ekiden-102' } });
  if (!edition) throw new Error('Missing competition edition: hakone-ekiden-102');

  await prisma.race.upsert({
    where: { slug: 'hakone-ekiden-102-leg-3' },
    update: {
      competitionEditionId: edition.id,
      name: '3区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 3,
      sourceId: source.id,
      status: DataStatus.pending,
    },
    create: {
      slug: 'hakone-ekiden-102-leg-3',
      competitionEditionId: edition.id,
      name: '3区',
      discipline: EventDiscipline.ekiden_leg,
      leg: 3,
      sourceId: source.id,
      status: DataStatus.pending,
    },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
