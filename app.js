const PROXY = "https://rssfeed.daksheshpatelin.workers.dev";
const KEY = "marketfeed_v3";
const DEFAULT_FILTER = () => ({ white: [], black: [], dedupe: true });

let S = loadState();
let bundle = "";
let activeFeed = "";
let filterTarget = null;
let assignFeedId = null;
let assignBundleId = null;

const feedDlg = $("feedDlg");
const bundleDlg = $("bundleDlg");
const filterDlg = $("filterDlg");
const assignDlg = $("assignDlg");
const toastEl = $("toast");

function $(id) { return document.getElementById(id); }
function esc(x) { return String(x ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function name(id) { return S.feeds.find(f => f.id === id)?.name || "Feed"; }
function toast(x) {
  toastEl.textContent = x;
  toastEl.style.display = "block";
  setTimeout(() => toastEl.style.display = "none", 2200);
}
function txt(a) {
  return ((a.title || "") + " " + (a.description || "") + " " + (a.source || "")).toLowerCase();
}
function normalizeFilter(f) { return { ...DEFAULT_FILTER(), ...(f || {}) }; }

function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}

  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem("marketfeed_v2") || "null"); } catch (_) {}
    if (raw) {
      const legacyWhite = raw.white || [];
      const legacyBlack = raw.black || [];
      const legacyDedupe = raw.dedupe !== false;
      raw.feeds = (raw.feeds || []).map(f => ({
        ...f,
        filters: {
          white: legacyWhite.slice(),
          black: legacyBlack.slice(),
          dedupe: legacyDedupe
        }
      }));
    }
  }

  if (!raw) raw = {
    feeds: [],
    bundles: [],
    articles: [],
    read: [],
    muted: {},
    unread: false
  };

  raw.feeds = (raw.feeds || []).map(f => ({
    ...f,
    filters: normalizeFilter(f.filters)
  }));

  raw.bundles = (raw.bundles || []).map(b => ({
    ...b,
    feeds: b.feeds || [],
    filters: normalizeFilter(b.filters)
  }));

  raw.articles = (raw.articles || []).map(a => ({
    ...a,
    id: a.id || makeArticleId(a.feedId || "legacy", a)
  }));

  raw.read = raw.read || [];
  raw.muted = raw.muted || {};
  raw.unread = !!raw.unread;

  saveMigrated(raw);
  return raw;
}

function saveMigrated(raw) {
  localStorage.setItem(KEY, JSON.stringify(raw));
}

function makeArticleId(feedId, x) {
  const raw = [
    feedId,
    x.guid || "",
    x.link || x.url || "",
    x.title || "",
    x.published || x.date || ""
  ].join("|");

  let h = 2166136261;

  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return "a_" + (h >>> 0).toString(16);
}

function feedPassesArticleFilter(article, feed) {
  const f = normalizeFilter(feed?.filters);
  const t = txt(article);

  if (f.black.some(k => t.includes(String(k).toLowerCase()))) return false;

  if (
    f.white.length &&
    !f.white.some(k => t.includes(String(k).toLowerCase()))
  ) return false;

  if (S.muted[article.feedId] === "forever") return false;

  if (
    S.muted[article.feedId] &&
    Date.now() < S.muted[article.feedId]
  ) return false;

  return true;
}

function applyDedupe(items, enabled) {
  if (!enabled) return items;

  const seen = new Set();

  return items.filter(a => {
    const k =
      (a.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim() || a.url;

    if (seen.has(k)) return false;

    seen.add(k);
    return true;
  });
}

function bundleItems(b) {
  let items = S.articles.filter(a => b.feeds.includes(a.feedId));

  const perFeed = [];

  for (const f of S.feeds.filter(f => b.feeds.includes(f.id))) {
    perFeed.push(
      ...items.filter(
        a => a.feedId === f.id && feedPassesArticleFilter(a, f)
      )
    );
  }

  items = perFeed;

  const bf = normalizeFilter(b.filters);

  const tFiltered = items.filter(a => {
    const t = txt(a);

    if (bf.black.some(k => t.includes(String(k).toLowerCase())))
      return false;

    if (
      bf.white.length &&
      !bf.white.some(k => t.includes(String(k).toLowerCase()))
    )
      return false;

    return true;
  });

  return applyDedupe(tFiltered, bf.dedupe);
}

function allItems() {
  let items = [];

  for (const f of S.feeds) {
    items.push(
      ...S.articles.filter(
        a => a.feedId === f.id && feedPassesArticleFilter(a, f)
      )
    );
  }

  return applyDedupe(items, false);
}

function currentItems() {
  let items;

  if (activeFeed) {
    const f = S.feeds.find(x => x.id === activeFeed);

    items = f
      ? applyDedupe(
          S.articles.filter(
            a =>
              a.feedId === f.id &&
              feedPassesArticleFilter(a, f)
          ),
          normalizeFilter(f.filters).dedupe
        )
      : [];
  } else if (bundle) {
    const b = S.bundles.find(x => x.id === bundle);
    items = b ? bundleItems(b) : [];
  } else {
    items = allItems();
  }

  if (S.unread)
    items = items.filter(x => !S.read.includes(x.id));

  const q = $("q").value.trim().toLowerCase();

  if (q)
    items = items.filter(x => txt(x).includes(q));

  return items.sort(
    (a, b) =>
      new Date(b.date || b.published || 0) -
      new Date(a.date || a.published || 0)
  );
}

function articleHTML(x) {
  const read = S.read.includes(x.id);
  const href = String(x.url || x.link || "").trim();
  const date = x.date || x.published;

  return `<article class="article ${read ? "" : "unread"}">
    <div class="source">${esc(name(x.feedId))}${x.source ? " · " + esc(x.source) : ""}</div>
    <div class="title">${
      href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-news-link="${esc(x.id)}">${esc(x.title || "Untitled")}</a>`
        : esc(x.title || "Untitled")
    }</div>
    <p>${esc(x.description || "")}</p>
    <div class="meta">${date ? esc(new Date(date).toLocaleString()) : ""}</div>
    <div class="actions">
      <button class="small" data-r="${esc(x.id)}">${read ? "Unread" : "Mark read"}</button>
      <button class="small" data-h="${esc(x.feedId)}">Hide feed</button>
    </div>
  </article>`;
}

function render() {
  const c = $("bundles");

  c.innerHTML =
    `<button class="chip ${!bundle && !activeFeed ? "active" : ""}" data-b="">All</button>` +
    S.bundles
      .map(
        b =>
          `<button class="chip ${bundle === b.id ? "active" : ""}" data-b="${esc(b.id)}">${esc(b.name)}</button>`
      )
      .join("");

  c.querySelectorAll("[data-b]").forEach(x =>
    x.onclick = () => {
      activeFeed = "";
      bundle = x.dataset.b;
      render();
    }
  );

  const a = currentItems();

  const label = activeFeed
    ? `${name(activeFeed)} · ${a.length} stories`
    : bundle
    ? `${S.bundles.find(b => b.id === bundle)?.name || "Bundle"} · ${a.length} stories`
    : `${a.length} stories`;

  $("status").textContent = label;

  $("articles").innerHTML = a.length
    ? a.map(articleHTML).join("")
    : '<div class="empty">No matching stories.</div>';

  bindArticleActions();
}

function bindArticleActions() {
  document.querySelectorAll("[data-r]").forEach(b =>
    b.onclick = () => {
      const i = S.read.indexOf(b.dataset.r);

      if (i < 0)
        S.read.push(b.dataset.r);
      else
        S.read.splice(i, 1);

      save();
      render();
    }
  );

  document.querySelectorAll("[data-h]").forEach(b =>
    b.onclick = () => {
      const h = prompt(
        "Hide this feed for hours.\nEnter 0 for forever:",
        "24"
      );

      if (h !== null) {
        const n = Number(h);

        S.muted[b.dataset.h] =
          n ? Date.now() + n * 3600000 : "forever";

        save();
        render();
      }
    }
  );

  document.querySelectorAll("[data-news-link]").forEach(a =>
    a.onclick = () => {
      const id = a.dataset.newsLink;

      if (!S.read.includes(id)) {
        S.read.push(id);
        save();
      }
    }
  );
}

function feedFilteredItems(f) {
  return applyDedupe(
    S.articles.filter(
      a =>
        a.feedId === f.id &&
        feedPassesArticleFilter(a, f)
    ),
    normalizeFilter(f.filters).dedupe
  );
}

function bundlePreview(b) {
  return bundleItems(b);
}

function renderFeeds() {
  $("feeds").innerHTML = S.feeds.length
    ? S.feeds
        .map(f => {
          const n = feedFilteredItems(f).length;

          const bundles = S.bundles
            .filter(b => b.feeds.includes(f.id))
            .map(b => b.name);

          return `<div class="card feed-card" data-select-feed="${esc(f.id)}">
      <div class="card-title-row">
        <div>
          <b>${esc(f.name)}</b>
          <p>${esc(f.keyword || f.url)}</p>
        </div>
        <span class="count">${n} stories</span>
      </div>

      <p class="small-text">${
        bundles.length
          ? "Bundle: " + bundles.map(esc).join(" · ")
          : "Not in any bundle"
      }</p>

      <div class="actions">
        <button type="button" class="small" data-rf="${esc(f.id)}">Refresh</button>
        <button type="button" class="small" data-add-bundle="${esc(f.id)}">Add to bundle</button>
        <button type="button" class="small" data-filter-feed="${esc(f.id)}">Filter</button>
        <button type="button" class="small" data-df="${esc(f.id)}">Delete</button>
      </div>

      <div class="preview">
        ${
          feedFilteredItems(f).slice(0, 3).map(articleHTML).join("") ||
          '<div class="empty">No stories saved for this feed.</div>'
        }
      </div>
    </div>`;
        })
        .join("")
    : '<div class="empty">No feeds.<br>Create one from a keyword or RSS URL.</div>';

  document.querySelectorAll("[data-select-feed]").forEach(b =>
    b.onclick = e => {
      if (e.target.closest("button,a")) return;

      activeFeed = b.dataset.selectFeed;
      bundle = "";

      page("home");
    }
  );

  document.querySelectorAll("[data-rf]").forEach(b =>
    b.onclick = e => {
      e.stopPropagation();
      refreshFeed(S.feeds.find(f => f.id === b.dataset.rf));
    }
  );

  document.querySelectorAll("[data-add-bundle]").forEach(b =>
    b.onclick = e => {
      e.stopPropagation();
      openAssignFeed(b.dataset.addBundle);
    }
  );

  document.querySelectorAll("[data-filter-feed]").forEach(b =>
    b.onclick = e => {
      e.stopPropagation();
      openFilter("feed", b.dataset.filterFeed);
    }
  );

  document.querySelectorAll("[data-df]").forEach(b =>
    b.onclick = e => {
      e.stopPropagation();

      if (!confirm("Delete this feed?")) return;

      S.feeds = S.feeds.filter(f => f.id !== b.dataset.df);

      S.articles = S.articles.filter(
        a => a.feedId !== b.dataset.df
      );

      S.bundles.forEach(
        x =>
          (x.feeds = x.feeds.filter(
            id => id !== b.dataset.df
          ))
      );

      if (activeFeed === b.dataset.df)
        activeFeed = "";

      save();
      renderFeeds();
      renderBundles();
      render();
    }
  );
}

function openAssignFeed(feedId) {
  assignFeedId = feedId;
  assignBundleId = null;

  const f = S.feeds.find(x => x.id === feedId);
  if (!f) return;

  $("assignTitle").textContent =
    "Add feed to bundles: " + f.name;

  $("assignList").innerHTML = S.bundles.length
    ? S.bundles
        .map(
          b =>
            `<label class="checkrow">
              <input type="checkbox" data-ab="${esc(b.id)}" ${
              b.feeds.includes(feedId) ? "checked" : ""
            }>
              ${esc(b.name)}
            </label>`
        )
        .join("")
    : "<p>No bundles yet. Create a bundle first.</p>";

  assignDlg.showModal();
}

function openAssignBundle(bundleId) {
  assignBundleId = bundleId;
  assignFeedId = null;

  const b = S.bundles.find(x => x.id === bundleId);
  if (!b) return;

  $("assignTitle").textContent =
    "Add feeds to bundle: " + b.name;

  $("assignList").innerHTML = S.feeds.length
    ? S.feeds
        .map(
          f =>
            `<label class="checkrow">
              <input type="checkbox" data-af="${esc(f.id)}" ${
              b.feeds.includes(f.id) ? "checked" : ""
            }>
              ${esc(f.name)}
            </label>`
        )
        .join("")
    : "<p>No feeds yet. Create a feed first.</p>";

  assignDlg.showModal();
}

function saveAssignments() {
  if (assignFeedId) {
    const selected = [
      ...document.querySelectorAll("[data-ab]:checked")
    ].map(x => x.dataset.ab);

    S.bundles.forEach(b => {
      b.feeds = b.feeds.filter(
        id => id !== assignFeedId
      );

      if (selected.includes(b.id))
        b.feeds.push(assignFeedId);
    });
  }

  if (assignBundleId) {
    const b = S.bundles.find(
      x => x.id === assignBundleId
    );

    if (!b) return;

    b.feeds = [
      ...document.querySelectorAll("[data-af]:checked")
    ].map(x => x.dataset.af);
  }

  save();
  assignDlg.close();

  renderFeeds();
  renderBundles();
  render();

  toast("Bundle membership saved");
}

function renderBundles() {
  $("bundleList").innerHTML = S.bundles.length
    ? S.bundles
        .map(b => {
          const items = bundlePreview(b);

          return `<div class="card bundle-card">
      <div class="card-title-row">
        <div>
          <b>📁 ${esc(b.name)}</b>
          <p>${b.feeds.length} feed(s) · ${items.length} stories</p>
        </div>
      </div>

      <p class="small-text">
        ${
          b.feeds.map(id => esc(name(id))).join(" · ") ||
          "No feeds assigned"
        }
      </p>

      <div class="actions">
        <button type="button" class="small" data-open="${esc(b.id)}">View news</button>
        <button type="button" class="small" data-add-feeds="${esc(b.id)}">Add / remove feeds</button>
        <button type="button" class="small" data-filter-bundle="${esc(b.id)}">Filter</button>
        <button type="button" class="small" data-del="${esc(b.id)}">Delete</button>
      </div>

      <div class="preview">
        ${
          items.slice(0, 3).map(articleHTML).join("") ||
          '<div class="empty">No stories in this bundle.</div>'
        }
      </div>
    </div>`;
        })
        .join("")
    : '<div class="empty">No bundles yet.</div>';

  document.querySelectorAll("[data-open]").forEach(b =>
    b.onclick = () => {
      activeFeed = "";
      bundle = b.dataset.open;
      page("home");
    }
  );

  document.querySelectorAll("[data-add-feeds]").forEach(b =>
    b.onclick = () =>
      openAssignBundle(b.dataset.addFeeds)
  );

  document.querySelectorAll("[data-filter-bundle]").forEach(b =>
    b.onclick = () =>
      openFilter("bundle", b.dataset.filterBundle)
  );

  document.querySelectorAll("[data-del]").forEach(b =>
    b.onclick = () => {
      if (!confirm("Delete this bundle?")) return;

      S.bundles = S.bundles.filter(
        x => x.id !== b.dataset.del
      );

      if (bundle === b.dataset.del)
        bundle = "";

      save();
      renderBundles();
      render();
    }
  );
}

function page(p) {
  document.querySelectorAll(".page")
    .forEach(x => x.classList.remove("active"));

  $(p).classList.add("active");

  if (p === "home") render();
  if (p === "feedspage") renderFeeds();
  if (p === "bundlespage") renderBundles();
  if (p === "filterspage") renderFilterManager();
}

function add() {
  const s = $("fBundle");

  s.innerHTML =
    '<option value="">No bundle</option>' +
    S.bundles
      .map(
        b =>
          `<option value="${esc(b.id)}">${esc(b.name)}</option>`
      )
      .join("");

  $("feedForm").reset();
  $("testMsg").textContent = "";

  if (typeof feedDlg.showModal === "function")
    feedDlg.showModal();
  else
    feedDlg.setAttribute("open", "");
}

function keywordURL(k) {
  return PROXY + "/news?q=" + encodeURIComponent(k);
}

async function getFeed(f) {
  const endpoint = f.url.startsWith(PROXY + "/news?q=")
    ? f.url
    : PROXY + "/rss?url=" + encodeURIComponent(f.url);

  let r;

  try {
    r = await fetch(endpoint, { cache: "no-store" });
  } catch (e) {
    throw Error(
      "Cannot reach RSS proxy. Check that rssfeed.daksheshpatelin.workers.dev is deployed."
    );
  }

  if (!r.ok)
    throw Error("RSS proxy HTTP " + r.status);

  let d;

  try {
    d = await r.json();
  } catch (e) {
    throw Error("RSS proxy returned an invalid response.");
  }

  if (!d.ok)
    throw Error(d.error || "Feed error");

  return (d.items || []).map(x => ({
    ...x,
    feedId: f.id,
    id: makeArticleId(f.id, x),
    url: x.link || x.url || "",
    date:
      x.published ||
      x.date ||
      new Date().toISOString()
  }));
}

async function refreshFeed(f, show = true) {
  if (!f) return;

  try {
    const a = await getFeed(f);
    const own = new Set(a.map(x => x.id));

    S.articles = S.articles.filter(
      x => x.feedId !== f.id || own.has(x.id)
    );

    const byId = new Map(
      S.articles.map(x => [x.id, x])
    );

    a.forEach(x => byId.set(x.id, x));

    S.articles = [...byId.values()]
      .sort(
        (a, b) =>
          new Date(b.date || b.published || 0) -
          new Date(a.date || a.published || 0)
      )
      .slice(0, 4000);

    save();

    render();
    renderFeeds();
    renderBundles();

    if (show)
      toast(`${f.name} refreshed · ${a.length} stories`);
  } catch (e) {
    toast(e.message);
  }
}

async function refreshAll() {
  for (const f of S.feeds)
    await refreshFeed(f, false);

  render();
  renderFeeds();
  renderBundles();

  toast("All feeds refreshed");
}

function openFilter(type, id) {
  filterTarget = { type, id };

  const obj =
    type === "feed"
      ? S.feeds.find(f => f.id === id)
      : S.bundles.find(b => b.id === id);

  if (!obj) return;

  const f = normalizeFilter(obj.filters);

  $("filterTitle").textContent =
    `${type === "feed" ? "Feed" : "Bundle"} filter: ${obj.name}`;

  $("filterWhite").value = f.white.join(", ");
  $("filterBlack").value = f.black.join(", ");
  $("filterDedupe").checked = f.dedupe;

  filterDlg.showModal();
}

function saveFilter() {
  if (!filterTarget) return;

  const obj =
    filterTarget.type === "feed"
      ? S.feeds.find(f => f.id === filterTarget.id)
      : S.bundles.find(b => b.id === filterTarget.id);

  if (!obj) return;

  obj.filters = {
    white: $("filterWhite").value
      .split(/[\n,]/)
      .map(x => x.trim())
      .filter(Boolean),

    black: $("filterBlack").value
      .split(/[\n,]/)
      .map(x => x.trim())
      .filter(Boolean),

    dedupe: $("filterDedupe").checked
  };

  save();
  filterDlg.close();

  render();
  renderFeeds();
  renderBundles();
  renderFilterManager();

  toast("Filter saved");
}

function renderFilterManager() {
  $("filterManager").innerHTML = `
    <div class="card">
      <b>Feed filters</b>
      <p>Each feed has its own include/exclude and duplicate settings.</p>
      ${
        S.feeds.map(
          f =>
            `<div class="manager-row">
              <span>${esc(f.name)}</span>
              <button class="small" data-mf="${esc(f.id)}">Edit</button>
            </div>`
        ).join("") || "<p>No feeds yet.</p>"
      }
    </div>

    <div class="card">
      <b>Bundle filters</b>
      <p>Bundle filters are applied after the individual feed filters.</p>
      ${
        S.bundles.map(
          b =>
            `<div class="manager-row">
              <span>${esc(b.name)}</span>
              <button class="small" data-mb="${esc(b.id)}">Edit</button>
            </div>`
        ).join("") || "<p>No bundles yet.</p>"
      }
    </div>`;

  document.querySelectorAll("[data-mf]").forEach(b =>
    b.onclick = () => openFilter("feed", b.dataset.mf)
  );

  document.querySelectorAll("[data-mb]").forEach(b =>
    b.onclick = () => openFilter("bundle", b.dataset.mb)
  );
}

$("newFeed").onclick = $("newFeed2").onclick = add;

$("testFeed").onclick = async () => {
  const k = $("keyword").value.trim();
  const raw = $("url").value.trim();
  const u = raw || keywordURL(k);

  if (!u || (!raw && !k))
    return $("testMsg").textContent =
      "Enter a keyword or RSS URL";

  try {
    const a = await getFeed({
      id: "test",
      url: u
    });

    $("testMsg").textContent =
      "✓ Feed works — " + a.length + " stories found";
  } catch (e) {
    $("testMsg").textContent = "✕ " + e.message;
  }
};

$("feedForm").onsubmit = async e => {
  e.preventDefault();

  const k = $("keyword").value.trim();
  const raw = $("url").value.trim();
  const u = raw || keywordURL(k);

  if (!k && !raw)
    return toast("Enter keyword or RSS URL");

  if (S.feeds.some(f => f.url === u))
    return toast("This feed already exists");

  const f = {
    id: crypto.randomUUID(),
    name:
      $("fname").value.trim() ||
      k ||
      "RSS Feed",
    keyword: k,
    url: u,
    filters: DEFAULT_FILTER()
  };

  S.feeds.push(f);

  const b = S.bundles.find(
    x => x.id === $("fBundle").value
  );

  if (b && !b.feeds.includes(f.id))
    b.feeds.push(f.id);

  save();
  feedDlg.close();
  renderFeeds();

  await refreshFeed(f, false);

  toast("Feed saved");
};

$("newBundle").onclick = () => {
  $("bundleForm").reset();
  bundleDlg.showModal();
};

$("bundleForm").onsubmit = e => {
  e.preventDefault();

  const b = {
    id: crypto.randomUUID(),
    name: $("bname").value.trim(),
    feeds: [],
    filters: DEFAULT_FILTER()
  };

  S.bundles.push(b);

  save();
  bundleDlg.close();
  renderBundles();

  toast("Bundle created");
};

$("refresh").onclick = refreshAll;
$("q").oninput = render;

$("unread").onchange = e => {
  S.unread = e.target.checked;
  save();
  render();
};

$("saveFilter").onclick = saveFilter;
$("saveAssignments").onclick = saveAssignments;

$("export").onclick = () => {
  const a = document.createElement("a");

  a.href = URL.createObjectURL(
    new Blob(
      [JSON.stringify(S, null, 2)],
      { type: "application/json" }
    )
  );

  a.download = "marketfeed-backup.json";
  a.click();
};

$("reset").onclick = () => {
  if (confirm("Reset MarketFeed?")) {
    localStorage.removeItem(KEY);
    location.reload();
  }
};

document.querySelectorAll("nav button").forEach(b => {
  b.type = "button";

  b.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();

    const target = b.dataset.p;

    if (!target || !$(target)) return;

    if (target === "home") {
      activeFeed = "";
      bundle = "";
    }

    page(target);
  });
});

render();
renderFeeds();
renderBundles();
renderFilterManager();

if ("serviceWorker" in navigator)
  navigator.serviceWorker.register(
    "service-worker.js?v=8"
  );

window.addEventListener("error", e => {
  const el = $("status");

  if (el)
    el.textContent =
      "App error: " +
      (e.message || "Unknown JavaScript error");

  console.error(
    e.error || e.message
  );
});