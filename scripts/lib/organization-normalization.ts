import { OrganizationType } from "@prisma/client";

const HIGH_SCHOOL_EXPANSIONS: Array<[RegExp, string]> = [
  [/^湘南工大/, "湘南工科大学"],
  [/^東農大([一二三])/, "東京農業大学第$1"],
  [/^東京農大([一二三])高$/, "東京農業大学第$1高"],
  [/^東京農大([一二三])/, "東京農業大学第$1"],
  [/^佐野日大/, "佐野日本大学"],
  [/^長崎日本大(?!学)/, "長崎日本大学"],
  [/^長崎日大/, "長崎日本大学"],
  [/^流経大/, "流通経済大学"],
  [/^八学/, "八戸学院"],
  [/^東海大仰星/, "東海大学大阪仰星"],
  [/^東海大甲府/, "東海大学甲府"],
  [/^東海大(?!学)/, "東海大学"],
  [/^関大北陽/, "関西大学北陽"],
  [/^専大/, "専修大学"],
  [/^九国大/, "九州国際大学"],
  [/^金沢学院大附高$/, "金沢学院大学付属高"],
  [/^金沢学院大附/, "金沢学院大学附"],
  [/^名経大/, "名古屋経済大学"],
  [/^学法/, "学校法人"],
  [/^智辯/, "智弁"],
  [/^鹿児島実$/, "鹿児島実業"],
  [/^鹿児島実高$/, "鹿児島実業高"],
  [/^法政二$/, "法政大学第二"],
  [/^法大二$/, "法政大学第二"],
  [/^法政大学第二$/, "法政大学第二"],
  [/^川崎橘/, "川崎市立橘"],
  [/^県立西京/, "西京"],
  [/^四日市工$/, "四日市工業"],
  [/^四日市工業$/, "四日市工業"],
  [/^松山商$/, "松山商業"],
  [/^松山商業$/, "松山商業"],
  [/^上伊那農$/, "上伊那農業"],
  [/^上伊那農業$/, "上伊那農業"],
  [/^鳥栖工$/, "鳥栖工業"],
  [/^鳥栖工高$/, "鳥栖工業高"],
  [/^豊川工$/, "豊川工業"],
  [/^豊川工業$/, "豊川工業"],
  [/^古川工$/, "古川工業"],
  [/^古川工業$/, "古川工業"],
  [/^中京学院大付属中京$/, "中京"],
  [/^中京学院大学付属中京$/, "中京"],
  [/^福岡一$/, "福岡第一"],
  [/^福岡一高$/, "福岡第一高"],
  [/^福岡第一$/, "福岡第一"],
  [/^県岐阜商/, "県立岐阜商業"],
  [/^盛岡大高$/, "盛岡大付属高"],
  [/^早稲田実高$/, "早稲田実業高"],
  [/^文星芸大附/, "文星芸術大学付属"],
  [/^自由が丘$/, "自由ケ丘"],
  [/^京都両洋$/, "両洋"],
  [/^駒澤$/, "駒沢"],
  [/^駒沢$/, "駒沢大学"],
];

const HIGH_SCHOOL_SUFFIX_NORMALIZATIONS: Array<[RegExp, string]> = [
  [/工業$/, "工業高校"],
  [/商業$/, "商業高校"],
  [/第二$/, "第二高校"],
  [/第三$/, "第三高校"],
  [/付属$/, "付属高校"],
  [/付高$/, "付属高校"],
  [/附高$/, "付属高校"],
  [/大附$/, "大学付属高校"],
  [/大付$/, "大学付属高校"],
  [/大柏$/, "大学柏高校"],
];

const UNIVERSITY_EXPANSIONS: Array<[RegExp, string]> = [
  [/^東京農大/, "東京農業大学"],
  [/^東農大/, "東京農業大学"],
];

export function normalizeOrganizationLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ 　]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/澤/g, "沢")
    .replace(/①/g, "1")
    .replace(/一(?=(高|校|$))/g, "1")
    .replace(/[／/]/g, "・")
    .replace(/附属/g, "付属")
    .replace(/大學/g, "大学")
    .replace(/高等学校/g, "高校")
    .replace(/学校高等部/g, "高校")
    .replace(/高等部/g, "高校")
    .replace(/智辯/g, "智弁")
    .trim();
}

export function normalizeOrganizationIdentity(nameJa: string, type: OrganizationType) {
  let normalized = normalizeOrganizationLabel(nameJa);

  if (type === "high_school" || type === "junior_high_school") {
    normalized = normalized
      .replace(/高校$/, "高")
      .replace(/高等学校$/, "高")
      .replace(/大学付属高校$/, "大学付属高")
      .replace(/付属高校$/, "付属高")
      .replace(/学校法人/g, "");

    for (const [pattern, replacement] of HIGH_SCHOOL_EXPANSIONS) {
      normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized
      .replace(/^四日市工高$/, "四日市工業高")
      .replace(/^法政二高$/, "法政大学第二高")
      .replace(/^松山商高$/, "松山商業高")
      .replace(/^上伊那農高$/, "上伊那農業高")
      .replace(/^豊川工高$/, "豊川工業高")
      .replace(/^古川工高$/, "古川工業高")
      .replace(/^福岡1高$/, "福岡第一高");

    normalized = normalized.replace(/学校法人/g, "");

    for (const [pattern, replacement] of HIGH_SCHOOL_SUFFIX_NORMALIZATIONS) {
      normalized = normalized.replace(pattern, replacement);
    }
  }

  if (type === "university") {
    normalized = normalized
      .replace(/國學院/g, "国学院")
      .replace(/大學/g, "大学");

    for (const [pattern, replacement] of UNIVERSITY_EXPANSIONS) {
      normalized = normalized.replace(pattern, replacement);
    }
  }

  return normalized.trim();
}

export function buildOrganizationCanonicalKey(nameJa: string, type: OrganizationType) {
  const normalized = normalizeOrganizationIdentity(nameJa, type);

  if (type === "high_school" || type === "junior_high_school") {
    return normalized.replace(/高校$/, "").replace(/高$/, "");
  }

  if (type === "university") {
    return normalized.replace(/大学$/, "").replace(/大$/, "");
  }

  return normalized;
}

export function getOrganizationCanonicalScore(nameJa: string, type: OrganizationType) {
  const normalized = normalizeOrganizationLabel(nameJa);
  const identity = normalizeOrganizationIdentity(nameJa, type);
  let score = normalized.length * 10 + identity.length * 2;

  if (type === "high_school") {
    if (normalized.endsWith("高校")) {
      score += 50;
    }
    if (normalized.endsWith("高")) {
      score += 30;
    }
    if (normalized.includes("大学")) {
      score += 25;
    }
    if (normalized.includes("付属")) {
      score += 20;
    }
    if (normalized.includes("第二") || normalized.includes("第三")) {
      score += 15;
    }
  }

  if (type === "university") {
    if (normalized.endsWith("大学")) {
      score += 50;
    }
    if (normalized.endsWith("大")) {
      score += 20;
    }
    if (normalized.includes("付属")) {
      score += 20;
    }
  }

  return score;
}
