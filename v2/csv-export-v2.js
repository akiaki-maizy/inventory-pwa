(()=>{
'use strict';

const HEADERS=['店舗','商品ID','JANコード','商品名','規格','仕入先','参考単価','保管場所','棚・区画','数量','賞味期限'];
const REPORT_HEADERS=[
  '店舗','大分類','中分類','小分類','商品名','規格','JANコード',
  '総数量(個)','ケース数','バラ数','数量表示',
  '保管場所別内訳','ロット数','ロット内訳','期限区分'
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

function safeFilename(v){return String(v||'店舗').replace(/[\\/:*?"<>|]/g,'_');}
function localStamp(){const d=new Date();return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');}

function locationParts(locationId,locMap){
  const loc=locMap.get(locationId);
  if(!loc)return['',''];
  if(loc.parentId){const parent=locMap.get(loc.parentId);return[parent?.name||'',loc.name||''];}
  return[loc.name||'',''];
}
function locationPath(locationId,locMap){
  const[a,b]=locationParts(locationId,locMap);
  return b?a+' ＞ '+b:a||'保管場所不明';
}

function categoryParts(categoryId,catMap){
  if(!categoryId)return['','',''];
  const chain=[],seen=new Set();let cur=catMap.get(categoryId);
  while(cur&&!seen.has(cur.id)&&chain.length<3){seen.add(cur.id);chain.unshift(cur);cur=cur.parentId?catMap.get(cur.parentId):null;}
  return[chain[0]?.name||'',chain[1]?.name||'',chain[2]?.name||''];
}

function qtyParts(qty,casePack){
  const q=Math.max(0,Number(qty)||0),pack=Math.max(1,Number(casePack)||1);
  if(pack<=1)return{cases:0,loose:q,text:`${q}個`};
  const cases=Math.floor(q/pack),loose=q%pack;
  return{cases,loose,text:`${cases}ケース＋${loose}バラ（計${q}個）`};
}

function locationSummary(productLots,casePack,locMap){
  const map=new Map();
  for(const lot of productLots.filter(l=>Number(l.qty||0)>0))map.set(lot.locationId,(map.get(lot.locationId)||0)+Number(lot.qty||0));
  return[...map.entries()].sort((a,b)=>locationPath(a[0],locMap).localeCompare(locationPath(b[0],locMap),'ja')).map(([id,qty])=>`${locationPath(id,locMap)}：${qtyParts(qty,casePack).text}`).join(' / ');
}

function lotSummary(productLots,casePack,expiryManaged=true){
  const positive=productLots.filter(l=>Number(l.qty||0)>0),byExpiry=new Map();
  for(const lot of positive){
    const label=lot.expiry|| (expiryManaged===false?'期限なし':'期限未設定');
    byExpiry.set(label,(byExpiry.get(label)||0)+Number(lot.qty||0));
  }
  const keys=[...byExpiry.keys()].sort((a,b)=>{
    const special=x=>x==='期限なし'||x==='期限未設定';
    if(special(a)&&!special(b))return 1;if(!special(a)&&special(b))return-1;return a.localeCompare(b);
  });
  return{lotCount:positive.length,detail:keys.map(k=>`${k}：${qtyParts(byExpiry.get(k),casePack).text}`).join(' / ')};
}

async function buildRows(){
  const[products,lots,locations,storeName]=await Promise.all([InventoryDB.getAll('products'),InventoryDB.getAll('lots'),InventoryDB.getAll('locations'),setting('storeName')]);
  const locMap=new Map(locations.map(x=>[x.id,x])),productMap=new Map(products.map(x=>[x.id,x])),rows=[];
  for(const lot of lots){
    const qty=Number(lot.qty||0);if(qty<=0)continue;
    const p=productMap.get(lot.productId);if(!p)continue;
    const[root,shelf]=locationParts(lot.locationId||p.locationId,locMap);
    rows.push([storeName,p.id,p.jan||'',p.name||'',p.spec||'',p.supplier||'',p.unitPrice??'',root,shelf,qty,lot.expiry||'']);
  }
  rows.sort((a,b)=>String(a[7]).localeCompare(String(b[7]),'ja')||String(a[8]).localeCompare(String(b[8]),'ja')||String(a[3]).localeCompare(String(b[3]),'ja')||String(a[10]).localeCompare(String(b[10])));
  return rows;
}

async function buildReportRows(){
  const[products,lots,locations,categories,storeName]=await Promise.all([InventoryDB.getAll('products'),InventoryDB.getAll('lots'),InventoryDB.getAll('locations'),InventoryDB.getAll('categories'),setting('storeName')]);
  const locMap=new Map(locations.map(x=>[x.id,x])),catMap=new Map(categories.map(x=>[x.id,x])),lotsByProduct=new Map();
  for(const lot of lots){if(Number(lot.qty||0)<=0)continue;if(!lotsByProduct.has(lot.productId))lotsByProduct.set(lot.productId,[]);lotsByProduct.get(lot.productId).push(lot);}
  const rows=[];
  for(const p of products.filter(x=>x.active!==false)){
    const productLots=lotsByProduct.get(p.id)||[],total=productLots.reduce((sum,l)=>sum+Number(l.qty||0),0),pack=Math.max(1,Number(p.casePack)||1),q=qtyParts(total,pack),[c1,c2,c3]=categoryParts(p.categoryId,catMap),lot=lotSummary(productLots,pack,p.expiryManaged!==false),expiryType=p.expiryManaged===false?'期限なし':productLots.some(l=>!l.expiry)?'期限未設定あり':'期限管理あり';
    rows.push([storeName,c1,c2,c3,p.name||'',p.spec||'',p.jan||'',total,q.cases,q.loose,q.text,locationSummary(productLots,pack,locMap),lot.lotCount,lot.detail,expiryType]);
  }
  rows.sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'ja')||String(a[2]).localeCompare(String(b[2]),'ja')||String(a[3]).localeCompare(String(b[3]),'ja')||String(a[4]).localeCompare(String(b[4]),'ja')||String(a[5]).localeCompare(String(b[5]),'ja'));
  return rows;
}

function toCSV(rows){return '\ufeff'+[HEADERS,...rows].map(r=>r.map(csv).join(',')).join('\r\n');}
function toReportCSV(rows){return '\ufeff'+[REPORT_HEADERS,...rows].map(r=>r.map(csv).join(',')).join('\r\n');}
function download(name,text){const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function exportCSV(){const rows=await buildRows(),text=toCSV(rows),store=await setting('storeName');download(`在庫_${safeFilename(store)}_${localStamp()}.csv`,text);return{rows:rows.length,text};}
async function exportReportCSV(){const rows=await buildReportRows(),text=toReportCSV(rows),store=await setting('storeName');download(`棚卸報告_${safeFilename(store)}_${localStamp()}.csv`,text);return{rows:rows.length,text};}

window.InventoryCSV={
  HEADERS,REPORT_HEADERS,OP_HEADERS:REPORT_HEADERS,
  buildRows,buildReportRows,buildOperationRows:buildReportRows,
  toCSV,toReportCSV,toOperationCSV:toReportCSV,
  exportCSV,exportReportCSV,exportOperationCSV:exportReportCSV,
  qtyParts,lotSummary,locationSummary
};
})();