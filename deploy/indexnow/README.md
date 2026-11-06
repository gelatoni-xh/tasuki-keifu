# IndexNow server timer

Ubuntu-3 checks PostgreSQL's cumulative business-table insert/update/delete counters every
15 minutes (plus up to 60 seconds jitter). If unchanged, the task exits without
requesting sitemaps or calling IndexNow. On changes, it reads the app's four
Japanese sitemaps through `127.0.0.1:3020`. New URLs and changed `lastmod` values
are submitted in batches of 500. The first run submits all current sitemap URLs.
IndexNow acceptance does not guarantee crawling or indexing.

The existing sitemap discovery code includes related results, memberships and
personal best updates. Changes that do not advance sitemap `lastmod` are not
detected. Missing URLs are not submitted as deletions; an omitted sitemap entry
alone does not establish that its page was deleted.

The service runs as `ubuntu` (existing Docker group), reads counters through
`docker exec ... psql` with container-local authentication, and persists accepted
URLs in `/var/lib/tasuki-keifu-indexnow/state.json` outside the application image.
Each accepted batch is saved atomically. Failed batches retry on the next timer
run; accepted batches are skipped. A lock prevents overlapping runs. All four
sitemaps must load and be nonempty before any submission begins. Invalid XML,
missing timestamps, external URLs and corrupt state fail without resetting state.

Install independently of application deployment: copy this folder to the server
and run `bash deploy/indexnow/install.sh`. Installation is repeatable and preserves
state. Requires Python 3, systemd and access to the existing Docker socket; no
Python packages, replication slots or PostgreSQL configuration changes are needed.
GitHub Actions is unchanged.

`db-signature.json` in the state directory records the database counters only after
a complete successful run. Failed submissions leave that cursor unchanged, so the
next run retries even if there are no further database writes. Database restart or
statistics reset forces a scan. Counters use `pg_stat_user_tables`, excluding `PlayerRelationCache`,
`CacheInvalidation`, `AuditLog`, `ImportBatch` and `_prisma_migrations` so cache
refreshes and import bookkeeping alone do not trigger sitemap scans. This detects committed DML through PostgreSQL
statistics (which can lag briefly), not WAL decoding; pure DDL/TRUNCATE or changes
outside the database need a manual `--force` scan when relevant.

```sh
systemctl list-timers tasuki-keifu-indexnow.timer
sudo journalctl -u tasuki-keifu-indexnow.service -n 50 --no-pager
sudo systemctl start tasuki-keifu-indexnow.service
sudo -u ubuntu python3 /opt/apps/tasuki-keifu/indexnow/poll.py --dry-run --force
sudo systemctl disable --now tasuki-keifu-indexnow.timer
```

Do not delete `state.json` unless a full resubmission is intended. A 200/202 log
means the IndexNow request was accepted, not that its URLs were indexed.
