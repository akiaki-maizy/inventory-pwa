(()=>{
'use strict';
const DB=()=>window.InventoryDB;
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2);
const now=()=>new Date().toISOString();
const text=v=>String(v??'').trim();
const jan=v=>String(v??'').replace(/\D/g,'');
async function all(name){return DB().getAll(name);}

async function saveProduct(input){
 const name=text(input.name);if(!name)throw new Error('商品名は必須です');
 const code=jan(input.jan);if(code&&![8,12,13].includes(code.length))throw new Error('JANコードは8・12・13桁で指定してください');
 const products=await all('products');
 if(code&&products.some(p=>p.id!==input.id&&p.active!==false&&jan(p.jan)===code))throw new Error('同じJANコードの商品が既にあります');
 const locationId=input.locationId||null;
 if(locationId){const loc=await DB().get('locations',locationId);if(!loc)throw new Error('保管場所が見つかりません');if(loc.active===false)throw new Error('使用停止中の保管場所は指定できません');}
 const old=input.id?await DB().get('products',input.id):null;
 const product={...old,id:input.id||uid(),name,spec:text(input.spec),jan:code,supplierId:input.supplierId||null,supplier:text(input.supplier),locationId,categoryId:input.categoryId||null,casePack:Math.max(1,Math.floor(Number(input.casePack)||1)),active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};
 await DB().put('products',product);return product;
}

async function setProductActive(id,active){
 const p=await DB().get('products',id);if(!p)throw new Error('商品が見つかりません');
 if(!active){const lots=(await all('lots')).filter(l=>l.productId===id);const total=lots.reduce((s,l)=>s+Number(l.qty||0),0);if(total>0)throw new Error(`在庫が残っているため使用停止できません（${total}個）`);}
 const next={...p,active:!!active,updatedAt:now()};await DB().put('products',next);
 let warning=null;if(active&&p.locationId){const loc=await DB().get('locations',p.locationId);if(!loc)warning='設定されている保管場所が見つかりません';else if(loc.active===false)warning='設定されている保管場所は使用停止中です';else if(loc.parentId){const parent=await DB().get('locations',loc.parentId);if(parent?.active===false)warning='親の保管場所が使用停止中です';}}
 return {product:next,warning};
}

async function saveLocation(input){
 const name=text(input.name);if(!name)throw new Error('保管場所名は必須です');
 let parentId=input.parentId||null;if(parentId){const parent=await DB().get('locations',parentId);if(!parent)throw new Error('親の保管場所が見つかりません');if(parent.parentId)throw new Error('保管場所は2階層までです');if(parent.active===false)throw new Error('使用停止中の場所には棚を追加できません');}
 const old=input.id?await DB().get('locations',input.id):null;
 const loc={...old,id:input.id||uid(),name,parentId,displayNumber:input.displayNumber==null||input.displayNumber===''?null:Number(input.displayNumber),order:Number.isFinite(Number(input.order))?Number(input.order):0,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};
 await DB().put('locations',loc);return loc;
}

async function setLocationActive(id,active){
 const loc=await DB().get('locations',id);if(!loc)throw new Error('保管場所が見つかりません');
 if(!active){const [locations,products,lots]=await Promise.all([all('locations'),all('products'),all('lots')]);const children=locations.filter(x=>x.parentId===id&&x.active!==false);if(children.length)throw new Error('使用中の棚・区画があるため停止できません');const hereProducts=products.filter(p=>p.locationId===id);if(hereProducts.some(p=>p.active!==false))throw new Error('使用中の商品が登録されているため停止できません');const ids=new Set(hereProducts.map(p=>p.id));if(lots.some(l=>ids.has(l.productId)&&Number(l.qty||0)>0))throw new Error('在庫が残っているため停止できません');}
 const next={...loc,active:!!active,updatedAt:now()};await DB().put('locations',next);return next;
}

async function saveSupplier(input){const name=text(input.name);if(!name)throw new Error('仕入先名は必須です');const suppliers=(await DB().get('settings','suppliers'))?.value||[];if(suppliers.some(s=>s.id!==input.id&&s.active!==false&&s.name===name))throw new Error('同じ仕入先名が既にあります');const old=suppliers.find(s=>s.id===input.id);const item={...old,id:input.id||uid(),name,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};const next=old?suppliers.map(s=>s.id===item.id?item:s):[...suppliers,item];await DB().put('settings',{key:'suppliers',value:next});return item;}
async function setSupplierActive(id,active){const rec=await DB().get('settings','suppliers');const list=rec?.value||[];if(!list.some(s=>s.id===id))throw new Error('仕入先が見つかりません');const next=list.map(s=>s.id===id?{...s,active:!!active,updatedAt:now()}:s);await DB().put('settings',{key:'suppliers',value:next});return next.find(s=>s.id===id);}

async function saveCategory(input){const name=text(input.name);if(!name)throw new Error('分類名は必須です');let parentId=input.parentId||null;if(parentId){const cats=await all('categories');const parent=cats.find(c=>c.id===parentId);if(!parent)throw new Error('親分類が見つかりません');if(parent.parentId){const grand=cats.find(c=>c.id===parent.parentId);if(grand?.parentId)throw new Error('分類は3階層までです');}}const old=input.id?await DB().get('categories',input.id):null;const item={...old,id:input.id||uid(),name,parentId,active:old?.active!==false,createdAt:old?.createdAt||now(),updatedAt:now()};await DB().put('categories',item);return item;}

window.MasterService={saveProduct,setProductActive,saveLocation,setLocationActive,saveSupplier,setSupplierActive,saveCategory};
})();
