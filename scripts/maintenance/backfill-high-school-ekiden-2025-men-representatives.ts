import { readFile } from "node:fs/promises";
import path from "node:path";

import { OrganizationType } from "@prisma/client";

import { loadWorkspaceEnv } from "../lib/load-env";
import { buildOrganizationCanonicalKey } from "../lib/organization-normalization";
import { prisma } from "../lib/prisma";

loadWorkspaceEnv();

type Payload = {
  teamResults: Array<{
    organizationSlug: string;
    organizationNameJa: string;
    notes: string | null;
    snapshot: {
      leg: number;
      notes?: string | null;
    };
  }>;
};

const TEAM_NAME_OVERRIDES = new Map<string, string>([
  ["智辯カレッジ高", "hs-智辯カレッジ高"],
  ["智辯学園奈良カレッジ高校", "hs-智辯カレッジ高"],
  ["高知農高", "hs-高知農高"],
  ["高知農業高校", "hs-高知農高"],
  ["松山商高", "hs-松山商高"],
  ["松山商業高校", "hs-松山商高"],
  ["遊学館高", "hs-遊学館高"],
  ["遊学館高校", "hs-遊学館高"],
  ["長野日大高", "hs-長野日大高"],
  ["長野日本大学高校", "hs-長野日大高"],
  ["高岡向陵高", "hs-高岡向陵高"],
  ["高岡向陵高校", "hs-高岡向陵高"],
]);

async function main() {
  const payloadPath = path.resolve(
    process.argv[2] ?? "data/imports/high-school-ekiden-2025-men/national-high-school-ekiden-2025-men-leg-7.json",
  );
  const payload = JSON.parse(await readFile(payloadPath, "utf8")) as Payload;
  const edition = await prisma.competitionEdition.findUnique({
    where: { slug: "national-high-school-ekiden-2025-men" },
    include: {
      teamCompetitionResults: {
        include: {
          organization: true,
          legSnapshots: true,
        },
      },
    },
  });

  if (!edition) {
    throw new Error("Missing edition national-high-school-ekiden-2025-men");
  }

  const payloadByOrganizationSlug = new Map(payload.teamResults.map((teamResult) => [teamResult.organizationSlug, teamResult] as const));
  const payloadByOrganizationName = new Map(
    payload.teamResults.filter((teamResult) => teamResult.organizationNameJa).map((teamResult) => [teamResult.organizationNameJa, teamResult] as const),
  );
  const payloadByCanonicalKey = new Map(
    payload.teamResults.map((teamResult) => [
      buildOrganizationCanonicalKey(teamResult.organizationNameJa, OrganizationType.high_school),
      teamResult,
    ] as const),
  );
  const payloadByOverrideSlug = new Map(
    payload.teamResults.flatMap((teamResult) => {
      const overrideSlug = TEAM_NAME_OVERRIDES.get(teamResult.organizationNameJa);
      return overrideSlug ? [[overrideSlug, teamResult] as const] : [];
    }),
  );

  let updatedTeamResults = 0;
  let updatedSnapshots = 0;

  for (const teamResult of edition.teamCompetitionResults) {
    const source =
      payloadByOverrideSlug.get(teamResult.organization.slug) ??
      payloadByOrganizationSlug.get(teamResult.organization.slug) ??
      payloadByOrganizationName.get(teamResult.organization.nameJa) ??
      payloadByCanonicalKey.get(buildOrganizationCanonicalKey(teamResult.organization.nameJa, OrganizationType.high_school));
    if (!source) continue;

    if (teamResult.notes !== source.notes) {
      await prisma.teamCompetitionResult.update({
        where: { id: teamResult.id },
        data: { notes: source.notes },
      });
      updatedTeamResults += 1;
    }

    for (const snapshot of teamResult.legSnapshots) {
      if (snapshot.notes !== source.snapshot.notes) {
        await prisma.teamCompetitionLegSnapshot.update({
          where: { id: snapshot.id },
          data: { notes: source.snapshot.notes ?? source.notes },
        });
        updatedSnapshots += 1;
      }
    }
  }

  console.log(JSON.stringify({ updatedTeamResults, updatedSnapshots }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
