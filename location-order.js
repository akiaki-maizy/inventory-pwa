(()=>{
'use strict';
let activeParentId=null;

function sortLocations(a,b){
  return (Number(a.order)||0)-(Number(b.order)||0)||String(a.name||'').localeCompare(String(b.name||''),'ja');
}
async function orderedLocations(parentId){
  const all=await getAll('locations');
  return all.filter(x=>(x.parentId||null)===(parentId||null)).sort(sortLocations);
}
async function moveLocation(id,direction){
  const target=await getOne('locations',id);if(!target)return;
  const siblings=await orderedLocations(target.parentId||null);
  const index=siblings.findIndex(x=>x.id===id),next=index+direction;
  if(index<0||next<0||next>=siblings.length)return;
  [siblings[index],siblings[next]]=[siblings[next],siblings[index]];
  for(let i=0;i<siblings.length;i++){
    siblings[i].order=(i+1)*1000;
    await put('locations',siblings[i]);
  }
  if(target.parentId){if(typeof window.renderChildLocations==='function')await window.renderChildLocations();}
  else{if(typeof window.renderLocations==='function')await window.renderLocations();}
  if(typeof window.renderHome==='function')await window.renderHome();
  await reorderHomeButtons();
}
function orderButtons(loc,index,total){
  const wrap=document.createElement('div');wrap.className='row locationOrderControls';wrap.style.marginTop='8px';
  const up=document.createElement('button');up.type='button';up.className='ghost';up.textContent='↑ 上へ';up.disabled=index===0;up.onclick=()=>moveLocation(loc.id,-1);
  const down=document.createElement('button');down.type='button';down.className='ghost';down.textContent='↓ 下へ';down.disabled=index===total-1;down.onclick=()=>moveLocation(loc.id,1);
  wrap.append(up,down);return wrap;
}
async function reorderHomeButtons(){
  const box=document.getElementById('homeLocationList');if(!box)return;
  const roots=(await orderedLocations(null)).filter(x=>x.active!==false);
  const buttons=[...box.children];
  roots.forEach(loc=>{
    const button=buttons.find(b=>String(b.textContent||'').trim()===String(loc.name||'').trim());
    if(button)box.appendChild(button);
  });
}
const originalOpenLocation=window.openLocation;
if(typeof originalOpenLocation==='function')window.openLocation=async function(id){activeParentId=id;return originalOpenLocation(id);};
const originalRenderLocations=window.renderLocations;
if(typeof originalRenderLocations==='function')window.renderLocations=async function(){
  await originalRenderLocations();
  const roots=await orderedLocations(null),box=document.getElementById('locationList');if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(roots[i]&&!item.querySelector('.locationOrderControls'))item.appendChild(orderButtons(roots[i],i,roots.length));});
};
const originalRenderChildLocations=window.renderChildLocations;
if(typeof originalRenderChildLocations==='function')window.renderChildLocations=async function(){
  await originalRenderChildLocations();
  if(!activeParentId)return;
  const children=await orderedLocations(activeParentId),box=document.getElementById('childLocationList');if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(children[i]&&!item.querySelector('.locationOrderControls'))item.appendChild(orderButtons(children[i],i,children.length));});
};
const originalRenderHome=window.renderHome;
if(typeof originalRenderHome==='function')window.renderHome=async function(){const result=await originalRenderHome();await reorderHomeButtons();return result;};
window.InventoryLocationOrder={move:moveLocation,refresh:reorderHomeButtons};
window.addEventListener('load',()=>setTimeout(reorderHomeButtons,500));
})();