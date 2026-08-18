# MarketFeed App V8

This version fixes the data-model and display bugs found in the previous backup.

## Main fixes
- Every saved feed has independent `filters`.
- Every bundle has independent `filters`.
- Feed filters run before bundle filters.
- Articles receive a stable per-feed ID, so 10/20/50 results no longer collapse into one article.
- RSS/Atom URLs are normalized by the Cloudflare worker into the same JSON format as keyword feeds.
- Each feed has its own stored article list and can be viewed from the Feeds tab.
- Each bundle shows the combined news from its assigned feeds and can be viewed separately.
- Article titles open the original source webpage in a new tab.
- The old global whitelist/blacklist settings are no longer used.

## Current storage
This V8 client still stores the feed configuration and saved article metadata in browser `localStorage`. The Cloudflare Worker only fetches/proxies news. GitHub stores the application code.

The next storage step should move the application data to Cloudflare D1 (or another Cloudflare storage layer) so the phone keeps only a small local identifier/cache.

Cloudflare proxy:
`https://rssfeed.daksheshpatelin.workers.dev`
