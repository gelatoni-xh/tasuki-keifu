-- One-time follow-up for the 333rd Nittai event governance task.
-- These records were blocked only because the source organization was unknown;
-- the retired organization contract makes them independent person observations.
BEGIN;
CREATE TEMP TABLE person_merges (duplicate_id text, canonical_id text, note text) ON COMMIT DROP;
INSERT INTO person_merges VALUES
 ('gov_fe608e99e0128fbd829436daa422','cmri6t2id000duqt97j38nx0g','组织未确认，姓名与既有规范人物一致'),
 ('gov_05a4f28cfe48b50ce5b7051b9888','cmvzox9gl019tczpa5bqh3mz6','组织未确认，姓名与既有规范人物一致'),
 ('gov_f1a819b365a0de5501036fa10c01','cmri3084n000dvdmq92qdbjpo','组织未确认，姓名与既有规范人物一致'),
 ('gov_65797a08155728c18c70e4a1baf8','cmri3y81w000dq5mquz6if9hr','组织未确认，姓名与既有规范人物一致'),
 ('gov_2a7053fa7413151d6e2621a37fe7','cmri3xx160001jpmqsljmvbik','组织未确认，姓名与既有规范人物一致'),
 ('gov_8b0b59626705b2343bd7eb0a3511','gov_45aa74839c497335babf1dba4183','同名 provisional 档案归并为一个独立人物');

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
SELECT 'gov-person-merge-' || md5(pm.duplicate_id), 'Person', pm.duplicate_id, 'merge',
       jsonb_build_object('personId',pm.duplicate_id), jsonb_build_object('personId',pm.canonical_id),
       'entity_merge', pm.note, 'system', jsonb_build_object('migration','retired-organization-resolution')
FROM person_merges pm;

UPDATE public."RaceResult" rr SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE rr."personId"=pm.duplicate_id;
UPDATE public."Membership" m SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE m."personId"=pm.duplicate_id;
UPDATE public."PersonalBest" pb SET "personId"=pm.canonical_id FROM person_merges pm WHERE pb."personId"=pm.duplicate_id;
UPDATE public."SourceReference" sr SET "personId"=pm.canonical_id FROM person_merges pm WHERE sr."personId"=pm.duplicate_id;
UPDATE public."NameVariant" nv SET "personId"=pm.canonical_id FROM person_merges pm WHERE nv."personId"=pm.duplicate_id;
DELETE FROM public."PlayerRelationCache" prc USING person_merges pm WHERE prc."personId"=pm.duplicate_id;
DELETE FROM public."Person" p USING person_merges pm WHERE p.id=pm.duplicate_id;

UPDATE governance."GovernanceFinding" f
SET "resolutionStatus"='resolved',
    reason=f.reason || '；按新契约：unknown/club/company 仅保留参赛名称，不要求组织或 Membership 归一化。'
FROM governance."GovernanceBatch" b
JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
WHERE b.id=f."batchId"
  AND t."requestKey"='nittai333-missing-events-full-apply-1794925316847'
  AND f."subjectRef" IN ('愛知陸協','明星学園','伊勢赤十字病院','東京陸協','東京陸橋','明治大学陸上同好会','2261','1110','1578','2246','2372','2373','2374','2376','2377')
  AND f."resolutionStatus"='unresolved';

WITH remaining AS (
  SELECT jsonb_agg(jsonb_build_object('code',f."findingCode",'reason',f.reason,'subjectRef',f."subjectRef") ORDER BY f."subjectRef") details, count(*)::int n
  FROM governance."GovernanceFinding" f
  JOIN governance."GovernanceBatch" b ON b.id=f."batchId"
  JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
  WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847' AND f."resolutionStatus"='unresolved'
)
UPDATE governance."EventImportTask" t
SET summary=jsonb_set(jsonb_set(jsonb_set(t.summary,'{unresolved}',to_jsonb(remaining.n),true),'{observability,unresolvedFindings}',to_jsonb(remaining.n),true),'{unresolvedDetails}',COALESCE(remaining.details,'[]'::jsonb),true)
FROM remaining
WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847';
COMMIT;
