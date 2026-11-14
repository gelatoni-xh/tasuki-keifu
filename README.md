# 襷之系谱 | Tasuki Keifu

[![中文](https://img.shields.io/badge/阅读中文-README.md-1677ff?style=flat-square)](README.md) [![English](https://img.shields.io/badge/Read%20English-README.en.md-555?style=flat-square)](README.en.md) [![日本語](https://img.shields.io/badge/日本語で読む-README.ja.md-555?style=flat-square)](README.ja.md)

追溯日本驿传选手从高中、大学到实业团的经历与组织关系。通过选手、所属、大会和成绩页面探索数据，并核对信息来源。

[访问日文站点](https://tasukikeifu.com/ja) · [访问英文站点](https://tasukikeifu.com/en) · [开发与数据概览](#项目范围)

本仓库包含公开网站、基于 PostgreSQL / Prisma 的数据模型、赛事数据导入脚本和运维辅助脚本。

## 项目范围

- 以选手、组织和大会页面为核心的 Next.js 网站
- 逐步整理箱根驿传、出云驿传、全日本大学驿传、全日本实业团驿传和全国都道府县对抗男子驿传等赛事数据
- 整理出身学校、所属、主要个人最好成绩（PB）、比赛结果和关系缓存
- 基于公开信息管理来源，并支持人工校正的数据维护流程

当前公开界面以日文为主，同时包含多语言页面的基础设施。

## 技术栈

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma · pnpm

## 本地启动

1. 安装依赖。

```sh
pnpm install
```

2. 创建本地环境变量文件。

```sh
cp .env.example .env
```

3. 启动 PostgreSQL。

```sh
docker compose up -d
```

4. 生成 Prisma Client 并执行本地迁移。

```sh
pnpm prisma:generate
pnpm prisma:migrate
```

5. 启动应用。

```sh
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```sh
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm prisma:studio
pnpm db:seed
```

## 数据导入与维护

部分导入和维护入口脚本未包含在公开仓库中；下列数据操作命令需要先准备对应脚本。

导入与维护脚本和主站代码放在同一仓库，常用命令包括：

```sh
pnpm import:hakone
pnpm import:izumo
pnpm generate:new-year-ekiden
pnpm generate:national-prefectural-ekiden-men
pnpm maint:audit-profile-coverage
pnpm maint:recompute-player-relations
```

- `scripts/imports/`：数据生成与导入入口。
- `scripts/maintenance/`：审计、回填、修复等维护脚本。
- `data/` 和 `tmp/`：本地生成的数据载荷、临时文件和导入产物。
- 生产部署不应执行 `pnpm db:seed`；业务数据导入是独立流程。

## 仓库结构

- [`src/app`](./src/app)：App Router 页面、metadata、sitemap、robots
- [`src/components`](./src/components)：共享 UI 组件
- [`src/lib`](./src/lib)：站点配置、多语言、数据工具与关系构建逻辑
- [`prisma`](./prisma)：schema、迁移与种子数据
- `scripts/imports/`：导入入口与数据载荷生成脚本
- `scripts/maintenance/`：审计、修复、回填与清理脚本
- [`deploy`](./deploy)：生产部署说明与服务器配置示例

## 部署

生产环境使用 Docker Compose，服务器说明见 [`deploy/README.md`](./deploy/README.md)。

相关文件：

- [`Dockerfile`](./Dockerfile)
- [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- [`deploy/nginx-tasuki-keifu.conf`](./deploy/nginx-tasuki-keifu.conf)

## 环境变量

本地最小配置：

```env
DATABASE_URL="postgresql://tasuki_keifu:tasuki_keifu@localhost:5432/tasuki_keifu?schema=public"
NEXT_PUBLIC_GA_MEASUREMENT_ID=""
```

部署时如需让 canonical URL 和 sitemap 指向正式域名，请额外设置 `NEXT_PUBLIC_SITE_URL`。

## 新版赛事数据治理

新版独立实现与启动步骤见 [`docs/governance-v2.md`](docs/governance-v2.md)。该流程的 migration 由主站管理；旧版 Agent 表和运行记录不自动迁移。
