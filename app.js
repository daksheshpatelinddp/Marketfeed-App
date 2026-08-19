/**
 * MarketFeed - RSS.app Style Filter & Selective Alert Engine
 */

// Global App State Structure
let state = {
  feeds: JSON.parse(localStorage.getItem('mf_feeds')) || [],
  bundles: JSON.parse(localStorage.getItem('mf_bundles')) || [],
  items: JSON.parse(localStorage.getItem('mf_items')) || [],
  settings: JSON.parse(localStorage.getItem('mf_settings')) || {
    autoRefreshMinutes: 5,
    soundEnabled: true,
    importantKeywords: ['$RELIANCE', 'BREAKING', 'PROFIT', 'DIVIDEND']
  }
};

/**
 * Main Item Processing Pipeline (RSS.app Logic)
 */
function processArticles(rawArticles, feedConfig, bundleConfig = null) {
  return rawArticles.filter(article => {
    
    // 1. Check Important-News Fast Pass for Instant Alerts
    if (isImportantNews(article, state.settings.importantKeywords)) {
      if (feedConfig.alerts || (bundleConfig && bundleConfig.alerts)) {
        triggerNotification(article, "🚨 Important Alert");
      }
    }

    // 2. Feed-Level Filtering
    if (feedConfig.filters && !passesRssAppFilters(article, feedConfig.filters)) {
      return false;
    }

    // 3. Bundle-Level Filtering (if applicable)
    if (bundleConfig && bundleConfig.filters && !passesRssAppFilters(article, bundleConfig.filters)) {
      return false;
    }

    // 4. Trigger standard alert if new article passes all filters and alerts are enabled
    if (!article.isRead && (feedConfig.alerts || (bundleConfig && bundleConfig.alerts))) {
      triggerNotification(article, `New post in ${feedConfig.name}`);
    }

    return true;
  });
}

/**
 * RSS.app Core Rule Evaluator
 */
function passesRssAppFilters(article, filters) {
  const {
    whitelist = [],      // Must contain
    blacklist = [],      // Must NOT contain
    matchField = 'all',  // 'title', 'description', 'url', 'all'
    matchMode = 'OR',    // 'OR' (partial match), 'AND' (all keywords required)
    hideNoImage = false,
    hideNoDescription = false,
    hideOlderThanHours = 0,
    blockedDomains = [],
    dedupeTitles = true,
    similarTitleThreshold = 0.85
  } = filters;

  const targetText = getTargetText(article, matchField).toLowerCase();

  // Hide post without image
  if (hideNoImage && !article.imageUrl) return false;

  // Hide post without description
  if (hideNoDescription && (!article.snippet || article.snippet.trim() === '')) return false;

  // Hide posts older than X hours
  if (hideOlderThanHours > 0) {
    const postDate = new Date(article.date).getTime();
    const cutoffDate = Date.now() - (hideOlderThanHours * 60 * 60 * 1000);
    if (postDate < cutoffDate) return false;
  }

  // Domain Blocking
  if (blockedDomains.length > 0 && article.link) {
    const isBlocked = blockedDomains.some(domain => article.link.toLowerCase().includes(domain.toLowerCase()));
    if (isBlocked) return false;
  }

  // Blacklist (Must NOT match any keyword)
  if (blacklist.length > 0) {
    const hasBlacklistedWord = blacklist.some(word => targetText.includes(word.toLowerCase().trim()));
    if (hasBlacklistedWord) return false;
  }

  // Whitelist Filtering
  if (whitelist.length > 0) {
    if (matchMode === 'AND') {
      // Must contain ALL whitelist terms
      const matchesAll = whitelist.every(word => targetText.includes(word.toLowerCase().trim()));
      if (!matchesAll) return false;
    } else {
      // Must contain AT LEAST ONE whitelist term (OR)
      const matchesOne = whitelist.some(word => targetText.includes(word.toLowerCase().trim()));
      if (!matchesOne) return false;
    }
  }

  return true;
}

/**
 * Helper: Extract target text based on selected RSS.app field
 */
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

/**
 * Important News Keyword Checker
 */
function isImportantNews(article, keywords) {
  if (!keywords || keywords.length === 0) return false;
  const combined = `${article.title} ${article.snippet}`.toLowerCase();
  return keywords.some(kw => combined.includes(kw.toLowerCase().trim()));
}

/**
 * Mobile Push & Sound Alert Trigger
 */
function triggerNotification(article, alertTitle) {
  // Play Alert Sound
  if (state.settings.soundEnabled) {
    playAlertSound();
  }

  // Mobile Web Push Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PUSH_NOTIFICATION',
        title: alertTitle,
        body: article.title,
        url: article.link
      });
    } else {
      new Notification(alertTitle, {
        body: article.title,
        icon: article.imageUrl || '/icon-192.png'
      });
    }
  }
}

/**
 * Audio Alert Synthesizer (No external MP3 needed)
 */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

/**
 * Clean-Title Option
 */
function cleanArticleTitle(title) {
  if (!title) return '';
  return title
    .replace(/^\[.*?\]\s*/, '') // Remove prefix tags like [UPDATE]
    .replace(/\s*-\s*[^-]+$/, '') // Remove trailing source names (e.g., " - Economic Times")
    .trim();
}