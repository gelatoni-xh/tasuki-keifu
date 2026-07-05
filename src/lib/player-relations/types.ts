import type { CompetitionType, EventDiscipline, OrganizationType } from "@prisma/client";

export type RelationStageKey = "high_school" | "university" | "corporate_team";

export type PlayerRelationContext = {
  sharedTeamStages: RelationStageKey[];
  sharedHometown: boolean;
  sharedHighSchool: boolean;
  sharedUniversity: boolean;
};

export type PlayerRelationEntry = {
  relatedPersonId: string;
  matchupCount: number;
  latestMatchAt: string | null;
  latestCompetitionEditionId: string | null;
  latestCompetitionName: string | null;
  stageCount: number;
  hasHeadToHeadDetail: boolean;
  context: PlayerRelationContext;
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
  competitionEditionId: string | null;
  competitionType: CompetitionType | null;
  competitionName: string;
  discipline: EventDiscipline;
};

export type DirectMatchupAggregate = {
  relatedPersonId: string;
  count: number;
  ekidenCount: number;
  stages: Set<RelationStageKey>;
  races: DirectMatchupSourceItem[];
};

export type PlayerRelationContextAggregate = {
  relatedPersonId: string;
  sharedTeamStages: Set<RelationStageKey>;
  sharedHometown: boolean;
  sharedHighSchool: boolean;
  sharedUniversity: boolean;
};

export type MembershipWindow = {
  organizationId: string;
  organizationType: OrganizationType;
  startDate: Date | null;
  endDate: Date | null;
  startYear: number | null;
  endYear: number | null;
};

export type HeadToHeadComparisonStatus = "left_ahead" | "right_ahead" | "tie" | "not_comparable";

export type HeadToHeadSummary = {
  matchupCount: number;
  leftAheadCount: number;
  rightAheadCount: number;
  tieCount: number;
  comparableCount: number;
  ekidenMatchupCount: number;
  firstMatchAt: string | null;
  latestMatchAt: string | null;
  stageCounts: {
    highSchool: number;
    university: number;
    corporateTeam: number;
  };
};

export type HeadToHeadMatch = {
  raceId: string;
  raceResultLeftId: string;
  raceResultRightId: string;
  raceDate: string | null;
  competitionEditionId: string | null;
  competitionName: string;
  raceName: string;
  stage: RelationStageKey | null;
  discipline: EventDiscipline | null;
  isEkiden: boolean;
  left: {
    personId: string;
    rank: number | null;
    mark: string | null;
    markMillis: number | null;
    notes: string | null;
  };
  right: {
    personId: string;
    rank: number | null;
    mark: string | null;
    markMillis: number | null;
    notes: string | null;
  };
  comparison: {
    status: HeadToHeadComparisonStatus;
    rankDiff: number | null;
    markDiffMillis: number | null;
  };
};

export type PlayerHeadToHeadPayload = {
  pairKey: string;
  leftPersonId: string;
  rightPersonId: string;
  generatedAt: string;
  summary: HeadToHeadSummary;
  context: PlayerRelationContext;
  matches: HeadToHeadMatch[];
};
