(()=>{
'use strict';
let currentParentId=null;
async function dependencies(loc){
 const [locations,products,lots]=await Promise.all([getAll('locations'),getAll('products'),getAll('lots')]);
 const children=locations.filter(x=>x.parentId===loc.id&&x.active!==false);
 const productsHere=products.filter(p=>p.rootLocationId===loc.id||p.childLocationId===loc.id||p.locationId===loc.id||p.rootLocation===loc.id||p.childLocation===loc.id);
 const activeProducts=productsHere.filter(p=>p.active!==false);
 const stockedProducts=productsHere.filter(p=>lots.some(l=>l.productId===p.id&&Number(l.qty)>0));
 return {children,productsHere,activeProducts,stockedProducts};
}
async function toggleLocation(loc){
 if(loc.active===false){loc.active=true;await put('locations',loc);return refreshAll(loc.parentId);}
 const dep=await dependencies(loc);
 if(dep.stockedProducts.length){alert(`この場所には在庫が残っている商品が${dep.stockedProducts.length}件あります。\n在庫を0にしてから使用停止してください。`);return;}
 if(dep.activeProducts.length){alert(`この場所には使用中の商品が${dep.activeProducts.length}件登録されています。\n商品を使用停止するか、別の場所へ変更してから保管場所を使用停止してください。`);return;}
 if(!loc.parentId&&dep.children.length){alert(`この保管場所には使用中の棚・区画が${dep.children.length}件あります。\n先に棚・区画を使用停止してください。`);return;}
 if(!confirm(`「${loc.name}」を使用停止しますか？\n通常の選択肢やホームから非表示になります。商品・履歴データは削除しません。`))return;
 loc.active=false;await put('locations',loc);await refreshAll(loc.parentId);
}
async function refreshAll(parentId){if(parentId&&typeof window.renderChildLocations==='function')await window.renderChildLocations();else if(typeof window.renderLocations==='function')await window.renderLocations();if(typeof window.renderHome==='function')await window.renderHome();if(window.InventoryLocationSort&&typeof window.InventoryLocationSort.render==='function')await window.InventoryLocationSort.render();}
function statusButton(loc){const b=document.createElement('button');b.type='button';b.className=loc.active===false?'secondary':'ghost';b.style.marginTop='8px';b.style.width='100%';b.textContent=loc.active===false?'使用を再開':'使用停止';b.onclick=e=>{e.stopPropagation();toggleLocation(loc);};return b;}
async function decorateRoots(){const box=document.getElementById('locationList');if(!box)return;const roots=(await getAll('locations')).filter(x=>!x.parentId).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));const items=[...box.querySelectorAll(':scope > .item')];items.forEach((item,i)=>{const loc=roots[i];if(loc&&!item.querySelector('.locationStatusControl')){const w=document.createElement('div');w.className='locationStatusControl';w.appendChild(statusButton(loc));item.appendChild(w);}});}
async function decorateChildren(){const box=document.getElementById('childLocationList');if(!box||!currentParentId)return;const children=(await getAll('locations')).filter(x=>x.parentId===currentParentId).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));const items=[...box.querySelectorAll(':scope > .item')];items.forEach((item,i)=>{const loc=children[i];if(loc&&!item.querySelector('.locationStatusControl')){const w=document.createElement('div');w.className='locationStatusControl';w.appendChild(statusButton(loc));item.appendChild(w);}});}
const oldOpen=window.openLocation;if(typeof oldOpen==='function')window.openLocation=async function(id){currentParentId=id;const r=await oldOpen(id);setTimeout(decorateChildren,0);return r;};
const oldRoots=window.renderLocations;if(typeof oldRoots==='function')window.renderLocations=async function(){const r=await oldRoots();await decorateRoots();return r;};
const oldChildren=window.renderChildLocations;if(typeof oldChildren==='function')window.renderChildLocations=async function(){const r=await oldChildren();await decorateChildren();return r;};
window.addEventListener('load',()=>setTimeout(decorateRoots,700));
})();