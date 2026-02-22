# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## エージェント階層と役割分担

- **殿（ユーザー）**: 最終意思決定者。指示を出し、成果を確認・承認する
- **家臣（メインエージェント）**: 殿の命を受け、足軽を指揮する管理役。
  - 自ら直接コードの作成や調査を行ってはならない。点検のためにコードを読むのは構わないが、実作業はすべて足軽に委任すること。
  - 必ず足軽エージェント（Taskツール）を生成し、実作業を委任すること。
  - 家臣の責務は足軽への指示・進捗管理・殿への報告に徹する。
  - 足軽の仕事を点検し、足軽の成果物が正しいことに責任を持つ。
- **足軽（サブエージェント）**:Taskツールで生成される実働部隊。
  - 家臣から指示された分野の専門家としての自覚を持ち、コードの読み書き、検索、調査、ビルド、テスト等の実作業を担当する

## 開発ワークフロー

1. 殿が家来にタスクを指示
2. 家臣はエージェントチームで足軽エージェントを生成し、並行して/contextタスクを割り当てる
3. 足軽はタスクを実行し、結果を家臣に報告する
4. 家臣は足軽の成果物を確認し、問題がなければ殿に報告する
5. 殿は成果物を確認し、承認または修正指示を行う

## git運用規則

開発する際は、必ず以下のフローを守ること。mainブランチへの直接変更は禁止。

1. **ブランチを切る**: `feature/xxx` で分岐してから着手。mainで直接作業しない
2. **コミット**: 適切な粒度でブランチにコミットする。1コミット = 1つの論理的変更。まとめてドカンと入れない
3. **変更を反映**: ブランチ上でコードを変更し、devサーバーで動作する状態にする
4. **殿（ユーザー）の確認**: ブラウザで表示・動作を確認してもらい、承認を得る
5. **mainへマージ**: コミット後にmainブランチへマージ

- コミットメッセージは英語、Conventional Commits形式（`feat:`, `fix:`, `refactor:` 等）


### テストルール

- **新機能追加時**: 対応するテストファイルを必ず作成すること
- **バグ修正時**: 再発防止のリグレッションテストを含めること
- **D3.js可視化**: データ変換ロジックのテストに集中し、DOM操作のテストは行わない
- **サーバールート**: `app.request()` を使ったHTTPレベルのテスト
- **外部API**: MSWでモック（Spotify API等）、実際のAPI呼び出しはテスト内で行わない

### テストファイル規約

- テストファイルはソースファイルと同じディレクトリに配置（co-located）
- 命名規則: `*.test.ts`（サーバー）、`*.test.tsx`（クライアント）
- 共有モック・フィクスチャ: `src/test/` ディレクトリ
- 設定ファイル: `vitest.config.ts`（プロジェクトルート）
  
## プロジェクト概要

Strata — 「サブスクの海に、自分だけの『レコード棚』を取り戻す」音楽パーソナル・アーカイブアプリ。

Spotifyの再生履歴を時間軸で深掘りし、「熱量の地層」としてエモーショナルに可視化する。ソーシャル機能は意図的に排除し、「自分と音楽の1対1の対話」に特化。

## プロダクト要件

企画書: `docs/PROJECT_PROPOSAL.md`

### 実装済み機能

1. Spotify OAuth認証 + メタデータ取得（ジャケット画像等）
2. Spotify Extended Streaming History（JSON / ZIP）インポート・パース
3. The Vault — 2カラムブラウザ（Artist/Album）、アルバムアート、Spotify Embedプレイヤー
4. Fandom Heatmap — アーティスト別再生頻度の時間軸可視化（GitHub草スタイル）
5. Listening Patterns — 時間帯・曜日・季節別の再生傾向、デバイス分析、シャッフル分析
6. Era Map — D3.js streamgraphによるアーティスト変遷の可視化
7. Listening Autobiography — 再生履歴から自動生成する音楽的自伝
8. Mosaic — 月別トップアルバムのアートワーク・タイムライン
9. Export — 年間サマリーの閲覧・エクスポート
10. Dashboard — Time Capsule、Dormant Artists、Drift Report等の統合ビュー

### 未実装（後続フェーズ）

- Continuous Scrobbling、BPM/キー音響データ、Sonic Lineage、Beautiful Noise

## 技術スタック

- **API**: Hono (Cloudflare Pages Functions)
- **フロントエンド**: React 19 + Vite 7
- **スタイリング**: Tailwind CSS v4 (CSS-first設定)
- **DB**: Neon (serverless PostgreSQL) + Drizzle ORM (neon-http driver)
- **バリデーション**: Zod
- **認証**: Arctic v3 (Spotify OAuth, confidential client)
- **セッション**: hono-sessions (CookieStore, 暗号化Cookie)
- **データ可視化**: D3.js
- **ZIP展開**: fflate (クライアントサイド)
- **プレイヤー**: Spotify Embed (iframe, Premium不要)
- **画像生成**: @cf-wasm/og (Satori + resvg, Workers互換)
- **ホスティング**: Cloudflare Pages
- **APM**: New Relic

### テストフレームワーク

- **テストランナー**: Vitest (Vite-native)
- **コンポーネントテスト**: React Testing Library + user-event
- **APIモック**: MSW (Mock Service Worker)
- **DOM環境**: jsdom (クライアントテスト用)

## アーキテクチャ

Single-repo、dual-build構成。`@hono/vite-dev-server`で開発時は単一ポート(5173)でSPA + APIを同時配信。

```text
src/
├── client/                    # React SPA
│   ├── main.tsx               # エントリポイント (BrowserRouter)
│   ├── App.tsx                # ルーティング定義
│   ├── lib/
│   │   ├── api.ts             # /api/* への型付きfetchラッパー
│   │   └── auth.tsx           # AuthProvider (認証コンテキスト)
│   ├── components/
│   │   ├── Layout.tsx         # サイドバーナビ + レスポンシブ対応
│   │   ├── ProtectedRoute.tsx # 認証ガード
│   │   ├── ColumnBrowser.tsx  # 2カラムブラウザ (Artist/Album)
│   │   ├── ConfirmDialog.tsx  # 確認ダイアログ
│   │   └── Toast.tsx          # トースト通知システム
│   ├── pages/
│   │   ├── Dashboard.tsx      # ダッシュボード（統計 + Time Capsule等）
│   │   ├── Import.tsx         # JSON/ZIPインポート
│   │   ├── Vault.tsx          # 楽曲一覧 + プレイヤー
│   │   ├── Heatmap.tsx        # D3.js Fandom Heatmap
│   │   ├── Patterns.tsx       # D3.js リスニングパターン
│   │   ├── EraMap.tsx         # D3.js streamgraph（アーティスト変遷）
│   │   ├── Autobiography.tsx  # 音楽的自伝（ナラティブ生成）
│   │   ├── Mosaic.tsx         # 月別アルバムアート・タイムライン
│   │   └── Export.tsx         # 年間サマリー・エクスポート
│   └── styles/index.css       # Tailwind v4テーマ定義 (@theme)
├── server/                    # Hono API
│   ├── index.ts               # Honoエントリ、ルートマウント
│   ├── middleware/session.ts  # セッション管理 + authGuardミドルウェア
│   ├── routes/
│   │   ├── auth.ts            # Spotify OAuth (login/callback/me/logout)
│   │   ├── import.ts          # 再生履歴インポート (POST /history, GET /status, DELETE /data)
│   │   ├── vault.ts           # Vault API (tracks/artists/albums/metadata/stats/autobiography/mosaic/time-capsule/dormant-artists/drift-report/annual-summary)
│   │   ├── heatmap.ts         # Heatmap API (data/artists/summary)
│   │   ├── patterns.ts        # Patterns API (hourly/weekly/monthly/overview/time-artists/devices/shuffle)
│   │   └── strata.ts          # Era Map API (eras — streamgraph用月別アーティストデータ)
│   ├── db/
│   │   ├── index.ts           # createDb() ファクトリ (neon-http)
│   │   └── schema.ts          # Drizzleスキーマ (users, listening_history)
│   ├── lib/
│   │   ├── spotify.ts         # Spotify API ユーティリティ (メタデータ取得, アーティスト検索, トークン管理)
│   │   └── env.ts             # Zod環境変数バリデーション
│   └── types/index.ts         # Env Bindings型
└── shared/                    # クライアント・サーバー共有
    ├── types/index.ts         # User, ApiResponse<T>, AuthState型
    └── validators/history.ts  # Extended Streaming History Zodスキーマ
```

ビルド出力:

- `vite build --mode client` → React SPA → `./dist/` (静的アセット)
- `vite build` → Hono API → `./dist/_worker.js`

## APIエンドポイント

- `/api/auth/*` — Spotify OAuth (login, callback, me, logout)
- `/api/import/*` — 再生履歴インポート (POST /history, GET /status, DELETE /data)
- `/api/vault/*` — Vault (tracks, artists, albums, metadata, stats, autobiography, mosaic, time-capsule, dormant-artists, drift-report, annual-summary)
- `/api/heatmap/*` — Heatmap (data, artists, summary)
- `/api/patterns/*` — Patterns (hourly, weekly, monthly, overview, time-artists, devices, shuffle)
- `/api/strata/*` — Era Map (eras — streamgraph用月別データ)
- `/api/health` — ヘルスチェック

## デザイン方針

- ダークベース(#0f0f0f)、アースカラーアクセント（琥珀、深緑、スレートグレー）
- カラーパレットは `src/client/styles/index.css` の `@theme` で定義
- 地層の断面・堆積・深度をビジュアルモチーフに
- 静謐で内省的なインタラクション。派手なアニメーションより没入感重視
- Heatmapは暖色系グラデーション（淡いベージュ → 深い琥珀 → 赤褐色）

## 開発環境の注意点

- Viteは `127.0.0.1` にバインド（IPv6 `localhost` だとSpotify redirect URIと不一致になる）
- Spotify Developer Appの redirect URI: `http://127.0.0.1:5173/api/auth/callback`
- 環境変数は `.env` に配置（`.dev.vars` ではない）。`drizzle.config.ts` が dotenv で読み込む
- `db:push` は `--force` フラグで確認プロンプトをスキップ可能

## 言語

- コード・コミットメッセージ・PR: 英語
- ドキュメント・ユーザー向けコミュニケーション: 日本語
