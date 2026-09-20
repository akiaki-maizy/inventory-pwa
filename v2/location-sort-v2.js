(()=>{
'use strict';
const KEY='locationSortMode';
const MODES=[['numberAsc','番号 昇順'],['numberDesc','番号 降順'],['nameAsc','名前 昇順'],['nameDesc','名前 降順'],['registered','登録順']];
const $=id=>document.getElementById(id);function nameCmp(a,b){return String(a.name||'').localeCompare(String(b.name||''),'ja',{numeric:true,sensitivity:'base'});}function hasNo(l){return l.displayNumber===null||l.displayNumber===undefined||l.displayNumber==='';}
function sort(list,mode='numberAsc'){return [...list].sort((a,b)=>{if(mode==='numberAsc'||mode==='numberDesc'){const ae=hasNo(a),be=hasNo(b);if(ae!==be)return ae?1:-1;if(!ae){const d=Number(a.displayNumber)-Number(b.displayNumber);if(d)return mode==='numberDesc'?-d:d;}return nameCmp(a,b);}if(mode==='nameAsc')return nameCmp(a,b);if(mode==='nameDesc')return nameCmp(b,a);return String(a.createdAt||a.id||'').localeCompare(String(b.createdAt||b.id||''))||nameCmp(a,b);});}
async function setting(){return (await InventoryDB.get('settings',KEY))?.value||'numberAsc';}async function save(v){await InventoryDB.put('settings',{key:KEY,value:v});}
async function render(){if(window.InventoryApp?.refreshHome)return window.InventoryApp.refreshHome();}
function escapeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function install(){const box=$('locationList');if(!box||$('v2LocationSort'))return;const head=box.closest('.card')?.querySelector('.section-head');if(!head)return;const select=document.createElement('select');select.id='v2LocationSort';select.setAttribute('aria-label','保管場所の並べ替え');select.style='max-width:150px';for(const [v,t] of MODES){const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o);}select.value=await setting();select.onchange=async()=>{await save(select.value);if(window.InventoryApp?.refreshHome)await window.InventoryApp.refreshHome();};head.insertBefore(select,head.querySelector('#addLocationBtn'));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);window.LocationSortV2={sort,render,install};
})();