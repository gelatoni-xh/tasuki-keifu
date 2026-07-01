import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatCompetitionType, formatDate, formatDiscipline, formatRaceMark, formatRank, formatRankWithNotes } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/site";

type CompetitionEditionPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    raceUnit?: string;
  }>;
};

function getCompetitionSeoTier({
  raceCount,
  resultCount,
  teamResultCount,
}: {
  raceCount: number;
  resultCount: number;
  teamResultCount: number;
}) {
  if (raceCount >= 6 && resultCount >= 100 && teamResultCount >= 1) {
    return "primary";
  }

  if (resultCount >= 10 || raceCount >= 2) {
    return "secondary";
  }

  return "thin";
}

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
      teamCompetitionResults: {
        select: { id: true },
      },
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
  const teamResultCount = edition.teamCompetitionResults?.length ?? 0;
  const seoTier = getCompetitionSeoTier({ raceCount, resultCount, teamResultCount });
  const title = `${edition.shortName ?? edition.officialName}の結果・出場選手`;
  const description = [
    `${edition.competition.nameJa}の届次ページです。`,
    `開催日は${formatDate(edition.startsOn) || "未確認"}。`,
    `${raceCount}件の競技単位と${resultCount}件の結果を収録しています。`,
  ].join(" ");

  const metadata = buildPageMetadata({
    title,
    description,
    path: `/competitions/${slug}`,
    locale,
    keywords: [
      edition.competition.nameJa,
      edition.shortName ?? edition.officialName,
      "駅伝結果",
      "出場選手",
    ],
  });

  if (seoTier === "thin") {
    metadata.robots = {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    };
  }

  return metadata;
}

export default async function CompetitionEditionPage({ params, searchParams }: CompetitionEditionPageProps) {
  const { locale: localeParam, slug } = await params;
  const queryParams = searchParams ? await searchParams : {};

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

  const editionSlug = edition.slug;

  const resultCount = edition.races.reduce((sum, race) => sum + race.raceResults.length, 0);
  const seoTier = getCompetitionSeoTier({
    raceCount: edition.races.length,
    resultCount,
    teamResultCount: edition.teamCompetitionResults.length,
  });
  const teamResults = [...edition.teamCompetitionResults].sort((left, right) => {
    const leftRank = left.finalRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.finalRank ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.organization.nameJa.localeCompare(right.organization.nameJa, "ja");
  });
  const totalTeamSnapshotCount = teamResults.reduce((sum, result) => sum + result.legSnapshots.length, 0);
  const hasEkidenTeamResults = teamResults.length > 0;
  const maxSnapshotLeg = Math.max(0, ...teamResults.flatMap((result) => result.legSnapshots.map((snapshot) => snapshot.leg)));
  const hasRaceUnits = edition.races.length > 0;
  const leadingOrganizations = teamResults.slice(0, 5).map((result) => result.organization.nameJa);
  const sampledAthletes = edition.races
    .flatMap((race) => race.raceResults.slice(0, 3).map((result) => result.person.displayNameJa))
    .filter((name, index, list) => list.indexOf(name) === index)
    .slice(0, 8);
  const availableTabs = [
    { key: "overview", label: dictionary.competitions.tabOverview, enabled: true },
    { key: "team-results", label: dictionary.competitions.tabTeamResults, enabled: hasEkidenTeamResults },
    { key: "snapshots", label: dictionary.competitions.tabSnapshots, enabled: maxSnapshotLeg > 0 },
    { key: "race-units", label: dictionary.competitions.tabRaceUnits, enabled: hasRaceUnits },
  ].filter((tab) => tab.enabled);
  const requestedTab = queryParams.tab;
  const activeTab = availableTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab!
    : availableTabs[0]?.key ?? "overview";
  const selectedRaceUnit =
    activeTab === "race-units"
      ? edition.races.find((race) => race.slug === queryParams.raceUnit) ?? edition.races[0] ?? null
      : null;

  function formatRepresentativeLabel(notes: string | null | undefined, prefecture: string | null | undefined) {
    if (notes?.startsWith("地区代表:")) {
      return notes.replace("地区代表:", "");
    }

    if (notes === "都道府県代表") {
      return prefecture ?? dictionary.common.emptyDash;
    }

    return prefecture ?? dictionary.common.emptyDash;
  }

  function formatRaceResultNotes(notes: string | null | undefined) {
    if (!notes) {
      return dictionary.common.emptyDash;
    }

    if (notes === "都道府県代表" || notes.startsWith("地区代表:")) {
      return dictionary.common.emptyDash;
    }

    return notes;
  }

  function buildCompetitionEditionHref(tab: string, raceUnit?: string) {
    const params = new URLSearchParams({ tab });

    if (tab === "race-units" && raceUnit) {
      params.set("raceUnit", raceUnit);
    }

    return `/${locale}/competitions/${editionSlug}?${params.toString()}`;
  }

  const competitionSummary = [
    `${edition.shortName ?? edition.officialName}は、${edition.competition.nameJa}の届次データページです。`,
    `${edition.races.length}件の競技単位と${resultCount}件の結果を収録しています。`,
    hasEkidenTeamResults ? `${teamResults.length}チームの成績を掲載しています。` : null,
    leadingOrganizations.length > 0 ? `上位・主要チームとして${leadingOrganizations.join("、")}などを確認できます。` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const competitionJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: edition.officialName,
    alternateName: edition.shortName ?? undefined,
    description: competitionSummary,
    startDate: edition.startsOn?.toISOString(),
    endDate: edition.endsOn?.toISOString() ?? edition.startsOn?.toISOString(),
    eventStatus: "https://schema.org/EventCompleted",
    sport: "Ekiden",
    url: `https://tasukikeifu.com/${locale}/competitions/${edition.slug}`,
    isPartOf: {
      "@type": "SportsEvent",
      name: edition.competition.nameJa,
    },
    competitor: teamResults.slice(0, 12).map((result) => ({
      "@type": "SportsOrganization",
      name: result.organization.nameJa,
      url: `https://tasukikeifu.com/${locale}/organizations/${result.organization.slug}`,
    })),
    performer: sampledAthletes.map((name) => ({
      "@type": "Person",
      name,
    })),
    organizer: edition.competition.organizer
      ? {
          "@type": "Organization",
          name: edition.competition.organizer,
        }
      : undefined,
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "襷の系譜",
        item: `https://tasukikeifu.com/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "大会一覧",
        item: `https://tasukikeifu.com/${locale}/competitions`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: edition.shortName ?? edition.officialName,
        item: `https://tasukikeifu.com/${locale}/competitions/${edition.slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(competitionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
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
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#59615c]">
                  {competitionSummary}
                </p>
              </div>
              <div className="flex gap-3 text-sm text-[#59615c]">
                <span className="border border-[#ded8cc] px-3 py-1">
                  {interpolate(dictionary.competitions.raceCount, { count: edition.races.length })}
                </span>
                <span className="border border-[#ded8cc] px-3 py-1">
                  {dictionary.competitions.resultCountLabel}: {resultCount}
                </span>
                <span
                  className={`border px-3 py-1 ${
                    seoTier === "primary"
                      ? "border-[#c9d7c6] bg-[#eef6ec] text-[#29543a]"
                      : seoTier === "secondary"
                        ? "border-[#d8cfbf] bg-[#f6f1e8] text-[#7a5d2d]"
                        : "border-[#ded8cc] bg-white text-[#59615c]"
                  }`}
                >
                  {seoTier === "primary" ? "Complete page" : seoTier === "secondary" ? "Growing page" : "Seed page"}
                </span>
              </div>
            </div>
          </header>

          <section className="space-y-5">
            <nav className="border border-[#ded8cc] bg-[#f6f1e8] p-2" aria-label={dictionary.competitions.tabNav}>
              <div className="flex flex-wrap gap-2">
                {availableTabs.map((tab) => (
                  <Link
                    key={tab.key}
                    className={`px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.key
                        ? "bg-[#8a1f2d] text-white"
                        : "bg-white text-[#6b5f54] hover:bg-[#efe7db] hover:text-[#8a1f2d]"
                    }`}
                    href={buildCompetitionEditionHref(tab.key, tab.key === "race-units" ? selectedRaceUnit?.slug : undefined)}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            </nav>

            {activeTab === "overview" ? (
              <article className="border border-[#ded8cc] bg-white p-5">
                <h2 className="text-xl font-semibold">{dictionary.competitions.tabOverview}</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-[#e7e1d8] bg-[#fcfaf6] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">
                      {dictionary.competitions.teamResults}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{teamResults.length}</p>
                  </div>
                  <div className="border border-[#e7e1d8] bg-[#fcfaf6] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">
                      {dictionary.competitions.teamSnapshots}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{totalTeamSnapshotCount}</p>
                  </div>
                  <div className="border border-[#e7e1d8] bg-[#fcfaf6] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">
                      {dictionary.competitions.raceUnits}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{edition.races.length}</p>
                  </div>
                  <div className="border border-[#e7e1d8] bg-[#fcfaf6] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a1f2d]">
                      {dictionary.competitions.resultCountLabel}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{resultCount}</p>
                  </div>
                </div>

                {hasEkidenTeamResults ? (
                  <div className="mt-6 border border-[#e7e1d8] p-4">
                    <h3 className="text-base font-semibold">{dictionary.competitions.teamResults}</h3>
                    <div className="mt-4 space-y-3">
                      {teamResults.slice(0, 5).map((result) => (
                        <div className="flex items-center justify-between border-b border-[#efe7db] pb-3 last:border-b-0 last:pb-0" key={result.id}>
                          <Link
                            className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                            href={`/${locale}/organizations/${result.organization.slug}`}
                          >
                            {result.organization.nameJa}
                          </Link>
                          <div className="text-right text-sm text-[#59615c]">
                            <p>{formatRankWithNotes(result.finalRank, result.notes, locale) || dictionary.common.emptyDash}</p>
                            <p>{result.finalMark ? formatRaceMark(result.finalMark, locale) : dictionary.common.emptyDash}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ) : null}

            {activeTab === "team-results" && hasEkidenTeamResults ? (
              <article className="border border-[#ded8cc] bg-white p-5">
                <h2 className="text-xl font-semibold">{dictionary.competitions.teamResults}</h2>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[1.2fr_120px_100px_140px] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                      <span>{dictionary.competitions.team}</span>
                      <span>{dictionary.competitions.area}</span>
                      <span>{dictionary.competitions.rank}</span>
                      <span>{dictionary.competitions.mark}</span>
                    </div>
                    <div className="divide-y divide-[#e7e1d8]">
                      {teamResults.map((result) => (
                        <div className="grid grid-cols-[1.2fr_120px_100px_140px] px-3 py-3 text-sm" key={result.id}>
                          <Link
                            className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                            href={`/${locale}/organizations/${result.organization.slug}`}
                          >
                            {result.organization.nameJa}
                          </Link>
                          <span className="text-[#59615c]">
                            {formatRepresentativeLabel(result.notes, result.organization.prefecture)}
                          </span>
                          <span className="text-[#59615c]">
                            {formatRankWithNotes(result.finalRank, result.notes, locale) || dictionary.common.emptyDash}
                          </span>
                          <span>{result.finalMark ? formatRaceMark(result.finalMark, locale) : dictionary.common.emptyDash}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            {activeTab === "snapshots" && maxSnapshotLeg > 0 ? (
              <article className="border border-[#ded8cc] bg-white p-5">
                <h2 className="text-xl font-semibold">{dictionary.competitions.teamSnapshots}</h2>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[820px]">
                    <div className="grid grid-cols-[1.1fr_120px_80px_120px_140px_140px] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                      <span>{dictionary.competitions.team}</span>
                      <span>{dictionary.competitions.area}</span>
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
                              className={`grid grid-cols-[1.1fr_120px_80px_120px_140px_140px] px-3 py-3 text-sm ${
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
                              <span className={index === 0 ? "text-[#59615c]" : "text-[#c1b7aa]"}>
                                {index === 0
                                  ? formatRepresentativeLabel(result.notes, result.organization.prefecture)
                                  : dictionary.common.emptyDash}
                              </span>
                              <span>{snapshot.leg}</span>
                              <span className="text-[#59615c]">
                                {formatRankWithNotes(snapshot.cumulativeRank, snapshot.notes, locale) || dictionary.common.emptyDash}
                              </span>
                              <span>{snapshot.cumulativeMark ? formatRaceMark(snapshot.cumulativeMark, locale) : dictionary.common.emptyDash}</span>
                              <span>{snapshot.gapFromLeader ? formatRaceMark(snapshot.gapFromLeader, locale) : dictionary.common.emptyDash}</span>
                            </div>
                          )),
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            {activeTab === "race-units" ? (
              <section className="space-y-5">
                <h2 className="text-xl font-semibold">{dictionary.competitions.raceUnits}</h2>
                {edition.races.length > 0 ? (
                  <>
                    <nav className="border border-[#ded8cc] bg-[#f6f1e8] p-3" aria-label={dictionary.competitions.raceUnits}>
                      <div className="flex flex-wrap gap-2">
                        {edition.races.map((race) => {
                          const isActiveRace = selectedRaceUnit?.id === race.id;

                          return (
                            <Link
                              key={race.id}
                              className={`px-4 py-2 text-sm font-semibold transition ${
                                isActiveRace
                                  ? "bg-[#8a1f2d] text-white"
                                  : "bg-white text-[#6b5f54] hover:bg-[#efe7db] hover:text-[#8a1f2d]"
                              }`}
                              href={buildCompetitionEditionHref("race-units", race.slug)}
                            >
                              {race.name}
                            </Link>
                          );
                        })}
                      </div>
                    </nav>

                    {selectedRaceUnit ? (
                      <article className="border border-[#ded8cc] bg-white p-5">
                        <div className="flex flex-col justify-between gap-3 border-b border-[#e7e1d8] pb-4 sm:flex-row sm:items-start">
                          <div>
                            <h3 className="text-lg font-semibold">{selectedRaceUnit.name}</h3>
                            <p className="mt-1 text-sm text-[#59615c]">
                              {formatDiscipline(selectedRaceUnit.discipline, locale)}
                              {selectedRaceUnit.startsAt ? ` / ${formatDate(selectedRaceUnit.startsAt)}` : ""}
                            </p>
                          </div>
                          {selectedRaceUnit.source?.url ? (
                            <a
                              className="inline-flex items-center gap-1 text-sm font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                              data-analytics-event="source_outbound_click"
                              data-analytics-link-type="competition_source"
                              href={selectedRaceUnit.source.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {dictionary.competitions.source}
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>

                        {selectedRaceUnit.raceResults.length > 0 ? (
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
                                {selectedRaceUnit.raceResults.map((result) => (
                                  <div
                                    className="grid grid-cols-[80px_1.2fr_1fr_120px_1fr] px-3 py-3 text-sm"
                                    key={result.id}
                                  >
                                    <span className="text-[#59615c]">
                                      {formatRankWithNotes(result.rank, result.notes, locale) || dictionary.common.emptyDash}
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
                                    <span>{result.mark ? formatRaceMark(result.mark, locale) : dictionary.common.notEntered}</span>
                                    <span className="text-[#59615c]">{formatRaceResultNotes(result.notes)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-[#59615c]">{dictionary.competitions.emptyResults}</p>
                        )}
                      </article>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
