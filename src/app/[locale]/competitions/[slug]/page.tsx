import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatCompetitionType, formatDate, formatDiscipline, formatRank } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/site";

type CompetitionEditionPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

export async function generateMetadata({ params }: CompetitionEditionPageProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const locale = localeParam;
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug },
    include: {
      competition: true,
      races: {
        include: {
          _count: {
            select: { raceResults: true },
          },
        },
      },
    },
  });

  if (!edition) {
    return {};
  }

  const raceCount = edition.races.length;
  const resultCount = edition.races.reduce((sum, race) => sum + race._count.raceResults, 0);
  const title = `${edition.shortName ?? edition.officialName}の結果・出場選手`;
  const description = [
    `${edition.competition.nameJa}の届次ページです。`,
    `開催日は${formatDate(edition.startsOn) || "未確認"}。`,
    `${raceCount}件の競技単位と${resultCount}件の結果を収録しています。`,
  ].join(" ");

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/competitions/${slug}`,
      languages: buildLocaleAlternates(`/competitions/${slug}`),
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/competitions/${slug}`,
    },
  };
}

export default async function CompetitionEditionPage({ params }: CompetitionEditionPageProps) {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug },
    include: {
      competition: true,
      teamCompetitionResults: {
        include: {
          legSnapshots: true,
          organization: true,
        },
      },
      source: true,
      races: {
        include: {
          source: true,
          raceResults: {
            include: {
              person: true,
              organization: true,
              source: true,
            },
            orderBy: [{ rank: "asc" }, { markMillis: "asc" }],
          },
        },
        orderBy: [{ leg: "asc" }, { startsAt: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!edition) {
    notFound();
  }

  const resultCount = edition.races.reduce((sum, race) => sum + race.raceResults.length, 0);
  const teamResults = [...edition.teamCompetitionResults].sort((left, right) => {
    const leftRank = left.finalRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.finalRank ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.organization.nameJa.localeCompare(right.organization.nameJa, "ja");
  });
  const hasEkidenTeamResults = teamResults.length > 0;
  const maxSnapshotLeg = Math.max(0, ...teamResults.flatMap((result) => result.legSnapshots.map((snapshot) => snapshot.leg)));

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={`/competitions/${edition.slug}`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]"
            href={`/${locale}/competitions`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {dictionary.competitions.backToList}
          </Link>

          <header className="border border-[#ded8cc] bg-white p-6">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
              <p>{edition.competition.nameJa}</p>
              {edition.competition.type ? (
                <span className="border border-[#ded8cc] px-2 py-1 text-[11px] tracking-[0.12em] text-[#59615c]">
                  {formatCompetitionType(edition.competition.type, locale)}
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <h1 className="text-4xl font-semibold">{edition.shortName ?? edition.officialName}</h1>
                <p className="mt-3 text-sm text-[#59615c]">
                  {formatDate(edition.startsOn) || dictionary.common.emptyDash}
                  {edition.endsOn ? ` - ${formatDate(edition.endsOn)}` : ""}
                </p>
              </div>
              <div className="flex gap-3 text-sm text-[#59615c]">
                <span className="border border-[#ded8cc] px-3 py-1">
                  {interpolate(dictionary.competitions.raceCount, { count: edition.races.length })}
                </span>
                <span className="border border-[#ded8cc] px-3 py-1">
                  {dictionary.competitions.resultCountLabel}: {resultCount}
                </span>
              </div>
            </div>
          </header>

          {hasEkidenTeamResults ? (
            <section className="space-y-5">
              <article className="border border-[#ded8cc] bg-white p-5">
                <h2 className="text-xl font-semibold">{dictionary.competitions.teamResults}</h2>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[1.4fr_100px_140px] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                      <span>{dictionary.competitions.team}</span>
                      <span>{dictionary.competitions.rank}</span>
                      <span>{dictionary.competitions.mark}</span>
                    </div>
                    <div className="divide-y divide-[#e7e1d8]">
                      {teamResults.map((result) => (
                        <div className="grid grid-cols-[1.4fr_100px_140px] px-3 py-3 text-sm" key={result.id}>
                          <Link
                            className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                            href={`/${locale}/organizations/${result.organization.slug}`}
                          >
                            {result.organization.nameJa}
                          </Link>
                          <span className="text-[#59615c]">
                            {formatRank(result.finalRank, locale) || dictionary.common.emptyDash}
                          </span>
                          <span>{result.finalMark ?? dictionary.common.emptyDash}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>

              {maxSnapshotLeg > 0 ? (
                <article className="border border-[#ded8cc] bg-white p-5">
                  <h2 className="text-xl font-semibold">{dictionary.competitions.teamSnapshots}</h2>
                  <div className="mt-4 overflow-x-auto">
                    <div className="min-w-[820px]">
                      <div className="grid grid-cols-[1.2fr_80px_120px_140px_140px] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                        <span>{dictionary.competitions.team}</span>
                        <span>{dictionary.competitions.leg}</span>
                        <span>{dictionary.competitions.cumulativeRank}</span>
                        <span>{dictionary.competitions.cumulativeMark}</span>
                        <span>{dictionary.competitions.gapFromLeader}</span>
                      </div>
                      <div className="divide-y divide-[#e7e1d8]">
                        {teamResults.map((result) =>
                          [...result.legSnapshots]
                            .sort((left, right) => left.leg - right.leg)
                            .map((snapshot, index) => (
                              <div
                                className={`grid grid-cols-[1.2fr_80px_120px_140px_140px] px-3 py-3 text-sm ${
                                  index === 0 ? "border-t border-[#d9d1c5]" : ""
                                }`}
                                key={snapshot.id}
                              >
                                {index === 0 ? (
                                  <Link
                                    className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                                    href={`/${locale}/organizations/${result.organization.slug}`}
                                  >
                                    {result.organization.nameJa}
                                  </Link>
                                ) : (
                                  <span className="text-[#c1b7aa]">{dictionary.common.emptyDash}</span>
                                )}
                                <span>{snapshot.leg}</span>
                                <span className="text-[#59615c]">
                                  {formatRank(snapshot.cumulativeRank, locale) || dictionary.common.emptyDash}
                                </span>
                                <span>{snapshot.cumulativeMark ?? dictionary.common.emptyDash}</span>
                                <span>{snapshot.gapFromLeader ?? dictionary.common.emptyDash}</span>
                              </div>
                            )),
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-5">
            <h2 className="text-xl font-semibold">{dictionary.competitions.raceUnits}</h2>
            {edition.races.map((race) => (
              <article className="border border-[#ded8cc] bg-white p-5" key={race.id}>
                <div className="flex flex-col justify-between gap-3 border-b border-[#e7e1d8] pb-4 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="text-lg font-semibold">{race.name}</h3>
                    <p className="mt-1 text-sm text-[#59615c]">
                      {formatDiscipline(race.discipline, locale)}
                      {race.startsAt ? ` / ${formatDate(race.startsAt)}` : ""}
                    </p>
                  </div>
                  {race.source?.url ? (
                    <a
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                      data-analytics-event="source_outbound_click"
                      data-analytics-link-type="competition_source"
                      href={race.source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {dictionary.competitions.source}
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>

                {race.raceResults.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <div className="min-w-[780px]">
                      <div className="grid grid-cols-[80px_1.2fr_1fr_120px_1fr] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                        <span>{dictionary.competitions.rank}</span>
                        <span>{dictionary.competitions.athlete}</span>
                        <span>{dictionary.competitions.organization}</span>
                        <span>{dictionary.competitions.mark}</span>
                        <span>{dictionary.competitions.notes}</span>
                      </div>
                      <div className="divide-y divide-[#e7e1d8]">
                        {race.raceResults.map((result) => (
                          <div
                            className="grid grid-cols-[80px_1.2fr_1fr_120px_1fr] px-3 py-3 text-sm"
                            key={result.id}
                          >
                            <span className="text-[#59615c]">
                              {formatRank(result.rank, locale) || dictionary.common.emptyDash}
                            </span>
                            <Link
                              className="font-semibold text-[#8a1f2d] underline-offset-4 hover:underline"
                              data-analytics-event="player_profile_view"
                              data-analytics-link-type="competition_result_player"
                              href={`/${locale}/players/${result.person.slug}`}
                            >
                              {result.person.displayNameJa}
                            </Link>
                            {result.organization ? (
                              <Link
                                className="text-[#59615c] underline-offset-4 hover:text-[#8a1f2d] hover:underline"
                                data-analytics-event="player_to_organization_click"
                                data-analytics-link-type="competition_result_organization"
                                href={`/${locale}/organizations/${result.organization.slug}`}
                              >
                                {result.organization.nameJa}
                              </Link>
                            ) : (
                              <span className="text-[#59615c]">{dictionary.common.emptyDash}</span>
                            )}
                            <span>{result.mark ?? dictionary.common.notEntered}</span>
                            <span className="text-[#59615c]">{result.notes ?? dictionary.common.emptyDash}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[#59615c]">{dictionary.competitions.emptyResults}</p>
                )}
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
