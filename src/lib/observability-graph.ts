export type GraphLanguage = "zh" | "en" | "ja";
type Text = readonly [string, string, string];
type Kind = "graph" | "rule" | "child" | "internal" | "llm" | "web" | "result";
type Node = { id: string; label: Text; kind: Kind; checks?: readonly Text[]; trigger?: Text; outcomes?: readonly Text[] };

const nodes: Node[] = [
  { id: "load_batch_context", label: ["加载批次上下文", "Load batch context", "バッチの文脈を読み込む"], kind: "graph" },
  { id: "organization_rules", label: ["组织规则投影", "Organization rules", "組織ルールの適用"], kind: "rule", checks: [
    ["先复用来源映射与同批映射。", "Reuse source and same-batch mappings first.", "まず出典と同一バッチの対応付けを再利用する。"],
    ["名称规范化、类型兼容且只有一个候选时直接匹配。", "Match a sole candidate with normalized name and compatible type.", "正規化した名称と種別が一致する候補が一つなら対応付ける。"],
    ["无确定归属时保留独立来源组织。", "Keep a separate source organization when identity is uncertain.", "同一性が不明なら出典側の組織を独立して保持する。"],
  ] },
  { id: "organization_light_batch", label: ["组织轻量研究", "Organization triage", "組織の一次調査"], kind: "graph" },
  { id: "person_rules", label: ["人物身份规则投影", "Person identity rules", "人物同定ルールの適用"], kind: "rule", checks: [
    ["检查来源映射、历史成绩、所属与生日。", "Check source mappings, historical results, affiliations and birth dates.", "出典の対応付け、過去の記録、所属、生年月日を確認する。"],
    ["明确的生日或所属时间冲突阻止直接匹配。", "Explicit birth-date or affiliation-time conflicts block a direct match.", "生年月日や所属期間の明確な矛盾があれば直接照合しない。"],
    ["同名或同所属不足以确认同一人物；DNS 不是出场证明。", "Same name or affiliation alone is insufficient; DNS is not proof of participation.", "同名・同所属だけでは同一人物とせず、DNS は出場の証明としない。"],
  ] },
  { id: "person_light_batch", label: ["人物轻量研究", "Person triage", "人物の一次調査"], kind: "graph" },
  { id: "prepare_cross_check", label: ["准备交叉核查", "Prepare cross-check", "横断検証の準備"], kind: "rule" },
  { id: "normalization_cross_check", label: ["跨实体交叉核查", "Cross-entity check", "エンティティ横断検証"], kind: "graph" },
  { id: "validate_cross_check", label: ["校验核查结果", "Validate check results", "検証結果の確認"], kind: "rule", checks: [
    ["问题不得重复，人物行必须属于该来源组织。", "Issue keys must be unique and person rows must belong to the source organization.", "問題キーは重複不可。人物行は対象の出典組織に属する必要がある。"],
    ["证据引用必须在允许范围内，且与该问题相关。", "Evidence references must be allowed and relevant to the issue.", "証拠参照は許可された範囲内で、当該問題と関連している必要がある。"],
    ["相关证据不足则标记未解决，并撤销受影响人物的暂定判断。", "Insufficient relevant evidence leaves the issue unresolved and invalidates affected provisional decisions.", "関連証拠が不足すれば未解決とし、影響を受ける人物の暫定判断を取り消す。"],
  ] },
  { id: "organization_adjudication", label: ["组织裁决", "Organization adjudication", "組織の裁定"], kind: "graph" },
  { id: "organization_network_research", label: ["组织网络研究", "Organization web research", "組織のウェブ調査"], kind: "graph" },
  { id: "affected_person_reassessment", label: ["受影响人物重评", "Reassess affected people", "影響を受けた人物の再評価"], kind: "graph" },
  { id: "normalization_deep_research", label: ["人物深度研究", "Deep person research", "人物の詳細調査"], kind: "graph" },
  { id: "finalize_normalization", label: ["完成实体归一化", "Finalize normalization", "同定処理の確定"], kind: "rule" },
  { id: "govern_membership", label: ["履历规则与冲突处理", "Affiliation rules and conflicts", "所属履歴のルールと矛盾処理"], kind: "child" },
  { id: "member_source", label: ["规则 · 来源履历 / 隐含所属", "Rule · source / implicit affiliation", "ルール · 出典履歴／暗黙の所属"], kind: "internal", checks: [
    ["整合来源明确的履历和参赛行的组织线索。", "Combine explicit history with organization hints from source rows.", "出典に明記された履歴と参加行の組織情報を統合する。"],
    ["只有中学、高中、大学和企业队可由参赛组织推导所属。", "Only junior high, high school, university and corporate teams can imply affiliation.", "出場組織から所属を推定できるのは中学・高校・大学・実業団のみ。"],
    ["身份未解决的来源行不生成履历变更。", "Unresolved identities produce no affiliation change.", "人物同定が未解決の行から所属変更は作らない。"],
  ] },
  { id: "member_window", label: ["规则 · 学制与相邻阶段补空", "Rule · academic and adjacent windows", "ルール · 学年と隣接期から期間補完"], kind: "internal", checks: [
    ["按组织类型、学年、赛事日期推算时间窗口。", "Infer a window from organization type, grade and race date.", "組織種別・学年・大会日から期間を推定する。"],
    ["可用相邻学校阶段补空；推算值不覆盖来源日期。", "Adjacent school stages may fill gaps; inferred dates never overwrite sourced dates.", "隣接する学校段階で空欄を補うが、推定日付は出典の日付を上書きしない。"],
  ] },
  { id: "member_conflict", label: ["规则 · 日期 / 重复 / 互斥冲突", "Rule · dates / duplicates / exclusions", "ルール · 日付／重複／排他の矛盾"], kind: "internal", checks: [
    ["同一组织的多段履历不直接折叠。", "Do not collapse multiple records for one organization.", "同一組織の複数履歴を安易に統合しない。"],
    ["新旧明确日期不一致或起始晚于结束时标记冲突。", "Flag conflicting sourced dates or a start after the end.", "出典の日付が矛盾するか開始が終了より遅ければ問題とする。"],
    ["同一学段不同学校的明确时间重叠也标记冲突。", "Flag definite overlap between different schools in the same stage.", "同じ学段の異なる学校で確定期間が重なる場合も問題とする。"],
  ] },
  { id: "member_result", label: ["拟议履历变更 / 未解决事项", "Proposed affiliation changes / unresolved", "所属変更案／未解決事項"], kind: "result" },
  { id: "verify_person_facts", label: ["个人事实核查", "Person fact check", "人物情報の確認"], kind: "child" },
  { id: "fact_hometown", label: ["规则 · 可靠来源补空籍贯", "Rule · fill missing hometown", "ルール · 信頼できる出典で出身地を補完"], kind: "internal", checks: [
    ["跳过 DNS 和身份未解决的行。", "Skip DNS and unresolved identities.", "DNS と人物同定が未解決の行を除外する。"],
    ["只有原值为空且来源可靠度至少为 3 才补空。", "Fill only an empty value from a source with reliability at least 3.", "既存値が空で、出典の信頼度が 3 以上の場合だけ補完する。"],
  ] },
  { id: "fact_pb", label: ["规则 · PB 项目 / 成绩 / 来源比较", "Rule · PB event / mark / source", "ルール · PB 種目／記録／出典の比較"], kind: "internal", checks: [
    ["跳过 DNS、未确定身份和不支持的项目。", "Skip DNS, unresolved identities and unsupported events.", "DNS、人物同定が未解決の行、対象外種目を除外する。"],
    ["成绩可解析且来源可靠度至少为 3。", "Require a valid mark and source reliability of at least 3.", "解析可能な記録と 3 以上の出典信頼度を要する。"],
    ["更新既有 PB 须成绩更好且来源可靠度不低于原来源。", "An update must be faster and at least as reliable as the existing source.", "既存 PB の更新には、より良い記録と既存出典以上の信頼度が必要。"],
  ] },
  { id: "fact_result", label: ["拟议个人事实变更", "Proposed fact changes", "人物情報の変更案"], kind: "result" },
  { id: "aggregate_governance_result", label: ["汇总治理计划", "Assemble governance plan", "ガバナンス計画の集約"], kind: "result" },
  { id: "llm_org", label: ["LLM · 组织批量判断", "LLM · organization batch", "LLM · 組織の一括判定"], kind: "llm", trigger: ["有未确定组织候选；不联网。", "Unresolved organization candidates; no web search.", "未確定の組織候補がある場合。ウェブ検索なし。"], checks: [
    ["判断普通简称或名称变体，不用人物结论反证组织。", "Assess common abbreviations and variants without using provisional person matches.", "略称・表記ゆれを判断し、暫定的な人物同定を組織の証拠にしない。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別組織・未解決。"]] },
  { id: "llm_person", label: ["LLM · 人物批量判断", "LLM · person batch", "LLM · 人物の一括判定"], kind: "llm", trigger: ["有人物候选；不联网。", "Person candidates exist; no web search.", "人物候補がある場合。ウェブ検索なし。"], checks: [
    ["逐个评价姓名关系和同人可能性，结合生日、所属时间与独立证据。", "Assess each name relation and identity likelihood using birth date, affiliation time and independent evidence.", "候補ごとに氏名関係と同一人物の可能性を、生年月日・所属期間・独立証拠から評価する。"],
    ["同名、同读音、同所属都不足以单独确认；生日冲突不可匹配。", "Name, reading or affiliation alone is insufficient; conflicting birth dates cannot match.", "同名・同音・同所属だけでは確定せず、生年月日が矛盾すれば一致としない。"],
  ], outcomes: [["证据充分则匹配；均可排除则不同；否则未解决。", "Match with evidence, distinct if all are excluded, otherwise unresolved.", "証拠が十分なら一致、全候補を除外できれば別人、それ以外は未解決。"]] },
  { id: "llm_cross", label: ["LLM · 交叉核查", "LLM · cross-check", "LLM · 横断検証"], kind: "llm", trigger: ["有来源数据；不联网。", "Source data exists; no web search.", "出典データがある場合。ウェブ検索なし。"], checks: [
    ["找组织与人物判断中的实质矛盾、循环证据。", "Find substantive conflicts and circular evidence across organization and person decisions.", "組織と人物の判断にある実質的な矛盾や循環証拠を探す。"],
    ["DNS 不代表出场；成绩所属不自动证明 Membership。", "DNS is not participation; result affiliation does not prove membership.", "DNS は出場ではなく、記録上の所属だけで在籍を証明しない。"],
  ], outcomes: [["只提出问题；没有实质矛盾则返回空清单。", "Report issues only; return an empty list if none are substantive.", "問題のみ報告し、実質的な矛盾がなければ空リストを返す。"]] },
  { id: "llm_adjudicate", label: ["LLM · 独立证据裁决", "LLM · independent adjudication", "LLM · 独立証拠による裁定"], kind: "llm", trigger: ["需复核组织；不联网。", "Organization review requested; no web search.", "組織の再確認が必要な場合。ウェブ検索なし。"], checks: [
    ["只用组织名称与独立来源，不用暂定人物同一结论。", "Use organization names and independent sources, not provisional person identity.", "組織名と独立した出典のみを使い、暫定的な人物同定を根拠にしない。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別組織・未解決。"]] },
  { id: "llm_org_net", label: ["LLM · 单组织研究", "LLM · single-organization research", "LLM · 個別組織の調査"], kind: "llm", trigger: ["组织仍待确认；允许 Web Search。", "Organization remains uncertain; web search is available.", "組織が未確定の場合。ウェブ検索を利用可能。"], checks: [
    ["优先官网与赛事名录，引用实际 URL 和支持结论的原文。", "Prefer official sites and race rosters; cite actual URLs and supporting text.", "公式サイトや大会名簿を優先し、実際の URL と根拠の原文を引用する。"],
    ["不凭人物暂定结论证明组织，也不推断 Membership。", "Do not use provisional person matches or infer membership.", "暫定的な人物同定を組織の証拠にせず、所属履歴も推定しない。"],
  ], outcomes: [["匹配既有候选、可区分或未解决。", "Match an existing candidate, distinct or unresolved.", "既存候補と一致・別組織・未解決。"]] },
  { id: "web_org", label: ["Web Search", "Web Search", "Web Search"], kind: "web" },
  { id: "llm_reassess", label: ["LLM · 人物批量重评", "LLM · person reassessment", "LLM · 人物の一括再評価"], kind: "llm", trigger: ["组织判断影响人物；不联网。", "Organization decision affects people; no web search.", "組織の判断が人物に影響した場合。ウェブ検索なし。"], checks: [
    ["只重评受影响者；仍不能仅凭同名同所属确认。", "Reassess affected people only; name and affiliation alone remain insufficient.", "影響を受けた人物のみ再評価し、同名・同所属だけで確定しない。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別人・未解決。"]] },
  { id: "llm_deep", label: ["LLM · 单人物深研", "LLM · deep person research", "LLM · 個別人物の詳細調査"], kind: "llm", trigger: ["疑难身份未解决且符合深研门槛；允许 Web Search。", "Unresolved identity meets the deep-research gate; web search is available.", "未解決の同定問題が詳細調査の条件を満たす場合。ウェブ検索を利用可能。"], checks: [
    ["核查生日冲突、交叉问题、同音异字或疑似误录。", "Investigate birth-date conflicts, cross-check issues, variant characters or suspected transcription errors.", "生年月日の矛盾、横断検証の問題、同音異字や入力誤りの疑いを調べる。"],
    ["轻量判断只是待验证假设，不是独立证据。", "Triage is a hypothesis, not independent evidence.", "一次判断は仮説であり、独立した証拠ではない。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別人・未解決。"]] },
  { id: "web_person", label: ["Web Search", "Web Search", "Web Search"], kind: "web" },
  { id: "llm_membership", label: ["LLM · 履历冲突研究", "LLM · affiliation conflict research", "LLM · 所属履歴の矛盾調査"], kind: "llm", trigger: ["存在实质履历冲突；允许 Web Search。", "Substantive affiliation conflict exists; web search is available.", "実質的な所属履歴の矛盾がある場合。ウェブ検索を利用可能。"], checks: [
    ["更正只能涉及允许的履历 ID，且起止日期有效。", "Corrections must target allowed record IDs and valid dates.", "修正対象は許可された履歴 ID に限り、開始・終了日が有効でなければならない。"],
    ["更正后不得留下互斥冲突。", "Corrections must leave no exclusion conflict.", "修正後に排他的な矛盾を残してはならない。"],
  ], outcomes: [["有效更正可解决问题；否则保持未解决。", "A valid correction resolves the issue; otherwise it remains unresolved.", "有効な修正なら解決し、それ以外は未解決のままにする。"]] },
  { id: "web_membership", label: ["Web Search", "Web Search", "Web Search"], kind: "web" },
];

const byId = Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, Node>;
const summaries: Record<string, Text> = {
  load_batch_context: ["读取批次数据和历史上下文，初始化治理状态。", "Load batch data and historical context; initialize governance state.", "バッチデータと過去の文脈を読み込み、処理状態を初期化する。"],
  organization_light_batch: ["对未确定的组织候选进行批量 LLM 判断，不开放 Web Search。", "Batch LLM triage for uncertain organizations; no Web Search.", "未確定の組織候補を LLM で一括判定する。Web Search は使わない。"],
  person_light_batch: ["对未确定的人物候选进行批量 LLM 判断，不开放 Web Search。", "Batch LLM triage for uncertain people; no Web Search.", "未確定の人物候補を LLM で一括判定する。Web Search は使わない。"],
  prepare_cross_check: ["复制当前归一化状态，准备跨实体核查。", "Copy the current normalization state for cross-entity checks.", "現在の同定状態を複製し、エンティティ横断検証を準備する。"],
  normalization_cross_check: ["核查组织、人物和证据之间的实质矛盾，只提出问题。", "Check substantive conflicts among organizations, people and evidence; report issues only.", "組織・人物・証拠の実質的な矛盾を調べ、問題のみ報告する。"],
  organization_adjudication: ["仅用独立组织证据补充裁决需复核的组织。", "Adjudicate organizations requiring review using independent organization evidence.", "独立した組織の証拠のみで、再確認が必要な組織を裁定する。"],
  organization_network_research: ["逐个研究仍待确认的组织；模型可以按需搜索。", "Research uncertain organizations one by one; the model may search when needed.", "未確定の組織を個別に調査し、必要に応じて検索できる。"],
  affected_person_reassessment: ["组织判断变化后，只重评受影响人物。", "Reassess only people affected by a changed organization decision.", "組織の判断が変わった場合、影響を受けた人物のみ再評価する。"],
  normalization_deep_research: ["仅对符合身份疑难门槛的人物深研；可选 Web Search。", "Deep research only for eligible identity disputes; Web Search is available.", "条件を満たす人物同定の難件のみ詳細調査する。Web Search を利用できる。"],
  finalize_normalization: ["汇总实体映射，并根据输入决定后续治理路径。", "Finalize entity mappings and route to downstream governance as needed.", "エンティティの対応付けを確定し、入力に応じて後続の処理を選ぶ。"],
  govern_membership: ["编译子 Graph 的单一节点；图中展开其内部规则和请求。", "A compiled child Graph with one node; internal rules and calls are expanded here.", "単一ノードのコンパイル済みサブ Graph。内部ルールと呼び出しを展開している。"],
  member_result: ["生成拟议履历变更和未解决事项，不直接写入业务数据库。", "Produce proposed affiliation changes and unresolved issues without writing business data.", "所属履歴の変更案と未解決事項を作成し、業務データベースへ直接書き込まない。"],
  verify_person_facts: ["编译子 Graph 的单一节点；内部只运行规则。", "A compiled child Graph with one rule-only node.", "ルールのみを実行する単一ノードのコンパイル済みサブ Graph。"],
  fact_result: ["生成拟议个人事实变更，没有 LLM 或 Web Search。", "Produce proposed person-fact changes without LLM or Web Search.", "LLM や Web Search を使わず、人物情報の変更案を作成する。"],
  aggregate_governance_result: ["合并各阶段结果，生成本批次治理计划。", "Combine stage results into the batch governance plan.", "各段階の結果を統合し、バッチのガバナンス計画を作成する。"],
  web_org: ["Responses API 内部可选工具，只有实际搜索时才产生调用。", "Optional Responses API tool; a call exists only when the model searches.", "Responses API 内の任意ツール。モデルが実際に検索した場合のみ呼び出しが発生する。"],
  web_person: ["Responses API 内部可选工具，只有实际搜索时才产生调用。", "Optional Responses API tool; a call exists only when the model searches.", "Responses API 内の任意ツール。モデルが実際に検索した場合のみ呼び出しが発生する。"],
  web_membership: ["Responses API 内部可选工具，只有实际搜索时才产生调用。", "Optional Responses API tool; a call exists only when the model searches.", "Responses API 内の任意ツール。モデルが実際に検索した場合のみ呼び出しが発生する。"],
};
const order = ["load_batch_context", "organization_rules", "organization_light_batch", "person_rules", "person_light_batch", "prepare_cross_check", "normalization_cross_check", "validate_cross_check", "organization_adjudication", "organization_network_research", "affected_person_reassessment", "normalization_deep_research", "finalize_normalization"];
const auxiliary: Array<[string, string, Text]> = [
  ["organization_light_batch", "llm_org", ["有组织候选", "Candidates", "組織候補あり"]],
  ["person_light_batch", "llm_person", ["有人物候选", "Candidates", "人物候補あり"]],
  ["normalization_cross_check", "llm_cross", ["有来源数据", "Source data", "出典データあり"]],
  ["organization_adjudication", "llm_adjudicate", ["需复核组织", "Review needed", "再確認が必要"]],
  ["organization_network_research", "llm_org_net", ["待确认组织", "Uncertain organization", "未確定の組織"]],
  ["llm_org_net", "web_org", ["模型按需", "If needed", "必要に応じて"]],
  ["affected_person_reassessment", "llm_reassess", ["受影响人物", "Affected people", "影響を受けた人物"]],
  ["normalization_deep_research", "llm_deep", ["身份疑难符合门槛", "Deep-research gate", "詳細調査の条件"]],
  ["llm_deep", "web_person", ["模型按需", "If needed", "必要に応じて"]],
  ["member_conflict", "llm_membership", ["实质冲突", "Substantive conflict", "実質的な矛盾"]],
  ["llm_membership", "web_membership", ["模型按需", "If needed", "必要に応じて"]],
];
const index = { zh: 0, en: 1, ja: 2 } as const;
const label = (text: Text, language: GraphLanguage) => text[index[language]];
const declaration = (id: string, language: GraphLanguage) => `${id}["${label(byId[id].label, language)}"]`;
const edge = (from: string, to: string, connector = "-->") => `${from} ${connector} ${to}`;

export function graphNode(id: string) { return byId[id]; }
export function graphSummary(id: string) { return summaries[id]; }
export function graphText(text: Text, language: GraphLanguage) { return label(text, language); }
export function buildGraphSource(language: GraphLanguage) {
  const lines = ["flowchart TB", `START(("${label(["开始", "Start", "開始"], language)}")) --> ${declaration(order[0], language)}`,
    `subgraph NORMALIZATION["${label(["01 · 实体归一化与交叉核查", "01 · Entity normalization and cross-check", "01 · エンティティ同定と横断検証"], language)}"]`, "direction TB"];
  for (let i = 1; i < order.length; i++) lines.push(edge(order[i - 1], declaration(order[i], language)));
  for (const [from, to, text] of auxiliary.slice(0, 9)) lines.push(`${from} -. "${label(text, language)}" .-> ${declaration(to, language)}`);
  lines.push("end", `subgraph MEMBERSHIP["${label(["02 · 履历治理", "02 · Affiliation governance", "02 · 所属履歴の管理"], language)}"]`, "direction TB", declaration("govern_membership", language));
  for (const id of ["member_source", "member_window", "member_conflict", "member_result"]) lines.push(declaration(id, language));
  lines.push("govern_membership -.-> member_source", "member_source -.-> member_window", "member_window -.-> member_conflict", "member_conflict -.-> member_result", "llm_membership -.-> member_result");
  for (const [from, to, text] of auxiliary.slice(9)) lines.push(`${from} -. "${label(text, language)}" .-> ${declaration(to, language)}`);
  lines.push("end", `subgraph FACTS["${label(["03 · 个人事实治理", "03 · Person fact governance", "03 · 人物情報の管理"], language)}"]`, "direction TB", declaration("verify_person_facts", language));
  for (const id of ["fact_hometown", "fact_pb", "fact_result"]) lines.push(declaration(id, language));
  lines.push("verify_person_facts -.-> fact_hometown", "fact_hometown -.-> fact_pb", "fact_pb -.-> fact_result", "end");
  lines.push(`finalize_normalization -. "${label(["有履历或关联组织", "Affiliation input", "所属情報あり"], language)}" .-> govern_membership`,
    `finalize_normalization -. "${label(["仅有籍贯或 PB", "Facts only", "人物情報のみ"], language)}" .-> verify_person_facts`,
    `finalize_normalization -. "${label(["无需下游治理", "No downstream work", "後続処理なし"], language)}" .-> ${declaration("aggregate_governance_result", language)}`,
    `govern_membership -. "${label(["还有籍贯或 PB", "Facts remain", "人物情報もあり"], language)}" .-> verify_person_facts`,
    "govern_membership -.-> aggregate_governance_result", "verify_person_facts --> aggregate_governance_result",
    `aggregate_governance_result --> END(("${label(["结束", "End", "終了"], language)}"))`);
  const classes: Record<Kind, string> = { graph: "fill:#e5f1f5,stroke:#5790a5,color:#244f60", rule: "fill:#f7ecda,stroke:#bb8b46,color:#644920", child: "fill:#eee5ee,stroke:#967096,color:#63485f", internal: "fill:#fff8ed,stroke:#bd914b,color:#6d512b,stroke-dasharray:4 3", llm: "fill:#e5eef8,stroke:#427eae,color:#214b70,stroke-dasharray:4 3", web: "fill:#fff0e6,stroke:#cf8152,color:#7d472d,stroke-dasharray:4 3", result: "fill:#e7f0e3,stroke:#5b835e,color:#36523a" };
  for (const [kind, style] of Object.entries(classes)) lines.push(`classDef ${kind === "graph" ? "graphNode" : kind} ${style},stroke-width:1.5px;`);
  for (const node of nodes) lines.push(`class ${node.id} ${node.kind === "graph" ? "graphNode" : node.kind};`);
  lines.push("style NORMALIZATION fill:#f8faf9,stroke:#d4e1dc,color:#3f6055", "style MEMBERSHIP fill:#fbf8fb,stroke:#e2d5e1,color:#6f5670", "style FACTS fill:#fafaf6,stroke:#e0dfcf,color:#6c6b42");
  return lines.join("\n");
}
