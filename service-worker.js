const CACHE_NAME = 'inventory-pwa-v1-13-stable-home';
const CURRENT_VERSION = 'MVP Ver.1.13 / 賞味期限ロール小型化・今日を初期値 / 端末内保存';
const ASSETS = ['./manifest.webmanifest','./icon-192.png','./icon-512.png','./jan-scanner.js','./case-stock.js','./date-wheel.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
async function fixedIndexResponse(request){
 try{
  const network=await fetch(request,{cache:'no-store'});let html=await network.text();
  if(!html.includes('id="editProductMasterBtn"'))html=html.replace('<div id="detailLocation" class="muted"></div>','<div id="detailLocation" class="muted"></div>\n<button class="ghost" id="editProductMasterBtn" style="margin-top:10px">商品情報を編集</button>');
  if(!html.includes('jan-scanner.js'))html=html.replace('</body>','<script src="./jan-scanner.js"></script>\n</body>');
  if(!html.includes('case-stock.js'))html=html.replace('</body>','<script src="./case-stock.js"></script>\n</body>');
  if(!html.includes('date-wheel.js'))html=html.replace('</body>','<script src="./date-wheel.js"></script>\n</body>');
  html=html.replace(/MVP Ver\.1\.[0-9]+ \/ [^<]*端末内保存/g,CURRENT_VERSION);
  // The original HTML still contains the old seven-button home grid. Hide it before first paint;
  // jan-scanner.js builds the current task-group home UI after startup.
  html=html.replace('<section id="view-home">','<section id="view-home" class="home-enhanced-pending">');
  html=html.replace('</style>','\n.home-enhanced-pending > .grid:first-of-type{display:none!important}\n</style>');
  const guard=`<script>(()=>{const V=${JSON.stringify(CURRENT_VERSION)};const apply=()=>{const s=document.querySelector('header .sub');if(s&&s.textContent!==V)s.textContent=V;};apply();new MutationObserver(apply).observe(document.documentElement,{subtree:true,childList:true,characterData:true});})();<\/script>`;
  html=html.replace('</body>',guard+'\n</body>');
  const response=new Response(html,{status:network.status,statusText:network.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});
  const cache=await caches.open(CACHE_NAME);cache.put('./index.html',response.clone());return response;
 }catch(e){return(await caches.match('./index.html'))||new Response('アプリを読み込めませんでした。',{status:503});}
}
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 const isIndex=url.origin===self.location.origin&&(url.pathname.endsWith('/inventory-pwa/')||url.pathname.endsWith('/inventory-pwa/index.html'));
 if(isIndex){event.respondWith(fixedIndexResponse(event.request));return;}
 if(url.pathname.endsWith('/jan-scanner.js')||url.pathname.endsWith('/case-stock.js')||url.pathname.endsWith('/date-wheel.js')){
   event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone));return response;}).catch(()=>caches.match(event.request)));
   return;
 }
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const clone=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone));return response;}).catch(()=>caches.match(event.request))));
});