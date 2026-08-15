const KEY="marketfeed-v1";
const DEFAULT_PROXY="https://rssfeed.daksheshpatelin.workers.dev";
let db=JSON.parse(localStorage.getItem(KEY)||'null')||{
 feeds:[], bundles:[{id:"portfolio",name:"My Portfolio"}],
 stocks:[], articles:[], whitelist:[], blacklist:[], muted:[],
 settings:{proxyUrl:DEFAULT_PROXY, unreadOnly:false}
};
db.settings = db.settings || {};
if(!db.settings.proxyUrl) db.settings.proxyUrl = DEFAULT_PROXY;
if(typeof db.settings.unreadOnly !== "boolean") db.settings.unreadOnly = false;
db.feeds.forEach(f=>{if(typeof f.enabled !== "boolean") f.enabled=true; if(!Array.isArray(f.bundles)) f.bundles=[]});
let currentStockId=null;

function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function id(){return Math.random().toString(36).slice(2,10)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function activeMuted(x){return db.muted.some(m=>m.type===x.type&&m.value===x.value&&new Date(m.until)>new Date())}
function watchKeywords(){return [...db.whitelist,...db.stocks.flatMap(s=>s.keywords)].map(x=>x.toLowerCase()).filter(Boolean)}
function isWatch(a){
 const text=(a.title+" "+(a.description||"")).toLowerCase();
 return watchKeywords().some(k=>text.includes(k));
}
function normalizeKey(value){
 return String(value||"").toLowerCase().trim()
  .replace(/^https?:\/\//,"")
  .replace(/^www\./,"")
  .replace(/[?#].*$/,"")
  .replace(/\/$/,"")
  .replace(/[^\w\s]/g,"")
  .replace(/\s+/g," ")
  .trim();
}
function matches(a){
 const text=(a.title+" "+(a.description||"")).toLowerCase();
 if(db.blacklist.some(k=>text.includes(k.toLowerCase()))) return false;
 if(activeMuted({type:"feed",value:a.source})) return false;
 if(db.settings.unreadOnly && a.read) return false;
 return true;
}
function render(view="home"){
 document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const app=document.getElementById("app");
 if(view==="home") app.innerHTML=home();
 if(view==="portfolio") app.innerHTML=portfolio();
 if(view==="bundles") app.innerHTML=bundles();
 if(view==="feeds") app.innerHTML=feeds();
 if(view==="settings") app.innerHTML=settings();
 if(view==="stockView") app.innerHTML=stockView();
 bind();
}

function home(){
 let arts=db.articles.filter(matches).sort((a,b)=>new Date(b.date)-new Date(a.date));
 return `<div class="toolbar">
   <input id="q" placeholder="Type stock name/topic to create feed or search...">
   <button class="button primary" id="quickAddHome">＋ Create Feed</button>
 </div>
 <div class="toolbar">
   <button class="button ${db.settings.unreadOnly?'primary':''}" id="toggleUnread">${db.settings.unreadOnly?'Showing Unread':'Show Unread only'}</button>
   <button class="button" id="markAllRead">Mark all read</button>
 </div>
 <div id="articleList">${articleList(arts)}</div>`;
}

function articleList(arts){
 if(!arts.length)return `<div class="empty">No articles yet.<br>Add stock tickers or news feeds in the Feeds tab, then tap ↻ on Home to fetch.</div>`;
 return arts.map(a=>`<article class="card ${a.read?'read':''}">
 <a href="${esc(a.url)}" target="_blank" class="markRead" data-id="${a.id}"><div class="title">${esc(a.title)}</div></a>
 <div class="meta">${esc(a.source)} · ${new Date(a.date).toLocaleString()}</div>
 <div class="chips">${!a.read?'<span class="chip unread">● New</span>':''}${isWatch(a)?'<span class="chip star">⭐ Watch</span>':''}${(a.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}</div>
 </article>`).join("");
}

function portfolio(){
 return `<div class="row"><h2>My Portfolio</h2><button class="button" id="addStock">＋ Stock</button></div>
 ${db.stocks.length?db.stocks.map(s=>`<div class="stock"><div class="row"><strong>${esc(s.name)}</strong><button class="button danger delStock" data-id="${s.id}">Delete</button></div>
 <div class="meta">${s.keywords.map(esc).join(", ")}</div>
 <button class="button stockNews" data-id="${s.id}">View matching news</button></div>`).join(""):"<div class='empty'>Add your portfolio stocks here.</div>"}`;
}

function stockView(){
 const s=db.stocks.find(x=>x.id===currentStockId);
 if(!s) return portfolio();
 const kws=s.keywords.map(k=>k.toLowerCase()).filter(Boolean);
 let arts=db.articles.filter(matches).filter(a=>{
   const text=(a.title+" "+(a.description||"")).toLowerCase();
   return kws.some(k=>text.includes(k));
 }).sort((a,b)=>new Date(b.date)-new Date(a.date));
 return `<div class="row"><button class="button" id="backToPortfolio">← Back</button><h2>${esc(s.name)}</h2></div>${articleList(arts)}`;
}

function bundles(){
 return `<div class="row"><h2>Bundles</h2><button class="button" id="addBundle">＋ Bundle</button></div>
 ${db.bundles.map(b=>`<div class="bundle"><div class="row"><strong>📁 ${esc(b.name)}</strong><span class="small">${db.feeds.filter(f=>(f.bundles||[]).includes(b.id)).length} feeds</span></div>
 <div class="meta">${db.feeds.filter(f=>(f.bundles||[]).includes(b.id)).map(f=>esc(f.name)).join(" · ")||"No feeds yet"}</div></div>`).join("")}`;
}

function feeds(){
 return `<div class="row" style="gap:8px; margin-bottom:12px;">
   <input id="feedInput" placeholder="Enter stock ticker or topic (e.g. KPIT, Moneycontrol)..." style="margin:0;">
   <button class="button primary" id="quickAddFeed" style="white-space:nowrap;">＋ Create Feed</button>
 </div>
 <h2>Feeds List</h2>
 ${db.feeds.length?db.feeds.map(f=>{
   const muted=activeMuted({type:"feed",value:f.name});
   return `<div class="feed"><div class="row"><strong>${esc(f.name)}${f.enabled?'':' <span class="small">(disabled)</span>'}</strong><button class="button danger delFeed" data-id="${f.id}">Delete</button></div>
 <div class="meta">${esc(f.url)}</div>
 <div class="row" style="margin:8px 0;">
   <label class="small">Assign Bundle: 
     <select class="bundleAssign" data-id="${f.id}">
       <option value="">-- None --</option>
       ${db.bundles.map(b=>`<option value="${b.id}" ${(f.bundles||[]).includes(b.id)?'selected':''}>${esc(b.name)}</option>`).join("")}
     </select>
   </label>
 </div>
 ${muted?'<div class="hideuntil">Hidden temporarily</div>':''}
 <div class="feedActions">
   <button class="button testFeed" data-id="${f.id}">Test feed</button>
   <button class="button toggleFeed" data-id="${f.id}">${f.enabled?'Disable':'Enable'}</button>
   ${muted?'':`<button class="button hideFeed" data-id="${f.id}">Hide 1h</button><button class="button hideFeed" data-id="${f.id}" data-hrs="6">Hide 6h</button><button class="button hideFeed" data-id="${f.id}" data-hrs="24">Hide 24h</button>`}
 </div></div>`
 }).join(""):"<div class='empty'>No feeds added yet. Enter a topic above to create one.</div>"}`;
}

function settings(){
 return `<h2>RSS Proxy</h2>
 <label>Worker Proxy URL<input id="proxyUrl" placeholder="https://rssfeed.daksheshpatelin.workers.dev" value="${esc(db.settings.proxyUrl||"")}"></label>
 <button class="button primary" id="saveProxy">Save proxy URL</button>
 <hr>
 <h2>Filters</h2>
 <label>Whitelist keywords<textarea id="white" rows="5">${esc(db.whitelist.join("\n"))}</textarea></label>
 <label>Blacklist keywords<textarea id="black" rows="5">${esc(db.blacklist.join("\n"))}</textarea></label>
 <button class="button primary" id="saveFilters">Save filters</button>
 <hr><h3>Data</h3><button class="button danger" id="clear">Clear all data</button>`;
}

function dedupeArticles(){
 const seen=new Map();
 const kept=[];
 const sorted=[...db.articles].sort((a,b)=>new Date(a.date)-new Date(b.date));
 for(const a of sorted){
   const key=normalizeKey(a.url)||normalizeKey(a.title);
   if(!key){kept.push(a);continue}
   if(seen.has(key)){
     const existing=seen.get(key);
     existing.tags=[...new Set([...(existing.tags||[]),...(a.tags||[])])];
     continue;
   }
   seen.set(key,a);
   kept.push(a);
 }
 db.articles=kept;
}

async function createFeedFromQuery(inputVal){
 const text=inputVal.trim();
 if(!text){alert("Please enter a stock ticker, keyword, or URL.");return}
 
 const base=db.settings.proxyUrl.trim().replace(/\/$/,"");
 let name=text;
 let url="";

 if(text.startsWith("http://") || text.startsWith("https://")){
   url=text;
   try{ name=new URL(text).hostname.replace("www.","") }catch(e){ name=text }
 } else {
   url=`${base}/generate?target=${encodeURIComponent(text)}`;
 }

 db.feeds.push({ id:id(), name:name, url:url, bundles:[], enabled:true });
 save();
 render("feeds");
 await fetchAllFeeds();
}

async function fetchAllFeeds(){
 if(!db.settings.proxyUrl){alert("Please set your Worker Proxy URL in Settings.");render("settings");return}
 if(!db.feeds.length) return;
 const btn=document.getElementById("refresh");
 if(btn){btn.disabled=true;btn.classList.add("spin")}
 const base=db.settings.proxyUrl.trim().replace(/\/$/,"");
 const activeFeeds=db.feeds.filter(f=>f.enabled!==false&&!activeMuted({type:"feed",value:f.name}));
 let errors=[];
 for(const f of activeFeeds){
   try{
     const res=await fetch(`${base}/rss?url=${encodeURIComponent(f.url)}`);
     const data=await res.json();
     if(data.ok && Array.isArray(data.items)){
       for(const item of data.items){
         const aid=f.id+"-"+item.id;
         const existing=db.articles.findIndex(x=>x.id===aid);
         const art={id:aid,title:item.title,description:item.description,url:item.url,date:item.date||new Date().toISOString(),source:f.name,tags:[f.name],read:existing>=0?db.articles[existing].read:false};
         if(existing>=0) db.articles[existing]=art; else db.articles.push(art);
       }
     } else { errors.push(f.name) }
   }catch(e){errors.push(f.name)}
 }
 dedupeArticles();
 if(db.articles.length>500){
   db.articles=db.articles.sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,500);
 }
 save();
 if(btn){btn.disabled=false;btn.classList.remove("spin")}
 render(document.querySelector(".tab.active")?.dataset.view||"home");
}

async function testFeed(f){
 if(!db.settings.proxyUrl){alert("Set your Worker Proxy URL in Filters first.");return}
 const base=db.settings.proxyUrl.trim().replace(/\/$/,"");
 try{
   const res=await fetch(`${base}/rss?url=${encodeURIComponent(f.url)}`);
   const data=await res.json();
   if(data.ok) alert(`✅ "${f.name}" works.\nFound ${data.count} articles.`);
   else alert(`❌ "${f.name}" failed: ${data.error||"unknown error"}`);
 }catch(e){alert(`❌ Could not reach proxy for "${f.name}".`)}
}

function bind(){
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>render(b.dataset.view));
 document.getElementById("refresh")?.addEventListener("click",fetchAllFeeds);
 
 document.getElementById("quickAddHome")?.addEventListener("click",()=>{
   const q=document.getElementById("q").value;
   createFeedFromQuery(q);
 });

 document.getElementById("quickAddFeed")?.addEventListener("click",()=>{
   const val=document.getElementById("feedInput").value;
   createFeedFromQuery(val);
 });

 document.querySelectorAll(".bundleAssign").forEach(select=>{
   select.addEventListener("change", (e)=>{
     const f=db.feeds.find(x=>x.id===e.target.dataset.id);
     if(f){
       f.bundles = e.target.value ? [e.target.value] : [];
       save();
     }
   });
 });

 document.getElementById("addStock")?.addEventListener("click",()=>stockDialog.showModal());
 document.getElementById("addBundle")?.addEventListener("click",()=>{let n=prompt("Bundle name");if(n){db.bundles.push({id:id(),name:n});save();render("bundles")}});
 document.querySelectorAll(".delFeed").forEach(b=>b.onclick=()=>{db.feeds=db.feeds.filter(f=>f.id!==b.dataset.id);save();render("feeds")});
 document.querySelectorAll(".delStock").forEach(b=>b.onclick=()=>{db.stocks=db.stocks.filter(s=>s.id!==b.dataset.id);save();render("portfolio")});
 document.querySelectorAll(".stockNews").forEach(b=>b.onclick=()=>{currentStockId=b.dataset.id;render("stockView")});
 document.getElementById("backToPortfolio")?.addEventListener("click",()=>render("portfolio"));
 document.querySelectorAll(".testFeed").forEach(b=>b.onclick=()=>{const f=db.feeds.find(x=>x.id===b.dataset.id);if(f)testFeed(f)});
 document.querySelectorAll(".toggleFeed").forEach(b=>b.onclick=()=>{const f=db.feeds.find(x=>x.id===b.dataset.id);if(f){f.enabled=!f.enabled;save();render("feeds")}});
 document.querySelectorAll(".hideFeed").forEach(b=>b.onclick=()=>{
   const hrs=Number(b.dataset.hrs||1);
   const f=db.feeds.find(x=>x.id===b.dataset.id);
   if(f){db.muted.push({type:"feed",value:f.name,until:new Date(Date.now()+hrs*3600000).toISOString()});save();render("feeds")}
 });
 document.querySelectorAll(".markRead").forEach(el=>el.addEventListener("click",()=>{
   const a=db.articles.find(x=>x.id===el.dataset.id);
   if(a){a.read=true;save()}
 }));
 document.getElementById("toggleUnread")?.addEventListener("click",()=>{db.settings.unreadOnly=!db.settings.unreadOnly;save();render("home")});
 document.getElementById("markAllRead")?.addEventListener("click",()=>{db.articles.forEach(a=>a.read=true);save();render("home")});
 document.getElementById("saveProxy")?.addEventListener("click",()=>{db.settings.proxyUrl=document.getElementById("proxyUrl").value.trim();save();alert("Proxy URL saved.")});
 document.getElementById("saveFilters")?.addEventListener("click",()=>{db.whitelist=document.getElementById("white").value.split("\n").map(x=>x.trim()).filter(Boolean);db.blacklist=document.getElementById("black").value.split("\n").map(x=>x.trim()).filter(Boolean);save();alert("Filters saved")});
 document.getElementById("clear")?.addEventListener("click",()=>{if(confirm("Clear everything?")){localStorage.removeItem(KEY);location.reload()}});
 document.getElementById("q")?.addEventListener("input",e=>{
   let q=e.target.value.toLowerCase();
   document.getElementById("articleList").innerHTML=articleList(
     db.articles.filter(matches).filter(a=>(a.title+" "+a.source+" "+(a.description||"")).toLowerCase().includes(q))
     .sort((a,b)=>new Date(b.date)-new Date(a.date))
   );
   document.querySelectorAll(".markRead").forEach(el=>el.addEventListener("click",()=>{
     const a=db.articles.find(x=>x.id===el.dataset.id);
     if(a){a.read=true;save()}
   }));
 });
}

document.getElementById("stockForm").addEventListener("submit",e=>{e.preventDefault();db.stocks.push({id:id(),name:stockName.value.trim(),keywords:stockKeywords.value.split(",").map(x=>x.trim()).filter(Boolean)});save();stockDialog.close();render("portfolio")});
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
render();
if(db.settings.proxyUrl && db.feeds.length) fetchAllFeeds();