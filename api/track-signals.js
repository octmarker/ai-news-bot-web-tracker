/**
 * Vercel Serverless Function - Batch track article signals
 * Saves multiple positive/negative signals to GitHub in a single commit
 */

export default async function handler(req, res) {
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
        const { signals } = req.body;

        if (!Array.isArray(signals) || signals.length === 0) {
            return res.status(400).json({ error: 'signals array is required' });
        }

        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const GITHUB_OWNER = process.env.GITHUB_OWNER || 'octmarker';
        const GITHUB_REPO = process.env.GITHUB_REPO || 'ai-news-bot-web-tracker';
        const CLICKS_FILE = 'data/user_clicks.json';

        if (!GITHUB_TOKEN) {
            throw new Error('GITHUB_TOKEN not configured');
        }

        // GitHubから既存データを取得
        const existingData = await fetchFromGitHub(GITHUB_OWNER, GITHUB_REPO, CLICKS_FILE, GITHUB_TOKEN);

        // シグナルを追記
        for (const signal of signals) {
            existingData.clicks.push({
                type: signal.type || 'positive',
                article_number: signal.article_number,
                title: signal.title,
                url: signal.url,
                category: signal.category,
                source: signal.source,
                clicked_at: signal.timestamp
            });
        }

        // コミットメッセージ生成
        const positiveCount = signals.filter(s => s.type === 'positive').length;
        const negativeCount = signals.filter(s => s.type === 'negative').length;
        const parts = [];
        if (positiveCount > 0) parts.push(`+${positiveCount} positive`);
        if (negativeCount > 0) parts.push(`-${negativeCount} negative`);
        const commitMessage = `Track signals: ${parts.join(', ')}`;

        // GitHubに保存（1コミット）
        await saveToGitHub(GITHUB_OWNER, GITHUB_REPO, CLICKS_FILE, existingData, GITHUB_TOKEN, commitMessage);

        return res.status(200).json({
            success: true,
            message: commitMessage,
            total_clicks: existingData.clicks.length
        });

    } catch (error) {
        console.error('Error tracking signals:', error);
        return res.status(500).json({
            error: 'Failed to track signals',
            message: error.message
        });
    }
}

async function fetchFromGitHub(owner, repo, path, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            return { clicks: [], created_at: new Date().toISOString() };
        }

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const existingData = JSON.parse(content);
        existingData._sha = data.sha;
        return existingData;

    } catch (error) {
        console.error('Error fetching from GitHub:', error);
        return { clicks: [], created_at: new Date().toISOString() };
    }
}

async function saveToGitHub(owner, repo, path, data, token, commitMessage) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const { _sha, ...dataToSave } = data;
    const content = Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64');

    const body = {
        message: commitMessage,
        content,
        ...(_sha && { sha: _sha })
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
