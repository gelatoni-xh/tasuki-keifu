"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { matrixCopy } from "@/lib/player-relations/matrix-copy";
import type { Locale } from "@/lib/i18n";

type RelationNode = { id: string; slug: string; name: string; matchupCount: number; sameHometown: boolean; origins: { highSchool: boolean; university: boolean; corporateTeam: boolean }; overlapYears: { highSchool?: number; university?: number; corporateTeam?: number }; hasHeadToHeadDetail: boolean };

function heatColor(count: number, maximum: number) {
  const strength = maximum <= 1 ? 0 : Math.max(0, Math.min(1, (count - 1) / (maximum - 1)));
  const stops = [[191, 219, 254], [247, 232, 226], [185, 28, 28]];
  const segment = strength <= 0.5 ? 0 : 1;
  const weight = strength <= 0.5 ? strength * 2 : (strength - 0.5) * 2;
  return `rgb(${stops[segment].map((value, index) => Math.round(value + (stops[segment + 1][index] - value) * weight)).join(", ")})`;
}

export function PlayerRelationGraph({ locale, playerSlug, nodes }: { locale: Locale; playerSlug: string; nodes: RelationNode[] }) {
  const t = matrixCopy[locale];
  const [limit, setLimit] = useState(20);
  const rows = nodes.slice(0, limit);
  const maximum = Math.max(1, ...nodes.map((node) => node.matchupCount));
  return <section className="border-y border-[#ded8cc] py-5">
    <div className="mb-5 flex justify-end"><div className="flex max-w-full items-center gap-2 text-xs text-[#59615c]" aria-label={t.legend}><span>1 {t.count}</span><div className="flex h-3 w-48 max-w-[45vw] overflow-hidden">{Array.from({ length: maximum }, (_, i) => <i key={i} className="h-full min-w-0 flex-1" title={`${i + 1} ${t.count}`} style={{ backgroundColor: heatColor(i + 1, maximum) }} />)}</div><span>{maximum} {t.count}</span></div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse text-sm"><thead className="border-b border-[#ded8cc] text-xs text-[#59615c]"><tr>{[t.player, t.hometown, t.school, t.university, t.team, t.matches, t.details].map((label, index) => <th key={label} scope="col" className={`px-2 py-3 font-medium ${index === 0 ? "text-left" : "text-center"}`}>{label}</th>)}</tr></thead><tbody>{rows.map((node) => <tr key={node.id} className="border-b border-[#e8e5df] hover:bg-white"><th scope="row" className="py-3 pr-3 text-left font-medium"><Link href={`/${locale}/players/${node.slug}`} className="hover:text-[#8a1f2d]">{node.name}</Link></th><td className="text-center text-xs text-[#59615c]">{node.sameHometown ? t.hometown : "—"}</td>{(["highSchool", "university", "corporateTeam"] as const).map((stage) => <td key={stage} className="text-center text-xs text-[#59615c]">{node.overlapYears[stage] ? `${node.overlapYears[stage]} ${t.years}` : node.origins[stage] ? <span title={t.originHint}>{t.origin}</span> : "—"}</td>)}<td className="text-center"><span className="inline-flex min-w-12 justify-center px-2 py-1 text-xs font-semibold tabular-nums" style={{ backgroundColor: node.matchupCount ? heatColor(node.matchupCount, maximum) : undefined, color: maximum > 1 && (node.matchupCount - 1) / (maximum - 1) > 0.7 ? "white" : "#29251f" }}>{node.matchupCount} {t.count}</span></td><td className="text-center">{node.hasHeadToHeadDetail ? <Link className="inline-flex items-center gap-1 text-xs font-medium text-[#8a1f2d] hover:underline" href={`/${locale}/players/${playerSlug}/head-to-head/${node.slug}`}>{t.details}<ArrowRight className="h-3 w-3" aria-hidden="true" /></Link> : "—"}</td></tr>)}</tbody></table></div>
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#59615c]"><span>{rows.length} / {nodes.length} {t.people}</span>{limit < nodes.length && <button type="button" className="px-3 py-2 font-medium text-[#8a1f2d] hover:underline" onClick={() => setLimit((value) => value + 20)}>{t.more}</button>}</div>
  </section>;
}
