# Local Pull Backup

Development uses a local PostgreSQL copy. Only refreshing a snapshot needs the
production connection. Dated compressed originals are retained independently of
the disposable development databases.

## Files

- Optional server-side example: `deploy/backup-db.sh.example`
- Local pull: `scripts/local/pull-production-backup.sh`
- Isolated PostgreSQL lifecycle/restore: `scripts/local/offline-postgres.sh`
- Full dump-to-database content verification: `scripts/local/verify-offline-backup.py`

These three operational scripts are tracked so a fresh clone includes the
development launcher dependencies. Dumps, credentials, and local state remain
outside the repository. The scripts are excluded from the production image.

The obsolete `/etc/cron.d/tasuki-keifu-backup` was removed on 2026-11-21.
It referenced a missing server script; no server backup files existed. Scheduled
snapshots are pulled by the Mac LaunchAgent described below.

## Refresh a full snapshot

Start Clash SOCKS5 on `127.0.0.1:7877`, then run from the repository:

```sh
bash scripts/local/pull-production-backup.sh
# Force an explicit refresh inside the usual 24-hour interval:
MAX_AGE_HOURS=0 bash scripts/local/pull-production-backup.sh
```

The local script runs `pg_dump` inside the production PostgreSQL container over
SSH, compresses to a temporary server file, then pulls it with SCP. SSH and SCP
both explicitly use the same SOCKS5 ProxyCommand, pinned key and existing trusted
SSH host key. It does not depend on a deployed `backup-db.sh` (that file was
absent on 2026-11-21). No production SQL writes or service restarts are performed.

Before publishing a local file, it compares remote/local SHA-256 and validates
gzip. Transfers use a hidden temporary file; existing dated files are never
replaced. A matching `.sha256` sidecar is saved. The remote temporary dump is
removed only after verification; a failed transfer leaves the remote original
available for investigation. A local lock prevents overlapping pulls.

## Default behavior

- Pull only if the last successful sync is older than `24` hours
- Retain all dated originals; no automatic pruning
- Store state in `~/.local/state/tasuki-keifu`
- Store backup files in `~/.local/share/tasuki-keifu/backups`

The existing Mac LaunchAgent invokes the same pull script at login and daily.
It is independent of local development. A failed offline refresh does not affect
the restored development database. `deploy/macos-backup-launch-agent.example.plist`
is an optional setup template; no scheduler change is required for manual use.

## Isolated offline PostgreSQL

This Mac already has Homebrew PostgreSQL 17.10. Docker is not needed. The helper
uses `/usr/local/opt/postgresql@17/bin` (`PG_BIN` may override it).

- Data and reports: `~/.local/share/tasuki-keifu/offline-postgres`
- TCP: **127.0.0.1:25432**, password authenticated
- Development database locale: libc `en_US.UTF-8`, corresponding to production
  `en_US.utf8`. macOS and Linux libc sorting can still differ; use a matching Linux
  PostgreSQL environment when validating exact collation-dependent behavior.
- Unix socket: private `socket/` directory under the data root
- Separate cluster; leaves Homebrew's existing cluster, Docker volumes, production
  tunnels on 15432/15433 and the running preview on 3000 alone
- `offline_admin` uses a randomly generated local password; production role names
  are created as NOLOGIN placeholders for dump ownership and ACL restoration

```sh
# Once only; refuses to replace an existing cluster:
bash scripts/local/offline-postgres.sh init
# Subsequent sessions, entirely offline:
bash scripts/local/offline-postgres.sh start
# Restore always creates a NEW database; a duplicate name is an error:
bash scripts/local/offline-postgres.sh restore /absolute/path/to/snapshot.sql.gz
# Optional explicit name, starting with tasuki_dev_:
bash scripts/local/offline-postgres.sh restore /absolute/path/to/snapshot.sql.gz tasuki_dev_experiment_1
python3 scripts/local/verify-offline-backup.py /absolute/path/to/snapshot.sql.gz tasuki_dev_experiment_1
```

Restore uses `ON_ERROR_STOP` and a single transaction, then runs ANALYZE. A failed
restore leaves an empty database and diagnostic log; it never publishes a new
development env. The verifier checks every COPY row with order-independent
SHA-256 content fingerprints, every table's row count, table inventory, and
constraint validation. Current dumps have no sequences; it fails explicitly if
sequence verification becomes necessary. Roles/passwords from the whole
PostgreSQL cluster are not backed up by a single-database `pg_dump`.

## Use the restored database

Development automatically loads the selected snapshot configuration. From this
checkout, run the usual command once the existing preview has been stopped by
its owner:

```sh
pnpm dev
```

`scripts/dev.ts` sets development mode, loads the development configuration,
checks/starts the isolated cluster when selecting `127.0.0.1:25432`, then starts
Next.js with that environment. No manual `source` is needed. It reports only the
database host, port and name, never the password. Failure to start or connect to
the local database does not trigger a fallback to production.

The selected configuration on this Mac is the protected file
`~/.config/tasuki-keifu/development.env` (0600), pointing to
`tasuki_dev_snapshot_20261121_en_us`. It provides `DATABASE_URL` and the local
governance read URL. It uses a local-only administrator for disposable
development, not production credentials. Existing `.env` and the running preview
are not modified. Do not run two Next dev processes against the same checkout.

Prisma CLI and script Prisma use the same environment loader. Selection order:

1. Explicit process environment variables
2. Project `.env.<NODE_ENV>.local`
3. Protected Mac development configuration (development mode only)
4. Project `.env.local` (except test mode), `.env.<NODE_ENV>`, then `.env`

For CLI scripts, an unset `NODE_ENV` defaults to development. Production runs
with `NODE_ENV=production` from Compose and the deployment-injected URLs; it never
reads the Mac development configuration. The Docker image includes the shared
loader needed by `prisma.config.ts`. Environment selection is determined by the
startup mode, not network availability.

Future restores still create a separate database and dated env file, without
switching the selected development database. To adopt a different verified copy,
update the protected development configuration (or explicitly override the URL).
Nothing in daily development, `start`, `restore` or the verifier connects to
production. Dependencies must already be installed; the database does not need
Clash, SSH, internet, or Docker during daily use.

```sh
bash scripts/local/offline-postgres.sh status
bash scripts/local/offline-postgres.sh stop
```

Backups remain immutable source artifacts. To reset development, restore the
selected original into another new database and update the selected configuration. Old
development databases can be removed separately after their users release them.

## Verified on 2026-11-21 (Asia/Shanghai)

- Existing `tasuki-keifu-2026-11-12T16-00-09.sql.gz`: restored into
  `tasuki_dev_snapshot_20261112`; 30 tables, 178,507 rows, 40 validated foreign keys;
  all row content fingerprints match the original dump.
- Fresh `tasuki-keifu-2026-11-21T12-15-41-2741830.sql.gz`: about 142 MiB, pulled
  through SOCKS5 with matching SHA-256, gzip valid, remote temporary file cleaned.
  Restored into `tasuki_dev_snapshot_20261121_en_us`; 30 tables, 278,361 rows,
  40 validated foreign keys, all row content fingerprints match. See its
  `.verification.json` under the offline data root for counts and fingerprints.
  The initial C-locale restore `tasuki_dev_snapshot_20261121` is also retained.
- Current checkout: all 22 Prisma migrations applied in the fresh copy.
- Automatic selection tested without exporting a URL: `pnpm dev --help` selects
  the isolated development copy; Prisma migration status selects the same copy.
  Loader tests cover production isolation and explicit configuration overrides.
- Prisma count and record reads passed with outbound sockets restricted to
  `127.0.0.1:25432`: 8,670 people, 1,337 organizations, 8,715 memberships,
  37,243 race results. This verifies the database dependency offline; it is not a
  browser test of every page or external website integration.

Keep dumps/env files/logs private. They include the full business and governance
schemas, including audit, feedback and checkpoint data. No production restore was
performed; disaster recovery to production requires a separate planned operation.
