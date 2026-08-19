/**
 * MarketFeed - RSS Creator, Bundle Builder & RSS.app Filter Engine
 */

let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [
    {
      id: '1',
      name: '$RELIANCE Updates',
      type: 'keyword',
      query: 'RELIANCE stock news',
      bundle: 'Stocks',
      alerts: true,
      filters: { whitelist: ['reliance', 'profit', 'quarter'], blacklist: ['crypto'], matchField: 'all', matchMode: 'OR' }
    }
  ],
  bundles: JSON.parse(localStorage.getItem('mf_bundles')) || [
    { id: 'b1', name: 'Stocks', alerts: true, filters: { whitelist: [], blacklist: [] } },
    { id: 'b2', name: 'Indices', alerts: true, filters: { whitelist: [], blacklist: [] } }
  ],
  items: JSON.parse(localStorage.getItem('mf_items')) || [],
  activeTab: 'news',
  activeFilter: 'all',
  searchQuery: '',
  sortOrder: 'newest',
  settings: JSON.parse(localStorage.getItem('mf_settings')) || {
    autoRefreshMinutes: 5,
    soundEnabled: true,
    importantKeywords: ['$RELIANCE', 'BREAKING', 'PROFIT', 'DIVIDEND']
  },
  timerId: null
};

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initNotificationPermission();
  renderAllViews();
  setupEventListeners();
  setupAutoRefresh(state.settings.autoRefreshMinutes);
});

/* ==========================================================================
   1. EVENT LISTENERS & MODAL HANDLERS
   ========================================================================== */

function setupEventListeners() {
  const feedModal = document.getElementById('feed-modal');
  const bundleModal = document.getElementById('bundle-modal');

  // Open "Create Feed" Modal
  document.getElementById('add-feed-btn')?.addEventListener('click', () => {
    feedModal?.classList.remove('hidden');
  });

  // Open "Create Bundle" Modal
  document.getElementById('add-bundle-btn')?.addEventListener('click', () => {
    bundleModal?.classList.remove('hidden');
  });

  // Close Modals
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });
  });

  // Main Navigation Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const targetTab = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add('active');
      state.activeTab = targetTab;
      switchTab(targetTab);
    });
  });

  // Bundle Category Pills
  document.getElementById('bundle-pills-container')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill-btn')) {
      document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.dataset.filter;
      if (state.activeTab === 'news') renderStream();
    }
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

  // Handle RSS Feed Creation
  document.getElementById('feed-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('feed-name-input').value;
    const type = document.getElementById('feed-type-select').value;
    const inputQuery = document.getElementById('feed-url-input').value;
    const bundleName = document.getElementById('feed-bundle-input').value || 'General';
    const alerts = document.getElementById('feed-alert-toggle').checked;

    // Convert Query or Keyword into a RSS Feed URL
    const generatedUrl = type === 'keyword' 
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(inputQuery)}`
      : inputQuery;

    const newFeed = {
      id: Date.now().toString(),
      name: name,
      type: type,
      query: inputQuery,
      url: generatedUrl,
      bundle: bundleName,
      alerts: alerts,
      filters: { whitelist: [], blacklist: [], matchField: 'all', matchMode: 'OR' }
    };

    state.feeds.push(newFeed);

    // Auto-create Bundle if missing
    if (bundleName && !state.bundles.some(b => b.name.toLowerCase() === bundleName.toLowerCase())) {
      state.bundles.push({ id: 'b_' + Date.now(), name: bundleName, alerts: true, filters: { whitelist: [], blacklist: [] } });
    }

    saveState();
    renderAllViews();
    feedModal.classList.add('hidden');
    e.target.reset();
  });

  // Handle Bundle Creation
  document.getElementById('bundle-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const bundleName = document.getElementById('bundle-name-input').value;
    const alerts = document.getElementById('bundle-alert-toggle').checked;

    if (bundleName) {
      state.bundles.push({
        id: 'b_' + Date.now(),
        name: bundleName,
        alerts: alerts,
        filters: { whitelist: [], blacklist: [] }
      });
      saveState();
      renderAllViews();
      bundleModal.classList.add('hidden');
      e.target.reset();
    }
  });
}

/* ==========================================================================
   2. VIEW CONTROLLER & TAB SWITCHING
   ========================================================================== */

function switchTab(tabName) {
  const container = document.getElementById('main-view-container');
  if (!container) return;

  if (tabName === 'news') {
    container.innerHTML = `
      <div id="stream-header" class="stream-header">
        <h2 id="stream-title">All Updates</h2>
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

function renderBundlesPills() {
  const container = document.getElementById('bundle-pills-container');
  if (!container) return;
  const bundles = ['all', ...new Set(state.feeds.map(f => f.bundle).filter(Boolean))];
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

/* ==========================================================================
   3. TAB PAGE RENDERERS (Feeds, Bundles, RSS.app Filters)
   ========================================================================== */

function renderFeedsPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>📡 Created & Managed RSS Feeds</h2>
      <div class="cards-list">
        ${state.feeds.map(f => `
          <div class="card-item" style="background:var(--bg-secondary); padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4>${f.name} <small style="color:var(--text-muted);">(${f.bundle || 'General'})</small></h4>
              <button class="btn btn-secondary" onclick="toggleFeedAlert('${f.id}')">${f.alerts ? '🔔 Alerts On' : '🔕 Alerts Off'}</button>
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">Source: ${f.url}</p>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderBundlesPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>📦 Custom Feed Bundles</h2>
      <div class="cards-list">
        ${state.bundles.map(b => `
          <div class="card-item" style="background:var(--bg-secondary); padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4>📦 ${b.name}</h4>
              <button class="btn btn-secondary" onclick="toggleBundleAlert('${b.id}')">${b.alerts ? '🔔 Alerts On' : '🔕 Alerts Off'}</button>
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">
              Assigned Feeds: ${state.feeds.filter(f => f.bundle === b.name).map(f => f.name).join(', ') || 'None'}
            </p>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderFiltersPage(container) {
  container.innerHTML = `
    <div class="view-panel">
      <h2>🔍 RSS.app Filter Rules Manager</h2>
      <p style="color:var(--text-muted); margin-bottom:1rem;">Configure Whitelists, Blacklists, and Content rules for specific feeds.</p>
      ${state.feeds.map(f => `
        <div class="filter-card" style="background:var(--bg-secondary); padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid var(--border-color);">
          <h4>Feed: ${f.name}</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-top:0.75rem;">
            <div>
              <label style="font-size:0.8rem;">Whitelist Keywords (comma separated)</label>
              <input type="text" class="select-input full-width" value="${(f.filters?.whitelist || []).join(', ')}" onchange="updateFeedFilter('${f.id}', 'whitelist', this.value)">
            </div>
            <div>
              <label style="font-size:0.8rem;">Blacklist Keywords (comma separated)</label>
              <input type="text" class="select-input full-width" value="${(f.filters?.blacklist || []).join(', ')}" onchange="updateFeedFilter('${f.id}', 'blacklist', this.value)">
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

/* ==========================================================================
   4. RSS.APP STREAM & FILTER EVALUATOR
   ========================================================================== */

function renderStream() {
  const container = document.getElementById('feed-items-container');
  if (!container) return;

  let processed = state.items.filter(item => {
    const feed = state.feeds.find(f => f.id === item.feedId) || {};
    const bundle = state.bundles.find(b => b.name === feed.bundle) || null;
    return passesRssAppFilters(item, feed.filters) && (!bundle || passesRssAppFilters(item, bundle.filters));
  });

  if (state.activeFilter !== 'all') {
    const validFeedIds = state.feeds.filter(f => f.bundle === state.activeFilter).map(f => f.id);
    processed = processed.filter(item => validFeedIds.includes(item.feedId));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    processed = processed.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.snippet && i.snippet.toLowerCase().includes(q)));
  }

  processed.sort((a, b) => state.sortOrder === 'newest' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date));

  const unreadCount = document.getElementById('unread-count');
  if (unreadCount) unreadCount.innerText = `${processed.length} items`;

  if (processed.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No news articles match your filter rules.</p>`;
    return;
  }

  container.innerHTML = processed.map(item => `
    <article class="feed-card">
      <div>
        <h4><a href="${item.link}" target="_blank">${cleanArticleTitle(item.title)}</a></h4>
        <p>${item.snippet || ''}</p>
      </div>
      <div class="feed-meta">
        <span>${item.source || 'Stock Feed'}</span>
        <time>${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
      </div>
    </article>
  `).join('');
}

function passesRssAppFilters(article, filters) {
  if (!filters) return true;
  const { whitelist = [], blacklist = [], matchField = 'all', matchMode = 'OR' } = filters;
  const targetText = getTargetText(article, matchField).toLowerCase();

  if (blacklist.length > 0 && blacklist.some(w => w && targetText.includes(w.toLowerCase().trim()))) return false;
  if (whitelist.length > 0) {
    if (matchMode === 'AND') return whitelist.every(w => w && targetText.includes(w.toLowerCase().trim()));
    return whitelist.some(w => w && targetText.includes(w.toLowerCase().trim()));
  }
  return true;
}

function getTargetText(article, field) {
  if (field === 'title') return article.title || '';
  if (field === 'description') return article.snippet || '';
  if (field === 'url') return article.link || '';
  return `${article.title || ''} ${article.snippet || ''} ${article.link || ''}`;
}

function cleanArticleTitle(title) {
  return (title || '').replace(/^\[.*?\]\s*/, '').replace(/\s*-\s*[^-]+$/, '').trim();
}

/* ==========================================================================
   5. STATE HELPERS & ALERTS
   ========================================================================== */

function updateFeedFilter(feedId, key, value) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) {
    if (!feed.filters) feed.filters = {};
    feed.filters[key] = value.split(',').map(s => s.trim()).filter(Boolean);
    saveState();
  }
}

function toggleFeedAlert(feedId) {
  const feed = state.feeds.find(f => f.id === feedId);
  if (feed) { feed.alerts = !feed.alerts; saveState(); renderAllViews(); switchTab('feeds'); }
}

function toggleBundleAlert(bundleId) {
  const bundle = state.bundles.find(b => b.id === bundleId);
  if (bundle) { bundle.alerts = !bundle.alerts; saveState(); renderAllViews(); switchTab('bundles'); }
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

async function refreshFeeds() {
  if (state.feeds.length === 0) return;
  const activeFeed = state.feeds[0];
  const newItem = {
    id: Date.now().toString(),
    feedId: activeFeed.id,
    title: `$${activeFeed.name.replace(/\s+/g, '')} / Breakout Alert #${Math.floor(Math.random() * 100)}`,
    snippet: 'Trading volume spike and market order shift detected.',
    link: 'https://example.com',
    source: activeFeed.name,
    date: new Date().toISOString()
  };

  if (passesRssAppFilters(newItem, activeFeed.filters)) {
    state.items.unshift(newItem);
    saveState();
    if (state.activeTab === 'news') renderStream();
    if (activeFeed.alerts) triggerNotification(newItem, `Alert: ${activeFeed.name}`);
  }
}

function triggerNotification(article, alertTitle) {
  if (state.settings.soundEnabled) playAlertSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(alertTitle, { body: article.title });
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

function initServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

function initNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') Notification.requestPermission();
}