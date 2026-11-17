-- One-time correction for a unique person under an unconfirmed source label.
BEGIN;
INSERT INTO public."AuditLog" (id,"entityType","entityId",action,"oldValue","newValue","reasonType","reasonNote","actorType",metadata)
VALUES ('gov-ko-matsudo-' || md5('gov_52dbb7050db400a3eeea7a2b0c4f'), 'Person', 'gov_52dbb7050db400a3eeea7a2b0c4f', 'merge',
        jsonb_build_object('personId','gov_52dbb7050db400a3eeea7a2b0c4f'), jsonb_build_object('personId','cmrexay7x0014ndyeqb7wbcu2'),
        'entity_merge', '松戸市陸協仅作为未确认参赛名称；来源只有一名选手且姓名唯一，归并到规范人物，不建立组织或 Membership。', 'system',
        jsonb_build_object('migration','unique-person-under-unconfirmed-organization','canonicalId','cmrexay7x0014ndyeqb7wbcu2'));
UPDATE public."RaceResult" SET "personId"='cmrexay7x0014ndyeqb7wbcu2', "updatedAt"=clock_timestamp() WHERE "personId"='gov_52dbb7050db400a3eeea7a2b0c4f';
UPDATE public."SourceReference" SET "personId"='cmrexay7x0014ndyeqb7wbcu2' WHERE "personId"='gov_52dbb7050db400a3eeea7a2b0c4f';
DELETE FROM public."Person" WHERE id='gov_52dbb7050db400a3eeea7a2b0c4f';
UPDATE governance."GovernanceFinding" f SET "resolutionStatus"='resolved', reason=f.reason || '；未确认组织仅保留参赛名称，来源只有一名选手且姓名唯一，直接归一化人物。'
FROM governance."GovernanceBatch" b JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
WHERE b.id=f."batchId" AND t."requestKey"='nittai333-missing-events-full-apply-1794925316847' AND f."subjectRef"='1211' AND f."resolutionStatus"='unresolved';
WITH remaining AS (
 SELECT jsonb_agg(jsonb_build_object('code',f."findingCode",'reason',f.reason,'subjectRef',f."subjectRef") ORDER BY f."subjectRef") details,count(*)::int n
 FROM governance."GovernanceFinding" f JOIN governance."GovernanceBatch" b ON b.id=f."batchId" JOIN governance."EventImportTask" t ON t.id=b."eventTaskId"
 WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847' AND f."resolutionStatus"='unresolved')
UPDATE governance."EventImportTask" t SET summary=jsonb_set(jsonb_set(jsonb_set(t.summary,'{unresolved}',to_jsonb(remaining.n),true),'{observability,unresolvedFindings}',to_jsonb(remaining.n),true),'{unresolvedDetails}',COALESCE(remaining.details,'[]'::jsonb),true) FROM remaining WHERE t."requestKey"='nittai333-missing-events-full-apply-1794925316847';
COMMIT;
