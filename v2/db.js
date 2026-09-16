(()=>{
'use strict';
const DB_NAME='inventory_pwa_v2';
const DB_VERSION=2;
const STORES=['settings','locations','suppliers','categories','products','lots','transactions'];
let db=null;
function open(){if(db)return Promise.resolve(db);return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=e=>{const d=e.target.result;for(const name of STORES){if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:name==='settings'?'key':'id'});}};req.onsuccess=e=>{db=e.target.result;db.onversionchange=()=>{db.close();db=null;};resolve(db);};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('データベース更新がブロックされています'));});}
async function withTransaction(storeNames,mode,work){const d=await open();return new Promise((resolve,reject)=>{const tx=d.transaction(storeNames,mode);let result;try{result=work(tx);}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('データベース処理に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('データベース処理が中断されました'));});}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function get(storeName,key){const d=await open();return request(d.transaction(storeName).objectStore(storeName).get(key));}
async function getAll(storeName){const d=await open();return request(d.transaction(storeName).objectStore(storeName).getAll());}
async function put(storeName,value){return withTransaction([storeName],'readwrite',tx=>tx.objectStore(storeName).put(value));}
async function remove(storeName,key){return withTransaction([storeName],'readwrite',tx=>tx.objectStore(storeName).delete(key));}
window.InventoryDB={DB_NAME,DB_VERSION,STORES,open,withTransaction,request,get,getAll,put,remove};
})();
