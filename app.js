const PROXY="https://rssfeed.daksheshpatelin.workers.dev";
const KEY="marketfeed_v2";
let S=JSON.parse(localStorage.getItem(KEY)||"null")||{feeds:[],bundles:[],articles:[],read:[],white:[],black:[],dedupe:true,unread:false,muted:{}},bundle="";
const feedDlg=document.getElementById("feedDlg");
const bundleDlg=document.getElementById("bundleDlg");
const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(S));
const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const name=id=>S.feeds.find(f=>f.id===id)?.name||"Feed";

function toast(x){toastEl.textContent=x;toastEl.style.display="block";setTimeout(()=>toastEl.style.display="none",2200)}
const toastEl=$("toast");

function txt(a){return(a.title+" "+(a.description||"")).toLowerCase()}

function list(){
let a=S.articles.filter(x=>!S.black.some(k=>txt(x).includes(k.toLowerCase()))&&(!S.white.length||S.white.some(k=>txt(x).includes(k.toLowerCase())))&&!(S.muted[x.feedId]==="forever"||(S.muted[x.feedId]&&Date.now()<S.muted[x.feedId])));
if(S.unread)a=a.filter(x=>!S.read.includes(x.id));
if(bundle){let b=S.bundles.find(x=>x.id===bundle);if(b)a=a.filter(x=>b.feeds.includes(x.feedId))}
let q=$("q").value.toLowerCase();if(q)a=a.filter(x=>txt(x).includes(q));
if(S.dedupe){let z=new Set();a=a.filter(x=>{let k=x.title.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(z.has(k))return false;z.add(k);return true})}
return a.sort((a,b)=>new Date(b.date)-new Date(a.date))
}

function render(){
let c=$("bundles");
c.innerHTML='<button class="chip '+(!bundle?"active":"")+'" data-b="">All</button>'+S.bundles.map(b=>`<button class="chip ${bundle==b.id?"active":""}" data-b="${b.id}">${esc(b.name)}</button>`).join("");
c.querySelectorAll("[data-b]").forEach(x=>x.onclick=()=>{bundle=x.dataset.b;render()});
let a=list();
$("status").textContent=a.length+" stories";
$("articles").innerHTML=a.length?a.map(x=>`<article class="article ${S.read.includes(x.id)?"":"unread"}"><div class="source">${esc(name(x.feedId))}</div><div class="title"><a href="${esc(x.url||"#")}" target="_blank">${esc(x.title)}</a></div><p>${esc(x.description||"")}</p><div class="meta">${new Date(x.date).toLocaleString()}</div><div class="actions"><button class="small" data-r="${x.id}">${S.read.includes(x.id)?"Unread":"Read"}</button><button class="small" data-h="${x.feedId}">Hide feed</button></div></article>`).join(""):'<div class="empty">No matching stories.</div>';
document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{let i=S.read.indexOf(b.dataset.r);i<0?S.read.push(b.dataset.r):S.read.splice(i,1);save();render()});
document.querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{let h=prompt("Hide this feed for hours.\nEnter 0 for forever:","24");if(h!==null){let n=Number(h);S.muted[b.dataset.h]=n?Date.now()+n*3600000:"forever";save();render()}})
}

async function getFeed(f){
let endpoint=PROXY+"/rss?url="+encodeURIComponent(f.url);
let r;
try{
  r=await fetch(endpoint,{cache:"no-store"});
}catch(e){
  throw Error("Cannot reach RSS proxy. Check that rssfeed.daksheshpatelin.workers.dev is deployed.");
}
if(!r.ok)throw Error("RSS proxy HTTP "+r.status);
let d;
try{ d=await r.json(); }
catch(e){ throw Error("RSS proxy returned an invalid response."); }
if(!d.ok)throw Error(d.error||"Feed error");
return(d.items||[]).map(x=>({...x,feedId:f.id}))
}

function keywordURL(k){return"https://news.google.com/rss/search?q="+encodeURIComponent(k)+"&hl=en-IN&gl=IN&ceid=IN:en"}

async function refreshFeed(f,show=true){
try{
let a=await getFeed(f),m=new Map(S.articles.map(x=>[x.id,x]));
a.forEach(x=>m.set(x.id,x));
S.articles=[...m.values()].slice(0,4000);
save();render();
if(show)toast("Feed refreshed")
}catch(e){toast(e.message)}
}

function renderFeeds(){
$("feeds").innerHTML=S.feeds.length?S.feeds.map(f=>`<div class="card"><b>${esc(f.name)}</b><p>${esc(f.keyword||f.url)}</p><button class="small" data-rf="${f.id}">Refresh</button> <button class="small" data-df="${f.id}">Delete</button></div>`).join(""):'<div class="empty">No feeds.<br>Create one from a keyword or RSS URL.</div>';
document.querySelectorAll("[data-rf]").forEach(b=>b.onclick=()=>refreshFeed(S.feeds.find(f=>f.id===b.dataset.rf)));
document.querySelectorAll("[data-df]").forEach(b=>b.onclick=()=>{if(confirm("Delete this feed?")){S.feeds=S.feeds.filter(f=>f.id!==b.dataset.df);S.articles=S.articles.filter(a=>a.feedId!==b.dataset.df);S.bundles.forEach(x=>x.feeds=x.feeds.filter(id=>id!==b.dataset.df));save();renderFeeds();render()}})
}

function renderBundles(){
$("bundleList").innerHTML=S.bundles.length?S.bundles.map(b=>`<div class="card"><b>📁 ${esc(b.name)}</b><p>${b.feeds.length} feed(s)</p><button class="small" data-open="${b.id}">Open</button><button class="small" data-del="${b.id}">Delete</button></div>`).join(""):'<div class="empty">No bundles yet.</div>';
document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{bundle=b.dataset.open;page("home")});
document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{S.bundles=S.bundles.filter(x=>x.id!==b.dataset.del);if(bundle===b.dataset.del)bundle="";save();renderBundles();render()})
}

function page(p){
document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
$(p).classList.add("active");
if(p==="home")render();
if(p==="feedspage")renderFeeds();
if(p==="bundlespage")renderBundles();
if(p==="filterspage"){
$("white").value=S.white.join(", ");
$("black").value=S.black.join(", ");
$("dedupe").checked=S.dedupe;
$("unread").checked=S.unread
}
}

function add(){
let s=$("fBundle");
s.innerHTML='<option value="">No bundle</option>'+S.bundles.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("");
$("feedForm").reset();
$("testMsg").textContent="";
if(typeof feedDlg.showModal==="function")feedDlg.showModal();else feedDlg.setAttribute("open","")
}

$("newFeed").onclick=$("newFeed2").onclick=add;

$("testFeed").onclick=async()=>{
let u=$("url").value.trim()||keywordURL($("keyword").value.trim());
if(!u)return $("testMsg").textContent="Enter a keyword or RSS URL";
try{
let a=await getFeed({id:"test",url:u});
$("testMsg").textContent="✓ Feed works — "+a.length+" stories found"
}catch(e){$("testMsg").textContent="✕ "+e.message}
};

$("feedForm").onsubmit=async e=>{
e.preventDefault();
let k=$("keyword").value.trim(),u=$("url").value.trim()||keywordURL(k);
if(!k&&!$("url").value.trim())return toast("Enter keyword or RSS URL");
if(S.feeds.some(f=>f.url===u))return toast("This feed already exists");
let f={id:crypto.randomUUID(),name:$("fname").value.trim()||k||"RSS Feed",keyword:k,url:u};
S.feeds.push(f);
let b=S.bundles.find(x=>x.id===$("fBundle").value);
if(b)b.feeds.push(f.id);
save();
feedDlg.close();
renderFeeds();
await refreshFeed(f,false);
toast("Feed saved")
};

$("newBundle").onclick=()=>$("bundleDlg").showModal();

$("bundleForm").onsubmit=e=>{
e.preventDefault();
S.bundles.push({id:crypto.randomUUID(),name:$("bname").value.trim(),feeds:[]});
save();bundleDlg.close();renderBundles();toast("Bundle created")
};

$("refresh").onclick=async()=>{
for(const f of S.feeds)await refreshFeed(f,false);
toast("All feeds refreshed")
};

$("q").oninput=render;

$("saveWhite").onclick=()=>{
S.white=$("white").value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
save();render();toast("Whitelist saved")
};

$("saveBlack").onclick=()=>{
S.black=$("black").value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
save();render();toast("Blacklist saved")
};

$("dedupe").onchange=e=>{S.dedupe=e.target.checked;save();render()};
$("unread").onchange=e=>{S.unread=e.target.checked;save();render()};

$("export").onclick=()=>{
let a=document.createElement("a");
a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:"application/json"}));
a.download="marketfeed-backup.json";
a.click()
};

$("reset").onclick=()=>{
if(confirm("Reset MarketFeed?")){localStorage.removeItem(KEY);location.reload()}
};

document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.p));
render();renderFeeds();renderBundles();

if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js");

window.addEventListener("error",e=>{const el=document.getElementById("status");if(el)el.textContent="App error: "+(e.message||"Unknown JavaScript error");console.error(e.error||e.message);});
