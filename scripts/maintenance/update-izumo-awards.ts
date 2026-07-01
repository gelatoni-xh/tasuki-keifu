import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { buildIzumoCachePath, buildIzumoRecordUrl } from "../lib/izumo";

function markToSeconds(mark: string) {
  const parts = mark.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  throw new Error(`Unsupported mark format: ${mark}`);
}

function buildNotes(input: { existing: string | null; isWinner: boolean; isRecord: boolean }) {
  const tokens = new Set(
    (input.existing ?? "")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => part !== "区間賞" && part !== "区間新" && part !== "区間新記録"),
  );

  if (input.isWinner) {
    tokens.add("区間賞");
  }

  if (input.isRecord) {
    tokens.add("区間新");
  }

  const ordered = ["区間賞", "区間新"].filter((token) => tokens.delete(token));
  const others = [...tokens];
  const finalTokens = [...ordered, ...others];

  return finalTokens.length > 0 ? finalTokens.join(" / ") : null;
}

async function fetchWithCurl(url: string) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "-A", "Mozilla/5.0", url], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return stdout;
}

async function loadCachedHtml(cachePath: string, url: string) {
  try {
    return await readFile(cachePath, "utf8");
  } catch {
    const html = await fetchWithCurl(url);
    await writeFile(cachePath, html, "utf8");
    return html;
  }
}

function extractOldRecordMark(html: string) {
  const match =
    html.match(/<p class="record__kukan">[\s\S]*?区間記録：[\s\S]*?(\d+[：:]\d{2}(?:[：:]\d{2})?)（/i)
    ?? html.match(/区間記録：[\s\S]*?(\d+[：:]\d{2}(?:[：:]\d{2})?)（/);
  if (!match) {
    throw new Error("Izumo old record baseline not found in record page");
  }
  return match[1].replace(/：/g, ":");
}

async function main() {
  const edition = Number(process.argv[2]);

  if (!edition) {
    throw new Error("Usage: tsx scripts/maintenance/update-izumo-awards.ts <edition>");
  }

  if (edition <= 1) {
    throw new Error(`Izumo edition must be > 1 to derive prior baseline: ${edition}`);
  }

  // The 32nd edition was canceled, so the previous record baseline for the 33rd edition
  // must be derived from the 31st official record pages.
  const baselineEdition = edition === 33 ? 31 : edition - 1;

  const baselines = new Map<number, string>();
  for (let leg = 1; leg <= 6; leg += 1) {
    const html = await loadCachedHtml(
      buildIzumoCachePath(baselineEdition, `record-${leg}b`),
      buildIzumoRecordUrl(baselineEdition, leg, "b"),
    );
    baselines.set(leg, extractOldRecordMark(html));
  }

  const races = await prisma.race.findMany({
    where: {
      slug: {
        in: Array.from({ length: 6 }, (_, index) => `izumo-ekiden-${edition}-leg-${index + 1}`),
      },
    },
    include: {
      raceResults: {
        include: {
          person: true,
        },
        orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { leg: "asc" },
  });

  for (const race of races) {
    if (!race.leg) {
      continue;
    }

    const oldRecord = baselines.get(race.leg);
    if (!oldRecord) {
      continue;
    }
    const oldRecordSeconds = markToSeconds(oldRecord);

    for (const result of race.raceResults) {
      const isWinner = result.rank === 1;
      const isRecord = Boolean(result.mark && result.rank !== null && markToSeconds(result.mark) < oldRecordSeconds);
      const nextNotes = buildNotes({
        existing: result.notes,
        isWinner,
        isRecord,
      });

      await prisma.raceResult.update({
        where: { id: result.id },
        data: { notes: nextNotes },
      });

      if (isWinner || isRecord) {
        console.log(
          JSON.stringify({
            edition,
            leg: race.leg,
            oldRecord,
            slug: result.person.slug,
            displayNameJa: result.person.displayNameJa,
            rank: result.rank,
            mark: result.mark,
            notes: nextNotes,
          }),
        );
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
