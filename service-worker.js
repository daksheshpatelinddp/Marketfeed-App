const C="marketfeed-v12";
const A=["./","./index.html","./app.js?v=12","./style.css","./manifest.json","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method==="GET")e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});

self.addEventListener("push",event=>{
  let d={};try{d=event.data?event.data.json():{}}catch(_){d={body:event.data?event.data.text():"New market update"}}
  event.waitUntil(self.registration.showNotification(d.title||"MarketFeed",{body:d.body||"New market update",icon:d.icon||"icon-192.png",badge:d.badge||"icon-192.png",tag:d.tag||"marketfeed-update",data:{url:d.url||"/"}}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();const u=event.notification.data?.url||"/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs)if("focus"in c){c.navigate(u);return c.focus();}return clients.openWindow(u);}));
});
