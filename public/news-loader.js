/**
 * News Loader - Fetches and parses AI News Bot candidates markdown files
 */

class NewsLoader {
    constructor() {
        this.categoryMap = {
            'AI・テクノロジー': { label: 'テクノロジー', color: 'bg-primary' },
            '経済・金融': { label: '経済', color: 'bg-charcoal' },
            '政治・政策': { label: '政治', color: 'bg-primary/80' },
            '科学': { label: '科学', color: 'bg-primary/80' }
        };
        this.trackingEnabled = true;
        this.trackedKeys = new Set(JSON.parse(localStorage.getItem('trackedClicks') || '[]'));
    }

    /**
     * Track article click to backend (1回のみ)
     */
    async trackClick(article) {
        if (!this.trackingEnabled) return;

        const key = `${this.getLatestCandidatesDate()}_${article.number}`;
        if (this.trackedKeys.has(key)) return;

        this.trackedKeys.add(key);
        localStorage.setItem('trackedClicks', JSON.stringify([...this.trackedKeys]));

        try {
            await fetch('/api/track-click', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    article_number: article.number,
                    title: article.title,
                    url: article.url,
                    category: article.category,
                    source: article.source,
                    clicked_at: new Date().toISOString()
                })
            });
            console.log('Click tracked:', article.title);
        } catch (error) {
            console.error('Failed to track click:', error);
        }
    }

    /**
     * Get the latest candidates file date
     */
    getLatestCandidatesDate() {
        const now = new Date();
        return now.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    /**
     * Fetch candidates markdown file
     */
    async fetchCandidates(date = null) {
        const targetDate = date || this.getLatestCandidatesDate();

        // GitHub APIから直接取得（ローカルfile://でも動作する）
        const ghUrl = `https://api.github.com/repos/octmarker/ai-news-bot/contents/news/${targetDate}-candidates.md`;

        try {
            const response = await fetch(ghUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch candidates: ${response.status}`);
            }
            const data = await response.json();
            const binary = atob(data.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('Error fetching candidates:', error);
            throw error;
        }
    }

    /**
     * Parse markdown content to extract articles
     */
    parseMarkdown(markdown) {
        const articles = [];
        let currentCategory = '科学';

        // Split by lines
        const lines = markdown.split('\n');

        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();

            // Check for category header (## カテゴリ名)
            if (line.startsWith('## ') && !line.includes('📰')) {
                const categoryText = line.substring(3).trim();
                // Map to our category system
                for (const [key, value] of Object.entries(this.categoryMap)) {
                    if (categoryText.includes(key.split('・')[0])) {
                        currentCategory = key;
                        break;
                    }
                }
                i++;
                continue;
            }

            // Check for article number (e.g., "1. Title" or "10. Title")
            const articleMatch = line.match(/^(\d+)\.\s+(.+)$/);
            if (articleMatch) {
                const articleNum = parseInt(articleMatch[1]);
                const title = articleMatch[2].trim();

                // Next line should have source and description
                i++;
                const metaLine = lines[i]?.trim() || '';
                const sourceMatch = metaLine.match(/📰\s+([^|]+)\s*\|\s*💡\s+(.+)/);

                let source = 'ニュースソース';
                let description = '';

                if (sourceMatch) {
                    source = sourceMatch[1].trim();
                    description = sourceMatch[2].trim();
                }

                // Next line should have URL
                i++;
                const urlLine = lines[i]?.trim() || '';
                const urlMatch = urlLine.match(/URL:\s*\[?([^\]]+)\]?/);
                const url = urlMatch ? urlMatch[1].trim() : '#';

                // Calculate relevance score based on position
                const relevance = this.calculateRelevance(articleNum);

                articles.push({
                    number: articleNum,
                    title,
                    source,
                    description,
                    url,
                    category: currentCategory,
                    relevance
                });
            }

            i++;
        }

        return articles;
    }

    /**
     * Calculate relevance score based on article position
     */
    calculateRelevance(position) {
        if (position <= 3) return 95 + (4 - position);
        if (position <= 6) return 90 + (7 - position);
        return Math.max(85, 95 - position);
    }

    /**
     * Get category badge info
     */
    getCategoryInfo(category) {
        return this.categoryMap[category] || { label: '科学', color: 'bg-primary/80' };
    }

    /**
     * Calculate reading time (estimate based on description length)
     */
    calculateReadingTime(description) {
        const words = description.length;
        const minutes = Math.max(2, Math.ceil(words / 200));
        return minutes;
    }

    /**
     * Format time ago (e.g., "5分前", "1時間前")
     */
    formatTimeAgo(articleNumber) {
        // Simulate time based on article position
        if (articleNumber <= 2) return `${articleNumber * 5}分前`;
        if (articleNumber <= 5) return `${articleNumber * 10}分前`;
        return `${articleNumber}時間前`;
    }

    /**
     * Load and render articles
     */
    async loadAndRender(containerId = 'news-articles-container', dateElementId = 'current-date') {
        try {
            console.log('Loading news candidates...');

            // Fetch markdown
            const markdown = await this.fetchCandidates();

            // Parse articles
            const articles = this.parseMarkdown(markdown);
            console.log(`Parsed ${articles.length} articles`);

            // Render articles
            this.renderArticles(articles, containerId);

            // Update date
            this.updateDate(dateElementId);

            return articles;
        } catch (error) {
            console.error('Error loading news:', error);
            this.renderError(containerId);
            throw error;
        }
    }

    /**
     * Render articles to DOM
     */
    renderArticles(articles, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container #${containerId} not found`);
            return;
        }

        container.innerHTML = articles.map((article, index) => {
            const categoryInfo = this.getCategoryInfo(article.category);
            const readingTime = this.calculateReadingTime(article.description);
            const timeAgo = this.formatTimeAgo(article.number);
            const borderClass = index > 0 ? 'pt-10 border-t border-paper-border' : '';

            return `
                <article class="group relative ${borderClass}" data-article='${JSON.stringify(article)}'>
                    <a class="block article-link" href="article.html?id=${article.number}&date=${this.getLatestCandidatesDate()}" data-original-url="${article.url}">
                        <div class="flex flex-col gap-4">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="px-2 py-0.5 rounded-sm text-[10px] font-bold ${categoryInfo.color} text-paper-bg tracking-widest uppercase">${categoryInfo.label}</span>
                                    <span class="text-charcoal-muted text-xs font-bold serif-font">${article.source} • ${timeAgo}</span>
                                </div>
                                <span class="material-symbols-outlined text-paper-border group-hover:text-primary transition-colors">north_east</span>
                            </div>
                            <h3 class="text-charcoal text-2xl font-bold leading-tight group-hover:text-primary transition-colors japanese-tracking">${article.title}</h3>
                            <div class="flex gap-6">
                                <div class="w-0.5 bg-primary/30 rounded-full"></div>
                                <p class="text-charcoal-muted text-base leading-relaxed line-clamp-3 font-medium">
                                    ${article.description}
                                </p>
                            </div>
                            <div class="flex items-center gap-6 mt-2 pt-4 border-t border-paper-border">
                                <div class="flex items-center gap-1.5 text-[11px] font-bold text-charcoal-muted uppercase tracking-wider">
                                    <span class="material-symbols-outlined text-base">schedule</span>
                                    読了時間：${readingTime}分
                                </div>
                                <div class="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider">
                                    <span class="material-symbols-outlined text-base">psychology</span>
                                    関連度 ${article.relevance}%
                                </div>
                            </div>
                        </div>
                    </a>
                </article>
            `;
        }).join('');

        // クリックイベントリスナーを追加（追跡してからarticle.htmlへ遷移）
        container.querySelectorAll('.article-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const article = JSON.parse(link.closest('article').dataset.article);
                this.trackClick(article);
                window.location.href = link.href;
            });
        });
    }

    /**
     * Render error message
     */
    renderError(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 gap-6">
                <span class="material-symbols-outlined text-6xl text-charcoal-muted">error_outline</span>
                <h3 class="text-2xl font-bold text-charcoal">ニュースの読み込みに失敗しました</h3>
                <p class="text-charcoal-muted">最新のニュース候補ファイルが見つかりませんでした。</p>
                <button onclick="location.reload()" class="px-6 py-3 bg-primary text-paper-bg font-bold rounded-sm hover:bg-charcoal transition-colors">
                    再読み込み
                </button>
            </div>
        `;
    }

    /**
     * Update date display
     */
    updateDate(elementId) {
        const dateElement = document.getElementById(elementId);
        if (dateElement) {
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
            dateElement.textContent = new Date().toLocaleDateString('ja-JP', options);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const loader = new NewsLoader();

    // article.html の場合: 記事詳細を表示
    const articleContent = document.getElementById('article-content');
    if (articleContent) {
        try {
            const params = new URLSearchParams(window.location.search);
            const articleId = parseInt(params.get('id'));
            const date = params.get('date') || loader.getLatestCandidatesDate();

            const markdown = await loader.fetchCandidates(date);
            const articles = loader.parseMarkdown(markdown);
            const article = articles.find(a => a.number === articleId);

            if (!article) {
                articleContent.innerHTML = '<p class="text-charcoal-muted">記事が見つかりません</p>';
                return;
            }

            document.title = `${article.title} - BrieflyAI`;
            const categoryInfo = loader.getCategoryInfo(article.category);
            const readingTime = loader.calculateReadingTime(article.description);

            articleContent.innerHTML = `
                <h1 class="text-3xl font-bold mb-4" style="font-family: 'Noto Serif JP', serif">${article.title}</h1>
                <div class="flex items-center gap-3 mb-8">
                    <span class="px-2 py-0.5 rounded-sm text-[10px] font-bold ${categoryInfo.color} text-paper-bg tracking-widest uppercase">${categoryInfo.label}</span>
                    <span class="text-sm text-charcoal-muted">${article.source} • ${date}</span>
                    <span class="text-sm text-charcoal-muted">読了時間：${readingTime}分</span>
                </div>
                <div class="prose prose-lg max-w-none mb-8">
                    <p class="text-charcoal leading-relaxed text-lg">${article.description}</p>
                </div>
                <a href="${article.url}" target="_blank" rel="noopener noreferrer"
                   class="inline-block px-6 py-3 bg-primary text-white rounded hover:bg-primary/90 transition-colors">
                    元記事を読む →
                </a>
            `;
        } catch (error) {
            console.error('Failed to load article:', error);
            articleContent.innerHTML = '<p class="text-charcoal-muted">記事の読み込みに失敗しました</p>';
        }
        return;
    }

    // index.html の場合: 記事一覧を表示
    try {
        await loader.loadAndRender();
    } catch (error) {
        console.error('Failed to load news:', error);
    }
});
