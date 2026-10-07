(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const groupName=p=>String(p.orderGroup||p.name||'').trim()||String(p.name||'未設定');
const key=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
function show(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==id));window.scrollTo(0,0);}
function locPath(id,locations){const loc=locations.find(x=>x.id===id);if(!loc)return'保管場所不明';const parent=locations.find(x=>x.id===loc.parentId);return parent?parent.name+' ＞ '+loc.name:loc.name;}
async function buildGroups(){
 const[products,lots,locations]=await Promise.all(['products','lots','locations'].map(x=>InventoryDB.getAll(x)));
 const active=products.filter(p=>p.active!==false),map=new Map();
 for(const p of active){const name=groupName(p),k=key(name);if(!map.has(k))map.set(k,{key:k,name,products:[],productIds:new Set(),total:0,targets:new Set(),casePacks:new Set(),locations:new Map()});const g=map.get(k);g.products.push(p);g.productIds.add(p.id);const target=Number(p.orderTargetQty||0);if(Number.isInteger(target)&&target>0)g.targets.add(target);const pack=Math.max(1,Number(p.casePack)||1);g.casePacks.add(pack);}
 for(const lot of lots){if(Number(lot.qty||0)<=0)continue;for(const g of map.values()){if(!g.productIds.has(lot.productId))continue;const qty=Number(lot.qty||0);g.total+=qty;g.locations.set(lot.locationId,(g.locations.get(lot.locationId)||0)+qty);break;}}
 const groups=[...map.values()].map(g=>{const targets=[...g.targets],targetConflict=targets.length>1,target=targets.length===1?targets[0]:0,shortage=targetConflict||!target?null:Math.max(0,target-g.total),packs=[...g.casePacks],pack=packs.length===1?packs[0]:null;return{...g,targetConflict,targets,target,shortage,pack,locationsMaster:locations};});
 groups.sort((a,b)=>(Number(b.shortage>0)-Number(a.shortage>0))||a.name.localeCompare(b.name,'ja'));
 return groups;
}
async function render(){
 const box=$('orderList');if(!box)return;
 const q=String($('orderSearch')?.value||'').trim().toLowerCase(),range=$('orderRange')?.value||'all';
 let groups=await buildGroups();
 if(q)groups=groups.filter(g=>[g.name,...g.products.flatMap(p=>[p.name,p.spec,p.jan])].some(v=>String(v||'').toLowerCase().includes(q)));
 if(range==='shortage')groups=groups.filter(g=>g.shortage>0||g.targetConflict);
 $('orderResultCount').textContent=`${groups.length}グループ`;
 box.innerHTML=groups.length?'':'<div class="empty">条件に一致する発注グループはありません。</div>';
 for(const g of groups){
  const e=document.createElement('div');e.className='list-item';
  const locText=[...g.locations.entries()].map(([id,qty])=>`${locPath(id,g.locationsMaster)} ${InventoryService.formatQty(qty,g.pack||1)}`).join(' / ')||'在庫なし';
  const targetText=g.targetConflict?`定数不一致（${g.targets.join(' / ')}個）`:g.target>0?`${g.target}個`:'未設定';
  const shortageText=g.targetConflict?'要確認':g.target<=0?'定数未設定':g.shortage>0?(g.pack?InventoryService.formatQty(g.shortage,g.pack):`${g.shortage}個`):'発注不要';
  const members=g.products.map(p=>`${p.name}${p.spec?' '+p.spec:''}`).join(' / ');
  e.innerHTML=`<details class="product-actions"><summary><div><strong>${esc(g.name)}</strong><small>現在庫 ${InventoryService.formatQty(g.total,g.pack||1)} / 定数 ${esc(targetText)}</small></div><div class="history-qty"><strong>${esc(shortageText)}</strong><small>${g.shortage>0?'不足':''}</small></div></summary><div class="note">在庫場所：${esc(locText)}</div><div class="note">対象：${esc(members)}</div><div class="item-actions"></div></details>`;
  const actions=e.querySelector('.item-actions');
  for(const p of g.products){const b=document.createElement('button');b.type='button';b.className='small-btn secondary';b.textContent=`${p.name}を編集`;b.onclick=()=>window.ProductMasterUI?.openProduct(p.id);actions.appendChild(b);}
  box.appendChild(e);
 }
 show('orderView');
}
function init(){
 $('orderBtn')?.addEventListener('click',render);
 $('orderSearch')?.addEventListener('input',render);
 $('orderRange')?.addEventListener('change',render);
}
window.InventoryOrder={buildGroups,render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();