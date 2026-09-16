(()=>{
'use strict';
const pad=n=>String(n).padStart(2,'0');
function daysInMonth(y,m){return new Date(y,m,0).getDate();}
function parseValue(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],m:+m[2],d:+m[3]}:null;}
function makeSelect(cls,label){const wrap=document.createElement('div');wrap.style='flex:1;min-width:76px;text-align:center';const cap=document.createElement('div');cap.className='muted';cap.style='font-size:12px;margin-bottom:4px';cap.textContent=label;const s=document.createElement('select');s.className=cls;s.size=5;s.style='width:100%;height:154px;text-align:center;font-size:18px;padding:0;scroll-snap-type:y mandatory';wrap.append(cap,s);return {wrap,s};}
function option(value,text){const o=document.createElement('option');o.value=String(value);o.textContent=text;o.style='padding:6px 2px;scroll-snap-align:center';return o;}
function enhance(input){if(!input||input.dataset.wheelEnhanced)return;input.dataset.wheelEnhanced='1';input.type='hidden';const oldQuick=input.parentElement.querySelector('.dateQuick');if(oldQuick)oldQuick.remove();const oldText=input.parentElement.querySelector('.dateSelectedText');if(oldText)oldText.remove();const box=document.createElement('div');box.className='expiryWheel';box.style='margin-top:6px;padding:8px;border:1px solid #d1d5db;border-radius:10px;background:#fff';const row=document.createElement('div');row.style='display:flex;gap:8px;align-items:flex-start';const yy=makeSelect('wheelYear','年'),mm=makeSelect('wheelMonth','月'),dd=makeSelect('wheelDay','日');row.append(yy.wrap,mm.wrap,dd.wrap);box.appendChild(row);const note=document.createElement('div');note.className='muted';note.style='text-align:center;margin-top:6px;font-size:12px';note.textContent='年・月・日を上下にスクロールして選択';box.appendChild(note);input.insertAdjacentElement('afterend',box);
 const now=new Date(),baseYear=now.getFullYear(),parsed=parseValue(input.value),start=Math.min(baseYear-1,parsed?parsed.y:baseYear),end=Math.max(baseYear+15,parsed?parsed.y:baseYear+15);
 yy.s.append(option('','--'));for(let y=start;y<=end;y++)yy.s.append(option(y,pad(y%100)));
 mm.s.append(option('','--'));for(let m=1;m<=12;m++)mm.s.append(option(m,pad(m)));
 function fillDays(keep){dd.s.innerHTML='';dd.s.append(option('','--'));const y=+yy.s.value||baseYear,m=+mm.s.value||1,max=daysInMonth(y,m);for(let d=1;d<=max;d++)dd.s.append(option(d,pad(d)));if(keep&&keep<=max)dd.s.value=String(keep);}
 function sync(){const y=+yy.s.value,m=+mm.s.value,d=+dd.s.value;if(y&&m&&d){input.value=`${y}-${pad(m)}-${pad(d)}`;}else input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}
 function center(s){const o=s.options[s.selectedIndex];if(o)requestAnimationFrame(()=>o.scrollIntoView({block:'center'}));}
 yy.s.onchange=()=>{const keep=+dd.s.value;fillDays(keep);sync();center(yy.s);};mm.s.onchange=()=>{const keep=+dd.s.value;fillDays(keep);sync();center(mm.s);};dd.s.onchange=()=>{sync();center(dd.s);};
 if(parsed){yy.s.value=String(parsed.y);mm.s.value=String(parsed.m);fillDays(parsed.d);dd.s.value=String(parsed.d);}else fillDays();
 [yy.s,mm.s,dd.s].forEach(center);
}
function scan(root=document){root.querySelectorAll('input[type="date"],input[data-wheel-enhanced="1"]').forEach(enhance);document.querySelectorAll('.dateQuick,.dateSelectedText').forEach(x=>x.remove());}
function init(){scan();const obs=new MutationObserver(ms=>{for(const m of ms)for(const node of m.addedNodes)if(node.nodeType===1)scan(node);});obs.observe(document.body,{childList:true,subtree:true});const sub=document.querySelector('header .sub');if(sub)sub.textContent='MVP Ver.1.12 / 賞味期限ロール選択 / 端末内保存';}
window.addEventListener('load',()=>setTimeout(init,900));
})();