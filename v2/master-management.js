(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cached=null;
function showManage(){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!=='manageView'));window.scrollTo(0,0);}
function message(text){const e=$('toast');e.textContent=text;e.classList.add('show');clearTimeout(message.t);message.t=setTimeout(()=>e.classList.remove('show'),2400);}
function locationPath(id,locations){const loc=locations.find(x=>x.id===id);if(!loc)return'保管場所未設定';const parent=locations.find(x=>x.id===loc.parentId);return parent?parent.name+' ＞ '+loc.name:loc.name;}
function productStock(p,lots){return lots.filter(l=>l.productId===p.id).reduce((s,l)=>s+Number(l.qty||0),0);}
function productLocationSummary(p,lots,locations){const map=new Map();for(const l of lots){if(l.productId!==p.id||Number(l.qty||0)<=0)continue;map.set(l.locationId,(map.get(l.locationId)||0)+Number(l.qty||0));}const entries=[...map.entries()].sort((a,b)=>locationPath(a[0],locations).localeCompare(locationPath(b[0],locations),'ja'));if(!entries.length)return'在庫0';const parts=entries.map(([id,qty])=>locationPath(id,locations)+' '+InventoryService.formatQty(qty,p.casePack));const total=entries.reduce((s,x)=>s+x[1],0);return entries.length>1?'総在庫 '+InventoryService.formatQty(total,p.casePack)+' / '+parts.join(' / '):parts[0];}
async function openLocationEdit(id){const locations=await InventoryDB.getAll('locations'),loc=locations.find(x=>x.id===id);if(!loc)return;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!=='locationView'));$('locationFormTitle').textContent='保管場所の編集';$('locationName').value=loc.name||'';$('locationNumber').value=loc.displayNumber??'';const parent=$('locationParent');parent.innerHTML='<option value="">なし（大分類）</option>'+locations.filter(x=>x.id!==id&&x.active!==false&&!x.parentId).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');parent.value=loc.parentId||'';const btn=$('saveLocationBtn'),oldHandler=btn.onclick;btn.onclick=async()=>{try{await MasterService.saveLocation({id:loc.id,name:$('locationName').value,parentId:parent.value||null,displayNumber:$('locationNumber').value,order:loc.order});message('保管場所を更新しました');btn.onclick=oldHandler;showManage();await render();}catch(e){message(e.message);}};window.scrollTo(0,0);}
function renderProducts(){
 if(!cached)return;
 const{products,locations,lots}=cached,qRaw=String($('manageProductSearch')?.value||'').trim().toLowerCase(),mode=$('manageProductFilter')?.value||'all';
 const rows=products.map(p=>({p,qty:productStock(p,lots)})).filter(({p,qty})=>{
  const active=p.active!==false;
  if(mode==='active'&&!active)return false;
  if(mode==='inactive'&&active)return false;
  if(mode==='zero'&&(!active||qty!==0))return false;
  if(mode==='stock'&&qty<=0)return false;
  if(qRaw){const hay=[p.name,p.spec,p.jan,p.supplier,locationPath(p.locationId,locations),productLocationSummary(p,lots,locations),p.expiryManaged===false?'期限なし':'期限管理'].join(' ').toLowerCase();if(!hay.includes(qRaw))return false;}
  return true;
 }).sort((a,b)=>String(a.p.name).localeCompare(String(b.p.name),'ja')||String(a.p.spec||'').localeCompare(String(b.p.spec||''),'ja'));
 const zeroCount=products.filter(p=>p.active!==false&&productStock(p,lots)===0).length;
 if($('manageProductResultCount'))$('manageProductResultCount').textContent=`表示 ${rows.length} / 全${products.length}商品 / 使用中の在庫0 ${zeroCount}商品`;
 const box=$('manageProductList');box.innerHTML=rows.length?'':'<div class="empty">条件に一致する商品はありません。</div>';
 for(const{p,qty}of rows){
  const active=p.active!==false,standard=locationPath(p.locationId,locations),actual=productLocationSummary(p,lots,locations),e=document.createElement('div');
  e.className='list-item manage-item'+(qty===0&&active?' zero-stock-item':'');
  const badges=[active?'使用中':'使用停止中',p.expiryManaged===false?'期限なし':'期限管理',`定数 ${Number(p.orderTargetQty||0)}個`];
  e.innerHTML=`<details class="master-actions"><summary><div><strong>${esc(p.name)}${p.spec?' / '+esc(p.spec):''}</strong><small class="${qty===0&&active?'error-text':''}">${esc(actual)}${p.casePack>1?' / 1ケース '+p.casePack+'個':''}</small><small>標準：${esc(standard)}${p.jan?' / JAN '+esc(p.jan):''} / ${esc(badges.join(' / '))}</small></div></summary><div class="item-actions"><button class="small-btn stock-btn secondary">在庫・使用</button><button class="small-btn receive-btn">入荷</button><button class="small-btn history-btn secondary">履歴</button><button class="small-btn edit-btn secondary">編集</button><button class="small-btn toggle-btn ${active?'danger-btn':'secondary'}">${active?'使用停止':'再開'}</button></div></details>`;
  e.querySelector('.stock-btn').onclick=()=>window.InventoryApp?.openStock?.(p);
  const receive=e.querySelector('.receive-btn');receive.disabled=!active;receive.title=active?'':'使用再開後に入荷できます';receive.onclick=()=>active&&window.InventoryApp?.openReceive?.(p);
  e.querySelector('.history-btn').onclick=()=>window.InventoryApp?.openHistoryForProduct?.(p);
  e.querySelector('.edit-btn').onclick=()=>window.ProductMasterUI?.openProduct(p.id);
  const toggle=e.querySelector('.toggle-btn');toggle.disabled=active&&qty>0;toggle.title=toggle.disabled?`在庫が${qty}個残っているため使用停止できません`:'';
  toggle.onclick=async()=>{try{const result=await MasterService.setProductActive(p.id,!active);message(result.warning?`再開しました: ${result.warning}`:(!active?'商品を再開しました':'商品を使用停止しました'));await render();}catch(err){message(err.message);}};
  box.appendChild(e);
 }
}
async function render(){
 const[products,locations,lots,suppliers,cats]=await Promise.all(['products','locations','lots','suppliers','categories'].map(x=>InventoryDB.getAll(x)));
 cached={products,locations,lots,suppliers,cats};
 renderProducts();
 $('manageLocationList').innerHTML=locations.length?'':'<div class="empty">保管場所はありません。</div>';
 const ordered=[...locations].sort((a,b)=>(a.parentId?1:0)-(b.parentId?1:0)||(a.displayNumber??Infinity)-(b.displayNumber??Infinity)||String(a.name).localeCompare(String(b.name),'ja'));
 for(const l of ordered){const parent=locations.find(x=>x.id===l.parentId),active=l.active!==false,e=document.createElement('div');e.className='list-item manage-item';e.innerHTML=`<div><strong>${esc(parent?parent.name+' ＞ '+l.name:l.name)}</strong><small>${l.displayNumber?`表示番号 ${l.displayNumber} / `:''}${active?'使用中':'使用停止中'}</small></div><div class="item-actions"><button class="small-btn edit-btn secondary">編集</button><button class="small-btn toggle-btn ${active?'danger-btn':'secondary'}">${active?'使用停止':'再開'}</button></div>`;e.querySelector('.edit-btn').onclick=()=>openLocationEdit(l.id);e.querySelector('.toggle-btn').onclick=async()=>{try{await MasterService.setLocationActive(l.id,!active);message(!active?'保管場所を再開しました':'保管場所を使用停止しました');await render();}catch(err){message(err.message);}};$('manageLocationList').appendChild(e);}
 $('manageSupplierList').innerHTML=suppliers.length?'':'<div class="empty">仕入先はありません。</div>';
 for(const item of [...suppliers].sort((a,b)=>a.name.localeCompare(b.name,'ja'))){const active=item.active!==false,e=document.createElement('div');e.className='list-item manage-item';e.innerHTML=`<details class="master-actions"><summary><div><strong>${esc(item.name)}</strong><small>${active?'使用中':'使用停止中'}</small></div></summary><div class="item-actions"><button class="small-btn rename-btn secondary">名称変更</button><button class="small-btn toggle-btn ${active?'danger-btn':'secondary'}">${active?'使用停止':'再開'}</button></div></details>`;e.querySelector('.rename-btn').onclick=async()=>{const name=prompt('仕入先名を変更します',item.name);if(name===null)return;try{await MasterService.saveSupplier({id:item.id,name});message('仕入先名を変更しました');await render();}catch(err){message(err.message);}};e.querySelector('.toggle-btn').onclick=async()=>{try{await MasterService.setSupplierActive(item.id,!active);message(!active?'仕入先を再開しました':'仕入先を使用停止しました');await render();}catch(err){message(err.message);}};$('manageSupplierList').appendChild(e);}
 function catPath(c){const n=[c.name];let cur=c;for(let i=0;i<2&&cur.parentId;i++){cur=cats.find(x=>x.id===cur.parentId);if(cur)n.unshift(cur.name);}return n.join(' ＞ ');}
 function catDepth(c){let d=1,cur=c,seen=new Set();while(cur?.parentId&&d<10){if(seen.has(cur.id))return 99;seen.add(cur.id);cur=cats.find(x=>x.id===cur.parentId);if(!cur)return 99;d++;}return d;}
 $('newCategoryParent').innerHTML='<option value="">なし（大分類）</option>'+cats.filter(c=>c.active!==false&&catDepth(c)<3).sort((a,b)=>catPath(a).localeCompare(catPath(b),'ja')).map(c=>`<option value="${esc(c.id)}">${esc(catPath(c))}</option>`).join('');
 $('manageCategoryList').innerHTML=cats.length?'':'<div class="empty">分類はありません。</div>';
 for(const c of [...cats].sort((a,b)=>catPath(a).localeCompare(catPath(b),'ja'))){const active=c.active!==false,e=document.createElement('div');e.className='list-item manage-item';e.innerHTML=`<div><strong>${esc(catPath(c))}</strong><small>${active?'使用中':'使用停止中'}</small></div><button class="small-btn ${active?'danger-btn':'secondary'}">${active?'使用停止':'再開'}</button>`;e.querySelector('button').onclick=async()=>{try{await MasterService.setCategoryActive(c.id,!active);message(!active?'分類を再開しました':'分類を使用停止しました');await render();}catch(err){message(err.message);}};$('manageCategoryList').appendChild(e);}
}
$('manageProductSearch')?.addEventListener('input',renderProducts);
$('manageProductFilter')?.addEventListener('change',renderProducts);
$('addSupplierBtn').onclick=async()=>{try{await MasterService.saveSupplier({name:$('newSupplierName').value});$('newSupplierName').value='';message('仕入先を追加しました');await render();}catch(e){message(e.message);}};
$('addCategoryBtn').onclick=async()=>{try{await MasterService.saveCategory({name:$('newCategoryName').value,parentId:$('newCategoryParent').value||null});$('newCategoryName').value='';message('分類を追加しました');await render();}catch(e){message(e.message);}};
$('manageBtn').onclick=async()=>{const m=document.querySelector('.header-menu');if(m)m.open=false;showManage();await render();};
window.MasterManagement={render,renderProducts};
})();