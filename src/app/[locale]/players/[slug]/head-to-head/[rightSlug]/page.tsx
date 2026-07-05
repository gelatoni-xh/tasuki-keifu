import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { formatDate, formatRaceMark, formatRankWithNotes } from "@/lib/format";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getPlayerHeadToHead } from "@/lib/player-relations/get-player-head-to-head";
import type { HeadToHeadMatch, RelationStageKey } from "@/lib/player-relations/types";
import { buildPageMetadata } from "@/lib/site";

type HeadToHeadPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
    rightSlug: string;
  }>;
};

function formatStageLabel(dictionary: ReturnType<typeof getDictionary>, stage: RelationStageKey) {
  return dictionary.players.headToHeadStageLabels[stage];
}

function formatContextTags(
  dictionary: ReturnType<typeof getDictionary>,
  context: Awaited<ReturnType<typeof getPlayerHeadToHead>>["context"],
) {
  const tags: string[] = [];

  for (const stage of context.sharedTeamStages) {
    tags.push(dictionary.players.sharedTeamStages[stage]);
  }

  if (context.sharedHometown) {
    tags.push(dictionary.players.sharedHometown);
  }

  if (context.sharedHighSchool) {
    tags.push(dictionary.players.sharedHighSchool);
  }

  if (context.sharedUniversity) {
    tags.push(dictionary.players.sharedUniversity);
  }

  return tags;
}

function formatComparisonLabel(
  dictionary: ReturnType<typeof getDictionary>,
  match: HeadToHeadMatch,
  leftName: string,
  rightName: string,
) {
  switch (match.comparison.status) {
    case "left_ahead":
      return interpolate(dictionary.players.headToHeadLeftAhead, { name: leftName });
    case "right_ahead":
      return interpolate(dictionary.players.headToHeadRightAhead, { name: rightName });
    case "tie":
      return dictionary.players.headToHeadTie;
    case "not_comparable":
      return dictionary.players.headToHeadNotComparable;
  }
}

function formatMarkDiff(diffMillis: number | null) {
  if (diffMillis === null) {
    return null;
  }

  const absolute = Math.abs(diffMillis);
  const minutes = Math.floor(absolute / 60000);
  const seconds = Math.floor((absolute % 60000) / 1000);
  const millis = absolute % 1000;

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  return `${seconds}.${String(millis).padStart(3, "0")}s`;
}

export async function generateMetadata({ params }: HeadToHeadPageProps): Promise<Metadata> {
  const { locale: localeParam, slug, rightSlug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const people = await prisma.person.findMany({
    where: {
      slug: { in: [slug, rightSlug] },
    },
    select: {
      slug: true,
      displayNameJa: true,
    },
  });

  if (people.length !== 2) {
    return {};
  }

  const left = people.find((person) => person.slug === slug);
  const right = people.find((person) => person.slug === rightSlug);

  if (!left || !right) {
    return {};
  }

  return buildPageMetadata({
    title: `${left.displayNameJa} vs ${right.displayNameJa}`,
    description: `${left.displayNameJa} と ${right.displayNameJa} の対決履歴ページです。`,
    path: `/players/${slug}/head-to-head/${rightSlug}`,
    locale: localeParam,
  });
}

export default async function HeadToHeadPage({ params }: HeadToHeadPageProps) {
  const { locale: localeParam, slug, rightSlug } = await params;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const people = await prisma.person.findMany({
    where: {
      slug: { in: [slug, rightSlug] },
    },
    select: {
      id: true,
      slug: true,
      displayNameJa: true,
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  if (people.length !== 2) {
    notFound();
  }

  const leftPlayer = people.find((person) => person.slug === slug);
  const rightPlayer = people.find((person) => person.slug === rightSlug);

  if (!leftPlayer || !rightPlayer) {
    notFound();
  }

  const payload = await getPlayerHeadToHead(leftPlayer.id, rightPlayer.id);

  if (payload.summary.matchupCount < 5) {
    notFound();
  }

  const contextTags = formatContextTags(dictionary, payload.context);

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={`/players/${slug}/head-to-head/${rightSlug}`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]" href={`/${locale}/players/${slug}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {dictionary.players.headToHeadBackToPlayer}
          </Link>

          <header className="border border-[#ded8cc] bg-white p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
              {dictionary.players.headToHeadOverview}
            </p>
            <h1 className="mt-3 text-3xl font-semibold">
              {interpolate(dictionary.players.headToHeadTitle, {
                left: leftPlayer.displayNameJa,
                right: rightPlayer.displayNameJa,
              })}
            </h1>
            <p className="mt-3 text-lg font-medium text-[#8a1f2d]">
              {interpolate(dictionary.players.headToHeadSummary, { count: payload.summary.matchupCount })}
            </p>
          </header>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="border border-[#ded8cc] bg-white p-4">
              <p className="text-sm text-[#59615c]">
                {interpolate(dictionary.players.headToHeadSummary, { count: payload.summary.matchupCount })}
              </p>
              <p className="mt-2 text-2xl font-semibold">{payload.summary.matchupCount}</p>
            </div>
            <div className="border border-[#ded8cc] bg-white p-4">
              <p className="text-sm text-[#59615c]">{leftPlayer.displayNameJa}</p>
              <p className="mt-2 text-2xl font-semibold">{payload.summary.leftAheadCount}</p>
            </div>
            <div className="border border-[#ded8cc] bg-white p-4">
              <p className="text-sm text-[#59615c]">{rightPlayer.displayNameJa}</p>
              <p className="mt-2 text-2xl font-semibold">{payload.summary.rightAheadCount}</p>
            </div>
            <div className="border border-[#ded8cc] bg-white p-4">
              <p className="text-sm text-[#59615c]">{dictionary.players.headToHeadEkidenCount}</p>
              <p className="mt-2 text-2xl font-semibold">{payload.summary.ekidenMatchupCount}</p>
            </div>
          </section>

          {contextTags.length > 0 ? (
            <section className="border border-[#ded8cc] bg-white p-5">
              <h2 className="text-lg font-semibold">{dictionary.players.headToHeadContext}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {contextTags.map((tag) => (
                  <span className="border border-[#ded8cc] px-2 py-1 text-xs text-[#8a1f2d]" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.headToHeadHistory}</h2>
            {payload.matches.length === 0 ? (
              <p className="mt-4 text-sm text-[#59615c]">{dictionary.players.headToHeadNoData}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {payload.matches.map((match) => {
                  const rankDiff = match.comparison.rankDiff === null ? null : Math.abs(match.comparison.rankDiff);
                  const markDiff = formatMarkDiff(match.comparison.markDiffMillis);

                  return (
                    <article className="border border-[#e7e1d8] p-4" key={match.raceId}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#8b938e]">
                            {formatDate(match.raceDate ? new Date(match.raceDate) : null) || dictionary.common.emptyDash}
                          </p>
                          <h3 className="mt-1 font-semibold">{match.competitionName}</h3>
                          <p className="mt-1 text-sm text-[#59615c]">
                            {match.raceName}
                            {match.stage ? ` / ${formatStageLabel(dictionary, match.stage)}` : ""}
                          </p>
                        </div>
                        <div className="text-sm font-medium text-[#8a1f2d]">
                          {formatComparisonLabel(dictionary, match, leftPlayer.displayNameJa, rightPlayer.displayNameJa)}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="border border-[#f0ebe1] p-3">
                          <p className="text-xs font-medium text-[#8b938e]">
                            {interpolate(dictionary.players.headToHeadLeftResult, { name: leftPlayer.displayNameJa })}
                          </p>
                          <p className="mt-1 font-semibold">
                            {formatRankWithNotes(match.left.rank, match.left.notes, locale) || dictionary.common.emptyDash}
                          </p>
                          <p className="mt-1 text-sm text-[#59615c]">
                            {match.left.mark ? formatRaceMark(match.left.mark, locale) : dictionary.common.notEntered}
                          </p>
                        </div>
                        <div className="border border-[#f0ebe1] p-3">
                          <p className="text-xs font-medium text-[#8b938e]">
                            {interpolate(dictionary.players.headToHeadRightResult, { name: rightPlayer.displayNameJa })}
                          </p>
                          <p className="mt-1 font-semibold">
                            {formatRankWithNotes(match.right.rank, match.right.notes, locale) || dictionary.common.emptyDash}
                          </p>
                          <p className="mt-1 text-sm text-[#59615c]">
                            {match.right.mark ? formatRaceMark(match.right.mark, locale) : dictionary.common.notEntered}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#59615c]">
                        {rankDiff !== null ? (
                          <span>{interpolate(dictionary.players.headToHeadRankDiff, { diff: rankDiff })}</span>
                        ) : null}
                        {markDiff ? (
                          <span>{interpolate(dictionary.players.headToHeadMarkDiff, { diff: markDiff })}</span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border border-[#ded8cc] bg-white p-5">
            <h2 className="text-lg font-semibold">{dictionary.players.headToHeadStageDistribution}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="border border-[#f0ebe1] p-4">
                <p className="text-sm text-[#59615c]">{dictionary.players.headToHeadStageLabels.high_school}</p>
                <p className="mt-2 text-2xl font-semibold">{payload.summary.stageCounts.highSchool}</p>
              </div>
              <div className="border border-[#f0ebe1] p-4">
                <p className="text-sm text-[#59615c]">{dictionary.players.headToHeadStageLabels.university}</p>
                <p className="mt-2 text-2xl font-semibold">{payload.summary.stageCounts.university}</p>
              </div>
              <div className="border border-[#f0ebe1] p-4">
                <p className="text-sm text-[#59615c]">{dictionary.players.headToHeadStageLabels.corporate_team}</p>
                <p className="mt-2 text-2xl font-semibold">{payload.summary.stageCounts.corporateTeam}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
