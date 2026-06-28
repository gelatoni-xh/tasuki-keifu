-- CreateEnum
CREATE TYPE "DataStatus" AS ENUM ('verified', 'pending', 'conflicting', 'missing');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('athlete', 'coach', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('junior_high_school', 'high_school', 'university', 'corporate_team', 'company', 'club', 'federation', 'organizer');

-- CreateEnum
CREATE TYPE "MembershipType" AS ENUM ('origin', 'enrolled', 'affiliated', 'graduated', 'staff');

-- CreateEnum
CREATE TYPE "NameVariantType" AS ENUM ('official', 'short', 'kana', 'romanized', 'chinese', 'english', 'former', 'media');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('university_official', 'hakone_official', 'ntv', 'jaaf', 'rikujokyogi_magazine', 'data_site', 'fan_site', 'pdf', 'manual');

-- CreateEnum
CREATE TYPE "EventDiscipline" AS ENUM ('m1500', 'm3000', 'm3000sc', 'm5000', 'm10000', 'ten_mile', 'half_marathon', 'marathon', 'ekiden_leg');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayNameJa" TEXT NOT NULL,
    "displayNameKana" TEXT,
    "displayNameRoman" TEXT,
    "displayNameZh" TEXT,
    "displayNameEn" TEXT,
    "birthDate" TIMESTAMP(3),
    "hometown" TEXT,
    "nationality" TEXT,
    "registeredPrefecture" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "type" "PersonType" NOT NULL DEFAULT 'athlete',
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameKana" TEXT,
    "nameRoman" TEXT,
    "nameZh" TEXT,
    "nameEn" TEXT,
    "shortName" TEXT,
    "type" "OrganizationType" NOT NULL,
    "location" TEXT,
    "prefecture" TEXT,
    "country" TEXT NOT NULL DEFAULT 'JP',
    "websiteUrl" TEXT,
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "MembershipType" NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "grade" INTEGER,
    "faculty" TEXT,
    "department" TEXT,
    "cohort" TEXT,
    "role" TEXT,
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalBest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "discipline" "EventDiscipline" NOT NULL,
    "mark" TEXT NOT NULL,
    "markMillis" INTEGER,
    "achievedOn" TIMESTAMP(3),
    "competitionName" TEXT,
    "venue" TEXT,
    "organizationId" TEXT,
    "stage" TEXT,
    "isHighSchoolPb" BOOLEAN NOT NULL DEFAULT false,
    "isCollegePb" BOOLEAN NOT NULL DEFAULT false,
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalBest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameKana" TEXT,
    "nameRoman" TEXT,
    "nameZh" TEXT,
    "nameEn" TEXT,
    "type" TEXT,
    "organizer" TEXT,
    "region" TEXT,
    "websiteUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEdition" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "editionNumber" INTEGER,
    "year" INTEGER NOT NULL,
    "officialName" TEXT NOT NULL,
    "shortName" TEXT,
    "startsOn" TIMESTAMP(3),
    "endsOn" TIMESTAMP(3),
    "notes" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceResult" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT,
    "competitionEditionId" TEXT NOT NULL,
    "discipline" "EventDiscipline" NOT NULL DEFAULT 'ekiden_leg',
    "leg" INTEGER,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "isRaceDayChange" BOOLEAN NOT NULL DEFAULT false,
    "mark" TEXT,
    "markMillis" INTEGER,
    "legRank" INTEGER,
    "teamRank" INTEGER,
    "gradeAtRace" INTEGER,
    "status" "DataStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "type" "SourceType" NOT NULL,
    "publishedOn" TIMESTAMP(3),
    "accessedOn" TIMESTAMP(3),
    "reliability" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NameVariant" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "language" TEXT,
    "type" "NameVariantType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "personId" TEXT,
    "organizationId" TEXT,
    "competitionId" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NameVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_slug_key" ON "Person"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_personId_idx" ON "Membership"("personId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_type_idx" ON "Membership"("type");

-- CreateIndex
CREATE INDEX "PersonalBest_personId_idx" ON "PersonalBest"("personId");

-- CreateIndex
CREATE INDEX "PersonalBest_discipline_idx" ON "PersonalBest"("discipline");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEdition_slug_key" ON "CompetitionEdition"("slug");

-- CreateIndex
CREATE INDEX "CompetitionEdition_competitionId_idx" ON "CompetitionEdition"("competitionId");

-- CreateIndex
CREATE INDEX "CompetitionEdition_year_idx" ON "CompetitionEdition"("year");

-- CreateIndex
CREATE INDEX "RaceResult_personId_idx" ON "RaceResult"("personId");

-- CreateIndex
CREATE INDEX "RaceResult_organizationId_idx" ON "RaceResult"("organizationId");

-- CreateIndex
CREATE INDEX "RaceResult_competitionEditionId_idx" ON "RaceResult"("competitionEditionId");

-- CreateIndex
CREATE INDEX "RaceResult_leg_idx" ON "RaceResult"("leg");

-- CreateIndex
CREATE INDEX "NameVariant_value_idx" ON "NameVariant"("value");

-- CreateIndex
CREATE INDEX "NameVariant_personId_idx" ON "NameVariant"("personId");

-- CreateIndex
CREATE INDEX "NameVariant_organizationId_idx" ON "NameVariant"("organizationId");

-- CreateIndex
CREATE INDEX "NameVariant_competitionId_idx" ON "NameVariant"("competitionId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalBest" ADD CONSTRAINT "PersonalBest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalBest" ADD CONSTRAINT "PersonalBest_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_competitionEditionId_fkey" FOREIGN KEY ("competitionEditionId") REFERENCES "CompetitionEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameVariant" ADD CONSTRAINT "NameVariant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameVariant" ADD CONSTRAINT "NameVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameVariant" ADD CONSTRAINT "NameVariant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameVariant" ADD CONSTRAINT "NameVariant_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
