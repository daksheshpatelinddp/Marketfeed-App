function fillBundles() {
  const options = ['<option value="">-- No Bundle (None) --</option>']
    .concat(db.bundles.map(b => `<option value="${b.id}">${esc(b.name)}</option>`));
  feedBundle.innerHTML = options.join("");
}

// Auto-generate URL as you type in the name field
document.getElementById("feedName")?.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  const urlInput = document.getElementById("feedUrl");
  if (query) {
    const baseProxy = db.settings.proxyUrl.trim().replace(/\/$/, "");
    urlInput.value = `${baseProxy}/generate?target=${encodeURIComponent(query)}`;
  } else {
    urlInput.value = "";
  }
});

document.getElementById("feedForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = feedName.value.trim();
  let url = feedUrl.value.trim();
  
  // Fallback generation if URL is missing
  if (!url && name) {
    const baseProxy = db.settings.proxyUrl.trim().replace(/\/$/, "");
    url = `${baseProxy}/generate?target=${encodeURIComponent(name)}`;
  }

  const selectedBundle = feedBundle.value ? [feedBundle.value] : [];

  db.feeds.push({
    id: id(),
    name: name,
    url: url,
    bundles: selectedBundle,
    enabled: true
  });

  save();
  feedDialog.close();
  render("feeds");
  fetchAllFeeds();
});