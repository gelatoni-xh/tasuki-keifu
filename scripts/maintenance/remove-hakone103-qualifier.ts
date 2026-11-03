/**
 * Withdraw the out-of-scope qualifier; retain true profile enrichment for shared people.
 * Plan against production, rehearse against a restored database, then apply with the
 * manifest SHA256. Before-images and whole-table checks protect unrelated records.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { loadWorkspaceEnv } from "../lib/load-env";

loadWorkspaceEnv();
const SOURCE = "source-hakone-103-qualifier-official";
const EDITION = "hakone-qualifier-103";
const OPERATION = "withdraw-hakone103-qualifier-20261104";
const TABLES = ["Person", "Organization", "Membership", "PersonalBest", "Competition", "CompetitionEdition", "TeamCompetitionResult", "TeamCompetitionLegSnapshot", "Race", "RaceResult", "PlayerRelationCache", "CacheInvalidation", "Source", "NameVariant", "AuditLog", "SourceReference", "ImportBatch"];
const DELETE_ORDER = ["SourceReference", "TeamCompetitionLegSnapshot", "RaceResult", "TeamCompetitionResult", "PersonalBest", "NameVariant", "Membership", "Person", "Race", "CompetitionEdition", "Competition", "Organization"];
// Database JSON includes arbitrary table fields; retain their native values for exact before-image comparisons.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Digest = { count: number; digest: string };
type Manifest = {
  operation: string; createdAt: string; database: string;
  foreignKeys: Row[]; before: Record<string, Row[]>; protected: Record<string, Digest>;
  deleteCounts: Record<string, number>; retainedParticipants: Row[];
  organizations: Row[]; cacheScopes: Row[];
};
const args = process.argv.slice(2);
const mode = args[0];
const directory = args[1];
if (!["plan", "rehearse", "apply", "verify", "restore-rehearsal"].includes(mode) || !directory) {
  throw Error("Usage: tsx scripts/maintenance/remove-hakone103-qualifier.ts <plan|rehearse|apply|verify|restore-rehearsal> <private-directory> [manifest-sha256]");
}
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.hostname, "127.0.0.1", "Use the verified local production SSH tunnel");
assert.equal(url.port, "15432");
if (mode === "rehearse" || mode === "restore-rehearsal") url.pathname = "/tasuki_qualifier_rehearsal_20261104";
else assert.equal(url.pathname, "/tasuki_keifu");
const db = new Client({ connectionString: url.toString() });
const ids = (rows: Row[] = []) => rows.map(r => r.id);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function save(name: string, value: unknown) {
  await writeFile(path.join(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
}
async function rows(table: string, predicate = "true", params: unknown[] = []): Promise<Row[]> {
  assert(TABLES.includes(table));
  return (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t WHERE ${predicate} ORDER BY id`, params)).rows.map(r => r.row);
}
async function digest(table: string, excluding: string[] = []): Promise<Digest> {
  assert(TABLES.includes(table));
  return (await db.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) AS digest FROM "${table}" t WHERE NOT(id=ANY($1::text[]))`, [excluding])).rows[0];
}
async function foreignKeys(): Promise<Row[]> {
  return (await db.query(`SELECT conname, conrelid::regclass::text AS table_name, confrelid::regclass::text AS referenced_table, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conname`)).rows;
}
async function transaction(write: boolean) {
  await db.query(write ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL statement_timeout = '120s'");
  await db.query("SET LOCAL lock_timeout = '10s'");
  if (write) {
    // All current business/cache tables: blocks concurrent writers, allows readers.
    await db.query(`LOCK TABLE ${TABLES.map(t => `"${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`);
  }
}
async function plan() {
  await transaction(false);
  const edition = await rows("CompetitionEdition", "slug=$1", [EDITION]);
  assert.equal(edition.length, 1);
  const eid = edition[0].id;
  const races = await rows("Race", '"competitionEditionId"=$1', [eid]);
  assert.equal(races.length, 1);
  const raceIds = ids(races);
  const results = await rows("RaceResult", '"raceId"=ANY($1::text[])', [raceIds]);
  assert.equal(results.length, 535);
  const participantIds = [...new Set(results.map(r => r.personId))];
  assert.equal(participantIds.length, 535);
  const outsideResults = await rows("RaceResult", '"personId"=ANY($1::text[]) AND NOT("raceId"=ANY($2::text[]))', [participantIds, raceIds]);
  const shared = new Set(outsideResults.map(r => r.personId));
  const exclusive = participantIds.filter(id => !shared.has(id));
  // Any new independent data blocks this person's deletion and requires a new plan.
  const analyzed = JSON.parse(await readFile(path.join(directory, "approved-candidates.json"), "utf8")) as string[];
  assert.deepEqual([...exclusive].sort(), [...analyzed].sort(), "Exclusive people changed since reviewed candidate list");
  const before: Record<string, Row[]> = Object.fromEntries(TABLES.map(t => [t, []]));
  before.Person = await rows("Person", 'id=ANY($1::text[])', [exclusive]);
  before.Membership = await rows("Membership", '"personId"=ANY($1::text[])', [exclusive]);
  before.PersonalBest = await rows("PersonalBest", '"personId"=ANY($1::text[])', [exclusive]);
  before.NameVariant = await rows("NameVariant", '"personId"=ANY($1::text[]) OR "competitionId"=$2', [exclusive, edition[0].competitionId]);
  for (const table of ["Membership", "PersonalBest", "NameVariant"]) {
    assert(before[table].every(r => r.sourceId === SOURCE), `${table}: independent/null source requires review`);
  }
  before.RaceResult = results;
  before.TeamCompetitionResult = await rows("TeamCompetitionResult", '"competitionEditionId"=$1', [eid]);
  assert.equal(before.TeamCompetitionResult.length, 45);
  before.TeamCompetitionLegSnapshot = await rows("TeamCompetitionLegSnapshot", '"teamCompetitionResultId"=ANY($1::text[])', [ids(before.TeamCompetitionResult)]);
  assert.equal(before.TeamCompetitionLegSnapshot.length, 0);
  before.SourceReference = await rows("SourceReference", '"sourceId"=$1 OR "personId"=ANY($2::text[]) OR "raceId"=ANY($3::text[]) OR "competitionEditionId"=$4 OR "competitionId"=$5', [SOURCE, exclusive, raceIds, eid, edition[0].competitionId]);
  assert.equal(before.SourceReference.length, 535);
  assert(before.SourceReference.every(r => r.sourceId === SOURCE));
  before.Race = races;
  before.CompetitionEdition = edition;
  assert.equal((await rows("CompetitionEdition", '"competitionId"=$1', [edition[0].competitionId])).length, 1, "Series has other editions");
  before.Competition = await rows("Competition", "id=$1", [edition[0].competitionId]);
  // The user also requested deletion of exclusive schools. Every target school has
  // independent competition results; assert this rather than deleting by creation time.
  const orgIds = [...new Set([...results, ...before.TeamCompetitionResult].map(r => r.organizationId).filter(Boolean))];
  const organizations: Row[] = [];
  for (const oid of orgIds) {
    const resultCount = (await db.query('SELECT count(*)::int AS n FROM "RaceResult" WHERE "organizationId"=$1 AND NOT("raceId"=ANY($2::text[]))', [oid, raceIds])).rows[0].n;
    const teamCount = (await db.query('SELECT count(*)::int AS n FROM "TeamCompetitionResult" WHERE "organizationId"=$1 AND "competitionEditionId"<>$2', [oid, eid])).rows[0].n;
    assert(resultCount + teamCount > 0, `Organization ${oid} requires exclusive-school review`);
    organizations.push({ id: oid, otherIndividualResults: resultCount, otherTeamResults: teamCount });
  }
  const cacheScopes = await rows("CacheInvalidation", "scope=ANY($1::text[])", [["player-detail", "competition-detail"]]);
  assert.equal(cacheScopes.length, 2);
  const protectedRows: Record<string, Digest> = {};
  for (const table of TABLES) {
    if (table === "PlayerRelationCache") continue; // Entirely derived; invalidate all JSON soft references.
    protectedRows[table] = await digest(table, table === "CacheInvalidation" ? ids(cacheScopes) : ids(before[table]));
  }
  const manifest: Manifest = {
    operation: OPERATION, createdAt: new Date().toISOString(), database: "tasuki_keifu",
    foreignKeys: await foreignKeys(), before, protected: protectedRows,
    deleteCounts: Object.fromEntries(DELETE_ORDER.map(t => [t, before[t].length])),
    retainedParticipants: await rows("Person", 'id=ANY($1::text[])', [[...shared]]),
    organizations, cacheScopes,
  };
  assert.equal(manifest.foreignKeys.length, 31);
  await db.query("COMMIT");
  const serialized = JSON.stringify(manifest, null, 2);
  await writeFile(path.join(directory, "manifest.json"), serialized, { mode: 0o600 });
  await save("manifest.sha256.json", { sha256: hash(serialized) });
  console.log(JSON.stringify({ sha256: hash(serialized), deleteCounts: manifest.deleteCounts, protectedParticipants: shared.size, protectedOrganizations: organizations.length }, null, 2));
}
async function loadManifest() {
  const serialized = await readFile(path.join(directory, "manifest.json"), "utf8");
  assert.equal(args[2], hash(serialized), "Explicit manifest SHA256 is required");
  const m = JSON.parse(serialized) as Manifest;
  assert.equal(m.operation, OPERATION);
  return m;
}
async function assertProtected(m: Manifest, auditIds: string[] = []) {
  for (const table of TABLES) {
    if (table === "PlayerRelationCache") continue;
    const exclude = table === "CacheInvalidation" ? ids(m.cacheScopes) : [...ids(m.before[table]), ...(table === "AuditLog" ? auditIds : [])];
    assert.deepEqual(await digest(table, exclude), m.protected[table], `Unexpected change to retained ${table}`);
  }
}
async function apply(m: Manifest) {
  await transaction(true);
  assert.deepEqual(await foreignKeys(), m.foreignKeys, "Database constraints changed");
  const previous = await rows("AuditLog", '"entityId"=$1 AND "entityType"=$2', [OPERATION, "MaintenanceOperation"]);
  if (previous.length) {
    assert.equal(previous.length, 1);
    await verify(m, [previous[0].id]);
    await db.query("COMMIT");
    console.log("Already applied; no business writes or duplicate audit");
    return;
  }
  await assertProtected(m);
  for (const table of DELETE_ORDER) {
    assert.deepEqual(await rows(table, "id=ANY($1::text[])", [ids(m.before[table])]), m.before[table], `${table} before-images changed`);
  }
  // JSON metadata and audit payloads are historical, not business identity relations.
  // FK children outside the frozen list must block deletion, even for cascade FKs.
  for (const fk of m.foreignKeys) {
    const parent = fk.referenced_table.replaceAll('"', "");
    const child = fk.table_name.replaceAll('"', "");
    if (!m.before[parent]?.length) continue;
    const column = /FOREIGN KEY \("?([A-Za-z]+)"?\)/.exec(fk.definition)?.[1];
    assert(column, `Unrecognized foreign key ${fk.conname}`);
    if (child === "PlayerRelationCache") continue;
    const dependents = await rows(child, `"${column}"=ANY($1::text[])`, [ids(m.before[parent])]);
    assert(dependents.every(r => ids(m.before[child]).includes(r.id)), `Unplanned dependency ${fk.conname}`);
  }
  const cacheDeleted = (await db.query('DELETE FROM "PlayerRelationCache"')).rowCount;
  for (const table of DELETE_ORDER) {
    const count = (await db.query(`DELETE FROM "${table}" WHERE id=ANY($1::text[])`, [ids(m.before[table])])).rowCount;
    assert.equal(count, m.before[table].length, `Delete count ${table}`);
  }
  await db.query('UPDATE "CacheInvalidation" SET version=clock_timestamp(), "updatedAt"=clock_timestamp() WHERE id=ANY($1::text[])', [ids(m.cacheScopes)]);
  const auditId = randomUUID();
  await db.query(`INSERT INTO "AuditLog" (id,"entityType","entityId",action,"reasonType","reasonNote","sourceId","actorType","actorId",metadata) VALUES ($1,'MaintenanceOperation',$2,'delete','manual_error',$3,$4,'admin','codex',$5::jsonb)`, [auditId, OPERATION, "User-approved withdrawal of out-of-scope qualifier and exclusive people; retain true enrichment on shared profiles; no exclusive schools.", SOURCE, JSON.stringify({ manifestSha256: args[2], counts: m.deleteCounts, cacheDeleted, policy: "retain-true-shared-profile-enrichment" })]);
  await verify(m, [auditId]);
  // Save report before commit so an evidence write failure rolls back the transaction.
  await save(`${mode}-result.json`, { operation: OPERATION, time: new Date().toISOString(), database: url.pathname.slice(1), counts: m.deleteCounts, auditId, cacheDeleted, protectedTables: Object.keys(m.protected), verified: true });
  await db.query("COMMIT");
  console.log(JSON.stringify({ operation: OPERATION, database: url.pathname, counts: m.deleteCounts, cacheDeleted, verified: true }, null, 2));
}
async function verify(m: Manifest, auditIds?: string[]) {
  if (!auditIds) auditIds = ids(await rows("AuditLog", '"entityId"=$1 AND "entityType"=$2', [OPERATION, "MaintenanceOperation"]));
  assert.equal(auditIds.length, 1);
  for (const table of DELETE_ORDER) assert.equal((await rows(table, "id=ANY($1::text[])", [ids(m.before[table])])).length, 0, `Residual ${table}`);
  await assertProtected(m, auditIds);
  assert.equal((await rows("RaceResult", '"sourceId"=$1', [SOURCE])).length, 0);
  assert.equal((await rows("SourceReference", '"sourceId"=$1', [SOURCE])).length, 0);
  const candidateIds = ids(m.before.Person);
  for (const table of ["Membership", "PersonalBest", "NameVariant", "RaceResult", "SourceReference", "PlayerRelationCache"]) {
    assert.equal((await rows(table, '"personId"=ANY($1::text[])', [candidateIds])).length, 0, `Residual person child ${table}`);
  }
  assert.deepEqual(await rows("Person", "id=ANY($1::text[])", [ids(m.retainedParticipants)]), m.retainedParticipants, "Shared profile fields changed");
}
async function restoreRehearsal(m: Manifest) {
  assert.equal(url.pathname, "/tasuki_qualifier_rehearsal_20261104", "Restore exercise cannot target production");
  await transaction(true);
  const operationAudit = await rows("AuditLog", '"entityId"=$1 AND "entityType"=$2', [OPERATION, "MaintenanceOperation"]);
  await verify(m, ids(operationAudit));
  for (const table of [...DELETE_ORDER].reverse()) {
    if (m.before[table].length) {
      // PostgreSQL's record converter restores dates, enums and JSON without JS coercion.
      await db.query(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`, [JSON.stringify(m.before[table])]);
    }
  }
  for (const row of m.cacheScopes) {
    await db.query('UPDATE "CacheInvalidation" SET version=$2, "updatedAt"=$3 WHERE id=$1', [row.id, row.version, row.updatedAt]);
  }
  await db.query('DELETE FROM "AuditLog" WHERE id=ANY($1::text[])', [ids(operationAudit)]);
  await assertProtected(m);
  for (const table of DELETE_ORDER) assert.deepEqual(await rows(table, "id=ANY($1::text[])", [ids(m.before[table])]), m.before[table]);
  await db.query("COMMIT");
  await save("restore-rehearsal-result.json", { verified: true, time: new Date().toISOString(), database: url.pathname, restoredBusinessCounts: m.deleteCounts, note: "Derived relation cache intentionally remains invalidated; all business before-images restored." });
  console.log("Inverse restoration rehearsal passed: all business before-images match");
}
async function main() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await db.connect();
  if (mode === "plan") await plan();
  else {
    const m = await loadManifest();
    if (mode === "rehearse" || mode === "apply") await apply(m);
    else if (mode === "restore-rehearsal") await restoreRehearsal(m);
    else {
      await transaction(false);
      await verify(m);
      await db.query("COMMIT");
      await save("verify-result.json", { verified: true, time: new Date().toISOString() });
      console.log("All protected business tables and deletion assertions passed");
    }
  }
}
main().catch(async error => {
  await db.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.end());
