/**
 * MarketFeed - Frontend App Core
 */

// Replace with your actual Cloudflare Worker URL
const WORKER_URL = "https://rssfeed-backend.YOUR-SUBDOMAIN.workers.dev";

let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [
    {
      id: 'f_default_1',
      name: '$RELIANCE News',
      query: 'RELIANCE stock news',
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
  sortOrder: 'newest'
};

function createDefaultFilters() {
  return {
    whitelist: [],
    blacklist: [],
    matchField: 'all',
    matchMode: 'contains',
    hideNoImage: false,
    hideNoDescription: false,
    cleanTitle: true
  };
}

document.addEventListener('DOMContentLoaded', () => {
  updateBundleDropdowns();
  renderAllViews();
  setupEventListeners();

  if (state.items.length === 0) {
    refreshFeeds();
  }
});

async function fetchFeedArticles(feed) {
  try {
    const endpoint = `${WORKER_URL}/api/news?query=${encodeURIComponent(feed.query || feed.name)}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Worker status ${response.status}`);
    }

    const data = await response.json();
    const rawArticles = data.articles || data.items || [];

    return rawArticles.map((article) => {
      const title = article.title || 'Untitled';
      const link = article.url || article.link || '#';
      const snippet = article.description || article.snippet || '';
      const imageUrl = article.urlToImage || article.imageUrl || '';
      const pubDate = article.publishedAt || article.pubDate || new Date().toISOString();
      const sourceName = article.source?.name || feed.name;

      return {
        id: `${feed.id}_${hashString(link || title)}`,
        feedId: feed.id,
        title: feed.filters?.cleanTitle ? cleanTitle(title) : title,
        snippet: snippet.slice(0, 260),
        link: link,
        source: sourceName,
        date: new Date(pubDate).toISOString(),
        imageUrl: imageUrl
      };
    });
  } catch (err) {
    console.error(`Fetch failed for feed "${feed.name}":`, err);
    return [];
  }
}

async function refreshFeeds() {
  const refreshBtn = document.getElementById('refresh-now-btn');
  if (refreshBtn) refreshBtn.innerText = '⏳ Fetching...';

  let newArticles = [];

  for (const feed of state.feeds) {
    const fetched = await fetchFeedArticles(feed);
    const feedFiltered = fetched.filter(item => passesFilters(item, feed.filters));
    
    const bundle = state.bundles.find(b => b.name === feed.bundle);
    const fullyFiltered = feedFiltered.filter(item => !bundle || passesFilters(item, bundle.filters));

    fullyFiltered.forEach(article => {
      if (!state.items.some(i => i.id === article.id)) {
        newArticles.push(article);
      }
    });
  }

  if (newArticles.length > 0) {
    state.items = [...newArticles, ...state.items];
    const seen = new Set();
    state.items = state.items.filter(item => {
      const slug = item.title.toLowerCase().trim();
      if (seen.has(slug)) return false;
      seen.add(slug);
      return true;
    });
    saveState();
  }

  if (state.activeTab === 'news') renderStream();
  if (refreshBtn) refreshBtn.innerText = '🔄 Refresh News';
}

function passesFilters(article, filters) {
  if (!filters) return true;
  if (filters.hideNoImage && !article.imageUrl) return false;
  if (filters.hideNoDescription && (!article.snippet || !article.snippet.trim())) return false;

  const targetText = `${article.title} ${article.snippet}`.toLowerCase();

  if (filters.blacklist?.length > 0) {
    const hitBlacklist = filters.blacklist.some(kw => kw && targetText.includes(kw.toLowerCase().trim()));
    if (hitBlacklist) return false;
  }

  if (filters.whitelist?.length > 0) {
    const hitWhitelist = filters.whitelist.some(kw => kw && targetText.includes(kw.toLowerCase().trim()));
    if (!hitWhitelist) return false;
  }

  return true;
}

function cleanTitle(title) {
  return title.replace(/\s*-\s*[^-]+$/, '').trim();
}

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

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.activeTab = e.currentTarget.dataset.tab;
      switchTab(state.activeTab);
    });
  });

  document.getElementById('feed-search')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (state.activeTab === 'news') renderStream();
  });

  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    if (state.activeTab === 'news') renderStream();
  });

  document.getElementById('refresh-now-btn')?.addEventListener('click', () => refreshFeeds());

  document.getElementById('feed-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('feed-name-input').value;
    const query = document.getElementById('feed-url-input').value;
    const bundle = document.getElementById('feed-bundle-select').value;
    const alerts = document.getElementById('feed-alert-toggle').checked;

    state.feeds.push({
      id: 'f_' + Date.now(),
      name: name,
      query: query,
      bundle: bundle,
      alerts: alerts,
      filters: createDefaultFilters()
    });

    saveState();
    renderAllViews();
    feedModal.classList.add('hidden');
    e.target.reset();

    await refreshFeeds();
  });

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
  renderPills();
  renderSidebar();
  if (state.activeTab === 'news') renderStream();
}

function renderStream() {
  const container = document.getElementById('feed-items-container');
  if (!container) return;

  let list = [...state.items];

  if (state.activeFilter !== 'all') {
    const feedIds = state.feeds.filter(f => f.bundle === state.activeFilter).map(f => f.id);
    list = list.filter(i => feedIds.includes(i.feedId));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(i => i.title.toLowerCase().includes(q) || i.snippet.toLowerCase().includes(q));
  }

  list.sort((a, b) => state.sortOrder === 'newest' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

  const unreadCount = document.getElementById('unread-count');
  if (unreadCount) unreadCount.innerText = `${list.length} articles`;

  if (list.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 2rem;">No news articles available. Click "🔄 Refresh News".</p>`;
    return;
  }

  container.innerHTML = list.map(item => `
    <article class="feed-card">
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="" style="width:100%; max-height:140px; object-fit:cover; border-radius:4px; margin-bottom:0.5rem;" />` : ''}
      <div>
        <h4>
          <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color:inherit; text-decoration:none;">
            ${item.title} 🔗
          </a>
        </h4>
        <p style="font-size:0.85rem; color:#94a3b8; margin-top:0.4rem;">${item.snippet}</p>
      </div>
      <div class="feed-meta" style="margin-top:0.75rem; display:flex; justify-space-between;">
        <span style="font-weight:600;">${item.source}</span>
        <time style="color:#64748b; font-size:0.8rem;">${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
      </div>
    </article>
  `).join('');
}

function renderFeedsPage(container) {
  container.innerHTML = `
    <div>
      <h2>📡 Manage Feeds</h2>
      <p style="color:#94a3b8; margin-bottom:1rem;">Re-assign bundles or toggle alerts at any time.</p>
      ${state.feeds.map(f => `
        <div style="background:#1e293b; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4>${f.name}</h4>
            <small style="color:#94a3b8;">${f.query}</small>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <select class="select-input" onchange="reassignBundle('${f.id}', this.value)">
              <option value="Unassigned" ${f.bundle === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
              ${state.bundles.map(b => `<option value="${b.name}" ${f.bundle === b.name ? 'selected' : ''}>📦 ${b.name}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" onclick="deleteFeed('${f.id}')">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderBundlesPage(container) {
  container.innerHTML = `
    <div>
      <h2>📦 Manage Bundles</h2>
      ${state.bundles.map(b => `
        <div style="background:#1e293b; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4>📦 ${b.name}</h4>
            <small style="color:#94a3b8;">Feeds: ${state.feeds.filter(f => f.bundle === b.name).map(f => f.name).join(', ') || 'None'}</small>
          </div>
          <button class="btn btn-secondary" onclick="deleteBundle('${b.id}')">🗑️</button>
        </div>
      `).join('')}
    </div>`;
}

function renderFiltersPage(container) {
  container.innerHTML = `
    <div>
      <h2>🔍 RSS.app Filter Engine</h2>
      ${state.feeds.map(f => `
        <div style="background:#1e293b; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #334155;">
          <h3>📡 Feed: ${f.name}</h3>
          <div style="margin-top:0.5rem;">
            <label style="font-size:0.85rem;">Whitelist Keywords (comma separated)</label>
            <input type="text" class="select-input full-width" value="${(f.filters?.whitelist || []).join(', ')}" onchange="updateWhitelist('${f.id}', this.value)">
          </div>
        </div>
      `).join('')}
    </div>`;
}

function reassignBundle(feedId, newBundle) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) { feed.bundle = newBundle; saveState(); renderAllViews(); }
}

function updateWhitelist(feedId, value) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) {
    if (!feed.filters) feed.filters = createDefaultFilters();
    feed.filters.whitelist = value.split(',').map(v => v.trim()).filter(Boolean);
    saveState();
  }
}

function deleteFeed(feedId) {
  state.feeds = state.feeds.filter(f => f.id !== feedId);
  saveState(); renderAllViews(); switchTab('feeds');
}

function deleteBundle(bundleId) {
  state.bundles = state.bundles.filter(b => b.id !== bundleId);
  saveState(); updateBundleDropdowns(); renderAllViews(); switchTab('bundles');
}

function updateBundleDropdowns() {
  const select = document.getElementById('feed-bundle-select');
  if (select) {
    select.innerHTML = `<option value="Unassigned">Unassigned</option>` +
      state.bundles.map(b => `<option value="${b.name}">📦 ${b.name}</option>`).join('');
  }
}

function renderPills() {
  const container = document.getElementById('bundle-pills-container');
  if (!container) return;
  const bundles = ['all', ...new Set(state.feeds.map(f => f.bundle).filter(b => b && b !== 'Unassigned'))];
  container.innerHTML = bundles.map(b => `
    <button class="pill-btn ${state.activeFilter === b ? 'active' : ''}" onclick="filterByBundle('${b}')">
      ${b === 'all' ? 'All Feeds' : b}
    </button>
  `).join('');
}

function filterByBundle(bundleName) {
  state.activeFilter = bundleName;
  renderPills();
  renderStream();
}

function renderSidebar() {
  const feedList = document.getElementById('feed-list');
  const bundleList = document.getElementById('bundle-list');
  if (feedList) feedList.innerHTML = state.feeds.map(f => `<li>${f.name}</li>`).join('');
  if (bundleList) bundleList.innerHTML = state.bundles.map(b => `<li>📦 ${b.name}</li>`).join('');
}

function saveState() {
  localStorage.setItem('mf_feeds', JSON.stringify(state.feeds));
  localStorage.setItem('mf_bundles', JSON.stringify(state.bundles));
  localStorage.setItem('mf_items', JSON.stringify(state.items));
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}