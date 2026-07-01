import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { OrganizationType } from "@prisma/client";

import { buildOrganizationCanonicalKey, getOrganizationCanonicalScore, normalizeOrganizationLabel } from "../lib/organization-normalization";
import { loadWorkspaceEnv } from "../lib/load-env";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

type TeamPerformanceRow = {
  finalRank: number;
  bibNumber: number;
  finalMark: string;
  schoolName: string;
  representativeLabel: string;
  representativeType: "prefecture" | "region";
  prefecture: string;
  runners: Array<{
    displayNameJa: string;
    grade: number | null;
  }>;
  cumulativeSnapshots: Array<{
    cumulativeRank: number;
    cumulativeMark: string;
  }>;
  legSnapshots: Array<{
    legRank: number;
    legMark: string;
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

const RESULT_PDF_URL = "https://www.jaaf.or.jp/files/upload/202412/22_151626.pdf";
const RESULT_SOURCE_ID = "source-jaaf-koko-ekiden-2024-men-result";

const SCHOOL_NAME_PREFECTURE_OVERRIDES = new Map<string, {
  slug?: string;
  canonicalNameJa?: string;
}>([
  ["西京::山口県", {
    canonicalNameJa: "山口県立西京高校",
  }],
]);

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

const REGION_TO_PREFECTURE = new Map<string, string>([
  ["東北", "宮城県"],
  ["北関東", "茨城県"],
  ["南関東", "千葉県"],
  ["東海", "愛知県"],
  ["近畿", "兵庫県"],
  ["中国", "広島県"],
  ["四国", "高知県"],
  ["北九州", "福岡県"],
  ["南九州", "宮崎県"],
  ["北信越", "長野県"],
]);

const PREFECTURE_NORMALIZATION = new Map<string, string>([
  ["北海道", "北海道"],
  ["青森", "青森県"],
  ["岩手", "岩手県"],
  ["宮城", "宮城県"],
  ["秋田", "秋田県"],
  ["山形", "山形県"],
  ["福島", "福島県"],
  ["茨城", "茨城県"],
  ["栃木", "栃木県"],
  ["群馬", "群馬県"],
  ["埼玉", "埼玉県"],
  ["千葉", "千葉県"],
  ["東京", "東京都"],
  ["神奈川", "神奈川県"],
  ["山梨", "山梨県"],
  ["新潟", "新潟県"],
  ["富山", "富山県"],
  ["石川", "石川県"],
  ["福井", "福井県"],
  ["長野", "長野県"],
  ["岐阜", "岐阜県"],
  ["静岡", "静岡県"],
  ["愛知", "愛知県"],
  ["三重", "三重県"],
  ["滋賀", "滋賀県"],
  ["京都", "京都府"],
  ["大阪", "大阪府"],
  ["兵庫", "兵庫県"],
  ["奈良", "奈良県"],
  ["和歌山", "和歌山県"],
  ["鳥取", "鳥取県"],
  ["島根", "島根県"],
  ["岡山", "岡山県"],
  ["広島", "広島県"],
  ["山口", "山口県"],
  ["徳島", "徳島県"],
  ["香川", "香川県"],
  ["愛媛", "愛媛県"],
  ["高知", "高知県"],
  ["福岡", "福岡県"],
  ["佐賀", "佐賀県"],
  ["長崎", "長崎県"],
  ["熊本", "熊本県"],
  ["大分", "大分県"],
  ["宮崎", "宮崎県"],
  ["鹿児島", "鹿児島県"],
  ["沖縄", "沖縄県"],
]);

function normalizeWhitespace(value: string) {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalizeWhitespace(value).replace(/\s+/g, "");
}

function normalizeDisplayNameJa(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return normalized;
  }

  const pieces = normalized.split(" ");
  if (pieces.length === 1) {
    return normalized;
  }

  return `${pieces[0]} ${pieces.slice(1).join(" ")}`;
}

function parseGradeFromName(value: string) {
  const match = value.match(/^(.*)\((\d)\)$/);
  if (!match) {
    return {
      displayNameJa: normalizeDisplayNameJa(value),
      grade: null,
    };
  }

  return {
    displayNameJa: normalizeDisplayNameJa(match[1]),
    grade: Number(match[2]),
  };
}

function normalizePrefectureToken(value: string) {
  const compactValue = compact(value);
  return REGION_TO_PREFECTURE.get(compactValue) ?? PREFECTURE_NORMALIZATION.get(compactValue) ?? compactValue;
}

async function extractTextFromPdf(pdfPath: string) {
  const script = `
import sys
sys.path.insert(0, '/Users/xuhuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python')
import pdfplumber
with pdfplumber.open(${JSON.stringify(pdfPath)}) as pdf:
    for page in pdf.pages:
        text = page.extract_text() or ''
        print(text)
        print('<<<PAGE_BREAK>>>')
`;

  const { execFile } = await import("node:child_process");
  const python = "/Users/xuhuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

  return await new Promise<string>((resolve, reject) => {
    execFile(python, ["-c", script], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function downloadPdf(url: string, destination: string) {
  const { request } = await import("node:https");

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
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
            response.on("end", async () => {
              await writeFile(destination, Buffer.concat(chunks));
              resolve();
            });
          },
        );

        req.on("timeout", () => req.destroy(new Error(`Timeout fetching ${url}`)));
        req.on("error", reject);
        req.end();
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function slugifySchoolName(value: string) {
  return `hs-${Buffer.from(value).toString("hex").slice(0, 24)}`;
}

function slugifyPersonName(value: string) {
  return `person-${Buffer.from(value).toString("hex").slice(0, 24)}`;
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

    const normalizedName = normalizeDisplayNameJa(person.displayNameJa);
    const group = byName.get(normalizedName) ?? [];
    group.push(entry);
    byName.set(normalizedName, group);
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
  const override = SCHOOL_NAME_PREFECTURE_OVERRIDES.get(`${schoolName}::${prefecture}`) ?? null;
  if (override?.slug) {
    for (const candidates of aliasMap.values()) {
      const matched = candidates.find((candidate) => candidate.slug === override.slug);
      if (matched) {
        return {
          slug: matched.slug,
          canonicalNameJa: matched.nameJa,
          sourceNameJa: schoolName,
          prefecture,
          matchedBy: "slug",
        };
      }
    }
  }

  if (override?.canonicalNameJa) {
    return {
      slug: null,
      canonicalNameJa: override.canonicalNameJa,
      sourceNameJa: schoolName,
      prefecture,
      matchedBy: "generated",
    };
  }

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

function parseStageLine(line: string) {
  const matches = [...line.matchAll(/\(\s*(\d+)\)\s+(?:\*\s*)?([0-9:]+)\s*/g)];
  return matches.map((match) => ({
    rank: Number(match[1]),
    mark: match[2],
  }));
}

function extractPrefectureLabelFromLine(line: string) {
  const trimmed = normalizeWhitespace(line);
  const compactLine = compact(line);
  const sortedLabels = [...new Set([
    ...EXPECTED_PREFECTURES,
    ...PREFECTURE_NORMALIZATION.keys(),
    ...REGION_TO_PREFECTURE.keys(),
  ])].sort((left, right) => right.length - left.length);

  for (const label of sortedLabels) {
    const compactLabel = compact(label);
    if (!compactLabel) {
      continue;
    }

    if (compactLine.startsWith(compactLabel)) {
      return label;
    }
  }

  const firstToken = trimmed.split(" ")[0] ?? "";
  return firstToken;
}

function parseTotalPages(lines: string[]) {
  const rows: TeamPerformanceRow[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const match = header.match(/^(\d+)\s+(\d+)\s+([0-9:]+)\s+(\S+)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const prefectureLine = lines[index + 1] ?? "";
    const cumulativeLine = lines[index + 2] ?? "";
    const legLine = lines[index + 3] ?? "";
    const runnerTokens = match[5].trim().split(/\s{1,}/).join(" ").split(/(?<=\(\d\))\s+/).filter(Boolean);
    if (runnerTokens.length !== 7) {
      continue;
    }

    const representativeLabel = extractPrefectureLabelFromLine(prefectureLine);
    const representativeType = REGION_TO_PREFECTURE.has(compact(representativeLabel)) ? "region" : "prefecture";
    const prefecture = normalizePrefectureToken(representativeLabel);
    const cumulativeSnapshots = parseStageLine(cumulativeLine);
    const legSnapshots = parseStageLine(legLine);
    if (cumulativeSnapshots.length !== 7 || legSnapshots.length !== 7) {
      continue;
    }

    rows.push({
      finalRank: Number(match[1]),
      bibNumber: Number(match[2]),
      finalMark: match[3],
      schoolName: compact(match[4]),
      representativeLabel,
      representativeType,
      prefecture,
      runners: runnerTokens.map((token) => parseGradeFromName(token)),
      cumulativeSnapshots: cumulativeSnapshots.map((snapshot) => ({
        cumulativeRank: snapshot.rank,
        cumulativeMark: snapshot.mark,
      })),
      legSnapshots: legSnapshots.map((snapshot) => ({
        legRank: snapshot.rank,
        legMark: snapshot.mark,
      })),
    });

    index += 3;
  }

  return rows;
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
  const outputDir = path.resolve(process.argv[2] ?? "data/imports/high-school-ekiden-2024-men");
  await mkdir(outputDir, { recursive: true });

  const resultPdfPath = path.join(outputDir, "result.pdf");
  try {
    await readFile(resultPdfPath);
  } catch {
    await downloadPdf(RESULT_PDF_URL, resultPdfPath);
  }

  const resultText = await extractTextFromPdf(resultPdfPath);
  const pages = resultText.split("<<<PAGE_BREAK>>>").map((page) => page.trim());
  const totalResultLines = pages
    .slice(1, 4)
    .flatMap((page) => page.split("\n").map((line) => normalizeWhitespace(line)))
    .filter(Boolean);

  const rows = parseTotalPages(totalResultLines);
  if (rows.length !== 58) {
    throw new Error(`Expected 58 team rows, got ${rows.length}`);
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
      batchKey: `national-high-school-ekiden-2024-men-leg-${legIndex + 1}`,
      sourceId: RESULT_SOURCE_ID,
      raceSlug: `national-high-school-ekiden-2024-men-leg-${legIndex + 1}`,
      summary: `全国高校駅伝2024 男子 ${legIndex + 1}区`,
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
          notes: row.representativeType === "region" ? `地区代表:${row.representativeLabel}` : "都道府県代表",
          pbs: [],
          sourceEntityKey: `${legIndex + 1}-${row.bibNumber}-${runner.displayNameJa}`,
          sourceUrl: RESULT_PDF_URL,
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
          finalMark: legIndex === 6 ? row.finalMark : undefined,
          notes: row.representativeType === "region" ? `地区代表:${row.representativeLabel}` : "都道府県代表",
          snapshot: {
            leg: legIndex + 1,
            cumulativeRank: cumulative.cumulativeRank,
            cumulativeMark: cumulative.cumulativeMark,
            gapFromLeader: null,
            notes: row.representativeType === "region" ? `地区代表:${row.representativeLabel}` : "都道府県代表",
          },
        };
      }),
    };

    await writeFile(
      path.join(outputDir, `national-high-school-ekiden-2024-men-leg-${legIndex + 1}.json`),
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
          representativeLabel: row.representativeLabel,
          representativeType: row.representativeType,
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
