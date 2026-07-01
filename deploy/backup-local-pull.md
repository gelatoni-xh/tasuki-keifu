# Local Pull Backup

This project uses a lightweight backup strategy:

- production generates a fresh PostgreSQL dump on demand
- the local machine pulls the dump over SSH
- successful pulls are rate-limited by a local timestamp file
- old local backups are pruned by count

## Files

- Server-side example: `/opt/apps/tasuki-keifu/deploy/backup-db.sh.example`
- Local pull script: `scripts/local/pull-production-backup.sh`

## Suggested local setup

1. Copy the server-side example into the production app directory as `backup-db.sh`.
2. Make both scripts executable.
3. Run the local pull script once manually.
4. Register the local pull script with a login or wake trigger on the Mac.

## Default behavior

- Pull only if the last successful sync is older than `24` hours
- Keep the latest `14` local backup files
- Store state in `~/.local/state/tasuki-keifu`
- Store backup files in `~/.local/share/tasuki-keifu/backups`

## Notes

- This is intentionally a local-first backup strategy.
- The server does not keep long-term backup history in this phase.
- Recovery is expected to upload a selected dump back to the server before restore.
