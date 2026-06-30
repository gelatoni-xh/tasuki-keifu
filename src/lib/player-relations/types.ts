import type { CompetitionType, OrganizationType } from "@prisma/client";

export type RelationReasonType = "direct_matchup" | "teammate_overlap" | "frequent_same_stage";

export type RelationStageKey = "high_school" | "university" | "corporate_team";

export type RelationReason =
  | {
      type: "direct_matchup";
      kind: "ekiden";
      count: number;
      priority: number;
    }
  | {
      type: "direct_matchup";
      kind: "cross_stage";
      count: number;
      stages: RelationStageKey[];
      priority: number;
    }
  | {
      type: "direct_matchup";
      kind: "same_stage";
      count: number;
      priority: number;
    }
  | {
      type: "direct_matchup";
      kind: "latest_competition";
      competitionName: string;
      priority: number;
    }
  | {
      type: "teammate_overlap";
      kind: "overlap_years";
      years: number;
      priority: number;
    }
  | {
      type: "teammate_overlap";
      kind: "shared_editions";
      editions: string[];
      priority: number;
    }
  | {
      type: "frequent_same_stage";
      kind: "repeat_stage";
      stage: RelationStageKey | null;
      count: number;
      priority: number;
    };

export type RelationSummary = {
  directMatchupCount: number;
  teammateOverlapYears: number | null;
  sameStageMeetCount: number;
};

export type PlayerRelationEntry = {
  relatedPersonId: string;
  relationScore: number;
  reasons: RelationReason[];
  summary: RelationSummary;
  lastRelatedAt: string | null;
};

export type PlayerRelationCachePayload = {
  personId: string;
  generatedAt: string;
  topRelations: PlayerRelationEntry[];
};

export type DirectMatchupSourceItem = {
  raceId: string;
  raceName: string;
  leg: number | null;
  startsAt: Date | null;
  competitionType: CompetitionType | null;
  competitionName: string;
};

export type DirectMatchupAggregate = {
  relatedPersonId: string;
  count: number;
  ekidenCount: number;
  stages: Set<RelationStageKey>;
  races: DirectMatchupSourceItem[];
};

export type TeammateAggregate = {
  relatedPersonId: string;
  overlapYears: number;
  sharedEditionLabels: string[];
  organizationTypes: Set<OrganizationType>;
};

export type FrequentStageAggregate = {
  relatedPersonId: string;
  count: number;
  stages: Set<RelationStageKey>;
};
