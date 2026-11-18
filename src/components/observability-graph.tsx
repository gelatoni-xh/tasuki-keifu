"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { buildGraphSource, graphNode, graphSummary, graphText, type GraphLanguage } from "@/lib/observability-graph";

const copy = {
  zh: { graph: "真实 Graph 节点", rule: "内部规则", llm: "LLM 请求", web: "Web Search 工具", flow: "编排顺序", conditional: "条件 / 内部调用", membership: "履历治理", facts: "个人事实", zoomIn: "放大", zoomOut: "缩小", reset: "重置缩放", selected: "节点详情", choose: "悬浮或点击节点查看详情", trigger: "触发条件", checks: "规则与核查项", outcomes: "可能结果", note: "三个治理阶段按顺序相连。虚线展示条件或节点内部逻辑；LLM 与 Web Search 是节点内部调用，不是额外的 LangGraph 节点。", error: "图暂时无法显示。" },
  en: { graph: "Graph node", rule: "Internal rule", llm: "LLM request", web: "Web Search tool", flow: "Execution order", conditional: "Condition / internal call", membership: "Affiliations", facts: "Person facts", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset zoom", selected: "Node details", choose: "Hover over or select a node", trigger: "When it runs", checks: "Rules and checks", outcomes: "Possible outcomes", note: "The three governance stages follow their execution order. Dashed lines show conditions or internal logic. LLM and Web Search calls occur inside nodes; they are not additional LangGraph nodes.", error: "The graph is temporarily unavailable." },
  ja: { graph: "Graph ノード", rule: "内部ルール", llm: "LLM リクエスト", web: "Web Search ツール", flow: "実行順序", conditional: "条件／内部呼び出し", membership: "所属履歴", facts: "人物情報", zoomIn: "拡大", zoomOut: "縮小", reset: "倍率を戻す", selected: "ノードの詳細", choose: "ノードにカーソルを合わせるか選択してください", trigger: "実行条件", checks: "ルールと確認項目", outcomes: "考えられる結果", note: "三つの管理段階を実行順に表示しています。破線は条件または内部処理を示します。LLM と Web Search はノード内部の呼び出しであり、独立した LangGraph ノードではありません。", error: "現在グラフを表示できません。" },
} as const;

let renderNumber = 0;
function nodeId(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const id = target.closest("g.node")?.id.match(/-flowchart-(.+)-\d+$/)?.[1];
  return id && graphNode(id) ? id : null;
}

export function ObservabilityGraph({ language }: { language: GraphLanguage }) {
  const text = copy[language];
  const canvas = useRef<HTMLDivElement>(null);
  const diagram = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const active = hovered ?? selected;
  const diagramHtml = useMemo(() => ({ __html: svg }), [svg]);

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", flowchart: { curve: "basis", nodeSpacing: 30, rankSpacing: 38, padding: 10 }, themeVariables: { fontFamily: "Arial, sans-serif", fontSize: "13px", lineColor: "#84958e" } });
      const result = await mermaid.render(`observability-graph-${language}-${++renderNumber}`, buildGraphSource(language));
      if (!cancelled) { setSvg(result.svg); setError(false); setSelected(null); setHovered(null); }
    }).catch((cause) => { console.error("Observability graph render failed", cause); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [language]);

  useEffect(() => {
    const element = diagram.current?.querySelector("svg");
    if (!element || !canvas.current) return;
    const width = element.viewBox.baseVal.width;
    element.style.width = `${Math.max(1000, width)}px`;
    element.style.height = "auto";
    element.style.maxWidth = "none";
    diagram.current?.querySelectorAll("g.node").forEach((node) => {
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
    });
    canvas.current.scrollLeft = (canvas.current.scrollWidth - canvas.current.clientWidth) / 2;
  }, [svg]);

  const jump = (id: string) => {
    const node = Array.from(diagram.current?.querySelectorAll("g.node") ?? []).find((item) => item.id.includes(`-flowchart-${id}-`));
    node?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    setSelected(id);
  };
  const details = active ? graphNode(active) : null;
  const alias = active && ({ organization_light_batch: "llm_org", person_light_batch: "llm_person", normalization_cross_check: "llm_cross", organization_adjudication: "llm_adjudicate", organization_network_research: "llm_org_net", affected_person_reassessment: "llm_reassess", normalization_deep_research: "llm_deep" } as Record<string, string>)[active];
  const inspection = alias ? graphNode(alias) : details;
  const sections = inspection ? [
    [text.trigger, inspection.trigger ? [inspection.trigger] : []],
    [text.checks, inspection.checks ?? []],
    [text.outcomes, inspection.outcomes ?? []],
  ] as const : [];
  const info = details && (
    <>
      <h3 className="text-base font-semibold text-[#243c33]">{graphText(details.label, language)}</h3>
      <code className="mt-1 block break-all text-[11px] text-[#66756f]">{details.id}</code>
      {graphSummary(details.id) && <p className="mt-2 text-xs leading-relaxed text-[#40534b]">{graphText(graphSummary(details.id), language)}</p>}
      {sections.map(([heading, items]) => items.length > 0 && <section key={heading} className="mt-3">
        <h4 className="text-[11px] font-semibold text-[#477264]">{heading}</h4>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#40534b]">{items.map((item, index) => <li key={index}>{graphText(item, language)}</li>)}</ul>
      </section>)}
    </>
  );

  return <section className="space-y-3" aria-label={text.graph}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#52635b]">
      <span><i className="mr-1 inline-block size-3 border border-[#5790a5] bg-[#e5f1f5]" />{text.graph}</span>
      <span><i className="mr-1 inline-block size-3 border border-dashed border-[#bd914b] bg-[#fff8ed]" />{text.rule}</span>
      <span><i className="mr-1 inline-block size-3 border border-dashed border-[#427eae] bg-[#e5eef8]" />{text.llm}</span>
      <span><i className="mr-1 inline-block size-3 border border-dashed border-[#cf8152] bg-[#fff0e6]" />{text.web}</span>
      <span><i className="mr-1 inline-block w-5 border-t-2 border-[#84958e] align-middle" />{text.flow}</span>
      <span><i className="mr-1 inline-block w-5 border-t-2 border-dashed border-[#9e7798] align-middle" />{text.conditional}</span>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => jump("govern_membership")} className="border border-line bg-white px-2 py-1 hover:bg-[#edf4f0]">{text.membership}</button>
        <button type="button" onClick={() => jump("verify_person_facts")} className="border border-line bg-white px-2 py-1 hover:bg-[#edf4f0]">{text.facts}</button>
        <button type="button" aria-label={text.zoomOut} title={text.zoomOut} onClick={() => setZoom((value) => Math.max(.6, value - .15))} className="border border-line bg-white p-1.5 hover:bg-[#edf4f0]"><ZoomOut size={16} /></button>
        <button type="button" aria-label={text.reset} title={text.reset} onClick={() => setZoom(1)} className="border border-line bg-white p-1.5 hover:bg-[#edf4f0]"><Scan size={16} /></button>
        <button type="button" aria-label={text.zoomIn} title={text.zoomIn} onClick={() => setZoom((value) => Math.min(1.6, value + .15))} className="border border-line bg-white p-1.5 hover:bg-[#edf4f0]"><ZoomIn size={16} /></button>
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div ref={canvas} className="h-[65vh] min-h-[440px] overflow-auto border border-line bg-white lg:h-[78vh]" onPointerMove={(event) => { if (event.pointerType !== "mouse") return; const id = nodeId(event.target); setHovered(id); setPointer({ x: event.clientX, y: event.clientY }); }} onPointerLeave={() => setHovered(null)} onClick={(event) => { const id = nodeId(event.target); if (id) setSelected(id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { const id = nodeId(event.target); if (id) { event.preventDefault(); setSelected(id); } } }}>
        {error ? <p className="p-6 text-sm">{text.error}</p> : <div ref={diagram} className="w-max min-w-full p-6" style={{ zoom }} dangerouslySetInnerHTML={diagramHtml} />}
      </div>
      <aside className="min-h-40 self-start border-t-[3px] border-[#477264] bg-white p-4 ring-1 ring-[#d9e3de]" aria-live="polite">
        <p className="text-[11px] font-semibold text-[#65736d]">{text.selected}</p>
        <div className="mt-3">{info ?? <p className="text-sm text-[#65736d]">{text.choose}</p>}</div>
      </aside>
    </div>
    <p className="text-xs leading-relaxed text-[#65746d]">{text.note}</p>
    {hovered && <div className="pointer-events-none fixed z-50 max-h-[65vh] w-[min(390px,calc(100vw-24px))] overflow-hidden border border-[#afc8be] border-t-[3px] border-t-[#477264] bg-white p-4 shadow-xl" style={{ left: Math.max(12, Math.min(pointer.x + 14, typeof window === "undefined" ? 12 : window.innerWidth - 402)), top: Math.max(12, Math.min(pointer.y + 14, typeof window === "undefined" ? 12 : window.innerHeight - 400)) }} aria-hidden="true">{info}</div>}
  </section>;
}
