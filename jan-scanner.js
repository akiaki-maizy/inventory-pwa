(()=>{
'use strict';
const supported='BarcodeDetector' in window;
let detector=null,stream=null,raf=null,overlay=null,video=null,busy=false;

async function getProducts(){
  if(typeof getAll!=='function') return [];
  return await getAll('products');
}
function normalizeJan(v){return String(v||'').replace(/\D/g,'');}
async function findByJan(jan){return (await getProducts()).find(p=>normalizeJan(p.jan)===jan);}
async function handleJan(jan){
  jan=normalizeJan(jan); if(!jan||busy)return; busy=true; await stopScanner();
  const p=await findByJan(jan);
  if(p){ if(typeof openProduct==='function') await openProduct(p.id); alert(`JAN ${jan}\n登録済みの商品を開きました。`); }
  else{
    if(typeof showView==='function') showView('addProduct');
    const input=document.getElementById('productJan'); if(input) input.value=jan;
    alert(`JAN ${jan}\n未登録の商品です。商品名などを入力して登録してください。`);
  }
  busy=false;
}
async function stopScanner(){
  if(raf)cancelAnimationFrame(raf);raf=null;
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
  if(overlay)overlay.remove();overlay=null;video=null;
}
async function scanLoop(){
  if(!video||!detector)return;
  try{const codes=await detector.detect(video);if(codes.length){await handleJan(codes[0].rawValue);return;}}catch(e){}
  raf=requestAnimationFrame(scanLoop);
}
async function startScanner(){
  if(!supported){const jan=prompt('この端末ではカメラ読取を利用できません。JANコードを入力してください。');if(jan)handleJan(jan);return;}
  try{
    detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    overlay=document.createElement('div');overlay.style='position:fixed;inset:0;background:#000;z-index:9999;display:flex;flex-direction:column;';
    overlay.innerHTML='<div style="padding:12px;background:#111;color:#fff;display:flex;gap:10px;align-items:center"><strong style="flex:1">JANコードを枠内に映してください</strong><button id="janClose" style="min-height:44px">閉じる</button></div><div style="position:relative;flex:1;overflow:hidden"><video id="janVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video><div style="position:absolute;left:8%;right:8%;top:38%;height:24%;border:4px solid #fff;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.25)"></div></div>';
    document.body.appendChild(overlay);video=overlay.querySelector('#janVideo');video.srcObject=stream;overlay.querySelector('#janClose').onclick=stopScanner;await video.play();scanLoop();
  }catch(e){await stopScanner();const jan=prompt('カメラを開始できませんでした。JANコードを手入力してください。');if(jan)handleJan(jan);}
}
function addButtons(){
  if(document.getElementById('janScanHome'))return;
  const grid=document.querySelector('#view-home .grid');
  if(grid){const b=document.createElement('button');b.id='janScanHome';b.className='big';b.textContent='JANで商品を探す';b.onclick=startScanner;grid.insertBefore(b,grid.firstChild);}
  const jan=document.getElementById('productJan');
  if(jan){const b=document.createElement('button');b.type='button';b.className='secondary';b.style='margin-top:8px;width:100%';b.textContent='カメラでJANを読み取る';b.onclick=startScanner;jan.insertAdjacentElement('afterend',b);}
}
window.addEventListener('load',()=>setTimeout(addButtons,300));
window.addEventListener('pagehide',stopScanner);
})();