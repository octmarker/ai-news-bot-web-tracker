/**
 * Vercel Serverless Function - Track article clicks
 * Saves click data to GitHub repository
 */

export default async function handler(req, res) {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { article_number, title, url, category, source, clicked_at } = req.body;

        // 環境変数からGitHub設定を取得
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_OWNER = process.env.GITHUB_OWNER || 'octmarker';
        const GITHUB_REPO = process.env.GITHUB_REPO || 'ai-news-bot-web-tracker';
        const CLICKS_FILE = 'data/user_clicks.json';

        if (!GITHUB_TOKEN) {
            throw new Error('GITHUB_TOKEN not configured');
        }

        // GitHubから既存のクリックデータを取得
        const existingData = await fetchClicksFromGitHub(
            GITHUB_OWNER,
            GITHUB_REPO,
            CLICKS_FILE,
            GITHUB_TOKEN
        );

        // 新しいクリックを追加
        existingData.clicks.push({
            article_number,
            title,
            url,
            category,
            source,
            clicked_at
        });

        // GitHubに保存
        await saveClicksToGitHub(
            GITHUB_OWNER,
            GITHUB_REPO,
            CLICKS_FILE,
            existingData,
            GITHUB_TOKEN
        );

        return res.status(200).json({
            success: true,
            message: 'Click tracked successfully',
            total_clicks: existingData.clicks.length
        });

    } catch (error) {
        console.error('Error tracking click:', error);
        return res.status(500).json({
            error: 'Failed to track click',
            message: error.message
        });
    }
}

/**
 * GitHubからクリックデータを取得
 */
async function fetchClicksFromGitHub(owner, repo, path, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            // ファイルが存在しない場合は初期データを返す
            return {
                clicks: [],
                created_at: new Date().toISOString()
            };
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const existingData = JSON.parse(content);

        // shaを保存（更新時に必要）
        existingData._sha = data.sha;
        return existingData;

    } catch (error) {
        console.error('Error fetching from GitHub:', error);
        // エラー時は初期データを返す
        return {
            clicks: [],
            created_at: new Date().toISOString()
        };
    }
}

/**
 * GitHubにクリックデータを保存
 */
async function saveClicksToGitHub(owner, repo, path, data, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const { _sha, ...dataToSave } = data;
    const content = Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64');

    const body = {
        message: `Track click: ${dataToSave.clicks[dataToSave.clicks.length - 1].title}`,
        content,
        ...(data._sha && { sha: data._sha })
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
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
