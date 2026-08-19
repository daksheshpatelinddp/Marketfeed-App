/**
 * MarketFeed - Complete Application Script
 * Features: Mobile Tab Navigation, RSS.app Filtering Engine, Selective Alerts, & Modals
 */

// Global Application State
let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [
    {
      id: '1',
      name: 'Nifty 50 News',
      url: 'https://news.google.com/rss/search?q=Nifty50',
      bundle: 'Indices',
      alerts: true,
      filters: {
        whitelist: ['nifty', 'market', 'stock'],
        blacklist: ['crypto'],
        matchField: 'all',
        matchMode: 'OR',
        hideNoImage: false,
        hideNoDescription: false,
        hideOlderThanHours: 48,
        blockedDomains: []
      }
    }
  ],
  bundles: JSON.parse(localStorage.getItem('mf_bundles')) || [
    {
      id: 'b1',
      name: 'Indices',
      alerts: true,
      filters: { whitelist: [], blacklist: [] }
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
    importantKeywords: ['$RELIANCE', 'BREAKING', 'PROFIT', 'DIVIDEND']
  },
  timerId: null
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initNotificationPermission();
  renderAllViews();
  setupEventListeners();
  setupAutoRefresh(state.settings.autoRefreshMinutes);
});

/* ==========================================================================
   1. NAVIGATION & MODAL EVENT LISTENERS (Fixes Unresponsive Buttons)
   ========================================================================== */

function setupEventListeners() {
  // Modal Elements
  const feedModal = document.getElementById('feed-modal');
  const addFeedBtn = document.getElementById('add-feed-btn');
  const closeModalBtns = document.querySelectorAll('.close-modal');

  // Open "New Feed" Modal
  if (addFeedBtn && feedModal) {
    addFeedBtn.addEventListener('click', () => {
      feedModal.classList.remove('hidden');
    });
  }

  // Close Modals
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });
  });

  // Top/Mobile Navigation Tabs (News, Feeds, Bundles, Filters)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const targetTab = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add('active');
      state.activeTab = targetTab;
      switchTab(targetTab);
    });
  });

  // Filter Pills (Bundles & Categories)
  const bundlePillsContainer = document.getElementById('bundle-pills-container');
  if (bundlePillsContainer) {
    bundlePillsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('pill-btn')) {
        document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        state.activeFilter = e.target.dataset.filter;
        renderStream();
      }
    });
  }

  // Search Input Handler
  const searchInput = document.getElementById('feed-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderStream();
    });
  }

  // Sort Order Selector
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      renderStream();
    });
  }

  // Refresh Button
  const refreshBtn = document.getElementById('refresh-now-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refreshFeeds());
  }

  // New Feed Form Submission
  const feedForm = document.getElementById('feed-form');
  if (feedForm) {
    feedForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('feed-name-input');
      const urlInput = document.getElementById('feed-url-input');
      const bundleInput = document.getElementById('feed-bundle-input');
      const alertsToggle = document.getElementById('feed-alert-toggle');

      const newFeed = {
        id: Date.now().toString(),
        name: nameInput ? nameInput.value : 'New Feed',
        url: urlInput ? urlInput.value : '#',
        bundle: bundleInput && bundleInput.value ? bundleInput.value : 'General',
        alerts: alertsToggle ? alertsToggle.checked : true,
        filters: { whitelist: [], blacklist: [] }
      };

      state.feeds.push(newFeed);
      localStorage.setItem('mf_feeds', JSON.stringify(state.feeds));
      
      renderAllViews();
      if (feedModal) feedModal.classList.add('hidden');
      feedForm.reset();
    });
  }
}

/* ==========================================================================
   2. VIEW RENDERING & SWITCHING
   ========================================================================== */

function switchTab(tabName) {
  const sidebar = document.getElementById('sidebar');
  const feedStream = document.querySelector('.feed-stream');
  
  if (tabName === 'news' || tabName === 'all') {
    if (sidebar) sidebar.style.display = 'block';
    if (feedStream) feedStream.style.display = 'block';
    renderStream();
  } else if (tabName === 'feeds') {
    renderFeedsPage();
  } else if (tabName === 'bundles') {
    renderBundlesPage();
  } else if (tabName === 'filters') {
    renderFiltersPage();
  }
}

function renderAllViews() {
  renderBundlesPills();
  renderSidebarLists();
  renderStream();
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
  if (feedList) {
    feedList.innerHTML = state.feeds.map(f => `
      <li data-id="${f.id}">
        <span>${f.name}</span>
        <small>${f.alerts ? '🔔' : ''}</small>
      </li>
    `).join('');
  }
}

function renderStream() {
  const container = document.getElementById('feed-items-container');
  if (!container) return;

  // Process raw items through the RSS.app filter pipeline
  let processed = state.items.filter(item => {
    const feed = state.feeds.find(f => f.id === item.feedId) || {};
    const bundle = state.bundles.find(b => b.name === feed.bundle) || null;
    return passesRssAppFilters(item, feed.filters || {}) && 
           (!bundle || passesRssAppFilters(item, bundle.filters || {}));
  });

  // Apply Bundle/Category Pill Filter
  if (state.activeFilter !== 'all') {
    const validFeedIds = state.feeds.filter(f => f.bundle === state.activeFilter).map(f => f.id);
    processed = processed.filter(item => validFeedIds.includes(item.feedId));
  }

  // Apply Search Keyword Filter
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    processed = processed.filter(i => 
      (i.title && i.title.toLowerCase().includes(q)) || 
      (i.snippet && i.snippet.toLowerCase().includes(q))
    );
  }

  // Apply Sorting
  processed.sort((a, b) => {
    return state.sortOrder === 'newest' 
      ? new Date(b.date) - new Date(a.date) 
      : new Date(a.date) - new Date(b.date);
  });

  const unreadCount = document.getElementById('unread-count');
  if (unreadCount) unreadCount.innerText = `${processed.length} items`;

  if (processed.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted, #94a3b8); padding: 2rem;">No items found matching your filters.</p>`;
    return;
  }

  container.innerHTML = processed.map(item => `
    <article class="feed-card">
      <div>
        <h4><a href="${item.link}" target="_blank" rel="noopener">${cleanArticleTitle(item.title)}</a></h4>
        <p>${item.snippet || ''}</p>
      </div>
      <div class="feed-meta">
        <span>${item.source || 'Stock Feed'}</span>
        <time>${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
      </div>
    </article>
  `).join('');
}

// Fallback renderers for Feeds, Bundles, and Filters views
function renderFeedsPage() {
  const container = document.getElementById('feed-items-container');
  if (container) {
    container.innerHTML = `<div style="grid-column: 1/-1;"><h3>Managed Feeds</h3>` +
      state.feeds.map(f => `<div style="padding: 10px; border-bottom: 1px solid #333;"><strong>${f.name}</strong> (${f.bundle}) ${f.alerts ? '🔔' : ''}</div>`).join('') +
      `</div>`;
  }
}

function renderBundlesPage() {
  const container = document.getElementById('feed-items-container');
  if (container) {
    const bundles = [...new Set(state.feeds.map(f => f.bundle).filter(Boolean))];
    container.innerHTML = `<div style="grid-column: 1/-1;"><h3>Feed Bundles</h3>` +
      bundles.map(b => `<div style="padding: 10px; border-bottom: 1px solid #333;">📦 <strong>${b}</strong></div>`).join('') +
      `</div>`;
  }
}

function renderFiltersPage() {
  const container = document.getElementById('feed-items-container');
  if (container) {
    container.innerHTML = `<div style="grid-column: 1/-1;"><h3>Active Filter Rules</h3><p>Configure feeds or bundles to edit whitelist and blacklist parameters.</p></div>`;
  }
}

/* ==========================================================================
   3. RSS.APP FILTERING PIPELINE
   ========================================================================== */

function passesRssAppFilters(article, filters) {
  if (!filters) return true;

  const {
    whitelist = [],
    blacklist = [],
    matchField = 'all',
    matchMode = 'OR',
    hideNoImage = false,
    hideNoDescription = false,
    hideOlderThanHours = 0,
    blockedDomains = []
  } = filters;

  const targetText = getTargetText(article, matchField).toLowerCase();

  if (hideNoImage && !article.imageUrl) return false;
  if (hideNoDescription && (!article.snippet || article.snippet.trim() === '')) return false;

  if (hideOlderThanHours > 0 && article.date) {
    const postTime = new Date(article.date).getTime();
    const cutoff = Date.now() - (hideOlderThanHours * 60 * 60 * 1000);
    if (postTime < cutoff) return false;
  }

  if (blockedDomains.length > 0 && article.link) {
    if (blockedDomains.some(d => article.link.toLowerCase().includes(d.toLowerCase()))) return false;
  }

  if (blacklist.length > 0) {
    if (blacklist.some(word => targetText.includes(word.toLowerCase().trim()))) return false;
  }

  if (whitelist.length > 0) {
    if (matchMode === 'AND') {
      if (!whitelist.every(word => targetText.includes(word.toLowerCase().trim()))) return false;
    } else {
      if (!whitelist.some(word => targetText.includes(word.toLowerCase().trim()))) return false;
    }
  }

  return true;
}

function getTargetText(article, field) {
  switch (field) {
    case 'title': return article.title || '';
    case 'description': return article.snippet || '';
    case 'url': return article.link || '';
    default: return `${article.title || ''} ${article.snippet || ''} ${article.link || ''}`;
  }
}

function cleanArticleTitle(title) {
  if (!title) return '';
  return title.replace(/^\[.*?\]\s*/, '').replace(/\s*-\s*[^-]+$/, '').trim();
}

/* ==========================================================================
   4. AUTO-REFRESH & SELECTIVE ALERTS
   ========================================================================== */

function setupAutoRefresh(minutes) {
  if (state.timerId) clearInterval(state.timerId);
  if (minutes > 0) {
    state.timerId = setInterval(() => refreshFeeds(), minutes * 60 * 1000);
  }
}

async function refreshFeeds() {
  // Simulated incoming post fetch
  const newItem = {
    id: Date.now().toString(),
    feedId: state.feeds[0]?.id || '1',
    title: `$RELIANCE / Market Movement Detected #${Math.floor(Math.random() * 100)}`,
    snippet: 'Volume spike observed during current session.',
    link: 'https://example.com',
    source: 'Stock Feed',
    date: new Date().toISOString()
  };

  const feed = state.feeds.find(f => f.id === newItem.feedId) || {};
  
  if (passesRssAppFilters(newItem, feed.filters)) {
    state.items.unshift(newItem);
    localStorage.setItem('mf_items', JSON.stringify(state.items));
    renderStream();

    if (feed.alerts || isImportantNews(newItem, state.settings.importantKeywords)) {
      triggerNotification(newItem, `Alert: ${feed.name || 'MarketFeed'}`);
    }
  }
}

function isImportantNews(article, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const combined = `${article.title || ''} ${article.snippet || ''}`.toLowerCase();
  return keywords.some(kw => combined.includes(kw.toLowerCase().trim()));
}

function triggerNotification(article, alertTitle) {
  if (state.settings.soundEnabled) playAlertSound();

  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PUSH_NOTIFICATION',
        title: alertTitle,
        body: article.title,
        url: article.link
      });
    } else {
      new Notification(alertTitle, { body: article.title });
    }
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
  } catch (e) {
    console.error("Audio error:", e);
  }
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.error(err));
  }
}

function initNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}