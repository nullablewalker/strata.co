# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Strata — 「サブスクの海に、自分だけの『レコード棚』を取り戻す」音楽パーソナル・アーカイブアプリ。

Spotifyの再生履歴を時間軸で深掘りし、「熱量の地層」としてエモーショナルに可視化する。ソーシャル機能は意図的に排除し、「自分と音楽の1対1の対話」に特化。

## プロダクト要件

企画書: `docs/PROJECT_PROPOSAL.md`

### MVPスコープ（再生履歴特化）

1. Spotify OAuth認証 + メタデータ取得（ジャケット画像、ジャンル等）
2. Spotify Extended Streaming History（JSON）インポート・パース
3. The Vault — 累計再生回数、メタデータ付き一覧、フィルタリング・ソート
4. Fandom Heatmap — アーティスト別再生頻度の時間軸可視化（GitHub草スタイル）
5. リスニングパターン — 時間帯・曜日・季節別の再生傾向

### MVP除外（後続フェーズ）

- Continuous Scrobbling、BPM/キー音響データ、Sonic Lineage、Time Capsule、Beautiful Noise

## 技術スタック

- **API**: Hono
- **フロントエンド**: React 19 + Vite 7
- **スタイリング**: Tailwind CSS v4 (CSS-first設定)
- **DB**: Neon (serverless PostgreSQL) + Drizzle ORM (neon-http driver)
- **バリデーション**: Zod
- **認証**: Arctic v3 (Spotify OAuth, confidential client)
- **セッション**: hono-sessions (CookieStore, 暗号化Cookie)
- **データ可視化**: D3.js
- **画像生成**: @cf-wasm/og (Satori + resvg, Workers互換)
- **ホスティング**: Cloudflare Pages

## 開発コマンド

```bash
npm run dev         # 開発サーバー起動 (localhost:5173)
npm run build       # プロダクションビルド (SPA + _worker.js)
npm run preview     # wrangler pages devでプロダクションビルド確認
npm run typecheck   # TypeScript型チェック
npm run lint        # ESLint
npm run format      # Prettier

# DB操作
npm run db:generate # マイグレーションファイル生成
npm run db:migrate  # マイグレーション実行
npm run db:push     # スキーマをDBに直接反映
npm run db:studio   # Drizzle Studio（DBブラウザ）
```

## アーキテクチャ

Single-repo、dual-build構成。`@hono/vite-dev-server`で開発時は単一ポート(5173)でSPA + APIを同時配信。

```text
src/
├── client/            # React SPA
│   ├── main.tsx       # エントリポイント (BrowserRouter)
│   ├── App.tsx        # ルートコンポーネント
│   ├── lib/api.ts     # /api/* への型付きfetchラッパー
│   └── styles/index.css  # Tailwind v4テーマ定義 (@theme)
├── server/            # Hono API
│   ├── index.ts       # Honoエントリ、ルートマウント
│   ├── routes/auth.ts # Spotify OAuth (Arctic v3)
│   ├── db/
│   │   ├── index.ts   # createDb() ファクトリ (neon-http)
│   │   └── schema.ts  # Drizzleスキーマ (users, listening_history)
│   ├── types/index.ts # Env Bindings型
│   └── lib/env.ts     # Zod環境変数バリデーション
└── shared/            # クライアント・サーバー共有型・バリデータ
```

ビルド出力:

- `vite build --mode client` → React SPA → `./dist/` (静的アセット)
- `vite build` → Hono API → `./dist/_worker.js`

APIエンドポイント:

- `/api/auth/*` — Spotify OAuth
- `/api/health` — ヘルスチェック

## デザイン方針

- ダークベース(#0f0f0f)、アースカラーアクセント（琥珀、深緑、スレートグレー）
- カラーパレットは `src/client/styles/index.css` の `@theme` で定義
- 地層の断面・堆積・深度をビジュアルモチーフに
- 静謐で内省的なインタラクション。派手なアニメーションより没入感重視
- Heatmapは暖色系グラデーション（淡いベージュ → 深い琥珀 → 赤褐色）

## 技術的制約

- Spotify Audio Features APIは一般開発者アクセス制限済み（2024年〜）。MVPではBPM/キーは扱わない
- Spotify APIのレート制限あり。メタデータはサーバーサイドキャッシュ必須
- 25ユーザー超でExtended Quota Mode申請が必要
- 楽曲メタデータのローカル永続保存はSpotify利用規約で制限あり。APIからの都度取得またはサーバーキャッシュで対応
- Arctic v3: confidential clientとして使用。PKCE不要、code verifierは`null`を渡す
- セッション: CookieStore方式（Spotify tokens暗号化保存、~800bytes、4KB制限内）

## 言語

- コード・コミットメッセージ・PR: 英語
- ドキュメント・ユーザー向けコミュニケーション: 日本語
