# 襷の系譜

高校・大学・実業団をつなぐ駅伝データベース。

V0.1 focuses on a player-centered archive for Hakone Ekiden fans, starting with athletes from 青山学院大学, 國學院大學, and 中央大学.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma

## Local Setup

Install dependencies:

```sh
pnpm install
```

Create local environment file:

```sh
cp .env.example .env
```

Start PostgreSQL:

```sh
docker compose up -d
```

Generate Prisma Client:

```sh
pnpm prisma:generate
```

Run database migrations:

```sh
pnpm prisma:migrate
```

Start development server:

```sh
pnpm dev
```

Open http://localhost:3000.

## Common Commands

```sh
pnpm lint
pnpm build
pnpm prisma:studio
```

## Notes

- Public UI language starts with Japanese.
- Data should keep source URLs and verification status.
- V0.1 uses PostgreSQL as the business source of truth; no graph database or warehouse is planned for the first version.
