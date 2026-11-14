import Link from "next/link";
import { notFound } from "next/navigation";
import { getObservabilityOverview } from "@/lib/observability";

export const dynamic = "force-dynamic";
interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ task?: string }>;
}
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  return {
    title: locale === "zh" ? "数据治理观测" : "Data governance",
    robots: { index: false, follow: false },
  };
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-line px-2 py-1 font-mono text-xs">
      {children}
    </span>
  );
}
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
const number = (v: unknown) => Number(v ?? 0).toLocaleString();
const metric = (v: unknown, suffix = "") =>
  v === null || v === undefined ? "—" : `${number(v)}${suffix}`;
export default async function ObservabilityPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "zh") notFound();
  const t = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const data = await getObservabilityOverview((await searchParams).task);
  const current = data.tasks.find((task) => task.id === data.selectedTaskId);
  const metrics = current?.summary?.observability as
    | Record<string, unknown>
    | undefined;
  const modelUsage = Array.isArray(metrics?.modelUsage)
    ? metrics.modelUsage.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object",
      )
    : [];
  return (
    <section className="space-y-8">
      <header className="border-b border-line pb-6">
        <p className="page-kicker">TASUKI KEIFU</p>
        <h1 className="page-title">{t("数据治理观测", "Data governance")}</h1>
        <p className="page-description">
          {t(
            "按赛事、区组和 Agent 追踪导入、修复与未解决事项。",
            "Follow event imports, batch corrections and unresolved issues.",
          )}
        </p>
        <Link href={`/${locale}`} className="text-sm underline">
          {t("返回首页", "Home")}
        </Link>
        <form action="/api/auth/logout" method="post" className="mt-3">
          <button className="text-sm underline" type="submit">{t("退出登录", "Sign out")}</button>
        </form>
      </header>
      {data.source !== "configured" && (
        <p className="panel">
          {data.source === "missing"
            ? t(
                "尚未配置治理只读数据连接。",
                "Governance read connection is not configured.",
              )
            : t(
                "暂时无法读取治理数据。",
                "Governance data is temporarily unavailable.",
              )}
        </p>
      )}
      <nav
        className="flex flex-wrap gap-3"
        aria-label={t("赛事任务", "Event tasks")}
      >
        {data.tasks.map((task) => (
          <Link
            key={task.id}
            href={`/${locale}/observability?task=${task.id}`}
            className={`border px-3 py-2 text-xs ${task.id === data.selectedTaskId ? "border-ink bg-stone-100" : "border-line"}`}
          >
            <span className="font-mono">{task.id.slice(0, 8)}</span> ·{" "}
            {task.status} · {task.mode}
          </Link>
        ))}
      </nav>
      {current && (
        <div className="panel space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge>{current.status}</Badge>
            <Badge>{current.mode}</Badge>
          </div>
          <p className="break-all font-mono text-xs">{current.id}</p>
          <p>
            {t("导入", "Imported")} {number(current.summary?.importedRows)} ·{" "}
            {t("修复", "Repairs")} {number(current.summary?.repairs)} ·{" "}
            {t("计划修复", "Planned repairs")}{" "}
            {number(current.summary?.plannedRepairs)} · unresolved{" "}
            {number(current.summary?.unresolved)}
          </p>
          {metrics && (
            <div className="space-y-4 border-t border-line pt-4">
              <div>
                <h2 className="mb-2 text-sm font-semibold">
                  {t("运行性能", "Runtime")}
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                  <div><dt className="text-stone-500">{t("赛事耗时", "Event duration")}</dt><dd className="font-mono">{metric(metrics.eventDurationMs, " ms")}</dd></div>
                  <div><dt className="text-stone-500">{t("排队等待", "Queue wait")}</dt><dd className="font-mono">{metric(metrics.queueWaitMs, " ms")}</dd></div>
                  <div><dt className="text-stone-500">{t("尝试 / 重试", "Attempts / retries")}</dt><dd className="font-mono">{metric(metrics.attemptCount)} / {metric(metrics.retryCount)}</dd></div>
                  <div><dt className="text-stone-500">{t("尝试执行耗时", "Attempt time")}</dt><dd className="font-mono">{metric(metrics.attemptDurationMs, " ms")}</dd></div>
                  <div><dt className="text-stone-500">{t("重试耗时", "Retry time")}</dt><dd className="font-mono">{metric(metrics.retryDurationMs, " ms")}</dd></div>
                  <div><dt className="text-stone-500">{t("Agent 执行 / 累计耗时", "Agent runs / total time")}</dt><dd className="font-mono">{metric(metrics.agentExecutions)} / {metric(metrics.agentDurationMs, " ms")}</dd></div>
                </dl>
              </div>
              <div>
                <h2 className="mb-2 text-sm font-semibold">
                  {t("成本与治理效果", "Cost and outcomes")}
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                  <div><dt className="text-stone-500">LLM / 网络查询</dt><dd className="font-mono">{metric(metrics.llmCalls)} / {metric(metrics.networkCalls)}</dd></div>
                  <div><dt className="text-stone-500">Tokens · input / output</dt><dd className="font-mono">{metric(metrics.inputTokens)} / {metric(metrics.outputTokens)}</dd></div>
                  <div><dt className="text-stone-500">{t("估算费用", "Estimated cost")}</dt><dd className="font-mono">{(metrics.estimatedCostUsd == null || (Number(metrics.llmCalls) > 0 && metrics.costKnown !== true && Number(metrics.estimatedCostUsd) === 0)) ? t("未知", "Unknown") : `$${Number(metrics.estimatedCostUsd).toFixed(6)}`}</dd></div>
                  <div><dt className="text-stone-500">{t("规则判断", "Rule decisions")}</dt><dd className="font-mono">{metric(metrics.ruleDecisions)}</dd></div>
                  <div><dt className="text-stone-500">resolved / unresolved</dt><dd className="font-mono">{metric(metrics.resolved)} / {metric(metrics.unresolvedFindings)}</dd></div>
                  <div><dt className="text-stone-500">{t("每导入行成本", "Cost / imported row")}</dt><dd className="font-mono">{metrics.costPerImportedRowUsd == null ? "—" : `$${Number(metrics.costPerImportedRowUsd).toFixed(6)}`}</dd></div>
                  <div><dt className="text-stone-500">{t("每计划行成本", "Cost / planned row")}</dt><dd className="font-mono">{metrics.costPerPlannedRowUsd == null ? "—" : `$${Number(metrics.costPerPlannedRowUsd).toFixed(6)}`}</dd></div>
                </dl>
                {modelUsage.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line text-stone-500">
                        <tr><th className="py-2 pr-4">{t("模型", "Model")}</th><th className="py-2 pr-4">{t("调用", "Calls")}</th><th className="py-2 pr-4">Input tokens</th><th className="py-2">Output tokens</th></tr>
                      </thead>
                      <tbody>
                        {modelUsage.map((item, index) => (
                          <tr className="border-b border-line last:border-0" key={`${String(item.model)}-${index}`}>
                            <td className="py-2 pr-4 font-mono">{String(item.model ?? "—")}</td><td className="py-2 pr-4 font-mono">{metric(item.calls)}</td><td className="py-2 pr-4 font-mono">{metric(item.inputTokens)}</td><td className="py-2 font-mono">{metric(item.outputTokens)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("区 / 组", "Batches")}</h2>
        {data.batches.map((batch) => (
          <article key={batch.id} id={batch.id} className="panel space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>
                {batch.unitType} {batch.unitKey}
              </Badge>
              <Badge>{batch.status}</Badge>
            </div>
            <p className="text-sm">
              {t("当前节点", "Current node")}:{" "}
              <code>{batch.currentNode ?? "—"}</code>
            </p>
            <p className="text-sm">
              {t("导入", "Imported")} {number(batch.summary?.importedRows)} ·{" "}
              {t("修复", "Repairs")} {number(batch.summary?.repairs)} ·{" "}
              {t("计划修复", "Planned repairs")}{" "}
              {number(batch.summary?.plannedRepairs)} · unresolved{" "}
              {number(batch.summary?.unresolved)}
            </p>
            <details>
              <summary className="cursor-pointer text-sm">
                Agent {t("执行记录", "executions")}
              </summary>
              <div className="mt-3 space-y-2">
                {data.agents
                  .filter((a) => a.batchId === batch.id)
                  .map((a) => (
                    <div
                      key={a.id}
                      className="border-t border-line pt-2 text-xs"
                    >
                      <code>{a.agentKey}</code> · {a.status} · v{a.agentVersion}
                      <p className="mt-1 text-stone-500">
                        LLM {number(a.metrics?.llmCalls)} · web{" "}
                        {number(a.metrics?.networkCalls)} · tokens{" "}
                        {number(
                          Number(a.metrics?.inputTokens ?? 0) +
                            Number(a.metrics?.outputTokens ?? 0),
                        )}{" "}
                        · {number(a.metrics?.durationMs)} ms
                      </p>
                      {records(a.metrics?.normalizationStages).length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left">
                            <caption className="text-left font-medium">{t("归一化阶段", "Normalization stages")}</caption>
                            <thead><tr><th>{t("阶段", "Stage")}</th><th>{t("输入", "Input")}</th><th>{t("本阶段解决", "Resolved in stage")}</th><th>{t("剩余", "Remaining")}</th><th>ms</th></tr></thead>
                            <tbody>{records(a.metrics?.normalizationStages).map((stage, i) => (
                              <tr key={i}><td className="pr-3 font-mono">{String(stage.stage)}</td><td>{metric(stage.inputCount)}</td><td>{metric(stage.resolvedCount)}</td><td>{metric(stage.remainingCount)}</td><td>{metric(stage.durationMs)}</td></tr>
                            ))}</tbody>
                          </table>
                          <p className="mt-1 text-stone-500">{t("阶段解决数口径不同，不累加为最终解决人数。", "Stage counts have different scopes; do not sum them as final resolved people.")}</p>
                        </div>
                      )}
                      {a.metrics?.normalizationSummary != null && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-stone-500">
                          {[
                            ["crossCheckIssues", t("交叉问题", "Cross-check issues")],
                            ["organizationCorrections", t("组织修正", "Organization corrections")],
                            ["affectedPeople", t("受影响选手", "Affected people")],
                            ["reassessedPeople", t("模型重评选手", "People reassessed by model")],
                            ["affectedPeopleResolved", t("受影响选手最终解决", "Affected people finally resolved")],
                          ].map(([key, label]) => <span key={key}>{label}: {metric((a.metrics?.normalizationSummary as Record<string, unknown> | undefined)?.[key])}</span>)}
                        </div>
                      )}
                      {records(a.metrics?.researchCalls).length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left">
                            <caption className="text-left font-medium">{t("模型物理请求", "Physical model requests")}</caption>
                            <thead><tr><th>{t("类型 / 阶段", "Category / stage")}</th><th>{t("对象数", "Items")}</th><th>Tokens in / out</th><th>ms</th><th>{t("停止原因", "Stop reason")}</th></tr></thead>
                            <tbody>{records(a.metrics?.researchCalls).map((call, i) => (
                              <tr key={i}><td className="pr-3 font-mono">{String(call.category)} / {String(call.stage ?? "—")}</td><td>{metric(call.itemCount)}</td><td>{metric(call.inputTokens)} / {metric(call.outputTokens)}</td><td>{metric(call.durationMs)}</td><td>{String(call.stoppedReason ?? "—")}</td></tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          </article>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("治理问题与依据", "Findings and evidence")}
        </h2>
        {data.findings.map((f) => (
          <article className="panel space-y-3" key={f.id}>
            <div className="flex flex-wrap gap-2">
              <Badge>{f.resolutionStatus}</Badge>
              <Badge>{f.severity}</Badge>
              <code className="text-xs">{f.findingCode}</code>
            </div>
            <p>{f.reason}</p>
            <p className="break-all text-xs text-stone-500">{f.subjectRef}</p>
            {f.evidence
              .filter((e) => e.url && /^https?:\/\//.test(e.url))
              .map((e, i) => (
                <p key={i} className="text-sm">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {e.url}
                  </a>
                  {e.quote && <span> — {e.quote.slice(0, 400)}</span>}
                </p>
              ))}
          </article>
        ))}
        {!data.findings.length && (
          <p className="text-stone-500">
            {t("暂无治理问题记录。", "No findings recorded.")}
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("治理变更", "Changes")}</h2>
        {data.changes.map((c) => (
          <article className="panel space-y-2" key={c.id}>
            <div className="flex flex-wrap gap-2">
              <Badge>{c.status}</Badge>
              <code className="text-xs">{c.operation}</code>
            </div>
            <p className="text-sm">{c.reason}</p>
            {c.diff && (
              <details>
                <summary className="cursor-pointer text-sm">
                  {t("变更前后", "Before / after")}
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(c.diff, null, 2)}
                </pre>
              </details>
            )}
            <p className="break-all font-mono text-xs text-stone-500">
              {c.entityRef}
            </p>
            {c.businessAuditRef && (
              <p className="font-mono text-xs">
                AuditLog: {c.businessAuditRef}
              </p>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {t("邮件投递", "Mail delivery")}
        </h2>
        {data.notifications.map((n) => (
          <article key={n.id} className="panel space-y-2 text-sm">
            <Badge>{n.status}</Badge> <code>{n.kind}</code>
            <p>
              {t("尝试次数", "Attempts")}: {n.attemptCount}
              {n.sentAt ? ` · ${n.sentAt}` : ""}
            </p>
            {n.errorMessage && <p>{n.errorMessage}</p>}
          </article>
        ))}
      </section>
      <p className="text-xs text-stone-500">
        {t(
          "最近 20 个任务；所选任务最多展示 300 个批次、100 条执行 / 问题 / 变更。",
          "Latest 20 tasks; up to 300 batches and 100 executions / findings / changes for the selected task.",
        )}
      </p>
    </section>
  );
}
