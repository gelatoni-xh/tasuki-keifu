-- One-time production data correction from the local heavy review.
-- This script merges only confirmed duplicate/person records and refreshes the
-- governance summary; the remaining findings stay unresolved.
BEGIN;
CREATE TEMP TABLE person_merges (duplicate_id text PRIMARY KEY, canonical_id text NOT NULL, note text) ON COMMIT DROP;
INSERT INTO person_merges VALUES
 ('gov_508916867a027b4e5afc7fb8a7ee','cmri1il9j0005smmq6vt4b1ts','小川心徠官方资料统一读音为オガワ ミライ'),
 ('gov_5164437ecbd65dc729a83f257bd4','cmrnfyut7002ptvye4f0mxgvg','渡邊颯汰姓名和东京国际大学所属一致'),
 ('cmrgkpdij0047u9ye2m1fme75','cmrkdzfn00005njye51r99x30','ガユ・サミュエル姓名顺序不同且履历连续'),
 ('cmrgeifff002hddyes606dqmh','cmr1s16q300296uye2qka4aga','野崎翔太郎与野﨑翔太郎同音同大学，归并存量重复档案');

INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
SELECT 'gov-ko-merge-' || md5(pm.duplicate_id), 'Person', pm.duplicate_id, 'merge',
       jsonb_build_object('personId',pm.duplicate_id), jsonb_build_object('personId',pm.canonical_id),
       'entity_merge', pm.note, 'system', jsonb_build_object('migration','local-heavy-review-ko','canonicalId',pm.canonical_id)
FROM person_merges pm;

UPDATE public."RaceResult" rr SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE rr."personId"=pm.duplicate_id;
UPDATE public."Membership" m SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE m."personId"=pm.duplicate_id;
UPDATE public."PersonalBest" pb SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE pb."personId"=pm.duplicate_id;
UPDATE public."SourceReference" sr SET "personId"=pm.canonical_id FROM person_merges pm WHERE sr."personId"=pm.duplicate_id;
UPDATE public."NameVariant" nv SET "personId"=pm.canonical_id, "updatedAt"=clock_timestamp() FROM person_merges pm WHERE nv."personId"=pm.duplicate_id;
DELETE FROM public."PlayerRelationCache" c USING person_merges pm WHERE c."personId"=pm.duplicate_id;
DELETE FROM public."Person" p USING person_merges pm WHERE p.id=pm.duplicate_id;
UPDATE public."Person" SET "displayNameKana"='オガワ ミライ', "updatedAt"=clock_timestamp() WHERE id='cmri1il9j0005smmq6vt4b1ts';

UPDATE governance."GovernanceFinding" f
SET "resolutionStatus"='resolved', reason=f.reason || '；本地重型复核确认：' || x.note
FROM governance."GovernanceBatch" b
JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
CROSS JOIN (VALUES
 ('1383','小川心徠官方资料统一读音为オガワ ミライ，归并到现有规范人物。'),
 ('明治大学','明治大学官方资料支持小川心徠读音为オガワ ミライ。'),
 ('東京国際大学','渡邊颯汰与当前所属一致，渡邉奏太为不同姓名和不同履历。'),
 ('専修大学','两个ガユ・サミュエル档案为姓名顺序差异，连续履历支持归并。')
) AS x(subject_ref,note)
WHERE b.id=f."batchId" AND t."requestKey"='nittai333-missing-events-full-apply-1794925316847'
  AND x.subject_ref=f."subjectRef" AND f."resolutionStatus"='unresolved';

WITH remaining AS (
  SELECT jsonb_agg(jsonb_build_object('code',f."findingCode",'reason',f.reason,'subjectRef',f."subjectRef") ORDER BY f."subjectRef") details, count(*)::int n
  FROM governance."GovernanceFinding" f
  JOIN governance."GovernanceBatch" b ON b.id=f."batchId"
  JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
  WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847' AND f."resolutionStatus"='unresolved'
)
UPDATE governance."EventImportTask" t
SET summary=jsonb_set(jsonb_set(jsonb_set(t.summary,'{unresolved}',to_jsonb(remaining.n),true),'{observability,unresolvedFindings}',to_jsonb(remaining.n),true),'{unresolvedDetails}',COALESCE(remaining.details,'[]'::jsonb),true)
FROM remaining WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847';
COMMIT;
