# セットアップガイド

## 1. GitHubリポジトリ作成

```bash
cd ~/ai-news-bot-web-tracker
git init
git add .
git commit -m "Initial commit: Web tracker experiment"
gh repo create ai-news-bot-web-tracker --public --source=. --remote=origin --push
```

## 2. Vercelデプロイ

### 2.1 Vercel CLI インストール
```bash
npm install -g vercel
```

### 2.2 Vercelにログイン
```bash
vercel login
```

### 2.3 プロジェクトをデプロイ
```bash
vercel
```

プロンプトに従って設定：
- Set up and deploy? **Y**
- Which scope? **あなたのアカウント**
- Link to existing project? **N**
- What's your project's name? **ai-news-bot-web-tracker**
- In which directory is your code located? **./**

### 2.4 環境変数を設定

Vercelダッシュボードまたはコマンドラインで設定：

```bash
vercel env add GITHUB_TOKEN
# 入力: ghp_xxxxxxxxxxxx (GitHubのPersonal Access Token)

vercel env add GITHUB_OWNER
# 入力: octmarker (または自分のGitHubユーザー名)

vercel env add GITHUB_REPO
# 入力: ai-news-bot-web-tracker
```

**GitHub Personal Access Tokenの作成方法:**
1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Scopes: `repo` (Full control of private repositories)
4. Generate token してコピー

### 2.5 本番環境にデプロイ
```bash
vercel --prod
```

## 3. 動作確認

デプロイ完了後のURLにアクセス（例: `https://ai-news-bot-web-tracker.vercel.app`）

1. ニュース一覧が表示される
2. 記事をクリック
3. GitHubリポジトリの `data/user_clicks.json` が更新されているか確認

```bash
# GitHubで確認
gh repo view octmarker/ai-news-bot-web-tracker --web
```

## 4. ローカル開発

```bash
# Vercel開発サーバー起動
vercel dev
```

`http://localhost:3000` でアクセス

## 5. データ確認

```bash
# クリックデータを確認
curl https://raw.githubusercontent.com/octmarker/ai-news-bot-web-tracker/main/data/user_clicks.json | jq '.clicks | length'
```

## トラブルシューティング

### クリックが記録されない
- ブラウザのコンソールでエラーを確認
- Vercel Function Logsを確認: `vercel logs`
- GITHUB_TOKENの権限を確認

### 候補ニュースが表示されない
- ai-news-botリポジトリに今日の日付の候補ファイルが存在するか確認
- `vercel.json` のrewritesが正しく動作しているか確認

## 次のステップ

データが蓄積されたら：
1. `user_clicks.json` を分析
2. 最も興味を持たれたカテゴリ・トピックを特定
3. ai-news-botの `user_preferences.json` に統合
