(function workModule(){
'use strict';
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
async function getSetting(key){return (await DB().get('settings',key))?.value;}
async function putSetting(key,value){await DB().put('settings',{key,value});}
async function ensureDeviceId(){let id=await getSetting('deviceId');if(!id){id=uid();await putSetting('deviceId',id);}return id;}
function descendants(locations,id){const out=new Set([id]);let changed=true;while(changed){changed=false;for(const x of locations){if(x.parentId&&out.has(x.parentId)&&!out.has(x.id)){out.add(x.id);changed=true;}}}return out;}
function categoryClosure(categories,ids){const byId=new Map(categories.map(x=>[x.id,x])),out=new Set(ids);for(const id of [...out]){let cur=byId.get(id),seen=new Set();while(cur?.parentId&&!seen.has(cur.parentId)){seen.add(cur.parentId);out.add(cur.parentId);cur=byId.get(cur.parentId);}}return out;}
async function recordJob(job){const raw=await getSetting('workJobs'),jobs=Array.isArray(raw)?raw:[];await putSetting('workJobs',[job,...jobs.filter(x=>x.jobId!==job.jobId)].slice(0,50));}
async function createPackage(scopeId){
const [locations,products,lots,suppliers,categories,settings]=await Promise.all(['locations','products','lots','suppliers','categories','settings'].map(x=>DB().getAll(x)));
if(await getSetting('workSession'))throw new Error('子機作業中は新しい共同作業を発行できません');
const scope=locations.find(x=>x.id===scopeId);if(!scope)throw new Error('担当する保管場所が見つかりません');if(scope.active===false)throw new Error('使用停止中の保管場所は担当範囲にできません');
const scopeIds=descendants(locations,scopeId),selectedLocations=locations.filter(x=>scopeIds.has(x.id)),selectedProducts=products.filter(p=>p.active!==false&&scopeIds.has(p.locationId));
if(!selectedProducts.length)throw new Error('選択した保管場所に使用中の商品がありません');
const productIds=new Set(selectedProducts.map(p=>p.id)),selectedLots=lots.filter(l=>productIds.has(l.productId));
const supplierIds=new Set(selectedProducts.map(p=>p.supplierId).filter(Boolean)),selectedSuppliers=suppliers.filter(s=>supplierIds.has(s.id));
const directCategories=new Set(selectedProducts.map(p=>p.categoryId).filter(Boolean)),categoryIds=categoryClosure(categories,directCategories),selectedCategories=categories.filter(c=>categoryIds.has(c.id));
const allowedSettings=new Set(['storeName','expiryCautionDays','expiryWarningDays','fontSize']),selectedSettings=settings.filter(s=>allowedSettings.has(s.key));
const sourceDeviceId=await ensureDeviceId(),sourceStoreName=selectedSettings.find(x=>x.key==='storeName')?.value||'';
const job={jobId:uid(),createdAt:now(),sourceDeviceId,sourceStoreName,scopeId,scopeName:scope.name||'担当範囲',scopeIds:[...scopeIds],productIds:selectedProducts.map(p=>p.id)};
const data={settings:clone(selectedSettings),locations:clone(selectedLocations),suppliers:clone(selectedSuppliers),categories:clone(selectedCategories),products:clone(selectedProducts),lots:clone(selectedLots),transactions:[]};
window.BackupService.validateData(data);
const pkg={format:PACKAGE_FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:'2.x',job,baseline:{products:clone(selectedProducts),lots:clone(selectedLots)},data};
await recordJob({...job,status:'発行済み'});return pkg;
}
function normalizePackage(input){
const obj=typeof input==='string'?JSON.parse(input):clone(input);
if(obj?.format!==PACKAGE_FORMAT)throw new Error('共同作業ファイルではありません');
if(obj.schemaVersion!==SCHEMA_VERSION)throw new Error('未対応の共同作業ファイルです');
if(!obj.job?.jobId||!Array.isArray(obj.job.productIds)||!Array.isArray(obj.job.scopeIds))throw new Error('共同作業情報が不足しています');
window.BackupService.validateData(obj.data);
if(!same(obj.baseline?.products,obj.data.products)||!same(obj.baseline?.lots,obj.data.lots))throw new Error('開始時データが一致しません');
return obj;
}
async function importPackage(input){
const pkg=normalizePackage(input),deviceId=await ensureDeviceId(),d=await DB().open(),stores=DB().STORES;
return new Promise((resolve,reject)=>{const tx=d.transaction(stores,'readwrite');try{
for(const name of stores)tx.objectStore(name).clear();
for(const s of ['locations','suppliers','categories','products','lots'])for(const item of pkg.data[s])tx.objectStore(s).put(clone(item));
for(const item of pkg.data.settings)tx.objectStore('settings').put(clone(item));
tx.objectStore('settings').put({key:'deviceId',value:deviceId});
tx.objectStore('settings').put({key:'workSession',value:{job:clone(pkg.job),baseline:clone(pkg.baseline),startedAt:now()}});
}catch(e){try{tx.abort();}catch(_){}reject(e);return;}
tx.oncomplete=()=>resolve({job:pkg.job});tx.onerror=()=>reject(tx.error||new Error('共同作業の開始に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('共同作業の開始を中断しました'));});
}
function validateResult(obj){
if(obj?.format!==RESULT_FORMAT)throw new Error('共同作業結果ファイルではありません');
if(obj.schemaVersion!==SCHEMA_VERSION)throw new Error('未対応の共同作業結果です');
if(!obj.job?.jobId||!Array.isArray(obj.job.productIds)||!Array.isArray(obj.finalLots)||!Array.isArray(obj.transactions))throw new Error('作業結果の情報が不足しています');
const pids=new Set(obj.job.productIds),scopeIds=new Set(obj.job.scopeIds||[]),lotIds=new Set(),txIds=new Set();
for(const l of obj.finalLots){if(!l?.id||lotIds.has(l.id))throw new Error('作業結果のロットIDが不正です');lotIds.add(l.id);if(!pids.has(l.productId))throw new Error('担当外商品のロットが含まれています');if(l.locationId&&!scopeIds.has(l.locationId))throw new Error('担当外保管場所のロットが含まれています');if(!Number.isInteger(Number(l.qty))||Number(l.qty)<0)throw new Error('作業結果の数量が不正です');}
for(const t of obj.transactions){if(!t?.id||txIds.has(t.id))throw new Error('作業履歴IDが不正です');txIds.add(t.id);if(!pids.has(t.productId))throw new Error('担当外商品の履歴が含まれています');if(t.locationId&&!scopeIds.has(t.locationId))throw new Error('担当外保管場所の履歴が含まれています');if(!Number.isInteger(Number(t.qty)))throw new Error('作業履歴の数量が不正です');}
return obj;
}
function normalizeResult(input){return validateResult(typeof input==='string'?JSON.parse(input):clone(input));}
async function exportResult(){
const session=await getSetting('workSession');if(!session?.job)throw new Error('この端末は子機作業中ではありません');
const deviceId=await ensureDeviceId(),pids=new Set(session.job.productIds),[lots,transactions]=await Promise.all([DB().getAll('lots'),DB().getAll('transactions')]);
return validateResult({format:RESULT_FORMAT,schemaVersion:SCHEMA_VERSION,appVersion:'2.x',exportedAt:now(),childDeviceId:deviceId,job:clone(session.job),baseline:clone(session.baseline),finalLots:clone(lots.filter(l=>pids.has(l.productId))),transactions:clone(transactions.filter(t=>pids.has(t.productId)))});
}
function totalQty(lots){return (lots||[]).reduce((s,l)=>s+Number(l.qty||0),0);}
async function previewResult(input){
if(await getSetting('workSession'))throw new Error('子機作業中の端末には作業結果を取り込めません');
const result=normalizeResult(input),deviceId=await ensureDeviceId(),storeName=await getSetting('storeName')||'';
if(result.job.sourceDeviceId!==deviceId)throw new Error('この作業を発行したメイン機ではありません');
if(String(result.job.sourceStoreName||'')!==String(storeName||''))throw new Error('店舗名が一致しません');
const importedRaw=await getSetting('workImportedJobs'),imported=Array.isArray(importedRaw)?importedRaw:[];
if(imported.some(x=>x.jobId===result.job.jobId))throw new Error('この共同作業結果は既に取り込み済みです');
const pids=new Set(result.job.productIds),[products,lots]=await Promise.all([DB().getAll('products'),DB().getAll('lots')]),conflicts=[];
if(!same(products.filter(p=>pids.has(p.id)),result.baseline?.products||[]))conflicts.push('作業開始後に担当範囲の商品マスタが変更されています');
if(!same(lots.filter(l=>pids.has(l.productId)),result.baseline?.lots||[]))conflicts.push('作業開始後に担当範囲の在庫・ロットが変更されています');
const typeCounts={};for(const t of result.transactions)typeCounts[t.type]=(typeCounts[t.type]||0)+1;
const baselineQty=totalQty(result.baseline?.lots),finalQty=totalQty(result.finalLots);
return{result,conflicts,canCommit:conflicts.length===0,summary:{baselineQty,finalQty,delta:finalQty-baselineQty,transactionCount:result.transactions.length,typeCounts}};
}
async function commitResult(input){
const fresh=await previewResult(input?.result?input.result:input);if(!fresh.canCommit)throw new Error(fresh.conflicts.join(' / '));
const result=fresh.result,pids=new Set(result.job.productIds);
const [currentLots,currentTx,importedRaw,jobsRaw]=await Promise.all([DB().getAll('lots'),DB().getAll('transactions'),getSetting('workImportedJobs'),getSetting('workJobs')]);
const currentTxIds=new Set(currentTx.map(x=>x.id));for(const t of result.transactions)if(currentTxIds.has(t.id))throw new Error('同じ履歴IDが既に存在するため取り込めません');
const imported=Array.isArray(importedRaw)?importedRaw:[],jobs=Array.isArray(jobsRaw)?jobsRaw:[];
const importedNext=[{jobId:result.job.jobId,scopeName:result.job.scopeName,childDeviceId:result.childDeviceId,importedAt:now()},...imported.filter(x=>x.jobId!==result.job.jobId)].slice(0,100);
const jobsNext=jobs.map(x=>x.jobId===result.job.jobId?{...x,status:'取込済み',importedAt:now()}:x),d=await DB().open();
return new Promise((resolve,reject)=>{const tx=d.transaction(['lots','transactions','settings'],'readwrite'),ls=tx.objectStore('lots'),ts=tx.objectStore('transactions'),ss=tx.objectStore('settings');try{
for(const l of currentLots)if(pids.has(l.productId))ls.delete(l.id);
for(const l of result.finalLots)ls.put(clone(l));
for(const t of result.transactions)ts.put({...clone(t),workJobId:result.job.jobId,workDeviceId:result.childDeviceId||null});
ss.put({key:'workImportedJobs',value:importedNext});ss.put({key:'workJobs',value:jobsNext});
}catch(e){try{tx.abort();}catch(_){}reject(e);return;}
tx.oncomplete=()=>resolve(fresh.summary);tx.onerror=()=>reject(tx.error||new Error('共同作業結果の確定に失敗しました'));tx.onabort=()=>reject(tx.error||new Error('共同作業結果の確定を中断しました'));});
}
function filename(kind,payload){
const d=new Date(),stamp=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0'),store=safeName(payload.job?.sourceStoreName||'店舗'),scope=safeName(payload.job?.scopeName||'担当');
return kind==='package'?`共同作業_${store}_${scope}_${stamp}.json`:`共同作業結果_${store}_${scope}_${stamp}.json`;
}
function downloadPayload(payload,name){const text=JSON.stringify(payload,null,2),blob=new Blob([text],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function sharePayload(payload,name,title){const text=JSON.stringify(payload,null,2),file=new File([text],name,{type:'text/plain'}),data={files:[file],title,text:title};if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share(data);return'shared';}downloadPayload(payload,name);return'downloaded';}
function msg(t){const e=document.getElementById('toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(msg.t);msg.t=setTimeout(()=>e.classList.remove('show'),3000);}
async function readFile(file){if(!file)throw new Error('ファイルを選択してください');return file.text();}
let preparedPackage=null,preparedResult=null,pendingPreview=null;
async function renderJobs(){const box=document.getElementById('workJobList');if(!box)return;const raw=await getSetting('workJobs'),jobs=Array.isArray(raw)?raw:[];box.innerHTML=jobs.length?jobs.slice(0,10).map(j=>`<div class="list-item"><strong>${esc(j.scopeName||'担当範囲')}</strong><small>${esc(j.status||'発行済み')} / ${esc(String(j.createdAt||'').replace('T',' ').slice(0,16))} / ${esc(String(j.jobId||'').slice(0,8))}</small></div>`).join(''):'<div class="empty">発行履歴はありません。</div>';}
async function fillScopes(){const select=document.getElementById('workScopeSelect');if(!select)return;const locations=(await DB().getAll('locations')).filter(x=>x.active!==false&&!x.parentId).sort((a,b)=>(a.displayNumber??9999)-(b.displayNumber??9999)||String(a.name).localeCompare(String(b.name),'ja'));select.innerHTML='<option value="">担当する保管場所を選択</option>'+locations.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');}
function showPrepared(kind,payload){const box=document.getElementById(kind==='package'?'workPreparedPackage':'workPreparedResult');if(!box)return;box.textContent=payload?`${payload.job.scopeName} / 作業ID ${payload.job.jobId.slice(0,8)} / ${kind==='package'?payload.data.products.length+'商品':payload.transactions.length+'件の作業履歴'}`:'';box.classList.toggle('hidden',!payload);}
async function refreshModeUI(){
const session=await getSetting('workSession'),banner=document.getElementById('workModeBanner'),normal=document.getElementById('workNormalPanel'),child=document.getElementById('workChildPanel'),importPanel=document.getElementById('workImportPanel');
if(session?.job){
if(banner){banner.classList.remove('hidden');banner.innerHTML=`<strong>子機作業モード</strong><span>${esc(session.job.scopeName)} / 作業ID ${esc(session.job.jobId.slice(0,8))}</span>`;}
normal?.classList.add('hidden');importPanel?.classList.add('hidden');child?.classList.remove('hidden');
const info=document.getElementById('workChildInfo');if(info)info.textContent=`${session.job.sourceStoreName} / ${session.job.scopeName} / 開始 ${String(session.startedAt||'').replace('T',' ').slice(0,16)}`;
for(const id of ['manageBtn','addLocationBtn','addProductBtn'])document.getElementById(id)?.classList.add('hidden');
}else{banner?.classList.add('hidden');normal?.classList.remove('hidden');importPanel?.classList.remove('hidden');child?.classList.add('hidden');await fillScopes();await renderJobs();}
}
async function restoreOriginal(file){const backup=window.BackupService.normalizeBackup(await readFile(file));if(!confirm('共同作業を終了し、このバックアップで端末データを元に戻します。\\n作業結果ファイルを保存・共有済みであることを確認してください。\\n\\n続行しますか？'))return false;await window.BackupService.replaceAll(backup);return true;}
function bindUI(){
document.addEventListener('click',e=>{if(!document.getElementById('workChildPanel')?.classList.contains('hidden')&&e.target.closest('.edit-product-btn,.inactive-edit-btn,.resume-product-btn,#manageBtn,#addLocationBtn,#addProductBtn')){e.preventDefault();e.stopImmediatePropagation();msg('子機作業中は商品・マスタ編集を行えません');}},true);
document.getElementById('workBackupBtn')?.addEventListener('click',()=>document.getElementById('exportBackupBtn')?.click());
document.getElementById('workScopeSelect')?.addEventListener('change',()=>{preparedPackage=null;showPrepared('package',null);});
document.getElementById('prepareWorkPackageBtn')?.addEventListener('click',async()=>{try{const scopeId=document.getElementById('workScopeSelect').value;if(!scopeId)throw new Error('担当する保管場所を選択してください');preparedPackage=await createPackage(scopeId);showPrepared('package',preparedPackage);await renderJobs();msg('共同作業ファイルを準備しました');}catch(e){msg(e.message);}});
document.getElementById('saveWorkPackageBtn')?.addEventListener('click',()=>{try{if(!preparedPackage)throw new Error('先に共同作業ファイルを作成してください');downloadPayload(preparedPackage,filename('package',preparedPackage));msg('共同作業ファイルを保存しました');}catch(e){msg(e.message);}});
document.getElementById('shareWorkPackageBtn')?.addEventListener('click',async()=>{try{if(!preparedPackage)throw new Error('先に共同作業ファイルを作成してください');const r=await sharePayload(preparedPackage,filename('package',preparedPackage),'在庫管理 共同作業ファイル');if(r==='downloaded')msg('共有非対応のためファイルを保存しました');}catch(e){if(e?.name!=='AbortError'&&preparedPackage){downloadPayload(preparedPackage,filename('package',preparedPackage));msg('共有できなかったためファイルを保存しました');}}});
document.getElementById('workPackageFile')?.addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;const pkg=normalizePackage(await readFile(file));if(!confirm(`子機作業を開始します。\\n担当：${pkg.job.scopeName}\\n商品：${pkg.data.products.length}件\\n\\n現在の端末データは共同作業データに置き換わります。先に完全バックアップを保存してください。`))return;const key=prompt('誤操作防止のため「子機開始」と入力してください。');if(key!=='子機開始')throw new Error('子機作業を中止しました');await importPackage(pkg);msg('子機作業を開始します');setTimeout(()=>location.reload(),500);}catch(err){msg(err.message);}finally{e.target.value='';}});
document.getElementById('prepareWorkResultBtn')?.addEventListener('click',async()=>{try{preparedResult=await exportResult();showPrepared('result',preparedResult);msg('作業結果を準備しました。以後は在庫を変更せず共有してください');}catch(e){msg(e.message);}});
document.getElementById('saveWorkResultBtn')?.addEventListener('click',()=>{try{if(!preparedResult)throw new Error('先に作業結果を作成してください');downloadPayload(preparedResult,filename('result',preparedResult));msg('作業結果を保存しました');}catch(e){msg(e.message);}});
document.getElementById('shareWorkResultBtn')?.addEventListener('click',async()=>{try{if(!preparedResult)throw new Error('先に作業結果を作成してください');const r=await sharePayload(preparedResult,filename('result',preparedResult),'在庫管理 共同作業結果');if(r==='downloaded')msg('共有非対応のため結果ファイルを保存しました');}catch(e){if(e?.name!=='AbortError'&&preparedResult){downloadPayload(preparedResult,filename('result',preparedResult));msg('共有できなかったため結果ファイルを保存しました');}}});
document.getElementById('workRestoreBackupFile')?.addEventListener('change',async e=>{try{if(await restoreOriginal(e.target.files?.[0])){msg('元のデータへ復元しました');setTimeout(()=>location.reload(),600);}}catch(err){msg('復元を中止しました: '+err.message);}finally{e.target.value='';}});
document.getElementById('workResultFile')?.addEventListener('change',async e=>{const box=document.getElementById('workImportPreview'),commit=document.getElementById('commitWorkResultBtn');pendingPreview=null;commit?.classList.add('hidden');try{const preview=await previewResult(await readFile(e.target.files?.[0]));pendingPreview=preview;const s=preview.summary,types=Object.entries(s.typeCounts).map(([k,v])=>`${esc(k)} ${v}件`).join(' / ')||'履歴なし';box.innerHTML=`<h4>取込プレビュー</h4><p><strong>${esc(preview.result.job.scopeName)}</strong> / 作業ID ${esc(preview.result.job.jobId.slice(0,8))}</p><div class="count-grid"><span>開始 ${s.baselineQty}個</span><span>終了 ${s.finalQty}個</span><span>差分 ${s.delta>=0?'+':''}${s.delta}個</span><span>作業履歴 ${s.transactionCount}件</span></div><p class="note">${types}</p>${preview.conflicts.length?`<p class="error-text">${preview.conflicts.map(esc).join('<br>')}</p>`:'<p class="ok-text">開始時データとメイン機の現在状態は一致しています。確定反映できます。</p>'}`;box.classList.remove('hidden');if(preview.canCommit)commit?.classList.remove('hidden');}catch(err){box.innerHTML=`<p class="error-text">${esc(err.message)}</p>`;box.classList.remove('hidden');msg('作業結果を確認できませんでした');}finally{e.target.value='';}});
document.getElementById('commitWorkResultBtn')?.addEventListener('click',async()=>{try{if(!pendingPreview)throw new Error('先に作業結果を読み込んでください');if(!confirm(`「${pendingPreview.result.job.scopeName}」の子機作業結果をメイン在庫へ確定反映します。\\n\\n続行しますか？`))return;const s=await commitResult(pendingPreview);msg(`共同作業を反映しました（差分 ${s.delta>=0?'+':''}${s.delta}個）`);pendingPreview=null;document.getElementById('commitWorkResultBtn')?.classList.add('hidden');await renderJobs();setTimeout(()=>location.reload(),700);}catch(e){msg(e.message);}});
}
async function init(){try{await ensureDeviceId();bindUI();await refreshModeUI();}catch(e){console.error(e);}}
window.InventoryWork={PACKAGE_FORMAT,RESULT_FORMAT,SCHEMA_VERSION,ensureDeviceId,createPackage,normalizePackage,importPackage,exportResult,normalizeResult,previewResult,commitResult,downloadPayload,sharePayload,filename};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();