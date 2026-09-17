(()=>{
'use strict';
const rows=()=>[...document.querySelectorAll('#receiveRows .receive-row')];
function integerValue(input){const raw=String(input?.value??'').trim();if(raw==='')return{valid:true,value:0};const n=Number(raw);return{valid:Number.isInteger(n)&&n>=0,value:n};}
function refresh(){const view=document.getElementById('receiveView');if(!view||view.classList.contains('hidden'))return;let total=0,valid=true;for(const row of rows()){const c=integerValue(row.querySelector('.r-cases')),l=integerValue(row.querySelector('.r-loose')),out=row.querySelector('.row-total');const meta=document.getElementById('receiveProductMeta')?.textContent||'';const m=meta.match(/ケース入数\s*(\d+)個/),pack=m?Math.max(1,Number(m[1])):1;if(!c.valid||!l.valid){valid=false;if(out)out.textContent='入力エラー';}else{const n=c.value*pack+l.value;total+=n;if(out)out.textContent=String(n);}}
const totalEl=document.getElementById('receiveTotal');if(totalEl){totalEl.textContent=valid?`入荷合計 ${total}個`:'入荷合計：ケース・バラは0以上の整数で入力してください';totalEl.dataset.inputValid=valid?'1':'0';}}
document.addEventListener('input',e=>{if(e.target?.matches?.('#receiveRows .r-cases, #receiveRows .r-loose'))queueMicrotask(refresh);},true);
document.addEventListener('click',e=>{if(e.target?.matches?.('#addReceiveRowBtn, #receiveRows .remove-row'))setTimeout(refresh,0);},true);
})();