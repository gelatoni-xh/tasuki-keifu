# 襷の系譜

高校・大学・実業団をまたいで、日本の駅伝選手と組織のつながりをたどるためのデータベースです。

このリポジトリには、公開サイト本体、PostgreSQL / Prisma ベースのデータモデル、レースデータ取り込み用スクリプト、運用補助スクリプトが入っています。

## 项目范围

- 選手ページ、組織ページ、大会ページを中心にした Next.js サイト
- 箱根駅伝、出雲駅伝、全日本大学駅伝、ニューイヤー駅伝、都道府県対抗男子駅伝などの段階的なデータ整備
- 出身校、所属、主要 PB、レース結果、関係性キャッシュの整理
- 公開情報ベースの出典管理と、手動補正を前提にしたデータ運用

現時点の公開 UI は日本語を主軸にしつつ、多言語ページの土台も含んでいます。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- PostgreSQL
- Prisma
- pnpm

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

4. 生成 Prisma Client 并执行本地 migration。

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

这个仓库把导入脚本和维护脚本与主站代码放在一起，常用命令例如：

```sh
pnpm import:hakone
pnpm import:izumo
pnpm generate:new-year-ekiden
pnpm generate:national-prefectural-ekiden-men
pnpm maint:audit-profile-coverage
pnpm maint:recompute-player-relations
```

说明：

- `scripts/imports/` 用来放生成和导入数据的入口脚本。
- `scripts/maintenance/` 用来放一次性审计、回填、修复类脚本。
- `data/` 和 `tmp/` 主要作为本地生成 payload、临时文件和导入产物的工作区。
- 生产部署不应执行 `pnpm db:seed`，业务数据导入属于单独流程。

## 仓库结构

- [`src/app`](/Users/xuhuan/workspace_new/project/tasuki-keifu/src/app)：App Router 页面、metadata、sitemap、robots
- [`src/components`](/Users/xuhuan/workspace_new/project/tasuki-keifu/src/components)：共享 UI 组件
- [`src/lib`](/Users/xuhuan/workspace_new/project/tasuki-keifu/src/lib)：站点配置、i18n、数据处理工具、关系构建逻辑
- [`prisma`](/Users/xuhuan/workspace_new/project/tasuki-keifu/prisma)：schema、migrations、seed 数据
- [`scripts/imports`](/Users/xuhuan/workspace_new/project/tasuki-keifu/scripts/imports)：导入入口与 payload 生成脚本
- [`scripts/maintenance`](/Users/xuhuan/workspace_new/project/tasuki-keifu/scripts/maintenance)：审计、修复、回填、清理脚本
- [`deploy`](/Users/xuhuan/workspace_new/project/tasuki-keifu/deploy)：生产部署说明和服务器配置示例

## 部署

生产环境通过 Docker Compose 运行，补充的服务器说明见 [`deploy/README.md`](/Users/xuhuan/workspace_new/project/tasuki-keifu/deploy/README.md)。

相关文件：

- [`Dockerfile`](/Users/xuhuan/workspace_new/project/tasuki-keifu/Dockerfile)
- [`docker-compose.prod.yml`](/Users/xuhuan/workspace_new/project/tasuki-keifu/docker-compose.prod.yml)
- [`deploy/nginx-tasuki-keifu.conf`](/Users/xuhuan/workspace_new/project/tasuki-keifu/deploy/nginx-tasuki-keifu.conf)

## 环境变量

本地最小配置：

```env
DATABASE_URL="postgresql://tasuki_keifu:tasuki_keifu@localhost:5432/tasuki_keifu?schema=public"
NEXT_PUBLIC_GA_MEASUREMENT_ID=""
```

如果部署环境需要让 canonical URL 和 sitemap 指向正式域名，请额外设置 `NEXT_PUBLIC_SITE_URL`。
