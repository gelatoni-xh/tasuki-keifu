import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { getHomeDiscovery } from "@/lib/home-discovery";
import { getDictionary, type Locale } from "@/lib/i18n";

type Props = { locale: Locale; discovery: Awaited<ReturnType<typeof getHomeDiscovery>> };

export function HomeHighlights({ locale, discovery }: Props) {
  const { home } = getDictionary(locale);
  const { recentCompetitions, teamGroups, latestEkiden } = discovery;
  const players = new Map<string, { name: string; honors: string[] }>();
  for (const leg of latestEkiden?.legs ?? []) {
    for (const result of leg.results) {
      const player = players.get(result.person.slug) ?? { name: result.person.displayNameJa, honors: [] };
      player.honors.push(`${leg.name} ${result.awards.map((award) => home[award]).join(" / ")}`);
      players.set(result.person.slug, player);
    }
  }
  const cards = [
    {
      key: "players",
      ...home.quickLinks.players,
      label: home.latestEkidenAwardsTitle,
      links: [...players].map(([slug, player]) => ({
        href: `/${locale}/players/${slug}`,
        name: player.name,
        context: `${latestEkiden?.officialName}: ${player.honors.join("; ")}`,
      })),
    },
    {
      key: "competitions",
      ...home.quickLinks.competitions,
      label: home.recentCompetitionsTitle,
      links: recentCompetitions.slice(0, 3).map((edition) => ({
        href: `/${locale}/competitions/${edition.slug}`,
        name: edition.officialName,
        context: edition.officialName,
      })),
    },
    {
      key: "organizations",
      ...home.quickLinks.organizations,
      label: home.featuredTeamsTitle,
      links: (teamGroups.find((group) => group.type === "university_ekiden")?.teams ?? []).map((team) => ({
        href: `/${locale}/organizations/${team.slug}`,
        name: team.nameJa,
        context: team.nameJa,
      })),
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={home.browseTitle}>
      {cards.map((card) => (
        <article className="flex flex-col border border-[#ded8cc] bg-white p-5 shadow-sm" key={card.key}>
          <h2 className="text-lg font-semibold">{card.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#59615c]">{card.description}</p>
          {card.links.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs text-[#59615c]">{card.label}</p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm leading-6">
                {card.links.map((link) => (
                  <li className={card.key === "competitions" ? "w-full min-w-0" : undefined} key={link.href}>
                    <Link className={`${card.key === "competitions" ? "block break-words " : ""}text-[#1f3b33] underline decoration-[#ded8cc] underline-offset-4 hover:decoration-[#1f3b33]`} href={link.href} title={link.context}>
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-auto pt-5">
            <Link className="group inline-flex items-center gap-2 text-sm font-medium text-[#1f3b33] hover:underline" href={`/${locale}/${card.key}`}>
              {home.openDirectory}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
