(()=>{
'use strict';
const ZXING_URL='https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
const nativeSupported='BarcodeDetector' in window;
const cameraSupported=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
let detector=null,stream=null,raf=null,overlay=null,video=null,busy=false,zxingControls=null,zxingLoading=null,scanHintTimer=null;

async function getProducts(){if(typeof getAll!=='function')return[];return await getAll('products');}
function normalizeJan(v){return String(v||'').replace(/\D/g,'');}
function looksLikeJan(v){const s=normalizeJan(v);return s.length===8||s.length===12||s.length===13;}
async function findByJan(jan){return(await getProducts()).find(p=>normalizeJan(p.jan)===jan);}
async function handleJan(jan){
 jan=normalizeJan(jan);if(!jan||busy)return;
 if(!looksLikeJan(jan)){const retry=prompt(`読み取ったコード「${jan}」はJANとして認識できませんでした。JANコードを入力してください。`,jan);if(retry&&looksLikeJan(retry))return handleJan(retry);return;}
 busy=true;await stopScanner();const p=await findByJan(jan);
 if(p){if(typeof openProduct==='function')await openProduct(p.id);alert(`JAN ${jan}\n登録済みの商品を開きました。`);}else{if(typeof showView==='function')showView('addProduct');const input=document.getElementById('productJan');if(input)input.value=jan;alert(`JAN ${jan}\n未登録の商品です。商品名などを入力して登録してください。`);}busy=false;
}
function manualInput(message='JANコードを入力してください。'){const jan=prompt(message);if(jan)handleJan(jan);}
async function stopScanner(){
 if(scanHintTimer)clearTimeout(scanHintTimer);scanHintTimer=null;
 if(raf)cancelAnimationFrame(raf);raf=null;
 if(zxingControls){try{zxingControls.stop();}catch(e){}zxingControls=null;}
 if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
 if(overlay)overlay.remove();overlay=null;video=null;detector=null;
}
function createOverlay(modeText){
 overlay=document.createElement('div');overlay.style='position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;';
 overlay.innerHTML=`<div style="padding:12px;background:#111;color:#fff;display:flex;gap:10px;align-items:center"><div style="flex:1"><strong>JANコードを横向きに枠内へ</strong><div id="janStatus" style="font-size:12px;opacity:.85;margin-top:3px">${modeText} / 読み取り中…</div></div><button id="janClose" style="min-height:44px">閉じる</button></div><div style="position:relative;flex:1;overflow:hidden"><video id="janVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video><div style="position:absolute;left:5%;right:5%;top:40%;height:20%;border:4px solid #fff;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.20)"></div><div style="position:absolute;left:10%;right:10%;bottom:7%;padding:8px;background:rgba(0,0,0,.55);color:#fff;text-align:center;border-radius:8px;font-size:13px">バーコード全体が枠内に入る距離で、数秒静止してください</div></div>`;
 document.body.appendChild(overlay);video=overlay.querySelector('#janVideo');overlay.querySelector('#janClose').onclick=stopScanner;
 scanHintTimer=setTimeout(()=>{const s=overlay&&overlay.querySelector('#janStatus');if(s)s.textContent=modeText+' / 読めない場合は10〜20cm離して明るい場所で試してください';},7000);
}
async function improveFocusFromVideo(){
 try{
  const st=video&&video.srcObject;if(!st)return;const track=st.getVideoTracks()[0];if(!track)return;
  const caps=track.getCapabilities?track.getCapabilities():{};
  const advanced={};
  if(caps.focusMode&&caps.focusMode.includes('continuous'))advanced.focusMode='continuous';
  if(caps.zoom&&typeof caps.zoom.min==='number'&&typeof caps.zoom.max==='number')advanced.zoom=Math.min(caps.zoom.max,Math.max(caps.zoom.min,1));
  if(Object.keys(advanced).length)await track.applyConstraints({advanced:[advanced]});
 }catch(e){}
}
async function scanNative(){
 detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
 stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});
 createOverlay('標準カメラ読取');video.srcObject=stream;await video.play();await improveFocusFromVideo();
 const loop=async()=>{if(!video||!detector)return;try{const codes=await detector.detect(video);if(codes.length){await handleJan(codes[0].rawValue);return;}}catch(e){}raf=requestAnimationFrame(loop);};loop();
}
function loadZXing(){
 if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);if(zxingLoading)return zxingLoading;
 zxingLoading=new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-zxing-fallback]');if(existing){existing.addEventListener('load',()=>resolve(window.ZXingBrowser));existing.addEventListener('error',reject);return;}const s=document.createElement('script');s.src=ZXING_URL;s.async=true;s.dataset.zxingFallback='1';s.onload=()=>window.ZXingBrowser?resolve(window.ZXingBrowser):reject(new Error('ZXingを読み込めませんでした'));s.onerror=()=>reject(new Error('ZXingの取得に失敗しました'));document.head.appendChild(s);});return zxingLoading;
}
async function scanZXing(){
 const ZX=await loadZXing();if(!ZX)throw new Error('ZXingが利用できません');
 createOverlay('互換カメラ読取');
 const Reader=ZX.BrowserMultiFormatOneDReader||ZX.BrowserMultiFormatReader;if(!Reader)throw new Error('1D readerがありません');
 const reader=new Reader();
 const constraints={video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false};
 zxingControls=await reader.decodeFromConstraints(constraints,video,(result,error,controls)=>{
  if(result&&!busy){zxingControls=controls;const text=result.getText?result.getText():result.text||'';handleJan(text);}
 });
 stream=video&&video.srcObject||null;await improveFocusFromVideo();
}
async function startScanner(){
 if(!cameraSupported){manualInput('このブラウザではカメラを利用できません。JANコードを入力してください。');return;}
 try{if(nativeSupported){await scanNative();return;}await scanZXing();}catch(e){console.warn('JAN scanner error',e);await stopScanner();manualInput('カメラ読取を開始できませんでした。JANコードを手入力してください。');}
}
function featureLabel(){if(nativeSupported&&cameraSupported)return'JAN読取: 標準カメラ';if(cameraSupported)return'JAN読取: 互換カメラ';return'JAN読取: 手入力';}
function addButtons(){
 if(document.getElementById('janScanHome'))return;const grid=document.querySelector('#view-home .grid');if(grid){const b=document.createElement('button');b.id='janScanHome';b.className='big';b.textContent='JANで商品を探す';b.onclick=startScanner;grid.insertBefore(b,grid.firstChild);}const jan=document.getElementById('productJan');if(jan){const b=document.createElement('button');b.type='button';b.className='secondary';b.style='margin-top:8px;width:100%';b.textContent='カメラでJANを読み取る';b.onclick=startScanner;jan.insertAdjacentElement('afterend',b);}const footer=document.querySelector('footer');if(footer){const s=document.createElement('div');s.style='margin-top:4px';s.textContent=featureLabel();footer.appendChild(s);}
}
window.InventoryJanScanner={start:startScanner,stop:stopScanner,features:{indexedDB:'indexedDB'in window,serviceWorker:'serviceWorker'in navigator,camera:cameraSupported,barcodeDetector:nativeSupported}};
window.addEventListener('load',()=>setTimeout(addButtons,300));window.addEventListener('pagehide',stopScanner);
})();