(()=>{
'use strict';

const HEADERS=['店舗','商品ID','JANコード','商品名','規格','仕入先','参考単価','保管場所','棚・区画','数量','賞味期限'];
const OP_HEADERS=[
  '店舗','大分類','中分類','小分類','商品ID','JANコード','商品名','規格','仕入先',
  '保管場所','棚・区画','ケース入数','現在庫(個)','ケース数','バラ数','在庫表示',
  'ロット数','最短賞味期限','期限別在庫内訳','参考単価','参考在庫金額',
  '棚卸実数(ケース)','棚卸実数(バラ)','注文数(ケース)','注文数(バラ)','メモ'
];

const csv=v=>{
  let s=String(v??'');
  if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
};

async function setting(key){
  const x=await InventoryDB.get('settings',key);
  return x?.value??'';
}

function safeFilename(v){
  return String(v||'店舗').replace(/[\\/:*?"<>|]/g,'_');
}

function localStamp(){
  const d=new Date();
  return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
}

function locationParts(locationId,locMap){
  const loc=locMap.get(locationId);
  if(!loc)return['',''];
  if(loc.parentId){
    const parent=locMap.get(loc.parentId);
    return[parent?.name||'',loc.name||''];
  }
  return[loc.name||'',''];
}

function categoryParts(categoryId,catMap){
  if(!categoryId)return['','',''];
  const chain=[],seen=new Set();
  let cur=catMap.get(categoryId);
  while(cur&&!seen.has(cur.id)&&chain.length<3){
    seen.add(cur.id);
    chain.unshift(cur);
    cur=cur.parentId?catMap.get(cur.parentId):null;
  }
  return[chain[0]?.name||'',chain[1]?.name||'',chain[2]?.name||''];
}

function qtyParts(qty,casePack){
  const q=Math.max(0,Number(qty)||0),pack=Math.max(1,Number(casePack)||1);
  if(pack<=1)return{cases:0,loose:q,text:`${q}個`};
  const cases=Math.floor(q/pack),loose=q%pack;
  return{cases,loose,text:`${cases}ケース＋${loose}バラ（計${q}個）`};
}

function expirySummary(productLots,casePack){
  const positive=productLots.filter(l=>Number(l.qty||0)>0);
  const dated=positive.map(l=>l.expiry).filter(Boolean).sort();
  const byExpiry=new Map();
  for(const lot of positive){
    const key=lot.expiry||'期限なし';
    byExpiry.set(key,(byExpiry.get(key)||0)+Number(lot.qty||0));
  }
  const keys=[...byExpiry.keys()].sort((a,b)=>{
    if(a==='期限なし')return 1;
    if(b==='期限なし')return-1;
    return a.localeCompare(b);
  });
  return{
    lotCount:positive.length,
    earliest:dated[0]||(positive.length?'期限なし':''),
    detail:keys.map(k=>`${k}：${qtyParts(byExpiry.get(k),casePack).text}`).join(' / ')
  };
}

async function buildRows(){
  const[products,lots,locations,storeName]=await Promise.all([
    InventoryDB.getAll('products'),
    InventoryDB.getAll('lots'),
    InventoryDB.getAll('locations'),
    setting('storeName')
  ]);
  const locMap=new Map(locations.map(x=>[x.id,x]));
  const productMap=new Map(products.map(x=>[x.id,x]));
  const rows=[];
  for(const lot of lots){
    const qty=Number(lot.qty||0);
    if(qty<=0)continue;
    const p=productMap.get(lot.productId);
    if(!p)continue;
    const[root,shelf]=locationParts(lot.locationId||p.locationId,locMap);
    rows.push([storeName,p.id,p.jan||'',p.name||'',p.spec||'',p.supplier||'',p.unitPrice??'',root,shelf,qty,lot.expiry||'']);
  }
  rows.sort((a,b)=>String(a[7]).localeCompare(String(b[7]),'ja')||String(a[8]).localeCompare(String(b[8]),'ja')||String(a[3]).localeCompare(String(b[3]),'ja')||String(a[10]).localeCompare(String(b[10])));
  return rows;
}

async function buildOperationRows(){
  const[products,lots,locations,categories,storeName]=await Promise.all([
    InventoryDB.getAll('products'),
    InventoryDB.getAll('lots'),
    InventoryDB.getAll('locations'),
    InventoryDB.getAll('categories'),
    setting('storeName')
  ]);
  const locMap=new Map(locations.map(x=>[x.id,x]));
  const catMap=new Map(categories.map(x=>[x.id,x]));
  const lotsByProduct=new Map();
  for(const lot of lots){
    if(Number(lot.qty||0)<=0)continue;
    if(!lotsByProduct.has(lot.productId))lotsByProduct.set(lot.productId,[]);
    lotsByProduct.get(lot.productId).push(lot);
  }

  const rows=[];
  for(const p of products.filter(x=>x.active!==false)){
    const productLots=lotsByProduct.get(p.id)||[];
    const total=productLots.reduce((sum,l)=>sum+Number(l.qty||0),0);
    const pack=Math.max(1,Number(p.casePack)||1);
    const q=qtyParts(total,pack);
    const[root,shelf]=locationParts(p.locationId,locMap);
    const[c1,c2,c3]=categoryParts(p.categoryId,catMap);
    const expiry=expirySummary(productLots,pack);
    const unitPrice=Number(p.unitPrice);
    const stockValue=Number.isFinite(unitPrice)&&unitPrice!==0?Math.round(total*unitPrice):'';
    rows.push([
      storeName,c1,c2,c3,p.id,p.jan||'',p.name||'',p.spec||'',p.supplier||'',
      root,shelf,pack,total,q.cases,q.loose,q.text,
      expiry.lotCount,expiry.earliest,expiry.detail,
      Number.isFinite(unitPrice)&&unitPrice!==0?unitPrice:'',stockValue,
      '','','','',''
    ]);
  }

  rows.sort((a,b)=>
    String(a[1]).localeCompare(String(b[1]),'ja')||
    String(a[2]).localeCompare(String(b[2]),'ja')||
    String(a[3]).localeCompare(String(b[3]),'ja')||
    String(a[9]).localeCompare(String(b[9]),'ja')||
    String(a[10]).localeCompare(String(b[10]),'ja')||
    String(a[6]).localeCompare(String(b[6]),'ja')
  );
  return rows;
}

function toCSV(rows){
  return '\ufeff'+[HEADERS,...rows].map(r=>r.map(csv).join(',')).join('\r\n');
}

function toOperationCSV(rows){
  return '\ufeff'+[OP_HEADERS,...rows].map(r=>r.map(csv).join(',')).join('\r\n');
}

function download(name,text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function exportCSV(){
  const rows=await buildRows(),text=toCSV(rows),store=await setting('storeName');
  download(`在庫_${safeFilename(store)}_${localStamp()}.csv`,text);
  return{rows:rows.length,text};
}

async function exportOperationCSV(){
  const rows=await buildOperationRows(),text=toOperationCSV(rows),store=await setting('storeName');
  download(`棚卸注文_${safeFilename(store)}_${localStamp()}.csv`,text);
  return{rows:rows.length,text};
}

window.InventoryCSV={
  HEADERS,OP_HEADERS,
  buildRows,buildOperationRows,
  toCSV,toOperationCSV,
  exportCSV,exportOperationCSV,
  qtyParts,expirySummary
};
})();