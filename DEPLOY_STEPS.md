# デプロイ手順

## ステップ1: GitHubリポジトリを作成

1. https://github.com/new にアクセス
2. Repository name: `ai-news-bot-web-tracker`
3. Public を選択
4. **"Initialize this repository with"はすべてチェックを外す**（既にローカルで初期化済み）
5. "Create repository" をクリック

作成後、以下のコマンドを実行：

```bash
cd ~/ai-news-bot-web-tracker
git remote add origin https://github.com/YOUR_USERNAME/ai-news-bot-web-tracker.git
git push -u origin main
```

## ステップ2: GitHub Personal Access Tokenを作成

1. https://github.com/settings/tokens にアクセス
2. "Generate new token" → "Generate new token (classic)"
3. Note: `ai-news-bot-web-tracker`
4. Scopes: **`repo`** にチェック（Full control of private repositories）
5. "Generate token" をクリック
6. **トークンをコピー**（この画面を閉じると二度と表示されません）

例: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## ステップ3: Vercelデプロイ

ローカルで実行：

```bash
cd ~/ai-news-bot-web-tracker
vercel login
```

ブラウザでログイン後：

```bash
vercel
```

プロンプトに従って設定：
- Set up and deploy? **Y**
- Which scope? **あなたのアカウント**
- Link to existing project? **N**
- What's your project's name? **ai-news-bot-web-tracker**
- In which directory is your code located? **./（エンター）**

## ステップ4: 環境変数を設定

```bash
vercel env add GITHUB_TOKEN
# 貼り付け: ghp_xxxxxxxxxxxx（ステップ2で作成したトークン）

vercel env add GITHUB_OWNER
# 入力: あなたのGitHubユーザー名

vercel env add GITHUB_REPO
# 入力: ai-news-bot-web-tracker
```

## ステップ5: 本番デプロイ

```bash
vercel --prod
```

デプロイ完了後、URLが表示されます（例: `https://ai-news-bot-web-tracker.vercel.app`）

## 動作確認

1. デプロイされたURLにアクセス
2. 記事一覧が表示されるか確認
3. 記事をクリック
4. GitHubリポジトリの `data/user_clicks.json` を確認
