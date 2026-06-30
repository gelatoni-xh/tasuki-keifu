-- PersonType: remove manager and merge into staff
ALTER TYPE "PersonType" RENAME TO "PersonType_old";
CREATE TYPE "PersonType" AS ENUM ('athlete', 'coach', 'staff');

ALTER TABLE "Person"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "PersonType"
  USING (
    CASE
      WHEN "type"::text = 'manager' THEN 'staff'
      ELSE "type"::text
    END
  )::"PersonType",
  ALTER COLUMN "type" SET DEFAULT 'athlete';

DROP TYPE "PersonType_old";

-- MembershipRole: convert free-text role into enum
CREATE TYPE "MembershipRole" AS ENUM ('athlete', 'coach', 'staff');

ALTER TABLE "Membership"
  ALTER COLUMN "role" DROP DEFAULT;

UPDATE "Membership"
SET "role" = CASE
  WHEN "role" IS NULL OR btrim("role") = '' THEN 'athlete'
  WHEN lower("role") = 'manager' THEN 'staff'
  WHEN lower("role") IN ('athlete', 'coach', 'staff') THEN lower("role")
  ELSE 'staff'
END;

ALTER TABLE "Membership"
  ALTER COLUMN "role" TYPE "MembershipRole" USING "role"::"MembershipRole",
  ALTER COLUMN "role" SET DEFAULT 'athlete',
  ALTER COLUMN "role" SET NOT NULL;

CREATE INDEX "Membership_role_idx" ON "Membership"("role");

-- CompetitionType: convert free-text series type into enum
CREATE TYPE "CompetitionType" AS ENUM (
  'university_ekiden',
  'high_school_ekiden',
  'corporate_ekiden',
  'mixed_ekiden',
  'track_meet',
  'road_race',
  'marathon'
);

ALTER TABLE "Competition"
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "type" TYPE "CompetitionType"
  USING (
    CASE
      WHEN "type" IS NULL THEN NULL
      WHEN "type" IN (
        'university_ekiden',
        'high_school_ekiden',
        'corporate_ekiden',
        'mixed_ekiden',
        'track_meet',
        'road_race',
        'marathon'
      ) THEN "type"
      WHEN "type" = 'road_half_marathon' THEN 'road_race'
      WHEN "type" = 'road_marathon' THEN 'marathon'
      ELSE NULL
    END
  )::"CompetitionType";

-- Team-level ekiden result tables
CREATE TABLE "TeamCompetitionResult" (
  "id" TEXT NOT NULL,
  "competitionEditionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "finalRank" INTEGER,
  "finalMark" TEXT,
  "finalMarkMillis" INTEGER,
  "status" "DataStatus" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeamCompetitionResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamCompetitionLegSnapshot" (
  "id" TEXT NOT NULL,
  "teamCompetitionResultId" TEXT NOT NULL,
  "leg" INTEGER NOT NULL,
  "cumulativeRank" INTEGER,
  "cumulativeMark" TEXT,
  "cumulativeMarkMillis" INTEGER,
  "gapFromLeader" TEXT,
  "gapFromLeaderMillis" INTEGER,
  "status" "DataStatus" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeamCompetitionLegSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamCompetitionResult_competitionEditionId_organizationId_key"
  ON "TeamCompetitionResult"("competitionEditionId", "organizationId");
CREATE INDEX "TeamCompetitionResult_competitionEditionId_finalRank_idx"
  ON "TeamCompetitionResult"("competitionEditionId", "finalRank");
CREATE INDEX "TeamCompetitionResult_organizationId_competitionEditionId_idx"
  ON "TeamCompetitionResult"("organizationId", "competitionEditionId");

CREATE UNIQUE INDEX "TeamCompetitionLegSnapshot_teamCompetitionResultId_leg_key"
  ON "TeamCompetitionLegSnapshot"("teamCompetitionResultId", "leg");
CREATE INDEX "TeamCompetitionLegSnapshot_leg_cumulativeRank_idx"
  ON "TeamCompetitionLegSnapshot"("leg", "cumulativeRank");

ALTER TABLE "TeamCompetitionResult"
  ADD CONSTRAINT "TeamCompetitionResult_competitionEditionId_fkey"
  FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCompetitionResult"
  ADD CONSTRAINT "TeamCompetitionResult_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCompetitionResult"
  ADD CONSTRAINT "TeamCompetitionResult_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeamCompetitionLegSnapshot"
  ADD CONSTRAINT "TeamCompetitionLegSnapshot_teamCompetitionResultId_fkey"
  FOREIGN KEY ("teamCompetitionResultId") REFERENCES "TeamCompetitionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamCompetitionLegSnapshot"
  ADD CONSTRAINT "TeamCompetitionLegSnapshot_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
