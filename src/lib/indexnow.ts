import { siteConfig } from "@/lib/site";

export const INDEXNOW_KEY = "f7f4f95dfab8450d8fa853a347a68960";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export function getIndexNowKeyLocation() {
  return `${siteConfig.siteUrl}/${INDEXNOW_KEY}.txt`;
}

export function normalizeIndexNowUrls(urls: string[]) {
  const allowedPrefix = `${siteConfig.siteUrl}/`;

  return Array.from(
    new Set(
      urls
        .map((url) => url.trim())
        .filter(Boolean)
        .filter((url) => url === siteConfig.siteUrl || url.startsWith(allowedPrefix)),
    ),
  );
}

export async function submitIndexNowUrls(urls: string[]) {
  const normalizedUrls = normalizeIndexNowUrls(urls);

  if (normalizedUrls.length === 0) {
    throw new Error("At least one in-scope URL is required for IndexNow submission.");
  }

  const payload = {
    host: new URL(siteConfig.siteUrl).host,
    key: INDEXNOW_KEY,
    keyLocation: getIndexNowKeyLocation(),
    urlList: normalizedUrls,
  };

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(`IndexNow submission failed: ${response.status} ${response.statusText} ${responseText}`);
  }

  return {
    submitted: normalizedUrls,
  };
}
