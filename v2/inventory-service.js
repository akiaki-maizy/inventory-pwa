(()=>{
'use strict';
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2);
const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
function intQty(v,label='数量'){const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error(`${label}は0以上の整数で指定してください`);return n;}
function formatQty(qty,casePack){const q=Math.max(0,Math.floor(Number(qty)||0)),pack=Math.max(1,Math.floor(Number(casePack)||1));if(pack<=1)return `${q}個`;const cases=Math.floor(q/pack),loose=q%pack;return `${cases}ケース＋${loose}バラ（計${q}個）`;}
function expiryKey(l){return l.expiry||'9999-12-31';}
function activeLocation(locations,id){const loc=locations.find(x=>x.id===id);if(!loc)throw new Error('保管場所が見つかりません');if(loc.active===false)throw new Error('使用停止中の保管場所は指定できません');if(loc.parentId){const parent=locations.find(x=>x.id===loc.parentId);if(parent?.active===false)throw new Error('親の保管場所が使用停止中です');}return loc;}
async function mutate(productId,handler){
 const d=await InventoryDB.open();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(['settings','products','lots','transactions','locations'],'readwrite'),products=tx.objectStore('products'),lots=tx.objectStore('lots'),transactions=tx.objectStore('transactions'),settings=tx.objectStore('settings'),locations=tx.objectStore('locations');
  let result,finished=false;
  const fail=e=>{if(finished)return;finished=true;try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};
  const reqs={session:settings.get('workSession'),product:products.get(productId),lots:lots.getAll(),store:settings.get('storeName'),locations:locations.getAll()},out={},keys=Object.keys(reqs);let pending=keys.length;
  const finish=()=>{if(--pending>0||finished)return;try{
   const product=out.product;if(!product)throw new Error('商品が見つかりません');
   const productLots=(out.lots||[]).filter(x=>x.productId===productId),session=out.session?.value||null,storeName=out.store?.value||'';
   if(session?.resultExportedAt)throw new Error('共同作業結果を作成済みのため、在庫は変更できません');
   const ctx={product,productLots,lots,transactions,locations:out.locations||[],session,storeName,addHistory(data){transactions.put({id:uid(),timestamp:new Date().toISOString(),productId,lotId:data.lotId||null,locationId:data.locationId??product.locationId??null,type:data.type,qty:Number(data.qty)||0,balance:data.balance??null,reason:data.reason??null,note:data.note??null,unitPrice:null,storeName,fromLocationId:data.fromLocationId??null,toLocationId:data.toLocationId??null,movedQty:data.movedQty??null});}};
   result=handler(ctx);
  }catch(e){fail(e);}};
  for(const k of keys){reqs[k].onsuccess=()=>{out[k]=reqs[k].result;finish();};reqs[k].onerror=()=>fail(reqs[k].error||new Error('在庫更新の事前読込に失敗しました'));}
  tx.oncomplete=()=>{if(!finished){finished=true;resolve(result);}};
  tx.onerror=()=>fail(tx.error||new Error('在庫更新に失敗しました'));
  tx.onabort=()=>{if(!finished){finished=true;reject(tx.error||new Error('在庫更新が中断されました'));}};
 });
}
function scopeAllows(session,locationId){return !session?.job||new Set(session.job.scopeIds||[]).has(locationId);}
async function receive(productId,rows,locationId=null){
 if(!Array.isArray(rows)||!rows.length)throw new Error('入荷内容がありません');
 const raw=rows.map((r,i)=>({qty:intQty(r.qty,`${i+1}行目の数量`),expiry:r.expiry||null})).filter(r=>r.qty>0);
 if(!raw.length)throw new Error('入荷数量がありません');
 return mutate(productId,ctx=>{
  const dest=locationId||ctx.product.locationId;if(!dest)throw new Error('入荷先の保管場所を選択してください');activeLocation(ctx.locations,dest);if(!scopeAllows(ctx.session,dest))throw new Error('共同作業の担当範囲外には入荷できません');
  const managed=ctx.product.expiryManaged!==false,clean=raw.map(r=>({qty:r.qty,expiry:managed?r.expiry:null}));
  if(managed&&clean.some(r=>!r.expiry))throw new Error('賞味期限管理商品の入荷には賞味期限が必要です');
  let balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0);
  for(const row of clean){const lot={id:uid(),productId,locationId:dest,qty:row.qty,expiry:row.expiry,receivedAt:today()};ctx.lots.put(lot);balance+=row.qty;ctx.addHistory({lotId:lot.id,locationId:dest,type:'入荷',qty:row.qty,balance,note:row.expiry?`賞味期限 ${row.expiry}`:'期限なし'});}
  return{balance,locationId:dest};
 });
}
async function useFEFO(productId,qty,locationId=null){
 qty=intQty(qty);if(qty<=0)throw new Error('使用数量は1以上で指定してください');
 return mutate(productId,ctx=>{
  let active=ctx.productLots.filter(l=>(Number(l.qty)||0)>0);
  const locs=[...new Set(active.map(l=>l.locationId).filter(Boolean))];
  const source=locationId||(locs.length===1?locs[0]:null);if(!source)throw new Error('使用する保管場所を選択してください');
  active=active.filter(l=>l.locationId===source).sort((a,b)=>expiryKey(a).localeCompare(expiryKey(b))||String(a.receivedAt||'').localeCompare(String(b.receivedAt||'')));
  const total=active.reduce((s,l)=>s+Number(l.qty),0);if(total<qty)throw new Error(`在庫不足です（この場所の在庫 ${total} / 使用 ${qty}）`);
  let remaining=qty,productBalance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0);
  for(const lot of active){if(!remaining)break;const take=Math.min(Number(lot.qty),remaining),after=Number(lot.qty)-take;if(after===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:after});remaining-=take;productBalance-=take;ctx.addHistory({lotId:lot.id,locationId:source,type:'使用',qty:-take,balance:productBalance,note:lot.expiry?`賞味期限 ${lot.expiry}`:'期限なし'});}
  return{balance:productBalance,locationId:source};
 });
}
async function discard(productId,lotId,qty,reason,note=''){qty=intQty(qty);if(qty<=0)throw new Error('廃棄数量は1以上で指定してください');return mutate(productId,ctx=>{const lot=ctx.productLots.find(x=>x.id===lotId);if(!lot)throw new Error('対象ロットが見つかりません');if(Number(lot.qty)<qty)throw new Error(`廃棄数量が在庫を超えています（${lot.qty}個）`);const after=Number(lot.qty)-qty;if(after===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:after});const balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0)-qty;ctx.addHistory({lotId,locationId:lot.locationId,type:'廃棄',qty:-qty,balance,reason:reason||'その他',note});return{balance};});}
async function setLotQty(productId,lotId,target){target=intQty(target,'棚卸数量');return mutate(productId,ctx=>{const lot=ctx.productLots.find(x=>x.id===lotId);if(!lot)throw new Error('対象ロットが見つかりません');const before=Number(lot.qty)||0,diff=target-before;if(!diff)return{balance:ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0),diff:0};if(target===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:target});const balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0)+diff;ctx.addHistory({lotId,locationId:lot.locationId,type:'期限別棚卸',qty:diff,balance,note:lot.expiry?`賞味期限 ${lot.expiry}`:(ctx.product.expiryManaged===false?'期限なし':'期限未設定')});return{balance,diff};});}
async function setLotExpiry(productId,lotId,expiry){const next=expiry||null;return mutate(productId,ctx=>{if(ctx.product.expiryManaged===false&&next)throw new Error('賞味期限管理なしの商品には期限を設定できません');const lot=ctx.productLots.find(x=>x.id===lotId);if(!lot)throw new Error('対象ロットが見つかりません');const before=lot.expiry||null;if(before===next)return{before,expiry:next};ctx.lots.put({...lot,expiry:next});const balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0);ctx.addHistory({lotId,locationId:lot.locationId,type:'賞味期限訂正',qty:0,balance,note:`${before||'期限なし'} → ${next||'期限なし'}`});return{before,expiry:next};});}
async function transfer(productId,fromLocationId,toLocationId,qty){
 qty=intQty(qty,'移動数量');if(qty<=0)throw new Error('移動数量は1以上で指定してください');if(!fromLocationId||!toLocationId||fromLocationId===toLocationId)throw new Error('異なる移動元・移動先を指定してください');
 return mutate(productId,ctx=>{
  if(ctx.session)throw new Error('共同作業中は在庫移動できません。メイン機で共同作業終了後に行ってください');
  activeLocation(ctx.locations,fromLocationId);activeLocation(ctx.locations,toLocationId);
  const source=ctx.productLots.filter(l=>l.locationId===fromLocationId&&(Number(l.qty)||0)>0).sort((a,b)=>expiryKey(a).localeCompare(expiryKey(b))||String(a.receivedAt||'').localeCompare(String(b.receivedAt||''))),available=source.reduce((s,l)=>s+Number(l.qty),0);
  if(available<qty)throw new Error(`移動元の在庫不足です（在庫 ${available} / 移動 ${qty}）`);
  let remaining=qty;
  for(const lot of source){if(!remaining)break;const take=Math.min(Number(lot.qty),remaining),after=Number(lot.qty)-take;if(after===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:after});ctx.lots.put({id:uid(),productId,locationId:toLocationId,qty:take,expiry:lot.expiry||null,receivedAt:lot.receivedAt||today(),movedFromLotId:lot.id});remaining-=take;}
  const total=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0);const from=ctx.locations.find(x=>x.id===fromLocationId),to=ctx.locations.find(x=>x.id===toLocationId);
  ctx.addHistory({locationId:toLocationId,type:'移動',qty:0,balance:total,fromLocationId,toLocationId,movedQty:qty,note:`${from?.name||'移動元'} → ${to?.name||'移動先'} / ${qty}個`});
  return{balance:total,movedQty:qty,fromLocationId,toLocationId};
 });
}
window.InventoryService={receive,useFEFO,discard,setLotQty,setLotExpiry,transfer,formatQty};
})();