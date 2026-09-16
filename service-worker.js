const CACHE_NAME = 'inventory-pwa-v1-14-home-markup-stable';
const CURRENT_VERSION = 'MVP Ver.1.14 / 賞味期限入力1枠化・安定化 / 端末内保存';
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

  // Promote the already field-tested grouped home UI into the markup delivered to the browser.
  // jan-scanner.js detects #homeTaskMenus and therefore does not create a duplicate.
  const legacyHome=`<div class="grid">
        <button class="big" data-view="inventory">在庫を見る</button>
        <button class="big" id="quickAddLot">入荷・期限登録</button>
        <button class="big" data-view="expiry">賞味期限を確認</button>
        <button class="big" data-view="stocktake">棚卸する</button>
        <button class="big" data-view="allHistory">全体履歴を見る</button>
        <button class="big" data-view="addProduct">＋ 商品登録</button>
        <button class="big" data-view="settings">設定</button>
      </div>`;
  const currentHome=`<div id="homeTaskMenus" class="grid">
        <button class="big" data-home-menu="work">在庫を使う・登録する</button>
        <button class="big" data-home-menu="check">在庫を確認する</button>
        <button class="big" data-home-menu="manage">履歴・管理</button>
        <button class="big" data-view="settings">設定</button>
      </div>
      <div id="homeTaskPanel" class="card hidden" style="margin-top:14px">
        <div class="row"><h3 id="homeTaskTitle" style="margin:0;flex:1"></h3><button type="button" id="homeTaskClose" class="ghost" style="min-height:42px;flex:0 0 auto">閉じる</button></div>
        <div id="homeTaskButtons" class="grid" style="margin-top:12px"></div>
      </div>`;
  if(html.includes(legacyHome))html=html.replace(legacyHome,currentHome);

  // Bind the static grouped-home markup. This mirrors the previously field-tested menu behavior.
  const homeScript=`<script>(()=>{const defs={work:{title:'在庫を使う・登録する',items:[['JANで商品を探す','scan'],['入荷・期限登録','quickAddLot'],['商品登録','addProduct'],['在庫一覧から使用登録','inventory']]},check:{title:'在庫を確認する',items:[['在庫一覧','inventory'],['賞味期限を確認','expiry'],['棚卸する','stocktake']]},manage:{title:'履歴・管理',items:[['全体履歴を見る','allHistory']]}};function bind(){const menus=document.getElementById('homeTaskMenus'),panel=document.getElementById('homeTaskPanel'),box=document.getElementById('homeTaskButtons'),title=document.getElementById('homeTaskTitle');if(!menus||!panel||!box||menus.dataset.bound)return;menus.dataset.bound='1';const open=key=>{const d=defs[key];if(!d)return;title.textContent=d.title;box.innerHTML='';d.items.forEach(([label,target])=>{const b=document.createElement('button');b.className='big';b.textContent=label;b.onclick=()=>{if(target==='scan'){if(window.InventoryJanScanner)window.InventoryJanScanner.start();return;}if(target==='quickAddLot'){const q=document.getElementById('quickAddLot');if(q)q.click();else if(typeof showView==='function')showView('inventory');return;}if(typeof showView==='function')showView(target);};box.appendChild(b);});panel.classList.remove('hidden');panel.scrollIntoView({behavior:'smooth',block:'nearest'});};menus.querySelectorAll('[data-home-menu]').forEach(b=>b.onclick=()=>open(b.dataset.homeMenu));const close=document.getElementById('homeTaskClose');if(close)close.onclick=()=>panel.classList.add('hidden');}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();})();<\/script>`;
  html=html.replace('</body>',homeScript+'\n</body>');

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