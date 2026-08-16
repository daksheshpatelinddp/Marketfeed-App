const WORKER_API = "https://rssfeed.daksheshpatelin.workers.dev/rss?url=";

let currentPreviewFeed = null;

document.addEventListener("DOMContentLoaded", () => {
  showMyFeedsView();
  
  document.getElementById("feed-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleGenerateClick();
    }
  });
});

async function handleGenerateClick() {
  const input = document.getElementById("feed-input").value.trim();
  if (!input) {
    alert("Please enter a keyword or topic!");
    return;
  }
  await generateFeed(input);
}

async function generateFeed(query) {
  showSpinner(true);

  try {
    const response = await fetch(`${WORKER_API}${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.ok || !data.items || data.items.length === 0) {
      alert("No RSS feed articles found for: " + query);
      return;
    }

    currentPreviewFeed = {
      id: "feed_" + Date.now(),
      name: query,
      query: query,
      items: data.items
    };

    renderPreviewScreen(currentPreviewFeed);
  } catch (err) {
    alert("Failed to connect to feed generator backend.");
  } finally {
    showSpinner(false);
  }
}

function renderPreviewScreen(feed) {
  const content = document.getElementById("app-content");

  let html = `
    <div class="preview-header">
      <button class="btn-back" onclick="showMyFeedsView()">← Back</button>
      <h2>${escapeHtml(feed.name)}</h2>
      <span class="badge">${feed.items.length} Articles</span>
    </div>
    <div class="articles-list">
  `;

  feed.items.forEach(item => {
    const pubDate = new Date(item.date).toLocaleDateString("en-IN", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });

    html += `
      <article class="article-card">
        <h3><a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="article-meta">
          <span>${pubDate}</span>
        </div>
      </article>
    `;
  });

  html += `
    </div>
    <div class="floating-save-bar">
      <button class="btn-save-feed" onclick="saveCurrentFeed()">Save To My Feeds</button>
    </div>
  `;

  content.innerHTML = html;
  window.scrollTo(0, 0);
}

function saveCurrentFeed() {
  if (!currentPreviewFeed) return;

  let feeds = JSON.parse(localStorage.getItem("mf_saved_feeds") || "[]");

  const exists = feeds.some(f => f.name.toLowerCase() === currentPreviewFeed.name.toLowerCase());
  
  if (!exists) {
    feeds.unshift({
      id: currentPreviewFeed.id,
      name: currentPreviewFeed.name,
      query: currentPreviewFeed.query,
      savedAt: new Date().toISOString()
    });
    localStorage.setItem("mf_saved_feeds", JSON.stringify(feeds));
  }

  showMyFeedsView();
}

function showMyFeedsView() {
  setActiveTab("nav-my-feeds");
  const content = document.getElementById("app-content");
  let feeds = JSON.parse(localStorage.getItem("mf_saved_feeds") || "[]");

  if (feeds.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <p>No saved RSS feeds yet.</p>
        <small>Type any topic (e.g. <b>Kfintech</b>, <b>Infosys</b>) in the top search box and click <b>Generate</b>.</small>
      </div>
    `;
    return;
  }

  let html = `<div class="feeds-section-title">My Feeds (${feeds.length})</div><div class="feeds-list">`;

  feeds.forEach(feed => {
    html += `
      <div class="feed-list-item" onclick="generateFeed('${escapeHtml(feed.query)}')">
        <div class="feed-icon">🔍</div>
        <div class="feed-details">
          <h4>${escapeHtml(feed.name)}</h4>
          <p>Tap to refresh feed</p>
        </div>
        <button class="btn-delete" onclick="event.stopPropagation(); deleteFeed('${feed.id}')">✕</button>
      </div>
    `;
  });

  html += `</div>`;
  content.innerHTML = html;
}

function deleteFeed(id) {
  let feeds = JSON.parse(localStorage.getItem("mf_saved_feeds") || "[]");
  feeds = feeds.filter(f => f.id !== id);
  localStorage.setItem("mf_saved_feeds", JSON.stringify(feeds));
  showMyFeedsView();
}

function switchTab(tab) {
  if (tab === "my-feeds") {
    showMyFeedsView();
  } else if (tab === "create") {
    document.getElementById("feed-input").focus();
  }
}

function setActiveTab(btnId) {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(btnId)?.classList.add("active");
}

function showSpinner(show) {
  document.getElementById("loading-spinner").classList.toggle("hidden", !show);
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}