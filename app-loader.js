(()=>{
'use strict';
const FEATURES=['jan-scanner.js','case-stock.js','date-wheel.js','location-order.js','location-status.js','product-status.js'];
const loaded=new Set(Array.from(document.scripts).map(s=>new URL(s.src||location.href,location.href).pathname.split('/').pop()));
for(const file of FEATURES){
 if(loaded.has(file))continue;
 const s=document.createElement('script');
 s.src='./'+file;
 s.dataset.inventoryFeature='1';
 document.body.appendChild(s);
}
})();