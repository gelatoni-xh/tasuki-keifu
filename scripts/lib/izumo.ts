import path from "node:path";

export function buildIzumoBaseUrl(edition: number) {
  return `https://www.izumo-ekiden.jp/${edition}`;
}

export function buildIzumoRecordIndexUrl(edition: number) {
  return `${buildIzumoBaseUrl(edition)}/record/index.html`;
}

export function buildIzumoRecordUrl(edition: number, leg: number, type: "a" | "b" | "record") {
  if (type === "record") {
    return `${buildIzumoBaseUrl(edition)}/record/record.html`;
  }

  return `${buildIzumoBaseUrl(edition)}/record/${leg}${type}.html`;
}

export function buildIzumoRunnerIndexUrl(edition: number) {
  return `${buildIzumoBaseUrl(edition)}/runner/index.html`;
}

export function buildIzumoRunnerOrderUrl(edition: number, teamNumber: number) {
  return `${buildIzumoBaseUrl(edition)}/runner/order/${String(teamNumber).padStart(2, "0")}.html`;
}

export function buildIzumoPayloadPath(edition: number, leg: number) {
  return path.resolve(`data/imports/izumo-${edition}-leg-${leg}.json`);
}

export function buildIzumoBatchKey(edition: number, leg: number, suffix: string) {
  return `izumo-${edition}-leg-${leg}-${suffix}`;
}

export function buildIzumoRaceSlug(edition: number, leg: number) {
  return `izumo-ekiden-${edition}-leg-${leg}`;
}

export function buildIzumoSourceId(edition: number) {
  return `source-izumo-ekiden-${edition}-official-record`;
}

export function buildIzumoRunnerSourceId(edition: number) {
  return `source-izumo-ekiden-${edition}-runner-order`;
}

export function buildIzumoCachePath(edition: number, key: string) {
  return path.resolve(`tmp/izumo-${edition}-${key}.html`);
}

export function normalizeJa(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSchoolLabel(value: string) {
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

export function formatJapaneseTimeToMark(value: string) {
  const normalized = value.replace(/\s/g, "").trim();
  if (!normalized) {
    return null;
  }

  if (/^\d+:\d{2}(?::\d{2})?$/.test(normalized)) {
    return normalized;
  }

  const hourMatch = normalized.match(/(?:(\d+)時間)?(?:(\d+)分)?(?:(\d+)秒)?$/);
  if (!hourMatch) {
    return normalized;
  }

  const hours = Number(hourMatch[1] ?? 0);
  const minutes = Number(hourMatch[2] ?? 0);
  const seconds = Number(hourMatch[3] ?? 0);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return normalized;
  }

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPbMark(value: string) {
  const normalized = value.replace(/\s/g, "").trim();
  if (!normalized || normalized === "－" || normalized === "ー" || normalized === "—") {
    return null;
  }

  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return normalized;
  }

  return `${match[1]}:${match[2]}.${match[3]}`;
}
