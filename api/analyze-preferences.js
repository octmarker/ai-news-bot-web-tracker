/**
 * Vercel Cron Function - Gemini-powered preference analysis
 * Reads user_clicks.json, analyzes with Gemini, updates user_preferences.json
 * Schedule: 23:30 UTC daily (8:30 JST, before 9:00 JST candidate generation)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN;
const GITHUB_OWNER = () => process.env.GITHUB_OWNER || 'octmarker';
const TRACKER_REPO = () => process.env.GITHUB_REPO || 'ai-news-bot-web-tracker';
const BOT_REPO = () => 'ai-news-bot';

export default async function handler(req, res) {
    // Cron認証
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. user_clicks.json を取得
        const clicksData = await fetchFromGitHub(
            GITHUB_OWNER(), TRACKER_REPO(), 'data/user_clicks.json'
        );
        const clicks = clicksData.clicks || [];

        if (clicks.length === 0) {
            console.log('No clicks to analyze');
            return res.status(200).json({ success: true, message: 'No clicks to analyze' });
        }

        // 2. 現在の user_preferences.json を取得
        const currentPrefs = await fetchFromGitHub(
            GITHUB_OWNER(), BOT_REPO(), 'user_preferences.json'
        );

        // 3. Gemini で分析
        const analysis = await analyzeWithGemini(clicks, currentPrefs);

        // 4. user_preferences.json を更新
        const updatedPrefs = {
            ...currentPrefs,
            search_config: analysis,
            learning_phase: analysis.learning_phase,
            last_updated: new Date().toISOString(),
        };
        delete updatedPrefs._sha;
        delete updatedPrefs.search_config.learning_phase;

        await saveToGitHub(
            GITHUB_OWNER(), BOT_REPO(), 'user_preferences.json',
            updatedPrefs, currentPrefs._sha,
            `Update preferences via Gemini analysis (${clicks.length} clicks)`
        );

        console.log('Preferences updated successfully');
        return res.status(200).json({
            success: true,
            clicks_analyzed: clicks.length,
            boosted_keywords: analysis.boosted_keywords,
            learning_phase: analysis.learning_phase
        });

    } catch (error) {
        console.error('Analyze preferences error:', error);
        return res.status(500).json({
            error: 'Failed to analyze preferences',
            message: error.message
        });
    }
}

/**
 * Gemini でクリック履歴を分析し、プリファレンスプロファイルを生成
 */
async function analyzeWithGemini(clicks, currentPrefs) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // クリック履歴をサマリー化
    const clickSummary = clicks.map(c => ({
        type: c.type || 'positive',
        title: c.title,
        category: c.category,
        source: c.source,
        date: (c.clicked_at || '').slice(0, 10)
    }));

    const currentConfig = currentPrefs.search_config || {};

    const prompt = `あなたはニュースパーソナライゼーションの専門家です。
ユーザーのクリック履歴を分析し、ニュース候補生成のためのプリファレンスプロファイルを生成してください。

## クリック履歴
${JSON.stringify(clickSummary, null, 2)}

## 現在のプリファレンス設定
${JSON.stringify(currentConfig, null, 2)}

## 分析の指針
- **positive**: ユーザーが興味を持ってクリックした記事
- **negative**: ユーザーが「興味なし」と明示的に拒否した記事
- クリックされたタイトル・カテゴリ・ソースからユーザーの興味パターンを抽出
- negativeシグナルは、そのトピック/ソースへの関心が低いことを示す
- 現在の設定を参考にしつつ、新しいクリックデータを反映して更新
- 急激な変化は避け、段階的に調整する

## 出力形式
以下のJSON形式で出力してください。JSON以外は出力しないでください：
{
  "boosted_keywords": ["ユーザーが関心を持つキーワード（5-15個）"],
  "suppressed_keywords": ["ユーザーが関心を持たないキーワード（0-10個）"],
  "preferred_sources": ["信頼するニュースソース（0-5個）"],
  "category_distribution": {
    "ai": 0.0-1.0,
    "finance": 0.0-1.0,
    "politics": 0.0-1.0,
    "other": 0.0-1.0
  },
  "serendipity_ratio": 0.0-0.2,
  "learning_phase": 0-3
}

## learning_phase の判定基準
- 0: クリック5件未満（データ不足、デフォルト設定を維持）
- 1: 5-15件（初期学習、boosted_keywordsのみ設定）
- 2: 15-30件（中期学習、全フィールドを設定）
- 3: 30件以上（成熟、セレンディピティ枠も有効化）

## 注意
- learning_phase 0の場合、boosted_keywords と suppressed_keywords は空配列にする
- category_distribution の値の合計は1.0になるようにする
- serendipity_ratio は learning_phase 3 の場合のみ 0.1-0.2、それ以外は 0.0`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse Gemini response');

    const analysis = JSON.parse(jsonMatch[0]);

    // バリデーション
    if (!Array.isArray(analysis.boosted_keywords)) analysis.boosted_keywords = [];
    if (!Array.isArray(analysis.suppressed_keywords)) analysis.suppressed_keywords = [];
    if (!Array.isArray(analysis.preferred_sources)) analysis.preferred_sources = [];
    if (typeof analysis.category_distribution !== 'object') analysis.category_distribution = {};
    if (typeof analysis.serendipity_ratio !== 'number') analysis.serendipity_ratio = 0.0;
    if (typeof analysis.learning_phase !== 'number') analysis.learning_phase = 0;

    return analysis;
}

/**
 * GitHub APIからファイルを読み込み
 */
async function fetchFromGitHub(owner, repo, path) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN()}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    if (response.status === 404) {
        return {};
    }

    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} for ${repo}/${path}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsed = JSON.parse(content);
    parsed._sha = data.sha;
    return parsed;
}

/**
 * GitHub APIにファイルを保存
 */
async function saveToGitHub(owner, repo, path, data, sha, commitMessage) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const content = Buffer.from(JSON.stringify(data, null, 4)).toString('base64');

    const body = {
        message: commitMessage,
        content,
        ...(sha && { sha })
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN()}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to save to GitHub: ${error}`);
    }

    return await response.json();
}
