-- One-time migration for the retired unknown/club/company organization types.
-- Run against the production database only after taking a database backup.
BEGIN;
CREATE TEMP TABLE legacy_orgs ON COMMIT DROP AS
SELECT id, "nameJa", type
FROM public."Organization"
WHERE type IN ('unknown', 'club', 'company');

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"fieldName","oldValue","newValue","reasonType","reasonNote","actorType",metadata)
SELECT 'gov-cleanup-' || md5(rr.id), 'RaceResult', rr.id, 'update', 'organizationId',
       to_jsonb(rr."organizationId"), jsonb_build_object('organizationId',NULL,'organizationNameSnapshot',o."nameJa"),
       'system', '下线 unknown/club/company 组织；保留来源参赛名称快照', 'system',
       jsonb_build_object('migration','legacy-unconfirmed-organizations','organizationId',o.id)
FROM public."RaceResult" rr
JOIN legacy_orgs o ON o.id=rr."organizationId";

UPDATE public."RaceResult" rr
SET "organizationNameSnapshot" = COALESCE(rr."organizationNameSnapshot", o."nameJa"),
    "organizationId" = NULL,
    "updatedAt" = clock_timestamp()
FROM legacy_orgs o
WHERE rr."organizationId" = o.id;

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
SELECT 'gov-cleanup-org-' || md5(o.id), 'Organization', o.id, 'delete',
       jsonb_build_object('nameJa',o."nameJa",'type',o.type::text), NULL,
       'system', '下线未确认组织类型；参赛名称已保留在 RaceResult.organizationNameSnapshot', 'system',
       jsonb_build_object('migration','legacy-unconfirmed-organizations')
FROM legacy_orgs o;

DELETE FROM public."Membership" m USING legacy_orgs o WHERE m."organizationId"=o.id;
UPDATE public."SourceReference" sr SET "organizationId"=NULL WHERE sr."organizationId" IN (SELECT id FROM legacy_orgs);
UPDATE public."NameVariant" nv SET "organizationId"=NULL WHERE nv."organizationId" IN (SELECT id FROM legacy_orgs);
DELETE FROM public."Organization" o USING legacy_orgs x WHERE o.id=x.id;
COMMIT;
