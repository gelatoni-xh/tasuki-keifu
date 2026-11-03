import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { RaceResultsTable } from "@/components/race-results-table";
import { buildCompetitionRacePath, getCompetitionRace } from "@/lib/competition-races";
import { formatCompetitionDate } from "@/lib/competition-display";
import { formatDiscipline } from "@/lib/format";
import { getDictionary, isLocale } from "@/lib/i18n";
import { buildLocalizedUrl, buildPageMetadata } from "@/lib/site";
import { MIN_INDEXABLE_RACE_FINISHERS } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string; raceSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug, raceSlug } = await params;
  if (!isLocale(locale)) return {};
  const race = await getCompetitionRace(slug, raceSlug);
  if (!race) return {};
  const edition = race.competitionEdition;
  const metadata = buildPageMetadata({
    locale,
    path: buildCompetitionRacePath(slug, raceSlug),
    title: `${edition.shortName ?? edition.officialName} ${race.name} | 結果・順位・記録`,
    description: `${edition.officialName}の${race.name}の結果。${race.raceResults.length}件の出場選手・順位・記録と所属を掲載し、各選手の大会成績・PB・所属履歴を確認できます。`,
  });
  if (race.raceResults.filter((result) => result.mark !== null && ((result.markMillis ?? 0) > 0 || (result.rank ?? 0) > 0)).length < MIN_INDEXABLE_RACE_FINISHERS) {
    metadata.robots = { index: false, follow: true, googleBot: { index: false, follow: true } };
  }
  return metadata;
}

export default async function CompetitionRacePage({ params }: Props) {
  const { locale, slug, raceSlug } = await params;
  if (!isLocale(locale)) notFound();
  const race = await getCompetitionRace(slug, raceSlug);
  if (!race) notFound();
  const edition = race.competitionEdition;
  const dictionary = getDictionary(locale);
  const path = buildCompetitionRacePath(slug, raceSlug);
  const source = race.source ?? edition.source;
  const breadcrumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.competitions.listTitle, item: buildLocalizedUrl(locale, "/competitions") },
      { "@type": "ListItem", position: 2, name: edition.officialName, item: buildLocalizedUrl(locale, `/competitions/${slug}`) },
      { "@type": "ListItem", position: 3, name: race.name, item: buildLocalizedUrl(locale, path) },
    ],
  };
  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }} />
      <SiteHeader locale={locale} path={path} />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
        <Link className="text-sm text-[#8a1f2d] hover:underline" href={`/${locale}/competitions/${slug}`}>{edition.officialName}</Link>
        <article className="border border-[#ded8cc] bg-white p-5">
          <h1 className="text-2xl font-semibold">{edition.shortName ?? edition.officialName} {race.name}</h1>
          <p className="mt-3 text-sm text-[#59615c]">{formatDiscipline(race.discipline, locale)} / {formatCompetitionDate(race.startsAt ?? edition.startsOn)} / {dictionary.competitions.resultCountLabel}: {race.raceResults.length}</p>
          {source?.url ? <a className="mt-3 inline-block text-sm text-[#8a1f2d] hover:underline" href={source.url} target="_blank" rel="noreferrer">{dictionary.competitions.source}: {source.name}</a> : null}
          {race.raceResults.length ? <RaceResultsTable locale={locale} results={race.raceResults} /> : <p className="mt-4 text-sm">{dictionary.competitions.emptyResults}</p>}
        </article>
      </main>
    </div>
  );
}
