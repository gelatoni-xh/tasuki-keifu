-- Run as DB administrator after main migrations and checkpoint setup.
-- psql ... -v runtime_role=... -v business_reader=... -v site_reader=... -f this-file
-- Roles/passwords are provisioned outside source control. No role gains UserFeedback access.
GRANT USAGE ON SCHEMA public, governance, governance_checkpoint TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA governance, governance_checkpoint TO :"runtime_role";
GRANT SELECT ON public."Person",public."Organization",public."Membership",public."PersonalBest",public."Source",public."SourceReference",public."NameVariant",public."Race",public."RaceResult",public."CompetitionEdition",public."TeamCompetitionResult",public."TeamCompetitionLegSnapshot",public."CacheInvalidation",public."PlayerRelationCache",public."AuditLog" TO :"runtime_role";
GRANT INSERT, UPDATE, DELETE ON public."Person",public."Organization",public."Membership",public."PersonalBest",public."SourceReference",public."NameVariant",public."RaceResult",public."TeamCompetitionResult",public."TeamCompetitionLegSnapshot",public."CacheInvalidation",public."PlayerRelationCache",public."AuditLog" TO :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"business_reader";
GRANT SELECT ON public."Person",public."Organization",public."Membership",public."PersonalBest",public."Source",public."SourceReference",public."NameVariant",public."Race",public."RaceResult",public."CompetitionEdition",public."TeamCompetitionResult" TO :"business_reader";
GRANT USAGE ON SCHEMA governance TO :"site_reader";
GRANT SELECT ON governance."EventImportTask",governance."GovernanceBatch",governance."BatchAttempt",governance."AgentExecution",governance."GovernanceFinding",governance."GovernanceChange",governance."NotificationDelivery" TO :"site_reader";
