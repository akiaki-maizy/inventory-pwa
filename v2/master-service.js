(()=>{
'use strict';
const DB=()=>window.InventoryDB;const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2);const now=()=>new Date().toISOString();const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};const text=v=>String(v??'').trim();const jan=v=>String(v??'').replace(/\D/g,'');async function all(name){return DB().getAll(name);}async function productStock(id){return (await all('lots')).filter(l=>l.productId===id).reduce((s,l)=>s+Number(l.qty||0),0);}
async function saveProduct(input){const name=text(input.name);if(!name)throw new Error('商品名は必須です');const code=jan(input.jan);if(code&&![8,12,13].includes(code.length))throw new Error('JANコードは8・12・13桁で指定してください');const products=await all('products');if(code&&products.some(p=>p.id!==input.id&&p.active!==false&&jan(p.jan)===code))throw new Error('同じJANコードの商品が既にあります');const old=input.id?await DB().get('products',input.id):null;const locationId=input.locationId||null;if(locationId){const loc=await DB().get('locations',locationId);if(!loc)throw new Error('保管場所が見つかりません');if(loc.active===false&&old?.locationId!==locationId)throw new Error('使用停止中の保管場所は指定できません');if(loc.parentId){const parent=await DB().get('locations',loc.parentId);if(parent?.active===false&&old?.locationId!==locationId)throw new Error('親の保管場所が使用停止中です');}}const supplierId=input.supplierId||null;let supplier='';if(supplierId){const s=await DB().get('suppliers',supplierId);if(!s)throw new Error('仕入先が見つかりません');if(s.active===false&&old?.supplierId!==supplierId)throw new Error('使用停止中の仕入先は指定できません');supplier=s.name;}const categoryId=input.categoryId||null;if(categoryId){const c=await DB().get('categories',categoryId);if(!c)throw new Error('分類が見つかりません');if(c.active===false&&old?.categoryId!==categoryId)throw new Error('使用停止中の分類は指定できません');}const pack=Number(input.casePack??1);if(!Number.isInteger(pack)||pack<1)throw new Error('ケース入数は1以上の整数で指定してください');const expiryManaged=!(input.expiryManaged===false||input.expiryManaged==='false'||input.expiryManaged==='none');const orderGroup=text(input.orderGroup);const orderTargetQty=Number(input.orderTargetQty??0);if(!Number.isInteger(orderTargetQty)||orderTargetQty<0)throw new Error('発注定数は0以上の整数で指定してください');const product={...old,id:input.id||uid(),name,spec:text(input.spec),jan:code,supplierId,supplier,categoryId,locationId,casePack:pack,expiryManaged,orderGroup,orderTargetQty,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};await DB().put('products',product);return product;}
async function createProductWithInitialStock(input,rows=[]){const name=text(input.name);if(!name)throw new Error('商品名は必須です');const code=jan(input.jan);if(code&&![8,12,13].includes(code.length))throw new Error('JANコードは8・12・13桁で指定してください');const pack=Number(input.casePack??1);if(!Number.isInteger(pack)||pack<1)throw new Error('ケース入数は1以上の整数で指定してください');const expiryManaged=!(input.expiryManaged===false||input.expiryManaged==='false'||input.expiryManaged==='none');const orderGroup=text(input.orderGroup);const orderTargetQty=Number(input.orderTargetQty??0);if(!Number.isInteger(orderTargetQty)||orderTargetQty<0)throw new Error('発注定数は0以上の整数で指定してください');const clean=(Array.isArray(rows)?rows:[]).map((r,i)=>{const qty=Number(r.qty);if(!Number.isInteger(qty)||qty<0)throw new Error(`${i+1}行目の初期在庫数は0以上の整数で入力してください`);const expiry=expiryManaged?(r.expiry||null):null;if(qty>0&&expiryManaged&&!expiry)throw new Error('初期在庫を登録する場合は賞味期限を設定してください');return{qty,expiry};}).filter(r=>r.qty>0);const products=await all('products');if(code&&products.some(p=>p.active!==false&&jan(p.jan)===code))throw new Error('同じJANコードの商品が既にあります');const locationId=input.locationId||null;if(!locationId)throw new Error('保管場所を選択してください');const loc=await DB().get('locations',locationId);if(!loc)throw new Error('保管場所が見つかりません');if(loc.active===false)throw new Error('使用停止中の保管場所は指定できません');if(loc.parentId){const parent=await DB().get('locations',loc.parentId);if(parent?.active===false)throw new Error('親の保管場所が使用停止中です');}const supplierId=input.supplierId||null;let supplier='';if(supplierId){const s=await DB().get('suppliers',supplierId);if(!s)throw new Error('仕入先が見つかりません');if(s.active===false)throw new Error('使用停止中の仕入先は指定できません');supplier=s.name;}const categoryId=input.categoryId||null;if(categoryId){const cat=await DB().get('categories',categoryId);if(!cat)throw new Error('分類が見つかりません');if(cat.active===false)throw new Error('使用停止中の分類は指定できません');}const d=await DB().open();return new Promise((resolve,reject)=>{const tx=d.transaction(['settings','products','lots','transactions'],'readwrite'),ps=tx.objectStore('products'),ls=tx.objectStore('lots'),ts=tx.objectStore('transactions'),ss=tx.objectStore('settings');const product={id:uid(),name,spec:text(input.spec),jan:code,supplierId,supplier,categoryId,locationId,casePack:pack,expiryManaged,orderGroup,orderTargetQty,active:true,createdAt:now(),updatedAt:now()};let result={product,balance:0};const fail=e=>{try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};ss.get('storeName').onsuccess=e=>{try{const storeName=e.target.result?.value||'';ps.put(product);let balance=0;for(const row of clean){const lotId=uid(),lot={id:lotId,productId:product.id,locationId,qty:row.qty,expiry:row.expiry,receivedAt:today()};ls.put(lot);balance+=row.qty;ts.put({id:uid(),timestamp:now(),productId:product.id,lotId,locationId,type:'入荷',qty:row.qty,balance,reason:null,note:row.expiry?`賞味期限 ${row.expiry}`:'期限なし',unitPrice:null,storeName});}result={product,balance};}catch(err){fail(err);}};ss.get('storeName').onerror=()=>fail(new Error('店舗設定を読み込めません'));tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('商品と初期在庫の登録に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('マスタ処理が中断されました'));});}
async function createDemoData(){
const d=await DB().open(),stores=DB().STORES;
return new Promise((resolve,reject)=>{
const tx=d.transaction(stores,'readwrite'),S=Object.fromEntries(stores.map(n=>[n,tx.objectStore(n)]));
let result;
const fail=e=>{try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};
try{
const pending=stores.map(n=>new Promise((res,rej)=>{const r=S[n].count();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));
Promise.all(pending).then(counts=>{
try{
if(counts.some(n=>n>0))throw new Error('既存データがあるためデモを作成できません');
const pad=n=>String(n).padStart(2,'0');
const date=n=>{const x=new Date();x.setHours(12,0,0,0);x.setDate(x.getDate()+n);return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());};
const time=h=>new Date(Date.now()-h*3600000).toISOString();
const stamp=now();
[['storeName','デモ店舗'],['expiryCautionDays',30],['expiryWarningDays',7],['fontSize',18]].forEach(([key,value])=>S.settings.put({key,value}));

const locCold=uid(),locColdTop=uid(),locColdBottom=uid(),locFrozen=uid(),locFrozenA=uid(),locDry=uid(),locDryA=uid(),locDryB=uid(),locOld=uid();
const locations=[
{id:locCold,name:'冷蔵庫',parentId:null,displayNumber:1,order:0,active:true},
{id:locColdTop,name:'上段',parentId:locCold,displayNumber:1,order:0,active:true},
{id:locColdBottom,name:'下段',parentId:locCold,displayNumber:2,order:0,active:true},
{id:locFrozen,name:'冷凍庫',parentId:null,displayNumber:2,order:0,active:true},
{id:locFrozenA,name:'棚A',parentId:locFrozen,displayNumber:1,order:0,active:true},
{id:locDry,name:'乾物庫',parentId:null,displayNumber:3,order:0,active:true},
{id:locDryA,name:'棚A',parentId:locDry,displayNumber:1,order:0,active:true},
{id:locDryB,name:'棚B',parentId:locDry,displayNumber:2,order:0,active:true},
{id:locOld,name:'旧保管庫（停止中）',parentId:null,displayNumber:9,order:0,active:false}
].map(x=>({...x,createdAt:stamp,updatedAt:stamp}));
locations.forEach(x=>S.locations.put(x));

const supGeneral=uid(),supChilled=uid(),supFrozen=uid(),supDry=uid(),supOld=uid();
const suppliers=[
{id:supGeneral,name:'デモ総合食品卸',active:true},
{id:supChilled,name:'デモ冷蔵食品',active:true},
{id:supFrozen,name:'デモ冷凍食品',active:true},
{id:supDry,name:'デモ乾物卸',active:true},
{id:supOld,name:'旧仕入先（停止中）',active:false}
].map(x=>({...x,createdAt:stamp,updatedAt:stamp}));
suppliers.forEach(x=>S.suppliers.put(x));

const catSeasoning=uid(),catSauce=uid(),catMayo=uid(),catDressing=uid(),catDairy=uid(),catMilk=uid(),catFrozen=uid(),catFrozenVeg=uid(),catFrozenNoodle=uid(),catDry=uid(),catFlour=uid(),catSalt=uid(),catOil=uid(),catOld=uid();
const categories=[
{id:catSeasoning,name:'調味料',parentId:null,active:true},
{id:catSauce,name:'ソース類',parentId:catSeasoning,active:true},
{id:catMayo,name:'マヨネーズ',parentId:catSauce,active:true},
{id:catDressing,name:'ドレッシング',parentId:catSauce,active:true},
{id:catDairy,name:'乳製品',parentId:null,active:true},
{id:catMilk,name:'牛乳',parentId:catDairy,active:true},
{id:catFrozen,name:'冷凍食品',parentId:null,active:true},
{id:catFrozenVeg,name:'冷凍野菜',parentId:catFrozen,active:true},
{id:catFrozenNoodle,name:'冷凍麺',parentId:catFrozen,active:true},
{id:catDry,name:'乾物',parentId:null,active:true},
{id:catFlour,name:'粉類',parentId:catDry,active:true},
{id:catSalt,name:'塩・砂糖',parentId:catDry,active:true},
{id:catOil,name:'油類',parentId:catDry,active:true},
{id:catOld,name:'旧分類（停止中）',parentId:null,active:false}
].map(x=>({...x,createdAt:stamp,updatedAt:stamp}));
categories.forEach(x=>S.categories.put(x));

const pMayo=uid(),pDress=uid(),pKetchup=uid(),pMilk=uid(),pBroccoli=uid(),pUdon=uid(),pFlour=uid(),pSalt=uid(),pOil=uid(),pCurry=uid(),pInactive=uid(),pZero=uid();
const products=[
{id:pMayo,name:'デモ マヨネーズ',spec:'1kg',jan:'4900000000000',supplierId:supGeneral,supplier:'デモ総合食品卸',categoryId:catMayo,locationId:locColdTop,casePack:10,active:true},
{id:pDress,name:'デモ 和風ドレッシング',spec:'500ml',jan:'4900000000017',supplierId:supGeneral,supplier:'デモ総合食品卸',categoryId:catDressing,locationId:locColdTop,casePack:6,active:true},
{id:pKetchup,name:'デモ トマトケチャップ',spec:'1kg',jan:'4900000000024',supplierId:supGeneral,supplier:'デモ総合食品卸',categoryId:catSauce,locationId:locColdBottom,casePack:12,active:true},
{id:pMilk,name:'デモ 牛乳',spec:'1L',jan:'4900000000031',supplierId:supChilled,supplier:'デモ冷蔵食品',categoryId:catMilk,locationId:locColdBottom,casePack:12,active:true},
{id:pBroccoli,name:'デモ 冷凍ブロッコリー',spec:'500g',jan:'4900000000048',supplierId:supFrozen,supplier:'デモ冷凍食品',categoryId:catFrozenVeg,locationId:locFrozenA,casePack:20,active:true},
{id:pUdon,name:'デモ 冷凍うどん',spec:'5食入',jan:'4900000000055',supplierId:supFrozen,supplier:'デモ冷凍食品',categoryId:catFrozenNoodle,locationId:locFrozenA,casePack:8,active:true},
{id:pFlour,name:'デモ 薄力粉',spec:'1kg',jan:'4900000000062',supplierId:supDry,supplier:'デモ乾物卸',categoryId:catFlour,locationId:locDryA,casePack:15,active:true},
{id:pSalt,name:'デモ 食塩（期限なし）',spec:'1kg',jan:'4900000000079',supplierId:supDry,supplier:'デモ乾物卸',categoryId:catSalt,locationId:locDryA,casePack:1,active:true},
{id:pOil,name:'デモ サラダ油（少量在庫）',spec:'1500g',jan:'4900000000086',supplierId:supGeneral,supplier:'デモ総合食品卸',categoryId:catOil,locationId:locDryB,casePack:6,active:true},
{id:pCurry,name:'デモ カレーフレーク（期限超過）',spec:'1kg',jan:'4900000000093',supplierId:supDry,supplier:'デモ乾物卸',categoryId:catSauce,locationId:locDryB,casePack:10,active:true},
{id:pInactive,name:'デモ 旧規格ソース（使用停止）',spec:'旧500ml',jan:'4900000000109',supplierId:supOld,supplier:'旧仕入先（停止中）',categoryId:catOld,locationId:locOld,casePack:6,active:false},
{id:pZero,name:'デモ オリーブ油（在庫切れ）',spec:'1L',jan:'4900000000116',supplierId:supGeneral,supplier:'デモ総合食品卸',categoryId:catOil,locationId:locDryB,casePack:6,active:true}
].map(x=>({...x,expiryManaged:x.id!==pSalt,orderGroup:x.name,orderTargetQty:Math.max(1,Number(x.casePack)||1)*2,createdAt:stamp,updatedAt:stamp}));
products.forEach(x=>S.products.put(x));

const m1=uid(),m2=uid(),d1=uid(),k1=uid(),milk1=uid(),milk2=uid(),b1=uid(),b2=uid(),u1=uid(),f1=uid(),f2=uid(),s1=uid(),o1=uid(),c1=uid();
const lots=[
{id:m1,productId:pMayo,locationId:locColdTop,qty:12,expiry:date(20),receivedAt:date(-14)},
{id:m2,productId:pMayo,locationId:locColdTop,qty:15,expiry:date(60),receivedAt:date(-4)},
{id:d1,productId:pDress,locationId:locColdTop,qty:8,expiry:date(5),receivedAt:date(-5)},
{id:k1,productId:pKetchup,locationId:locColdBottom,qty:24,expiry:date(45),receivedAt:date(-12)},
{id:milk1,productId:pMilk,locationId:locColdBottom,qty:7,expiry:date(2),receivedAt:date(-2)},
{id:milk2,productId:pMilk,locationId:locColdBottom,qty:12,expiry:date(6),receivedAt:date(-1)},
{id:b1,productId:pBroccoli,locationId:locFrozenA,qty:20,expiry:date(180),receivedAt:date(-20)},
{id:b2,productId:pBroccoli,locationId:locFrozenA,qty:23,expiry:date(210),receivedAt:date(-10)},
{id:u1,productId:pUdon,locationId:locFrozenA,qty:16,expiry:date(120),receivedAt:date(-8)},
{id:f1,productId:pFlour,locationId:locDryA,qty:15,expiry:date(60),receivedAt:date(-30)},
{id:f2,productId:pFlour,locationId:locDryA,qty:16,expiry:date(120),receivedAt:date(-7)},
{id:s1,productId:pSalt,locationId:locDryA,qty:9,expiry:null,receivedAt:date(-40)},
{id:o1,productId:pOil,locationId:locDryB,qty:1,expiry:date(120),receivedAt:date(-20)},
{id:c1,productId:pCurry,locationId:locDryB,qty:6,expiry:date(-3),receivedAt:date(-90)}
];
lots.forEach(x=>S.lots.put(x));

const addTx=(productId,lotId,locationId,type,qty,balance,note,hoursAgo,reason=null)=>S.transactions.put({id:uid(),timestamp:time(hoursAgo),productId,lotId,locationId,type,qty,balance,reason,note,unitPrice:null,storeName:'デモ店舗'});
addTx(pMayo,m1,locColdTop,'入荷',20,20,'賞味期限 '+lots[0].expiry,336);
addTx(pMayo,m2,locColdTop,'入荷',15,35,'賞味期限 '+lots[1].expiry,96);
addTx(pMayo,m1,locColdTop,'使用',-8,27,'FEFO使用のデモ',24);
addTx(pDress,d1,locColdTop,'入荷',12,12,'賞味期限 '+lots[2].expiry,120);
addTx(pDress,d1,locColdTop,'廃棄',-4,8,'容器破損のデモ',18,'破損');
addTx(pKetchup,k1,locColdBottom,'入荷',22,22,'賞味期限 '+lots[3].expiry,288);
addTx(pKetchup,k1,locColdBottom,'期限別棚卸',2,24,'22個 → 24個',20);
addTx(pMilk,milk1,locColdBottom,'入荷',10,10,'賞味期限 '+lots[4].expiry,48);
addTx(pMilk,milk2,locColdBottom,'入荷',12,22,'賞味期限 '+lots[5].expiry,24);
addTx(pMilk,milk1,locColdBottom,'使用',-3,19,'古い期限から使用',6);
addTx(pBroccoli,b1,locFrozenA,'入荷',20,20,'賞味期限 '+lots[6].expiry,480);
addTx(pBroccoli,b2,locFrozenA,'入荷',23,43,'賞味期限 '+date(170),240);
addTx(pBroccoli,b2,locFrozenA,'賞味期限訂正',0,43,'賞味期限 '+date(170)+' → '+lots[7].expiry,12);
addTx(pUdon,u1,locFrozenA,'入荷',16,16,'賞味期限 '+lots[8].expiry,192);
addTx(pFlour,f1,locDryA,'入荷',15,15,'賞味期限 '+lots[9].expiry,720);
addTx(pFlour,f2,locDryA,'入荷',16,31,'賞味期限 '+lots[10].expiry,168);
addTx(pSalt,s1,locDryA,'入荷',9,9,'期限なし商品のデモ',960);
addTx(pOil,o1,locDryB,'入荷',1,1,'少量在庫のデモ / 賞味期限 '+lots[12].expiry,480);
addTx(pCurry,c1,locDryB,'入荷',6,6,'期限超過商品のデモ / 賞味期限 '+lots[13].expiry,2160);

result={locations:locations.length,suppliers:suppliers.length,categories:categories.length,products:products.length,lots:lots.length,transactions:19};
}catch(e){fail(e);}
}).catch(fail);
}catch(e){fail(e);}
tx.oncomplete=()=>resolve(result);
tx.onerror=()=>reject(tx.error||new Error('デモデータの作成に失敗しました'));
tx.onabort=()=>reject(tx.error||new Error('マスタ処理が中断されました'));
});
}
async function setProductActive(id,active){const p=await DB().get('products',id);if(!p)throw new Error('商品が見つかりません');const stock=await productStock(id);if(!active&&stock>0)throw new Error(`在庫が残っているため使用停止できません（${stock}個）`);const next={...p,active:!!active,updatedAt:now()};await DB().put('products',next);let warning=null;if(active&&p.locationId){const loc=await DB().get('locations',p.locationId);if(!loc)warning='設定されている保管場所が見つかりません';else if(loc.active===false)warning='設定されている保管場所は使用停止中です';else if(loc.parentId){const parent=await DB().get('locations',loc.parentId);if(parent?.active===false)warning='親の保管場所が使用停止中です';}}return{product:next,warning};}
async function saveLocation(input){const name=text(input.name);if(!name)throw new Error('保管場所名は必須です');const old=input.id?await DB().get('locations',input.id):null;const parentId=input.parentId||null;if(input.id&&parentId===input.id)throw new Error('保管場所を自分自身の子にはできません');if(parentId){const parent=await DB().get('locations',parentId);if(!parent)throw new Error('親の保管場所が見つかりません');if(parent.parentId)throw new Error('保管場所は2階層までです');if(parent.active===false)throw new Error('使用停止中の場所には棚を追加できません');}if(old&&old.parentId!==parentId){const locations=await all('locations');if(locations.some(x=>x.parentId===old.id))throw new Error('子の棚・区画がある場所は階層を変更できません');const products=await all('products');if(products.some(p=>p.locationId===old.id))throw new Error('商品が登録されている場所は階層を変更できません');const lots=await all('lots');if(lots.some(l=>l.locationId===old.id&&Number(l.qty||0)>0))throw new Error('在庫が置かれている場所は階層を変更できません');}const num=input.displayNumber==null||input.displayNumber===''?null:Number(input.displayNumber);if(num!==null&&(!Number.isInteger(num)||num<1))throw new Error('表示番号は1以上の整数で指定してください');const loc={...old,id:input.id||uid(),name,parentId,displayNumber:num,order:Number.isFinite(Number(input.order))?Number(input.order):0,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};await DB().put('locations',loc);return loc;}
async function setLocationActive(id,active){const loc=await DB().get('locations',id);if(!loc)throw new Error('保管場所が見つかりません');if(!active){const [locations,products,lots]=await Promise.all([all('locations'),all('products'),all('lots')]);if(locations.some(x=>x.parentId===id&&x.active!==false))throw new Error('使用中の棚・区画があるため停止できません');const here=products.filter(p=>p.locationId===id);if(here.some(p=>p.active!==false))throw new Error('標準保管場所に設定された使用中商品があるため停止できません');if(lots.some(l=>l.locationId===id&&Number(l.qty||0)>0))throw new Error('この保管場所に在庫が残っているため停止できません');}else if(loc.parentId){const parent=await DB().get('locations',loc.parentId);if(!parent||parent.active===false)throw new Error('親の保管場所を先に再開してください');}const next={...loc,active:!!active,updatedAt:now()};await DB().put('locations',next);return next;}
async function saveSupplier(input){const name=text(input.name);if(!name)throw new Error('仕入先名は必須です');const suppliers=await all('suppliers'),key=name.normalize('NFKC').toLowerCase();if(suppliers.some(s=>s.id!==input.id&&text(s.name).normalize('NFKC').toLowerCase()===key))throw new Error('同じ仕入先名が既にあります');const old=input.id?await DB().get('suppliers',input.id):null,item={...old,id:input.id||uid(),name,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()},d=await DB().open();return new Promise((resolve,reject)=>{const tx=d.transaction(['suppliers','products'],'readwrite'),ss=tx.objectStore('suppliers'),ps=tx.objectStore('products');let failed=false;const fail=e=>{if(failed)return;failed=true;try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};ss.put(item);if(old&&old.name!==name){const q=ps.getAll();q.onsuccess=()=>{try{for(const p of q.result||[])if(p.supplierId===item.id)ps.put({...p,supplier:name,updatedAt:now()});}catch(e){fail(e);}};q.onerror=()=>fail(q.error||new Error('商品側の仕入先名更新に失敗しました'));}tx.oncomplete=()=>{if(!failed)resolve(item);};tx.onerror=()=>fail(tx.error||new Error('仕入先の保存に失敗しました'));tx.onabort=()=>{if(!failed){failed=true;reject(tx.error||new Error('仕入先の保存を中断しました'));}};});}async function setSupplierActive(id,active){const item=await DB().get('suppliers',id);if(!item)throw new Error('仕入先が見つかりません');const next={...item,active:!!active,updatedAt:now()};await DB().put('suppliers',next);return next;}
async function saveCategory(input){const name=text(input.name);if(!name)throw new Error('分類名は必須です');const cats=await all('categories'),old=input.id?await DB().get('categories',input.id):null,parentId=input.parentId||null;if(input.id&&parentId===input.id)throw new Error('分類を自分自身の子にはできません');const byId=new Map(cats.map(c=>[c.id,c]));function depthOf(id){let d=1,cur=byId.get(id),seen=new Set();while(cur?.parentId){if(seen.has(cur.id))throw new Error('分類の循環参照はできません');seen.add(cur.id);cur=byId.get(cur.parentId);if(!cur)throw new Error('分類階層が壊れています');d++;}return d;}let newDepth=1;if(parentId){const parent=byId.get(parentId);if(!parent)throw new Error('親分類が見つかりません');if(parent.active===false)throw new Error('使用停止中の分類には子分類を追加できません');newDepth=depthOf(parentId)+1;if(newDepth>3)throw new Error('分類は3階層までです');}if(old&&old.parentId!==parentId){const children=new Map();for(const c of cats){if(c.parentId){if(!children.has(c.parentId))children.set(c.parentId,[]);children.get(c.parentId).push(c.id);}}let descendantDepth=0;const walk=(id,d,seen=new Set())=>{if(seen.has(id))throw new Error('分類の循環参照はできません');const next=new Set(seen);next.add(id);descendantDepth=Math.max(descendantDepth,d);for(const child of children.get(id)||[])walk(child,d+1,next);};walk(old.id,0);if(newDepth+descendantDepth>3)throw new Error('子分類を含めると3階層を超えるため移動できません');}const item={...old,id:input.id||uid(),name,parentId,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};await DB().put('categories',item);return item;}
async function setCategoryActive(id,active){const item=await DB().get('categories',id);if(!item)throw new Error('分類が見つかりません');const cats=await all('categories');if(!active){if(cats.some(c=>c.parentId===id&&c.active!==false))throw new Error('使用中の子分類があるため停止できません');const products=await all('products');if(products.some(p=>p.categoryId===id&&p.active!==false))throw new Error('使用中の商品が登録されているため停止できません');}else if(item.parentId){const parent=cats.find(c=>c.id===item.parentId);if(!parent||parent.active===false)throw new Error('親分類を先に再開してください');}const next={...item,active:!!active,updatedAt:now()};await DB().put('categories',next);return next;}
window.MasterService={saveProduct,createProductWithInitialStock,createDemoData,setProductActive,saveLocation,setLocationActive,saveSupplier,setSupplierActive,saveCategory,setCategoryActive};
})();