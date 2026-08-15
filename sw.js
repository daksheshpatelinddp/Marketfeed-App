const CACHE="marketfeed-cache-v2";
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  // Never cache RSS proxy calls — always fetch fresh news
  if(url.pathname.startsWith("/rss")){e.respondWith(fetch(e.request));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
