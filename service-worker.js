const C="marketfeed-v4";
const A=[
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install",e=>{
  e.waitUntil(
    caches.open(C)
      .then(c=>c.addAll(A))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",e=>{
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",e=>{
  if(e.request.method==="GET"){
    e.respondWith(
      caches.match(e.request).then(r=>r||fetch(e.request))
    );
  }
});
