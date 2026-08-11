import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { formatRelationLabel } from "@/lib/player-relations/format-relation-label";
import { getRelationDisplayLabels } from "@/lib/player-relations/score-player-relations";
import { getDictionary, interpolate, isLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getPlayerRelations } from "@/lib/player-relations/get-player-relations";
import { buildPageMetadata } from "@/lib/site";

type PlayerRelationsPageProps = {
  params: Promise<{
    locale: string;
    slug: string;
  }>;
  searchParams: Promise<{
    page?: string;
  }>;
};

const pageSize = 12;

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const validPages = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items: Array<number | "ellipsis"> = [];

  validPages.forEach((page, index) => {
    const previous = validPages[index - 1];

    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  });

  return items;
}

function buildRelationsPath(locale: string, slug: string, page: number) {
  const params = new URLSearchParams();

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return `/${locale}/players/${slug}/relations${query ? `?${query}` : ""}`;
}

export async function generateMetadata({ params }: Pick<PlayerRelationsPageProps, "params">): Promise<Metadata> {
  const { locale: localeParam, slug } = await params;

  if (!isLocale(localeParam)) {
    return {};
  }

  const player = await prisma.person.findUnique({
    where: { slug },
    select: {
      displayNameJa: true,
    },
  });

  if (!player) {
    return {};
  }

  const metadata = buildPageMetadata({
    title: `${player.displayNameJa} | 关系网络`,
    description: `${player.displayNameJa} 的关系网络页，展示同出身地、同校、同队与交手关系。`,
    path: `/players/${slug}/relations`,
    locale: localeParam,
  });

  metadata.robots = {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  };

  return metadata;
}

export default async function PlayerRelationsPage({ params, searchParams }: PlayerRelationsPageProps) {
  const { locale: localeParam, slug } = await params;
  const queryParams = await searchParams;

  if (!isLocale(localeParam)) {
    notFound();
  }

  const locale = localeParam;
  const dictionary = getDictionary(locale);
  const requestedPage = Number.parseInt(queryParams.page ?? "1", 10);
  const player = await prisma.person.findUnique({
    where: { slug },
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

  if (!player) {
    notFound();
  }

  const relationPayload = await getPlayerRelations(player.id);
  const totalRelations = relationPayload.topRelations.length;
  const totalPages = Math.max(1, Math.ceil(totalRelations / pageSize));
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const paginatedRelations = relationPayload.topRelations.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const relatedPlayerIds = paginatedRelations.map((entry) => entry.relatedPersonId);
  const relatedPlayers =
    relatedPlayerIds.length > 0
      ? await prisma.person.findMany({
          where: {
            id: { in: relatedPlayerIds },
          },
          include: {
            memberships: {
              include: {
                organization: true,
              },
            },
          },
        })
      : [];
  const relatedPlayersById = new Map(relatedPlayers.map((related) => [related.id, related]));
  const relationEntries = paginatedRelations
    .map((entry) => {
      const related = relatedPlayersById.get(entry.relatedPersonId);

      if (!related) {
        return null;
      }

      return {
        ...related,
        scoreLabel: entry.displayScore.toFixed(1),
        matchupCountLabel: interpolate(dictionary.players.matchupCount, { count: entry.matchupCount }),
        tags: getRelationDisplayLabels(entry).map((label) => formatRelationLabel(locale, dictionary, label)),
        canViewHeadToHead: entry.hasHeadToHeadDetail,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const pagePathWithQuery = buildRelationsPath(locale, player.slug, currentPage);

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={pagePathWithQuery} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]" href={`/${locale}/players/${player.slug}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {dictionary.players.headToHeadBackToPlayer}
          </Link>

          <header className="border border-[#ded8cc] bg-white p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a1f2d]">
              {dictionary.players.relationNetwork}
            </p>
            <h1 className="mt-3 text-3xl font-semibold">{player.displayNameJa}</h1>
            <p className="mt-3 text-sm text-[#59615c]">{dictionary.players.relationNetworkSubtitle}</p>
          </header>

          {relationEntries.length > 0 ? (
            <section className="space-y-4">
              {relationEntries.map((related) => (
                <article className="border border-[#ded8cc] bg-white p-4" key={related.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <Link
                        className="inline-flex items-center gap-2 text-xl font-semibold text-[#1f2421] hover:text-[#8a1f2d]"
                        data-analytics-event="player_to_related_player_click"
                        data-analytics-link-type="relation_network_player"
                        href={`/${locale}/players/${related.slug}`}
                      >
                        <span className="truncate">{related.displayNameJa}</span>
                      </Link>
                      <p className="mt-1 text-sm text-[#59615c]">
                        {related.memberships.map((membership) => membership.organization.nameJa).join(" / ")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {related.tags.map((tag) => (
                          <span className="border border-[#ded8cc] px-2 py-1 text-xs text-[#8a1f2d]" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-[0.12em] text-[#8b938e]">{dictionary.players.relationScore}</p>
                        <p className="text-3xl font-semibold text-[#8a1f2d]">{related.scoreLabel}</p>
                      </div>
                      <p className="text-sm text-[#59615c]">{related.matchupCountLabel}</p>
                      {related.canViewHeadToHead ? (
                        <Link
                          className="inline-flex items-center border border-[#8a1f2d] px-3 py-1 text-sm font-medium text-[#8a1f2d] transition hover:bg-[#8a1f2d] hover:text-white"
                          data-analytics-event="player_to_head_to_head_click"
                          data-analytics-link-type="head_to_head"
                          href={`/${locale}/players/${player.slug}/head-to-head/${related.slug}`}
                        >
                          {dictionary.players.viewHeadToHead}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className="border border-[#ded8cc] bg-white p-6 text-sm text-[#59615c]">
              {dictionary.players.relationNetworkEmpty}
            </section>
          )}

          {totalRelations > pageSize ? (
            <nav className="flex flex-col items-center justify-between gap-3 border-t border-[#ded8cc] pt-4 sm:flex-row">
              <p className="text-sm text-[#59615c]">
                {interpolate(dictionary.players.pageSummary, {
                  current: currentPage,
                  total: totalPages,
                })}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  aria-disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 border px-3 py-2 text-sm font-medium ${
                    currentPage <= 1
                      ? "pointer-events-none border-[#e7e1d8] text-[#b8b0a5]"
                      : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                  }`}
                  href={buildRelationsPath(locale, player.slug, currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  {dictionary.players.previousPage}
                </Link>
                <div className="flex flex-wrap items-center justify-center gap-1">
                  {paginationItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span className="px-2 py-2 text-sm text-[#8b938e]" key={`ellipsis-${index}`}>
                        ...
                      </span>
                    ) : (
                      <Link
                        aria-current={item === currentPage ? "page" : undefined}
                        className={`inline-flex h-9 min-w-9 items-center justify-center border px-3 text-sm font-medium ${
                          item === currentPage
                            ? "border-[#8a1f2d] bg-[#8a1f2d] text-white"
                            : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                        }`}
                        href={buildRelationsPath(locale, player.slug, item)}
                        key={item}
                      >
                        {item}
                      </Link>
                    ),
                  )}
                </div>
                <Link
                  aria-disabled={currentPage >= totalPages}
                  className={`inline-flex items-center gap-1 border px-3 py-2 text-sm font-medium ${
                    currentPage >= totalPages
                      ? "pointer-events-none border-[#e7e1d8] text-[#b8b0a5]"
                      : "border-[#cfc7b8] text-[#8a1f2d] hover:border-[#8a1f2d]"
                  }`}
                  href={buildRelationsPath(locale, player.slug, currentPage + 1)}
                >
                  {dictionary.players.nextPage}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </nav>
          ) : null}
        </div>
      </main>
    </div>
  );
}
