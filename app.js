// State Management
let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [
    { id: '1', name: 'Nifty 50 News', url: '#', bundle: 'Indices', alerts: true },
    { id: '2', name: '$RELIANCE Updates', url: '#', bundle: 'Stocks', alerts: true }
  ],
  items: JSON.parse(localStorage.getItem('mf_items')) || [],
  activeTab: 'all',
  activeFilter: 'all',
  searchQuery: '',
  sortOrder: 'newest',
  autoRefreshInterval: 1, // Minutes
  timerId: null
};

// DOM Elements
const feedContainer = document.getElementById('feed-items-container');
const searchInput = document.getElementById('feed-search');
const sortSelect = document.getElementById('sort-select');
const autoRefreshSelect = document.getElementById('auto-refresh-select');
const bundlePillsContainer = document.getElementById('bundle-pills-container');
const feedModal = document.getElementById('feed-modal');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initNotificationPermission();
  renderBundles();
  renderFeedList();
  renderStream();
  setupAutoRefresh(state.autoRefreshInterval);
  setupEventListeners();
});

// Register Service Worker for Mobile Notifications
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.error('SW Registration Failed:', err));
  }
}

// Mobile Notification Request
function initNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

// Render rss.app style filter pills
function renderBundles() {
  const bundles = ['all', ...new Set(state.feeds.map(f => f.bundle).filter(Boolean))];
  bundlePillsContainer.innerHTML = bundles.map(b => `
    <button class="pill-btn ${state.activeFilter === b ? 'active' : ''}" data-filter="${b}">
      ${b === 'all' ? 'All Feeds' : b}
    </button>
  `).join('');
}

// Render Sidebar Feed Items
function renderFeedList() {
  const list = document.getElementById('feed-list');
  list.innerHTML = state.feeds.map(f => `
    <li data-id="${f.id}">
      <span>${f.name}</span>
      <small>${f.alerts ? '🔔' : ''}</small>
    </li>
  `).join('');
}

// Filter and Render Feed Cards
function renderStream() {
  let filtered = [...state.items];

  if (state.activeFilter !== 'all') {
    const bundleFeedIds = state.feeds.filter(f => f.bundle === state.activeFilter).map(f => f.id);
    filtered = filtered.filter(item => bundleFeedIds.includes(item.feedId));
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(item => item.title.toLowerCase().includes(q) || item.snippet.toLowerCase().includes(q));
  }

  filtered.sort((a, b) => {
    return state.sortOrder === 'newest' ? new Date(b.date) - new Date(a.date) : new Date(a.date) - new Date(b.date);
  });

  document.getElementById('unread-count').innerText = `${filtered.length} items`;

  if (filtered.length === 0) {
    feedContainer.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No feed items found. Click "+ New Feed" to add one.</p>`;
    return;
  }

  feedContainer.innerHTML = filtered.map(item => `
    <article class="feed-card">
      <div>
        <h4><a href="${item.link}" target="_blank" style="color:inherit; text-decoration:none;">${item.title}</a></h4>
        <p>${item.snippet}</p>
      </div>
      <div class="feed-meta">
        <span>${item.source || 'Stock Feed'}</span>
        <time>${new Date(item.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</time>
      </div>
    </article>
  `).join('');
}

// Auto-Refresh & Background Fetching Logic
function setupAutoRefresh(minutes) {
  if (state.timerId) clearInterval(state.timerId);
  if (minutes > 0) {
    state.timerId = setInterval(() => {
      refreshFeeds();
    }, minutes * 60 * 1000);
  }
}

// Refresh feeds and push notifications for new updates
async function refreshFeeds() {
  console.log('Refreshing feeds...');
  // Simulated fetch of new feed item
  const newItemsCount = Math.floor(Math.random() * 2); // Simulating 0 or 1 new items
  
  if (newItemsCount > 0) {
    const newItem = {
      id: Date.now().toString(),
      feedId: state.feeds[0]?.id || '1',
      title: `$RELIANCE / Market Update #${Math.floor(Math.random() * 100)}`,
      snippet: 'Key movement detected in current trading session based on volume spikes.',
      link: '#',
      source: 'Stock Stream',
      date: new Date().toISOString()
    };

    state.items.unshift(newItem);
    localStorage.setItem('mf_items', JSON.stringify(state.items));
    renderStream();

    // Check if notifications are enabled for this feed/bundle
    const feed = state.feeds.find(f => f.id === newItem.feedId);
    if (feed && feed.alerts) {
      triggerMobileNotification(newItem.title, newItem.snippet);
    }
  }
}

// Trigger Web / Mobile Push Notification
function triggerMobileNotification(title, body) {
  if (Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PUSH_NOTIFICATION',
        title: title,
        body: body
      });
    } else {
      new Notification(title, { body: body, icon: 'icon-192.png' });
    }
  }
}

// Event Listeners
function setupEventListeners() {
  // Tabs Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.activeTab = e.target.dataset.tab;
      renderStream();
    });
  });

  // Filter Pills (Bundles)
  bundlePillsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill-btn')) {
      document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.dataset.filter;
      renderStream();
    }
  });

  // Search Input
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderStream();
  });

  // Sorting
  sortSelect.addEventListener('change', (e) => {
    state.sortOrder = e.target.value;
    renderStream();
  });

  // Auto Refresh Interval
  autoRefreshSelect.addEventListener('change', (e) => {
    state.autoRefreshInterval = parseInt(e.target.value);
    setupAutoRefresh(state.autoRefreshInterval);
  });

  // Manual Refresh
  document.getElementById('refresh-now-btn').addEventListener('click', () => refreshFeeds());

  // Modal toggles
  document.getElementById('add-feed-btn').addEventListener('click', () => feedModal.classList.remove('hidden'));
  document.querySelector('.close-modal').addEventListener('click', () => feedModal.classList.add('hidden'));

  // Form Submit
  document.getElementById('feed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newFeed = {
      id: Date.now().toString(),
      name: document.getElementById('feed-name-input').value,
      url: document.getElementById('feed-url-input').value,
      bundle: document.getElementById('feed-bundle-input').value || 'General',
      alerts: document.getElementById('feed-alert-toggle').checked
    };
    state.feeds.push(newFeed);
    localStorage.setItem('mf_feeds', JSON.stringify(state.feeds));
    renderBundles();
    renderFeedList();
    feedModal.classList.add('hidden');
    e.target.reset();
  });
}