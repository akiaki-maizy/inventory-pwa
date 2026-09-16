(()=>{
'use strict';
const FEATURES=['jan-scanner.js','case-stock.js','date-wheel.js','location-order.js','location-status.js','product-status.js'];

// Ver.1.27: HTML本体にまだ存在しない商品編集ボタンを、機能ローダー側で補完する。
// Service WorkerがHTML文字列を書き換える責務を少しずつ減らすための互換処理。
if(!document.getElementById('editProductMasterBtn')){
 const detailLocation=document.getElementById('detailLocation');
 if(detailLocation){
  const button=document.createElement('button');
  button.className='ghost';
  button.id='editProductMasterBtn';
  button.style.marginTop='10px';
  button.textContent='商品情報を編集';
  detailLocation.insertAdjacentElement('afterend',button);
 }
}

const loaded=new Set(Array.from(document.scripts).map(s=>new URL(s.src||location.href,location.href).pathname.split('/').pop()));
for(const file of FEATURES){
 if(loaded.has(file))continue;
 const s=document.createElement('script');
 s.src='./'+file;
 s.dataset.inventoryFeature='1';
 document.body.appendChild(s);
}
})();