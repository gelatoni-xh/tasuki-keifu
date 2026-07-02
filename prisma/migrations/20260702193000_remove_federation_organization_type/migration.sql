UPDATE "Organization"
SET "type" = 'club'
WHERE "type" = 'federation';

ALTER TYPE "OrganizationType" RENAME TO "OrganizationType_old";

CREATE TYPE "OrganizationType" AS ENUM (
  'junior_high_school',
  'high_school',
  'university',
  'corporate_team',
  'company',
  'club',
  'organizer'
);

ALTER TABLE "Organization"
ALTER COLUMN "type" TYPE "OrganizationType"
USING ("type"::text::"OrganizationType");

DROP TYPE "OrganizationType_old";
