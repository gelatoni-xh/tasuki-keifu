-- One-time production correction for the final two identity findings.
BEGIN;

CREATE TEMP TABLE person_merges (
  duplicate_id text PRIMARY KEY,
  canonical_id text NOT NULL,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO person_merges VALUES
  ('cmrkdy7cf0009lnyedlc5cmqo', 'cmr1s16q300296uye2qka4aga', '同假名、同法政大学履历，姓名缺少崎字，归并到野﨑翔太郎。'),
  ('gov_4b32a556823502dcde9506e78e40', 'cmr1s16q300296uye2qka4aga', '2189与规范人物的假名、所属、履历和成绩连续，来源姓名为缺字变体。');

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
SELECT 'gov-ko-2189-' || md5(pm.duplicate_id), 'Person', pm.duplicate_id, 'merge',
       jsonb_build_object('personId',pm.duplicate_id), jsonb_build_object('personId',pm.canonical_id),
       'entity_merge', pm.note, 'system', jsonb_build_object('migration','ko-2189-and-2352','canonicalId',pm.canonical_id)
FROM person_merges pm;

UPDATE public."RaceResult" rr SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp()
FROM person_merges pm WHERE rr."personId"=pm.duplicate_id;
UPDATE public."Membership" m SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp()
FROM person_merges pm WHERE m."personId"=pm.duplicate_id;
UPDATE public."PersonalBest" pb SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp()
FROM person_merges pm WHERE pb."personId"=pm.duplicate_id;
UPDATE public."SourceReference" sr SET "personId"=pm.canonical_id
FROM person_merges pm WHERE sr."personId"=pm.duplicate_id;
UPDATE public."NameVariant" nv SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp()
FROM person_merges pm WHERE nv."personId"=pm.duplicate_id;
DELETE FROM public."PlayerRelationCache" c USING person_merges pm WHERE c."personId"=pm.duplicate_id;
DELETE FROM public."Person" p USING person_merges pm WHERE p.id=pm.duplicate_id;

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
VALUES ('gov-ko-2352-' || md5('gov_2d50dc436dec3d00f9a73b61a223'), 'Person', 'gov_2d50dc436dec3d00f9a73b61a223', 'verify',
        jsonb_build_object('displayNameJa','佐藤広人','decision','unresolved'),
        jsonb_build_object('displayNameJa','佐藤広人','decision','independent_person'),
        'verification_update', '与佐藤大翔仅同读音但所属冲突，与佐藤広知假名不同；保留为独立人物。', 'system',
        jsonb_build_object('migration','ko-2189-and-2352','decision','create-independent-person'));

UPDATE governance."GovernanceFinding" f
SET "resolutionStatus"='resolved', reason=f.reason || '；已按复核结论完成归并或建立独立人物。'
FROM governance."GovernanceBatch" b
JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
WHERE b.id=f."batchId" AND t."requestKey"='nittai333-missing-events-full-apply-1794925316847'
  AND f."subjectRef" IN ('2189','2352') AND f."resolutionStatus"='unresolved';

WITH remaining AS (
  SELECT jsonb_agg(jsonb_build_object('code',f."findingCode",'reason',f.reason,'subjectRef',f."subjectRef") ORDER BY f."subjectRef") details,
         count(*)::int n
  FROM governance."GovernanceFinding" f
  JOIN governance."GovernanceBatch" b ON b.id=f."batchId"
  JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
  WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847' AND f."resolutionStatus"='unresolved'
)
UPDATE governance."EventImportTask" t
SET summary=jsonb_set(jsonb_set(jsonb_set(t.summary,'{unresolved}',to_jsonb(remaining.n),true),'{observability,unresolvedFindings}',to_jsonb(remaining.n),true),'{unresolvedDetails}',COALESCE(remaining.details,'[]'::jsonb),true)
FROM remaining WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847';

COMMIT;
