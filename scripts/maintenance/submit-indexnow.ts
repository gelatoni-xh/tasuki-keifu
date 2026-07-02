import { normalizeIndexNowUrls, submitIndexNowUrls } from "../../src/lib/indexnow";

async function main() {
  const rawUrls = process.argv.slice(2);

  if (rawUrls.length === 0) {
    console.error("Usage: pnpm tsx scripts/maintenance/submit-indexnow.ts <url> [more-urls...]");
    process.exit(1);
  }

  const normalizedUrls = normalizeIndexNowUrls(rawUrls);

  if (normalizedUrls.length === 0) {
    console.error("No valid tasukikeifu.com URLs were provided.");
    process.exit(1);
  }

  const result = await submitIndexNowUrls(normalizedUrls);
  console.log(`Submitted ${result.submitted.length} URL(s) to IndexNow:`);

  for (const url of result.submitted) {
    console.log(url);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
