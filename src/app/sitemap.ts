import type { MetadataRoute } from "next";
import {
  getIndexableCompetitions,
  getIndexableOrganizations,
  getIndexablePlayers,
} from "@/lib/search-discovery";
import { buildLocalizedUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: buildLocalizedUrl("ja"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: buildLocalizedUrl("ja", "/players"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildLocalizedUrl("ja", "/competitions"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: buildLocalizedUrl("ja", "/organizations"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  try {
    const [players, competitions, organizations] = await Promise.all([
      getIndexablePlayers(),
      getIndexableCompetitions(),
      getIndexableOrganizations(),
    ]);

    return [
      ...staticEntries,
      ...players.map((player) => ({
        url: buildLocalizedUrl("ja", `/players/${player.slug}`),
        lastModified: player.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...competitions.map((competition) => ({
        url: buildLocalizedUrl("ja", `/competitions/${competition.slug}`),
        lastModified: competition.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...organizations.map((organization) => ({
        url: buildLocalizedUrl("ja", `/organizations/${organization.slug}`),
        lastModified: organization.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
