// 公开图例是 Agent 当前已部署流程的三语快照；修改 Agent 编排或规则后须再次确认是否同步。
export type GraphLanguage = "zh" | "en" | "ja";
type Text = readonly [string, string, string];
type Kind = "graph" | "child" | "internal" | "llm" | "web" | "result";
type Node = { id: string; label: Text; kind: Kind; checks?: readonly Text[]; trigger?: Text; outcomes?: readonly Text[] };

const nodes: Node[] = [
  { id: "load_batch_context", label: ["加载批次上下文", "Load batch context", "バッチの文脈を読み込む"], kind: "graph" },
  { id: "organization_rules", label: ["组织规则投影", "Organization rules", "組織ルールの適用"], kind: "graph", checks: [
    ["先复用来源映射与同批映射。", "Reuse source and same-batch mappings first.", "まず出典と同一バッチの対応付けを再利用する。"],
    ["名称规范化、类型兼容且只有一个候选时直接匹配。", "Match a sole candidate with normalized name and compatible type.", "正規化した名称と種別が一致する候補が一つなら対応付ける。"],
    ["无确定归属时保留独立来源组织。", "Keep a separate source organization when identity is uncertain.", "同一性が不明なら出典側の組織を独立して保持する。"],
    ["别名也参与候选召回；多个存量候选只提示独立维护，不在主图自动合并。", "Aliases also recall candidates; multiple stored candidates are flagged for separate maintenance, not merged here.", "別名も候補検索に使う。既存候補が複数あれば別途保守の対象とし、この Graph では自動統合しない。"],
  ] },
  { id: "organization_light_batch", label: ["组织轻量研究", "Organization triage", "組織の一次調査"], kind: "graph" },
  { id: "person_rules", label: ["人物身份规则投影", "Person identity rules", "人物同定ルールの適用"], kind: "graph", checks: [
    ["检查来源映射、历史成绩、所属与生日。", "Check source mappings, historical results, affiliations and birth dates.", "出典の対応付け、過去の記録、所属、生年月日を確認する。"],
    ["明确的生日或所属时间冲突阻止直接匹配。", "Explicit birth-date or affiliation-time conflicts block a direct match.", "生年月日や所属期間の明確な矛盾があれば直接照合しない。"],
    ["同名或同所属不足以确认同一人物；DNS 不是出场证明。", "Same name or affiliation alone is insufficient; DNS is not proof of participation.", "同名・同所属だけでは同一人物とせず、DNS は出場の証明としない。"],
  ] },
  { id: "person_light_batch", label: ["人物轻量研究", "Person triage", "人物の一次調査"], kind: "graph" },
  { id: "prepare_cross_check", label: ["准备交叉核查", "Prepare cross-check", "横断検証の準備"], kind: "graph" },
  { id: "normalization_cross_check", label: ["跨实体交叉核查", "Cross-entity check", "エンティティ横断検証"], kind: "graph" },
  { id: "validate_cross_check", label: ["校验核查结果", "Validate check results", "検証結果の確認"], kind: "graph", checks: [
    ["问题不得重复，人物行必须属于该来源组织。", "Issue keys must be unique and person rows must belong to the source organization.", "問題キーは重複不可。人物行は対象の出典組織に属する必要がある。"],
    ["证据引用必须在允许范围内，且与该问题相关。", "Evidence references must be allowed and relevant to the issue.", "証拠参照は許可された範囲内で、当該問題と関連している必要がある。"],
    ["相关证据不足则标记未解决，并撤销受影响人物的暂定判断。", "Insufficient relevant evidence leaves the issue unresolved and invalidates affected provisional decisions.", "関連証拠が不足すれば未解決とし、影響を受ける人物の暫定判断を取り消す。"],
  ] },
  { id: "organization_adjudication", label: ["组织裁决", "Organization adjudication", "組織の裁定"], kind: "graph" },
  { id: "organization_network_research", label: ["组织网络研究", "Organization web research", "組織のウェブ調査"], kind: "graph" },
  { id: "affected_person_reassessment", label: ["受影响人物重评", "Reassess affected people", "影響を受けた人物の再評価"], kind: "graph" },
  { id: "normalization_deep_research", label: ["人物深度研究", "Deep person research", "人物の詳細調査"], kind: "graph" },
  { id: "finalize_normalization", label: ["完成实体归一化", "Finalize normalization", "同定処理の確定"], kind: "graph" },
  { id: "govern_membership", label: ["履历治理子 Graph", "Affiliation governance child Graph", "所属履歴管理のサブ Graph"], kind: "child" },
  { id: "prepare_membership_context", label: ["准备履历上下文", "Prepare affiliation context", "所属履歴の文脈を準備"], kind: "graph", checks: [
    ["把既有履历中的人物、组织 ID 投影到规范 ID；人物拆分也同步处理。", "Project stored person and organization IDs to canonical IDs, including person splits.", "既存履歴の人物・組織 ID を正規 ID に写像し、人物の分割も反映する。"],
    ["只将身份已确定的来源人物列为受影响对象；阶段状态可用于恢复。", "Include only resolved source identities as affected people; stage state can be resumed.", "人物同定が確定した出典行だけを対象とし、段階状態は再開に利用できる。"],
  ] },
  { id: "membership_rules", label: ["履历规则处理", "Apply affiliation rules", "所属履歴ルールの適用"], kind: "graph" },
  { id: "collect_membership_conflicts", label: ["按人汇总履历冲突", "Group affiliation conflicts by person", "人物ごとに所属履歴の矛盾を集約"], kind: "graph", checks: [
    ["只收集实质 membership_conflict，按规范人物 ID 合并同人的所有问题。", "Collect substantive membership_conflict findings and group all issues by canonical person ID.", "実質的な membership_conflict だけを集め、同一人物の全問題を正規人物 ID ごとにまとめる。"],
    ["没有冲突组时跳过 LLM 与校验阶段，直接结束履历治理。", "With no conflict groups, skip LLM and validation and finalize directly.", "矛盾グループがなければ LLM と検証を飛ばし、所属履歴処理を確定する。"],
  ] },
  { id: "membership_deep_research", label: ["按人深度研究", "Research conflicts by person", "人物ごとの詳細調査"], kind: "graph" },
  { id: "validate_membership_decisions", label: ["校验履历裁决", "Validate affiliation decisions", "所属履歴の裁定を検証"], kind: "graph", checks: [
    ["维持原状或修正都要有经核验的 URL、引文和理由；不得越出允许的履历 ID。", "Both keep and correct require verified URL, quote and reason; record IDs must stay in scope.", "現状維持も修正も確認済みの URL・引用・理由が必要で、許可された履歴 ID の範囲を超えてはならない。"],
    ["年份与具体日期分别校验；清除错误日期必须显式标记，空值本身不表示清除。", "Validate years separately from exact dates; clearing a wrong date requires an explicit flag, not a null value.", "年と具体的な日付を別々に検証する。誤った日付の削除には明示フラグが必要で、null だけでは削除しない。"],
    ["整组修正必须原子通过，时间有效且不能留下明确互斥重叠。", "Accept the whole correction atomically only with valid windows and no remaining definite exclusive overlap.", "修正全体を原子的に受理し、期間が有効で明確な排他的重複が残らないことを確認する。"],
  ] },
  { id: "finalize_membership", label: ["完成履历治理", "Finalize affiliation governance", "所属履歴処理の確定"], kind: "graph", checks: [
    ["输出拟议新增、更新和严格重复履历删除，保留来源与审计依据。", "Produce proposed creates, updates and strictly duplicate deletions while retaining sources and audit evidence.", "新規・更新・厳密な重複削除の案を作り、出典と監査証拠を保持する。"],
    ["不直接写业务数据库；未通过校验的问题仍保持未解决。", "Do not write business data directly; failed decisions remain unresolved.", "業務データベースに直接書き込まず、検証を通らない問題は未解決のままにする。"],
  ] },
  { id: "member_dedup", label: ["规则 · 严格重复履历去重", "Rule · strict duplicate cleanup", "ルール · 厳密な重複履歴の整理"], kind: "internal", checks: [
    ["检查受影响人物的全部规范 ID 履历，而不只看本批次代表队。", "Check every canonical affiliation of affected people, not only this batch's team.", "対象人物の正規 ID に紐づく全履歴を確認し、このバッチの代表チームだけに限定しない。"],
    ["组织、关系、角色、学部、学科、届别、时间、依据、结束状态和互斥组都一致才删重。", "Deduplicate only when organization, relation, role, faculty, department, cohort, time, basis, end state and exclusivity group all agree.", "組織・関係・役割・学部・学科・期・期間・根拠・終了状態・排他グループがすべて一致する場合だけ重複を削除する。"],
    ["保留记录吸收重复记录的来源；不同履历段不折叠。", "Keep the duplicate's evidence on the retained record; do not collapse distinct periods.", "削除対象の出典を保持する記録に集約し、異なる履歴期間は統合しない。"],
  ] },
  { id: "member_source", label: ["规则 · 来源履历 / 隐含所属", "Rule · source / implicit affiliation", "ルール · 出典履歴／暗黙の所属"], kind: "internal", checks: [
    ["整合来源明确的履历和参赛行的组织线索。", "Combine explicit history with organization hints from source rows.", "出典に明記された履歴と参加行の組織情報を統合する。"],
    ["只有中学、高中、大学和企业队可由参赛组织推导所属。", "Only junior high, high school, university and corporate teams can imply affiliation.", "出場組織から所属を推定できるのは中学・高校・大学・実業団のみ。"],
    ["赛事日只证明当时代表关系，含 DNS/DNF；不能当入离队日或持续所属证明。", "Race date is an affiliation observation, including DNS/DNF; it is not a joining, leaving or ongoing-affiliation date.", "大会日は DNS/DNF を含む当時の代表関係の観測にすぎず、加入日・離脱日・継続所属の証拠にはしない。"],
    ["身份或组织未确定时不写入履历。", "Do not create affiliation changes with unresolved person or organization identity.", "人物または組織の同定が未確定なら所属履歴を作らない。"],
  ] },
  { id: "member_window", label: ["规则 · 学制与相邻阶段补空", "Rule · academic and adjacent windows", "ルール · 学年と隣接期から期間補完"], kind: "internal", checks: [
    ["按组织类型、学年、赛事日期推算时间窗口。", "Infer a window from organization type, grade and race date.", "組織種別・学年・大会日から期間を推定する。"],
    ["可用相邻学校阶段补空；推算值不覆盖来源日期。", "Adjacent school stages may fill gaps; inferred dates never overwrite sourced dates.", "隣接する学校段階で空欄を補うが、推定日付は出典の日付を上書きしない。"],
    ["只知道年份就保留年份和空具体日期，不造 1 月或 4 月的入离队日。", "Year-only evidence keeps the year with no exact date; it does not invent a January or April joining date.", "年だけ分かる場合は年のみ記録し、1 月や 4 月の加入・離脱日を作らない。"],
  ] },
  { id: "member_conflict", label: ["规则 · 日期 / 年份 / 互斥冲突", "Rule · dates / years / exclusions", "ルール · 日付／年／排他の矛盾"], kind: "internal", checks: [
    ["同一组织的不同履历段不自动折叠；新旧来源日期或年份不一致时标记冲突。", "Keep distinct periods for one organization; flag conflicting sourced dates or years.", "同一組織の異なる履歴期間は統合せず、出典の日付や年が矛盾すれば問題とする。"],
    ["起止顺序无效，或同学段不同学校及明确互斥关系出现确定时间重叠时标记冲突。", "Flag invalid start/end order or definite overlap between different schools in one stage or explicitly exclusive affiliations.", "開始・終了の順序が無効、または同じ学段の異なる学校や明示的に排他的な所属で確定期間が重なる場合は問題とする。"],
    ["大学到实业团并非天然互斥；同队更名也不自动等于转会。", "University-to-corporate transition is not inherently exclusive; a team rename is not automatically a transfer.", "大学から実業団への移行は本来排他的ではなく、チームの改称を自動的に移籍とみなさない。"],
  ] },
  { id: "member_result", label: ["拟议履历变更 / 未解决事项", "Proposed affiliation changes / unresolved", "所属変更案／未解決事項"], kind: "result" },
  { id: "verify_person_facts", label: ["个人事实治理子 Graph", "Person facts child Graph", "人物情報管理のサブ Graph"], kind: "child" },
  { id: "compare_person_facts", label: ["比较个人事实与 PB", "Compare person facts and PBs", "人物情報と PB を比較"], kind: "graph", checks: [
    ["仅比较输入明确提供且身份已映射的事实。", "Compare only explicitly supplied facts for mapped identities.", "対応付け済みの人物について、明示された事実のみを比較する。"],
    ["籍贯与登录陆协分开判断；不覆盖不同的既有值，可靠度不足时记录 unresolved。", "Evaluate hometown and registered association separately; do not overwrite different existing values, and record unresolved when source reliability is insufficient.", "出身地と登録協会を別々に判定する。異なる既存値は上書きせず、出典の信頼度が不足する場合は unresolved とする。"],
  ] },
  { id: "fact_hometown", label: ["规则 · 可靠来源补空籍贯", "Rule · fill missing hometown", "ルール · 信頼できる出典で出身地を補完"], kind: "internal", checks: [
    ["跳过 DNS 和身份未解决的行。", "Skip DNS and unresolved identities.", "DNS と人物同定が未解決の行を除外する。"],
    ["只有原值为空且来源可靠度至少为 3 才补空。", "Fill only an empty value from a source with reliability at least 3.", "既存値が空で、出典の信頼度が 3 以上の場合だけ補完する。"],
    ["已有不同出身地不自动覆盖，记录为 unresolved 冲突；可靠度不足的候选记录为 unresolved。", "Do not overwrite a different existing hometown; report it as unresolved. Report candidates from low-reliability sources as unresolved too.", "異なる既存の出身地は自動上書きせず unresolved とする。信頼度が低い出典の候補も unresolved として記録する。"],
  ] },
  { id: "fact_registration", label: ["规则 · 独立补空登录陆协", "Rule · fill registered association", "ルール · 登録協会を独立して補完"], kind: "internal", checks: [
    ["登录陆协不是籍贯，不从籍贯或代表队推断。", "Registered association is not hometown and is not inferred from hometown or team.", "登録協会は出身地とは別で、出身地やチームから推定しない。"],
    ["仅原值为空且来源可靠度至少为 3 时补空。", "Fill only an empty value from a source with reliability at least 3.", "既存値が空で、出典の信頼度が 3 以上の場合だけ補完する。"],
    ["已有不同登录陆协不自动覆盖，记录为 unresolved 冲突；可靠度不足的候选记录为 unresolved。", "Do not overwrite a different existing association; report it as unresolved. Report candidates from low-reliability sources as unresolved too.", "異なる既存の登録協会は自動上書きせず unresolved とする。信頼度が低い出典の候補も unresolved として記録する。"],
  ] },
  { id: "fact_pb", label: ["规则 · PB 项目 / 成绩 / 来源比较", "Rule · PB event / mark / source", "ルール · PB 種目／記録／出典の比較"], kind: "internal", checks: [
    ["跳过 DNS、未确定身份和不支持的项目。", "Skip DNS, unresolved identities and unsupported events.", "DNS、人物同定が未解決の行、対象外種目を除外する。"],
    ["成绩可解析且来源可靠度至少为 3。", "Require a valid mark and source reliability of at least 3.", "解析可能な記録と 3 以上の出典信頼度を要する。"],
    ["原值为空时可新增；已有 PB 仅在新成绩更好且来源可靠度不低于原来源时更新。", "Create a missing PB; update an existing PB only when the mark is faster and the source is at least as reliable.", "未登録なら追加し、既存 PB は記録がより良く出典の信頼度が同等以上の場合のみ更新する。"],
    ["来源缺失、成绩无法解析、现有成绩不可比较或更好成绩的来源可靠度较低时记录 unresolved；更慢或相同成绩只是正常跳过。", "Report unresolved when the source is missing, the mark cannot be parsed or compared, or a faster mark has a less reliable source. Slower or equal marks are routine skips.", "出典がない、記録を解析・比較できない、またはより良い記録の出典信頼度が低い場合は unresolved とする。遅い記録や同記録は通常のスキップとする。"],
  ] },
  { id: "collect_person_fact_conflicts", label: ["汇总个人事实冲突", "Collect person-fact conflicts", "人物情報の矛盾を集約"], kind: "graph", checks: [
    ["收集个人事实冲突与证据不足项；不调用 LLM，未解决问题会进入最终治理计划。", "Collect person-fact conflicts and insufficient-evidence findings; no LLM is called, and unresolved findings flow into the final governance plan.", "人物情報の矛盾と証拠不足を集約する。LLM は呼び出さず、未解決項目は最終計画へ引き継ぐ。"],
  ] },
  { id: "validate_person_fact_decisions", label: ["校验个人事实决定", "Validate person-fact decisions", "人物情報の判断を検証"], kind: "graph", checks: [
    ["有效变更继续进入计划；不能安全裁决的事实以 unresolved 呈现，不静默丢弃。", "Keep valid changes in the plan; surface facts that cannot be safely decided as unresolved instead of silently dropping them.", "有効な変更は計画に残し、安全に判断できない事実は黙って捨てず unresolved として表示する。"],
  ] },
  { id: "fact_result", label: ["拟议个人事实变更", "Proposed fact changes", "人物情報の変更案"], kind: "result" },
  { id: "aggregate_governance_result", label: ["汇总治理计划", "Assemble governance plan", "ガバナンス計画の集約"], kind: "result" },
  { id: "business_writer", label: ["业务 Writer · 计划后写入", "Business Writer · persist after planning", "業務 Writer · 計画後に保存"], kind: "result", checks: [
    ["dry_run 仅保存计划；apply 在版本校验后通过事务写入。", "dry_run stores the plan only; apply writes in a transaction after version checks.", "dry_run は計画のみを保存し、apply はバージョン確認後にトランザクションで書き込む。"],
  ] },
  { id: "llm_org", label: ["LLM · 组织批量判断", "LLM · organization batch", "LLM · 組織の一括判定"], kind: "llm", trigger: ["有未确定组织候选；不联网。", "Unresolved organization candidates; no web search.", "未確定の組織候補がある場合。ウェブ検索なし。"], checks: [
    ["判断普通简称或名称变体，不用人物结论反证组织。", "Assess common abbreviations and variants without using provisional person matches.", "略称・表記ゆれを判断し、暫定的な人物同定を組織の証拠にしない。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別組織・未解決。"]] },
  { id: "llm_person", label: ["LLM · 人物批量判断", "LLM · person batch", "LLM · 人物の一括判定"], kind: "llm", trigger: ["有人物候选；不联网。", "Person candidates exist; no web search.", "人物候補がある場合。ウェブ検索なし。"], checks: [
    ["逐个评价姓名关系和同人可能性，结合生日、所属时间与独立证据。", "Assess each name relation and identity likelihood using birth date, affiliation time and independent evidence.", "候補ごとに氏名関係と同一人物の可能性を、生年月日・所属期間・独立証拠から評価する。"],
    ["同名、同读音、同所属都不足以单独确认；生日冲突不可匹配。", "Name, reading or affiliation alone is insufficient; conflicting birth dates cannot match.", "同名・同音・同所属だけでは確定せず、生年月日が矛盾すれば一致としない。"],
    ["同名同读音、同校且学年时间线相容的独立记录可综合支持同人，无需强制生日或注册号；核查实际矛盾与竞争候选。", "Independent records with matching name, reading and school and a compatible academic timeline can jointly support a match without a required birth date or registration number; check actual conflicts and competing candidates.", "同名・同じ読み・同じ学校で学年と時系列が整合する独立記録を総合して同一人物と判断でき、生年月日や登録番号は必須ではない。実際の矛盾と競合候補を確認する。"],
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
    ["充分利用既有别名；旧称、更名或新体制须查官方沿革和继承关系。", "Use existing aliases; verify former names, renames and successor teams against official history.", "既存の別名を活用し、旧称・改称・新体制は公式の沿革と継承関係で確認する。"],
    ["仅同集团、名称近似或共同选手不足以认定同队；不在主图合并存量组织。", "Shared group, similar name or common athletes do not establish team identity; stored organizations are not merged here.", "同じ企業グループ・似た名称・共通選手だけでは同一チームとせず、既存組織もこの Graph では統合しない。"],
    ["不凭人物暂定结论证明组织，也不推断 Membership。", "Do not use provisional person matches or infer membership.", "暫定的な人物同定を組織の証拠にせず、所属履歴も推定しない。"],
  ], outcomes: [["匹配既有候选、可区分或未解决。", "Match an existing candidate, distinct or unresolved.", "既存候補と一致・別組織・未解決。"]] },
  { id: "web_org", label: ["Web Search", "Web Search", "Web Search"], kind: "web" },
  { id: "llm_reassess", label: ["LLM · 人物批量重评", "LLM · person reassessment", "LLM · 人物の一括再評価"], kind: "llm", trigger: ["组织判断影响人物；不联网。", "Organization decision affects people; no web search.", "組織の判断が人物に影響した場合。ウェブ検索なし。"], checks: [
    ["只重评受影响者；仍不能仅凭同名同所属确认。", "Reassess affected people only; name and affiliation alone remain insufficient.", "影響を受けた人物のみ再評価し、同名・同所属だけで確定しない。"],
    ["结合独立赛事记录与相容的学年时间线判断，并核查实际矛盾和竞争候选。", "Combine independent race records with a compatible academic timeline, checking actual conflicts and competing candidates.", "独立した大会記録と整合する学年・時系列を総合し、実際の矛盾と競合候補を確認する。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別人・未解決。"]] },
  { id: "llm_deep", label: ["LLM · 单人物深研", "LLM · deep person research", "LLM · 個別人物の詳細調査"], kind: "llm", trigger: ["疑难身份未解决且符合深研门槛；允许 Web Search。", "Unresolved identity meets the deep-research gate; web search is available.", "未解決の同定問題が詳細調査の条件を満たす場合。ウェブ検索を利用可能。"], checks: [
    ["核查生日冲突、交叉问题、同音异字或疑似误录。", "Investigate birth-date conflicts, cross-check issues, variant characters or suspected transcription errors.", "生年月日の矛盾、横断検証の問題、同音異字や入力誤りの疑いを調べる。"],
    ["轻量判断只是待验证假设，不是独立证据。", "Triage is a hypothesis, not independent evidence.", "一次判断は仮説であり、独立した証拠ではない。"],
    ["综合独立记录与相容的学年时间线；生日或注册号并非必备，须核查实际矛盾和竞争候选。", "Consider independent records and compatible academic timelines together; birth dates and registration numbers are not mandatory, but actual conflicts and competing candidates must be checked.", "独立記録と整合する学年・時系列を総合する。生年月日や登録番号は必須ではないが、実際の矛盾と競合候補を確認する。"],
    ["合并须明确保留及待合并档案，校验允许的 ID 和各档案间的同赛事成绩冲突；无效输出有限重试。", "A merge must identify the retained and duplicate profiles; validate allowed IDs and same-race conflicts across profiles, with bounded retries for invalid output.", "統合では保持する人物と重複人物を明示し、許可された ID と各人物間の同一大会の記録衝突を検証する。不正な出力は有限回再試行する。"],
  ], outcomes: [["匹配、可区分或未解决。", "Match, distinct or unresolved.", "一致・別人・未解決。"]] },
  { id: "web_person", label: ["Web Search", "Web Search", "Web Search"], kind: "web" },
  { id: "llm_membership", label: ["LLM · 按人履历冲突研究", "LLM · per-person affiliation research", "LLM · 人物単位の所属履歴調査"], kind: "llm", trigger: ["同一人物存在一个或多个实质履历冲突；每人一次研究，可使用 Web Search。", "A person has one or more substantive affiliation conflicts; one research request per person, with Web Search available.", "一人に一つ以上の実質的な所属履歴の矛盾がある場合、人物単位で一回調査し、Web Search を利用できる。"], checks: [
    ["完整审视该人的履历、冲突和历史证据；赛事日不是入离队日或持续所属证明。", "Review the person's full history, conflicts and historical evidence; race date is not a joining, leaving or ongoing-affiliation date.", "人物の全履歴・矛盾・過去の証拠を確認し、大会日を加入日・離脱日・継続所属の証拠にしない。"],
    ["可有证据地维持原状结案；仅有年份则保留空具体日期，不拿公告日补入离队日。", "With evidence, keeping current records may resolve the issue; year-only evidence keeps exact dates blank, and announcement dates are not substituted.", "証拠があれば現状維持で解決できる。年のみ分かる場合は具体日を空にし、発表日を加入・離脱日へ転用しない。"],
    ["更正只修改有证据的字段；删除错误具体日期要显式 clear 标记。", "Correct only evidenced fields; clearing an incorrect exact date requires an explicit clear flag.", "証拠のある項目だけを修正し、誤った具体日を消すには明示的な clear フラグを要する。"],
  ], outcomes: [["keep_membership、correct_membership 或 unresolved；结果还要经过独立校验。", "keep_membership, correct_membership or unresolved; a separate validation stage follows.", "keep_membership・correct_membership・unresolved のいずれかを返し、別段階で検証する。"]] },
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
  govern_membership: ["编译子 Graph 包含六个真实节点；图中展开规则、条件分支和按人研究。", "This compiled child Graph has six real nodes, with rules, conditional routing and per-person research expanded here.", "このコンパイル済みサブ Graph は六つの実ノードで構成され、ルール・条件分岐・人物単位の調査を展開している。"],
  membership_rules: ["严格去重后整合来源履历、确认组织的参赛观察、学校时间窗口与冲突规则。", "After strict deduplication, combine source history, confirmed team observations, school windows and conflict rules.", "厳密に重複整理した後、出典履歴・確認済み組織の大会観測・学校期間・矛盾ルールを統合する。"],
  membership_deep_research: ["每个冲突人物发起一次完整履历研究，模型可按需联网。", "Make one full-history research request for each person with conflicts; the model may search as needed.", "矛盾のある人物ごとに全履歴を一回調査し、必要に応じてウェブ検索できる。"],
  member_result: ["生成拟议履历新增、更新、严格重复删除和未解决事项，不直接写入业务数据库。", "Produce proposed affiliation creates, updates, strict duplicate deletions and unresolved issues without writing business data.", "所属履歴の新規・更新・厳密な重複削除案と未解決事項を作り、業務データベースへ直接書き込まない。"],
  verify_person_facts: ["个人事实子 Graph 由比较、冲突汇总、决定校验三个节点组成；规则无法安全更新的候选会以 unresolved 呈现，不调用 LLM。", "The person-facts child Graph compares facts, collects conflicts and validates decisions. Candidates that cannot be safely applied appear as unresolved; no LLM is called.", "人物情報サブ Graph は比較・矛盾集約・判断検証の三ノードで構成され、安全に反映できない候補は unresolved として表示します。LLM は呼び出しません。"],
  fact_result: ["生成拟议个人事实变更，不直接写入业务数据库。", "Produce proposed person-fact changes without writing business data directly.", "人物情報の変更案を作成し、業務データベースへ直接書き込まない。"],
  aggregate_governance_result: ["在每个批次内合并归一化、履历与个人事实结果，生成治理计划。", "Combine normalization, affiliation and person-fact results into a per-batch governance plan.", "バッチごとに同定・所属履歴・人物情報の結果をまとめ、ガバナンス計画を作成する。"],
  business_writer: ["Runner 在计划保存后调用 Writer；只有 apply 会在版本校验后事务写入业务数据。", "The runner calls the Writer after saving the plan; only apply writes business data in a transaction after version checks.", "Runner は計画保存後に Writer を呼び出す。業務データへのトランザクション書き込みは、バージョン確認後の apply のみ。"],
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
  ["membership_deep_research", "llm_membership", ["按人研究", "Per-person research", "人物単位の調査"]],
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
  const membershipOrder = ["prepare_membership_context", "membership_rules", "collect_membership_conflicts", "membership_deep_research", "validate_membership_decisions", "finalize_membership"];
  for (const id of membershipOrder) lines.push(declaration(id, language));
  for (const id of ["member_dedup", "member_source", "member_window", "member_conflict", "member_result"]) lines.push(declaration(id, language));
  lines.push("govern_membership --> prepare_membership_context", "prepare_membership_context --> membership_rules", "membership_rules --> collect_membership_conflicts",
    `collect_membership_conflicts -. "${label(["有实质冲突", "Conflicts found", "実質的な矛盾あり"], language)}" .-> membership_deep_research`,
    `collect_membership_conflicts -. "${label(["无冲突", "No conflicts", "矛盾なし"], language)}" .-> finalize_membership`,
    "membership_deep_research --> validate_membership_decisions", "validate_membership_decisions --> finalize_membership",
    "membership_rules -.-> member_dedup", "member_dedup -.-> member_source", "member_source -.-> member_window", "member_window -.-> member_conflict", "finalize_membership -.-> member_result");
  for (const [from, to, text] of auxiliary.slice(9)) lines.push(`${from} -. "${label(text, language)}" .-> ${declaration(to, language)}`);
  lines.push("end", `subgraph FACTS["${label(["03 · 个人事实治理", "03 · Person fact governance", "03 · 人物情報の管理"], language)}"]`, "direction TB", declaration("verify_person_facts", language));
  for (const id of ["compare_person_facts", "fact_hometown", "fact_registration", "fact_pb", "collect_person_fact_conflicts", "validate_person_fact_decisions", "fact_result"]) lines.push(declaration(id, language));
  lines.push("verify_person_facts --> compare_person_facts", "compare_person_facts -.-> fact_hometown", "compare_person_facts -.-> fact_registration", "compare_person_facts -.-> fact_pb", "compare_person_facts --> collect_person_fact_conflicts", "collect_person_fact_conflicts --> validate_person_fact_decisions", "validate_person_fact_decisions --> fact_result", "end");
  lines.push(`finalize_normalization -. "${label(["有履历或关联组织", "Affiliation input", "所属情報あり"], language)}" .-> govern_membership`,
    `finalize_normalization -. "${label(["仅有籍贯或 PB", "Facts only", "人物情報のみ"], language)}" .-> verify_person_facts`,
    `finalize_normalization -. "${label(["无需下游治理", "No downstream work", "後続処理なし"], language)}" .-> ${declaration("aggregate_governance_result", language)}`,
    `finalize_membership -. "${label(["还有籍贯或 PB", "Facts remain", "人物情報もあり"], language)}" .-> verify_person_facts`,
    `finalize_membership -. "${label(["无需个人事实核查", "No fact check", "人物情報の確認なし"], language)}" .-> aggregate_governance_result`, "verify_person_facts --> aggregate_governance_result",
    "aggregate_governance_result --> business_writer", `business_writer --> END(("${label(["结束", "End", "終了"], language)}"))`);
  const classes: Record<Kind, string> = { graph: "fill:#e5f1f5,stroke:#5790a5,color:#244f60", child: "fill:#eee5ee,stroke:#967096,color:#63485f", internal: "fill:#fff8ed,stroke:#bd914b,color:#6d512b,stroke-dasharray:4 3", llm: "fill:#e5eef8,stroke:#427eae,color:#214b70,stroke-dasharray:4 3", web: "fill:#fff0e6,stroke:#cf8152,color:#7d472d,stroke-dasharray:4 3", result: "fill:#e7f0e3,stroke:#5b835e,color:#36523a" };
  for (const [kind, style] of Object.entries(classes)) lines.push(`classDef ${kind === "graph" ? "graphNode" : kind} ${style},stroke-width:1.5px;`);
  for (const node of nodes) lines.push(`class ${node.id} ${node.kind === "graph" ? "graphNode" : node.kind};`);
  lines.push("style NORMALIZATION fill:#f8faf9,stroke:#d4e1dc,color:#3f6055", "style MEMBERSHIP fill:#fbf8fb,stroke:#e2d5e1,color:#6f5670", "style FACTS fill:#fafaf6,stroke:#e0dfcf,color:#6c6b42");
  return lines.join("\n");
}
