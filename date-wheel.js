(()=>{
'use strict';
const pad=n=>String(n).padStart(2,'0');
function daysInMonth(y,m){return new Date(y,m,0).getDate();}
function parseValue(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;}
function makeSelect(cls,label){const wrap=document.createElement('div');wrap.style='flex:1;min-width:64px;text-align:center';const cap=document.createElement('div');cap.className='muted';cap.style='font-size:11px;margin-bottom:2px';cap.textContent=label;const s=document.createElement('select');s.className=cls;s.size=3;s.style='width:100%;height:92px;text-align:center;font-size:17px;padding:0;scroll-snap-type:y mandatory';wrap.append(cap,s);return {wrap,s};}
function option(value,text){const o=document.createElement('option');o.value=String(value);o.textContent=text;o.style='padding:3px 2px;scroll-snap-align:center';return o;}
function enhance(input){if(!input||input.dataset.wheelEnhanced)return;input.dataset.wheelEnhanced='1';const parsed=parseValue(input.value),now=new Date(),initial=parsed||{y:now.getFullYear(),m:now.getMonth()+1,d:now.getDate()};input.type='hidden';input.value=`${initial.y}-${pad(initial.m)}-${pad(initial.d)}`;const oldQuick=input.parentElement.querySelector('.dateQuick');if(oldQuick)oldQuick.remove();const oldText=input.parentElement.querySelector('.dateSelectedText');if(oldText)oldText.remove();const box=document.createElement('div');box.className='expiryWheel';box.style='margin-top:4px;padding:5px 6px;border:1px solid #d1d5db;border-radius:8px;background:#fff';const row=document.createElement('div');row.style='display:flex;gap:5px;align-items:flex-start';const yy=makeSelect('wheelYear','年'),mm=makeSelect('wheelMonth','月'),dd=makeSelect('wheelDay','日');row.append(yy.wrap,mm.wrap,dd.wrap);box.appendChild(row);input.insertAdjacentElement('afterend',box);
 const baseYear=now.getFullYear(),start=Math.min(baseYear-1,initial.y),end=Math.max(baseYear+15,initial.y);
 for(let y=start;y<=end;y++)yy.s.append(option(y,pad(y%100)));
 for(let m=1;m<=12;m++)mm.s.append(option(m,pad(m)));
 function fillDays(keep){dd.s.innerHTML='';const y=+yy.s.value||initial.y,m=+mm.s.value||initial.m,max=daysInMonth(y,m);for(let d=1;d<=max;d++)dd.s.append(option(d,pad(d)));dd.s.value=String(Math.min(keep||initial.d,max));}
 function sync(){const y=+yy.s.value,m=+mm.s.value,d=+dd.s.value;if(y&&m&&d)input.value=`${y}-${pad(m)}-${pad(d)}`;input.dispatchEvent(new Event('change',{bubbles:true}));}
 function center(s){const o=s.options[s.selectedIndex];if(o)requestAnimationFrame(()=>o.scrollIntoView({block:'center'}));}
 yy.s.value=String(initial.y);mm.s.value=String(initial.m);fillDays(initial.d);dd.s.value=String(initial.d);
 yy.s.onchange=()=>{const keep=+dd.s.value;fillDays(keep);sync();center(yy.s);};mm.s.onchange=()=>{const keep=+dd.s.value;fillDays(keep);sync();center(mm.s);};dd.s.onchange=()=>{sync();center(dd.s);};
 [yy.s,mm.s,dd.s].forEach(center);sync();
}
function scan(root=document){root.querySelectorAll('input[type="date"],input[data-wheel-enhanced="1"]').forEach(enhance);document.querySelectorAll('.dateQuick,.dateSelectedText').forEach(x=>x.remove());}
function normalizeMultiExpiry(containerId,rowClass,addButtonId){const box=document.getElementById(containerId),add=document.getElementById(addButtonId);if(!box||!add||box.dataset.userAdding==='1')return;const rows=[...box.querySelectorAll(':scope > .'+rowClass)];if(rows.length!==3)return;const untouched=rows.every(r=>[...r.querySelectorAll('.stockCases,.stockLoose')].every(i=>!i.value||Number(i.value)===0));if(!untouched)return;rows.slice(1).forEach(r=>r.remove());}
function normalizeAll(){normalizeMultiExpiry('initialStockRows','initialStockRow','initialAddRow');normalizeMultiExpiry('batchReceiveRows','batchReceiveRow','batchAddRow');}
function init(){
 document.addEventListener('click',e=>{const b=e.target.closest('#initialAddRow,#batchAddRow');if(!b)return;const box=document.getElementById(b.id==='initialAddRow'?'initialStockRows':'batchReceiveRows');if(box){box.dataset.userAdding='1';setTimeout(()=>delete box.dataset.userAdding,50);}},true);
 normalizeAll();scan();
 const obs=new MutationObserver(ms=>{for(const m of ms)for(const node of m.addedNodes)if(node.nodeType===1)scan(node);normalizeAll();});
 obs.observe(document.body,{childList:true,subtree:true});
}
window.addEventListener('load',()=>setTimeout(init,900));
})();