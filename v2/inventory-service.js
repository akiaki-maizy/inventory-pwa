(()=>{
'use strict';
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2);
const today=()=>new Date().toISOString().slice(0,10);
function intQty(v,label='数量'){const n=Number(v);if(!Number.isInteger(n)||n<0)throw new Error(`${label}は0以上の整数で指定してください`);return n;}
function expiryKey(lot){return lot.expiry||'9999-12-31';}

async function mutate(productId,handler){
 const DB=window.InventoryDB;if(!DB)throw new Error('InventoryDBが読み込まれていません');
 const d=await DB.open();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(['settings','products','lots','transactions'],'readwrite');
  const products=tx.objectStore('products'),lots=tx.objectStore('lots'),transactions=tx.objectStore('transactions'),settings=tx.objectStore('settings');
  let result;
  const fail=e=>{try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};
  products.get(productId).onsuccess=e=>{
   const product=e.target.result;if(!product){fail(new Error('商品が見つかりません'));return;}
   lots.getAll().onsuccess=async le=>{
    try{
     const productLots=(le.target.result||[]).filter(x=>x.productId===productId);
     const storeReq=settings.get('storeName');
     storeReq.onsuccess=()=>{
      try{
       const ctx={product,productLots,lots,transactions,storeName:storeReq.result?.value||'',addHistory(data){transactions.put({id:uid(),timestamp:new Date().toISOString(),productId,lotId:data.lotId||null,locationId:product.locationId||null,type:data.type,qty:Number(data.qty)||0,balance:data.balance??null,reason:data.reason??null,note:data.note??null,unitPrice:null,storeName:this.storeName});}};
       result=handler(ctx);
      }catch(err){fail(err);}
     };
    }catch(err){fail(err);}
   };
  };
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error||new Error('在庫更新に失敗しました'));
  tx.onabort=()=>{};
 });
}

async function receive(productId,rows){
 if(!Array.isArray(rows)||!rows.length)throw new Error('入荷内容がありません');
 const clean=rows.map((r,i)=>({qty:intQty(r.qty,`${i+1}行目の数量`),expiry:r.expiry||null})).filter(r=>r.qty>0);
 if(!clean.length)throw new Error('入荷数量がありません');
 return mutate(productId,ctx=>{
  let balance=ctx.productLots.reduce((s,l)=>s+(Number(l.qty)||0),0);
  for(const row of clean){const lot={id:uid(),productId,locationId:ctx.product.locationId||null,qty:row.qty,expiry:row.expiry,receivedAt:today()};ctx.lots.put(lot);balance+=row.qty;ctx.addHistory({lotId:lot.id,type:'入荷',qty:row.qty,balance,note:row.expiry?`賞味期限 ${row.expiry}`:'期限なし'});}
  return {balance};
 });
}

async function useFEFO(productId,qty){
 qty=intQty(qty);if(qty<=0)throw new Error('使用数量は1以上で指定してください');
 return mutate(productId,ctx=>{
  const active=ctx.productLots.filter(l=>(Number(l.qty)||0)>0).sort((a,b)=>expiryKey(a).localeCompare(expiryKey(b))||String(a.receivedAt||'').localeCompare(String(b.receivedAt||'')));
  const total=active.reduce((s,l)=>s+Number(l.qty),0);if(total<qty)throw new Error(`在庫不足です（在庫 ${total} / 使用 ${qty}）`);
  let remaining=qty,balance=total;
  for(const lot of active){if(!remaining)break;const take=Math.min(Number(lot.qty),remaining);const after=Number(lot.qty)-take;if(after===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:after});remaining-=take;balance-=take;ctx.addHistory({lotId:lot.id,type:'使用',qty:-take,balance,note:lot.expiry?`賞味期限 ${lot.expiry}`:'期限なし'});}
  return {balance};
 });
}

async function discard(productId,lotId,qty,reason,note=''){
 qty=intQty(qty);if(qty<=0)throw new Error('廃棄数量は1以上で指定してください');
 return mutate(productId,ctx=>{const lot=ctx.productLots.find(x=>x.id===lotId);if(!lot)throw new Error('対象ロットが見つかりません');if(Number(lot.qty)<qty)throw new Error('廃棄数量がロット在庫を超えています');const after=Number(lot.qty)-qty;if(after===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:after});const balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0)-qty;ctx.addHistory({lotId,type:'廃棄',qty:-qty,balance,reason:reason||'その他',note});return{balance};});
}

async function setLotQty(productId,lotId,target){
 target=intQty(target,'棚卸数量');
 return mutate(productId,ctx=>{const lot=ctx.productLots.find(x=>x.id===lotId);if(!lot)throw new Error('対象ロットが見つかりません');const before=Number(lot.qty)||0,diff=target-before;if(!diff)return{balance:ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0),diff:0};if(target===0)ctx.lots.delete(lot.id);else ctx.lots.put({...lot,qty:target});const balance=ctx.productLots.reduce((s,l)=>s+Number(l.qty||0),0)+diff;ctx.addHistory({lotId,type:'期限別棚卸',qty:diff,balance,note:lot.expiry?`賞味期限 ${lot.expiry}`:'期限なし'});return{balance,diff};});
}

window.InventoryService={receive,useFEFO,discard,setLotQty};
})();
