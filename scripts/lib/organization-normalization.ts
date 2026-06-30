import { OrganizationType } from "@prisma/client";

export function normalizeOrganizationLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ 　]/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/[／/]/g, "・")
    .replace(/附属/g, "付属")
    .replace(/大學/g, "大学")
    .replace(/高等学校/g, "高校")
    .replace(/学校高等部/g, "高校")
    .replace(/高等部/g, "高校")
    .trim();
}

export function buildOrganizationCanonicalKey(nameJa: string, type: OrganizationType) {
  const normalized = normalizeOrganizationLabel(nameJa);

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
  let score = normalized.length * 10;

  if (type === "high_school") {
    if (normalized.endsWith("高校")) {
      score += 50;
    }
    if (normalized.endsWith("高")) {
      score += 30;
    }
    if (normalized.includes("付属")) {
      score += 20;
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
