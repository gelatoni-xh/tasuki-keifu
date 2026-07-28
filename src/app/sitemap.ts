import type { MetadataRoute } from "next";
import {
  getIndexableCompetitions,
  getIndexableOrganizations,
  getIndexablePlayers,
} from "@/lib/search-discovery";
import { buildLocalizedUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const sitemapIds = ["static", "players", "competitions", "organizations"] as const;
type SitemapId = (typeof sitemapIds)[number];

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

export async function generateSitemaps() {
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
      return buildStaticEntries(now);
    }

    if (resolvedId === "players") {
      const players = await getIndexablePlayers();

      return players.map((player) => ({
        url: buildLocalizedUrl("ja", `/players/${player.slug}`),
        lastModified: player.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }

    if (resolvedId === "competitions") {
      const competitions = await getIndexableCompetitions();

      return competitions.map((competition) => ({
        url: buildLocalizedUrl("ja", `/competitions/${competition.slug}`),
        lastModified: competition.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
    }

    if (resolvedId === "organizations") {
      const organizations = await getIndexableOrganizations();

      return organizations.map((organization) => ({
        url: buildLocalizedUrl("ja", `/organizations/${organization.slug}`),
        lastModified: organization.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    }

    return buildStaticEntries(now);
  } catch {
    return resolvedId === "static" ? buildStaticEntries(now) : [];
  }
}
