(()=>{
'use strict';
const SORT_KEY='inventory-pwa-location-sort-v2';
const NUMBER_KEY='inventory-pwa-location-numbers-v1';
const MODES=[['numberAsc','番号 昇順'],['numberDesc','番号 降順'],['nameAsc','名前 昇順'],['nameDesc','名前 降順'],['registered','登録順']];
function loadMode(){return localStorage.getItem(SORT_KEY)||'numberAsc';}
function saveMode(v){localStorage.setItem(SORT_KEY,v);}
function loadNumbers(){try{const v=JSON.parse(localStorage.getItem(NUMBER_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch(e){return{};}}
function saveNumbers(v){localStorage.setItem(NUMBER_KEY,JSON.stringify(v));}
function numberOf(loc,map){const raw=map[loc.id];if(raw===undefined||raw===null||raw==='')return Number.POSITIVE_INFINITY;const n=Number(raw);return Number.isFinite(n)?n:Number.POSITIVE_INFINITY;}
function byName(a,b){return String(a.name||'').localeCompare(String(b.name||''),'ja',{numeric:true,sensitivity:'base'});}
function sortLocations(list,mode=loadMode()){
 const map=loadNumbers();return [...list].sort((a,b)=>{
  if(mode==='numberAsc')return numberOf(a,map)-numberOf(b,map)||byName(a,b);
  if(mode==='numberDesc')return numberOf(b,map)-numberOf(a,map)||byName(a,b);
  if(mode==='nameAsc')return byName(a,b);
  if(mode==='nameDesc')return byName(b,a);
  return (Number(a.order)||0)-(Number(b.order)||0)||byName(a,b);
 });
}
async function renderHomeSorted(){
 const box=document.getElementById('homeLocationList');if(!box||typeof getAll!=='function')return;
 const roots=sortLocations((await getAll('locations')).filter(x=>x.active!==false&&!x.parentId));const map=loadNumbers();box.innerHTML='';
 if(!roots.length){box.innerHTML='<div class="empty">保管場所がありません</div>';return;}
 for(const loc of roots){const b=document.createElement('button');b.className='big';const n=map[loc.id];b.textContent=(n!==undefined&&n!=='')?`${n}. ${loc.name}`:loc.name;b.onclick=()=>{if(typeof window.openLocationInventory==='function')window.openLocationInventory(loc.id);else if(typeof showView==='function')showView('inventory');};box.appendChild(b);}
}
function setupHomeSort(){
 const box=document.getElementById('homeLocationList');if(!box||document.getElementById('homeLocationSortBar'))return;
 const bar=document.createElement('div');bar.id='homeLocationSortBar';bar.className='card';bar.style.margin='8px 0 12px';bar.innerHTML='<label style="margin-top:0">並べ替え</label><select id="homeLocationSortSelect"></select>';
 const sel=bar.querySelector('select');for(const [v,t] of MODES){const o=document.createElement('option');o.value=v;o.textContent=t;sel.appendChild(o);}sel.value=loadMode();sel.onchange=()=>{saveMode(sel.value);renderHomeSorted();};
 const heading=box.previousElementSibling;if(heading)heading.insertAdjacentElement('afterend',bar);else box.parentElement.insertBefore(bar,box);renderHomeSorted();
}
async function addNumberEditors(){
 const box=document.getElementById('locationList');if(!box||typeof getAll!=='function')return;const roots=(await getAll('locations')).filter(x=>!x.parentId).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));const items=[...box.querySelectorAll(':scope > .item')],map=loadNumbers();
 items.forEach((item,i)=>{const loc=roots[i];if(!loc||item.querySelector('.locationDisplayNumber'))return;const row=document.createElement('div');row.style.marginTop='8px';row.innerHTML='<label style="margin:0 0 5px">表示番号（任意）</label><input class="locationDisplayNumber" type="number" inputmode="numeric" placeholder="例：10">';const input=row.querySelector('input');input.value=map[loc.id]??'';input.onchange=()=>{const m=loadNumbers();if(input.value==='')delete m[loc.id];else m[loc.id]=Number(input.value);saveNumbers(m);renderHomeSorted();};item.appendChild(row);});
}
function setupNumberEditors(){const box=document.getElementById('locationList');if(!box)return;new MutationObserver(()=>setTimeout(addNumberEditors,0)).observe(box,{childList:true});setTimeout(addNumberEditors,300);}
window.InventoryLocationSort={sort:sortLocations,render:renderHomeSorted};
window.addEventListener('load',()=>setTimeout(()=>{setupHomeSort();setupNumberEditors();},500));
})();