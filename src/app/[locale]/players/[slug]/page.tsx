import Link from "next/link";
import { notFound } from "next/navigation";
import type { Source } from "@prisma/client";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDiscipline, formatOrganizationType, formatRank, formatStatus } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import {
  formatMembershipPeriod,
  getCurrentMembership,
  getHighSchoolMembership,
  getUniversityMembership,
  sortMembershipsByStartDate,
} from "@/lib/membership";

type PlayerDetailPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
};

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
      href={source.url}
      rel="noreferrer"
      target="_blank"
    >
      <span>{source.name}</span>
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const player = await prisma.person.findUnique({
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
      raceResults: {
        include: {
          race: {
            include: {
              competitionEdition: {
                include: { competition: true },
              },
            },
          },
          organization: true,
          source: true,
        },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const sortedMemberships = sortMembershipsByStartDate(player.memberships);
  const currentMembership = getCurrentMembership(player.memberships);
  const university = getUniversityMembership(player.memberships);
  const highSchool = getHighSchoolMembership(player.memberships);
  const sortedRaceResults = [...player.raceResults].sort((a, b) => {
    const dateA = a.race.startsAt ?? a.race.competitionEdition.startsOn;
    const dateB = b.race.startsAt ?? b.race.competitionEdition.startsOn;
    const timestampA = dateA?.getTime() ?? 0;
    const timestampB = dateB?.getTime() ?? 0;

    if (timestampA !== timestampB) {
      return timestampB - timestampA;
    }

    return (a.race.leg ?? 999) - (b.race.leg ?? 999);
  });
  const relatedRaceIds = player.raceResults.map((result) => result.raceId);
  const uniqueSources = Array.from(
    new Map(
      [...player.memberships, ...player.personalBests, ...player.raceResults]
        .map((item) => item.source)
        .filter(isPublicSource)
        .map((source) => [source.id, source]),
    ).values(),
  );

  const relatedPlayers = await prisma.person.findMany({
    where: {
      id: { not: player.id },
      OR: [
        {
          memberships: {
            some: {
              organizationId: { in: [university?.organizationId, highSchool?.organizationId].filter(Boolean) as string[] },
            },
          },
        },
        {
          raceResults: {
            some: {
              raceId: { in: relatedRaceIds },
            },
          },
        },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: {
      memberships: {
        include: { organization: true },
      },
    },
    take: 8,
  });

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={`/players/${player.slug}`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-5xl space-y-8">
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
                  {player.displayNameKana} / {player.displayNameRoman}
                </p>
              </div>
              <span className="border border-[#ded8cc] px-3 py-1 text-sm text-[#8a1f2d]">
                {formatStatus(player.status, locale)}
              </span>
            </div>
          </header>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.players.affiliation}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.currentAffiliation}</dt>
                  <dd className="font-medium">
                    {currentMembership?.organization.nameJa ?? dictionary.common.emptyDash}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.university}</dt>
                  <dd className="font-medium">{university?.organization.nameJa ?? dictionary.common.emptyDash}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.grade}</dt>
                  <dd className="font-medium">
                    {university?.grade
                      ? interpolate(dictionary.players.gradeValue, { grade: university.grade })
                      : dictionary.common.emptyDash}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.highSchool}</dt>
                  <dd className="font-medium">{highSchool?.organization.nameJa ?? dictionary.common.emptyDash}</dd>
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
                <div className="flex justify-between gap-4">
                  <dt className="text-[#59615c]">{dictionary.players.registeredPrefecture}</dt>
                  <dd className="font-medium">{player.registeredPrefecture ?? dictionary.common.emptyDash}</dd>
                </div>
              </dl>
            </div>

            <div className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.players.personalBest}</h2>
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
            </div>
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.careerTimeline}</h2>
            <div className="mt-4 divide-y divide-[#e7e1d8]">
              {sortedMemberships.map((membership) => (
                <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_1fr_1fr]" key={membership.id}>
                  <span className="font-medium">{membership.organization.nameJa}</span>
                  <span className="text-[#59615c]">{formatOrganizationType(membership.organization.type, locale)}</span>
                  <span className="text-[#59615c]">
                    {formatMembershipPeriod(membership, locale) || dictionary.common.emptyDash}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.raceRecord}</h2>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <div className="min-w-[1040px]">
                <div className="grid grid-cols-[104px_180px_130px_100px_72px_150px_140px_1fr] border-b border-[#ded8cc] bg-[#f2eee7] px-3 py-2 text-xs font-semibold text-[#59615c]">
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
                        className="grid grid-cols-[104px_180px_130px_100px_72px_150px_140px_1fr] px-3 py-3 text-sm"
                        key={result.id}
                      >
                        <span className="text-[#59615c]">{raceDate || dictionary.common.emptyDash}</span>
                        <span className="font-medium">{edition.shortName ?? edition.officialName}</span>
                        <span>{result.race.name}</span>
                        <span>{result.mark ?? dictionary.common.notEntered}</span>
                        <span>{formatRank(result.rank, locale) || dictionary.common.emptyDash}</span>
                        <span className="text-[#59615c]">{result.notes ?? dictionary.common.emptyDash}</span>
                        <span className="text-[#59615c]">
                          {result.organization?.nameJa ?? dictionary.common.emptyDash}
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
                        <h3 className="mt-1 font-semibold">{edition.shortName ?? edition.officialName}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceRank}</p>
                        <p className="font-semibold">{formatRank(result.rank, locale) || dictionary.common.emptyDash}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceEvent}</dt>
                        <dd className="mt-1">{result.race.name}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceMark}</dt>
                        <dd className="mt-1 font-semibold">{result.mark ?? dictionary.common.notEntered}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.currentAffiliation}</dt>
                        <dd className="mt-1">{result.organization?.nameJa ?? dictionary.common.emptyDash}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-[#8b938e]">{dictionary.players.raceNotes}</dt>
                        <dd className="mt-1">{result.notes ?? dictionary.common.emptyDash}</dd>
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
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.relatedPlayers}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {relatedPlayers.length > 0 ? (
                relatedPlayers.map((related) => (
                  <Link
                    className="border border-[#e7e1d8] p-3 transition hover:border-[#8a1f2d]"
                    href={`/${locale}/players/${related.slug}`}
                    key={related.id}
                  >
                    <p className="font-semibold">{related.displayNameJa}</p>
                    <p className="mt-1 text-sm text-[#59615c]">
                      {related.memberships.map((membership) => membership.organization.nameJa).join(" / ")}
                    </p>
                  </Link>
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
