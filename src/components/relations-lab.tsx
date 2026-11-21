"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Network, GitMerge, Route, Waves, Search, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { getDictionary, interpolate, type Locale } from "@/lib/i18n";
import type { ForceGraphMethods } from "react-force-graph-2d";

const ForceGraph = dynamic(() => import("react-force-graph-2d"), { ssr: false });
type Organization = { id: string; name: string; type: string; count: number };
type Person = { id: string; slug: string; name: string; memberships: { org: string; start: number | null; end: number | null; ongoing: boolean }[] };
type Props = { locale: Locale; organizations: Organization[]; people: Person[] };
const colors: Record<string, string> = { high_school: "#167c80", university: "#cf4863", corporate_team: "#6562b7" };
const tabs = [{ id: "network", name: "network", icon: Network }, { id: "intersection", name: "intersection", icon: GitMerge }, { id: "flow", name: "flow", icon: Waves }, { id: "path", name: "path", icon: Route }] as const;

export function RelationsLab({ locale, organizations, people }: Props) {
  const [organizationMinimum, setOrganizationMinimum] = useState(3);
  const eligible = useMemo(() => organizations.filter((org) => org.count >= organizationMinimum), [organizations, organizationMinimum]);
  const eligiblePeople = useMemo(() => {
    const ids = new Set(eligible.map((org) => org.id));
    return people.map((person) => ({ ...person, memberships: person.memberships.filter((m) => ids.has(m.org)) })).filter((person) => person.memberships.length > 0);
  }, [eligible, people]);
  if (!organizations.length) return <main className="px-5 py-10"><h1 className="text-2xl font-semibold">{getDictionary(locale).relationsLab.title}</h1><p className="mt-4 text-sm text-zinc-500">{getDictionary(locale).relationsLab.empty}</p></main>;
  return <RelationsExplorer key={organizationMinimum} locale={locale} organizations={eligible} people={eligiblePeople} organizationMinimum={organizationMinimum} setOrganizationMinimum={setOrganizationMinimum} />;
}

function RelationsExplorer({ locale, organizations, people, organizationMinimum, setOrganizationMinimum }: Props & { organizationMinimum: number; setOrganizationMinimum: (value: number) => void }) {
  const t = getDictionary(locale).relationsLab;
  const types: Record<string, string> = t.types;
  const [mode, setMode] = useState<typeof tabs[number]["id"]>("network");
  const [selected, setSelected] = useState<string | null>(null);
  const [minimum, setMinimum] = useState(3);
  const [query, setQuery] = useState("");
  const [left, setLeft] = useState(organizations.find((o) => o.name.includes("中央"))?.id ?? organizations[0]?.id ?? "");
  const [right, setRight] = useState(organizations.find((o) => o.name.includes("トヨタ"))?.id ?? organizations.at(-1)?.id ?? "");
  const [cohort, setCohort] = useState("all");
  const [flowOrganization, setFlowOrganization] = useState("");
  const [flowLimit, setFlowLimit] = useState(36);
  const [personA, setPersonA] = useState(people.find((p) => p.name.includes("吉居大和"))?.id ?? people[0]?.id ?? "");
  const [personB, setPersonB] = useState(people.find((p) => p.name.includes("田澤廉"))?.id ?? people.at(-1)?.id ?? "");
  const orgMap = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);
  const personMap = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const pairs = useMemo(() => {
    const map = new Map<string, { source: string; target: string; people: Person[] }>();
    for (const person of people) {
      const ids = [...new Set(person.memberships.map((m) => m.org))].sort();
      ids.forEach((a, index) => ids.slice(index + 1).forEach((b) => {
        const key = `${a}:${b}`;
        const entry = map.get(key) ?? { source: a, target: b, people: [] };
        entry.people.push(person); map.set(key, entry);
      }));
    }
    return [...map.values()];
  }, [people]);
  const graph = useMemo(() => {
    const links = pairs.filter((pair) => pair.people.length >= minimum && (!query || orgMap.get(pair.source)?.name.includes(query) || orgMap.get(pair.target)?.name.includes(query)));
    const ids = new Set(links.flatMap((link) => [link.source, link.target]));
    return { nodes: organizations.filter((o) => ids.has(o.id)).map((o) => ({ ...o, val: 4 + Math.sqrt(o.count), color: colors[o.type] })), links: links.map((pair) => ({ source: pair.source, target: pair.target, count: pair.people.length })) };
  }, [pairs, minimum, query, orgMap, organizations]);
  const shared = people.filter((p) => p.memberships.some((m) => m.org === left) && p.memberships.some((m) => m.org === right));
  const cohortYears = [...new Set(people.flatMap((p) => p.memberships.filter((m) => orgMap.get(m.org)?.type === "university" && m.start !== null).map((m) => m.start!)))].sort((a, b) => b - a);
  const flowPeople = useMemo(() => people.filter((p) => (cohort === "all" || p.memberships.some((m) => orgMap.get(m.org)?.type === "university" && m.start === Number(cohort))) && (!flowOrganization || p.memberships.some((m) => m.org === flowOrganization))), [people, cohort, flowOrganization, orgMap]);
  const flowData = useMemo(() => {
    const edges = new Map<string, { source: string; target: string; value: number }>();
    for (const p of flowPeople) {
      for (const [a, b] of [["high_school", "university"], ["university", "corporate_team"]]) {
        const from = [...new Set(p.memberships.filter((m) => orgMap.get(m.org)?.type === a).map((m) => m.org))];
        const to = [...new Set(p.memberships.filter((m) => orgMap.get(m.org)?.type === b).map((m) => m.org))];
        for (const source of from) for (const target of to) { const key = `${source}:${target}`; const edge = edges.get(key) ?? { source, target, value: 0 }; edge.value++; edges.set(key, edge); }
      }
    }
    const ranked = [...edges.values()].filter((edge) => edge.value >= 3).sort((a, b) => b.value - a.value);
    const strongest = ranked.slice(0, flowLimit);
    // Keep universities in the middle column, including their strongest known school connection.
    for (const edge of [...strongest]) {
      if (orgMap.get(edge.source)?.type !== "university") continue;
      const feeder = ranked.find((candidate) => candidate.target === edge.source);
      if (feeder && !strongest.includes(feeder)) strongest.push(feeder);
    }
    const ids = [...new Set(strongest.flatMap((e) => [e.source, e.target]))];
    return { nodes: ids.map((id) => ({ name: orgMap.get(id)!.name, id })), links: strongest.map((e) => ({ source: ids.indexOf(e.source), target: ids.indexOf(e.target), value: e.value })) };
  }, [flowPeople, orgMap, flowLimit]);
  const path = useMemo(() => {
    if (!personMap.has(personA) || !personMap.has(personB)) return [];
    const neighbors = new Map<string, Set<string>>();
    for (const p of people) for (const m of p.memberships) { if (!neighbors.has(p.id)) neighbors.set(p.id, new Set()); if (!neighbors.has(m.org)) neighbors.set(m.org, new Set()); neighbors.get(p.id)!.add(m.org); neighbors.get(m.org)!.add(p.id); }
    const previous = new Map<string, string | null>([[personA, null]]); const queue = [personA];
    for (let i = 0; i < queue.length && !previous.has(personB); i++) for (const next of neighbors.get(queue[i]) ?? []) { if (previous.has(next)) continue; previous.set(next, queue[i]); queue.push(next); }
    if (!previous.has(personB)) return [];
    const result: string[] = []; let id: string | null = personB;
    while (id !== null) { result.unshift(id); id = previous.get(id) ?? null; }
    return result;
  }, [people, personMap, personA, personB]);
  const period = (m: Person["memberships"][number]) => `${m.start ?? t.unknownStart} — ${m.ongoing ? t.present : m.end ?? t.unknownEnd}`;
  const renderPeople = (list: Person[], orgIds?: string[]) => <div className="divide-y divide-zinc-200">{list.map((p) => <div key={p.id} className="py-3"><Link className="font-medium text-zinc-900 hover:text-rose-700" href={`/${locale}/players/${p.slug}`}>{p.name}<ArrowRight className="ml-2 inline h-3 w-3" /></Link><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">{p.memberships.filter((m) => !orgIds || orgIds.includes(m.org)).map((m, index) => <span key={`${m.org}-${index}`}>{orgMap.get(m.org)?.name} · {period(m)}</span>)}</div></div>)}</div>;
  const orgSelect = (value: string, onChange: (value: string) => void) => <select aria-label={t.selectOrganization} className="min-w-0 flex-1 rounded border border-zinc-300 bg-white p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{Object.keys(types).map((type) => <optgroup key={type} label={types[type]}>{organizations.filter((o) => o.type === type).map((o) => <option key={o.id} value={o.id}>{o.name} ({o.count})</option>)}</optgroup>)}</select>;

  return <main className="min-h-screen text-[#1f2421]">
    <header className="border-b border-[#ded8cc] px-5 py-5"><div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-2 text-sm text-zinc-500">{t.description}</p></div><div className="text-xs leading-6 text-zinc-500 sm:text-right">{interpolate(t.summary, { people: people.length.toLocaleString(locale), organizations: organizations.length.toLocaleString(locale) })}<br />{t.relationshipNote}</div></div></header>
    <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500"><label className="flex items-center gap-2">{t.organizationMinimum}<select aria-label={t.organizationMinimum} value={organizationMinimum} onChange={(e) => setOrganizationMinimum(Number(e.target.value))} className="rounded border border-zinc-300 bg-white p-2 text-sm text-zinc-800">{[3, 5, 10, 20].map((n) => <option key={n} value={n}>{interpolate(t.atLeastPeople, { count: n })}</option>)}</select></label><span>{Object.entries(types).map(([type, name]) => `${name} ${organizations.filter((org) => org.type === type).length}`).join(" · ")}</span></div>
      <nav className="mb-6 flex overflow-x-auto border-b border-zinc-200" aria-label={t.views}><>{tabs.map(({ id, name, icon: Icon }) => <button key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setSelected(null); }} className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm ${mode === id ? "border-rose-700 font-semibold text-rose-700" : "border-transparent text-zinc-500"}`}><Icon className="h-4 w-4" />{t.tabs[name]}</button>)}</></nav>
      {mode === "network" && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4"><label className="flex items-center gap-2 rounded border border-zinc-300 bg-white px-3"><Search className="h-4 w-4 text-zinc-400" /><input className="w-44 bg-transparent py-2 text-sm outline-none" aria-label={t.searchOrganizations} placeholder={t.searchOrganizations} value={query} onChange={(e) => setQuery(e.target.value)} /></label><label className="flex items-center gap-3 text-xs text-zinc-600">{interpolate(t.minimumShared, { count: minimum })}<input aria-label={interpolate(t.minimumShared, { count: minimum })} type="range" min="3" max="20" value={minimum} onChange={(e) => setMinimum(Math.max(3, Number(e.target.value)))} /></label><div className="flex gap-4 text-xs">{Object.entries(types).map(([key, name]) => <span key={key}><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: colors[key] }} />{name}</span>)}</div></div>
        <div className="grid border-y border-zinc-200 lg:grid-cols-[1fr_320px]">
          <div className="relative min-w-0 overflow-hidden bg-white">{graph.nodes.length ? <NetworkCanvas locale={locale} graph={graph} selected={selected} select={setSelected} /> : <p className="flex h-[650px] items-center justify-center p-5 text-sm text-zinc-500">{t.noConnections}</p>}<div className="pointer-events-none absolute bottom-3 left-4 text-xs text-zinc-400">{interpolate(t.graphSummary, { organizations: graph.nodes.length, links: graph.links.length })}</div></div>
          <aside className="max-h-[650px] overflow-y-auto border-t border-zinc-200 bg-[#f4f6f8] p-5 lg:border-l lg:border-t-0">{selected ? <><div className="flex items-center justify-between"><h2 className="font-semibold">{orgMap.get(selected)?.name}</h2><button title={t.clearSelection} aria-label={t.clearSelection} onClick={() => setSelected(null)}><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-1">{pairs.filter((p) => p.people.length >= minimum && (p.source === selected || p.target === selected)).sort((a, b) => b.people.length - a.people.length).slice(0, 14).map((p) => { const other = p.source === selected ? p.target : p.source; return <button key={other} className="flex w-full items-center justify-between border-b border-zinc-200 py-3 text-left text-sm hover:text-rose-700" onClick={() => { setLeft(selected); setRight(other); setMode("intersection"); }}><span>{orgMap.get(other)?.name}</span><span className="font-semibold tabular-nums">{interpolate(t.peopleCount, { count: p.people.length })}</span></button>; })}</div></> : <><h2 className="font-semibold">{t.closestCircles}</h2><div className="mt-3">{pairs.filter((p) => p.people.length >= minimum).sort((a, b) => b.people.length - a.people.length).slice(0, 12).map((p) => <button key={`${p.source}:${p.target}`} className="w-full border-b border-zinc-200 py-3 text-left text-sm hover:text-rose-700" onClick={() => { setLeft(p.source); setRight(p.target); setMode("intersection"); }}><span className="block">{orgMap.get(p.source)?.name} ↔ {orgMap.get(p.target)?.name}</span><span className="text-xs text-zinc-500">{interpolate(t.sharedPeople, { count: p.people.length })}</span></button>)}</div></>}</aside>
        </div>
      </>}
      {mode === "intersection" && <>
        <div className="flex flex-wrap items-center gap-3">{orgSelect(left, setLeft)}<GitMerge className="h-5 w-5 shrink-0 text-zinc-400" />{orgSelect(right, setRight)}</div>
        <div className="my-6 grid grid-cols-3 border-y border-zinc-200 py-6 text-center"><div className="text-sm">{orgMap.get(left)?.name}<div className="mt-2 text-3xl font-semibold text-teal-700">{people.filter((p) => p.memberships.some((m) => m.org === left)).length}</div></div><div className="border-x border-zinc-200 text-sm text-zinc-500">{t.shared}<div className="mt-2 text-3xl font-semibold text-rose-700">{shared.length}</div></div><div className="text-sm">{orgMap.get(right)?.name}<div className="mt-2 text-3xl font-semibold text-violet-700">{people.filter((p) => p.memberships.some((m) => m.org === right)).length}</div></div></div>
        {left === right ? <p className="py-8 text-zinc-500">{t.differentOrganizations}</p> : shared.length ? renderPeople(shared, [left, right]) : <p className="py-8 text-zinc-500">{t.noShared}</p>}
      </>}
      {mode === "flow" && <>
        <div className="mb-4 flex flex-wrap gap-3"><select aria-label={t.flowOrganization} value={flowOrganization} onChange={(e) => { setFlowOrganization(e.target.value); setSelected(null); }} className="min-w-0 rounded border border-zinc-300 bg-white p-2 text-sm"><option value="">{t.allOrganizations}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><select aria-label={t.flowLimit} value={flowLimit} onChange={(e) => setFlowLimit(Number(e.target.value))} className="rounded border border-zinc-300 bg-white p-2 text-sm">{[36, 72, 120].map((n) => <option key={n} value={n}>{interpolate(t.topLinks, { count: n })}</option>)}</select></div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-6 text-sm"><span className="text-teal-700">{types.high_school}</span><ArrowRight className="h-4 w-4 text-zinc-400" /><span className="text-rose-700">{types.university}</span><ArrowRight className="h-4 w-4 text-zinc-400" /><span className="text-violet-700">{types.corporate_team}</span></div><select aria-label={t.cohortYear} value={cohort} onChange={(e) => { setCohort(e.target.value); setSelected(null); }} className="rounded border border-zinc-300 bg-white p-2 text-sm"><option value="all">{t.allCohorts}</option>{cohortYears.map((year) => <option key={year} value={year}>{interpolate(t.cohort, { year })}</option>)}</select></div>
        <div className="max-h-[850px] overflow-auto border-y border-zinc-200 bg-white">{flowData.links.length ? <div style={{ height: Math.max(680, Math.max(...Object.keys(types).map((type) => flowData.nodes.filter((node) => orgMap.get(node.id)?.type === type).length)) * 30 + 60) }} className="min-w-[800px]"><ResponsiveContainer width="100%" height="100%"><Sankey data={flowData} align="left" nodePadding={20} nodeWidth={12} iterations={48} margin={{ top: 30, left: 160, right: 180, bottom: 30 }} link={{ stroke: "#849eaf", strokeOpacity: 0.28 }} node={({ x, y, width, height, payload }) => {
          const org = flowData.nodes.find((node) => node.name === payload.name);
          return <g onClick={() => setSelected(org?.id ?? null)} style={{ cursor: "pointer" }}><rect x={x} y={y} width={width} height={height} fill={colors[orgMap.get(org?.id ?? "")?.type ?? "university"]} /><text x={x < 250 ? x - 8 : x + width + 8} y={y + height / 2} textAnchor={x < 250 ? "end" : "start"} dominantBaseline="middle" fontSize={11} fill="#3f3f46">{payload.name}</text></g>;
        }}><Tooltip /></Sankey></ResponsiveContainer></div> : <p className="p-8 text-zinc-500">{t.noFlow}</p>}</div>
        <p className="mt-3 text-xs text-zinc-500">{t.flowNote}</p>
        {selected && <section className="mt-6"><h2 className="font-semibold">{orgMap.get(selected)?.name} · {cohort === "all" ? t.allCohorts : interpolate(t.cohort, { year: cohort })}</h2>{renderPeople(flowPeople.filter((p) => p.memberships.some((m) => m.org === selected)))}</section>}
      </>}
      {mode === "path" && <>
        <div className="grid gap-3 sm:grid-cols-2"><PersonSelect label={t.startPerson} searchLabel={t.searchPeople} people={people} value={personA} onChange={setPersonA} /><PersonSelect label={t.endPerson} searchLabel={t.searchPeople} people={people} value={personB} onChange={setPersonB} /></div>
        <div className="my-8 flex flex-wrap items-center gap-3 border-y border-zinc-200 py-10">{path.length ? path.map((id, index) => <div key={id} className="flex items-center gap-3">{index > 0 && <ArrowRight className="h-4 w-4 text-zinc-400" />}<div className={`border-b-2 px-4 py-3 ${orgMap.has(id) ? "border-teal-600 bg-teal-50" : "border-rose-600 bg-rose-50"}`}><div className="text-xs text-zinc-500">{orgMap.has(id) ? types[orgMap.get(id)!.type] : t.athlete}</div><div className="mt-1 text-sm font-medium">{orgMap.get(id)?.name ?? personMap.get(id)?.name}</div></div></div>) : <p className="text-zinc-500">{t.noPath}</p>}</div>
        <h2 className="font-semibold">{t.pathMemberships}</h2>{renderPeople(path.flatMap((id) => personMap.has(id) ? [personMap.get(id)!] : []), path.filter((id) => orgMap.has(id)))}<p className="mt-5 text-xs text-zinc-500">{t.pathNote}</p>
      </>}
      <footer className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">{interpolate(t.scope, { count: organizationMinimum })}</footer>
    </div>
  </main>;
}

function PersonSelect({ label, searchLabel, people, value, onChange }: { label: string; searchLabel: string; people: Person[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = people.find((person) => person.id === value);
  const options = people.filter((person) => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 100);
  return <div className="relative min-w-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="listbox" onClick={() => { setOpen(!open); setQuery(""); }} className="flex w-full items-center justify-between border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2 text-left text-sm"><span className="truncate">{selected?.name}</span><span aria-hidden="true">▾</span></button>
    {open && <div className="absolute z-20 mt-1 w-full border border-[#cfc7b8] bg-white shadow-lg"><label className="flex items-center gap-2 border-b border-[#ded8cc] px-3"><Search className="h-4 w-4 text-zinc-400" /><input autoFocus aria-label={`${label}: ${searchLabel}`} placeholder={searchLabel} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && options.length) { onChange(options[0].id); setOpen(false); } }} className="w-full py-2 text-sm outline-none" /></label><div role="listbox" aria-label={label} className="max-h-60 overflow-y-auto">{options.map((person) => <button type="button" role="option" aria-selected={person.id === value} key={person.id} onClick={() => { onChange(person.id); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f2eee7] focus:bg-[#f2eee7]">{person.name}</button>)}</div></div>}
  </div>;
}

function NetworkCanvas({ locale, graph, selected, select }: { locale: Locale; graph: { nodes: { id: string; name: string; count: number; color: string }[]; links: { source: string; target: string; count: number }[] }; selected: string | null; select: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const configuredGraph = useRef<typeof graph | null>(null);
  const [width, setWidth] = useState(800);
  const t = getDictionary(locale).relationsLab;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => graphRef.current?.zoomToFit(300, 35), 300);
    return () => clearTimeout(timer);
  }, [width]);
  const zoom = (factor: number) => {
    const current = graphRef.current;
    if (current) current.zoom(current.zoom() * factor, 200);
  };
  return <div ref={container} className="relative h-[650px]">
    <div className="absolute right-3 top-3 z-10 flex gap-1 rounded border border-zinc-200 bg-white p-1 shadow-sm">
      <button type="button" title={t.zoomIn} aria-label={t.zoomIn} onClick={() => zoom(1.4)} className="flex h-9 w-9 items-center justify-center rounded-sm text-zinc-600 hover:bg-zinc-100"><ZoomIn className="h-4 w-4" /></button>
      <button type="button" title={t.zoomOut} aria-label={t.zoomOut} onClick={() => zoom(1 / 1.4)} className="flex h-9 w-9 items-center justify-center rounded-sm text-zinc-600 hover:bg-zinc-100"><ZoomOut className="h-4 w-4" /></button>
      <button type="button" title={t.fitGraph} aria-label={t.fitGraph} onClick={() => graphRef.current?.zoomToFit(300, 35)} className="flex h-9 w-9 items-center justify-center rounded-sm text-zinc-600 hover:bg-zinc-100"><Maximize className="h-4 w-4" /></button>
    </div>
    <ForceGraph ref={graphRef} onEngineTick={() => {
      if (!graphRef.current || configuredGraph.current === graph) return;
      configuredGraph.current = graph;
      graphRef.current.d3Force("charge")?.strength(-60).distanceMax(180);
      graphRef.current.d3Force("link")?.distance(65);
    }} onEngineStop={() => graphRef.current?.zoomToFit(400, 55)} graphData={graph} height={650} width={width} backgroundColor="#ffffff" nodeLabel={(node) => `${node.name} · ${interpolate(getDictionary(locale).relationsLab.peopleCount, { count: Number(node.count) })}`} nodeRelSize={3} linkWidth={(link) => Math.max(0.7, Math.sqrt(Number(link.count)) / 2)} linkColor={() => "#b0bec9"} cooldownTicks={140} d3VelocityDecay={0.35} onNodeClick={(node) => select(String(node.id))} nodeCanvasObject={(node, ctx, scale) => {
      if (node.x === undefined || node.y === undefined) return;
      const radius = Math.max(3 / scale, 4 + Math.sqrt(Number(node.count)) * 0.5);
      ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2); ctx.fillStyle = String(node.color); ctx.fill();
      if (selected === node.id) { ctx.strokeStyle = "#18181b"; ctx.lineWidth = 2 / scale; ctx.stroke(); }
      if (graph.nodes.length > 70 && scale < 1.2 && Number(node.count) < 100 && selected !== node.id) return;
      const label = String(node.name); const size = Math.max(10 / scale, 3); ctx.font = `${size}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "top";
      const width = ctx.measureText(label).width; ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.fillRect(node.x - width / 2 - 2, node.y + radius + 2, width + 4, size + 3); ctx.fillStyle = "#3f3f46"; ctx.fillText(label, node.x, node.y + radius + 3);
    }} />
  </div>;
}
