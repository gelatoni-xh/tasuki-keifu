# 襷の系譜 | Tasuki Keifu

[![中文](https://img.shields.io/badge/阅读中文-README.md-555?style=flat-square)](README.md) [![English](https://img.shields.io/badge/Read%20English-README.en.md-555?style=flat-square)](README.en.md) [![日本語](https://img.shields.io/badge/日本語で読む-README.ja.md-1677ff?style=flat-square)](README.ja.md)

高校・大学・実業団をまたいで、日本の駅伝選手と組織のつながりをたどるデータベースです。選手・所属・大会・記録を、出典を確認しながら探索できます。

[日本語サイト](https://tasukikeifu.com/ja) · [英語サイト](https://tasukikeifu.com/en) · [開発・データの概要](#プロジェクトの範囲)

このリポジトリには、公開サイト本体、PostgreSQL / Prisma ベースのデータモデル、レースデータの取り込みスクリプト、運用補助スクリプトが含まれています。

## プロジェクトの範囲

- 選手・組織・大会のページを中心とした Next.js サイト
- 箱根駅伝、出雲駅伝、全日本大学駅伝、ニューイヤー駅伝、都道府県対抗男子駅伝などの段階的なデータ整備
- 出身校、所属、主要な自己ベスト（PB）、レース結果、関係性キャッシュの整理
- 公開情報に基づく出典管理と、手動補正に対応したデータ運用

公開 UI は現在、日本語を主軸とし、多言語ページの基盤も備えています。

## 技術スタック

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma · pnpm

## ローカル起動

1. 依存関係をインストールします。

```sh
pnpm install
```

2. ローカル環境変数ファイルを作成します。

```sh
cp .env.example .env
```

3. PostgreSQL を起動します。

```sh
docker compose up -d
```

4. Prisma Client を生成し、ローカルのマイグレーションを適用します。

```sh
pnpm prisma:generate
pnpm prisma:migrate
```

5. アプリケーションを起動します。

```sh
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開きます。

## よく使うコマンド

```sh
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm prisma:studio
pnpm db:seed
```

## データ取り込みと保守

一部の取り込み・保守用エントリースクリプトは公開リポジトリに含まれていません。以下のデータ操作コマンドには、対応するスクリプトをローカルに用意する必要があります。

取り込み・保守スクリプトはサイト本体と同じリポジトリで管理しています。主なコマンドは次のとおりです。

```sh
pnpm import:hakone
pnpm import:izumo
pnpm generate:new-year-ekiden
pnpm generate:national-prefectural-ekiden-men
pnpm maint:audit-profile-coverage
pnpm maint:recompute-player-relations
```

- `scripts/imports/`：データ生成・取り込みのエントリーポイント。
- `scripts/maintenance/`：監査、補完、修正などの保守スクリプト。
- `data/` と `tmp/`：ローカルの生成データ、一時ファイル、取り込み成果物。
- 本番デプロイ時に `pnpm db:seed` を実行しないでください。業務データの取り込みは別の手順で行います。

## ディレクトリ構成

- [`src/app`](./src/app)：App Router のページ、metadata、sitemap、robots
- [`src/components`](./src/components)：共通 UI コンポーネント
- [`src/lib`](./src/lib)：サイト設定、多言語対応、データ処理、関係構築ロジック
- [`prisma`](./prisma)：スキーマ、マイグレーション、シードデータ
- `scripts/imports/`：取り込み処理とデータ生成スクリプト
- `scripts/maintenance/`：監査、修正、補完、クリーンアップ
- [`deploy`](./deploy)：本番デプロイ手順とサーバー設定例

## デプロイ

本番環境は Docker Compose で動作します。サーバー設定は [`deploy/README.md`](./deploy/README.md) を参照してください。

関連ファイル：

- [`Dockerfile`](./Dockerfile)
- [`docker-compose.prod.yml`](./docker-compose.prod.yml)
- [`deploy/nginx-tasuki-keifu.conf`](./deploy/nginx-tasuki-keifu.conf)

## 環境変数

ローカルの最小構成：

```env
DATABASE_URL="postgresql://tasuki_keifu:tasuki_keifu@localhost:5432/tasuki_keifu?schema=public"
NEXT_PUBLIC_GA_MEASUREMENT_ID=""
```

canonical URL と sitemap に本番ドメインを使う場合は、`NEXT_PUBLIC_SITE_URL` も設定してください。
