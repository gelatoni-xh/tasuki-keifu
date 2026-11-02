import Link from "next/link";
import type { getHomeDiscovery } from "@/lib/home-discovery";
import { formatCompetitionType } from "@/lib/format";
import { getDictionary, type Locale } from "@/lib/i18n";

type Props = { locale: Locale; discovery: Awaited<ReturnType<typeof getHomeDiscovery>> };

export function HomeHighlights({ locale, discovery }: Props) {
  const { home } = getDictionary(locale);
  const { teamGroups, latestEkiden } = discovery;
  return <>
    {teamGroups.length > 0 ? (
      <section className="space-y-4" aria-labelledby="featured-teams-heading">
        <h2 className="text-lg font-semibold" id="featured-teams-heading">{home.featuredTeamsTitle}</h2>
        <div className="space-y-4">
          {teamGroups.map((group) => (
            <div className="border border-[#ded8cc] bg-white p-5" key={group.type}>
              <h3 className="font-semibold">{formatCompetitionType(group.type, locale)}</h3>
              <ol className="mt-3 divide-y divide-[#ded8cc]">
                {group.teams.map((team, index) => (
                  <li className="flex items-baseline justify-between gap-3 py-3 text-sm" key={team.slug}>
                    <Link className="min-w-0 text-[#1f3b33] hover:underline" href={`/${locale}/organizations/${team.slug}`}>
                      <span className="mr-3 text-[#59615c]">{index + 1}.</span>{team.nameJa}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    ) : null}
    {latestEkiden && latestEkiden.legs.length > 0 ? (
      <section className="space-y-4" aria-labelledby="latest-ekiden-awards-heading">
        <h2 className="text-lg font-semibold" id="latest-ekiden-awards-heading">{home.latestEkidenAwardsTitle}</h2>
        <Link className="inline-block font-medium text-[#1f3b33] hover:underline" href={`/${locale}/competitions/${latestEkiden.slug}`}>{latestEkiden.officialName}</Link>
        <div className="grid gap-4 sm:grid-cols-2">
          {latestEkiden.legs.map((leg) => (
            <div className="border border-[#ded8cc] bg-white p-5" key={leg.slug}>
              <h3 className="font-semibold">{leg.name}</h3>
              <ul className="mt-3 space-y-4">
                {leg.results.map((result) => (
                  <li key={result.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link className="font-medium text-[#1f3b33] hover:underline" href={`/${locale}/players/${result.person.slug}`}>{result.person.displayNameJa}</Link>
                      <span className="text-sm tabular-nums">{result.mark}</span>
                    </div>
                    {result.organization ? <Link className="mt-1 inline-block text-sm text-[#59615c] hover:underline" href={`/${locale}/organizations/${result.organization.slug}`}>{result.organization.nameJa}</Link> : null}
                    <div className="mt-2 flex flex-wrap gap-2">{result.awards.map((award) => <span className="bg-[#f5ece7] px-2 py-1 text-xs text-[#8a1f2d]" key={award}>{home[award]}</span>)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    ) : null}
  </>;
}
