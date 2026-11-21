import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PlayerRelationGraph } from "@/components/player-relation-graph";
import { getDictionary, isLocale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getPlayerRelations } from "@/lib/player-relations/get-player-relations";
import { getMatrixOverlaps } from "@/lib/player-relations/matrix-overlaps";
import { matrixCopy } from "@/lib/player-relations/matrix-copy";
import { buildPageMetadata } from "@/lib/site";

type PlayerRelationsPageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PlayerRelationsPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const player = await prisma.person.findUnique({ where: { slug }, select: { displayNameJa: true } });
  if (!player) return {};
  const metadata = buildPageMetadata({
    title: `${player.displayNameJa} | ${matrixCopy[locale].title}`,
    description: `${player.displayNameJa} | ${matrixCopy[locale].description}`,
    path: `/players/${slug}/relations`, locale,
  });
  metadata.robots = { index: false, follow: true, googleBot: { index: false, follow: true } };
  return metadata;
}

export default async function PlayerRelationsPage({ params }: PlayerRelationsPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = getDictionary(locale);
  const player = await prisma.person.findUnique({ where: { slug }, select: { id: true, slug: true, displayNameJa: true } });
  if (!player) notFound();
  const payload = await getPlayerRelations(player.id);
  const relations = payload.topRelations;
  const overlaps = await getMatrixOverlaps(player.id, relations.map((entry) => entry.relatedPersonId));
  const people = await prisma.person.findMany({
    where: { id: { in: relations.map((entry) => entry.relatedPersonId) } },
    select: { id: true, slug: true, displayNameJa: true },
  });
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const nodes = relations.flatMap((entry) => {
    const person = peopleById.get(entry.relatedPersonId);
    if (!person) return [];
    return [{ id: person.id, slug: person.slug, name: person.displayNameJa, matchupCount: entry.matchupCount, sameHometown: entry.context.sameHometown, origins: entry.context.sharedOrigins, overlapYears: overlaps.get(person.id) ?? {}, hasHeadToHeadDetail: entry.hasHeadToHeadDetail }];
  });
  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#1f2421]">
      <SiteHeader locale={locale} path={`/players/${slug}/relations`} />
      <main className="px-5 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Link className="inline-flex items-center gap-2 text-sm font-medium text-[#8a1f2d]" href={`/${locale}/players/${player.slug}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{dictionary.players.headToHeadBackToPlayer}</Link>
          <header><h1 className="text-3xl font-semibold">{player.displayNameJa}</h1></header>
          {nodes.length ? <PlayerRelationGraph key={player.id} locale={locale} playerSlug={player.slug} nodes={nodes} /> : <p className="py-6 text-sm text-[#59615c]">{dictionary.players.relationNetworkEmpty}</p>}
        </div>
      </main>
    </div>
  );
}
