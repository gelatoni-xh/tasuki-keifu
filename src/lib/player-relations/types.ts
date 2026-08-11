import type { CompetitionType, EventDiscipline, OrganizationType } from "@prisma/client";

export type RelationStageKey = "junior_high_school" | "high_school" | "university" | "corporate_team";

export type PlayerRelationContext = {
  sameHometown: boolean;
  sharedOrigins: {
    juniorHighSchool: boolean;
    highSchool: boolean;
    university: boolean;
    corporateTeam: boolean;
  };
  teamOverlapYears: {
    juniorHighSchool?: number;
    highSchool?: number;
    university?: number;
  };
  sharedTeamStages: RelationStageKey[];
  sharedHometown: boolean;
  sharedHighSchool: boolean;
  sharedUniversity: boolean;
};

export type PlayerRelationSignals = {
  matchupCount: number;
  matchupYearCount: number;
  stageCount: number;
  ekidenCount: number;
  latestMatchAt: string | null;
};

export type PlayerRelationLabelItem = {
  label: string;
  contribution: number;
};

export type PlayerRelationLabels = {
  info: PlayerRelationLabelItem[];
  matchup: PlayerRelationLabelItem[];
};

export type PlayerRelationEntry = {
  relatedPersonId: string;
  matchupCount: number;
  matchupSignals: PlayerRelationSignals;
  labels: PlayerRelationLabels;
  rawScore: number;
  displayScore: number;
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
  competitionEditionStartsOn: Date | null;
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
  sameHometown: boolean;
  sharedOrigins: {
    juniorHighSchool: boolean;
    highSchool: boolean;
    university: boolean;
    corporateTeam: boolean;
  };
  teamOverlapYears: {
    juniorHighSchool?: number;
    highSchool?: number;
    university?: number;
  };
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
    juniorHigh: number;
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
