import "server-only";
import postgres from "postgres";

type Json = Record<string, unknown>;
export type GovernanceOverview = {
  source: "configured" | "missing" | "error";
  tasks: Array<{
    id: string;
    mode: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    summary: Json | null;
  }>;
  selectedTaskId: string | null;
  batches: Array<{
    id: string;
    unitType: string;
    unitKey: string;
    sequence: number;
    status: string;
    summary: Json | null;
    currentNode: string | null;
  }>;
  agents: Array<{
    id: string;
    batchId: string;
    agentKey: string;
    agentVersion: string;
    status: string;
    metrics: Json | null;
  }>;
  findings: Array<{
    id: string;
    batchId: string;
    findingCode: string;
    subjectRef: string;
    severity: string;
    resolutionStatus: string;
    reason: string;
    evidence: Array<{ url?: string; quote?: string }>;
  }>;
  notifications: Array<{
    id: string;
    batchId: string | null;
    kind: string;
    status: string;
    attemptCount: number;
    sentAt: string | null;
    errorMessage: string | null;
  }>;
  changes: Array<{
    id: string;
    batchId: string;
    operation: string;
    entityRef: string;
    status: string;
    businessAuditRef: string | null;
    reason: string | null;
    diff: { before: unknown; after: unknown } | null;
  }>;
};
let db: ReturnType<typeof postgres> | null = null;
export async function getObservabilityOverview(
  taskId?: string,
): Promise<GovernanceOverview> {
  const empty: GovernanceOverview = {
    source: "missing",
    tasks: [],
    selectedTaskId: null,
    batches: [],
    agents: [],
    findings: [],
    changes: [],
    notifications: [],
  };
  const url = process.env.TASUKI_GOVERNANCE_READ_DATABASE_URL?.trim();
  if (!url) return empty;
  if (!db)
    db = postgres(url, {
      max: 2,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false,
      connection: { application_name: "tasuki-keifu-governance-readonly" },
    });
  try {
    // Explicit projection: never expose inputManifest, payload references, prompt/state, or patches.
    const tasks = await db<
      GovernanceOverview["tasks"]
    >`SELECT id,mode,status,"createdAt","completedAt",summary FROM governance."EventImportTask" ORDER BY "createdAt" DESC LIMIT 20`;
    const selected =
      taskId && /^[0-9a-f-]{36}$/i.test(taskId) ? taskId : tasks[0]?.id;
    if (!selected) return { ...empty, source: "configured", tasks };
    const [batches, agents, findings, changes, notifications] =
      await Promise.all([
        db<
          GovernanceOverview["batches"]
        >`SELECT b.id,b."unitType",b."unitKey",b.sequence,b.status,b.summary,(SELECT a.metrics->>'currentNode' FROM governance."BatchAttempt" a WHERE a."batchId"=b.id ORDER BY a."attemptNo" DESC LIMIT 1) AS "currentNode" FROM governance."GovernanceBatch" b WHERE b."eventTaskId"=${selected} ORDER BY b.sequence LIMIT 300`,
        db<
          GovernanceOverview["agents"]
        >`SELECT a.id,t."batchId",a."agentKey",a."agentVersion",a.status,a.metrics FROM governance."AgentExecution" a JOIN governance."BatchAttempt" t ON t.id=a."batchAttemptId" JOIN governance."GovernanceBatch" b ON b.id=t."batchId" WHERE b."eventTaskId"=${selected} ORDER BY a."startedAt" DESC LIMIT 100`,
        db<
          GovernanceOverview["findings"]
        >`SELECT f.id,f."batchId",f."findingCode",f."subjectRef",f.severity,f."resolutionStatus",f.reason,COALESCE(f."detailsAndEvidence"->'evidence','[]'::jsonb) AS evidence FROM governance."GovernanceFinding" f JOIN governance."GovernanceBatch" b ON b.id=f."batchId" WHERE b."eventTaskId"=${selected} ORDER BY (f."resolutionStatus"='unresolved') DESC,f."createdAt" DESC LIMIT 100`,
        db<
          GovernanceOverview["changes"]
        >`SELECT c.id,c."batchId",c.operation,c."entityRef",c.status,c."businessAuditRef",c."patchAndEvidence"->>'reason' AS reason,c."patchAndEvidence"->'appliedDiff' AS diff FROM governance."GovernanceChange" c JOIN governance."GovernanceBatch" b ON b.id=c."batchId" WHERE b."eventTaskId"=${selected} ORDER BY c."createdAt" DESC LIMIT 100`,
        db<
          GovernanceOverview["notifications"]
        >`SELECT n.id,n."batchId",n.kind,n.status,n."attemptCount",n."sentAt",n."errorMessage" FROM governance."NotificationDelivery" n LEFT JOIN governance."GovernanceBatch" b ON b.id=n."batchId" WHERE n."eventTaskId"=${selected} OR b."eventTaskId"=${selected} ORDER BY n."createdAt" DESC LIMIT 100`,
      ]);
    return {
      source: "configured",
      tasks,
      selectedTaskId: selected,
      batches,
      agents,
      findings,
      changes,
      notifications,
    };
  } catch {
    return { ...empty, source: "error" };
  }
}
