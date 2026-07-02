import type { Locale } from "@/lib/i18n";

type StaticPageLabels = {
  support: string;
};

type SupportSection = {
  title: string;
  body: string[];
};

type SupportPageCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  projectEyebrow: string;
  projectTitle: string;
  projectIntro: string;
  projectSections: SupportSection[];
  supportEyebrow: string;
  supportTitle: string;
  supportIntro: string;
  primaryCta: string;
  pendingLabel: string;
  note: string;
  supportSections: SupportSection[];
  footerPending: string;
};

type StaticPageCopy = {
  labels: StaticPageLabels;
  support: SupportPageCopy;
};

const jaCopy: StaticPageCopy = {
  labels: {
    support: "応援する",
  },
  support: {
    eyebrow: "Support",
    title: "このプロジェクトを応援する",
    intro:
      "襷の系譜の継続運営、データ整備、検索体験の改善のため、小額のご支援を受け付けています。",
    projectEyebrow: "Project",
    projectTitle: "襷の系譜について",
    projectIntro:
      "襷の系譜は、高校・大学・実業団をまたいで駅伝選手のつながりをたどれるようにするためのデータベースです。",
    projectSections: [
      {
        title: "何を目指しているか",
        body: [
          "大会結果だけでなく、選手、所属、出身校、自己ベストを横断して見られる資料基盤をつくることを目指しています。",
          "単発の名鑑ではなく、箱根駅伝や全国高校駅伝を起点に、日本の長距離競技の流れを少しずつ追える形に育てていく方針です。",
        ],
      },
      {
        title: "現在の収録範囲",
        body: [
          "現時点では、主要な駅伝大会、学校・大学・実業団の組織情報、選手プロフィール、主要PB、レース結果を段階的に整理しています。",
          "掲載内容は継続的に見直しており、出典確認や記録補完の途中にあるデータも含まれます。",
        ],
      },
      {
        title: "運営方針",
        body: [
          "公開情報をもとに整理し、可能な範囲で出典と確認状態を明示します。",
          "このサイトは個人で運営しており、データ整備、実装改善、ページ改善を小さく継続する形で更新しています。",
        ],
      },
    ],
    supportEyebrow: "Support",
    supportTitle: "ご支援について",
    supportIntro:
      "まずは日本ユーザー向けの小額サポート導線を試験的に整備しています。内容や導線は今後調整する可能性があります。",
    primaryCta: "PayPalで応援する",
    pendingLabel: "PayPal 準備中",
    note:
      "会員特典や限定コンテンツの提供は現時点では予定しておらず、継続運営への任意支援という位置づけです。",
    supportSections: [
      {
        title: "ご支援の用途",
        body: [
          "大会データの追加整理、所属関係の確認、ページ改善、検索性の向上など、サイト運営に直接関わる作業に充てます。",
          "短期的には、主要大会ページの拡充と選手・組織ページの読みやすさ改善を優先しています。",
        ],
      },
      {
        title: "このページの位置づけ",
        body: [
          "この支援ページは、まず少額の任意サポートが成立するかを確認するための試験版です。",
          "支援導線だけでなく、運営者情報や更新方針も段階的に明確にしていく予定です。",
        ],
      },
    ],
    footerPending:
      "支援導線は今後更新する可能性があります。PayPal URL が未設定の場合は、現在は案内ページのみを先行公開しています。",
  },
};

const zhCopy: StaticPageCopy = {
  labels: {
    support: "支持本站",
  },
  support: {
    eyebrow: "Support",
    title: "支持这个项目",
    intro:
      "如果你愿意提供小额支持，这些资金会用于襷の系譜的持续运营、数据整理和搜索体验改进。",
    projectEyebrow: "Project",
    projectTitle: "关于襷の系譜",
    projectIntro:
      "襷の系譜是一个驿传数据库，目标是把高中、大学、实业团之间的选手脉络连接起来，让人物关系和比赛轨迹更容易查阅。",
    projectSections: [
      {
        title: "这个项目想做什么",
        body: [
          "它不只是收集单场比赛结果，而是希望把选手、所属、出身校、个人最佳和比赛记录放进同一套可浏览的资料体系里。",
          "项目会从箱根驿传、全国高中驿传等重要赛事出发，逐步整理日本长跑与驿传的人物谱系。",
        ],
      },
      {
        title: "当前收录范围",
        body: [
          "目前站点正逐步整理主要赛事届次、组织信息、选手资料、主要 PB 和比赛记录。",
          "部分数据仍处于补录和核对阶段，因此你会看到一些内容还在持续完善中。",
        ],
      },
      {
        title: "运营方式",
        body: [
          "站点以公开信息为基础进行整理，并尽量标注来源和确认状态。",
          "这是一个个人持续维护的项目，当前主要投入在数据整理、产品改进和页面体验优化上。",
        ],
      },
    ],
    supportEyebrow: "Support",
    supportTitle: "关于支持",
    supportIntro:
      "目前这是一条面向日本用户和海外用户的轻量支持入口，后续说明和支付方式仍可能继续调整。",
    primaryCta: "通过 PayPal 支持",
    pendingLabel: "PayPal 准备中",
    note:
      "目前没有会员权益或付费墙，支持性质仍以自愿赞赏为主，更偏向帮助项目继续维护和迭代。",
    supportSections: [
      {
        title: "支持会用在哪里",
        body: [
          "主要会投入到赛事数据补充、所属关系核对、页面优化和搜索体验改进等直接影响站点质量的工作上。",
          "短期内会优先用于扩充重点赛事页面，并提升选手页和组织页的可读性。",
        ],
      },
      {
        title: "这一页的定位",
        body: [
          "这是一版试运行的支持页面，主要用于先验证是否存在真实的小额赞赏需求。",
          "除了赞赏入口，本项目也会继续补充运营者信息与更新策略，让站点表达更完整。",
        ],
      },
    ],
    footerPending:
      "后续支持入口可能会继续更新。如果还没有配置 PayPal 链接，这一页当前会先作为说明页使用。",
  },
};

const zhHantCopy: StaticPageCopy = {
  labels: {
    support: "支持本站",
  },
  support: {
    eyebrow: "Support",
    title: "支持這個專案",
    intro:
      "若你願意提供小額支持，這些資金會用於襷の系譜的持續營運、資料整理與搜尋體驗改善。",
    projectEyebrow: "Project",
    projectTitle: "關於襷の系譜",
    projectIntro:
      "襷の系譜是一個驛傳資料站，目標是把高中、大學、實業團之間的選手脈絡串接起來，讓人物與比賽軌跡更容易查閱。",
    projectSections: [
      {
        title: "這個專案想做什麼",
        body: [
          "它不只是整理單場比賽結果，而是希望把選手、所屬、出身校、個人最佳與比賽紀錄放進同一套可瀏覽的資料體系中。",
          "專案會從箱根驛傳、全國高校驛傳等重要賽事出發，逐步整理日本長跑與驛傳的人物譜系。",
        ],
      },
      {
        title: "目前收錄範圍",
        body: [
          "目前站點正逐步整理主要賽事項次、組織資訊、選手資料、主要 PB 與比賽紀錄。",
          "部分資料仍在補錄與核對中，因此部分內容仍會持續更新。",
        ],
      },
      {
        title: "營運方式",
        body: [
          "站點以公開資訊為基礎整理，並盡量標示來源與確認狀態。",
          "這是一個由個人持續維護的專案，目前主要投入在資料整理、產品改善與頁面體驗優化上。",
        ],
      },
    ],
    supportEyebrow: "Support",
    supportTitle: "關於支持",
    supportIntro:
      "目前這是一條面向日本與海外使用者的輕量支持入口，後續說明與支付方式仍可能持續調整。",
    primaryCta: "透過 PayPal 支持",
    pendingLabel: "PayPal 準備中",
    note:
      "目前沒有會員權益或付費牆，支持性質仍以自願贊助為主，更偏向幫助專案持續維護與迭代。",
    supportSections: [
      {
        title: "支持會用在哪裡",
        body: [
          "主要會投入在賽事資料補充、所屬關係核對、頁面優化與搜尋體驗改善等直接影響站點品質的工作上。",
          "短期內會優先用於擴充重點賽事頁，並提升選手頁與組織頁的可讀性。",
        ],
      },
      {
        title: "這一頁的定位",
        body: [
          "這是一版試運行的支持頁，主要是先驗證是否存在真實的小額贊助需求。",
          "除了贊助入口，本專案也會持續補充營運者資訊與更新策略，讓站點表達更完整。",
        ],
      },
    ],
    footerPending:
      "後續支持入口可能會再調整。若尚未設定 PayPal 連結，這一頁目前會先作為說明頁使用。",
  },
};

const enCopy: StaticPageCopy = {
  labels: {
    support: "Support",
  },
  support: {
    eyebrow: "Support",
    title: "Support this project",
    intro:
      "Small voluntary contributions help keep Tasuki Keifu running and support continued data maintenance and product improvements.",
    projectEyebrow: "Project",
    projectTitle: "About Tasuki Keifu",
    projectIntro:
      "Tasuki Keifu is an ekiden database built to make athlete, school, and team connections easier to explore across different stages of Japanese distance running.",
    projectSections: [
      {
        title: "What the project is building",
        body: [
          "The goal is to provide a browsable archive that connects athletes, affiliations, schools, personal bests, and race results in one place.",
          "Rather than a one-off roster, the project is being shaped as a long-term reference site starting from major ekiden competitions.",
        ],
      },
      {
        title: "Current scope",
        body: [
          "The current archive is gradually organizing competition editions, organizations, athlete profiles, key PBs, and race records.",
          "Some entries are still being verified or expanded as the dataset grows.",
        ],
      },
      {
        title: "How it is operated",
        body: [
          "The site is operated individually and relies on publicly available sources wherever possible.",
          "Ongoing work focuses on data maintenance, source verification, and product improvements.",
        ],
      },
    ],
    supportEyebrow: "Support",
    supportTitle: "About support",
    supportIntro:
      "This is an early support page for testing a lightweight donation flow for international and Japan-based users.",
    primaryCta: "Support via PayPal",
    pendingLabel: "PayPal coming soon",
    note:
      "There are no membership benefits or gated content at this stage. Support is positioned as a simple way to help the project keep moving.",
    supportSections: [
      {
        title: "How support is used",
        body: [
          "Support goes toward data cleanup, new competition coverage, page improvements, and search experience updates.",
          "In the near term, the focus is on expanding major competition pages and improving readability for athlete and organization pages.",
        ],
      },
      {
        title: "What this page is for",
        body: [
          "This page is a first-pass support flow to validate whether voluntary support makes sense for the project.",
          "Project background, operator details, and support guidance will continue to be clarified over time.",
        ],
      },
    ],
    footerPending:
      "The support flow may change over time. If the PayPal URL is not configured yet, this page is currently serving as an information page only.",
  },
};

const koCopy: StaticPageCopy = {
  labels: {
    support: "프로젝트 응원",
  },
  support: {
    eyebrow: "Support",
    title: "이 프로젝트를 응원하기",
    intro:
      "작은 자발적 후원은 襷の系譜의 지속 운영, 데이터 정비, 검색 경험 개선에 도움이 됩니다.",
    projectEyebrow: "Project",
    projectTitle: "襷の系譜 소개",
    projectIntro:
      "襷の系譜는 고교, 대학, 실업팀을 넘나드는 에키덴 선수들의 연결 관계를 더 쉽게 찾아볼 수 있도록 만드는 데이터베이스입니다.",
    projectSections: [
      {
        title: "이 프로젝트가 만들고 싶은 것",
        body: [
          "단순한 경기 결과 목록이 아니라 선수, 소속, 출신 학교, PB, 레이스 기록을 하나의 탐색 가능한 자료 구조로 정리하는 것을 목표로 합니다.",
          "하코네 에키덴과 전국고교에키덴 같은 주요 대회를 출발점으로 삼아 일본 장거리의 흐름과 인물 계보를 차근차근 정리해 나가고 있습니다.",
        ],
      },
      {
        title: "현재 수록 범위",
        body: [
          "현재는 주요 대회 회차, 조직 정보, 선수 프로필, 주요 PB, 레이스 기록을 단계적으로 정리하고 있습니다.",
          "일부 데이터는 아직 보완 및 검증 중이어서 계속 업데이트되고 있습니다.",
        ],
      },
      {
        title: "운영 방식",
        body: [
          "사이트는 공개 정보를 기반으로 정리되며, 가능한 범위에서 출처와 확인 상태를 함께 표기합니다.",
          "이 프로젝트는 개인이 운영하고 있으며, 데이터 정비와 제품 개선, 페이지 경험 향상에 지속적으로 시간을 들이고 있습니다.",
        ],
      },
    ],
    supportEyebrow: "Support",
    supportTitle: "후원 안내",
    supportIntro:
      "현재 이 페이지는 일본 및 해외 사용자를 위한 가벼운 후원 동선을 시험적으로 정리한 버전입니다.",
    primaryCta: "PayPal로 응원하기",
    pendingLabel: "PayPal 준비 중",
    note:
      "현재는 멤버십 혜택이나 유료 전용 콘텐츠 없이, 프로젝트가 계속 유지되고 개선될 수 있도록 돕는 자발적 응원에 가깝습니다.",
    supportSections: [
      {
        title: "후원금의 사용처",
        body: [
          "후원금은 대회 데이터 보강, 소속 관계 확인, 페이지 개선, 검색 경험 향상처럼 사이트 품질에 직접 연결되는 작업에 사용됩니다.",
          "단기적으로는 주요 대회 페이지를 확장하고 선수 및 조직 페이지의 가독성을 높이는 데 우선 투입할 계획입니다.",
        ],
      },
      {
        title: "이 페이지의 역할",
        body: [
          "이 페이지는 실제로 소액 자발적 후원 수요가 있는지 확인하기 위한 초기 시험 버전입니다.",
          "후원 동선뿐 아니라 운영자 정보와 업데이트 방침도 점차 더 분명하게 정리해 나갈 계획입니다.",
        ],
      },
    ],
    footerPending:
      "후원 동선은 이후 바뀔 수 있습니다. 아직 PayPal URL 이 설정되지 않았다면, 현재는 안내 페이지로만 먼저 공개되어 있습니다.",
  },
};

const copies: Partial<Record<Locale, StaticPageCopy>> = {
  ja: jaCopy,
  zh: zhCopy,
  "zh-Hant": zhHantCopy,
  en: enCopy,
  ko: koCopy,
};

export function getStaticPageCopy(locale: Locale): StaticPageCopy {
  return copies[locale] ?? jaCopy;
}
