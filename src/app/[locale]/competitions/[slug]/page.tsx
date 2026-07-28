import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getScopeVersion } from "@/lib/cache-invalidation";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getCachedValue } from "@/lib/server-cache";
import { formatCompetitionType, formatDate, formatDiscipline, formatRaceMark, formatRaceResultNotes, formatRankWithNotes } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { isPublicCompetitionType } from "@/lib/public-competitions";
import { getCompetitionSeoTier, shouldIndexCompetitionPage } from "@/lib/seo";
import { buildLocalizedUrl, buildPageMetadata } from "@/lib/site";

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

const COMPETITION_METADATA_CACHE_TTL_MS = 1000 * 60 * 5;
const COMPETITION_DETAIL_CACHE_TTL_MS = 1000 * 60 * 2;
const pageLogger = createLogger("competition-detail-page");
const DISCIPLINE_DISTANCE_ORDER: Record<string, number> = {
  m800: 800,
  m1500: 1500,
  m2000sc: 2000,
  m3000: 3000,
  m3000sc: 3000,
  m5000: 5000,
  m10000: 10000,
  ten_mile: 16093,
  half_marathon: 21098,
  marathon: 42195,
  ekiden_leg: Number.MAX_SAFE_INTEGER,
};

function parseHeatOrder(heat: string | null | undefined) {
  if (!heat) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = heat.match(/(\d+)/u);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function parseRoundOrder(round: string | null | undefined) {
  switch (round) {
    case "予選":
      return 1;
    case "準決勝":
      return 2;
    case "決勝":
      return 3;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function parseDivisionOrder(name: string) {
  const match = name.match(/(\d+)部/u);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

function compareRaceUnits(
  left: { discipline: string; distanceMeters?: number | null; round?: string | null; heat?: string | null; name: string; startsAt?: Date | null },
  right: { discipline: string; distanceMeters?: number | null; round?: string | null; heat?: string | null; name: string; startsAt?: Date | null },
) {
  const leftDistance = left.distanceMeters ?? DISCIPLINE_DISTANCE_ORDER[left.discipline] ?? Number.MAX_SAFE_INTEGER;
  const rightDistance = right.distanceMeters ?? DISCIPLINE_DISTANCE_ORDER[right.discipline] ?? Number.MAX_SAFE_INTEGER;
  if (leftDistance !== rightDistance) {
    return leftDistance - rightDistance;
  }

  const leftIsSc = left.discipline.endsWith("sc");
  const rightIsSc = right.discipline.endsWith("sc");
  if (leftIsSc !== rightIsSc) {
    return leftIsSc ? 1 : -1;
  }

  const leftDivision = parseDivisionOrder(left.name);
  const rightDivision = parseDivisionOrder(right.name);
  if (leftDivision !== rightDivision) {
    return leftDivision - rightDivision;
  }

  const leftRound = parseRoundOrder(left.round);
  const rightRound = parseRoundOrder(right.round);
  if (leftRound !== rightRound) {
    return leftRound - rightRound;
  }

  const leftHeat = parseHeatOrder(left.heat);
  const rightHeat = parseHeatOrder(right.heat);
  if (leftHeat !== rightHeat) {
    return leftHeat - rightHeat;
  }

  const leftStart = left.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  return left.name.localeCompare(right.name, "ja");
}

function buildCompetitionKeywordVariants(edition: {
  competition: { nameJa: string };
  officialName: string;
  shortName: string | null;
  year: number;
  editionNumber: number | null;
}) {
  const baseName = edition.competition.nameJa;
  const variants = [baseName, edition.shortName ?? "", edition.officialName, `${baseName} ${edition.year}`, `${baseName}${edition.year}`];

  if (edition.editionNumber !== null) {
    variants.push(`${baseName} ${edition.editionNumber}回`, `${baseName}${edition.editionNumber}回`);
  }

  return Array.from(new Set(variants.filter(Boolean)));
}

function formatCompetitionEditionDisplayName(edition: {
  competition: { nameJa: string };
  officialName: string;
  shortName: string | null;
  editionNumber: number | null;
}) {
  if (edition.editionNumber !== null) {
    return `第${edition.editionNumber}回 ${edition.competition.nameJa}`;
  }

  return edition.shortName ?? edition.officialName;
}

export async function generateMetadata({ params }: CompetitionEditionPageProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const locale = localeParam;
  const competitionScopeVersion = await getScopeVersion("competition-detail");
  const edition = await getCachedValue(`competition:metadata:${slug}:${competitionScopeVersion}`, COMPETITION_METADATA_CACHE_TTL_MS, async () =>
    prisma.competitionEdition.findUnique({
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
    }),
  );

  if (!edition) {
    return {};
  }

  if (!isPublicCompetitionType(edition.competition.type)) {
    return {};
  }

  const raceCount = edition.races.length;
  const resultCount = edition.races.reduce((sum, race) => sum + race._count.raceResults, 0);
  const teamResultCount = edition.teamCompetitionResults?.length ?? 0;
  const keywordVariants = buildCompetitionKeywordVariants(edition);
  const displayName = formatCompetitionEditionDisplayName(edition);
  const title = `${displayName} | 結果・出場選手・大会記録`;
  const description = [
    `${edition.year}年開催の${displayName}の結果ページです。`,
    `${edition.competition.nameJa}の出場選手、順位、記録をまとめて確認できます。`,
    `開催日は${formatDate(edition.startsOn) || "未確認"}。`,
    `${raceCount}件の競技単位、${resultCount}件の個人成績、${teamResultCount}件のチーム成績を収録しています。`,
  ].join(" ");

  const metadata = buildPageMetadata({
    title,
    description,
    path: `/competitions/${slug}`,
    locale,
    keywords: [
      ...keywordVariants,
      ...keywordVariants.map((name) => `${name} 結果`),
      ...keywordVariants.map((name) => `${name} 出場選手`),
      ...keywordVariants.map((name) => `${name} 記録`),
      "駅伝結果",
      "出場選手",
    ],
  });

  if (!shouldIndexCompetitionPage({
    raceCount,
    resultCount,
    teamResultCount,
  })) {
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
    pageLogger.warn("page_not_found", {
      path: "/[locale]/competitions/[slug]",
      locale: localeParam,
      slug,
      reason: "invalid_locale",
    });
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const competitionScopeVersion = await getScopeVersion("competition-detail");
  const edition = await getCachedValue(`competition:detail:${slug}:base:${competitionScopeVersion}`, COMPETITION_DETAIL_CACHE_TTL_MS, async () =>
    prisma.competitionEdition.findUnique({
      where: { slug },
      include: {
        competition: true,
        source: true,
        races: {
          select: {
            id: true,
            slug: true,
            name: true,
            discipline: true,
            round: true,
            heat: true,
            leg: true,
            distanceMeters: true,
            startsAt: true,
            source: true,
            _count: {
              select: {
                raceResults: true,
              },
            },
          },
          orderBy: [{ leg: "asc" }, { startsAt: "asc" }, { name: "asc" }],
        },
      },
    }),
  );

  if (!edition) {
    pageLogger.info("page_not_found", {
      path: `/${locale}/competitions/${slug}`,
      locale,
      slug,
      reason: "competition_missing",
    });
    notFound();
  }

  if (!isPublicCompetitionType(edition.competition.type)) {
    pageLogger.info("page_not_found", {
      path: `/${locale}/competitions/${slug}`,
      locale,
      slug,
      reason: "competition_not_public",
      competition_type: edition.competition.type,
    });
    notFound();
  }

  const editionSlug = edition.slug;
  const sortedRaces = [...edition.races].sort(compareRaceUnits);
  const displayName = formatCompetitionEditionDisplayName(edition);

  const resultCount = sortedRaces.reduce((sum, race) => sum + race._count.raceResults, 0);
  const teamResultCount = await getCachedValue(`competition:detail:${edition.id}:team-result-count:${competitionScopeVersion}`, COMPETITION_DETAIL_CACHE_TTL_MS, async () =>
    prisma.teamCompetitionResult.count({
      where: {
        competitionEditionId: edition.id,
      },
    }),
  );
  const latestSnapshot = await getCachedValue(`competition:detail:${edition.id}:latest-snapshot:${competitionScopeVersion}`, COMPETITION_DETAIL_CACHE_TTL_MS, async () =>
    prisma.teamCompetitionLegSnapshot.findFirst({
      where: {
        teamCompetitionResult: {
          competitionEditionId: edition.id,
        },
      },
      orderBy: {
        leg: "desc",
      },
      select: {
        leg: true,
      },
    }),
  );
  const seoTier = getCompetitionSeoTier({
    raceCount: edition.races.length,
    resultCount,
    teamResultCount,
  });
  const isEkidenCompetition = edition.competition.type?.includes("ekiden") ?? false;
  const hasEkidenTeamResults = teamResultCount > 0;
  const maxSnapshotLeg = latestSnapshot?.leg ?? 0;
  const hasRaceUnits = sortedRaces.length > 0;
  const availableTabs = [
    { key: "overview", label: dictionary.competitions.tabOverview, enabled: isEkidenCompetition },
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
      ? sortedRaces.find((race) => race.slug === queryParams.raceUnit) ?? sortedRaces[0] ?? null
      : null;
  const needsTeamResults = (isEkidenCompetition && activeTab === "overview") || activeTab === "team-results" || activeTab === "snapshots";
  const needsSnapshots = (isEkidenCompetition && activeTab === "overview") || activeTab === "snapshots";
  const teamResults = needsTeamResults
    ? await getCachedValue(`competition:detail:${edition.id}:team-results:${needsSnapshots ? "with-snapshots" : "summary"}:${competitionScopeVersion}`, COMPETITION_DETAIL_CACHE_TTL_MS, async () =>
        prisma.teamCompetitionResult.findMany({
          where: {
            competitionEditionId: edition.id,
          },
          include: {
            organization: true,
            ...(needsSnapshots
              ? {
                  legSnapshots: {
                    orderBy: {
                      leg: "asc",
                    },
                  },
                }
              : {}),
          },
          orderBy: [{ finalRank: "asc" }, { organization: { nameJa: "asc" } }],
        }),
      )
    : [];
  const totalTeamSnapshotCount = needsSnapshots
    ? teamResults.reduce((sum, result) => sum + ("legSnapshots" in result ? result.legSnapshots.length : 0), 0)
    : 0;
  const leadingOrganizations = teamResults.slice(0, 5).map((result) => result.organization.nameJa);
  const selectedRaceUnitDetails =
    activeTab === "race-units" && selectedRaceUnit
      ? await getCachedValue(`competition:detail:${edition.id}:race-unit:${selectedRaceUnit.id}:${competitionScopeVersion}`, COMPETITION_DETAIL_CACHE_TTL_MS, async () =>
          prisma.race.findUnique({
            where: {
              id: selectedRaceUnit.id,
            },
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
          }),
        )
      : null;

  pageLogger.info("page_rendered", {
    path: `/${locale}/competitions/${slug}`,
    locale,
    slug,
    tab: activeTab,
    race_count: sortedRaces.length,
    result_count: resultCount,
    team_result_count: teamResultCount,
    snapshot_count: totalTeamSnapshotCount,
    seo_tier: seoTier,
  });

  function formatRepresentativeLabel(notes: string | null | undefined, prefecture: string | null | undefined) {
    if (notes?.startsWith("地区代表:")) {
      return notes.replace("地区代表:", "");
    }

    if (notes === "都道府県代表") {
      return prefecture ?? dictionary.common.emptyDash;
    }

    return prefecture ?? dictionary.common.emptyDash;
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
    `${sortedRaces.length}件の競技単位と${resultCount}件の結果を収録しています。`,
    hasEkidenTeamResults ? `${teamResults.length}チームの成績を掲載しています。` : null,
    leadingOrganizations.length > 0 ? `上位・主要チームとして${leadingOrganizations.join("、")}などを確認できます。` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const competitionJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: edition.officialName,
    alternateName: edition.shortName ?? undefined,
    description: competitionSummary,
    url: `https://tasukikeifu.com/${locale}/competitions/${edition.slug}`,
    inLanguage: locale,
    dateModified: edition.updatedAt.toISOString(),
    temporalCoverage: edition.startsOn
      ? edition.endsOn
        ? `${edition.startsOn.toISOString()}/${edition.endsOn.toISOString()}`
        : edition.startsOn.toISOString()
      : edition.year.toString(),
    spatialCoverage: edition.competition.region
      ? {
          "@type": "Place",
          name: edition.competition.region,
          address: {
            "@type": "PostalAddress",
            addressCountry: "JP",
            ...(edition.competition.region !== "国際" ? { addressRegion: edition.competition.region } : {}),
          },
        }
      : undefined,
    keywords: [
      edition.competition.nameJa,
      edition.shortName ?? edition.officialName,
      "駅伝",
      "大会結果",
      "区間記録",
    ],
    publisher: {
      "@type": "Organization",
      name: "襷の系譜",
      url: "https://tasukikeifu.com",
    },
    creator: edition.competition.organizer
      ? {
          "@type": "Organization",
          name: edition.competition.organizer,
        }
      : undefined,
  };
  const competitionEventJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: displayName,
    alternateName: edition.shortName ?? undefined,
    description: competitionSummary,
    startDate: edition.startsOn?.toISOString(),
    endDate: edition.endsOn?.toISOString() ?? edition.startsOn?.toISOString(),
    eventStatus:
      edition.endsOn && edition.endsOn < new Date()
        ? "https://schema.org/EventCompleted"
        : edition.startsOn && edition.startsOn < new Date()
          ? "https://schema.org/EventCompleted"
          : "https://schema.org/EventScheduled",
    organizer: {
      "@type": "Organization",
      name: edition.competition.organizer ?? "襷の系譜",
      url: "https://tasukikeifu.com",
    },
    location: {
      "@type": "Place",
      name: edition.competition.region ?? displayName,
      address: {
        "@type": "PostalAddress",
        addressCountry: "JP",
        ...(edition.competition.region && edition.competition.region !== "国際"
          ? { addressRegion: edition.competition.region }
          : {}),
      },
    },
    performer: teamResults.slice(0, 10).map((result) => ({
      "@type": "SportsOrganization",
      name: result.organization.nameJa,
      url: buildLocalizedUrl(locale, `/organizations/${result.organization.slug}`),
    })),
    url: `https://tasukikeifu.com/${locale}/competitions/${edition.slug}`,
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
  const isNationalPrefecturalEkiden = edition.competition.slug.startsWith("national-prefectural-ekiden-");
  const hidesRepresentativeArea = hasEkidenTeamResults && teamResults.every((result) => result.notes?.startsWith("都道府県代表"));
  const teamResultsGridClass = hidesRepresentativeArea
    ? "grid grid-cols-[1.2fr_100px_140px]"
    : "grid grid-cols-[1.2fr_120px_100px_140px]";
  const hidesGapFromLeader = isNationalPrefecturalEkiden;
  const snapshotGridClass = hidesRepresentativeArea
    ? hidesGapFromLeader
      ? "grid grid-cols-[1.1fr_80px_120px_140px]"
      : "grid grid-cols-[1.1fr_80px_120px_140px_140px]"
    : hidesGapFromLeader
      ? "grid grid-cols-[1.1fr_120px_80px_120px_140px]"
      : "grid grid-cols-[1.1fr_120px_80px_120px_140px_140px]";

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(competitionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(competitionEventJsonLd) }}
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
                <h1 className="text-4xl font-semibold">{displayName}</h1>
                <p className="mt-3 text-sm text-[#59615c]">
                  {formatDate(edition.startsOn) || dictionary.common.emptyDash}
                  {edition.endsOn ? ` - ${formatDate(edition.endsOn)}` : ""}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#59615c]">
                  {competitionSummary}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  {teamResults.slice(0, 5).map((result) => (
                    <Link
                      className="border border-[#ded8cc] px-3 py-1 text-[#8a1f2d] underline-offset-4 hover:underline"
                      data-analytics-event="competition_to_organization_click"
                      data-analytics-link-type="competition_header_team"
                      href={`/${locale}/organizations/${result.organization.slug}`}
                      key={result.id}
                    >
                      {result.organization.nameJa}
                    </Link>
                  ))}
                  {sortedRaces.slice(0, 3).map((race) => (
                    <Link
                      className="border border-[#ded8cc] px-3 py-1 text-[#8a1f2d] underline-offset-4 hover:underline"
                      data-analytics-event="competition_tab_navigation"
                      data-analytics-link-type="competition_header_race_unit"
                      href={buildCompetitionEditionHref("race-units", race.slug)}
                      key={race.id}
                    >
                      {race.name}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 text-sm text-[#59615c]">
                <span className="border border-[#ded8cc] px-3 py-1">
                  {interpolate(dictionary.competitions.raceCount, { count: sortedRaces.length })}
                </span>
                <span className="border border-[#ded8cc] px-3 py-1">
                  {dictionary.competitions.resultCountLabel}: {resultCount}
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
                    <p className="mt-2 text-3xl font-semibold">{sortedRaces.length}</p>
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
                    <div className={`${teamResultsGridClass} bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]`}>
                      <span>{dictionary.competitions.team}</span>
                      {!hidesRepresentativeArea ? <span>{dictionary.competitions.area}</span> : null}
                      <span>{dictionary.competitions.rank}</span>
                      <span>{dictionary.competitions.mark}</span>
                    </div>
                    <div className="divide-y divide-[#e7e1d8]">
                      {teamResults.map((result) => (
                        <div className={`${teamResultsGridClass} px-3 py-3 text-sm`} key={result.id}>
                          <Link
                            className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                            href={`/${locale}/organizations/${result.organization.slug}`}
                          >
                            {result.organization.nameJa}
                          </Link>
                          {!hidesRepresentativeArea ? (
                            <span className="text-[#59615c]">
                              {formatRepresentativeLabel(result.notes, result.organization.prefecture)}
                            </span>
                          ) : null}
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
                    <div className={`${snapshotGridClass} bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]`}>
                      <span>{dictionary.competitions.team}</span>
                      {!hidesRepresentativeArea ? <span>{dictionary.competitions.area}</span> : null}
                      <span>{dictionary.competitions.leg}</span>
                      <span>{dictionary.competitions.cumulativeRank}</span>
                      <span>{dictionary.competitions.cumulativeMark}</span>
                      {!hidesGapFromLeader ? <span>{dictionary.competitions.gapFromLeader}</span> : null}
                    </div>
                    <div className="divide-y divide-[#e7e1d8]">
                      {teamResults.map((result) =>
                        [...result.legSnapshots]
                          .sort((left, right) => left.leg - right.leg)
                          .map((snapshot, index) => (
                            <div
                              className={`${snapshotGridClass} px-3 py-3 text-sm ${
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
                              {!hidesRepresentativeArea ? (
                                <span className={index === 0 ? "text-[#59615c]" : "text-[#c1b7aa]"}>
                                  {index === 0
                                    ? formatRepresentativeLabel(result.notes, result.organization.prefecture)
                                    : dictionary.common.emptyDash}
                                </span>
                              ) : null}
                              <span>{snapshot.leg}</span>
                              <span className="text-[#59615c]">
                                {formatRankWithNotes(snapshot.cumulativeRank, snapshot.notes, locale) || dictionary.common.emptyDash}
                              </span>
                              <span>{snapshot.cumulativeMark ? formatRaceMark(snapshot.cumulativeMark, locale) : dictionary.common.emptyDash}</span>
                              {!hidesGapFromLeader ? (
                                <span>{snapshot.gapFromLeader ? formatRaceMark(snapshot.gapFromLeader, locale) : dictionary.common.emptyDash}</span>
                              ) : null}
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
                {sortedRaces.length > 0 ? (
                  <>
                    <nav className="border border-[#ded8cc] bg-[#f6f1e8] p-3" aria-label={dictionary.competitions.raceUnits}>
                      <div className="flex flex-wrap gap-2">
                        {sortedRaces.map((race) => {
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
                          {selectedRaceUnitDetails?.source?.url ? (
                            <a
                              className="inline-flex items-center gap-1 text-sm font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
                              data-analytics-event="source_outbound_click"
                              data-analytics-link-type="competition_source"
                              href={selectedRaceUnitDetails.source.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {dictionary.competitions.source}
                              <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>

                        {selectedRaceUnitDetails && selectedRaceUnitDetails.raceResults.length > 0 ? (
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
                                {selectedRaceUnitDetails.raceResults.map((result) => (
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
                                    <span className="text-[#59615c]">
                                      {formatRaceResultNotes(result.notes, locale, { suppressRepresentativeNotes: true }) || dictionary.common.emptyDash}
                                    </span>
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
