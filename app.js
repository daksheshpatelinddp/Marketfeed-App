/**
 * MarketFeed - Complete Application Script
 * Live RSS Fetching, Dynamic Bundles, Isolated Alerts & RSS.app Filtering
 */

// App State
let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [
    {
      id: 'f_default_1',
      name: '$RELIANCE News',
      type: 'keyword',
      query: 'RELIANCE stock news',
      url: 'https://news.google.com/rss/search?q=RELIANCE+stock+news',
      bundle: 'Stocks',
      alerts: true,
      filters: createDefaultFilters()
    }
  ],
  bundles: JSON.parse(localStorage.getItem('mf_bundles')) || [
    {
      id: 'b_default_1',
      name: 'Stocks',
      alerts: true,
      filters: createDefaultFilters()
    }
  ],
  items: JSON.parse(localStorage.getItem('mf_items')) || [],
  activeTab: 'news',
  activeFilter: 'all',
  searchQuery: '',
  sortOrder: 'newest',
  settings: JSON.parse(localStorage.getItem('mf_settings')) || {
    autoRefreshMinutes: 5,
    soundEnabled: true,
    importantKeywords: ['BREAKING', 'PROFIT', 'DIVIDEND', 'CIRCUIT', 'RESULT']
  },
  timerId: null
};

function createDefaultFilters() {
  return {
    whitelist: [],
    blacklist: [],
    matchField: 'all',       // 'title', 'description', 'url', 'all'
    matchMode: 'contains',   // 'contains', 'exact', 'startsWith', 'endsWith', 'AND'
    hideNoImage: false,
    hideNoDescription: false,
    hideOlderThanHours: 0,
    blockedDomains: [],
    cleanTitle: true,
    dedupeTitles: true
  };
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initNotificationPermission();
  updateBundleDropdowns();
  renderAllViews();
  setupEventListeners();
  setupAutoRefresh(state.settings.autoRefreshMinutes);

  // Initial fetch for news if empty
  if (state.items.length === 0) {
    refreshFeeds();
  }
});

/* ==========================================================================
   1. REAL RSS XML FETCHING ENGINE (Parses RSS into Real Articles)
   ========================================================================== */

async function fetchFeedArticles(feed) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const items = xmlDoc.querySelectorAll('item, entry');
    const fetchedArticles = [];

    items.forEach((item, index) => {
      const title = item.querySelector('title')?.textContent || 'Untitled Story';
      let link = item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '#';
      
      // Clean up Google News tracking links
      if (link.includes('news.google.com') && item.querySelector('guid')) {
        const guid = item.querySelector('guid').textContent;
        if (guid.startsWith('http')) link = guid;
      }

      const pubDate = item.querySelector('pubDate, updated, date')?.textContent || new Date().toISOString();
      const rawSnippet = item.querySelector('description, content, summary')?.textContent || '';
      
      // Parse HTML inside snippet to plain text and find images
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rawSnippet;
      const snippet = tempDiv.textContent || tempDiv.innerText || '';
      const imgTag = tempDiv.querySelector('img');
      const imageUrl = imgTag ? imgTag.src : (item.querySelector('media\\:content, enclosure')?.getAttribute('url') || '');

      const articleId = `${feed.id}_${hashString(link || title)}`;

      fetchedArticles.push({
        id: articleId,
        feedId: feed.id,
        title: feed.filters?.cleanTitle ? cleanArticleTitle(title) : title,
        rawTitle: title,
        snippet: snippet.slice(0, 280),
        link: link,
        source: feed.name,
        date: new Date(pubDate).toISOString(),
        imageUrl: imageUrl,
        isRead: false
      });
    });

    return fetchedArticles;
  } catch (err) {
    console.error(`Error fetching feed ${feed.name}:`, err);
    return [];
  }
}

async function refreshFeeds() {
  const refreshBtn = document.getElementById('refresh-now-btn');
  if (refreshBtn) refreshBtn.innerText = '⏳ Fetching...';

  let allNewArticles = [];

  for (const feed of state.feeds) {
    const fetched = await fetchFeedArticles(feed);
    
    // Apply Feed-level RSS.app filters
    const feedFiltered = fetched.filter(article => passesRssAppFilters(article, feed.filters));

    // Apply Bundle-level RSS.app filters if assigned
    const bundle = state.bundles.find(b => b.name === feed.bundle);
    const fullyFiltered = feedFiltered.filter(article => !bundle || passesRssAppFilters(article, bundle.filters));

    // Alert triggering for new articles
    fullyFiltered.forEach(article => {
      const exists = state.items.some(i => i.id === article.id);
      if (!exists) {
        if (feed.alerts || (bundle && bundle.alerts) || isImportantNews(article, state.settings.importantKeywords)) {
          triggerNotification(article, `New Alert: ${feed.name}`);
        }
        allNewArticles.push(article);
      }
    });
  }

  // Merge and deduplicate
  if (allNewArticles.length > 0) {
    state.items = [...allNewArticles, ...state.items];
    
    // Global title deduplication if enabled
    const seenTitles = new Set();
    state.items = state.items.filter(item => {
      const slug = item.title.toLowerCase().trim();
      if (seenTitles.has(slug)) return false;
      seenTitles.add(slug);
      return true;
    });

    saveState();
  }

  if (state.activeTab === 'news') renderStream();
  if (refreshBtn) refreshBtn.innerText = '🔄 Refresh News';
}

/* ==========================================================================
   2. RSS.APP ADVANCED FILTERING PIPELINE
   ========================================================================== */

function passesRssAppFilters(article, filters) {
  if (!filters) return true;

  const {
    whitelist = [],
    blacklist = [],
    matchField = 'all',
    matchMode = 'contains',
    hideNoImage = false,
    hideNoDescription = false,
    hideOlderThanHours = 0,
    blockedDomains = []
  } = filters;

  const targetText = getTargetText(article, matchField).toLowerCase();

  // 1. Hide without Image
  if (hideNoImage && !article.imageUrl) return false;

  // 2. Hide without Description
  if (hideNoDescription && (!article.snippet || article.snippet.trim() === '')) return false;

  // 3. Hide Older Than X Hours
  if (hideOlderThanHours > 0 && article.date) {
    const postTime = new Date(article.date).getTime();
    const cutoff = Date.now() - (hideOlderThanHours * 60 * 60 * 1000);
    if (postTime < cutoff) return false;
  }

  // 4. Domain Blocking
  if (blockedDomains.length > 0 && article.link) {
    if (blockedDomains.some(dom => dom && article.link.toLowerCase().includes(dom.toLowerCase().trim()))) {
      return false;
    }
  }

  // 5. Blacklist Check
  if (blacklist.length > 0) {
    const matchedBlacklist = blacklist.some(term => evaluateMatch(targetText, term, matchMode));
    if (matchedBlacklist) return false;
  }

  // 6. Whitelist Check
  if (whitelist.length > 0) {
    if (matchMode === 'AND') {
      const matchesAll = whitelist.every(term => evaluateMatch(targetText, term, 'contains'));
      if (!matchesAll) return false;
    } else {
      const matchesOne = whitelist.some(term => evaluateMatch(targetText, term, matchMode));
      if (!matchesOne) return false;
    }
  }

  return true;
}

function evaluateMatch(text, term, mode) {
  if (!term || !term.trim()) return false;
  const cleanTerm = term.toLowerCase().trim();

  switch (mode) {
    case 'exact':
      return text === cleanTerm;
    case 'startsWith':
      return text.startsWith(cleanTerm);
    case 'endsWith':
      return text.endsWith(cleanTerm);
    case 'contains':
    case 'AND':
    default:
      return text.includes(cleanTerm);
  }
}

function getTargetText(article, field) {
  switch (field) {
    case 'title': return article.title || '';
    case 'description': return article.snippet || '';
    case 'url': return article.link || '';
    case 'all':
    default:
      return `${article.title || ''} ${article.snippet || ''} ${article.link || ''}`;
  }
}

function cleanArticleTitle(title) {
  if (!title) return '';
  return title
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\s*-\s*[^-]+$/, '')
    .replace(/^(UPDATE\s\d+|ALERT|BREAKING):?\s*/i, '')
    .trim();
}

/* ==========================================================================
   3. EVENT LISTENERS & MODAL HANDLERS
   ========================================================================== */

function setupEventListeners() {
  const feedModal = document.getElementById('feed-modal');
  const bundleModal = document.getElementById('bundle-modal');

  document.getElementById('add-feed-btn')?.addEventListener('click', () => {
    updateBundleDropdowns();
    feedModal?.classList.remove('hidden');
  });

  document.getElementById('add-bundle-btn')?.addEventListener('click', () => {
    bundleModal?.classList.remove('hidden');
  });

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });
  });

  // Top Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const targetTab = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add('active');
      state.activeTab = targetTab;
      switchTab(targetTab);
    });
  });

  // Search & Sorting
  document.getElementById('feed-search')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.activeTab === 'news') renderStream();
  });

  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    if (state.activeTab === 'news') renderStream();
  });

  document.getElementById('refresh-now-btn')?.addEventListener('click', () => refreshFeeds());

  // Handle Create Feed Form Submission
  document.getElementById('feed-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('feed-name-input').value;
    const type = document.getElementById('feed-type-select').value;
    const query = document.getElementById('feed-url-input').value;
    const bundleSelect = document.getElementById('feed-bundle-select').value;
    const alerts = document.getElementById('feed-alert-toggle').checked;

    const generatedUrl = type === 'keyword'
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`
      : query;

    const newFeed = {
      id: 'f_' + Date.now(),
      name: name,
      type: type,
      query: query,
      url: generatedUrl,
      bundle: bundleSelect,
      alerts: alerts,
      filters: createDefaultFilters()
    };

    state.feeds.push(newFeed);
    saveState();
    renderAllViews();
    feedModal.classList.add('hidden');
    e.target.reset();

    // Fetch news immediately for the newly created feed
    await refreshFeeds();
  });

  // Handle Create Bundle Form Submission
  document.getElementById('bundle-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('bundle-name-input').value;
    const alerts = document.getElementById('bundle-alert-toggle').checked;

    if (name) {
      state.bundles.push({
        id: 'b_' + Date.now(),
        name: name,
        alerts: alerts,
        filters: createDefaultFilters()
      });
      saveState();
      updateBundleDropdowns();
      renderAllViews();
      bundleModal.classList.add('hidden');
      e.target.reset();
    }
  });
}

/* ==========================================================================
   4. TAB & VIEW MANAGEMENT (Feeds, Bundles, Filters, Stream)
   ========================================================================== */

function switchTab(tabName) {
  const container = document.getElementById('main-view-container');
  if (!container) return;

  if (tabName === 'news') {
    container.innerHTML = `
      <div id="stream-header" class="stream-header">
        <h2 id="stream-title">All Market Updates</h2>
        <span id="unread-count" class="counter">0 items</span>
      </div>
      <div id="feed-items-container" class="feed-cards-grid"></div>`;
    renderStream();
  } else if (tabName === 'feeds') {
    renderFeedsPage(container);
  } else if (tabName === 'bundles') {
    renderBundlesPage(container);
  } else if (tabName === 'filters') {
    renderFiltersPage(container);
  }
}

function renderAllViews() {
  renderBundlesPills();
  renderSidebarLists();
  if (state.activeTab === 'news') renderStream();
}

function renderStream() {
  const container = document.getElementById('feed-items-container');
  if (!container) return;

  let processed = [...state.items];

  // Category Pill Filter
  if (state.activeFilter !== 'all') {
    const feedIdsInBundle = state.feeds.filter(f => f.bundle === state.activeFilter).map(f => f.id);
    processed = processed.filter(item => feedIdsInBundle.includes(item.feedId));
  }

  // Keyword Search Filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    processed = processed.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.snippet && i.snippet.toLowerCase().includes(q)));
  }

  // Sorting
  processed.sort((a, b) => state.sortOrder === 'newest' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

  const unreadCount = document.getElementById('unread-count');
  if (unreadCount) unreadCount.innerText = `${processed.length} articles`;

  if (processed.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No news articles available. Click "🔄 Refresh News" or add new feeds.</p>`;
    return;
  }

  // Render cards with direct links to source websites
  container.innerHTML = processed.map(item => `
    <article class="feed-card">
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" style="width:100%; max-height:140px; object-fit:cover; border-radius:4px; margin-bottom:0.5rem;" />` : ''}
      <div>
        <h4>
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">
            ${item.title} 🔗
          </a>
        </h4>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">${item.snippet || ''}</p>
      </div>
      <div class="feed-meta" style="margin-top:0.75rem;">
        <span style="font-weight:600;">${item.source}</span>
        <time>${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
      </div>
    </article>
  `).join('');
}

// Manage Feeds View (Includes Dynamic Bundle Assignment & Alert Toggles)
function renderFeedsPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>📡 Manage Feeds</h2>
      <p style="color:var(--text-muted); margin-bottom:1rem;">Re-assign bundles or toggle alerts for any feed at any time.</p>
      <div class="cards-list">
        ${state.feeds.map(f => `
          <div class="card-item" style="background:var(--bg-secondary); padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <h4 style="margin-bottom:0.2rem;">${f.name}</h4>
                <small style="color:var(--text-muted);">${f.url}</small>
              </div>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <!-- Bundle Re-Assignment Dropdown -->
                <select class="select-input" onchange="reassignFeedBundle('${f.id}', this.value)">
                  <option value="Unassigned" ${f.bundle === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
                  ${state.bundles.map(b => `<option value="${b.name}" ${f.bundle === b.name ? 'selected' : ''}>📦 ${b.name}</option>`).join('')}
                </select>

                <!-- Independent Feed Alert Switch -->
                <button class="btn btn-secondary" onclick="toggleFeedAlert('${f.id}')">
                  ${f.alerts ? '🔔 Alerts ON' : '🔕 Alerts OFF'}
                </button>
                <button class="btn btn-secondary" style="color:#ef4444;" onclick="deleteFeed('${f.id}')">🗑️</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// Manage Bundles View
function renderBundlesPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>📦 Manage Bundles</h2>
      <p style="color:var(--text-muted); margin-bottom:1rem;">Group multiple feeds into bundles with dedicated notification rules.</p>
      <div class="cards-list">
        ${state.bundles.map(b => `
          <div class="card-item" style="background:var(--bg-secondary); padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h4>📦 ${b.name}</h4>
                <small style="color:var(--text-muted);">
                  Assigned Feeds: ${state.feeds.filter(f => f.bundle === b.name).map(f => f.name).join(', ') || 'None'}
                </small>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-secondary" onclick="toggleBundleAlert('${b.id}')">
                  ${b.alerts ? '🔔 Bundle Alerts ON' : '🔕 Bundle Alerts OFF'}
                </button>
                <button class="btn btn-secondary" style="color:#ef4444;" onclick="deleteBundle('${b.id}')">🗑️</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// RSS.app Full Filter Manager View
function renderFiltersPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>🔍 RSS.app Filter Engine Settings</h2>
      <p style="color:var(--text-muted); margin-bottom:1rem;">Configure advanced rule sets for individual feeds or bundles.</p>

      ${state.feeds.map(f => `
        <div class="filter-card" style="background:var(--bg-secondary); padding:1.25rem; border-radius:8px; margin-bottom:1.5rem; border:1px solid var(--border-color);">
          <h3 style="margin-bottom:0.75rem;">📡 Feed Rules: ${f.name}</h3>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1rem;">
            <div>
              <label style="font-size:0.8rem;">Target Field</label>
              <select class="select-input full-width" onchange="updateFilterSetting('${f.id}', 'feed', 'matchField', this.value)">
                <option value="all" ${f.filters?.matchField === 'all' ? 'selected' : ''}>All Fields (Title + Desc + URL)</option>
                <option value="title" ${f.filters?.matchField === 'title' ? 'selected' : ''}>Title Only</option>
                <option value="description" ${f.filters?.matchField === 'description' ? 'selected' : ''}>Description Only</option>
                <option value="url" ${f.filters?.matchField === 'url' ? 'selected' : ''}>URL Only</option>
              </select>
            </div>

            <div>
              <label style="font-size:0.8rem;">Match Mode</label>
              <select class="select-input full-width" onchange="updateFilterSetting('${f.id}', 'feed', 'matchMode', this.value)">
                <option value="contains" ${f.filters?.matchMode === 'contains' ? 'selected' : ''}>Contains Word (OR)</option>
                <option value="AND" ${f.filters?.matchMode === 'AND' ? 'selected' : ''}>Must Match ALL Words (AND)</option>
                <option value="exact" ${f.filters?.matchMode === 'exact' ? 'selected' : ''}>Exact Match</option>
                <option value="startsWith" ${f.filters?.matchMode === 'startsWith' ? 'selected' : ''}>Starts With</option>
              </select>
            </div>

            <div>
              <label style="font-size:0.8rem;">Hide Posts Older Than (Hours)</label>
              <input type="number" class="select-input full-width" value="${f.filters?.hideOlderThanHours || 0}" onchange="updateFilterSetting('${f.id}', 'feed', 'hideOlderThanHours', parseInt(this.value))">
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
              <label style="font-size:0.8rem;">Whitelist Keywords (comma-separated)</label>
              <input type="text" class="select-input full-width" value="${(f.filters?.whitelist || []).join(', ')}" onchange="updateFilterSetting('${f.id}', 'feed', 'whitelist', this.value.split(','))">
            </div>
            <div>
              <label style="font-size:0.8rem;">Blacklist Keywords (comma-separated)</label>
              <input type="text" class="select-input full-width" value="${(f.filters?.blacklist || []).join(', ')}" onchange="updateFilterSetting('${f.id}', 'feed', 'blacklist', this.value.split(','))">
            </div>
          </div>

          <div style="display:flex; gap:1.5rem; flex-wrap:wrap; font-size:0.85rem;">
            <label><input type="checkbox" ${f.filters?.hideNoImage ? 'checked' : ''} onchange="updateFilterSetting('${f.id}', 'feed', 'hideNoImage', this.checked)"> Hide without Image</label>
            <label><input type="checkbox" ${f.filters?.hideNoDescription ? 'checked' : ''} onchange="updateFilterSetting('${f.id}', 'feed', 'hideNoDescription', this.checked)"> Hide without Description</label>
            <label><input type="checkbox" ${f.filters?.cleanTitle ? 'checked' : ''} onchange="updateFilterSetting('${f.id}', 'feed', 'cleanTitle', this.checked)"> Clean Article Titles</label>
          </div>
        </div>
      `).join('')}
    </div>`;
}

/* ==========================================================================
   5. STATE HELPERS, ALERTS & UTILITIES
   ========================================================================== */

function reassignFeedBundle(feedId, newBundle) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) {
    feed.bundle = newBundle;
    saveState();
    renderAllViews();
  }
}

function updateFilterSetting(targetId, type, key, value) {
  const list = type === 'feed' ? state.feeds : state.bundles;
  const item = list.find(i => i.id === targetId);
  if (item) {
    if (!item.filters) item.filters = createDefaultFilters();
    if (Array.isArray(value)) {
      item.filters[key] = value.map(v => v.trim()).filter(Boolean);
    } else {
      item.filters[key] = value;
    }
    saveState();
  }
}

function toggleFeedAlert(feedId) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) { feed.alerts = !feed.alerts; saveState(); switchTab('feeds'); }
}

function toggleBundleAlert(bundleId) {
  const bundle = state.bundles.find(b => b.id === bundleId);
  if (bundle) { bundle.alerts = !bundle.alerts; saveState(); switchTab('bundles'); }
}

function deleteFeed(feedId) {
  state.feeds = state.feeds.filter(f => f.id !== feedId);
  saveState();
  renderAllViews();
  switchTab('feeds');
}

function deleteBundle(bundleId) {
  state.bundles = state.bundles.filter(b => b.id !== bundleId);
  saveState();
  updateBundleDropdowns();
  renderAllViews();
  switchTab('bundles');
}

function updateBundleDropdowns() {
  const select = document.getElementById('feed-bundle-select');
  if (select) {
    select.innerHTML = `<option value="Unassigned">Unassigned</option>` +
      state.bundles.map(b => `<option value="${b.name}">📦 ${b.name}</option>`).join('');
  }
}

function renderBundlesPills() {
  const container = document.getElementById('bundle-pills-container');
  if (!container) return;
  const bundles = ['all', ...new Set(state.feeds.map(f => f.bundle).filter(b => b && b !== 'Unassigned'))];
  container.innerHTML = bundles.map(b => `
    <button class="pill-btn ${state.activeFilter === b ? 'active' : ''}" data-filter="${b}">
      ${b === 'all' ? 'All Feeds' : b}
    </button>
  `).join('');
}

function renderSidebarLists() {
  const feedList = document.getElementById('feed-list');
  const bundleList = document.getElementById('bundle-list');

  if (feedList) {
    feedList.innerHTML = state.feeds.map(f => `
      <li data-id="${f.id}">
        <span>${f.name}</span>
        <small>${f.alerts ? '🔔' : ''}</small>
      </li>
    `).join('');
  }

  if (bundleList) {
    bundleList.innerHTML = state.bundles.map(b => `
      <li data-id="${b.id}">
        <span>📦 ${b.name}</span>
        <small>${b.alerts ? '🔔' : ''}</small>
      </li>
    `).join('');
  }
}

function isImportantNews(article, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const text = `${article.title || ''} ${article.snippet || ''}`.toLowerCase();
  return keywords.some(kw => text.includes(kw.toLowerCase().trim()));
}

function triggerNotification(article, alertTitle) {
  if (state.settings.soundEnabled) playAlertSound();

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(alertTitle, {
      body: article.title,
      icon: article.imageUrl || '/icon-192.png'
    });
  }
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

function saveState() {
  localStorage.setItem('mf_feeds', JSON.stringify(state.feeds));
  localStorage.setItem('mf_bundles', JSON.stringify(state.bundles));
  localStorage.setItem('mf_items', JSON.stringify(state.items));
}

function setupAutoRefresh(minutes) {
  if (state.timerId) clearInterval(state.timerId);
  if (minutes > 0) state.timerId = setInterval(() => refreshFeeds(), minutes * 60 * 1000);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

function initNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
}