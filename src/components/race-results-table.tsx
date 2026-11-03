import Link from "next/link";
import { formatRaceMark, formatRaceResultNotes, formatRankWithNotes } from "@/lib/format";
import { getDictionary, type Locale } from "@/lib/i18n";

export type RaceResultRow = {
  id: string;
  rank: number | null;
  notes: string | null;
  mark: string | null;
  person: { slug: string; displayNameJa: string };
  organization: { slug: string; nameJa: string } | null;
};

export function RaceResultsTable({ results, locale }: { results: RaceResultRow[]; locale: Locale }) {
  const dictionary = getDictionary(locale);
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[#f2eee7] text-xs text-[#59615c]">
          <tr>
            {[dictionary.competitions.rank, dictionary.competitions.athlete, dictionary.competitions.organization, dictionary.competitions.mark, dictionary.competitions.notes].map((label) => (
              <th className="px-3 py-2 font-semibold" scope="col" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7e1d8]">
          {results.map((result) => (
            <tr key={result.id}>
              <td className="px-3 py-3 text-[#59615c]">{formatRankWithNotes(result.rank, result.notes, locale) || dictionary.common.emptyDash}</td>
              <td className="px-3 py-3">
                <Link className="font-semibold text-[#8a1f2d] hover:underline" data-analytics-event="player_profile_view" data-analytics-link-type="competition_result_player" href={`/${locale}/players/${result.person.slug}`}>
                  {result.person.displayNameJa}
                </Link>
              </td>
              <td className="px-3 py-3 text-[#59615c]">
                {result.organization ? <Link className="hover:underline" data-analytics-event="player_to_organization_click" data-analytics-link-type="competition_result_organization" href={`/${locale}/organizations/${result.organization.slug}`}>{result.organization.nameJa}</Link> : dictionary.common.emptyDash}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{result.mark ? formatRaceMark(result.mark, locale) : dictionary.common.notEntered}</td>
              <td className="px-3 py-3 text-[#59615c]">{formatRaceResultNotes(result.notes, locale, { suppressRepresentativeNotes: true }) || dictionary.common.emptyDash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
