(()=>{
'use strict';
const $=id=>document.getElementById(id);
function line(text,ok=true){const el=document.createElement('div');el.textContent=(ok?'✓ ':'✗ ')+text;el.className=ok?'ok':'ng';$('results').appendChild(el);if(!ok)throw new Error(text);}
function assertEq(actual,expected,label){line(`${label}: ${actual}`,actual===expected);}
async function clearAll(){const d=await InventoryDB.open();await new Promise((resolve,reject)=>{const tx=d.transaction(InventoryDB.STORES,'readwrite');for(const name of InventoryDB.STORES)tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('clear aborted'));});}
async function total(productId){return (await InventoryDB.getAll('lots')).filter(x=>x.productId===productId).reduce((s,x)=>s+Number(x.qty||0),0);}
async function run(){
 $('results').innerHTML='';$('run').disabled=true;
 try{
  await clearAll();
  await InventoryDB.put('settings',{key:'storeName',value:'TEST店舗'});
  await InventoryDB.put('locations',{id:'loc-1',name:'冷蔵庫',parentId:null,active:true});
  await InventoryDB.put('products',{id:'p-1',name:'テスト商品',locationId:'loc-1',casePack:20,active:true,createdAt:new Date().toISOString()});
  line('テストデータ初期化');

  await InventoryService.receive('p-1',[{qty:43,expiry:'2026-10-01'},{qty:20,expiry:'2026-11-01'}]);
  assertEq(await total('p-1'),63,'入荷後合計');

  await InventoryService.useFEFO('p-1',30);
  assertEq(await total('p-1'),33,'30個使用後合計');
  let lots=(await InventoryDB.getAll('lots')).filter(x=>x.productId==='p-1');
  assertEq(lots.find(x=>x.expiry==='2026-10-01')?.qty,13,'FEFO 10/01ロット残');
  assertEq(lots.find(x=>x.expiry==='2026-11-01')?.qty,20,'FEFO 11/01ロット残');

  const first=lots.find(x=>x.expiry==='2026-10-01');
  await InventoryService.discard('p-1',first.id,8,'賞味期限','回帰テスト');
  assertEq(await total('p-1'),25,'8個廃棄後合計');

  const before=await total('p-1');
  let rejected=false;try{await InventoryService.useFEFO('p-1',999);}catch(e){rejected=true;}
  line('在庫不足を拒否',rejected);
  assertEq(await total('p-1'),before,'在庫不足エラー後も在庫不変');

  lots=(await InventoryDB.getAll('lots')).filter(x=>x.productId==='p-1');
  const second=lots.find(x=>x.expiry==='2026-11-01');
  await InventoryService.setLotQty('p-1',second.id,18);
  assertEq(await total('p-1'),23,'期限別棚卸後合計');

  const history=(await InventoryDB.getAll('transactions')).filter(x=>x.productId==='p-1');
  assertEq(history.length,5,'履歴件数');
  const types=history.map(x=>x.type);
  line('入荷履歴2件',types.filter(x=>x==='入荷').length===2);
  line('使用履歴あり',types.includes('使用'));
  line('廃棄履歴あり',types.includes('廃棄'));
  line('期限別棚卸履歴あり',types.includes('期限別棚卸'));
  $('summary').textContent='PASS：Ver.2 在庫基盤の基本回帰テストに合格';$('summary').className='pass';
 }catch(e){$('summary').textContent='FAIL：'+(e?.message||e);$('summary').className='fail';console.error(e);
 }finally{$('run').disabled=false;}
}
$('run').addEventListener('click',run);
})();
