'use strict';
const CACHE='inventory-pwa-v2-shell-20260920q';
const SHELL=[
  './','./index.html','./style.css','./manifest.webmanifest',
  './db.js','./inventory-service.js','./master-service.js','./backup-service.js','./migration-service.js',
  './app.js','./product-master-ui.js','./master-management.js','./data-management.js','./receive-input-guard.js',
  './jan-scanner-v2.js','./date-wheel-v2.js','./location-sort-v2.js','./csv-export-v2.js','./csv-export-ui-v2.js','./update-manager.js',
  '../icon-192.png','../icon-512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('inventory-pwa-v2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{
      if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}
      return res;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  if(!url.pathname.includes('/inventory-pwa/v2/')&&!url.pathname.endsWith('/inventory-pwa/icon-192.png')&&!url.pathname.endsWith('/inventory-pwa/icon-512.png'))return;
  event.respondWith(fetch(req).then(res=>{
    if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
    return res;
  }).catch(()=>caches.match(req)));
});