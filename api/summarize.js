/**
 * Vercel Serverless Function - Fetch article content and generate AI summary
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { url, title } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // 1. 元記事のHTMLを取得
        const articleContent = await fetchArticleContent(url);

        // 2. Gemini APIで要約生成
        const summary = await generateSummary(title, articleContent);

        return res.status(200).json({
            success: true,
            article_text: articleContent,
            ai_summary: summary
        });

    } catch (error) {
        console.error('Summarize error:', error);
        return res.status(500).json({
            error: 'Failed to summarize',
            message: error.message
        });
    }
}

/**
 * 元記事のHTMLを取得してテキスト抽出
 */
async function fetchArticleContent(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BrieflyAI/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'ja,en;q=0.9'
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        return extractMainContent(html);
    } catch (error) {
        console.error('Fetch error:', error.message);
        return '';
    }
}

/**
 * HTMLからメインコンテンツを抽出
 */
function extractMainContent(html) {
    // scriptタグ、styleタグ、navタグなどを除去
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '');

    // article タグの中身を優先
    const articleMatch = text.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
        text = articleMatch[1];
    } else {
        // main タグの中身
        const mainMatch = text.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
        if (mainMatch) text = mainMatch[1];
    }

    // HTMLタグを除去
    text = text.replace(/<[^>]+>/g, ' ');
    // 連続する空白・改行を整理
    text = text.replace(/\s+/g, ' ').trim();
    // 最大5000文字に制限
    return text.substring(0, 5000);
}

/**
 * Gemini APIで要約生成
 */
async function generateSummary(title, articleContent) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `あなたはニュース記事の要約エキスパートです。以下の記事を日本語で要約してください。

【記事タイトル】
${title}

【記事本文】
${articleContent || '（本文の取得に失敗しました。タイトルから推測して要約してください）'}

【出力形式】
以下のJSON形式で出力してください。JSON以外は出力しないでください：
{
  "headline": "記事の一言見出し（30字以内）",
  "key_points": ["ポイント1", "ポイント2", "ポイント3"],
  "detailed_summary": "200〜300字の詳細要約。記事の背景、主要な事実、影響や意義を含む",
  "why_it_matters": "なぜこのニュースが重要なのかを1〜2文で"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse AI response');

    return JSON.parse(jsonMatch[0]);
}
