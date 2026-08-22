const PROXY="https://rssfeed.daksheshpatelin.workers.dev";
const KEY="marketfeed_v3";

let S=load();
let activeFeed="";
let activeBundle="";
let filterTarget=null;
let assignFeed=null;
let assignBundle=null;

const $=id=>document.getElementById(id);

function esc(x){
 return String(x??"").replace(/[&<>"']/g,m=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",
  '"':"&quot;","'":"&#39;"
 }[m]));
}

function save(){
 localStorage.setItem(KEY,JSON.stringify(S));
}

function load(){
 let x;
 try{x=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}

 if(!x)x={
  feeds:[],
  bundles:[],
  articles:[],
  read:[],
  muted:{},
  unread:false
 };

 x.feeds=x.feeds||[];
 x.bundles=x.bundles||[];
 x.articles=x.articles||[];
 x.read=x.read||[];
 x.muted=x.muted||{};

 x.feeds.forEach(f=>{
  f.filters=filterDefaults(f.filters);
 });

 x.bundles.forEach(b=>{
  b.feeds=b.feeds||[];
  b.filters=filterDefaults(b.filters);
 });

 return x;
}

function filterDefaults(f){
 f=f||{};
 return {
  white:f.white||[],
  black:f.black||[],
  whiteFields:f.whiteFields||["title","description","url","image"],
  blackFields:f.blackFields||["title","description","url","image"],
  whitePartial:f.whitePartial!==false,
  blackPartial:f.blackPartial!==false,
  whiteAnd:!!f.whiteAnd,
  blackAnd:!!f.blackAnd,

  noImage:!!f.noImage,
  noDescription:!!f.noDescription,
  noDate:!!f.noDate,
  noSecure:!!f.noSecure,
  duplicateTitle:!!f.duplicateTitle,
  duplicateDescription:!!f.duplicateDescription,
  similarTitle:!!f.similarTitle,

  olderEnabled:!!f.olderEnabled,
  olderAmount:f.olderAmount||24,
  olderUnit:f.olderUnit||"hours",

  domains:f.domains||[],
  cleanTitle:!!f.cleanTitle,
  cleanTerms:f.cleanTerms||[]
 };
}

function feedName(id){
 const f=S.feeds.find(x=>x.id===id);
 return f?f.name:"Feed";
}

function articleId(feed,x){
 const s=feed+"|"+(x.guid||x.link||x.url||x.title||"");
 let h=2166136261;
 for(let i=0;i<s.length;i++){
  h^=s.charCodeAt(i);
  h=Math.imul(h,16777619);
 }
 return "a_"+(h>>>0).toString(16);
}

function fields(a){
 return {
  title:String(a.title||"").toLowerCase(),
  description:String(a.description||"").toLowerCase(),
  url:String(a.url||a.link||"").toLowerCase(),
  image:String(a.image||a.imageUrl||"").toLowerCase()
 };
}

function fieldText(a,list){
 const f=fields(a);
 return list.map(x=>f[x]||"").join(" ");
}

function keywordMatch(text,k,partial){
 text=text.toLowerCase();
 k=k.toLowerCase();

 if(partial)return text.includes(k);

 const re=new RegExp(
  "(^|[^a-z0-9])"+
  k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+
  "([^a-z0-9]|$)"
 );

 return re.test(text);
}

function matchesKeywords(a,keys,fieldsList,partial,andMode){
 if(!keys.length)return false;

 const text=fieldText(a,fieldsList);

 if(andMode)
  return keys.every(k=>keywordMatch(text,k,partial));

 return keys.some(k=>keywordMatch(text,k,partial));
}

function domainBlocked(a,f){
 const list=f.domains||[];
 const url=String(a.url||a.link||"").toLowerCase();

 return list.some(d=>{
  d=String(d).toLowerCase().trim();
  return d&&url.includes(d);
 });
}

function cleanTitle(a,f){
 if(!f.cleanTitle)return a;

 let title=a.title||"";

 for(const t of f.cleanTerms||[]){
  if(t)title=title.replace(
   new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),
   ""
  );
 }

 return {...a,title:title.replace(/\s+/g," ").trim()};
}

function autoFilter(a,f){
 if(f.noImage&&!a.image&&!a.imageUrl)return false;
 if(f.noDescription&&!a.description)return false;
 if(f.noDate&&!a.date&&!a.published)return false;

 const url=String(a.url||a.link||"");
 if(f.noSecure&&!url.startsWith("https://"))return false;

 if(domainBlocked(a,f))return false;

 if(f.olderEnabled){
  const d=new Date(a.date||a.published||0).getTime();
  const age=Date.now()-d;
  const limit=f.olderUnit==="days"
   ?f.olderAmount*86400000
   :f.olderAmount*3600000;

  if(d&&age>limit)return false;
 }

 if(matchesKeywords(
  a,
  f.black,
  f.blackFields,
  f.blackPartial,
  f.blackAnd
 ))return false;

 if(f.white.length&&!matchesKeywords(
  a,
  f.white,
  f.whiteFields,
  f.whitePartial,
  f.whiteAnd
 ))return false;

 return true;
}

function duplicateFilter(items,f){
 let out=items;

 if(f.duplicateTitle){
  const seen=new Set();
  out=out.filter(a=>{
   const k=(a.title||"").toLowerCase().trim();
   if(!k)return true;
   if(seen.has(k))return false;
   seen.add(k);
   return true;
  });
 }

 if(f.duplicateDescription){
  const seen=new Set();
  out=out.filter(a=>{
   const k=(a.description||"").toLowerCase().trim();
   if(!k)return true;
   if(seen.has(k))return false;
   seen.add(k);
   return true;
  });
 }

 if(f.similarTitle){
  const seen=[];
  out=out.filter(a=>{
   const k=(a.title||"").toLowerCase()
    .replace(/[^a-z0-9 ]/g,"")
    .split(/\s+/)
    .filter(Boolean);

   if(!k.length)return true;

   const set=new Set(k);

   for(const old of seen){
    let same=0;
    for(const w of set)if(old.has(w))same++;
    const ratio=same/Math.max(set.size,old.size);
    if(ratio>=0.8)return false;
   }

   seen.push(set);
   return true;
  });
 }

 return out;
}

function applyFeedFilter(items,f){
 let out=items
  .map(a=>cleanTitle(a,f))
  .filter(a=>autoFilter(a,f));

 return duplicateFilter(out,f);
}

function applyBundleFilter(items,b){
 return duplicateFilter(
  items.filter(a=>autoFilter(a,b.filters)),
  b.filters
 );
}

function feedItems(f){
 return applyFeedFilter(
  S.articles.filter(a=>a.feedId===f.id),
  f.filters
 );
}

function bundleItems(b){
 let out=[];

 b.feeds.forEach(id=>{
  const f=S.feeds.find(x=>x.id===id);
  if(f)out.push(...feedItems(f));
 });

 return applyBundleFilter(out,b);
}

function currentItems(){
 let out=[];

 if(activeFeed){
  const f=S.feeds.find(x=>x.id===activeFeed);
  if(f)out=feedItems(f);
 }
 else if(activeBundle){
  const b=S.bundles.find(x=>x.id===activeBundle);
  if(b)out=bundleItems(b);
 }
 else{
  S.feeds.forEach(f=>out.push(...feedItems(f)));
 }

 if(S.unread)
  out=out.filter(a=>!S.read.includes(a.id));

 const q=$("q")?.value.trim().toLowerCase();

 if(q)
  out=out.filter(a=>
   ((a.title||"")+" "+(a.description||""))
   .toLowerCase().includes(q)
  );

 return out.sort((a,b)=>
  new Date(b.date||b.published||0)-
  new Date(a.date||a.published||0)
 );
}

function articleHTML(a){
 const url=a.url||a.link||"";
 const read=S.read.includes(a.id);

 return `
 <article class="article ${read?"read":"unread"}">
  <div class="source">${esc(feedName(a.feedId))}</div>

  <div class="title">
   ${
    url
    ?`<a href="${esc(url)}" target="_blank"
       rel="noopener noreferrer">${esc(a.title||"Untitled")}</a>`
    :esc(a.title||"Untitled")
   }
  </div>

  <p>${esc(a.description||"")}</p>

  <div class="meta">
   ${a.date?esc(new Date(a.date).toLocaleString()):""}
  </div>

  <div class="actions">
   <button class="small" data-read="${esc(a.id)}">
    ${read?"Unread":"Read"}
   </button>
  </div>
 </article>`;
}

function renderHome(){
 let title="My News";

 if(activeFeed)title=feedName(activeFeed);

 if(activeBundle){
  const b=S.bundles.find(x=>x.id===activeBundle);
  if(b)title=b.name;
 }

 $("status").textContent=
  title+" · "+currentItems().length+" stories";

 $("articles").innerHTML=
  currentItems().map(articleHTML).join("")||
  `<div class="empty">No news available.</div>`;

 document.querySelectorAll("[data-read]").forEach(b=>{
  b.onclick=()=>{
   const i=S.read.indexOf(b.dataset.read);

   if(i<0)S.read.push(b.dataset.read);
   else S.read.splice(i,1);

   save();
   renderHome();
  };
 });
}

function renderFeeds(){
 $("feeds").innerHTML=S.feeds.length
 ?S.feeds.map(f=>`
  <div class="card feed-row"
       data-feed-select="${esc(f.id)}">

   <div>
    <b>${esc(f.name)}</b>
    <small>${esc(f.keyword||f.url||"")}</small>
   </div>

   <div class="actions">
    <button class="small"
      data-add-feed="${esc(f.id)}">
      Add to bundle
    </button>

    <button class="small"
      data-feed-filter="${esc(f.id)}">
      Filter
    </button>

    <button class="small"
      data-feed-refresh="${esc(f.id)}">
      Refresh
    </button>

    <button class="small"
      data-feed-delete="${esc(f.id)}">
      Delete
    </button>
   </div>
  </div>
 `).join("")
 :`<div class="empty">No feeds.</div>`;

 document.querySelectorAll("[data-feed-select]").forEach(x=>{
  x.onclick=e=>{
   if(e.target.closest("button"))return;

   activeFeed=x.dataset.feedSelect;
   activeBundle="";
   page("home");
  };
 });

 document.querySelectorAll("[data-add-feed]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();
   openFeedBundles(x.dataset.addFeed);
  };
 });

 document.querySelectorAll("[data-feed-filter]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();
   openFilter("feed",x.dataset.feedFilter);
  };
 });

 document.querySelectorAll("[data-feed-refresh]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();
   refreshFeed(
    S.feeds.find(f=>f.id===x.dataset.feedRefresh)
   );
  };
 });

 document.querySelectorAll("[data-feed-delete]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();

   if(!confirm("Delete this feed?"))return;

   const id=x.dataset.feedDelete;

   S.feeds=S.feeds.filter(f=>f.id!==id);
   S.articles=S.articles.filter(a=>a.feedId!==id);

   S.bundles.forEach(b=>{
    b.feeds=b.feeds.filter(i=>i!==id);
   });

   if(activeFeed===id)activeFeed="";

   save();
   renderFeeds();
   renderBundles();
  };
 });
}

function renderBundles(){
 $("bundleList").innerHTML=S.bundles.length
 ?S.bundles.map(b=>`
  <div class="card bundle-row"
       data-bundle-select="${esc(b.id)}">

   <div>
    <b>📁 ${esc(b.name)}</b>
    <small>${b.feeds.length} feed(s)</small>
   </div>

   <div class="actions">
    <button class="small"
      data-bundle-feeds="${esc(b.id)}">
      Add / remove feeds
    </button>

    <button class="small"
      data-bundle-filter="${esc(b.id)}">
      Filter
    </button>

    <button class="small"
      data-bundle-delete="${esc(b.id)}">
      Delete
    </button>
   </div>
  </div>
 `).join("")
 :`<div class="empty">No bundles.</div>`;

 document.querySelectorAll("[data-bundle-select]").forEach(x=>{
  x.onclick=e=>{
   if(e.target.closest("button"))return;

   activeBundle=x.dataset.bundleSelect;
   activeFeed="";
   page("home");
  };
 });

 document.querySelectorAll("[data-bundle-feeds]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();
   openBundleFeeds(x.dataset.bundleFeeds);
  };
 });

 document.querySelectorAll("[data-bundle-filter]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();
   openFilter("bundle",x.dataset.bundleFilter);
  };
 });

 document.querySelectorAll("[data-bundle-delete]").forEach(x=>{
  x.onclick=e=>{
   e.stopPropagation();

   if(!confirm("Delete this bundle?"))return;

   S.bundles=S.bundles.filter(
    b=>b.id!==x.dataset.bundleDelete
   );

   if(activeBundle===x.dataset.bundleDelete)
    activeBundle="";

   save();
   renderBundles();
  };
 });
}

function renderFilters(){
 $("filterManager").innerHTML=`
 <div class="card">
  <h3>Feed filters</h3>
  ${
   S.feeds.map(f=>`
    <div class="manager-row">
     <span>${esc(f.name)}</span>
     <button class="small"
       data-edit-feed-filter="${esc(f.id)}">
       Edit
     </button>
    </div>
   `).join("")||
   "<p>No feeds.</p>"
  }
 </div>

 <div class="card">
  <h3>Bundle filters</h3>
  ${
   S.bundles.map(b=>`
    <div class="manager-row">
     <span>${esc(b.name)}</span>
     <button class="small"
       data-edit-bundle-filter="${esc(b.id)}">
       Edit
     </button>
    </div>
   `).join("")||
   "<p>No bundles.</p>"
  }
 </div>`;

 document.querySelectorAll(
  "[data-edit-feed-filter]"
 ).forEach(x=>{
  x.onclick=()=>openFilter(
   "feed",
   x.dataset.editFeedFilter
  );
 });

 document.querySelectorAll(
  "[data-edit-bundle-filter]"
 ).forEach(x=>{
  x.onclick=()=>openFilter(
   "bundle",
   x.dataset.editBundleFilter
  );
 });
}

function page(id){
 document.querySelectorAll(".page")
  .forEach(x=>x.classList.remove("active"));

 $(id).classList.add("active");

 if(id==="home")renderHome();
 if(id==="feedspage")renderFeeds();
 if(id==="bundlespage")renderBundles();
 if(id==="filterspage")renderFilters();
}

function openFeedBundles(id){
 assignFeed=id;

 $("assignTitle").textContent=
  "Add feed to bundle";

 $("assignList").innerHTML=
 S.bundles.map(b=>`
  <label class="checkrow">
   <input type="checkbox"
    data-bundle-check="${esc(b.id)}"
    ${b.feeds.includes(id)?"checked":""}>
   ${esc(b.name)}
  </label>
 `).join("")||
 "<p>Create a bundle first.</p>";

 $("assignDlg").showModal();
}

function openBundleFeeds(id){
 assignBundle=id;

 const b=S.bundles.find(x=>x.id===id);
 if(!b)return;

 $("assignTitle").textContent=
  "Feeds in "+b.name;

 $("assignList").innerHTML=
 S.feeds.map(f=>`
  <label class="checkrow">
   <input type="checkbox"
    data-feed-check="${esc(f.id)}"
    ${b.feeds.includes(f.id)?"checked":""}>
   ${esc(f.name)}
  </label>
 `).join("")||
 "<p>Create a feed first.</p>";

 $("assignDlg").showModal();
}

$("saveAssignments").onclick=()=>{
 if(assignFeed){
  const selected=[
   ...document.querySelectorAll(
    "[data-bundle-check]:checked"
   )
  ].map(x=>x.dataset.bundleCheck);

  S.bundles.forEach(b=>{
   b.feeds=b.feeds.filter(
    id=>id!==assignFeed
   );

   if(selected.includes(b.id))
    b.feeds.push(assignFeed);
  });
 }

 if(assignBundle){
  const b=S.bundles.find(
   x=>x.id===assignBundle
  );

  if(b)
   b.feeds=[
    ...document.querySelectorAll(
     "[data-feed-check]:checked"
    )
   ].map(x=>x.dataset.feedCheck);
 }

 assignFeed=null;
 assignBundle=null;

 save();
 $("assignDlg").close();
 renderFeeds();
 renderBundles();
 renderHome();
};

function openFilter(type,id){
 filterTarget={type,id};

 const obj=type==="feed"
  ?S.feeds.find(f=>f.id===id)
  :S.bundles.find(b=>b.id===id);

 if(!obj)return;

 const f=obj.filters;

 $("filterTitle").textContent=
  `${type==="feed"?"Feed":"Bundle"} filter: ${obj.name}`;

 $("filterWhite").value=f.white.join("\n");
 $("filterBlack").value=f.black.join("\n");

 setChecks("whiteField",f.whiteFields);
 setChecks("blackField",f.blackFields);

 $("whitePartial").checked=f.whitePartial;
 $("blackPartial").checked=f.blackPartial;
 $("whiteAnd").checked=f.whiteAnd;
 $("blackAnd").checked=f.blackAnd;

 $("noImage").checked=f.noImage;
 $("noDescription").checked=f.noDescription;
 $("noDate").checked=f.noDate;
 $("noSecure").checked=f.noSecure;

 $("duplicateTitle").checked=f.duplicateTitle;
 $("duplicateDescription").checked=f.duplicateDescription;
 $("similarTitle").checked=f.similarTitle;

 $("olderEnabled").checked=f.olderEnabled;
 $("olderAmount").value=f.olderAmount;
 $("olderUnit").value=f.olderUnit;

 $("domains").value=f.domains.join("\n");

 $("cleanTitle").checked=f.cleanTitle;
 $("cleanTerms").value=f.cleanTerms.join("\n");

 $("filterDlg").showModal();
}

function setChecks(prefix,values){
 document.querySelectorAll(
  `[data-${prefix}]`
 ).forEach(x=>{
  x.checked=values.includes(x.dataset[prefix]);
 });
}

function checked(prefix){
 return [
  ...document.querySelectorAll(
   `[data-${prefix}]:checked`
  )
 ].map(x=>x.dataset[prefix]);
}

$("saveFilter").onclick=()=>{
 if(!filterTarget)return;

 const obj=filterTarget.type==="feed"
  ?S.feeds.find(f=>f.id===filterTarget.id)
  :S.bundles.find(b=>b.id===filterTarget.id);

 if(!obj)return;

 obj.filters={
  white:$("filterWhite").value
   .split(/\n|,/)
   .map(x=>x.trim())
   .filter(Boolean),

  black:$("filterBlack").value
   .split(/\n|,/)
   .map(x=>x.trim())
   .filter(Boolean),

  whiteFields:checked("whiteField"),
  blackFields:checked("blackField"),

  whitePartial:$("whitePartial").checked,
  blackPartial:$("blackPartial").checked,

  whiteAnd:$("whiteAnd").checked,
  blackAnd:$("blackAnd").checked,

  noImage:$("noImage").checked,
  noDescription:$("noDescription").checked,
  noDate:$("noDate").checked,
  noSecure:$("noSecure").checked,

  duplicateTitle:$("duplicateTitle").checked,
  duplicateDescription:$("duplicateDescription").checked,
  similarTitle:$("similarTitle").checked,

  olderEnabled:$("olderEnabled").checked,
  olderAmount:Number($("olderAmount").value)||24,
  olderUnit:$("olderUnit").value,

  domains:$("domains").value
   .split(/\n|,/)
   .map(x=>x.trim())
   .filter(Boolean),

  cleanTitle:$("cleanTitle").checked,

  cleanTerms:$("cleanTerms").value
   .split(/\n|,/)
   .map(x=>x.trim())
   .filter(Boolean)
 };

 save();
 $("filterDlg").close();

 renderHome();
 renderFeeds();
 renderBundles();
 renderFilters();
};

async function getFeed(f){
 const endpoint=f.url.startsWith(PROXY+"/news?q=")
  ?f.url
  :PROXY+"/rss?url="+encodeURIComponent(f.url);

 const r=await fetch(endpoint,{
  cache:"no-store"
 });

 if(!r.ok)
  throw Error("RSS proxy HTTP "+r.status);

 const d=await r.json();

 if(!d.ok)
  throw Error(d.error||"Feed error");

 return (d.items||[]).map(x=>({
  ...x,
  feedId:f.id,
  id:articleId(f.id,x),
  url:x.link||x.url||"",
  date:x.published||x.date||
   new Date().toISOString()
 }));
}

async function refreshFeed(f){
 if(!f)return;

 try{
  const items=await getFeed(f);

  const ids=new Set(items.map(x=>x.id));

  S.articles=S.articles.filter(
   a=>a.feedId!==f.id||ids.has(a.id)
  );

  const map=new Map(
   S.articles.map(a=>[a.id,a])
  );

  items.forEach(a=>map.set(a.id,a));

  S.articles=[...map.values()].slice(0,4000);

  save();

  renderHome();
  renderFeeds();
  renderBundles();

 }catch(e){
  alert(e.message);
 }
}

async function refreshAll(){
 for(const f of S.feeds)
  await refreshFeed(f);

 renderHome();
}

$("newFeed").onclick=()=>{
 $("feedForm").reset();
 $("fBundle").innerHTML=
  `<option value="">No bundle</option>`+
  S.bundles.map(b=>
   `<option value="${esc(b.id)}">${esc(b.name)}</option>`
  ).join("");

 $("feedDlg").showModal();
};

$("newFeed2").onclick=$("newFeed").onclick;

$("feedForm").onsubmit=async e=>{
 e.preventDefault();

 const keyword=$("keyword").value.trim();
 const url=$("url").value.trim();

 if(!keyword&&!url)
  return alert("Enter keyword or RSS URL");

 const f={
  id:crypto.randomUUID(),
  name:$("fname").value.trim()||
   keyword||"RSS Feed",
  keyword,
  url:url||
   PROXY+"/news?q="+encodeURIComponent(keyword),
  filters:filterDefaults()
 };

 S.feeds.push(f);

 const b=S.bundles.find(
  x=>x.id===$("fBundle").value
 );

 if(b)b.feeds.push(f.id);

 save();
 $("feedDlg").close();

 await refreshFeed(f);
};

$("newBundle").onclick=()=>{
 $("bundleForm").reset();
 $("bundleDlg").showModal();
};

$("bundleForm").onsubmit=e=>{
 e.preventDefault();

 const b={
  id:crypto.randomUUID(),
  name:$("bname").value.trim(),
  feeds:[],
  filters:filterDefaults()
 };

 S.bundles.push(b);

 save();
 $("bundleDlg").close();

 renderBundles();
};

$("refresh").onclick=refreshAll;

$("q").oninput=renderHome;

$("unread").onchange=e=>{
 S.unread=e.target.checked;
 save();
 renderHome();
};

document.querySelectorAll("nav button").forEach(b=>{
 b.onclick=e=>{
  e.preventDefault();

  const p=b.dataset.p;

  if(p==="home"){
   activeFeed="";
   activeBundle="";
  }

  page(p);
 };
});

renderHome();
renderFeeds();
renderBundles();
renderFilters();

if("serviceWorker"in navigator)
 navigator.serviceWorker.register(
  "service-worker.js?v=9"
 );