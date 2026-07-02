# tasuki-keifu deployment

V0.1 target:

- Host: Ubuntu-3
- Domain: `tasukikeifu.com`
- App directory: `/opt/apps/tasuki-keifu`
- Local app port: `127.0.0.1:3020`
- Runtime: Docker Compose
- Database: project-local PostgreSQL container

Server layout:

```text
/opt/apps/tasuki-keifu
  ├─ docker-compose.prod.yml
  ├─ .env.production
  └─ backups
```

Manual deploy steps:

```bash
cd /opt/apps/tasuki-keifu
sudo docker compose -f docker-compose.prod.yml up -d --build postgres
sudo docker compose -f docker-compose.prod.yml run --rm app pnpm prisma migrate deploy
sudo docker compose -f docker-compose.prod.yml up -d --build app
```

Production deploy should normally run through GitHub Actions:

```text
git push main -> build image archive -> upload to Ubuntu-3 -> docker load -> migrate deploy -> compose up
```

Production logs:

- App and script logs are emitted as structured JSON to container stdout/stderr.
- Docker Compose uses the `local` logging driver with three rotated files per container.
- Application-side log retention is configured with `TASUKI_LOG_RETENTION_DAYS=3`.

Do not run `pnpm db:seed` in production deploys. Business data import and correction are separate workflows.

Nginx:

- Copy `deploy/nginx-tasuki-keifu.conf` to `/etc/nginx/sites-available/tasuki-keifu`
- Enable it from `/etc/nginx/sites-enabled/tasuki-keifu`
- Run `sudo nginx -t`
- Reload Nginx

DNS:

- Add `tasukikeifu.com` A record pointing to `13.230.244.67`
- Add `www.tasukikeifu.com` CNAME pointing to `tasukikeifu.com`
- After DNS resolves, issue HTTPS cert with certbot.
- Current server-side HTTP route should be verified with `Host: tasukikeifu.com`.
- Current public HTTPS route has been verified.

Health checks:

```bash
curl -I http://127.0.0.1:3020/ja
curl -I http://tasukikeifu.com/ja
curl -I https://tasukikeifu.com/ja
curl -I https://www.tasukikeifu.com/ja
```

Backup:

```bash
/opt/apps/tasuki-keifu/backup-db.sh
```

Cron:

```text
17 19 * * * ubuntu /opt/apps/tasuki-keifu/backup-db.sh >> /opt/apps/tasuki-keifu/backups/backup.log 2>&1
```

After adding DNS, issue HTTPS:

```bash
sudo certbot --nginx -d tasukikeifu.com -d www.tasukikeifu.com
```

Current certificate:

- Issued: 2026-06-28
- Expires: 2026-09-26
- Certbot renewal task is installed on Ubuntu-3.
