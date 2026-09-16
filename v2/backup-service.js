(()=>{
'use strict';
const FORMAT='inventory-pwa-backup';
const SCHEMA_VERSION=3;
const STORES=['settings','locations','categories','products','lots','transactions'];
const DB=()=>window.InventoryDB;
function clone(v){return JSON.parse(JSON.stringify(v));}
function arrays(data){for(const s of STORES){if(!Array.isArray(data?.[s]))throw new Error(`${s} が配列ではありません`);}}
function uniqueIds(items,label,key='id'){const seen=new Set();for(const x of items){const id=x?.[key];if(id==null||id==='')throw new Error(`${label} にID未設定データがあります`);if(seen.has(id))throw new Error(`${label} に重複IDがあります: ${id}`);seen.add(id);}return seen;}
function validateData(data){
 arrays(data);uniqueIds(data.settings,'settings','key');const locationIds=uniqueIds(data.locations,'locations');const categoryIds=uniqueIds(data.categories,'categories');const productIds=uniqueIds(data.products,'products');uniqueIds(data.lots,'lots');uniqueIds(data.transactions,'transactions');
 for(const l of data.locations){if(l.parentId&&!locationIds.has(l.parentId))throw new Error(`存在しない親保管場所: ${l.id}`);}
 for(const c of data.categories){if(c.parentId&&!categoryIds.has(c.parentId))throw new Error(`存在しない親分類: ${c.id}`);}
 for(const p of data.products){if(p.locationId&&!locationIds.has(p.locationId))throw new Error(`商品 ${p.id} の保管場所が存在しません`);if(p.categoryId&&!categoryIds.has(p.categoryId))throw new Error(`商品 ${p.id} の分類が存在しません`);if(!p.name)throw new Error(`商品 ${p.id} の商品名がありません`);}
 for(const l of data.lots){if(!productIds.has(l.productId))throw new Error(`ロット ${l.id} の商品が存在しません`);if(l.locationId&&!locationIds.has(l.locationId))throw new Error(`ロット ${l.id} の保管場所が存在しません`);if(!Number.isInteger(Number(l.qty))||Number(l.qty)<0)throw new Error(`ロット ${l.id} の数量が不正です`);}
 for(const t of data.transactions){if(t.productId&&!productIds.has(t.productId))throw new Error(`履歴 ${t.id} の商品が存在しません`);}
 return true;
}
async function exportData(){const data={};for(const s of STORES)data[s]=clone(await DB().getAll(s));validateData(data);return{format:FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:'2.x',exportedAt:new Date().toISOString(),data};}
function normalizeBackup(input){const obj=typeof input==='string'?JSON.parse(input):clone(input);if(obj?.format!==FORMAT)throw new Error('Ver.2バックアップ形式ではありません');if(obj.schemaVersion!==SCHEMA_VERSION)throw new Error(`未対応のバックアップ形式です: ${obj.schemaVersion}`);validateData(obj.data);return obj;}
async function replaceAll(input){const backup=normalizeBackup(input);const d=await DB().open();return new Promise((resolve,reject)=>{const tx=d.transaction(STORES,'readwrite');try{for(const s of STORES){const store=tx.objectStore(s);store.clear();for(const item of backup.data[s])store.put(clone(item));}}catch(e){try{tx.abort();}catch(_){}reject(e);return;}tx.oncomplete=()=>resolve({schemaVersion:backup.schemaVersion,counts:Object.fromEntries(STORES.map(s=>[s,backup.data[s].length]))});tx.onerror=()=>reject(tx.error||new Error('復元に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('復元を中断しました'));});}
window.BackupService={FORMAT,SCHEMA_VERSION,STORES,validateData,exportData,normalizeBackup,replaceAll};
})();
