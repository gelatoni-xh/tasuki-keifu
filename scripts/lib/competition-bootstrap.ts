import { DataStatus, EventDiscipline, SourceType, type CompetitionType, type PrismaClient } from "@prisma/client";
import { normalizeCompetitionEditionNames } from "./competition-edition-normalization";

export type CompetitionBootstrapSource = {
  id: string;
  name: string;
  url?: string;
  type: SourceType;
  reliability?: number;
  notes?: string;
};

export type CompetitionBootstrapEdition = {
  slug: string;
  editionNumber?: number;
  year: number;
  officialName: string;
  shortName?: string;
  startsOn?: string;
  endsOn?: string;
  sourceId?: string;
};

export type CompetitionBootstrapRace = {
  slug: string;
  editionSlug: string;
  name: string;
  discipline: EventDiscipline;
  leg?: number;
  round?: string;
  heat?: string;
  distanceMeters?: number;
  startsAt?: string;
  sourceId?: string;
  notes?: string;
};

export type CompetitionBootstrapConfig = {
  competition: {
    slug: string;
    nameJa: string;
    nameRoman?: string;
    nameZh?: string;
    nameEn?: string;
    type?: CompetitionType;
    region?: string;
    websiteUrl?: string;
  };
  sources?: CompetitionBootstrapSource[];
  editions: CompetitionBootstrapEdition[];
  races: CompetitionBootstrapRace[];
};

export async function bootstrapCompetition(prisma: PrismaClient, config: CompetitionBootstrapConfig) {
  const competition = await prisma.competition.upsert({
    where: { slug: config.competition.slug },
    update: config.competition,
    create: config.competition,
  });

  const sourceIds = new Set<string>();
  for (const source of config.sources ?? []) {
    await prisma.source.upsert({
      where: { id: source.id },
      update: {
        name: source.name,
        url: source.url,
        type: source.type,
        reliability: source.reliability ?? 4,
        notes: source.notes,
      },
      create: {
        id: source.id,
        name: source.name,
        url: source.url,
        type: source.type,
        reliability: source.reliability ?? 4,
        notes: source.notes,
      },
    });
    sourceIds.add(source.id);
  }

  const editions = new Map<string, string>();
  for (const edition of config.editions) {
    if (edition.sourceId && !sourceIds.has(edition.sourceId)) {
      throw new Error(`Unknown sourceId on edition ${edition.slug}: ${edition.sourceId}`);
    }

    const normalizedNames = normalizeCompetitionEditionNames({
      competitionSlug: config.competition.slug,
      competitionType: config.competition.type,
      editionNumber: edition.editionNumber,
      officialName: edition.officialName,
      shortName: edition.shortName,
    });

    const saved = await prisma.competitionEdition.upsert({
      where: { slug: edition.slug },
      update: {
        competitionId: competition.id,
        editionNumber: edition.editionNumber,
        year: edition.year,
        ...normalizedNames,
        startsOn: edition.startsOn ? new Date(edition.startsOn) : undefined,
        endsOn: edition.endsOn ? new Date(edition.endsOn) : undefined,
        sourceId: edition.sourceId,
      },
      create: {
        slug: edition.slug,
        competitionId: competition.id,
        editionNumber: edition.editionNumber,
        year: edition.year,
        ...normalizedNames,
        startsOn: edition.startsOn ? new Date(edition.startsOn) : undefined,
        endsOn: edition.endsOn ? new Date(edition.endsOn) : undefined,
        sourceId: edition.sourceId,
      },
    });

    editions.set(edition.slug, saved.id);
  }

  for (const race of config.races) {
    const editionId = editions.get(race.editionSlug);
    if (!editionId) {
      throw new Error(`Unknown editionSlug on race ${race.slug}: ${race.editionSlug}`);
    }
    if (race.sourceId && !sourceIds.has(race.sourceId)) {
      throw new Error(`Unknown sourceId on race ${race.slug}: ${race.sourceId}`);
    }

    await prisma.race.upsert({
      where: { slug: race.slug },
      update: {
        competitionEditionId: editionId,
        name: race.name,
        discipline: race.discipline,
        leg: race.leg,
        round: race.round,
        heat: race.heat,
        distanceMeters: race.distanceMeters,
        startsAt: race.startsAt ? new Date(race.startsAt) : undefined,
        sourceId: race.sourceId,
        notes: race.notes,
        status: DataStatus.pending,
      },
      create: {
        slug: race.slug,
        competitionEditionId: editionId,
        name: race.name,
        discipline: race.discipline,
        leg: race.leg,
        round: race.round,
        heat: race.heat,
        distanceMeters: race.distanceMeters,
        startsAt: race.startsAt ? new Date(race.startsAt) : undefined,
        sourceId: race.sourceId,
        notes: race.notes,
        status: DataStatus.pending,
      },
    });
  }
}
