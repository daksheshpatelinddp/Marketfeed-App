# MarketFeed PWA

A personal stock-market RSS reader you install to your Android home screen.
Your Cloudflare RSS proxy is already configured: `https://rssfeed.daksheshpatelin.workers.dev`

## What's included
- **Home** — latest news across all your feeds, unread/read tracking, search, mark-all-read
- **Feeds** — add RSS/Atom feeds by URL, test a feed before trusting it, enable/disable, quick hide (1h/6h/24h/custom)
- **Bundles** — group feeds into folders (Nifty/Sensex, My Portfolio, Banking, IT, Global Markets, or your own)
- **Portfolio** — add stocks with keywords, view only news matching that stock
- **Filters** — whitelist keywords (highlights matches with ⭐), blacklist keywords (hides matches)
- **Cross-feed duplicate removal** — the same story from two different sources is shown once
- Works offline for the app shell; news itself needs a connection to fetch

## Install on Android
1. Upload all files in this ZIP to a GitHub repo (keep them in the root, not in subfolders).
2. In Cloudflare dashboard: Workers & Pages → Create → Pages → Import a repository → pick this repo. Leave build command empty. Deploy.
3. Cloudflare gives you a URL like `https://yourapp.pages.dev`. Open it in Chrome on your phone.
4. Chrome menu (⋮) → **Add to Home screen** / **Install app**.
5. Open the app. The Worker Proxy URL is already filled in under the **Filters** tab — no setup needed there.
6. Go to **Feeds**, tap **＋ Add feed**, paste an RSS URL (e.g. Moneycontrol, Economic Times Markets, any site's `/feed` or `/rss` URL).
7. Tap **Test feed** to confirm it works before relying on it.
8. Go to **Home**, tap ↻ to fetch. It also auto-fetches when you open the app, once you have at least one feed saved.

## Notes
- All your data (feeds, stocks, filters, read/unread state) stays on your phone in local storage — nothing is sent anywhere except the feed-fetch requests, which go through your own Cloudflare Worker.
- If a feed fails the test, double check the URL is a direct RSS/Atom link (often ends in `/feed`, `/rss`, or `.xml`), not the website's homepage.
- To point the app at a different proxy later, just edit the Worker Proxy URL field in Filters and save.
