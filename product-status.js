(()=>{
'use strict';
function totalStock(productId,lots){return lots.filter(x=>x.productId===productId).reduce((s,x)=>s+(Number(x.qty)||0),0);}
async function inactiveLocationMessage(product){
 const locations=await getAll('locations');const map=Object.fromEntries(locations.map(x=>[x.id,x]));const loc=map[product.locationId];if(!loc)return 'この商品の保管場所が見つかりません。設定から保管場所を確認してください。';
 const parent=loc.parentId?map[loc.parentId]:null;const stopped=[];if(parent?.active===false)stopped.push(`保管場所「${parent.name}」`);if(loc.active===false)stopped.push(parent?`棚・区画「${loc.name}」`:`保管場所「${loc.name}」`);return stopped.length?`${stopped.join('、')}は使用停止中です。\n商品は再開しましたが、保管場所は自動では再開しません。\n設定 → 保管場所設定から必要な場所を使用再開してください。`:'';
}
async function toggleProduct(product){
 const lots=await getAll('lots');let resumed=false;
 if(product.active!==false){const stock=totalStock(product.id,lots);if(stock>0){alert(`「${product.name}」には在庫が${stock}あります。\n在庫を0にしてから使用停止してください。`);return false;}if(!confirm(`「${product.name}」を使用停止しますか？\n通常の在庫一覧から非表示になります。`))return false;product.active=false;}
 else{product.active=true;resumed=true;}
 await put('products',product);await renderProductManager();if(typeof renderInventory==='function')await renderInventory();
 if(resumed){const msg=await inactiveLocationMessage(product);if(msg)alert(msg);}
 return true;
}
async function renderProductManager(){
 const box=document.getElementById('inactiveProductList');if(!box||typeof getAll!=='function')return;
 const [products,lots,locations]=await Promise.all([getAll('products'),getAll('lots'),getAll('locations')]);const map=Object.fromEntries(locations.map(x=>[x.id,x]));const inactive=products.filter(p=>p.active===false).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ja',{numeric:true}));box.innerHTML='';
 if(!inactive.length){box.innerHTML='<div class="empty">使用停止中の商品はありません</div>';return;}
 inactive.forEach(p=>{const loc=map[p.locationId],parent=loc?.parentId?map[loc.parentId]:null,place=parent?`${parent.name} / ${loc.name}`:(loc?.name||'保管場所不明');const stopped=loc?.active===false||parent?.active===false;const d=document.createElement('div');d.className='item';const title=document.createElement('div');title.className='item-title';title.textContent=p.name;const sub=document.createElement('div');sub.className='muted';sub.textContent=`保管場所：${place}${stopped?'（使用停止中）':''}　在庫：${totalStock(p.id,lots)}`;const b=document.createElement('button');b.className='secondary';b.style.marginTop='8px';b.textContent='使用を再開';b.onclick=()=>toggleProduct(p);d.append(title,sub,b);box.appendChild(d);});
}
function ensureManager(){if(document.getElementById('view-productManager'))return;const settings=document.getElementById('view-settings');if(!settings)return;const card=document.createElement('div');card.className='card';card.style.marginTop='14px';card.innerHTML='<h3>商品管理</h3><p class="muted">使用停止中の商品を確認し、必要な場合は使用を再開できます。</p><button class="secondary" id="openProductManager">使用停止中の商品を見る</button>';const categoryCard=[...settings.querySelectorAll('.card')].find(x=>x.querySelector('h3')?.textContent==='商品分類');if(categoryCard)categoryCard.insertAdjacentElement('afterend',card);else settings.appendChild(card);const section=document.createElement('section');section.id='view-productManager';section.className='hidden';section.innerHTML='<button class="ghost" id="backProductManager">← 設定へ</button><h2 style="margin-top:12px">使用停止中の商品</h2><div class="notice">商品データは削除されません。ここから使用を再開できます。</div><div id="inactiveProductList" class="list" style="margin-top:14px"></div>';settings.insertAdjacentElement('afterend',section);document.getElementById('openProductManager').onclick=async()=>{if(typeof showView==='function')showView('productManager');await renderProductManager();};document.getElementById('backProductManager').onclick=()=>{if(typeof showView==='function')showView('settings');};}
function installSafeToggle(){const b=document.getElementById('toggleProductActive');if(!b)return;b.onclick=async()=>{const p=await getOne('products',currentProductId);if(!p)return;const changed=await toggleProduct(p);if(changed&&typeof openProduct==='function')await openProduct(currentProductId);};}
window.ProductStatusManager={render:renderProductManager,toggle:toggleProduct};window.addEventListener('load',()=>setTimeout(()=>{ensureManager();installSafeToggle();},800));
})();