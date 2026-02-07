# AI News Bot - Web Tracker (Experimental)

Webアプリでの記事クリックを追跡してユーザー興味を学習する実験プロジェクト

## アーキテクチャ

- **フロントエンド**: 静的HTML + JavaScript（記事一覧・詳細ページ）
- **バックエンド**: Vercel Serverless Functions（クリック追跡API）
- **データ保存**: GitHub API経由で `user_clicks.json` に保存

## ファイル構成

```
/public
  /index.html          # 記事一覧ページ
  /article.html        # 記事詳細ページ
  /news-loader.js      # 記事読み込み + クリック追跡
/api
  /track-click.js      # Vercel Function: クリック記録
/data
  /user_clicks.json    # クリック履歴（GitHubに保存）
```

## セットアップ

1. GitHubリポジトリ作成
2. Vercel連携
3. 環境変数設定（GITHUB_TOKEN, REPO_NAME）

## データフロー

1. ユーザーが記事一覧で記事をクリック
2. `news-loader.js` がクリックイベントをキャプチャ
3. `/api/track-click` にPOST
4. Vercel FunctionがGitHub APIで `user_clicks.json` を更新
5. 将来的に ai-news-bot の学習データとして統合
