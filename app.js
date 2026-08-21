
const PROXY = "https://rssfeed.daksheshpatelin.workers.dev";
const KEY = "marketfeed_v4";
const PUSH_PUBLIC_KEY = ""; // Configure VAPID public key after deploying MarketFeed push backend.
const DEFAULT_FILTER = () => ({
  white: [], black: [], dedupe: true,
  whiteFields: ["title","description","url"],
  blackFields: ["title","description","url"],
  whitePartial: true, blackPartial: true,
  whiteAnd: false, blackAnd: false,
  hideNoImage: false, hideNoDescription: false, hideNoDate: false, hideNoSecureLink: false,
  duplicateTitle: false, duplicateDescription: false, similarTitle: false,
  olderEnabled: false, olderAmount: 24, olderUnit: "hours",
  domains: [],
  cleanTitle: false, cleanTerms: []
});
const DEFAULT_ALERT = () => ({
  enabled: false, interval: 5, sound: true, notifications: true,
  keywords: [], onlyImportant: true
});

let S = loadState();
let bundle = "";
let activeFeed = "";
let filterTarget = null;
let alertTarget = null;
let alertTimer = null;
let lastAlertIds = new Set();

const feedDlg = $("feedDlg"), bundleDlg = $("bundleDlg"), filterDlg = $("filterDlg");
const toastEl = $("toast");

function $(id) { return document.getElementById(id); }
function esc(x) { return String(x ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function name(id) { return S.feeds.find(f => f.id === id)?.name || "Feed"; }
function toast(x) { toastEl.textContent = x; toastEl.style.display = "block"; setTimeout(() => toastEl.style.display = "none", 2200); }
function txt(a) { return ((a.title || "") + " " + (a.description || "") + " " + (a.source || "") + " " + (a.url || "")).toLowerCase(); }
function fieldText(a, fields) {
  const map = {title:a.title||"", description:a.description||"", url:a.url||"", image:a.image||a.imageUrl||""};
  return fields.map(k => String(map[k] || "")).join(" ").toLowerCase();
}
function normalizeFilter(f) {
  const d = DEFAULT_FILTER(), x = {...d, ...(f || {})};
  ["white","black","domains","cleanTerms"].forEach(k => x[k] = Array.isArray(x[k]) ? x[k] : []);
  ["whiteFields","blackFields"].forEach(k => x[k] = Array.isArray(x[k]) && x[k].length ? x[k] : d[k]);
  return x;
}
function normalizeAlert(a) { return {...DEFAULT_ALERT(), ...(a || {}), keywords:Array.isArray(a?.keywords)?a.keywords:[]}; }

function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
  if (!raw) {
    try { raw = JSON.parse(localStorage.getItem("marketfeed_v3") || localStorage.getItem("marketfeed_v2") || "null"); } catch (_) {}
    if (raw) {
      const legacyWhite = raw.white || [], legacyBlack = raw.black || [], legacyDedupe = raw.dedupe !== false;
      raw.feeds = (raw.feeds || []).map(f => ({...f, filters:{...DEFAULT_FILTER(),white:legacyWhite.slice(),black:legacyBlack.slice(),dedupe:legacyDedupe},alerts:DEFAULT_ALERT()}));
    }
  }
  if (!raw) raw = {feeds:[],bundles:[],articles:[],read:[],muted:{},unread:false,settings:{alerts:DEFAULT_ALERT()}};
  raw.feeds = (raw.feeds||[]).map(f => ({...f, filters:normalizeFilter(f.filters), alerts:normalizeAlert(f.alerts)}));
  raw.bundles = (raw.bundles||[]).map(b => ({...b,feeds:b.feeds||[],filters:normalizeFilter(b.filters),alerts:normalizeAlert(b.alerts)}));
  raw.articles = (raw.articles||[]).map(a => ({...a,id:a.id||makeArticleId(a.feedId||"legacy",a)}));
  raw.read=raw.read||[]; raw.muted=raw.muted||{}; raw.unread=!!raw.unread; raw.settings={alerts:normalizeAlert(raw.settings?.alerts)};
  save(); return raw;
}
function makeArticleId(feedId,x) {
  const raw=[feedId,x.guid||"",x.link||x.url||"",x.title||"",x.published||x.date||""].join("|");
  let h=2166136261; for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619);}
  return "a_"+(h>>>0).toString(16);
}
function getFields(a, fields) { return fieldText(a, fields); }
function matchKeyword(text, kw, partial) {
  kw=String(kw||"").toLowerCase().trim(); if(!kw) return true;
  if(partial) return text.includes(kw);
  const re = new RegExp("(^|[^a-z0-9])"+kw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^a-z0-9])","i");
  return re.test(text);
}
function keywordRule(a, words, fields, partial, andMode) {
  if(!words.length) return true;
  const text=getFields(a,fields);
  const hits=words.map(w=>matchKeyword(text,w,partial));
  return andMode ? hits.every(Boolean) : hits.some(Boolean);
}
function filterArticle(a, f) {
  f=normalizeFilter(f);
  if (f.white.length && !keywordRule(a,f.white,f.whiteFields,f.whitePartial,f.whiteAnd)) return false;
  if (f.black.length && keywordRule(a,f.black,f.blackFields,f.blackPartial,f.blackAnd)) return false;
  if (f.domains.length) {
    const u=String(a.url||"").toLowerCase();
    if (f.domains.some(d=>u.includes(String(d).toLowerCase().replace(/^https?:\/\//,"")))) return false;
  }
  if (f.hideNoImage && !(a.image||a.imageUrl)) return false;
  if (f.hideNoDescription && !String(a.description||"").trim()) return false;
  if (f.hideNoDate && !(a.date||a.published)) return false;
  if (f.hideNoSecureLink && !/^https:\/\//i.test(String(a.url||""))) return false;
  if (f.olderEnabled) {
    const d=new Date(a.date||a.published||0).getTime(), amount=Number(f.olderAmount)||0;
    const ms=(f.olderUnit==="days"?86400000:3600000)*amount;
    if(d && Date.now()-d>ms) return false;
  }
  return true;
}
function cleanTitle(title,f) {
  if(!f.cleanTitle) return title;
  return f.cleanTerms.reduce((s,k)=>s.replace(new RegExp(String(k).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),"").replace(/\s{2,}/g," ").trim(), title||"");
}
function applyDedupe(items, f) {
  f=normalizeFilter(f); if(!f.dedupe && !f.duplicateTitle && !f.duplicateDescription && !f.similarTitle) return items;
  const seenT=new Set(), seenD=new Set(), out=[];
  for(const a of items){
    const t=(a.title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const d=(a.description||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    if((f.dedupe||f.duplicateTitle) && t && seenT.has(t)) continue;
    if((f.duplicateDescription) && d && seenD.has(d)) continue;
    if(f.similarTitle && t){
      const words=new Set(t.split(/\s+/).filter(Boolean));
      let similar=false;
      for(const old of seenT){const ow=new Set(old.split(/\s+/)); const inter=[...words].filter(x=>ow.has(x)).length; const ratio=inter/Math.max(1,Math.min(words.size,ow.size)); if(ratio>=0.75){similar=true;break;}}
      if(similar) continue;
    }
    if(t)seenT.add(t); if(d)seenD.add(d); out.push(a);
  }
  return out;
}
function feedFilteredItems(f) {
  return applyDedupe(S.articles.filter(a=>a.feedId===f.id && filterArticle(a,f.filters) && !isMuted(f.id)), f.filters);
}
function isMuted(id){const v=S.muted[id]; return v==="forever" || (v && Date.now()<v);}
function bundleItems(b) {
  let items=[]; for(const f of S.feeds.filter(f=>b.feeds.includes(f.id))) items.push(...feedFilteredItems(f));
  return applyDedupe(items.filter(a=>filterArticle(a,b.filters)),b.filters);
}
function allItems() {
  let items=[]; for(const f of S.feeds) items.push(...feedFilteredItems(f));
  return applyDedupe(items,{...DEFAULT_FILTER(),dedupe:false});
}
function currentItems() {
  let items=activeFeed ? feedFilteredItems(S.feeds.find(x=>x.id===activeFeed)||{}) : bundle ? bundleItems(S.bundles.find(x=>x.id===bundle)||{}) : allItems();
  if(S.unread)items=items.filter(x=>!S.read.includes(x.id));
  const q=$("q").value.trim().toLowerCase(); if(q)items=items.filter(x=>txt(x).includes(q));
  return items.sort((a,b)=>new Date(b.date||b.published||0)-new Date(a.date||a.published||0));
}
function articleHTML(x){
  const read=S.read.includes(x.id), href=String(x.url||x.link||"").trim(), date=x.date||x.published;
  return `<article class="article ${read?"":"unread"}">
    <div class="source">${esc(name(x.feedId))}${x.source?" · "+esc(x.source):""}</div>
    <div class="title">${href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" data-news-link="${esc(x.id)}">${esc(cleanTitle(x.title, normalizeFilter((S.feeds.find(f=>f.id===x.feedId)||{}).filters)))}</a>`:esc(x.title||"Untitled")}</div>
    <p>${esc(x.description||"")}</p><div class="meta">${date?esc(new Date(date).toLocaleString()):""}</div>
    <div class="actions"><button class="small" data-r="${esc(x.id)}">${read?"Unread":"Mark read"}</button><button class="small" data-h="${esc(x.feedId)}">Hide feed</button></div>
  </article>`;
}
function render(){
  const c=$("bundles"); c.innerHTML=`<button class="chip ${!bundle&&!activeFeed?"active":""}" data-b="">All</button>`+S.bundles.map(b=>`<button class="chip ${bundle===b.id?"active":""}" data-b="${esc(b.id)}">${esc(b.name)}</button>`).join("");
  c.querySelectorAll("[data-b]").forEach(x=>x.onclick=()=>{activeFeed="";bundle=x.dataset.b;render();});
  const a=currentItems(); $("status").textContent=activeFeed?`${name(activeFeed)} · ${a.length} stories`:bundle?`${S.bundles.find(b=>b.id===bundle)?.name||"Bundle"} · ${a.length} stories`:`${a.length} stories`;
  $("articles").innerHTML=a.length?a.map(articleHTML).join(""):'<div class="empty">No matching stories.</div>'; bindArticleActions();
}
function bindArticleActions(){
  document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{const i=S.read.indexOf(b.dataset.r);if(i<0)S.read.push(b.dataset.r);else S.read.splice(i,1);save();render();});
  document.querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{const h=prompt("Hide this feed for hours. Enter 0 for forever:","24");if(h!==null){const n=Number(h);S.muted[b.dataset.h]=n?Date.now()+n*3600000:"forever";save();render();}});
  document.querySelectorAll("[data-news-link]").forEach(a=>a.onclick=()=>{const id=a.dataset.newsLink;if(!S.read.includes(id)){S.read.push(id);save();}});
}
function renderFeeds(){
  $("feeds").innerHTML=S.feeds.length?S.feeds.map(f=>{const n=feedFilteredItems(f).length;return `<div class="card feed-card"><div class="card-title-row"><div><b>${esc(f.name)}</b><p>${esc(f.keyword||f.url)}</p></div><span class="count">${n} stories</span></div>
  <div class="actions"><button class="small" data-view-feed="${esc(f.id)}">View news</button><button class="small" data-rf="${esc(f.id)}">Refresh</button><button class="small" data-filter-feed="${esc(f.id)}">Filters</button><button class="small" data-alert-feed="${esc(f.id)}">Alerts</button><button class="small" data-df="${esc(f.id)}">Delete</button></div>
  <div class="preview">${feedFilteredItems(f).slice(0,3).map(articleHTML).join("")||'<div class="empty">No stories saved for this feed.</div>'}</div></div>`}).join(""):'<div class="empty">No feeds.<br>Create one from a keyword or RSS URL.</div>';
  document.querySelectorAll("[data-rf]").forEach(b=>b.onclick=()=>refreshFeed(S.feeds.find(f=>f.id===b.dataset.rf)));
  document.querySelectorAll("[data-view-feed]").forEach(b=>b.onclick=()=>{activeFeed=b.dataset.viewFeed;bundle="";page("home");});
  document.querySelectorAll("[data-filter-feed]").forEach(b=>b.onclick=()=>openFilter("feed",b.dataset.filterFeed));
  document.querySelectorAll("[data-alert-feed]").forEach(b=>b.onclick=()=>openAlert("feed",b.dataset.alertFeed));
  document.querySelectorAll("[data-df]").forEach(b=>b.onclick=()=>{if(!confirm("Delete this feed?"))return;S.feeds=S.feeds.filter(f=>f.id!==b.dataset.df);S.articles=S.articles.filter(a=>a.feedId!==b.dataset.df);S.bundles.forEach(x=>x.feeds=x.feeds.filter(id=>id!==b.dataset.df));if(activeFeed===b.dataset.df)activeFeed="";save();renderFeeds();renderBundles();render();});
}
function renderBundles(){
  $("bundleList").innerHTML=S.bundles.length?S.bundles.map(b=>{const items=bundleItems(b);return `<div class="card bundle-card"><div class="card-title-row"><div><b>📁 ${esc(b.name)}</b><p>${b.feeds.length} feed(s) · ${items.length} stories</p></div></div>
  <p class="small-text">${b.feeds.map(id=>esc(name(id))).join(" · ")||"No feeds assigned"}</p>
  <div class="actions"><button class="small" data-open="${esc(b.id)}">View news</button><button class="small" data-filter-bundle="${esc(b.id)}">Filters</button><button class="small" data-alert-bundle="${esc(b.id)}">Alerts</button><button class="small" data-del="${esc(b.id)}">Delete</button></div>
  <div class="preview">${items.slice(0,3).map(articleHTML).join("")||'<div class="empty">No stories in this bundle.</div>'}</div></div>`}).join(""):'<div class="empty">No bundles yet.</div>';
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{activeFeed="";bundle=b.dataset.open;page("home");});
  document.querySelectorAll("[data-filter-bundle]").forEach(b=>b.onclick=()=>openFilter("bundle",b.dataset.filterBundle));
  document.querySelectorAll("[data-alert-bundle]").forEach(b=>b.onclick=()=>openAlert("bundle",b.dataset.alertBundle));
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{S.bundles=S.bundles.filter(x=>x.id!==b.dataset.del);if(bundle===b.dataset.del)bundle="";save();renderBundles();render();});
}
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(p).classList.add("active");if(p==="home")render();if(p==="feedspage")renderFeeds();if(p==="bundlespage")renderBundles();if(p==="filterspage")renderFilterManager();if(p==="settingspage")renderSettings();}
function add(){const s=$("fBundle");s.innerHTML='<option value="">No bundle</option>'+S.bundles.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");$("feedForm").reset();$("testMsg").textContent="";feedDlg.showModal();}
function keywordURL(k){return PROXY+"/news?q="+encodeURIComponent(k);}
async function getFeed(f){
  const endpoint=f.url.startsWith(PROXY+"/news?q=")?f.url:PROXY+"/rss?url="+encodeURIComponent(f.url);
  const r=await fetch(endpoint,{cache:"no-store"});if(!r.ok)throw Error("RSS proxy HTTP "+r.status);let d;try{d=await r.json()}catch(e){throw Error("RSS proxy returned an invalid response.")}if(!d.ok)throw Error(d.error||"Feed error");
  return(d.items||[]).map(x=>({...x,feedId:f.id,id:makeArticleId(f.id,x),url:x.link||x.url||"",date:x.published||x.date||new Date().toISOString()}));
}
function relevantForAlert(a,target){
  const obj=target.type==="feed"?S.feeds.find(f=>f.id===target.id):S.bundles.find(b=>b.id===target.id); if(!obj)return false;
  const items=target.type==="feed"?feedFilteredItems(obj):bundleItems(obj); if(!items.some(x=>x.id===a.id))return false;
  const al=normalizeAlert(obj.alerts); if(!al.enabled)return false;
  if(al.keywords.length && !keywordRule(a,al.keywords,["title","description","url"],true,false))return false;
  return !al.onlyImportant || /(result|results|profit|loss|earnings|guidance|dividend|merger|acquisition|order|contract|rating|upgrade|downgrade|buyback|fii|dii|sebi|rbi|breaking|alert|surge|crash|approval|deal)/i.test(txt(a));
}
async function refreshFeed(f,show=true){
  if(!f)return;
  try{
    const before=new Set(S.articles.filter(x=>x.feedId===f.id).map(x=>x.id)); const a=await getFeed(f);
    const byId=new Map(S.articles.map(x=>[x.id,x])); a.forEach(x=>byId.set(x.id,x));
    S.articles=[...byId.values()].sort((a,b)=>new Date(b.date||b.published||0)-new Date(a.date||a.published||0)).slice(0,4000);
    save(); render();renderFeeds();renderBundles();
    const fresh=a.filter(x=>!before.has(x.id));
    await processAlertsForFeed(f,fresh);
    if(show)toast(`${f.name} refreshed · ${a.length} stories`);
  }catch(e){toast(e.message);}
}
async function processAlertsForFeed(f,fresh){
  if(!fresh.length)return;
  const targets=[{type:"feed",id:f.id}].concat(S.bundles.filter(b=>b.feeds.includes(f.id)).map(b=>({type:"bundle",id:b.id})));
  for(const target of targets){
    const hits=fresh.filter(a=>relevantForAlert(a,target));
    if(hits.length) await notifyTarget(target,hits);
  }
}
async function notifyTarget(target,hits){
  const obj=target.type==="feed"?S.feeds.find(f=>f.id===target.id):S.bundles.find(b=>b.id===target.id); if(!obj)return;
  const al=normalizeAlert(obj.alerts); hits.forEach(x=>lastAlertIds.add(x.id));
  if(al.sound)beep();
  if(al.notifications && "Notification" in window){
    if(Notification.permission==="default"){try{await Notification.requestPermission()}catch(_){}}
    if(Notification.permission==="granted"){
      const title=`MarketFeed · ${obj.name}`, body=hits.length===1?(hits[0].title||"New market news"): `${hits.length} new market news items`;
      try{new Notification(title,{body,icon:"icon-192.png",tag:"marketfeed-"+obj.id});}catch(_){}
    }
  }
  toast(`🔔 ${hits.length} important update${hits.length>1?"s":""}: ${obj.name}`);
}
async function refreshAll(){for(const f of S.feeds)await refreshFeed(f,false);render();renderFeeds();renderBundles();toast("All feeds refreshed");}
function openFilter(type,id){
  filterTarget={type,id};const obj=type==="feed"?S.feeds.find(f=>f.id===id):S.bundles.find(b=>b.id===id);if(!obj)return;const f=normalizeFilter(obj.filters);
  $("filterTitle").textContent=`${type==="feed"?"Feed":"Bundle"} filters: ${obj.name}`;
  $("filterWhite").value=f.white.join("\n");$("filterBlack").value=f.black.join("\n");
  ["title","description","url","image"].forEach(k=>{$("white_"+k).checked=f.whiteFields.includes(k);$("black_"+k).checked=f.blackFields.includes(k);});
  $("whitePartial").checked=f.whitePartial;$("blackPartial").checked=f.blackPartial;$("whiteAnd").checked=f.whiteAnd;$("blackAnd").checked=f.blackAnd;
  $("hideNoImage").checked=f.hideNoImage;$("hideNoDescription").checked=f.hideNoDescription;$("hideNoDate").checked=f.hideNoDate;$("hideNoSecureLink").checked=f.hideNoSecureLink;
  $("duplicateTitle").checked=f.duplicateTitle;$("duplicateDescription").checked=f.duplicateDescription;$("similarTitle").checked=f.similarTitle;
  $("olderEnabled").checked=f.olderEnabled;$("olderAmount").value=f.olderAmount;$("olderUnit").value=f.olderUnit;
  $("domains").value=f.domains.join("\n");$("cleanTitle").checked=f.cleanTitle;$("cleanTerms").value=f.cleanTerms.join("\n");$("filterDedupe").checked=f.dedupe;
  filterDlg.showModal();
}
function checkedFields(prefix){return["title","description","url","image"].filter(k=>$(`${prefix}_${k}`).checked);}
function saveFilter(){
  if(!filterTarget)return;const obj=filterTarget.type==="feed"?S.feeds.find(f=>f.id===filterTarget.id):S.bundles.find(b=>b.id===filterTarget.id);if(!obj)return;
  obj.filters={white:$("filterWhite").value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean),black:$("filterBlack").value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean),
    whiteFields:checkedFields("white"),blackFields:checkedFields("black"),whitePartial:$("whitePartial").checked,blackPartial:$("blackPartial").checked,whiteAnd:$("whiteAnd").checked,blackAnd:$("blackAnd").checked,
    hideNoImage:$("hideNoImage").checked,hideNoDescription:$("hideNoDescription").checked,hideNoDate:$("hideNoDate").checked,hideNoSecureLink:$("hideNoSecureLink").checked,
    duplicateTitle:$("duplicateTitle").checked,duplicateDescription:$("duplicateDescription").checked,similarTitle:$("similarTitle").checked,dedupe:$("filterDedupe").checked,
    olderEnabled:$("olderEnabled").checked,olderAmount:Number($("olderAmount").value)||24,olderUnit:$("olderUnit").value,domains:$("domains").value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean),
    cleanTitle:$("cleanTitle").checked,cleanTerms:$("cleanTerms").value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean)};
  save();filterDlg.close();render();renderFeeds();renderBundles();renderFilterManager();toast("Filter saved");
}
function openAlert(type,id){
  alertTarget={type,id};const obj=type==="feed"?S.feeds.find(f=>f.id===id):S.bundles.find(b=>b.id===id);if(!obj)return;const a=normalizeAlert(obj.alerts);
  $("alertTitle").textContent=`Alerts: ${obj.name}`;$("alertEnabled").checked=a.enabled;$("alertInterval").value=a.interval;$("alertSound").checked=a.sound;$("alertNotifications").checked=a.notifications;$("alertImportant").checked=a.onlyImportant;$("alertKeywords").value=a.keywords.join("\n");alertDlg.showModal();
}
function saveAlert(){
  if(!alertTarget)return;const obj=alertTarget.type==="feed"?S.feeds.find(f=>f.id===alertTarget.id):S.bundles.find(b=>b.id===alertTarget.id);if(!obj)return;
  obj.alerts={enabled:$("alertEnabled").checked,interval:Number($("alertInterval").value)||5,sound:$("alertSound").checked,notifications:$("alertNotifications").checked,onlyImportant:$("alertImportant").checked,keywords:$("alertKeywords").value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean)};
  save();alertDlg.close();setupAlertTimer();renderFeeds();renderBundles();toast("Alert settings saved");
}
function renderFilterManager(){
  $("filterManager").innerHTML=`<div class="card"><b>Feed filters</b><p>Every feed has an independent RSS.app-style filter.</p>${S.feeds.map(f=>`<div class="manager-row"><span>${esc(f.name)}</span><button class="small" data-mf="${esc(f.id)}">Edit filters</button></div>`).join("")||"<p>No feeds yet.</p>"}</div>
  <div class="card"><b>Bundle filters</b><p>Bundle filters run after each feed's own filter.</p>${S.bundles.map(b=>`<div class="manager-row"><span>${esc(b.name)}</span><button class="small" data-mb="${esc(b.id)}">Edit filters</button></div>`).join("")||"<p>No bundles yet.</p>"}</div>`;
  document.querySelectorAll("[data-mf]").forEach(b=>b.onclick=()=>openFilter("feed",b.dataset.mf));document.querySelectorAll("[data-mb]").forEach(b=>b.onclick=()=>openFilter("bundle",b.dataset.mb));
}
function renderSettings(){
  const on=S.feeds.some(f=>normalizeAlert(f.alerts).enabled)||S.bundles.some(b=>normalizeAlert(b.alerts).enabled);
  $("settingsContent").innerHTML=`<div class="card"><b>Mobile alerts</b><p>Alerts check new feed items at the selected interval while MarketFeed is open.</p>
    <button id="enableNotify" class="small">Enable browser notifications</button>
    <button id="enablePush" class="small">Enable mobile push</button><button id="testNotify" class="small">Test notification</button>
    <p class="small-text">${on?"At least one feed/bundle alert is enabled.":"No feed or bundle alert is enabled yet."}</p></div>
    <div class="card"><b>Storage</b><p>Current version still keeps feed/news data in this browser. Cloud storage can be added separately.</p><button id="export">Export backup</button> <button id="reset">Reset app</button></div>`;
  $("enableNotify").onclick=async()=>{if("Notification" in window){const p=await Notification.requestPermission();toast(p==="granted"?"Notifications enabled":"Notification permission not granted");}else toast("This browser does not support notifications");};
  $("enablePush").onclick=enableMobilePush; $("testNotify").onclick=async()=>{if("Notification" in window&&Notification.permission!=="granted")await Notification.requestPermission();if(Notification.permission==="granted")new Notification("MarketFeed test",{body:"Mobile notifications are working.",icon:"icon-192.png"});beep();};
  $("export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:"application/json"}));a.download="marketfeed-backup.json";a.click();};
  $("reset").onclick=()=>{if(confirm("Reset MarketFeed?")){localStorage.removeItem(KEY);location.reload();}};
}

async function enableMobilePush(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){toast("Web Push is not supported by this browser.");return;}
  if(!PUSH_PUBLIC_KEY){toast("Push backend is not configured yet.");return;}
  const p=Notification.permission==="granted"?"granted":await Notification.requestPermission();
  if(p!=="granted"){toast("Notification permission was not granted.");return;}
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(PUSH_PUBLIC_KEY)});
  S.pushSubscription=sub.toJSON();save();toast("Mobile push enabled.");
}
function urlBase64ToUint8Array(s){const pad="=".repeat((4-s.length%4)%4),b=atob((s+pad).replace(/-/g,"+").replace(/_/g,"/")),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}

function beep(){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=.08;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.22);}catch(_){}
}
$("newFeed").onclick=$("newFeed2").onclick=add;
$("testFeed").onclick=async()=>{const k=$("keyword").value.trim(),raw=$("url").value.trim(),u=raw||keywordURL(k);if(!u||(!raw&&!k))return $("testMsg").textContent="Enter a keyword or RSS URL";try{const a=await getFeed({id:"test",url:u});$("testMsg").textContent="✓ Feed works — "+a.length+" stories found";}catch(e){$("testMsg").textContent="✕ "+e.message;}};
$("feedForm").onsubmit=async e=>{e.preventDefault();const k=$("keyword").value.trim(),raw=$("url").value.trim(),u=raw||keywordURL(k);if(!k&&!raw)return toast("Enter keyword or RSS URL");if(S.feeds.some(f=>f.url===u))return toast("This feed already exists");const f={id:crypto.randomUUID(),name:$("fname").value.trim()||k||"RSS Feed",keyword:k,url:u,filters:DEFAULT_FILTER(),alerts:DEFAULT_ALERT()};S.feeds.push(f);const b=S.bundles.find(x=>x.id===$("fBundle").value);if(b&&!b.feeds.includes(f.id))b.feeds.push(f.id);save();feedDlg.close();renderFeeds();await refreshFeed(f,false);toast("Feed saved");};
$("newBundle").onclick=()=>{$("bundleForm").reset();bundleDlg.showModal();};
$("bundleForm").onsubmit=e=>{e.preventDefault();const b={id:crypto.randomUUID(),name:$("bname").value.trim(),feeds:[],filters:DEFAULT_FILTER(),alerts:DEFAULT_ALERT()};S.bundles.push(b);save();bundleDlg.close();renderBundles();toast("Bundle created");};
$("refresh").onclick=refreshAll;$("q").oninput=render;$("unread").onchange=e=>{S.unread=e.target.checked;save();render();};$("saveFilter").onclick=saveFilter;$("saveAlert").onclick=saveAlert;
document.querySelectorAll("nav button").forEach(b=>{b.type="button";b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();const target=b.dataset.p;if(!target||!$(target))return;if(target==="home"){activeFeed="";bundle="";}page(target);});});
function setupAlertTimer(){
  if(alertTimer)clearInterval(alertTimer);
  const enabled=[...S.feeds.map(f=>normalizeAlert(f.alerts)),...S.bundles.map(b=>normalizeAlert(b.alerts))].filter(a=>a.enabled);
  if(!enabled.length)return;
  const mins=Math.min(...enabled.map(a=>Number(a.interval)||5));
  alertTimer=setInterval(async()=>{if(document.visibilityState==="hidden")return;for(const f of S.feeds)await refreshFeed(f,false);},mins*60000);
}
render();renderFeeds();renderBundles();renderFilterManager();renderSettings();setupAlertTimer();
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js?v=11");
window.addEventListener("error",e=>{const el=$("status");if(el)el.textContent="App error: "+(e.message||"Unknown JavaScript error");console.error(e.error||e.message);});
