// MarketFeed push backend template. Deploy separately from the existing RSS worker.
// Configure VAPID keys and D1/KV subscription storage before production use.
export default { async fetch(request, env) {
  return new Response(JSON.stringify({ok:true,service:"MarketFeed Push Worker",status:"backend-template"}),{headers:{"content-type":"application/json"}});
}};