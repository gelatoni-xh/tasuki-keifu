import type { MetadataRoute } from "next";
import { createLogger } from "@/lib/logger";
import {
  getIndexableCompetitions,
  getIndexableOrganizations,
  getIndexablePlayers,
} from "@/lib/search-discovery";
import { buildLocalizedUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const sitemapIds = ["static", "players", "competitions", "organizations"] as const;
export type SitemapId = (typeof sitemapIds)[number];
const sitemapLogger = createLogger("sitemap-route");

function buildStaticEntries(lastModified: Date): MetadataRoute.Sitemap {
  return [
    {
      url: buildLocalizedUrl("ja"),
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: buildLocalizedUrl("ja", "/players"),
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildLocalizedUrl("ja", "/competitions"),
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: buildLocalizedUrl("ja", "/organizations"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
}

function getMostRecentUpdatedAt(items: Array<{ updatedAt: Date }>) {
  return items.reduce<Date | null>((latest, item) => {
    if (!latest || item.updatedAt > latest) {
      return item.updatedAt;
    }

    return latest;
  }, null);
}

export async function getSitemapLastModified(id: SitemapId) {
  if (id === "static") {
    return new Date();
  }

  if (id === "players") {
    const players = await getIndexablePlayers();
    return getMostRecentUpdatedAt(players) ?? new Date();
  }

  if (id === "competitions") {
    const competitions = await getIndexableCompetitions();
    return getMostRecentUpdatedAt(competitions) ?? new Date();
  }

  const organizations = await getIndexableOrganizations();
  return getMostRecentUpdatedAt(organizations) ?? new Date();
}

export async function generateSitemaps() {
  sitemapLogger.info("sitemap_index_generated", {
    sitemap_ids: sitemapIds,
  });
  return sitemapIds.map((id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<SitemapId>;
}): Promise<MetadataRoute.Sitemap> {
  const resolvedId = await id;
  const now = new Date();

  try {
    if (resolvedId === "static") {
      const entries = buildStaticEntries(now);
      sitemapLogger.info("sitemap_generated", {
        sitemap_id: resolvedId,
        entry_count: entries.length,
      });
      return entries;
    }

    if (resolvedId === "players") {
      const players = await getIndexablePlayers();

      const entries = players.map((player) => ({
        url: buildLocalizedUrl("ja", `/players/${player.slug}`),
        lastModified: player.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
      sitemapLogger.info("sitemap_generated", {
        sitemap_id: resolvedId,
        entry_count: entries.length,
      });
      return entries;
    }

    if (resolvedId === "competitions") {
      const competitions = await getIndexableCompetitions();

      const entries = competitions.map((competition) => ({
        url: buildLocalizedUrl("ja", `/competitions/${competition.slug}`),
        lastModified: competition.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
      sitemapLogger.info("sitemap_generated", {
        sitemap_id: resolvedId,
        entry_count: entries.length,
      });
      return entries;
    }

    if (resolvedId === "organizations") {
      const organizations = await getIndexableOrganizations();

      const entries = organizations.map((organization) => ({
        url: buildLocalizedUrl("ja", `/organizations/${organization.slug}`),
        lastModified: organization.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
      sitemapLogger.info("sitemap_generated", {
        sitemap_id: resolvedId,
        entry_count: entries.length,
      });
      return entries;
    }

    const fallbackEntries = buildStaticEntries(now);
    sitemapLogger.warn("sitemap_generated_with_unknown_id", {
      sitemap_id: resolvedId,
      entry_count: fallbackEntries.length,
    });
    return fallbackEntries;
  } catch (error) {
    sitemapLogger.error("sitemap_generation_failed", {
      sitemap_id: resolvedId,
      error,
    });
    return resolvedId === "static" ? buildStaticEntries(now) : [];
  }
}
