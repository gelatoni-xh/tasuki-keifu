-- Person list and admin filtering
CREATE INDEX "Person_status_updatedAt_idx" ON "Person"("status", "updatedAt");
CREATE INDEX "Person_type_status_idx" ON "Person"("type", "status");
CREATE INDEX "Person_hometown_idx" ON "Person"("hometown");

-- Membership overlap and teammate lookups
CREATE INDEX "Membership_personId_organizationId_idx" ON "Membership"("personId", "organizationId");
CREATE INDEX "Membership_organizationId_personId_idx" ON "Membership"("organizationId", "personId");
CREATE INDEX "Membership_organizationId_startYear_endYear_idx" ON "Membership"("organizationId", "startYear", "endYear");
CREATE INDEX "Membership_personId_startDate_endDate_idx" ON "Membership"("personId", "startDate", "endDate");

-- Competition edition page race ordering
CREATE INDEX "Race_competitionEditionId_leg_startsAt_idx" ON "Race"("competitionEditionId", "leg", "startsAt");
CREATE INDEX "Race_competitionEditionId_startsAt_idx" ON "Race"("competitionEditionId", "startsAt");

-- Race result detail and player relation lookups
CREATE INDEX "RaceResult_raceId_personId_idx" ON "RaceResult"("raceId", "personId");
CREATE INDEX "RaceResult_personId_raceId_idx" ON "RaceResult"("personId", "raceId");
CREATE INDEX "RaceResult_organizationId_personId_idx" ON "RaceResult"("organizationId", "personId");
CREATE INDEX "RaceResult_raceId_rank_idx" ON "RaceResult"("raceId", "rank");
CREATE INDEX "RaceResult_raceId_markMillis_idx" ON "RaceResult"("raceId", "markMillis");
