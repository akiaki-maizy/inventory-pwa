(()=>{
'use strict';

async function orderedLocations(parentId){
  const all=await getAll('locations');
  return all.filter(x=>(x.parentId||null)===(parentId||null))
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.name||'').localeCompare(String(b.name||''),'ja'));
}

async function moveLocation(id,direction){
  const target=await getOne('locations',id);
  if(!target)return;
  const siblings=await orderedLocations(target.parentId||null);
  const index=siblings.findIndex(x=>x.id===id);
  const next=index+direction;
  if(index<0||next<0||next>=siblings.length)return;
  const now=Date.now();
  siblings.forEach((x,i)=>{x.order=now+i;});
  [siblings[index],siblings[next]]=[siblings[next],siblings[index]];
  for(let i=0;i<siblings.length;i++){
    siblings[i].order=now+i;
    await put('locations',siblings[i]);
  }
  if(target.parentId)await window.renderChildLocations();
  else await window.renderLocations();
}

function orderButtons(loc,index,total){
  const wrap=document.createElement('div');
  wrap.className='row';
  wrap.style.marginTop='8px';
  const up=document.createElement('button');
  up.type='button';up.className='ghost';up.textContent='↑ 上へ';up.disabled=index===0;
  up.onclick=()=>moveLocation(loc.id,-1);
  const down=document.createElement('button');
  down.type='button';down.className='ghost';down.textContent='↓ 下へ';down.disabled=index===total-1;
  down.onclick=()=>moveLocation(loc.id,1);
  wrap.append(up,down);
  return wrap;
}

const originalRenderLocations=window.renderLocations;
window.renderLocations=async function(){
  await originalRenderLocations();
  const roots=await orderedLocations(null);
  const box=document.getElementById('locationList');
  if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(roots[i])item.appendChild(orderButtons(roots[i],i,roots.length));});
};

const originalRenderChildLocations=window.renderChildLocations;
window.renderChildLocations=async function(){
  await originalRenderChildLocations();
  if(!window.currentLocationId)return;
  const children=await orderedLocations(window.currentLocationId);
  const box=document.getElementById('childLocationList');
  if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(children[i])item.appendChild(orderButtons(children[i],i,children.length));});
};
})();