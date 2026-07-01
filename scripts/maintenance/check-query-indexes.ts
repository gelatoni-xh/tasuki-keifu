import { prisma } from "../lib/prisma";

type ExplainRow = {
  "QUERY PLAN": string;
};

async function explain(query: string) {
  const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(`EXPLAIN ${query}`);
  return rows.map((row) => row["QUERY PLAN"]);
}

async function explainAnalyze(query: string) {
  const rows = await prisma.$queryRawUnsafe<ExplainRow[]>(`EXPLAIN (ANALYZE, BUFFERS) ${query}`);
  return rows.map((row) => row["QUERY PLAN"]);
}

async function getSamplePersonId() {
  const person = await prisma.person.findFirst({
    where: {
      raceResults: {
        some: {},
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return person?.id ?? null;
}

async function main() {
  const samplePersonId = await getSamplePersonId();

  if (!samplePersonId) {
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      samplePersonId: null,
      warning: "No person with race results was found.",
    }, null, 2));
    return;
  }

  const checks = [
    {
      key: "person_status_updated_at",
      query: `SELECT id, "displayNameJa" FROM "Person" WHERE status = 'verified' ORDER BY "updatedAt" DESC LIMIT 20`,
    },
    {
      key: "membership_by_person_and_org",
      query: `SELECT "personId", "organizationId" FROM "Membership" WHERE "personId" = '${samplePersonId}' ORDER BY "startDate" DESC NULLS LAST LIMIT 20`,
    },
    {
      key: "membership_by_org_and_person",
      query: `SELECT "personId", "organizationId" FROM "Membership" WHERE "organizationId" IN (SELECT "organizationId" FROM "Membership" WHERE "personId" = '${samplePersonId}') AND "personId" <> '${samplePersonId}' LIMIT 50`,
    },
    {
      key: "race_by_competition_and_time",
      query: `SELECT id, "competitionEditionId", leg, "startsAt" FROM "Race" WHERE "competitionEditionId" IN (SELECT DISTINCT r."competitionEditionId" FROM "RaceResult" rr JOIN "Race" r ON r.id = rr."raceId" WHERE rr."personId" = '${samplePersonId}' LIMIT 3) ORDER BY leg ASC NULLS LAST, "startsAt" ASC NULLS LAST LIMIT 50`,
    },
    {
      key: "race_result_by_person_and_race",
      query: `SELECT "personId", "raceId" FROM "RaceResult" WHERE "personId" = '${samplePersonId}' ORDER BY "createdAt" DESC LIMIT 50`,
    },
    {
      key: "race_result_by_race_and_rank",
      query: `SELECT rr."raceId", rr.rank, rr."markMillis" FROM "RaceResult" rr WHERE rr."raceId" IN (SELECT "raceId" FROM "RaceResult" WHERE "personId" = '${samplePersonId}' LIMIT 3) ORDER BY rr.rank ASC NULLS LAST, rr."markMillis" ASC NULLS LAST LIMIT 100`,
    },
  ] as const;

  const reports = [];

  for (const check of checks) {
    const [plan, analyzePlan] = await Promise.all([
      explain(check.query),
      explainAnalyze(check.query),
    ]);

    reports.push({
      key: check.key,
      query: check.query,
      plan,
      analyzePlan,
    });
  }

  const counts = await Promise.all([
    prisma.person.count(),
    prisma.membership.count(),
    prisma.race.count(),
    prisma.raceResult.count(),
    prisma.playerRelationCache.count(),
  ]);

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    samplePersonId,
    rowCounts: {
      person: counts[0],
      membership: counts[1],
      race: counts[2],
      raceResult: counts[3],
      playerRelationCache: counts[4],
    },
    reports,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
