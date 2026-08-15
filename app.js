// Auto-generate RSS Feed Link dynamically when entering Stock Name / Keyword
document.getElementById("autoGenBtn")?.addEventListener("click", () => {
  const nameInput = document.getElementById("feedName").value.trim();
  if (!nameInput) {
    alert("Please enter a stock ticker or site name first.");
    return;
  }
  
  const baseProxy = db.settings.proxyUrl.trim().replace(/\/$/, "");
  // Generates dynamic RSS feed endpoint powered by your Cloudflare worker
  const generatedUrl = `${baseProxy}/generate?target=${encodeURIComponent(nameInput)}`;
  
  document.getElementById("feedUrl").value = generatedUrl;
});