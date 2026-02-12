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
        this.currentDate = null; // 表示中の日付
        this.activeFilters = new Set(); // アクティブなカテゴリフィルター
        this.trackingEnabled = true;
        this.signalQueue = [];
        // 旧キーからの移行
        const legacy = localStorage.getItem('trackedClicks');
        if (legacy && !localStorage.getItem('trackedSignals')) {
            localStorage.setItem('trackedSignals', legacy);
            localStorage.removeItem('trackedClicks');
        }
        this.trackedKeys = new Set(JSON.parse(localStorage.getItem('trackedSignals') || '[]'));
        this.dislikedKeys = new Set(JSON.parse(localStorage.getItem('dislikedArticles') || '[]'));

        // ページ離脱時・非表示時にバッチ送信
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flushSignals();
        });
        window.addEventListener('beforeunload', () => this.flushSignals());
    }

    /**
     * Queue positive signal (記事クリック時)
     */
    trackClick(article) {
        if (!this.trackingEnabled) return;

        const key = `${this.getLatestCandidatesDate()}_${article.number}`;
        if (this.trackedKeys.has(key)) return;

        this.trackedKeys.add(key);
        localStorage.setItem('trackedSignals', JSON.stringify([...this.trackedKeys]));

        this.signalQueue.push({
            type: 'positive',
            article_number: article.number,
            title: article.title,
            url: article.url,
            category: article.category,
            source: article.source,
            timestamp: new Date().toISOString()
        });
        console.log('Signal queued (positive):', article.title);
    }

    /**
     * Queue negative signal (興味なしボタン)
     */
    trackDislike(article) {
        if (!this.trackingEnabled) return;

        const key = `${this.getLatestCandidatesDate()}_${article.number}`;
        const isDisliked = this.dislikedKeys.has(key);

        if (isDisliked) {
            // トグル解除：dislikedから除去
            this.dislikedKeys.delete(key);
            localStorage.setItem('dislikedArticles', JSON.stringify([...this.dislikedKeys]));
            // キューから該当のnegativeシグナルを除去（未送信の場合）
            this.signalQueue = this.signalQueue.filter(
                s => !(s.type === 'negative' && s.article_number === article.number)
            );
            console.log('Dislike removed:', article.title);
            return false; // 解除された
        }

        this.dislikedKeys.add(key);
        localStorage.setItem('dislikedArticles', JSON.stringify([...this.dislikedKeys]));

        this.signalQueue.push({
            type: 'negative',
            article_number: article.number,
            title: article.title,
            url: article.url,
            category: article.category,
            source: article.source,
            timestamp: new Date().toISOString()
        });
        console.log('Signal queued (negative):', article.title);
        return true; // dislike追加
    }

    /**
     * Flush queued signals via sendBeacon (ページ離脱/タブ切替用)
     */
    flushSignals() {
        if (this.signalQueue.length === 0) return;

        const payload = JSON.stringify({ signals: this.signalQueue });
        this.signalQueue = [];

        const apiBase = window.location.protocol === 'file:' ? 'https://ai-news-bot-web-tracker.vercel.app' : '';
        const url = `${apiBase}/api/track-signals`;

        const sent = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        console.log('Signals flushed via sendBeacon:', sent);
    }

    /**
     * Flush queued signals via fetch and wait for completion (記事クリック遷移用)
     * タイムアウト2秒で遷移を保証
     */
    flushSignalsAsync() {
        if (this.signalQueue.length === 0) return Promise.resolve();

        const payload = JSON.stringify({ signals: this.signalQueue });
        this.signalQueue = [];

        const apiBase = window.location.protocol === 'file:' ? 'https://ai-news-bot-web-tracker.vercel.app' : '';
        const url = `${apiBase}/api/track-signals`;

        const timeout = new Promise(resolve => setTimeout(resolve, 2000));
        const request = fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
        }).then(r => {
            console.log('Signals flushed via fetch:', r.status);
        }).catch(err => {
            console.error('Failed to flush signals:', err);
        });

        return Promise.race([request, timeout]);
    }

    /**
     * Get the latest candidates file date
     */
    getLatestCandidatesDate() {
        if (this.currentDate) return this.currentDate;
        return this.formatDateLocal(new Date());
    }

    /**
     * Format Date to YYYY-MM-DD (local timezone safe)
     */
    formatDateLocal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /**
     * Navigate to a different date (offset: -1 for previous, +1 for next)
     */
    async navigateDate(offset) {
        const current = this.currentDate || this.formatDateLocal(new Date());
        const [y, m, day] = current.split('-').map(Number);
        const d = new Date(y, m - 1, day + offset);
        const today = this.formatDateLocal(new Date());
        const target = this.formatDateLocal(d);
        if (target > today) return;

        this.currentDate = target;
        await this.loadAndRender();
        this.updateDateNav();
    }

    /**
     * Update date navigation UI
     */
    updateDateNav() {
        const dateEl = document.getElementById('current-date');
        if (!dateEl) return;
        const [y, m, day] = this.currentDate.split('-').map(Number);
        const d = new Date(y, m - 1, day);
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        dateEl.textContent = d.toLocaleDateString('ja-JP', options);

        const nextBtn = document.getElementById('date-next');
        if (nextBtn) {
            const today = this.formatDateLocal(new Date());
            nextBtn.disabled = this.currentDate >= today;
            nextBtn.classList.toggle('opacity-30', this.currentDate >= today);
            nextBtn.classList.toggle('cursor-not-allowed', this.currentDate >= today);
        }
    }

    /**
     * Fetch candidates JSON file
     */
    async fetchCandidates(date = null) {
        const targetDate = date || this.getLatestCandidatesDate();

        // GitHub APIから直接取得（ローカルfile://でも動作する）
        const ghUrl = `https://api.github.com/repos/octmarker/ai-news-bot/contents/news/${targetDate}-candidates.json`;

        try {
            const response = await fetch(ghUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch candidates: ${response.status}`);
            }
            const data = await response.json();
            const binary = atob(data.content);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const jsonStr = new TextDecoder('utf-8').decode(bytes);
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('Error fetching candidates:', error);
            throw error;
        }
    }

    /**
     * Parse JSON candidates to article objects
     */
    parseArticles(candidatesData) {
        const articles = candidatesData.articles || [];
        return articles.map(article => ({
            number: article.number,
            title: article.title,
            source: article.source,
            description: article.description,
            url: article.url,
            category: article.category || '科学',
            relevance: this.calculateRelevance(article.number),
            summary: article.summary || null
        }));
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
     * Infer category from title and description keywords
     */
    inferCategory(title, description) {
        const text = `${title} ${description}`.toLowerCase();
        const aiKeywords = ['ai', '人工知能', 'llm', 'gpt', 'claude', 'gemini', '生成ai', 'openai', 'chatbot', 'ロボット', '自動運転', 'テクノロジー', 'apple', 'google', 'meta', 'microsoft', 'amazon', 'プロンプト', 'ディスプレイ', 'ces', 'データ', 'モデル', 'アルゴリズム', 'マルチモーダル', 'コーディング', 'waymo', 'carplay'];
        const financeKeywords = ['経済', '金融', '株', '為替', '日銀', '利上げ', '投資', 'gdp', 'インフレ', '金利', '暗号資産', 'ビットコイン', '銀行', '財政', '市場', '証券'];
        const politicsKeywords = ['政治', '政策', '選挙', '国会', '法案', '規制', '外交', '防衛', '首相', '大統領', '政府', '制裁'];

        if (aiKeywords.some(kw => text.includes(kw))) return 'AI・テクノロジー';
        if (financeKeywords.some(kw => text.includes(kw))) return '経済・金融';
        if (politicsKeywords.some(kw => text.includes(kw))) return '政治・政策';
        return '科学';
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

            if (!this.currentDate) {
                this.currentDate = this.formatDateLocal(new Date());
            }

            // Fetch JSON candidates
            const candidatesData = await this.fetchCandidates(this.currentDate);

            // Parse articles
            const articles = this.parseArticles(candidatesData);
            console.log(`Parsed ${articles.length} articles`);

            // Render articles
            this.renderArticles(articles, containerId);

            // Update date
            this.updateDate(dateElementId);

            // Update sidebar stats
            this.updateSidebarStats(articles);

            return articles;
        } catch (error) {
            console.error('Error loading news:', error);
            this.renderError(containerId);
            this.updateSidebarStats([]);
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

        const date = this.getLatestCandidatesDate();

        container.innerHTML = articles.map((article, index) => {
            const categoryInfo = this.getCategoryInfo(article.category);
            const readingTime = this.calculateReadingTime(article.description);
            const timeAgo = this.formatTimeAgo(article.number);
            const borderClass = index > 0 ? 'pt-10 border-t border-paper-border' : '';
            const dislikeKey = `${date}_${article.number}`;
            const isDisliked = this.dislikedKeys.has(dislikeKey);
            const dislikedStyle = isDisliked ? 'opacity-30' : '';

            return `
                <article class="group relative transition-opacity duration-300 ${borderClass} ${dislikedStyle}" data-article='${JSON.stringify(article)}' data-article-num="${article.number}" data-category="${article.category}">
                    <a class="block article-link" href="article.html?id=${article.number}&date=${date}" data-original-url="${article.url}">
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
                                    ${article.summary ? article.summary.headline : article.description}
                                </p>
                            </div>
                            <div class="flex items-center justify-between mt-2 pt-4 border-t border-paper-border">
                                <div class="flex items-center gap-6">
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
                        </div>
                    </a>
                    <button class="dislike-btn absolute bottom-4 right-0 flex items-center gap-1 text-[11px] font-bold tracking-wider transition-colors ${isDisliked ? 'text-red-400' : 'text-charcoal-muted/40 hover:text-red-400'}" data-article-num="${article.number}">
                        <span class="material-symbols-outlined text-base">block</span>
                        <span class="dislike-label">${isDisliked ? '取消' : '興味なし'}</span>
                    </button>
                </article>
            `;
        }).join('');

        // クリックイベントリスナー（positiveシグナルを送信完了してから遷移）
        container.querySelectorAll('.article-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.href;
                const article = JSON.parse(link.closest('article').dataset.article);
                this.trackClick(article);
                // fetchで送信完了を待ってから遷移（タイムアウト2秒）
                this.flushSignalsAsync().finally(() => {
                    window.location.href = href;
                });
            });
        });

        // 興味なしボタンのイベントリスナー
        container.querySelectorAll('.dislike-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const articleEl = btn.closest('article');
                const article = JSON.parse(articleEl.dataset.article);
                const isNowDisliked = this.trackDislike(article);

                if (isNowDisliked) {
                    articleEl.classList.add('opacity-30');
                    btn.classList.remove('text-charcoal-muted/40', 'hover:text-red-400');
                    btn.classList.add('text-red-400');
                    btn.querySelector('.dislike-label').textContent = '取消';
                } else {
                    articleEl.classList.remove('opacity-30');
                    btn.classList.add('text-charcoal-muted/40', 'hover:text-red-400');
                    btn.classList.remove('text-red-400');
                    btn.querySelector('.dislike-label').textContent = '興味なし';
                }
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
     * Filter articles by category
     */
    filterByCategory(category) {
        if (category === 'all') {
            this.activeFilters.clear();
        } else if (this.activeFilters.has(category)) {
            this.activeFilters.delete(category);
        } else {
            this.activeFilters.add(category);
        }

        const articles = document.querySelectorAll('#news-articles-container article');
        articles.forEach(el => {
            const cat = el.dataset.category;
            if (this.activeFilters.size === 0 || this.activeFilters.has(cat)) {
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });

        this.updateFilterUI();
    }

    /**
     * Update filter chip UI state
     */
    updateFilterUI() {
        document.querySelectorAll('.filter-chip').forEach(chip => {
            const cat = chip.dataset.filterCategory;
            if (cat === 'all') {
                const isActive = this.activeFilters.size === 0;
                chip.classList.toggle('bg-charcoal', isActive);
                chip.classList.toggle('text-paper-bg', isActive);
                chip.classList.toggle('bg-[#F4F1EA]', !isActive);
                chip.classList.toggle('text-charcoal-muted', !isActive);
            } else {
                const isActive = this.activeFilters.has(cat);
                chip.classList.toggle('bg-charcoal', isActive);
                chip.classList.toggle('text-paper-bg', isActive);
                chip.classList.toggle('bg-[#F4F1EA]', !isActive);
                chip.classList.toggle('text-charcoal-muted', !isActive);
            }
        });
    }

    /**
     * Update sidebar stats with real data
     */
    updateSidebarStats(articles) {
        const countEl = document.getElementById('stat-articles-count');
        const timeEl = document.getElementById('stat-time-saved');
        if (countEl) countEl.textContent = articles.length;
        if (timeEl) {
            const totalMinutes = articles.reduce((sum, a) => sum + this.calculateReadingTime(a.description), 0);
            const hours = (totalMinutes / 60).toFixed(1);
            timeEl.innerHTML = `${hours} <span class="text-sm font-medium">時間</span>`;
        }
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

            const candidatesData = await loader.fetchCandidates(date);
            const articles = loader.parseArticles(candidatesData);
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
                <div class="prose prose-lg max-w-none">
                    <p class="text-charcoal leading-relaxed text-lg">${article.description}</p>
                </div>
            `;

            // ボトムアクションに元記事URLを設定して表示
            const bottomActions = document.getElementById('bottom-actions');
            const originalLink = document.getElementById('original-article-link');
            if (originalLink) originalLink.href = article.url;
            if (bottomActions) bottomActions.classList.remove('hidden');

            // AI要約を表示（JSONに含まれている要約を直接表示）
            const summarySection = document.getElementById('ai-summary-section');
            if (summarySection && article.summary) {
                summarySection.classList.remove('hidden');
                const s = article.summary;
                document.getElementById('ai-summary-content').innerHTML = `
                    <p class="text-primary font-bold text-lg mb-3">${s.headline || ''}</p>
                    <ul class="space-y-2 mb-4">
                        ${(s.key_points || []).map(p => `
                            <li class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-primary text-base mt-0.5">check_circle</span>
                                <span class="text-charcoal">${p}</span>
                            </li>
                        `).join('')}
                    </ul>
                    <p class="text-charcoal leading-relaxed mb-4">${s.detailed_summary || ''}</p>
                    ${s.why_it_matters ? `
                        <div class="bg-white rounded p-4 border border-primary/10">
                            <p class="text-sm font-bold text-primary mb-1">なぜ重要か</p>
                            <p class="text-charcoal text-sm">${s.why_it_matters}</p>
                        </div>
                    ` : ''}
                `;
            }
        } catch (error) {
            console.error('Failed to load article:', error);
            articleContent.innerHTML = '<p class="text-charcoal-muted">記事の読み込みに失敗しました</p>';
        }
        return;
    }

    // index.html の場合: 記事一覧を表示
    try {
        await loader.loadAndRender();
        loader.updateDateNav();

        // 日付ナビゲーション
        document.getElementById('date-prev')?.addEventListener('click', () => loader.navigateDate(-1));
        document.getElementById('date-next')?.addEventListener('click', () => loader.navigateDate(1));

        // カテゴリフィルター
        const filterBtn = document.getElementById('filter-toggle');
        const filterPanel = document.getElementById('filter-panel');
        if (filterBtn && filterPanel) {
            filterBtn.addEventListener('click', () => {
                filterPanel.classList.toggle('hidden');
            });
            filterPanel.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    loader.filterByCategory(chip.dataset.filterCategory);
                });
            });
        }
    } catch (error) {
        console.error('Failed to load news:', error);
        // エラーでも日付ナビは動くようにする
        const loader2 = loader;
        document.getElementById('date-prev')?.addEventListener('click', () => loader2.navigateDate(-1));
        document.getElementById('date-next')?.addEventListener('click', () => loader2.navigateDate(1));
        loader.updateDateNav();
    }
});
