import { submitIndexNowUrls } from "../../src/lib/indexnow";
import {
  getIndexableCompetitions,
  getIndexableOrganizations,
  getIndexablePlayers,
} from "../../src/lib/search-discovery";
import { buildLocalizedUrl } from "../../src/lib/site";

const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function main() {
  const staticUrls = [
    buildLocalizedUrl("ja"),
    buildLocalizedUrl("ja", "/players"),
    buildLocalizedUrl("ja", "/competitions"),
    buildLocalizedUrl("ja", "/organizations"),
  ];

  const [players, competitions, organizations] = await Promise.all([
    getIndexablePlayers(),
    getIndexableCompetitions(),
    getIndexableOrganizations(),
  ]);

  const urls = [
    ...staticUrls,
    ...players.map((player) => buildLocalizedUrl("ja", `/players/${player.slug}`)),
    ...competitions.map((competition) => buildLocalizedUrl("ja", `/competitions/${competition.slug}`)),
    ...organizations.map((organization) => buildLocalizedUrl("ja", `/organizations/${organization.slug}`)),
  ];

  const batches = chunk(urls, BATCH_SIZE);

  for (const [batchIndex, batch] of batches.entries()) {
    const result = await submitIndexNowUrls(batch);
    console.log(`Submitted batch ${batchIndex + 1}/${batches.length}: ${result.submitted.length} URLs`);
  }

  console.log(
    JSON.stringify(
      {
        submitted: urls.length,
        batches: batches.length,
        breakdown: {
          static: staticUrls.length,
          players: players.length,
          competitions: competitions.length,
          organizations: organizations.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
