(function workModule(){
'use strict';
const BUILD='20261009a';
const PACKAGE_FORMAT='inventory-pwa-work-package',RESULT_FORMAT='inventory-pwa-work-result',SCHEMA_VERSION=1;
const DB=()=>window.InventoryDB;
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'_'+Math.random().toString(16).slice(2);
const now=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeName=s=>String(s||'').replace(/[\\/:*?"<>|]/g,'_').trim()||'データ';
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
function sortById(items,key='id'){return clone(items||[]).sort((a,b)=>String(a?.[key]||'').localeCompare(String(b?.[key]||'')));}
function same(a,b){return stable(sortById(a))===stable(sortById(b));}
function sameStrings(a,b){return stable([...(a||[])].map(String).sort())===stable([...(b||[])].map(String).sort());}async function sha256(value){if(!crypto?.subtle)throw new Error('この端末は共同作業の整合性確認に対応していません');const bytes=new TextEncoder().encode(stable(value)),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}async function digestBaseline(b){return sha256({products:sortById(b?.products||[]),lots:sortById(b?.lots||[])});}
function safeId(v,label='ID'){if(typeof v!=='string'||!v||v.length>200||/[<>"'\u0000-\u001f\u007f]/.test(v))throw new Error(`${label}が不正です`);return v;}
function safeJobId(v){safeId(v,'作業ID');if(!/^[A-Za-z0-9._:-]{8,200}$/.test(v))throw new Error('作業IDが不正です');return v;}
function safeInteger(v,label,{min=null,max=null}={}){if(typeof v!=='number'||!Number.isSafeInteger(v))throw new Error(`${label}が整数ではありません`);if(min!==null&&v<min)throw new Error(`${label}が範囲外です`);if(max!==null&&v>max)throw new Error(`${label}が範囲外です`);return v;}
function validDate(v){return v==null||v===''||/^\d{4}-\d{2}-\d{2}$/.test(v);}
function validTimestamp(v){return typeof v==='string'&&v.length<=50&&!Number.isNaN(Date.parse(v));}
async function getSetting(key){return (await DB().get('settings',key))?.value;}
async function putSetting(key,value){await DB().put('settings',{key,value});}
async function ensureDeviceId(){let id=await getSetting('deviceId');if(!id){id=uid();await putSetting('deviceId',id);}return id;}
async function readStores(names){
 const d=await DB().open();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(names,'readonly'),out={},reqs=names.map(name=>[name,tx.objectStore(name).getAll()]);
  let pending=reqs.length,failed=false;
  const fail=e=>{if(failed)return;failed=true;reject(e instanceof Error?e:new Error(String(e)));};
  for(const [name,r] of reqs){r.onsuccess=()=>{out[name]=r.result||[];if(--pending===0&&!failed)resolve(out);};r.onerror=()=>fail(r.error||new Error(`${name} の読込に失敗しました`));}
  tx.onabort=()=>fail(tx.error||new Error('データ読込が中断されました'));
  tx.onerror=()=>fail(tx.error||new Error('データ読込に失敗しました'));
 });
}
function descendants(locations,id){const out=new Set([id]);let changed=true;while(changed){changed=false;for(const x of locations){if(x.parentId&&out.has(x.parentId)&&!out.has(x.id)){out.add(x.id);changed=true;}}}return out;}
function categoryClosure(categories,ids){const byId=new Map(categories.map(x=>[x.id,x])),out=new Set(ids);for(const id of [...out]){let cur=byId.get(id),seen=new Set();while(cur?.parentId&&!seen.has(cur.parentId)){seen.add(cur.parentId);out.add(cur.parentId);cur=byId.get(cur.parentId);}}return out;}
async function recordJob(job){const raw=await getSetting('workJobs'),jobs=Array.isArray(raw)?raw:[];await putSetting('workJobs',[job,...jobs.filter(x=>x.jobId!==job.jobId)].slice(0,200));}
function jobMatches(a,b){
 if(!a||!b)return false;
 return a.jobId===b.jobId&&a.sourceDeviceId===b.sourceDeviceId&&String(a.sourceStoreName||'')===String(b.sourceStoreName||'')&&a.scopeId===b.scopeId&&String(a.build||'')===String(b.build||'')&&String(a.baselineDigest||'')===String(b.baselineDigest||'')&&sameStrings(a.scopeIds,b.scopeIds)&&sameStrings(a.productIds,b.productIds);
}
async function createPackage(scopeId){
 const snap=await readStores(['locations','products','lots','suppliers','categories','settings']);
 const {locations,products,lots,suppliers,categories,settings}=snap;
 if(settings.find(x=>x.key==='workSession')?.value)throw new Error('子機作業中は新しい共同作業を発行できません');
 const scope=locations.find(x=>x.id===scopeId);if(!scope)throw new Error('担当する保管場所が見つかりません');if(scope.active===false)throw new Error('使用停止中の保管場所は担当範囲にできません');
 const scopeIds=descendants(locations,scopeId);
 const selectedLots=lots.filter(l=>scopeIds.has(l.locationId));
 const productIds=new Set(selectedLots.map(l=>l.productId));
 for(const p of products)if(p.active!==false&&p.locationId&&scopeIds.has(p.locationId))productIds.add(p.id);
 const selectedProducts=products.filter(p=>p.active!==false&&productIds.has(p.id));
 if(!selectedProducts.length)throw new Error('選択した保管場所に使用中の商品がありません');
 const requiredLocationIds=new Set(scopeIds);
 for(const p of selectedProducts){if(p.locationId){requiredLocationIds.add(p.locationId);let cur=locations.find(x=>x.id===p.locationId);if(cur?.parentId)requiredLocationIds.add(cur.parentId);}}
 const selectedLocations=locations.filter(x=>requiredLocationIds.has(x.id));
 const supplierIds=new Set(selectedProducts.map(p=>p.supplierId).filter(Boolean)),selectedSuppliers=suppliers.filter(s=>supplierIds.has(s.id));
 const directCategories=new Set(selectedProducts.map(p=>p.categoryId).filter(Boolean)),categoryIds=categoryClosure(categories,directCategories),selectedCategories=categories.filter(c=>categoryIds.has(c.id));
 const allowedSettings=new Set(['storeName','expiryCautionDays','expiryWarningDays','fontSize']),selectedSettings=settings.filter(s=>allowedSettings.has(s.key));
 const sourceDeviceId=await ensureDeviceId(),sourceStoreName=selectedSettings.find(x=>x.key==='storeName')?.value||'';
 const baseline={products:clone(selectedProducts),lots:clone(selectedLots)},baselineDigest=await digestBaseline(baseline);
 const job={jobId:uid(),build:BUILD,baselineDigest,createdAt:now(),sourceDeviceId,sourceStoreName,scopeId,scopeName:scope.name||'担当範囲',scopeIds:[...scopeIds],productIds:selectedProducts.map(p=>p.id)};
 const data={settings:clone(selectedSettings),locations:clone(selectedLocations),suppliers:clone(selectedSuppliers),categories:clone(selectedCategories),products:clone(selectedProducts),lots:clone(selectedLots),transactions:[]};
 window.BackupService.validateData(data);
 const pkg={format:PACKAGE_FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:'2.x',build:BUILD,job,baseline,data};
 await recordJob({...job,status:'発行済み'});return pkg;
}
function normalizePackage(input){
 const obj=typeof input==='string'?JSON.parse(input):clone(input);
 if(obj?.format!==PACKAGE_FORMAT)throw new Error('共同作業ファイルではありません');
 if(obj.schemaVersion!==SCHEMA_VERSION)throw new Error('未対応の共同作業ファイルです');
 if(obj.build!==BUILD||obj.job?.build!==BUILD)throw new Error(`共同作業ファイルの版が一致しません（必要 ${BUILD}）`);
 safeJobId(obj.job?.jobId);safeId(obj.job?.sourceDeviceId,'発行端末ID');safeId(obj.job?.scopeId,'担当範囲ID');
 if(!Array.isArray(obj.job.productIds)||!obj.job.productIds.length||!Array.isArray(obj.job.scopeIds)||!obj.job.scopeIds.length)throw new Error('共同作業情報が不足しています');
 obj.job.productIds.forEach(x=>safeId(x,'商品ID'));obj.job.scopeIds.forEach(x=>safeId(x,'保管場所ID'));
 window.BackupService.validateData(obj.data);
 if(!same(obj.baseline?.products,obj.data.products)||!same(obj.baseline?.lots,obj.data.lots))throw new Error('開始時データが一致しません');
 return obj;
}
async function importPackage(input){
 const pkg=normalizePackage(input),deviceId=await ensureDeviceId(),d=await DB().open(),stores=DB().STORES;
 if(await getSetting('workSession'))throw new Error('すでに子機作業中です。先に現在の共同作業を終了してください');
 return new Promise((resolve,reject)=>{const tx=d.transaction(stores,'readwrite');try{
  for(const name of stores)tx.objectStore(name).clear();
  for(const s of ['locations','suppliers','categories','products','lots'])for(const item of pkg.data[s])tx.objectStore(s).put(clone(item));
  for(const item of pkg.data.settings)tx.objectStore('settings').put(clone(item));
  tx.objectStore('settings').put({key:'deviceId',value:deviceId});
  tx.objectStore('settings').put({key:'workSession',value:{job:clone(pkg.job),baseline:clone(pkg.baseline),startedAt:now(),resultExportedAt:null,resultDeliveredAt:null,resultDeliveredVia:null}});
 }catch(e){try{tx.abort();}catch(_){}reject(e);return;}
 tx.oncomplete=()=>resolve({job:pkg.job});tx.onerror=()=>reject(tx.error||new Error('共同作業の開始に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('共同作業の開始を中断しました'));});
}
function validateResult(obj){
 if(obj?.format!==RESULT_FORMAT)throw new Error('共同作業結果ファイルではありません');
 if(obj.schemaVersion!==SCHEMA_VERSION)throw new Error('未対応の共同作業結果です');
 if(obj.runtimeBuild!==obj.job?.build)throw new Error('作業ファイル作成時と子機のアプリ版が一致しません');
 safeJobId(obj.job?.jobId);safeId(obj.job?.sourceDeviceId,'発行端末ID');safeId(obj.childDeviceId,'子機端末ID');safeId(obj.job?.scopeId,'担当範囲ID');
 if(!Array.isArray(obj.job.productIds)||!obj.job.productIds.length||!Array.isArray(obj.job.scopeIds)||!obj.job.scopeIds.length||!Array.isArray(obj.finalLots)||!Array.isArray(obj.transactions))throw new Error('作業結果の情報が不足しています');
 const pids=new Set(),scopeIds=new Set(),lotIds=new Set(),txIds=new Set();
 if(!Array.isArray(obj.baseline?.products)||!Array.isArray(obj.baseline?.lots))throw new Error('作業開始時データが不足しています');
 for(const id of obj.job.productIds){safeId(id,'商品ID');if(pids.has(id))throw new Error('商品IDが重複しています');pids.add(id);}
 for(const id of obj.job.scopeIds){safeId(id,'保管場所ID');if(scopeIds.has(id))throw new Error('保管場所IDが重複しています');scopeIds.add(id);}
 const baselineProducts=new Map();
 for(const p of obj.baseline.products){safeId(p?.id,'開始時商品ID');if(!pids.has(p.id))throw new Error('担当外の商品が開始時データに含まれています');if(baselineProducts.has(p.id))throw new Error('開始時商品IDが重複しています');baselineProducts.set(p.id,p);}
 if(baselineProducts.size!==pids.size)throw new Error('開始時商品と担当商品の件数が一致しません');
 const baselineLotIds=new Set();
 for(const l of obj.baseline.lots){safeId(l?.id,'開始時ロットID');if(baselineLotIds.has(l.id))throw new Error('開始時ロットIDが重複しています');baselineLotIds.add(l.id);if(!pids.has(l.productId))throw new Error('担当外ロットが開始時データに含まれています');safeInteger(l.qty,'開始時ロット数量',{min:0,max:Number.MAX_SAFE_INTEGER});if(!scopeIds.has(l.locationId))throw new Error('担当外保管場所が開始時データに含まれています');}
 for(const l of obj.finalLots){
  safeId(l?.id,'ロットID');if(lotIds.has(l.id))throw new Error('作業結果のロットIDが重複しています');lotIds.add(l.id);
  safeId(l.productId,'ロット商品ID');if(!pids.has(l.productId))throw new Error('担当外商品のロットが含まれています');
  if(l.locationId!=null){safeId(l.locationId,'ロット保管場所ID');if(!scopeIds.has(l.locationId))throw new Error('担当外保管場所のロットが含まれています');}
  safeInteger(l.qty,'作業結果の数量',{min:0,max:Number.MAX_SAFE_INTEGER});
  if(!validDate(l.expiry))throw new Error('作業結果の賞味期限が不正です');
  if(l.receivedAt!=null&&!validDate(l.receivedAt))throw new Error('作業結果の入荷日が不正です');
 }
 const allowedTypes=new Set(['入荷','使用','廃棄','棚卸調整','期限別棚卸','賞味期限訂正']);
 for(const t of obj.transactions){
  safeId(t?.id,'履歴ID');if(txIds.has(t.id))throw new Error('作業履歴IDが重複しています');txIds.add(t.id);
  safeId(t.productId,'履歴商品ID');if(!pids.has(t.productId))throw new Error('担当外商品の履歴が含まれています');
  if(t.locationId!=null){safeId(t.locationId,'履歴保管場所ID');if(!scopeIds.has(t.locationId))throw new Error('担当外保管場所の履歴が含まれています');}
  if(t.lotId!=null)safeId(t.lotId,'履歴ロットID');
  safeInteger(t.qty,'作業履歴の数量',{min:-Number.MAX_SAFE_INTEGER,max:Number.MAX_SAFE_INTEGER});
  safeInteger(t.balance,'作業履歴の残数',{min:0,max:Number.MAX_SAFE_INTEGER});
  if(!allowedTypes.has(t.type))throw new Error('作業履歴の種類が不正です');
  if(t.type==='入荷'&&t.qty<=0)throw new Error('入荷履歴の数量符号が不正です');
  if((t.type==='使用'||t.type==='廃棄')&&t.qty>=0)throw new Error('使用・廃棄履歴の数量符号が不正です');
  if(t.type==='賞味期限訂正'&&t.qty!==0)throw new Error('賞味期限訂正履歴の数量が不正です');
  if((t.type==='棚卸調整'||t.type==='期限別棚卸')&&t.qty===0)throw new Error('棚卸履歴の数量が不正です');
  if(!validTimestamp(t.timestamp))throw new Error('作業履歴の日時が不正です');
  if(t.note!=null&&(typeof t.note!=='string'||t.note.length>1000))throw new Error('作業履歴のメモが不正です');
  if(t.reason!=null&&(typeof t.reason!=='string'||t.reason.length>200))throw new Error('作業履歴の理由が不正です');
 }
 for(const productId of pids){
  const before=obj.baseline.lots.filter(l=>l.productId===productId).reduce((sum,l)=>sum+l.qty,0);
  const after=obj.finalLots.filter(l=>l.productId===productId).reduce((sum,l)=>sum+l.qty,0);
  const history=obj.transactions.filter(t=>t.productId===productId).reduce((sum,t)=>sum+t.qty,0);
  if(after-before!==history)throw new Error('作業結果の在庫差分と履歴が一致しません');
 }
 return obj;
}
function normalizeResult(input){return validateResult(typeof input==='string'?JSON.parse(input):clone(input));}
async function exportResult(){
 const d=await DB().open();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(['settings','lots','transactions'],'readwrite'),settings=tx.objectStore('settings'),lots=tx.objectStore('lots'),transactions=tx.objectStore('transactions');
  const reqs={session:settings.get('workSession'),device:settings.get('deviceId'),lots:lots.getAll(),transactions:transactions.getAll()};
  const out={},keys=Object.keys(reqs);let pending=keys.length,done=false,result=null;
  const fail=e=>{if(done)return;done=true;try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};
  const finish=()=>{if(--pending>0||done)return;try{
    const session=out.session?.value;if(!session?.job)throw new Error('この端末は子機作業中ではありません');
    let deviceId=out.device?.value;if(!deviceId){deviceId=uid();settings.put({key:'deviceId',value:deviceId});}
    const pids=new Set(session.job.productIds);
    result=validateResult({format:RESULT_FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:'2.x',runtimeBuild:BUILD,exportedAt:now(),childDeviceId:deviceId,job:clone(session.job),baseline:clone(session.baseline),finalLots:clone((out.lots||[]).filter(l=>pids.has(l.productId))),transactions:clone((out.transactions||[]).filter(t=>pids.has(t.productId)))});
    settings.put({key:'workSession',value:{...clone(session),resultExportedAt:result.exportedAt}});
  }catch(e){fail(e);}};
  for(const k of keys){reqs[k].onsuccess=()=>{out[k]=reqs[k].result;finish();};reqs[k].onerror=()=>fail(reqs[k].error||new Error('作業結果の読込に失敗しました'));}
  tx.oncomplete=()=>{if(!done){done=true;resolve(result);}};
  tx.onerror=()=>fail(tx.error||new Error('作業結果の作成に失敗しました'));
  tx.onabort=()=>{if(!done){done=true;reject(tx.error||new Error('作業結果の作成を中断しました'));}};
 });
}
async function markResultDelivered(via){
 const session=await getSetting('workSession');if(!session?.resultExportedAt)throw new Error('先に作業結果を作成してください');
 await putSetting('workSession',{...session,resultDeliveredAt:now(),resultDeliveredVia:String(via||'保存')});
}
function totalQty(lots){return (lots||[]).reduce((s,l)=>s+Number(l.qty||0),0);}
function resultSummary(result){const typeCounts={};for(const t of result.transactions)typeCounts[t.type]=(typeCounts[t.type]||0)+1;const baselineQty=totalQty(result.baseline?.lots),finalQty=totalQty(result.finalLots);return{baselineQty,finalQty,delta:finalQty-baselineQty,transactionCount:result.transactions.length,typeCounts};}
function validateAgainstIssued(result,settings){
 const deviceId=settings.get('deviceId')||'',storeName=settings.get('storeName')||'',jobs=Array.isArray(settings.get('workJobs'))?settings.get('workJobs'):[];
 if(result.job.sourceDeviceId!==deviceId)throw new Error('この作業を発行したメイン機ではありません');
 if(String(result.job.sourceStoreName||'')!==String(storeName||''))throw new Error('店舗名が一致しません');
 const issued=jobs.find(x=>x.jobId===result.job.jobId);
 if(!issued)throw new Error('このメイン機の発行済み作業として確認できません');
 if(!jobMatches(result.job,issued))throw new Error('発行済み作業情報と結果ファイルが一致しません');
 return issued;
}
async function previewResult(input){
 if(await getSetting('workSession'))throw new Error('子機作業中の端末には作業結果を取り込めません');
 const result=normalizeResult(input),resultDigest=await digestBaseline(result.baseline),snap=await readStores(['settings','products','lots']),settingMap=new Map(snap.settings.map(x=>[x.key,x.value]));
 const issued=validateAgainstIssued(result,settingMap);if(resultDigest!==issued.baselineDigest)throw new Error('作業開始時データの整合性を確認できません');
 const imported=Array.isArray(settingMap.get('workImportedJobs'))?settingMap.get('workImportedJobs'):[];
 if(imported.some(x=>x.jobId===result.job.jobId))throw new Error('この共同作業結果は既に取り込み済みです');
 const pids=new Set(result.job.productIds),scopeIds=new Set(result.job.scopeIds),conflicts=[];
 if(!same(snap.products.filter(p=>pids.has(p.id)),result.baseline?.products||[]))conflicts.push('作業開始後に担当範囲の商品マスタが変更されています');
 if(!same(snap.lots.filter(l=>pids.has(l.productId)&&scopeIds.has(l.locationId)),result.baseline?.lots||[]))conflicts.push('作業開始後に担当範囲の在庫・ロットが変更されています');
 const outsideLotIds=new Set(snap.lots.filter(l=>!scopeIds.has(l.locationId)).map(l=>l.id));
 if(result.finalLots.some(l=>outsideLotIds.has(l.id)))conflicts.push('担当外在庫と同じロットIDが含まれています');
 return{result,conflicts,canCommit:conflicts.length===0,summary:resultSummary(result)};
}
async function commitResult(input){
 const result=normalizeResult(input?.result?input.result:input),resultDigest=await digestBaseline(result.baseline),pids=new Set(result.job.productIds),scopeIds=new Set(result.job.scopeIds),d=await DB().open();
 return new Promise((resolve,reject)=>{
  const tx=d.transaction(['products','lots','transactions','settings'],'readwrite'),ps=tx.objectStore('products'),ls=tx.objectStore('lots'),ts=tx.objectStore('transactions'),ss=tx.objectStore('settings');
  const reqs={products:ps.getAll(),lots:ls.getAll(),transactions:ts.getAll(),device:ss.get('deviceId'),store:ss.get('storeName'),imported:ss.get('workImportedJobs'),jobs:ss.get('workJobs'),session:ss.get('workSession')};
  const out={},keys=Object.keys(reqs);let pending=keys.length,finished=false,summary=null;
  const abort=e=>{if(finished)return;finished=true;try{tx.abort();}catch(_){}reject(e instanceof Error?e:new Error(String(e)));};
  const finishRead=()=>{if(--pending>0||finished)return;try{
    if(out.session?.value)throw new Error('子機作業中の端末には作業結果を取り込めません');
    const settingMap=new Map([['deviceId',out.device?.value],['storeName',out.store?.value],['workImportedJobs',out.imported?.value],['workJobs',out.jobs?.value]]);
    const issued=validateAgainstIssued(result,settingMap);if(resultDigest!==issued.baselineDigest)throw new Error('作業開始時データの整合性を確認できません');
    const imported=Array.isArray(out.imported?.value)?out.imported.value:[];
    if(imported.some(x=>x.jobId===result.job.jobId))throw new Error('この共同作業結果は既に取り込み済みです');
    const currentProducts=(out.products||[]).filter(p=>pids.has(p.id)),currentLots=(out.lots||[]).filter(l=>pids.has(l.productId)&&scopeIds.has(l.locationId)),outsideLots=(out.lots||[]).filter(l=>!scopeIds.has(l.locationId));
    if(!same(currentProducts,result.baseline?.products||[]))throw new Error('確定直前に担当範囲の商品マスタが変更されました');
    if(!same(currentLots,result.baseline?.lots||[]))throw new Error('確定直前に担当範囲の在庫・ロットが変更されました');
    const outsideLotIds=new Set(outsideLots.map(l=>l.id));
    if(result.finalLots.some(l=>outsideLotIds.has(l.id)))throw new Error('担当外在庫と同じロットIDが含まれています');
    const currentTxIds=new Set((out.transactions||[]).map(x=>x.id));for(const t of result.transactions)if(currentTxIds.has(t.id))throw new Error('同じ履歴IDが既に存在するため取り込めません');
    const jobs=Array.isArray(out.jobs?.value)?out.jobs.value:[],importedNext=[{jobId:result.job.jobId,scopeName:result.job.scopeName,childDeviceId:result.childDeviceId,importedAt:now()},...imported.filter(x=>x.jobId!==result.job.jobId)].slice(0,200),jobsNext=jobs.map(x=>x.jobId===result.job.jobId?{...x,status:'取込済み',importedAt:now()}:x);
    for(const l of currentLots)ls.delete(l.id);
    for(const l of result.finalLots)ls.put(clone(l));
    const outsideQtyByProduct=new Map();for(const l of outsideLots)outsideQtyByProduct.set(l.productId,(outsideQtyByProduct.get(l.productId)||0)+Number(l.qty||0));for(const t of result.transactions){const extra=outsideQtyByProduct.get(t.productId)||0;ts.put({...clone(t),balance:t.balance==null?null:Number(t.balance)+extra,workJobId:result.job.jobId,workDeviceId:result.childDeviceId||null});}
    ss.put({key:'workImportedJobs',value:importedNext});ss.put({key:'workJobs',value:jobsNext});
    summary=resultSummary(result);
  }catch(e){abort(e);}};
  for(const k of keys){reqs[k].onsuccess=()=>{out[k]=reqs[k].result;finishRead();};reqs[k].onerror=()=>abort(reqs[k].error||new Error('共同作業結果の確認に失敗しました'));}
  tx.oncomplete=()=>{if(!finished){finished=true;resolve(summary);}};
  tx.onerror=()=>abort(tx.error||new Error('共同作業結果の確定に失敗しました'));
  tx.onabort=()=>{if(!finished){finished=true;reject(tx.error||new Error('共同作業結果の確定を中断しました'));}};
 });
}
function filename(kind,payload){
 const d=new Date(),stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0'),store=safeName(payload.job?.sourceStoreName||'店舗'),scope=safeName(payload.job?.scopeName||'担当');
 return kind==='package'?`共同作業_${store}_${scope}_${stamp}.json`:`共同作業結果_${store}_${scope}_${stamp}.json`;
}
function downloadPayload(payload,name){const text=JSON.stringify(payload,null,2),blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function sharePayload(payload,name,title){const text=JSON.stringify(payload,null,2),file=new File([text],name,{type:'application/json'}),data={files:[file],title,text:title};if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share(data);return'shared';}downloadPayload(payload,name);return'downloaded';}
function msg(t){const e=document.getElementById('toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(msg.t);msg.t=setTimeout(()=>e.classList.remove('show'),3000);}
async function readFile(file){if(!file)throw new Error('ファイルを選択してください');if(file.size>20*1024*1024)throw new Error('ファイルが大きすぎます（上限20MB）');return file.text();}
let preparedPackage=null,preparedResult=null,pendingPreview=null;
async function renderJobs(){const box=document.getElementById('workJobList');if(!box)return;const raw=await getSetting('workJobs'),jobs=Array.isArray(raw)?raw:[];box.innerHTML=jobs.length?jobs.slice(0,10).map(j=>`<div class="list-item"><strong>${esc(j.scopeName||'担当範囲')}</strong><small>${esc(j.status||'発行済み')} / ${esc(String(j.createdAt||'').replace('T',' ').slice(0,16))} / ${esc(String(j.jobId||'').slice(0,8))}</small></div>`).join(''):'<div class="empty">発行履歴はありません。</div>';}
async function fillScopes(){const select=document.getElementById('workScopeSelect');if(!select)return;const locations=(await DB().getAll('locations')).filter(x=>x.active!==false&&!x.parentId).sort((a,b)=>(a.displayNumber??9999)-(b.displayNumber??9999)||String(a.name).localeCompare(String(b.name),'ja'));select.innerHTML='<option value="">担当する保管場所を選択</option>'+locations.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');}
function showPrepared(kind,payload){const box=document.getElementById(kind==='package'?'workPreparedPackage':'workPreparedResult');if(!box)return;box.textContent=payload?`${payload.job.scopeName} / 作業ID ${payload.job.jobId.slice(0,8)} / ${kind==='package'?payload.data.products.length+'商品':payload.transactions.length+'件の作業履歴'}`:'';box.classList.toggle('hidden',!payload);}
async function refreshModeUI(){
 const session=await getSetting('workSession'),banner=document.getElementById('workModeBanner'),normal=document.getElementById('workNormalPanel'),child=document.getElementById('workChildPanel'),importPanel=document.getElementById('workImportPanel');
 if(session?.job){
  if(banner){banner.classList.remove('hidden');banner.innerHTML=`<strong>子機作業モード${session.resultExportedAt?'（結果作成済み）':''}</strong><span>${esc(session.job.scopeName)} / 作業ID ${esc(session.job.jobId.slice(0,8))}</span>`;}
  normal?.classList.add('hidden');importPanel?.classList.add('hidden');child?.classList.remove('hidden');
  const info=document.getElementById('workChildInfo');if(info)info.textContent=`${session.job.sourceStoreName} / ${session.job.scopeName} / 開始 ${String(session.startedAt||'').replace('T',' ').slice(0,16)}${session.resultDeliveredAt?' / 結果保存・共有済み':''}`;
  for(const id of ['manageBtn','addLocationBtn','addProductBtn'])document.getElementById(id)?.classList.add('hidden');for(const id of ['settingsStoreName','expiryCautionDays','expiryWarningDays','saveSettingsBtn','restoreBackupFile','migrationFile','commitMigrationBtn','deleteAllDataBtn']){const el=document.getElementById(id);if(el)el.disabled=true;}
 }else{banner?.classList.add('hidden');normal?.classList.remove('hidden');importPanel?.classList.remove('hidden');child?.classList.add('hidden');for(const id of ['settingsStoreName','expiryCautionDays','expiryWarningDays','saveSettingsBtn','restoreBackupFile','migrationFile','deleteAllDataBtn']){const el=document.getElementById(id);if(el)el.disabled=false;}await fillScopes();await renderJobs();}
}
async function restoreOriginal(file){
 const backup=window.BackupService.normalizeBackup(await readFile(file)),session=await getSetting('workSession');
 if(!session?.resultDeliveredAt)throw new Error('先に共同作業結果を保存または共有してください。未保存のまま復元はできません');
 const store=backup.data.settings.find(x=>x.key==='storeName')?.value||'店舗名なし',when=backup.exportedAt?String(backup.exportedAt).replace('T',' ').slice(0,19):'作成日時不明';
 if(!confirm(`共同作業を終了し、次のバックアップへ戻します。\n店舗：${store}\n作成：${when}\n\n作業結果は ${session.resultDeliveredVia||'保存・共有'} 済みです。\n続行しますか？`))return false;
 await window.BackupService.replaceAll(backup);return true;
}
function bindUI(){
 document.addEventListener('click',e=>{if(!document.getElementById('workChildPanel')?.classList.contains('hidden')&&e.target.closest('.edit-product-btn,.inactive-edit-btn,.resume-product-btn,#manageBtn,#addLocationBtn,#addProductBtn')){e.preventDefault();e.stopImmediatePropagation();msg('子機作業中は商品・マスタ編集を行えません');}},true);
 document.getElementById('workBackupBtn')?.addEventListener('click',()=>document.getElementById('exportBackupBtn')?.click());
 document.getElementById('workScopeSelect')?.addEventListener('change',()=>{preparedPackage=null;showPrepared('package',null);});
 document.getElementById('prepareWorkPackageBtn')?.addEventListener('click',async()=>{try{const scopeId=document.getElementById('workScopeSelect').value;if(!scopeId)throw new Error('担当する保管場所を選択してください');preparedPackage=await createPackage(scopeId);showPrepared('package',preparedPackage);await renderJobs();msg('共同作業ファイルを準備しました');}catch(e){msg(e.message);}});
 document.getElementById('saveWorkPackageBtn')?.addEventListener('click',()=>{try{if(!preparedPackage)throw new Error('先に共同作業ファイルを作成してください');downloadPayload(preparedPackage,filename('package',preparedPackage));msg('共同作業ファイルを保存しました');}catch(e){msg(e.message);}});
 document.getElementById('shareWorkPackageBtn')?.addEventListener('click',async()=>{try{if(!preparedPackage)throw new Error('先に共同作業ファイルを作成してください');const r=await sharePayload(preparedPackage,filename('package',preparedPackage),'在庫管理 共同作業ファイル');if(r==='downloaded')msg('共有非対応のためファイルを保存しました');}catch(e){if(e?.name!=='AbortError'&&preparedPackage){downloadPayload(preparedPackage,filename('package',preparedPackage));msg('共有できなかったためファイルを保存しました');}}});
 document.getElementById('workPackageFile')?.addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;const pkg=normalizePackage(await readFile(file));if(!confirm(`子機作業を開始します。\n担当：${pkg.job.scopeName}\n商品：${pkg.data.products.length}件\n版：${pkg.job.build}\n\n現在の端末データは共同作業データに置き換わります。先に完全バックアップを保存してください。`))return;const key=prompt('誤操作防止のため「子機開始」と入力してください。');if(key!=='子機開始')throw new Error('子機作業を中止しました');await importPackage(pkg);msg('子機作業を開始します');setTimeout(()=>location.reload(),500);}catch(err){msg(err.message);}finally{e.target.value='';}});
 document.getElementById('prepareWorkResultBtn')?.addEventListener('click',async()=>{try{preparedResult=await exportResult();showPrepared('result',preparedResult);await refreshModeUI();msg('作業結果を準備しました。以後の在庫変更はロックされます');}catch(e){msg(e.message);}});
 document.getElementById('saveWorkResultBtn')?.addEventListener('click',async()=>{try{if(!preparedResult)throw new Error('先に作業結果を作成してください');downloadPayload(preparedResult,filename('result',preparedResult));await markResultDelivered('端末保存');await refreshModeUI();msg('作業結果を保存しました');}catch(e){msg(e.message);}});
 document.getElementById('shareWorkResultBtn')?.addEventListener('click',async()=>{try{if(!preparedResult)throw new Error('先に作業結果を作成してください');const r=await sharePayload(preparedResult,filename('result',preparedResult),'在庫管理 共同作業結果');await markResultDelivered(r==='shared'?'共有':'端末保存');await refreshModeUI();if(r==='downloaded')msg('共有非対応のため結果ファイルを保存しました');}catch(e){if(e?.name!=='AbortError')msg(e.message||'共有できませんでした');}});
 document.getElementById('workRestoreBackupFile')?.addEventListener('change',async e=>{try{if(await restoreOriginal(e.target.files?.[0])){msg('元のデータへ復元しました');setTimeout(()=>location.reload(),600);}}catch(err){msg('復元を中止しました: '+err.message);}finally{e.target.value='';}});
 document.getElementById('workResultFile')?.addEventListener('change',async e=>{const box=document.getElementById('workImportPreview'),commit=document.getElementById('commitWorkResultBtn');pendingPreview=null;commit?.classList.add('hidden');try{const preview=await previewResult(await readFile(e.target.files?.[0]));pendingPreview=preview;const s=preview.summary,types=Object.entries(s.typeCounts).map(([k,v])=>`${esc(k)} ${v}件`).join(' / ')||'履歴なし';box.innerHTML=`<h4>取込プレビュー</h4><p><strong>${esc(preview.result.job.scopeName)}</strong> / 作業ID ${esc(preview.result.job.jobId.slice(0,8))}</p><div class="count-grid"><span>開始 ${s.baselineQty}個</span><span>終了 ${s.finalQty}個</span><span>差分 ${s.delta>=0?'+':''}${s.delta}個</span><span>作業履歴 ${s.transactionCount}件</span></div><p class="note">${types}</p>${preview.conflicts.length?`<p class="error-text">${preview.conflicts.map(esc).join('<br>')}</p>`:'<p class="ok-text">開始時データとメイン機の現在状態は一致しています。確定反映できます。</p>'}`;box.classList.remove('hidden');if(preview.canCommit)commit?.classList.remove('hidden');}catch(err){box.innerHTML=`<p class="error-text">${esc(err.message)}</p>`;box.classList.remove('hidden');msg('作業結果を確認できませんでした');}finally{e.target.value='';}});
 document.getElementById('commitWorkResultBtn')?.addEventListener('click',async()=>{const btn=document.getElementById('commitWorkResultBtn');try{if(!pendingPreview)throw new Error('先に作業結果を読み込んでください');if(!confirm(`「${pendingPreview.result.job.scopeName}」の子機作業結果をメイン在庫へ確定反映します。\n\n続行しますか？`))return;btn.disabled=true;const s=await commitResult(pendingPreview);msg(`共同作業を反映しました（差分 ${s.delta>=0?'+':''}${s.delta}個）`);pendingPreview=null;btn.classList.add('hidden');await renderJobs();setTimeout(()=>location.reload(),700);}catch(e){msg(e.message);}finally{btn.disabled=false;}});
}
async function init(){try{bindUI();await refreshModeUI();}catch(e){console.error(e);}}
window.InventoryWork={BUILD,PACKAGE_FORMAT,RESULT_FORMAT,SCHEMA_VERSION,ensureDeviceId,createPackage,normalizePackage,importPackage,exportResult,normalizeResult,previewResult,commitResult,downloadPayload,sharePayload,filename,markResultDelivered};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();