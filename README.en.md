# Tasuki Keifu | 襷の系譜

[![中文](https://img.shields.io/badge/阅读中文-README.md-555?style=flat-square)](README.md) [![English](https://img.shields.io/badge/Read%20English-README.en.md-1677ff?style=flat-square)](README.en.md) [![日本語](https://img.shields.io/badge/日本語で読む-README.ja.md-555?style=flat-square)](README.ja.md)

Explore the connections between Japanese ekiden athletes and organizations across high schools, universities, and corporate teams. Browse athletes, memberships, competitions, and results while checking their sources.

[Japanese website](https://tasukikeifu.com/ja) · [English website](https://tasukikeifu.com/en) · [Development and data overview](#project-scope)

This repository contains the public website, a PostgreSQL / Prisma data model, race-data import scripts, and operations utilities.

## Project scope

- A Next.js site centered on athlete, organization, and competition pages
- Incremental coverage of Hakone, Izumo, All-Japan University, New Year, and National Prefectural Men's Ekiden, among other competitions
- Schools attended, memberships, key personal bests (PBs), race results, and relationship caches
- Source management based on public information, with workflows that support manual corrections

The public interface currently focuses on Japanese and includes infrastructure for multilingual pages.

## Technology

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma · pnpm

## Local setup

1. Install dependencies.

```sh
pnpm install
```

2. Create the local environment file.

```sh
cp .env.example .env
```

3. Start PostgreSQL.

```sh
docker compose up -d
```

4. Generate Prisma Client and apply local migrations.

```sh
pnpm prisma:generate
pnpm prisma:migrate
```

5. Start the application.

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Common commands

```sh
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm prisma:studio
pnpm db:seed
```

## Data imports and maintenance

Some import and maintenance entry-point scripts are not included in the public repository. The data-operation commands below require those scripts to be available locally.

Import and maintenance scripts live alongside the website. Common commands include:

```sh
pnpm import:hakone
pnpm import:izumo
pnpm generate:new-year-ekiden
pnpm generate:national-prefectural-ekiden-men
pnpm maint:audit-profile-coverage
pnpm maint:recompute-player-relations
```

- `scripts/imports/`: data generation and import entry points.
- `scripts/maintenance/`: audit, backfill, and repair scripts.
- `data/` and `tmp/`: local payloads, temporary files, and import artifacts.
- Do not run `pnpm db:seed` during production deployment; business-data imports are a separate workflow.

## Repository layout

- [`src/app`](./src/app): App Router pages, metadata, sitemap, and robots
- [`src/components`](./src/components): shared UI components
- [`src/lib`](./src/lib): site configuration, localization, data utilities, and relationship logic
- [`prisma`](./prisma): schema, migrations, and seed data
- `scripts/imports/`: import entry points and payload generators
- `scripts/maintenance/`: audits, repairs, backfills, and cleanup
- [`deploy`](./deploy): production deployment notes and example server configuration

## Deployment

Production runs with Docker Compose. See [`deploy/README.md`](./deploy/README.md) for server setup.

Related files:

- [`Dockerfile`](./Dockerfile)
- [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- [`deploy/nginx-tasuki-keifu.conf`](./deploy/nginx-tasuki-keifu.conf)

## Environment variables

Minimal local configuration:

```env
DATABASE_URL="postgresql://tasuki_keifu:tasuki_keifu@localhost:5432/tasuki_keifu?schema=public"
NEXT_PUBLIC_GA_MEASUREMENT_ID=""
```

Set `NEXT_PUBLIC_SITE_URL` when canonical URLs and the sitemap should use the production domain.
