(()=>{
'use strict';
const $=id=>document.getElementById(id);
function line(text,ok=true){const el=document.createElement('div');el.textContent=(ok?'✓ ':'✗ ')+text;el.className=ok?'ok':'ng';$('results').appendChild(el);if(!ok)throw new Error(text);}
function assertEq(actual,expected,label){line(`${label}: ${actual}`,actual===expected);}
async function expectReject(label,fn){let rejected=false;try{await fn();}catch(e){rejected=true;}line(label,rejected);}
async function clearAll(){const d=await InventoryDB.open();await new Promise((resolve,reject)=>{const tx=d.transaction(InventoryDB.STORES,'readwrite');for(const name of InventoryDB.STORES)tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('clear aborted'));});}
async function total(productId){return (await InventoryDB.getAll('lots')).filter(x=>x.productId===productId).reduce((s,x)=>s+Number(x.qty||0),0);}
async function run(){
 $('results').innerHTML='';$('run').disabled=true;
 try{
  await clearAll();await InventoryDB.put('settings',{key:'storeName',value:'TEST店舗'});
  const root=await MasterService.saveLocation({name:'冷蔵庫',displayNumber:1});
  const shelf=await MasterService.saveLocation({name:'上段',parentId:root.id});
  line('親場所＋棚を登録');
  await expectReject('3階層目の保管場所を拒否',()=>MasterService.saveLocation({name:'孫棚',parentId:shelf.id}));
  const supplier=await MasterService.saveSupplier({name:'テスト仕入先'});
  const large=await MasterService.saveCategory({name:'食品'});const middle=await MasterService.saveCategory({name:'加工品',parentId:large.id});const small=await MasterService.saveCategory({name:'テスト分類',parentId:middle.id});
  line('仕入先・3階層分類を登録',!!supplier&&!!small);
  const product=await MasterService.saveProduct({name:'テスト商品',jan:'4901234567894',locationId:shelf.id,supplierId:supplier.id,supplier:supplier.name,categoryId:small.id,casePack:20});
  assertEq(product.casePack,20,'ケース入数');
  await expectReject('JAN重複を拒否',()=>MasterService.saveProduct({name:'重複商品',jan:'4901234567894',locationId:shelf.id}));

  await InventoryService.receive(product.id,[{qty:43,expiry:'2026-10-01'},{qty:20,expiry:'2026-11-01'}]);assertEq(await total(product.id),63,'入荷後合計');
  await expectReject('在庫あり商品の使用停止を拒否',()=>MasterService.setProductActive(product.id,false));
  await expectReject('使用中商品がある棚の停止を拒否',()=>MasterService.setLocationActive(shelf.id,false));
  await InventoryService.useFEFO(product.id,30);assertEq(await total(product.id),33,'30個使用後合計');
  let lots=(await InventoryDB.getAll('lots')).filter(x=>x.productId===product.id);assertEq(lots.find(x=>x.expiry==='2026-10-01')?.qty,13,'FEFO 10/01ロット残');assertEq(lots.find(x=>x.expiry==='2026-11-01')?.qty,20,'FEFO 11/01ロット残');
  const first=lots.find(x=>x.expiry==='2026-10-01');await InventoryService.discard(product.id,first.id,8,'賞味期限','回帰テスト');assertEq(await total(product.id),25,'8個廃棄後合計');
  const before=await total(product.id);await expectReject('在庫不足を拒否',()=>InventoryService.useFEFO(product.id,999));assertEq(await total(product.id),before,'在庫不足エラー後も在庫不変');
  lots=(await InventoryDB.getAll('lots')).filter(x=>x.productId===product.id);const second=lots.find(x=>x.expiry==='2026-11-01');await InventoryService.setLotQty(product.id,second.id,18);assertEq(await total(product.id),23,'期限別棚卸後合計');
  await InventoryService.setProductTotal(product.id,0);assertEq(await total(product.id),0,'商品全体棚卸で0');
  await MasterService.setProductActive(product.id,false);line('在庫0なら商品停止可能');
  await MasterService.setLocationActive(shelf.id,false);line('停止商品だけなら棚停止可能');
  const resumed=await MasterService.setProductActive(product.id,true);line('商品再開時に停止中場所を警告',!!resumed.warning);const shelfAfter=await InventoryDB.get('locations',shelf.id);line('商品再開で場所を自動再開しない',shelfAfter.active===false);

  const history=(await InventoryDB.getAll('transactions')).filter(x=>x.productId===product.id);const types=history.map(x=>x.type);line('入荷履歴2件',types.filter(x=>x==='入荷').length===2);line('使用履歴あり',types.includes('使用'));line('廃棄履歴あり',types.includes('廃棄'));line('期限別棚卸履歴あり',types.includes('期限別棚卸'));line('商品棚卸履歴あり',types.includes('棚卸調整'));
  $('summary').textContent='PASS：Ver.2 在庫・マスタ基盤の回帰テストに合格';$('summary').className='pass';
 }catch(e){$('summary').textContent='FAIL：'+(e?.message||e);$('summary').className='fail';console.error(e);}finally{$('run').disabled=false;}
}
$('run').addEventListener('click',run);
})();
