(()=>{
'use strict';
const FEATURES=['jan-scanner.js','case-stock.js','date-wheel.js','location-order.js','location-status.js','product-status.js'];

// Ver.1.27 recovery: 商品編集ボタンの生成は、既存のindex.html初期化完了後に行う。
// index.htmlの旧コードはこのボタンを直接参照するため、先に作ると初期化途中で
// 旧ハンドラが結び付いて起動を止める可能性がある。機能JS側が必要な時点で補完する。
const ensureEditButton=()=>{
 if(document.getElementById('editProductMasterBtn'))return;
 const detailLocation=document.getElementById('detailLocation');
 if(!detailLocation)return;
 const button=document.createElement('button');
 button.className='ghost';
 button.id='editProductMasterBtn';
 button.style.marginTop='10px';
 button.textContent='商品情報を編集';
 detailLocation.insertAdjacentElement('afterend',button);
};

// 旧index.htmlの同期初期化を先に完了させてから互換UIと機能JSを読み込む。
setTimeout(()=>{
 ensureEditButton();
 const loaded=new Set(Array.from(document.scripts).map(s=>new URL(s.src||location.href,location.href).pathname.split('/').pop()));
 for(const file of FEATURES){
  if(loaded.has(file))continue;
  const s=document.createElement('script');
  s.src='./'+file;
  s.dataset.inventoryFeature='1';
  document.body.appendChild(s);
 }
},0);
})();