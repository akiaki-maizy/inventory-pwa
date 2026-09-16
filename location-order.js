(()=>{
'use strict';
let activeParentId=null;

async function orderedLocations(parentId){
  const all=await getAll('locations');
  return all.filter(x=>(x.parentId||null)===(parentId||null))
    .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.name||'').localeCompare(String(b.name||''),'ja'));
}

async function moveLocation(id,direction){
  const target=await getOne('locations',id);
  if(!target)return;
  const siblings=await orderedLocations(target.parentId||null);
  const index=siblings.findIndex(x=>x.id===id),next=index+direction;
  if(index<0||next<0||next>=siblings.length)return;
  [siblings[index],siblings[next]]=[siblings[next],siblings[index]];
  const base=Date.now();
  for(let i=0;i<siblings.length;i++){
    siblings[i].order=base+i;
    await put('locations',siblings[i]);
  }
  if(target.parentId)await window.renderChildLocations();
  else await window.renderLocations();
}

function orderButtons(loc,index,total){
  const wrap=document.createElement('div');wrap.className='row';wrap.style.marginTop='8px';
  const up=document.createElement('button');up.type='button';up.className='ghost';up.textContent='↑ 上へ';up.disabled=index===0;up.onclick=()=>moveLocation(loc.id,-1);
  const down=document.createElement('button');down.type='button';down.className='ghost';down.textContent='↓ 下へ';down.disabled=index===total-1;down.onclick=()=>moveLocation(loc.id,1);
  wrap.append(up,down);return wrap;
}

const originalOpenLocation=window.openLocation;
window.openLocation=async function(id){activeParentId=id;return originalOpenLocation(id);};

const originalRenderLocations=window.renderLocations;
window.renderLocations=async function(){
  await originalRenderLocations();
  const roots=await orderedLocations(null),box=document.getElementById('locationList');if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(roots[i])item.appendChild(orderButtons(roots[i],i,roots.length));});
};

const originalRenderChildLocations=window.renderChildLocations;
window.renderChildLocations=async function(){
  await originalRenderChildLocations();
  if(!activeParentId)return;
  const children=await orderedLocations(activeParentId),box=document.getElementById('childLocationList');if(!box)return;
  const items=[...box.querySelectorAll(':scope > .item')];
  items.forEach((item,i)=>{if(children[i])item.appendChild(orderButtons(children[i],i,children.length));});
};
})();