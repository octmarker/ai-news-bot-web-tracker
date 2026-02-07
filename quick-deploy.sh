#!/bin/bash

echo "🚀 AI News Bot Web Tracker - Quick Deploy Script"
echo ""

# GitHubユーザー名
GITHUB_USER="octmarker"
REPO_NAME="ai-news-bot-web-tracker"

echo "📦 Step 1: Creating GitHub repository..."
echo "Please create a new repository manually at:"
echo "👉 https://github.com/new"
echo ""
echo "Repository settings:"
echo "  - Name: ${REPO_NAME}"
echo "  - Visibility: Public"
echo "  - Do NOT initialize with README"
echo ""
read -p "Press Enter after creating the repository..."

echo ""
echo "📤 Step 2: Pushing to GitHub..."
cd ~/ai-news-bot-web-tracker
git remote add origin https://github.com/${GITHUB_USER}/${REPO_NAME}.git 2>/dev/null || git remote set-url origin https://github.com/${GITHUB_USER}/${REPO_NAME}.git
git push -u origin main

if [ $? -ne 0 ]; then
    echo "❌ Failed to push to GitHub. Please check your credentials."
    exit 1
fi

echo "✅ Pushed to GitHub successfully!"
echo ""

echo "🔑 Step 3: Creating GitHub Personal Access Token..."
echo "Please create a token at:"
echo "👉 https://github.com/settings/tokens/new"
echo ""
echo "Token settings:"
echo "  - Note: ${REPO_NAME}"
echo "  - Scopes: [✓] repo"
echo ""
read -p "Enter your GitHub token: " GITHUB_TOKEN

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Token is required. Exiting."
    exit 1
fi

echo ""
echo "🚀 Step 4: Deploying to Vercel..."
vercel --prod --yes

if [ $? -ne 0 ]; then
    echo "❌ Vercel deployment failed. Running manual setup..."
    vercel
fi

echo ""
echo "⚙️  Step 5: Setting up environment variables..."
echo "$GITHUB_TOKEN" | vercel env add GITHUB_TOKEN production
echo "$GITHUB_USER" | vercel env add GITHUB_OWNER production
echo "$REPO_NAME" | vercel env add GITHUB_REPO production

echo ""
echo "🔄 Step 6: Redeploying with environment variables..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your site is live at:"
vercel ls | grep production | awk '{print $2}'
