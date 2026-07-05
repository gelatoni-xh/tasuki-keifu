import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Source } from "@prisma/client";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getScopeVersion } from "@/lib/cache-invalidation";
import { createLogger } from "@/lib/logger";
import { getCachedValue } from "@/lib/server-cache";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDiscipline, formatOrganizationType, formatPersonType, formatRaceMark, formatRaceResultNotes, formatRankWithNotes } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import {
  formatMembershipPeriod,
  getCurrentMembership,
  getHighSchoolMembership,
  getUniversityMembership,
  inferCurrentUniversityGrade,
  sortMembershipsByStartDate,
} from "@/lib/membership";
import { getPlayerRelations } from "@/lib/player-relations/get-player-relations";
import { isPublicCompetitionType } from "@/lib/public-competitions";
import { buildPageMetadata } from "@/lib/site";
import type { PlayerRelationEntry, RelationStageKey } from "@/lib/player-relations/types";

type PlayerDetailPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

const raceResultsPageSize = 30;
const PLAYER_METADATA_CACHE_TTL_MS = 1000 * 60 * 5;
const PLAYER_DETAIL_CACHE_TTL_MS = 1000 * 60 * 2;
const pageLogger = createLogger("player-detail-page");

function compactJaName(value: string) {
  const normalized = value.replace(/　/g, " ").replace(/\s+/g, " ").trim();

  return /[\p{Script=Han}々]/u.test(normalized) ? normalized.replace(/ /g, "") : normalized;
}

function buildOrganizationNameVariants(organization: { nameJa: string; shortName?: string | null } | null | undefined) {
  if (!organization) {
    return [];
  }

  return [organization.nameJa, organization.shortName ?? ""].filter(Boolean);
}

function formatOrganizationLabel(organization: { nameJa: string; shortName?: string | null } | null | undefined) {
  if (!organization) {
    return "";
  }

  return organization.shortName ? `${organization.nameJa}（${organization.shortName}）` : organization.nameJa;
}

function getPlayerSeoTier({
  memberships,
  personalBests,
  results,
}: {
  memberships: number;
  personalBests: number;
  results: number;
}) {
  if (results >= 5 || memberships >= 3 || personalBests >= 3) {
    return "primary";
  }

  if ((results >= 2 && memberships >= 1) || personalBests >= 1 || memberships >= 2) {
    return "secondary";
  }

  return "thin";
}

function renderCompetitionEditionName({
  locale,
  edition,
  analyticsEvent,
  analyticsLinkType,
}: {
  locale: string;
  edition: {
    slug: string;
    shortName: string | null;
    officialName: string;
    competition: {
      type: import("@prisma/client").CompetitionType | null;
    };
  };
  analyticsEvent: string;
  analyticsLinkType: string;
}) {
  const label = edition.shortName ?? edition.officialName;

  if (!isPublicCompetitionType(edition.competition.type)) {
    return <span className="font-medium text-[#1f2421]">{label}</span>;
  }

  return (
    <Link
      className="font-medium text-[#8a1f2d] underline-offset-4 hover:underline"
      data-analytics-event={analyticsEvent}
      data-analytics-link-type={analyticsLinkType}
      href={`/${locale}/competitions/${edition.slug}`}
    >
      {label}
    </Link>
  );
}

export async function generateMetadata({ params }: PlayerDetailPageProps): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const locale = localeParam;
  const playerScopeVersion = await getScopeVersion("player-detail");
  const player = await getCachedValue(`player:metadata:${slug}:${playerScopeVersion}`, PLAYER_METADATA_CACHE_TTL_MS, async () =>
    prisma.person.findUnique({
      where: { slug },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
        personalBests: {
          select: { id: true },
        },
        _count: {
          select: {
            raceResults: true,
          },
        },
      },
    }),
  );

  if (!player) {
    return {};
  }

  const currentMembership = getCurrentMembership(player.memberships);
  const university = getUniversityMembership(player.memberships);
  const highSchool = getHighSchoolMembership(player.memberships);
  const seoTier = getPlayerSeoTier({
    memberships: player.memberships.length,
    personalBests: player.personalBests.length,
    results: player._count.raceResults,
  });
  const organizationVariants = Array.from(
    new Set(
      player.memberships.flatMap((membership) => buildOrganizationNameVariants(membership.organization)),
    ),
  );
  const currentOrganizationVariants = buildOrganizationNameVariants(currentMembership?.organization);
  const titleAffiliation =
    currentOrganizationVariants.length > 0 ? ` | ${currentOrganizationVariants.join("・")}` : "";
  const title = `${player.displayNameJa}の所属・記録・大会成績${titleAffiliation}`;
  const descriptionParts = [
    `${player.displayNameJa}の所属、記録、大会成績を確認できる人物資料ページです。`,
    currentMembership?.organization ? `現在の所属は${formatOrganizationLabel(currentMembership.organization)}です。` : null,
    university?.organization ? `大学は${formatOrganizationLabel(university.organization)}です。` : null,
    highSchool?.organization ? `出身校は${formatOrganizationLabel(highSchool.organization)}です。` : null,
    player.personalBests.length > 0 ? `主要PBを${player.personalBests.length}件収録。` : null,
    player._count.raceResults > 0 ? `大会成績を${player._count.raceResults}件収録。` : null,
    "所属変遷、関連大会、データ出典もあわせて確認できます。",
  ].filter(Boolean);

  const metadata = buildPageMetadata({
    title,
    description: descriptionParts.join(" "),
    path: `/players/${slug}`,
    locale,
    keywords: [
      player.displayNameJa,
      ...(compactJaName(player.displayNameJa) !== player.displayNameJa ? [compactJaName(player.displayNameJa)] : []),
      player.displayNameKana ?? "",
      ...organizationVariants,
      ...organizationVariants.map((name) => `${player.displayNameJa} ${name}`),
      "駅伝選手",
      "長距離",
      "大会成績",
      "PB",
    ].filter(Boolean),
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

function isPublicSource<T extends Pick<Source, "id">>(source: T | null): source is T {
  return source !== null && source.id !== "seed-source";
}

function SourceLink({ source }: { source: Pick<Source, "name" | "url"> }) {
  if (!source.url) {
    return <span>{source.name}</span>;
  }

  return (
    <a
      className="inline-flex items-center gap-1 text-[#8a1f2d] underline-offset-4 hover:underline"
      data-analytics-event="source_outbound_click"
      data-analytics-link-type="source_reference"
      href={source.url}
      rel="noreferrer"
      target="_blank"
    >
      <span>{source.name}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

function OrganizationInlineLink({
  locale,
  organization,
  muted = false,
}: {
  locale: string;
  organization: { slug: string; nameJa: string };
  muted?: boolean;
}) {
  return (
    <Link
      className={
        muted
          ? "text-[#59615c] underline-offset-4 hover:text-[#8a1f2d] hover:underline"
          : "text-[#8a1f2d] underline-offset-4 hover:underline"
      }
      href={`/${locale}/organizations/${organization.slug}`}
    >
      {organization.nameJa}
    </Link>
  );
}

function getRelationStageLabel(dictionary: ReturnType<typeof getDictionary>, stage: RelationStageKey) {
  return dictionary.players.headToHeadStageLabels[stage];
}

function formatRelationContextTags(
  dictionary: ReturnType<typeof getDictionary>,
  entry: PlayerRelationEntry,
) {
  const tags: string[] = [];

  for (const stage of entry.context.sharedTeamStages) {
    tags.push(dictionary.players.sharedTeamStages[stage]);
  }

  if (entry.context.sharedHometown) {
    tags.push(dictionary.players.sharedHometown);
  }

  if (entry.context.sharedHighSchool) {
    tags.push(dictionary.players.sharedHighSchool);
  }

  if (entry.context.sharedUniversity) {
    tags.push(dictionary.players.sharedUniversity);
  }

  if (entry.stageCount >= 2) {
    tags.push(interpolate(dictionary.players.crossStageMatchup, { count: entry.stageCount }));
  }

  return tags;
}

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    pageLogger.warn("page_not_found", {
      path: "/[locale]/players/[slug]",
      locale: localeParam,
      slug,
      reason: "invalid_locale",
    });
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const playerScopeVersion = await getScopeVersion("player-detail");
  const player = await getCachedValue(`player:detail:${slug}:profile:${playerScopeVersion}`, PLAYER_DETAIL_CACHE_TTL_MS, async () =>
    prisma.person.findUnique({
      where: { slug },
      include: {
        memberships: {
          include: {
            organization: true,
            source: true,
          },
        },
        personalBests: {
          include: { source: true },
          orderBy: { discipline: "asc" },
        },
      },
    }),
  );

  if (!player) {
    pageLogger.info("page_not_found", {
      path: `/${locale}/players/${slug}`,
      locale,
      slug,
      reason: "player_missing",
    });
    notFound();
  }

  const raceResults = await getCachedValue(`player:detail:${player.id}:race-results:${raceResultsPageSize}:${playerScopeVersion}`, PLAYER_DETAIL_CACHE_TTL_MS, async () =>
    prisma.raceResult.findMany({
      where: {
        personId: player.id,
      },
      include: {
        race: {
          include: {
            competitionEdition: {
              include: {
                competition: true,
              },
            },
          },
        },
        organization: true,
        source: true,
      },
      orderBy: [{ race: { startsAt: "desc" } }, { race: { competitionEdition: { startsOn: "desc" } } }, { race: { leg: "asc" } }],
      take: raceResultsPageSize,
    }),
  );
  const totalRaceResults = await getCachedValue(`player:detail:${player.id}:race-results-count:${playerScopeVersion}`, PLAYER_DETAIL_CACHE_TTL_MS, async () =>
    prisma.raceResult.count({
      where: {
        personId: player.id,
      },
    }),
  );

  const sortedMemberships = sortMembershipsByStartDate(player.memberships);
  const currentMembership = getCurrentMembership(player.memberships);
  const university = getUniversityMembership(player.memberships);
  const highSchool = getHighSchoolMembership(player.memberships);
  const currentUniversityGrade = inferCurrentUniversityGrade(university);
  const sortedRaceResults = [...raceResults].sort((a, b) => {
    const dateA = a.race.startsAt ?? a.race.competitionEdition.startsOn;
    const dateB = b.race.startsAt ?? b.race.competitionEdition.startsOn;
    const timestampA = dateA?.getTime() ?? 0;
    const timestampB = dateB?.getTime() ?? 0;

    if (timestampA !== timestampB) {
      return timestampB - timestampA;
    }

    return (a.race.leg ?? 999) - (b.race.leg ?? 999);
  });
  const relationPayload = await getPlayerRelations(player.id);
  const uniqueSources = Array.from(
    new Map(
      [...player.memberships, ...player.personalBests, ...raceResults]
        .map((item) => item.source)
        .filter(isPublicSource)
        .map((source) => [source.id, source]),
    ).values(),
  );

  const relatedPlayerIds = relationPayload.topRelations.slice(0, 6).map((entry: PlayerRelationEntry) => entry.relatedPersonId);
  const relatedPlayers = relatedPlayerIds.length > 0
    ? await getCachedValue(`player:detail:${player.id}:related:${relatedPlayerIds.join(",")}`, PLAYER_DETAIL_CACHE_TTL_MS, async () =>
        prisma.person.findMany({
          where: {
            id: { in: relatedPlayerIds },
          },
          include: {
            memberships: {
              include: { organization: true },
            },
          },
        }),
      )
    : [];
  const relatedPlayersById = new Map(relatedPlayers.map((related) => [related.id, related]));
  const relatedPlayersWithTags = relationPayload.topRelations.slice(0, 6).flatMap((entry: PlayerRelationEntry) => {
    const related = relatedPlayersById.get(entry.relatedPersonId);

    if (!related) {
      return [];
    }

    return [{
        ...related,
        matchupCountLabel: interpolate(dictionary.players.matchupCount, { count: entry.matchupCount }),
        relationshipTags: formatRelationContextTags(dictionary, entry),
        canViewHeadToHead: entry.hasHeadToHeadDetail,
        latestCompetitionName: entry.latestCompetitionName,
    }];
  });
  const hasPersonalBests = player.personalBests.length > 0;
  const hasRaceResults = sortedRaceResults.length > 0;
  const shouldShowPerformanceSections = player.type === "athlete" || hasPersonalBests || hasRaceResults;
  const seoTier = getPlayerSeoTier({
    memberships: player.memberships.length,
    personalBests: player.personalBests.length,
    results: totalRaceResults,
  });

  pageLogger.info("page_rendered", {
    path: `/${locale}/players/${slug}`,
    locale,
    slug,
    relation_count: relationPayload.topRelations.length,
    source_count: uniqueSources.length,
    total_race_results: totalRaceResults,
    seo_tier: seoTier,
  });
  const keyCompetitionNames = sortedRaceResults
    .slice(0, 5)
    .map((result) => result.race.competitionEdition.shortName ?? result.race.competitionEdition.officialName)
    .filter((name, index, list) => list.indexOf(name) === index);
  const playerSummary = [
    `${player.displayNameJa}の人物データページです。`,
    currentMembership?.organization.nameJa ? `現在の所属は${currentMembership.organization.nameJa}です。` : null,
    university?.organization.nameJa ? `大学は${university.organization.nameJa}。` : null,
    highSchool?.organization.nameJa ? `高校は${highSchool.organization.nameJa}。` : null,
    player.personalBests.length > 0 ? `主要PBを${player.personalBests.length}件掲載しています。` : null,
    totalRaceResults > 0 ? `大会成績を${totalRaceResults}件掲載しています。` : null,
    keyCompetitionNames.length > 0 ? `主な大会として${keyCompetitionNames.join("、")}などを確認できます。` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const playerJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.displayNameJa,
    alternateName: [
      ...(compactJaName(player.displayNameJa) !== player.displayNameJa ? [compactJaName(player.displayNameJa)] : []),
      player.displayNameKana,
      player.displayNameRoman,
      player.displayNameZh,
      player.displayNameEn,
    ].filter(Boolean),
    description: playerSummary,
    birthDate: player.birthDate?.toISOString(),
    nationality: player.nationality ?? undefined,
    homeLocation: player.hometown
      ? {
          "@type": "Place",
          name: player.hometown,
        }
      : undefined,
    memberOf: [...new Map(player.memberships.map((membership) => [membership.organization.id, membership.organization])).values()]
      .slice(0, 6)
      .map((organization) => ({
        "@type": "SportsOrganization",
        name: organization.nameJa,
        url: `https://tasukikeifu.com/${locale}/organizations/${organization.slug}`,
      })),
    url: `https://tasukikeifu.com/${locale}/players/${player.slug}`,
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
        name: "人物一覧",
        item: `https://tasukikeifu.com/${locale}/players`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: player.displayNameJa,
        item: `https://tasukikeifu.com/${locale}/players/${player.slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(playerJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SiteHeader locale={locale} path={`/players/${player.slug}`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]" href={`/${locale}/players`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {dictionary.players.backToList}
          </Link>

          <header className="border border-[#ded8cc] bg-white p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
                  {dictionary.players.profile}
                </p>
                <h1 className="mt-3 text-4xl font-semibold">{player.displayNameJa}</h1>
                <p className="mt-2 text-[#59615c]">
                  {[player.displayNameKana, player.displayNameRoman].filter(Boolean).join(" / ") || dictionary.common.emptyDash}
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[#59615c]">
                  {playerSummary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="border border-[#ded8cc] px-3 py-1 text-sm text-[#59615c]">
                  {dictionary.players.personType}: {formatPersonType(player.type, locale)}
                </span>
              </div>
            </div>
          </header>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.players.affiliation}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.currentAffiliation}</dt>
                  <dd className="font-medium">
                    {currentMembership?.organization ? (
                      <OrganizationInlineLink locale={locale} organization={currentMembership.organization} />
                    ) : (
                      dictionary.common.emptyDash
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.university}</dt>
                  <dd className="font-medium">
                    {university?.organization ? (
                      <OrganizationInlineLink locale={locale} organization={university.organization} />
                    ) : (
                      dictionary.common.emptyDash
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.grade}</dt>
                  <dd className="font-medium">
                    {currentUniversityGrade
                      ? interpolate(dictionary.players.gradeValue, { grade: currentUniversityGrade })
                      : dictionary.common.emptyDash}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.highSchool}</dt>
                  <dd className="font-medium">
                    {highSchool?.organization ? (
                      <OrganizationInlineLink locale={locale} organization={highSchool.organization} />
                    ) : (
                      dictionary.common.emptyDash
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.hometown}</dt>
                  <dd className="font-medium">{player.hometown ?? dictionary.common.emptyDash}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.birthDate}</dt>
                  <dd className="font-medium">{formatDate(player.birthDate) || dictionary.common.emptyDash}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.nationality}</dt>
                  <dd className="font-medium">{player.nationality ?? dictionary.common.emptyDash}</dd>
                </div>
              </dl>
            </div>

            {shouldShowPerformanceSections ? (
              <div className="border border-[#ded8cc] bg-white p-5">
                <h2 className="text-lg font-semibold">{dictionary.players.personalBest}</h2>
                {hasPersonalBests ? (
                  <div className="mt-4 divide-y divide-[#e7e1d8]">
                    {player.personalBests.map((pb) => (
                      <div className="py-4 text-sm" key={pb.id}>
                        <div className="flex items-baseline justify-between gap-4">
                          <p className="text-[#59615c]">{formatDiscipline(pb.discipline, locale)}</p>
                          <p className="text-xl font-semibold text-[#1f2421]">{pb.mark}</p>
                        </div>
                        <div className="mt-2 space-y-1 text-xs leading-5 text-[#59615c]">
                          <p>
                            {[formatDate(pb.achievedOn), pb.competitionName, pb.venue].filter(Boolean).join(" / ") ||
                              dictionary.common.emptyDash}
                          </p>
                          {isPublicSource(pb.source) ? (
                            <p>
                              <span className="mr-2 text-[#8b938e]">{dictionary.players.source}</span>
                              <SourceLink source={pb.source} />
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[#59615c]">{dictionary.common.emptyDash}</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.careerTimeline}</h2>
            <div className="mt-4 divide-y divide-[#e7e1d8]">
              {sortedMemberships.map((membership) => (
                <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr]" key={membership.id}>
                  <span className="font-medium">
                    <OrganizationInlineLink locale={locale} organization={membership.organization} />
                  </span>
                  <span className="text-[#59615c]">{formatOrganizationType(membership.organization.type, locale)}</span>
                  <span className="text-[#59615c]">
                    {formatMembershipPeriod(membership, locale) || dictionary.common.emptyDash}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {shouldShowPerformanceSections ? (
            <section className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.players.raceRecord}</h2>
              {hasRaceResults ? (
                <>
            {totalRaceResults > sortedRaceResults.length ? (
              <p className="mt-4 text-sm text-[#59615c]">
                {interpolate(dictionary.players.resultCount, { count: totalRaceResults })}。{sortedRaceResults.length}
                件を新しい順で表示しています。
              </p>
            ) : null}
            <div className="mt-4 hidden md:block">
              <div>
                <div className="grid grid-cols-[0.8fr_1.45fr_1.1fr_0.8fr_0.55fr_1.35fr_1.1fr_1.25fr] border-b border-[#ded8cc] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
                  <span>{dictionary.players.raceDate}</span>
                  <span>{dictionary.players.raceName}</span>
                  <span>{dictionary.players.raceEvent}</span>
                  <span>{dictionary.players.raceMark}</span>
                  <span>{dictionary.players.raceRank}</span>
                  <span>{dictionary.players.raceNotes}</span>
                  <span>{dictionary.players.currentAffiliation}</span>
                  <span>{dictionary.players.source}</span>
                </div>
                <div className="divide-y divide-[#e7e1d8]">
                  {sortedRaceResults.map((result) => {
                    const edition = result.race.competitionEdition;
                    const raceDate = formatDate(result.race.startsAt ?? edition.startsOn);

                    return (
                      <div
                        className="grid grid-cols-[0.8fr_1.45fr_1.1fr_0.8fr_0.55fr_1.35fr_1.1fr_1.25fr] px-3 py-3 text-sm"
                        key={result.id}
                      >
                        <span className="text-[#59615c]">{raceDate || dictionary.common.emptyDash}</span>
                        {renderCompetitionEditionName({
                          locale,
                          edition,
                          analyticsEvent: "player_to_competition_click",
                          analyticsLinkType: "player_race_record",
                        })}
                        <span>{result.race.name}</span>
                        <span>{result.mark ? formatRaceMark(result.mark, locale) : dictionary.common.notEntered}</span>
                        <span>{formatRankWithNotes(result.rank, result.notes, locale) || dictionary.common.emptyDash}</span>
                        <span className="text-[#59615c]">
                          {formatRaceResultNotes(result.notes, locale) || dictionary.common.emptyDash}
                        </span>
                        <span className="text-[#59615c]">
                          {result.organization ? (
                            <OrganizationInlineLink locale={locale} muted organization={result.organization} />
                          ) : (
                            dictionary.common.emptyDash
                          )}
                        </span>
                        <span className="text-[#59615c]">
                          {isPublicSource(result.source) ? <SourceLink source={result.source} /> : dictionary.common.emptyDash}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {sortedRaceResults.map((result) => {
                const edition = result.race.competitionEdition;
                const raceDate = formatDate(result.race.startsAt ?? edition.startsOn);

                return (
                  <article className="border border-[#e7e1d8] p-4" key={result.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-[#8b938e]">{raceDate || dictionary.common.emptyDash}</p>
                        <h3 className="mt-1 font-semibold">
                          {renderCompetitionEditionName({
                            locale,
                            edition,
                            analyticsEvent: "player_to_competition_click",
                            analyticsLinkType: "player_race_record_mobile",
                          })}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceRank}</p>
                        <p className="font-semibold">{formatRankWithNotes(result.rank, result.notes, locale) || dictionary.common.emptyDash}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceEvent}</dt>
                        <dd className="mt-1">{result.race.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceMark}</dt>
                        <dd className="mt-1 font-semibold">{result.mark ? formatRaceMark(result.mark, locale) : dictionary.common.notEntered}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.currentAffiliation}</dt>
                        <dd className="mt-1">
                          {result.organization ? (
                            <OrganizationInlineLink locale={locale} muted organization={result.organization} />
                          ) : (
                            dictionary.common.emptyDash
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceNotes}</dt>
                        <dd className="mt-1">{formatRaceResultNotes(result.notes, locale) || dictionary.common.emptyDash}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.source}</dt>
                        <dd className="mt-1 text-[#59615c]">
                          {isPublicSource(result.source) ? (
                            <SourceLink source={result.source} />
                          ) : (
                            dictionary.common.emptyDash
                          )}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-[#59615c]">{dictionary.common.emptyDash}</p>
              )}
            </section>
          ) : null}

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.relatedPlayers}</h2>
            <p className="mt-1 text-sm text-[#59615c]">{dictionary.players.relatedPlayersSubtitle}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {relatedPlayersWithTags.length > 0 ? (
                relatedPlayersWithTags.map((related) => (
                  <div
                    className="border border-[#e7e1d8] p-3 transition hover:border-[#8a1f2d]"
                    key={related.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <Link
                        className="group block min-w-0 flex-1 rounded-sm border border-[#e7e1d8] bg-[#fcfaf5] px-3 py-2 transition hover:border-[#d1b7a4] hover:bg-[#f7f1e7]"
                        data-analytics-event="player_to_related_player_click"
                        data-analytics-link-type="related_player"
                        href={`/${locale}/players/${related.slug}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate text-lg font-semibold text-[#1f2421] transition group-hover:text-[#8a1f2d]">
                            {related.displayNameJa}
                          </span>
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-[#8a1f2d] transition group-hover:translate-x-0.5"
                          >
                            →
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-[#59615c]">
                          {related.memberships.map((membership: (typeof related.memberships)[number]) => membership.organization.nameJa).join(" / ")}
                        </span>
                      </Link>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[#8a1f2d]">{related.matchupCountLabel}</p>
                      {related.canViewHeadToHead ? (
                        <Link
                          className="inline-flex shrink-0 items-center border border-[#8a1f2d] px-3 py-1 text-sm font-medium text-[#8a1f2d] transition hover:bg-[#8a1f2d] hover:text-white"
                          data-analytics-event="player_to_head_to_head_click"
                          data-analytics-link-type="head_to_head"
                          href={`/${locale}/players/${player.slug}/head-to-head/${related.slug}`}
                        >
                          {dictionary.players.viewHeadToHead}
                        </Link>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {related.relationshipTags.map((tag: string) => (
                        <span className="border border-[#ded8cc] px-2 py-1 text-xs text-[#8a1f2d]" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#59615c]">{dictionary.players.relatedPlayersEmpty}</p>
              )}
            </div>
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.dataSource}</h2>
            <div className="mt-4 space-y-2 text-sm text-[#59615c]">
              {uniqueSources.map((source) =>
                source.url ? (
                  <a
                    className="flex items-center gap-2 underline-offset-4 hover:text-[#8a1f2d] hover:underline"
                    data-analytics-event="source_outbound_click"
                    data-analytics-link-type="source_directory"
                    href={source.url}
                    key={source.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{source.name}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="flex items-center gap-2" key={source.id}>
                    <span>{source.name}</span>
                  </p>
                ),
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
