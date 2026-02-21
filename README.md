# Strata

> サブスクの海に、自分だけの「レコード棚」を取り戻す

Spotifyの再生履歴を時間軸で深掘りし、「熱量の地層」としてエモーショナルに可視化する音楽パーソナル・アーカイブアプリ。ソーシャル機能は意図的に排除し、「自分と音楽の1対1の対話」に特化。

## 主な機能

- **The Vault** — 累計再生回数ランキング。トラック別・アーティスト別の集計、検索・ソート・ページネーション
- **Fandom Heatmap** — GitHub草スタイルのD3.js日別再生ヒートマップ。アーティスト/年フィルタ対応
- **Listening Patterns** — 時間帯・曜日・月別のリスニング傾向をD3.jsチャートで可視化
- **Streaming History Import** — Spotify Extended Streaming History（JSON）のドラッグ&ドロップインポート

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19, Vite 7, Tailwind CSS v4 |
| API | Hono |
| DB | Neon (serverless PostgreSQL), Drizzle ORM |
| 認証 | Arctic v3 (Spotify OAuth) |
| セッション | hono-sessions (暗号化Cookie) |
| データ可視化 | D3.js |
| バリデーション | Zod |
| ホスティング | Cloudflare Pages |

## セットアップ

### 前提条件

- Node.js 20+
- [Neon](https://neon.tech) PostgreSQL データベース
- [Spotify Developer](https://developer.spotify.com/dashboard) アプリ
  - Redirect URI: `http://localhost:5173/api/auth/callback`

### インストール

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.example .env
```

`.env` を編集:

```env
DATABASE_URL=postgresql://user:pass@ep-xxxxx.neon.tech/strata?sslmode=require
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SESSION_ENCRYPTION_KEY=32文字以上のランダム文字列
ENVIRONMENT=development
```

```bash
# データベーステーブルの作成
npm run db:push
```

### 起動

```bash
npm run dev
```

`http://localhost:5173` で起動します。

## 開発コマンド

```bash
npm run dev         # 開発サーバー (localhost:5173)
npm run build       # プロダクションビルド (SPA + _worker.js)
npm run preview     # Wrangler でビルド確認
npm run typecheck   # TypeScript 型チェック
npm run lint        # ESLint
npm run format      # Prettier

# DB操作
npm run db:generate # マイグレーションファイル生成
npm run db:migrate  # マイグレーション実行
npm run db:push     # スキーマをDBに直接反映
npm run db:studio   # Drizzle Studio（DBブラウザ）
```

## プロジェクト構成

```
src/
├── client/                 # React SPA
│   ├── main.tsx            # エントリポイント
│   ├── App.tsx             # ルーティング定義
│   ├── lib/
│   │   ├── api.ts          # 型付きfetchラッパー
│   │   └── auth.tsx        # 認証コンテキスト
│   ├── components/
│   │   ├── Layout.tsx      # サイドバー付きレイアウト
│   │   └── ProtectedRoute.tsx  # 認証ガード
│   ├── pages/
│   │   ├── Dashboard.tsx   # ダッシュボード
│   │   ├── Vault.tsx       # The Vault
│   │   ├── Heatmap.tsx     # Fandom Heatmap
│   │   ├── Patterns.tsx    # Listening Patterns
│   │   └── Import.tsx      # 履歴インポート
│   └── styles/
│       └── index.css       # Tailwind v4 テーマ定義
├── server/                 # Hono API
│   ├── index.ts            # ルートマウント
│   ├── middleware/
│   │   └── session.ts      # セッション・認証ミドルウェア
│   ├── routes/
│   │   ├── auth.ts         # Spotify OAuth
│   │   ├── import.ts       # 履歴インポートAPI
│   │   ├── vault.ts        # The Vault API
│   │   ├── heatmap.ts      # Heatmap API
│   │   └── patterns.ts     # Patterns API
│   ├── lib/
│   │   ├── env.ts          # 環境変数バリデーション
│   │   └── spotify.ts      # Spotifyトークン管理・メタデータ取得
│   ├── db/
│   │   ├── index.ts        # DB接続ファクトリ
│   │   └── schema.ts       # Drizzleスキーマ
│   └── types/
│       └── index.ts        # 環境変数型定義
└── shared/                 # クライアント・サーバー共有
    ├── types/
    │   └── index.ts        # 共有型定義
    └── validators/
        └── history.ts      # 履歴JSONバリデータ
```

## APIエンドポイント

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/auth/login` | Spotify OAuth開始 |
| GET | `/api/auth/callback` | OAuthコールバック |
| GET | `/api/auth/me` | 認証ユーザー情報 |
| POST | `/api/auth/logout` | ログアウト |
| POST | `/api/import/history` | 履歴JSONインポート |
| GET | `/api/import/status` | インポート状況確認 |
| GET | `/api/vault/tracks` | トラック集計一覧 |
| GET | `/api/vault/artists` | アーティスト集計一覧 |
| GET | `/api/vault/stats` | 全体統計 |
| GET | `/api/heatmap/data` | 日別再生データ |
| GET | `/api/heatmap/artists` | ヒートマップ用アーティスト一覧 |
| GET | `/api/heatmap/summary` | ヒートマップ統計 |
| GET | `/api/patterns/hourly` | 時間帯別集計 |
| GET | `/api/patterns/weekly` | 曜日別集計 |
| GET | `/api/patterns/monthly` | 月別集計 |
| GET | `/api/patterns/overview` | パターン概要 |

## 使い方

1. トップページから **Spotifyでログイン**
2. **Import** ページで Extended Streaming History の JSON ファイルをアップロード
   - Spotifyアカウント設定 → プライバシー設定 → 「データをダウンロード」から取得可能
3. **The Vault** で再生ランキングを確認
4. **Fandom Heatmap** で日々の再生熱量を地層として俯瞰
5. **Listening Patterns** で自分のリスニング癖を発見

## ライセンス

Private
