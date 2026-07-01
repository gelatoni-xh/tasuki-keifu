import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { OrganizationType } from "@prisma/client";

import { loadWorkspaceEnv } from "../lib/load-env";
import { buildOrganizationCanonicalKey, getOrganizationCanonicalScore, normalizeOrganizationLabel } from "../lib/organization-normalization";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

const ARCHIVE_URL = "https://koukouekiden-record.mainichi.jp/record/archive/m_74/all_record.html";
const SOURCE_ID = "source-mainichi-koko-ekiden-2023-men-archive";

type TeamPerformanceRow = {
  finalRank: number;
  schoolName: string;
  prefecture: string;
  runners: Array<{
    displayNameJa: string;
    grade: null;
  }>;
  cumulativeSnapshots: Array<{
    cumulativeRank: number;
    cumulativeMark: string;
  }>;
  legSnapshots: Array<{
    legRank: number;
    legMark: string;
    notes: string | null;
  }>;
};

type CanonicalSchool = {
  slug: string | null;
  canonicalNameJa: string;
  sourceNameJa: string;
  prefecture: string;
  matchedBy: "slug" | "generated";
};

type HighSchoolLookupEntry = {
  slug: string;
  nameJa: string;
  prefecture: string | null;
  canonicalKey: string;
  score: number;
};

type PersonLookupEntry = {
  slug: string;
  displayNameJa: string;
  highSchoolSlugs: Set<string>;
  raceOrganizationSlugs: Set<string>;
};

const EXPECTED_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "山梨県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const PREFECTURE_NORMALIZATION = new Map<string, string>([
  ["北海道", "北海道"],
  ["青 森", "青森県"],
  ["岩 手", "岩手県"],
  ["宮 城", "宮城県"],
  ["秋 田", "秋田県"],
  ["山 形", "山形県"],
  ["福 島", "福島県"],
  ["茨 城", "茨城県"],
  ["栃 木", "栃木県"],
  ["群 馬", "群馬県"],
  ["埼 玉", "埼玉県"],
  ["千 葉", "千葉県"],
  ["東 京", "東京都"],
  ["神奈川", "神奈川県"],
  ["山 梨", "山梨県"],
  ["新 潟", "新潟県"],
  ["富 山", "富山県"],
  ["石 川", "石川県"],
  ["福 井", "福井県"],
  ["長 野", "長野県"],
  ["岐 阜", "岐阜県"],
  ["静 岡", "静岡県"],
  ["愛 知", "愛知県"],
  ["三 重", "三重県"],
  ["滋 賀", "滋賀県"],
  ["京 都", "京都府"],
  ["大 阪", "大阪府"],
  ["兵 庫", "兵庫県"],
  ["奈 良", "奈良県"],
  ["和歌山", "和歌山県"],
  ["鳥 取", "鳥取県"],
  ["島 根", "島根県"],
  ["岡 山", "岡山県"],
  ["広 島", "広島県"],
  ["山 口", "山口県"],
  ["徳 島", "徳島県"],
  ["香 川", "香川県"],
  ["愛 媛", "愛媛県"],
  ["高 知", "高知県"],
  ["福 岡", "福岡県"],
  ["佐 賀", "佐賀県"],
  ["長 崎", "長崎県"],
  ["熊 本", "熊本県"],
  ["大 分", "大分県"],
  ["宮 崎", "宮崎県"],
  ["鹿児島", "鹿児島県"],
  ["沖 縄", "沖縄県"],
]);

function normalizeWhitespace(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeWhitespace(value).replace(/\s+/g, "");
}

function stripHistoricalSchoolNotes(value: string) {
  return compact(value).replace(/（旧・[^）]+）/g, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normalizeDisplayNameJa(value: string) {
  return normalizeWhitespace(decodeHtml(value));
}

function normalizePrefectureToken(value: string) {
  const normalized = normalizeWhitespace(value);
  return PREFECTURE_NORMALIZATION.get(normalized) ?? normalized;
}

function toCanonicalMark(value: string) {
  const normalized = value.replace(/\s+/g, "").trim();
  if (!normalized) {
    return normalized;
  }

  const cumulativeOnlyMatch = normalized.match(/^(\d+)'(\d+)ﾟ(\d+)'(\d+)''$/);
  if (cumulativeOnlyMatch) {
    return `${cumulativeOnlyMatch[1]}:${cumulativeOnlyMatch[2].padStart(2, "0")}`;
  }

  const hourMatch = normalized.match(/^(\d+)ﾟ(\d+)'(\d+)''$/);
  if (hourMatch) {
    return `${hourMatch[1]}:${hourMatch[2].padStart(2, "0")}:${hourMatch[3].padStart(2, "0")}`;
  }

  const minuteMatch = normalized.match(/^(\d+)'(\d+)''$/);
  if (minuteMatch) {
    return `${minuteMatch[1]}:${minuteMatch[2].padStart(2, "0")}`;
  }

  const secondlessMinuteMatch = normalized.match(/^(\d+)'(\d+)$/);
  if (secondlessMinuteMatch) {
    return `${secondlessMinuteMatch[1]}:${secondlessMinuteMatch[2].padStart(2, "0")}`;
  }

  return normalized.replace(/ﾟ/g, ":").replace(/'/g, "").replace(/''/g, "");
}

function markToSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid mark: ${value}`);
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  throw new Error(`Unexpected mark shape: ${value}`);
}

function secondsToMark(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function slugifySchoolName(value: string) {
  return `hs-${Buffer.from(value).toString("hex").slice(0, 24)}`;
}

function slugifyPersonName(value: string) {
  return `person-${Buffer.from(value).toString("hex").slice(0, 24)}`;
}

function parseRankCell(value: string) {
  const normalized = normalizeWhitespace(decodeHtml(value));
  const match = normalized.match(/^(\d+)(?:\((\d+)\))?$/);
  if (!match) {
    throw new Error(`Unexpected rank cell: ${normalized}`);
  }

  if (match[2]) {
    return {
      legRank: Number(match[1]),
      cumulativeRank: Number(match[2]),
    };
  }

  return {
    cumulativeRank: Number(match[1]),
    legRank: Number(match[1]),
  };
}

function parseMarkCell(value: string) {
  const normalized = normalizeWhitespace(decodeHtml(value));
  const noteParts: string[] = [];
  if (normalized.includes("NSR")) {
    noteParts.push("区間新");
  }

  if (normalized === "8'41 38'24") {
    return {
      legMark: "8:41",
      cumulativeMark: "38:24",
      notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
    };
  }

  if (normalized === "8'55 39'40") {
    return {
      legMark: "8:55",
      cumulativeMark: "39:40",
      notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
    };
  }

  const malformedCompactMatch = normalized.match(/^(\d+'\d+)(?:''?)?\s+(\d+'\d+)(?:''?)$/);
  if (malformedCompactMatch) {
    return {
      legMark: toCanonicalMark(`${malformedCompactMatch[1]}''`),
      cumulativeMark: toCanonicalMark(`${malformedCompactMatch[2]}''`),
      notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
    };
  }

  const markMatch = normalized.match(/^([^（]+)(?:（([^）]+)）)?$/);
  if (!markMatch) {
    throw new Error(`Unexpected mark cell: ${normalized}`);
  }

  const legMark = toCanonicalMark(markMatch[1].replace("NSR", ""));
  const cumulativeMark = markMatch[2] ? toCanonicalMark(markMatch[2]) : legMark;

  return {
    legMark,
    cumulativeMark,
    notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
  };
}

function extractRankTable(html: string) {
  const rankPageMatch = html.match(/<div id="rank_page"[\s\S]*?<table class="tableResult mB20">([\s\S]*?)<\/table>[\s\S]*?<\/div>/);
  if (!rankPageMatch) {
    throw new Error("Failed to locate rank table");
  }

  return rankPageMatch[1];
}

function extractRows(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
}

function extractCells(rowHtml: string) {
  return [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => decodeHtml(match[1]));
}

function parseTeamRows(html: string) {
  const rows = extractRows(extractRankTable(html));
  const bodyRows = rows.slice(4);
  const teams: TeamPerformanceRow[] = [];

  for (let index = 0; index < bodyRows.length; index += 3) {
    const nameRow = extractCells(bodyRows[index] ?? "");
    const rankRow = extractCells(bodyRows[index + 1] ?? "");
    const markRow = extractCells(bodyRows[index + 2] ?? "");
    if (nameRow.length < 10 || rankRow.length < 7 || markRow.length < 7) {
      continue;
    }

    const finalRank = Number(normalizeWhitespace(nameRow[0] ?? ""));
    const schoolName = stripHistoricalSchoolNotes((nameRow[1] ?? "").split("\n")[0] ?? "");
    const prefecture = normalizePrefectureToken(nameRow[2] ?? "");

    const runners = nameRow.slice(3, 10).map((cell) => ({
      displayNameJa: normalizeDisplayNameJa(cell),
      grade: null,
    }));

    const parsedRanks = rankRow.slice(0, 7).map(parseRankCell);
    const parsedMarks = markRow.slice(0, 7).map(parseMarkCell);

    let runningSeconds = 0;
    const normalizedCumulativeSnapshots = parsedRanks.map((item, legIndex) => {
      runningSeconds += markToSeconds(parsedMarks[legIndex]?.legMark ?? "");
      return {
        cumulativeRank: item.cumulativeRank,
        cumulativeMark: secondsToMark(runningSeconds),
      };
    });

    teams.push({
      finalRank,
      schoolName,
      prefecture,
      runners,
      cumulativeSnapshots: normalizedCumulativeSnapshots,
      legSnapshots: parsedRanks.map((item, legIndex) => ({
        legRank: item.legRank,
        legMark: parsedMarks[legIndex]?.legMark ?? "",
        notes: parsedMarks[legIndex]?.notes ?? null,
      })),
    });
  }

  return teams;
}

async function fetchHtml(url: string) {
  const { request } = await import("node:https");

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const req = request(
          url,
          {
            headers: { "user-agent": "Mozilla/5.0" },
            timeout: 20000,
          },
          (response) => {
            if (!response.statusCode || response.statusCode >= 400) {
              reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
              return;
            }

            const chunks: Buffer[] = [];
            response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
          },
        );

        req.on("timeout", () => req.destroy(new Error(`Timeout fetching ${url}`)));
        req.on("error", reject);
        req.end();
      });
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadHighSchoolLookup() {
  const highSchools = await prisma.organization.findMany({
    where: {
      type: OrganizationType.high_school,
    },
    include: {
      nameVariants: true,
    },
  });

  const byAlias = new Map<string, HighSchoolLookupEntry[]>();
  for (const school of highSchools) {
    const labels = new Set<string>([school.nameJa, ...school.nameVariants.map((variant) => variant.value)]);
    const entry: HighSchoolLookupEntry = {
      slug: school.slug,
      nameJa: school.nameJa,
      prefecture: school.prefecture,
      canonicalKey: buildOrganizationCanonicalKey(school.nameJa, OrganizationType.high_school),
      score: getOrganizationCanonicalScore(school.nameJa, OrganizationType.high_school),
    };

    for (const label of labels) {
      const normalized = normalizeOrganizationLabel(label);
      const group = byAlias.get(normalized) ?? [];
      group.push(entry);
      byAlias.set(normalized, group);
    }
  }

  return byAlias;
}

async function loadPersonLookup() {
  const people = await prisma.person.findMany({
    select: {
      slug: true,
      displayNameJa: true,
      memberships: {
        select: {
          organization: {
            select: {
              slug: true,
              type: true,
            },
          },
        },
      },
      raceResults: {
        where: {
          organizationId: { not: null },
        },
        select: {
          organization: {
            select: {
              slug: true,
              type: true,
            },
          },
        },
      },
    },
  });

  const byName = new Map<string, PersonLookupEntry[]>();
  for (const person of people) {
    const entry: PersonLookupEntry = {
      slug: person.slug,
      displayNameJa: person.displayNameJa,
      highSchoolSlugs: new Set(
        person.memberships
          .filter((membership) => membership.organization.type === OrganizationType.high_school)
          .map((membership) => membership.organization.slug),
      ),
      raceOrganizationSlugs: new Set(
        person.raceResults
          .filter((result) => result.organization?.type === OrganizationType.high_school || result.organization?.type === OrganizationType.university)
          .map((result) => result.organization?.slug)
          .filter((slug): slug is string => Boolean(slug)),
      ),
    };

    const group = byName.get(normalizeDisplayNameJa(person.displayNameJa)) ?? [];
    group.push(entry);
    byName.set(normalizeDisplayNameJa(person.displayNameJa), group);
  }

  return byName;
}

function resolvePersonSlug(
  personLookup: Map<string, PersonLookupEntry[]>,
  displayNameJa: string,
  schoolSlug: string,
  fallbackSeed: string,
) {
  const candidates = personLookup.get(normalizeDisplayNameJa(displayNameJa)) ?? [];
  const matched = candidates.find((candidate) =>
    candidate.highSchoolSlugs.has(schoolSlug) || candidate.raceOrganizationSlugs.has(schoolSlug),
  );

  return matched?.slug ?? slugifyPersonName(fallbackSeed);
}

function chooseBestOrganization(entries: HighSchoolLookupEntry[]) {
  return [...entries].sort((left, right) => right.score - left.score || left.nameJa.localeCompare(right.nameJa, "ja"))[0] ?? null;
}

function canonicalSchoolInfo(aliasMap: Map<string, HighSchoolLookupEntry[]>, schoolName: string, prefecture: string): CanonicalSchool {
  const normalizedSource = normalizeOrganizationLabel(schoolName);
  const candidates = aliasMap.get(normalizedSource) ?? [];
  const targetCanonicalKey = buildOrganizationCanonicalKey(schoolName, OrganizationType.high_school);
  const exactCanonicalCandidates = candidates.filter((candidate) => candidate.canonicalKey === targetCanonicalKey);
  const matched = chooseBestOrganization(exactCanonicalCandidates.length > 0 ? exactCanonicalCandidates : candidates);

  if (matched) {
    return {
      slug: matched.slug,
      canonicalNameJa: matched.nameJa,
      sourceNameJa: schoolName,
      prefecture: prefecture || matched.prefecture || "",
      matchedBy: "slug",
    };
  }

  const canonicalNameJa = schoolName.endsWith("高校") || schoolName.endsWith("高") ? schoolName : `${schoolName}高校`;
  return {
    slug: null,
    canonicalNameJa,
    sourceNameJa: schoolName,
    prefecture,
    matchedBy: "generated",
  };
}

function assert47PrefectureCoverage(rows: TeamPerformanceRow[]) {
  const prefectures = [...new Set(rows.map((row) => row.prefecture))].sort((left, right) => left.localeCompare(right, "ja"));
  const missingPrefectures = EXPECTED_PREFECTURES.filter((prefecture) => !prefectures.includes(prefecture));
  const unexpectedPrefectures = prefectures.filter((prefecture) => !EXPECTED_PREFECTURES.includes(prefecture));

  if (prefectures.length !== 47 || missingPrefectures.length > 0 || unexpectedPrefectures.length > 0) {
    throw new Error(
      `Prefecture coverage check failed: count=${prefectures.length}, missing=${missingPrefectures.join(",")}, unexpected=${unexpectedPrefectures.join(",")}`,
    );
  }

  return prefectures;
}

async function main() {
  const outputDir = path.resolve(process.argv[2] ?? "data/imports/high-school-ekiden-2023-men");
  await mkdir(outputDir, { recursive: true });

  const archiveHtmlPath = path.join(outputDir, "all_record.html");
  let html: string;
  try {
    html = await readFile(archiveHtmlPath, "utf8");
  } catch {
    html = await fetchHtml(ARCHIVE_URL);
    await writeFile(archiveHtmlPath, html);
  }
  const rows = parseTeamRows(html);
  if (rows.length !== 47) {
    throw new Error(`Expected 47 team rows, got ${rows.length}`);
  }

  const prefectures = assert47PrefectureCoverage(rows);
  const highSchoolMap = await loadHighSchoolLookup();
  const personLookup = await loadPersonLookup();
  const schoolInfoByName = new Map<string, CanonicalSchool>();
  for (const row of rows) {
    schoolInfoByName.set(row.schoolName, canonicalSchoolInfo(highSchoolMap, row.schoolName, row.prefecture));
  }

  for (let legIndex = 0; legIndex < 7; legIndex += 1) {
    const payload = {
      batchKey: `national-high-school-ekiden-2023-men-leg-${legIndex + 1}`,
      sourceId: SOURCE_ID,
      raceSlug: `national-high-school-ekiden-2023-men-leg-${legIndex + 1}`,
      summary: `全国高校駅伝2023 男子 ${legIndex + 1}区`,
      pbNotes: "No PB snapshot on source",
      entries: rows.map((row) => {
        const school = schoolInfoByName.get(row.schoolName);
        if (!school) {
          throw new Error(`Missing school info for ${row.schoolName}`);
        }

        const runner = row.runners[legIndex];
        const cumulative = row.cumulativeSnapshots[legIndex];
        const leg = row.legSnapshots[legIndex];
        const schoolSlug = school.slug ?? slugifySchoolName(school.canonicalNameJa);
        const slugSeed = `${runner.displayNameJa}-${school.canonicalNameJa}-${school.prefecture}`;
        const personSlug = resolvePersonSlug(personLookup, runner.displayNameJa, schoolSlug, slugSeed);

        return {
          slug: personSlug,
          displayNameJa: runner.displayNameJa,
          displayNameKana: null,
          displayNameRoman: null,
          raceOrganizationSlug: schoolSlug,
          raceOrganizationNameJa: school.canonicalNameJa,
          raceOrganizationType: "high_school" as const,
          raceOrganizationPrefecture: school.prefecture,
          universitySlug: null,
          universityNameJa: null,
          highSchoolSlug: schoolSlug,
          highSchoolNameJa: school.canonicalNameJa,
          highSchoolPrefecture: school.prefecture,
          grade: runner.grade,
          mark: leg.legMark,
          rank: leg.legRank,
          teamRank: cumulative.cumulativeRank,
          notes: leg.notes,
          pbs: [],
          sourceEntityKey: `${legIndex + 1}-${row.finalRank}-${runner.displayNameJa}`,
          sourceUrl: ARCHIVE_URL,
        };
      }),
      teamResults: rows.map((row) => {
        const school = schoolInfoByName.get(row.schoolName);
        if (!school) {
          throw new Error(`Missing school info for ${row.schoolName}`);
        }

        const cumulative = row.cumulativeSnapshots[legIndex];
        const schoolSlug = school.slug ?? slugifySchoolName(school.canonicalNameJa);

        return {
          organizationSlug: schoolSlug,
          organizationNameJa: school.canonicalNameJa,
          organizationType: "high_school" as const,
          organizationPrefecture: school.prefecture,
          finalRank: legIndex === 6 ? row.finalRank : undefined,
          finalMark: legIndex === 6 ? row.cumulativeSnapshots[6]?.cumulativeMark : undefined,
          notes: "都道府県代表",
          snapshot: {
            leg: legIndex + 1,
            cumulativeRank: cumulative.cumulativeRank,
            cumulativeMark: cumulative.cumulativeMark,
            gapFromLeader: null,
            notes: "都道府県代表",
          },
        };
      }),
    };

    await writeFile(
      path.join(outputDir, `national-high-school-ekiden-2023-men-leg-${legIndex + 1}.json`),
      JSON.stringify(payload, null, 2),
    );
  }

  const generatedSchools = [...schoolInfoByName.values()].filter((school) => school.matchedBy === "generated");
  await writeFile(
    path.join(outputDir, "summary.json"),
    JSON.stringify(
      {
        schools: rows.length,
        prefectures,
        prefectureCount: prefectures.length,
        generatedSchoolCount: generatedSchools.length,
        generatedSchools: generatedSchools.map((school) => ({
          sourceNameJa: school.sourceNameJa,
          canonicalNameJa: school.canonicalNameJa,
          prefecture: school.prefecture,
        })),
        representatives: rows.map((row) => ({
          schoolName: row.schoolName,
          prefecture: row.prefecture,
          representativeLabel: row.prefecture,
          representativeType: "prefecture" as const,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`Generated payloads in ${outputDir}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
