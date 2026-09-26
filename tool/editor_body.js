const CW=1000, CH=1400, MW=400, MH=560;
const $ = id => document.getElementById(id);
const cv = $('view'), ctx = cv.getContext('2d');
const wc = document.createElement('canvas'); wc.width=MW; wc.height=MH;
const wctx = wc.getContext('2d', {willReadFrequently:true});
const undoStack = [], redoStack = [];
let brushPos = null;
function pushUndo(){
  undoStack.push(wctx.getImageData(0,0,MW,MH));
  if(undoStack.length > 25) undoStack.shift();
  redoStack.length = 0;
}
function undo(){ if(!undoStack.length) return;
  redoStack.push(wctx.getImageData(0,0,MW,MH));
  wctx.putImageData(undoStack.pop(), 0, 0); draw(); }
function redo(){ if(!redoStack.length) return;
  undoStack.push(wctx.getImageData(0,0,MW,MH));
  wctx.putImageData(redoStack.pop(), 0, 0); draw(); }

let role = null, cfg = null;
let origPortrait = null, rawNewImg = null, importedAligned = null;
let windImg = null, atlasImg = null;
let data609 = [];
let mats = {eyes: null, wind: null};
let crop = {x:500, y:700, w:118, h:118};
let origCrop = null;
let baseMode = 0, onion = false, fitMode = false;
const fit = {scale: 1, ox: 0, oy: 0};
let halfBox = {cx: 500, cy: 660, size: 900};
let iconBox = {cx: 500, cy: 545, w: 460};
let selBones = [], boneClip = null, drag = null;
const bonesCache = document.createElement('canvas'); bonesCache.width=CW; bonesCache.height=CH;
let bonesDirty = true;
function renderBonesCache(){
  const b = bonesCache.getContext('2d');
  b.clearRect(0,0,CW,CH);
  const s = +$('boneSize').value;
  b.fillStyle='rgba(170,170,180,0.5)';
  for(let r=0;r<29;r++) for(let c=0;c<21;c++){
    const p = data609[r*21+c];
    if(Math.abs(p[0])+Math.abs(p[1])+Math.abs(p[2]) > 1e-6) continue;
    b.beginPath(); b.arc(c*50, gridRowY(r), 3, 0, 7); b.fill();
  }
  for(let i=0;i<data609.length;i++){
    const p = data609[i], mag = Math.abs(p[1]);
    if(mag <= 1e-6) continue;
    const t = Math.min(1, mag/0.75);
    b.fillStyle = 'rgba(255,'+(255-Math.round(190*t))+',0,0.9)';
    b.beginPath(); b.arc((i%21)*50, gridRowY((i/21)|0), s, 0, 7); b.fill();
  }
  bonesDirty = false;
}

function loadImage(url){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('load fail: '+url)); i.src=url; }); }
function curTool(){ return document.querySelector('input[name=tool]:checked').value; }
function syncNums(){ $('cx').value=Math.round(crop.x); $('cy').value=Math.round(crop.y); $('cw').value=Math.round(crop.w); $('ch').value=Math.round(crop.h); }
function syncFit(){ $('fitScale').value = Math.round(fit.scale*100); }
function defaultFitFor(img){ const s = Math.min(CW/img.width, CH/img.height); return {scale: s, ox: (CW-img.width*s)/2, oy: (CH-img.height*s)/2}; }
// grid row 0 is the canvas BOTTOM in the game mesh (and GL preview), so the
// editor overlay must draw row r at y=(28-r)*50 — not r*50.
function gridRowY(r){ return (28-r)*50; }
function gridPos(i){ return [(i%21)*50, gridRowY((i/21)|0)]; }
function gridIndex(mx,my){ const c=Math.max(0,Math.min(20,Math.round(mx/50))); const r=Math.max(0,Math.min(28,Math.round((CH-my)/50))); return r*21+c; }
function boxHandles(cx,cy,hw,hh){ return [[cx-hw,cy-hh],[cx,cy-hh],[cx+hw,cy-hh],[cx+hw,cy],[cx+hw,cy+hh],[cx,cy+hh],[cx-hw,cy+hh],[cx-hw,cy]]; }
function handles(){ const x=crop.x-crop.w/2, y=CH-crop.y-crop.h/2; return boxHandles(x+crop.w/2, y+crop.h/2, crop.w/2, crop.h/2); }
function alignedCanvas(){
  const c = document.createElement('canvas'); c.width=CW; c.height=CH;
  if(importedAligned) c.getContext('2d').drawImage(importedAligned, 0, 0);
  else if(rawNewImg) c.getContext('2d').drawImage(rawNewImg, fit.ox, fit.oy, rawNewImg.width*fit.scale, rawNewImg.height*fit.scale);
  return c;
}
let __alignedCv = null, __alignedDirty = true;
function alignedCanvasCached(){
  if(__alignedDirty || !__alignedCv){ __alignedCv = alignedCanvas(); __alignedDirty = false; }
  return __alignedCv;
}
function applyMatDefaults(){
  const e = (mats.eyes && mats.eyes.floats) || {};
  $('pFps').value = (e._FPS !== undefined) ? e._FPS : 14;
  $('pPause').value = (e._PauseTime !== undefined) ? e._PauseTime : 3;
  $('pMtop').value = (e._MaskTop !== undefined) ? e._MaskTop : 0.7;
  $('pMbot').value = (e._MaskBottom !== undefined) ? e._MaskBottom : 0.25;
  $('pFea').value = (e._Feather !== undefined) ? e._Feather : 0.1;
  $('pSFea').value = (e._SideFeather !== undefined) ? e._SideFeather : 0.05;
  const w = (mats.wind && mats.wind.floats) || {};
  $('wMt').value = (w._MaskThreshold !== undefined) ? w._MaskThreshold : 0.1;
  $('wGmt').value = (w._G_MaskThreshold !== undefined) ? w._G_MaskThreshold : 0.1;
  $('wWs').value = (w._WindStrength !== undefined) ? w._WindStrength : 0.25;
  $('wGws').value = (w._G_WindStrength !== undefined) ? w._G_WindStrength : 0.2;
  origCrop = (e._CropX !== undefined) ? [e._CropX, e._CropY, e._CropW, e._CropH] : null;
  $('origCropTxt').textContent = origCrop ? origCrop.map(v=>Math.round(v)).join(', ') : '无';
}

let rafPending = false;
function requestDraw(){ if(rafPending) return; rafPending = true; requestAnimationFrame(()=>{ rafPending=false; draw(); }); }
let lastPaint = null;
let __maskData = null, __maskDirty = true;
let __pWS = 0.25, __pGWS = 0.2, __pMaskTh = 0.1, __pGMaskTh = 0.1;
function refreshPreviewParams(){
  __pWS = +$('wWs').value || 0.25; __pGWS = +$('wGws').value || 0.2;
  __pMaskTh = +$('wMt').value || 0.1; __pGMaskTh = +$('wGmt').value || 0.1;
}
let persistTimer = null;
// (single persistSoon lives near importPack; it persists the FULL bone array)

function origCropRect(){
  if(!origCrop) return null;
  const c = origCrop;
  if($('cropMode').value === 'E') return [c[0]/2, c[1]/2, c[2]/2, c[3]/2];
  const w = c[2]/2, h = c[3]/2;
  return [c[0]/2 - w/2, CH - c[1]/2 - h/2, w, h];
}
function pos(e){
  const r = cv.getBoundingClientRect();
  return [(e.clientX-r.left)*CW/r.width, (e.clientY-r.top)*CH/r.height];
}
function draw(){
  ctx.clearRect(0,0,CW,CH);
  ctx.fillStyle='#111'; ctx.fillRect(0,0,CW,CH);
  if(fitMode){
    // alignment mode: original portrait at 40% + RG mask + bones as locked
    // reference layers; the raw new portrait floats on top for positioning
    if(origPortrait){ ctx.globalAlpha = 0.4; ctx.drawImage(origPortrait, 0, 0, CW, CH); ctx.globalAlpha = 1; }
    if($('lyWind').checked){ ctx.globalAlpha = $('windAlpha').value/100; ctx.drawImage(wc, 0, 0, CW, CH); ctx.globalAlpha = 1; }
    if($('lyBones').checked){
      const s = +$('boneSize').value;
      for(let i=0;i<data609.length;i++){
        const p = data609[i], mag = Math.abs(p[1]);
        if(mag <= 1e-6) continue;
        const t = Math.min(1, mag/0.75);
        ctx.fillStyle = 'rgba(255,'+(255-Math.round(190*t))+',0,0.9)';
        ctx.beginPath(); ctx.arc((i%21)*50, gridRowY((i/21)|0), s, 0, 7); ctx.fill();
      }
    }
    if(rawNewImg){
      ctx.globalAlpha = $('fitAlpha').value/100;
      ctx.drawImage(rawNewImg, fit.ox, fit.oy, rawNewImg.width*fit.scale, rawNewImg.height*fit.scale);
      ctx.globalAlpha = 1;
    }
    // original eye-region box stays visible in fit mode (positioning reference)
    const foc = origCropRect();
    if($('lyCrop').checked && foc){
      ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.strokeRect(foc[0],foc[1],foc[2],foc[3]); ctx.setLineDash([]);
    }
    $('fitInfo').textContent = 'x='+Math.round(fit.ox)+' y='+Math.round(fit.oy)+' s='+fit.scale.toFixed(3);
    persistSoon();
    return;
  }
  const tool = curTool();
  if($('lyPortrait').checked){
    if(baseMode===0){
      if(importedAligned) ctx.drawImage(importedAligned, 0, 0);
      else if(rawNewImg) ctx.drawImage(rawNewImg, fit.ox, fit.oy, rawNewImg.width*fit.scale, rawNewImg.height*fit.scale);
      if(onion){ ctx.globalAlpha=0.45; ctx.drawImage(origPortrait,0,0); ctx.globalAlpha=1; }
    }
    else if(origPortrait) ctx.drawImage(origPortrait, 0, 0);
  }
  if($('lyWind').checked){ ctx.globalAlpha = $('windAlpha').value/100; ctx.drawImage(wc,0,0,CW,CH); ctx.globalAlpha=1; }
  if($('lyGrid').checked && $('lyBones').checked){
    ctx.strokeStyle='rgba(120,160,255,0.15)'; ctx.beginPath();
    for(let c=0;c<=20;c++){ const x=c/20*CW; ctx.moveTo(x,0); ctx.lineTo(x,CH); }
    for(let r=0;r<=28;r++){ const y=r/28*CH; ctx.moveTo(0,y); ctx.lineTo(CW,y); }
    ctx.stroke();
  }
  if($('lyBones').checked){
    if(bonesDirty) renderBonesCache();
    ctx.drawImage(bonesCache, 0, 0);
    for(let k=0; k<selBones.length; k++){
      const s = +$('boneSize').value;
      const gp = gridPos(selBones[k]);
      const last = k === selBones.length-1;
      ctx.strokeStyle = last ? '#fff' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = last ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(gp[0],gp[1],s+(last?5:3),0,7); ctx.stroke();
    }
    if(drag && drag.type==='bonemarquee'){
      const cmin = Math.min(drag.x0, drag.x1), cmax = Math.max(drag.x0, drag.x1);
      const rmin = Math.min(drag.y0, drag.y1), rmax = Math.max(drag.y0, drag.y1);
      const cw2 = (cmax-cmin+1)*50, ch2 = (rmax-rmin+1)*50;
      ctx.strokeStyle='rgba(120,255,120,0.9)'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
      ctx.strokeRect(cmin*50-25, gridRowY(rmax)-25, cw2, ch2);
      ctx.setLineDash([]);
    }
  }
  const oc = origCropRect();
  if($('lyCrop').checked && oc){
    ctx.strokeStyle='#0ff'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
    ctx.strokeRect(oc[0],oc[1],oc[2],oc[3]); ctx.setLineDash([]);
  }
  if($('lyNewCrop').checked && crop){
    const x=crop.x-crop.w/2, y=CH-crop.y-crop.h/2;
    ctx.strokeStyle='#f4c'; ctx.lineWidth=2; ctx.strokeRect(x,y,crop.w,crop.h);
    ctx.fillStyle='#f4c';
    for(const h of handles()) ctx.fillRect(h[0]-4,h[1]-4,8,8);
  }
  if($('lyHalf').checked){
    const s = halfBox.size/2;
    ctx.strokeStyle = tool==='half' ? '#ff0' : 'rgba(255,255,0,0.45)';
    ctx.lineWidth=2; ctx.setLineDash([10,6]);
    ctx.strokeRect(halfBox.cx-s, halfBox.cy-s, halfBox.size, halfBox.size);
    ctx.setLineDash([]);
    if(tool==='half'){ ctx.fillStyle='#ff0';
      for(const h of boxHandles(halfBox.cx,halfBox.cy,s,s)) ctx.fillRect(h[0]-5,h[1]-5,10,10); }
  }
  if($('lyIcon').checked){
    const w = iconBox.w, h = w*340/260;
    ctx.strokeStyle = tool==='icon' ? '#f80' : 'rgba(255,136,0,0.45)';
    ctx.lineWidth=2; ctx.setLineDash([10,6]);
    ctx.strokeRect(iconBox.cx-w/2, iconBox.cy-h/2, w, h);
    ctx.setLineDash([]);
    if(tool==='icon'){ ctx.fillStyle='#f80';
      for(const h of boxHandles(iconBox.cx,iconBox.cy,w/2,h/2)) ctx.fillRect(h[0]-5,h[1]-5,10,10); }
  }
  if(tool==='brush' && brushPos){
    const rC = (+$('brushR').value) * CW/MW;
    ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1.5;
    ctx.strokeRect(brushPos[0]-rC, brushPos[1]-rC, rC*2, rC*2);
    ctx.strokeStyle='rgba(0,0,0,0.6)';
    ctx.strokeRect(brushPos[0]-rC-1, brushPos[1]-rC-1, rC*2+2, rC*2+2);
  }
  persistSoon();
}

function paint(mx,my){ __maskDirty = true; if(glMesh) glMesh.maskDirty = true;
  const mode = document.querySelector('input[name=brush]:checked').value;
  if(mode==='C' && !window.__pickExact){ $('boneInfo').textContent='精确画笔: 先 Ctrl+左键取一次色'; return; }
  const u = Math.round(mx/CW*MW), v = Math.round(my/CH*MH);
  const r = +$('brushR').value, a = +$('brushA').value;
  const x0 = Math.max(0,u-r), y0 = Math.max(0,v-r);
  const x1 = Math.min(MW,u+r+1), y1 = Math.min(MH,v+r+1);
  if(x1<=x0||y1<=y0) return;
  const im = wctx.getImageData(x0,y0,x1-x0,y1-y0);
  const val = Math.round(255 * a / 100);
  for(let yy=0; yy<im.height; yy++) for(let xx=0; xx<im.width; xx++){
    const o=(yy*im.width+xx)*4;
    if(mode==='E'){ im.data[o]=0; im.data[o+1]=0; }
    else if(mode==='C'){ im.data[o]=window.__pickExact[0]; im.data[o+1]=window.__pickExact[1]; }
    else{
      if(mode==='Y' || mode==='R') im.data[o]=Math.max(im.data[o], val);
      if(mode==='Y' || mode==='G') im.data[o+1]=Math.max(im.data[o+1], val);
    }
    im.data[o+3]=255;
  }
  wctx.putImageData(im, x0, y0);
  requestDraw();
}

function buildCfg(){
  return {
    name: (role||'role') + '_D',
    fitTransform: {scale:+fit.scale.toFixed(5), offsetX:Math.round(fit.ox), offsetY:Math.round(fit.oy),
                   note:'原始新图在1000x1400画布上的绘制参数: 左上角偏移+等比缩放'},
    eyesCrop_2000x2800: { _CropX: Math.round((crop.x-crop.w/2)*2), _CropY: Math.round((CH-crop.y-crop.h/2)*2),
                          _CropW: Math.round(crop.w*2), _CropH: Math.round(crop.h*2),
               note:'2000x2800素材系(模板匹配验证): X=框左缘, Y=框顶缘(左上原点)' },
    eyesCrop_canvas: {left:Math.round(crop.x-crop.w/2), top:Math.round(CH-crop.y-crop.h/2),
                      w:Math.round(crop.w), h:Math.round(crop.h), note:'1000x1400画布: 左上原点'},
    eyesMat: { _Cols:3, _Rows:3, _FPS:+$('pFps').value, _PauseTime:+$('pPause').value,
               _MaskTop:+$('pMtop').value, _MaskBottom:+$('pMbot').value,
               _Feather:+$('pFea').value, _SideFeather:+$('pSFea').value, _EdgeSharp:3 },
    windMat: { _MaskThreshold:+$('wMt').value, _G_MaskThreshold:+$('wGmt').value,
               _WindStrength:+$('wWs').value, _G_WindStrength:+$('wGws').value },
    halfBox: {cx:Math.round(halfBox.cx), cy:Math.round(halfBox.cy), size:Math.round(halfBox.size),
              note:'半身源区域(正方形), 导出放大到1024x1024'},
    iconBox: {cx:Math.round(iconBox.cx), cy:Math.round(iconBox.cy), w:Math.round(iconBox.w),
              h:Math.round(iconBox.w*340/260), note:'头像源区域, 导出缩至260x340'}
  };
}
function canvasBlob(c){ return new Promise(res=> c.toBlob(res, 'image/png')); }
function alignedPortraitCanvas(){ return alignedCanvas(); }
function buildAtlas(){
  const c = document.createElement('canvas'); c.width=512; c.height=512;
  const x2 = c.getContext('2d');
  const pc = alignedCanvas();
  const L = crop.x - crop.w/2, T = CH - crop.y - crop.h/2;
  const cell = 512/3;
  for(let row=0; row<3; row++) for(let col=0; col<3; col++)
    x2.drawImage(pc, L, T, crop.w, crop.h, col*cell, row*cell, cell, cell);
  return c;
}
async function saveAll(){
  const zip = new window.JSZip();
  const pc = alignedCanvas();
  zip.file(role+'_portrait_1000x1400.png', await canvasBlob(pc));
  zip.file(role+'_windmask_400x560.png', await canvasBlob(wc));
  zip.file(role+'_eyesatlas_512x512_9帧同图占位.png', await canvasBlob(buildAtlas()));
  const hc = document.createElement('canvas'); hc.width=1024; hc.height=1024;
  const hs = halfBox.size/2;
  hc.getContext('2d').drawImage(pc, halfBox.cx-hs, halfBox.cy-hs, halfBox.size, halfBox.size, 0,0,1024,1024);
  zip.file(role+'_half_1024x1024.png', await canvasBlob(hc));
  const iw = iconBox.w, ih = iw*340/260;
  const ic = document.createElement('canvas'); ic.width=260; ic.height=340;
  ic.getContext('2d').drawImage(pc, iconBox.cx-iw/2, iconBox.cy-ih/2, iw, ih, 0,0,260,340);
  zip.file(role+'_icon_260x340.png', await canvasBlob(ic));
  zip.file(role+'_data_网格数据.json', JSON.stringify({sortedWorldPositions: data609.map(p=>({x:p[0], y:p[1], z:p[2]}))}));
  zip.file('params.json', JSON.stringify(buildCfg(), null, 1));
  const blob = await zip.generateAsync({type:'blob'});
  const ts = new Date();
  const stamp = ts.getFullYear()+String(ts.getMonth()+1).padStart(2,'0')+String(ts.getDate()).padStart(2,'0')+'_'+String(ts.getHours()).padStart(2,'0')+String(ts.getMinutes()).padStart(2,'0')+String(ts.getSeconds()).padStart(2,'0');
  // save to the server-side cache (D:\FORSANGUO\export\EXPORTADJ\cache + COMPLETED)
  var saved = '浏览器下载';
  try{
    const dataUrl = await new Promise(function(res, rej){
      var fr = new FileReader();
      fr.onload = function(){ res(fr.result); };
      fr.onerror = function(){ rej(new Error('readback fail')); };
      fr.readAsDataURL(blob);
    });
    const rs = await fetch('/api/save_role', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({role: role, zip: dataUrl})});
    const j = await rs.json();
    if(j.ok) saved = '已存 ' + j.file;
  }catch(e){ saved = '服务器保存失败(' + e.message + '), 已用浏览器下载'; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=role+'_素材_'+stamp+'.zip'; a.click();
  $('exportOut').textContent='一键保存完成（7 个文件）| ' + saved;
}
async function importPack(file){
  $('exportOut').textContent='正在导入…';
  const zip = await window.JSZip.loadAsync(file);
  const names = Object.keys(zip.files).filter(n=>!zip.files[n].dir);
  const find = re => names.find(n=>re.test(n));
  const pn = find(/params.*\.json$/i);
  if(pn){
    const cfg2 = JSON.parse(await zip.file(pn).async('string'));
    if(cfg2.fitTransform){ fit.scale=cfg2.fitTransform.scale; fit.ox=cfg2.fitTransform.offsetX; fit.oy=cfg2.fitTransform.offsetY; syncFit(); }
    if(cfg2.eyesCrop_canvas){ const c=cfg2.eyesCrop_canvas; crop={x:c.left+c.w/2, y:CH-c.top-c.h/2, w:c.w, h:c.h}; syncNums(); }
    const em = cfg2.eyesMat || {};
    if(em._FPS!==undefined) $('pFps').value=em._FPS;
    if(em._PauseTime!==undefined) $('pPause').value=em._PauseTime;
    if(em._MaskTop!==undefined) $('pMtop').value=em._MaskTop;
    if(em._MaskBottom!==undefined) $('pMbot').value=em._MaskBottom;
    if(em._Feather!==undefined) $('pFea').value=em._Feather;
    if(em._SideFeather!==undefined) $('pSFea').value=em._SideFeather;
    const wmm = cfg2.windMat || {};
    if(wmm._MaskThreshold!==undefined) $('wMt').value=wmm._MaskThreshold;
    if(wmm._G_MaskThreshold!==undefined) $('wGmt').value=wmm._G_MaskThreshold;
    if(wmm._WindStrength!==undefined) $('wWs').value=wmm._WindStrength;
    if(wmm._G_WindStrength!==undefined) $('wGws').value=wmm._G_WindStrength;
    if(cfg2.halfBox){ halfBox.cx=cfg2.halfBox.cx; halfBox.cy=cfg2.halfBox.cy; halfBox.size=cfg2.halfBox.size; }
    if(cfg2.iconBox){ iconBox.cx=cfg2.iconBox.cx; iconBox.cy=cfg2.iconBox.cy; iconBox.w=cfg2.iconBox.w; }
  }
  const mn = find(/windmask.*\.png$/i);
  if(mn){ const bmp = await createImageBitmap(await zip.file(mn).async('blob')); wctx.clearRect(0,0,MW,MH); wctx.drawImage(bmp,0,0,MW,MH); }
  const dn = find(/data.*\.json$/i);
  if(dn){
    const dj = JSON.parse(await zip.file(dn).async('string'));
    if(dj.sortedWorldPositions && dj.sortedWorldPositions.length===609) data609 = dj.sortedWorldPositions.map(p=>[p.x,p.y,p.z]);
  }
  const pn2 = find(/portrait.*\.png$/i);
  if(pn2){
    const img = new Image();
    img.src = URL.createObjectURL(await zip.file(pn2).async('blob'));
    await img.decode();
    importedAligned = img; rawNewImg = null; __alignedDirty = true;
  }
  persistSoon(); draw();
  $('exportOut').textContent='导入完成';
}

function persistSoon(){
  clearTimeout(persistTimer);
  persistTimer = setTimeout(()=>{
    if(!role) return;
    try{
      localStorage.setItem('bg_manual_'+role, '1');
      localStorage.setItem('bg_state_v2_'+role, JSON.stringify({
        fit: {scale: fit.scale, ox: fit.ox, oy: fit.oy},
        crop: crop, halfBox: halfBox, iconBox: iconBox,
        // full array: zeroed points must survive (filtering them out used to
        // resurrect deleted bones on every reload)
        bones: data609.map(p=>[+p[0].toFixed(4), +p[1].toFixed(4), +p[2].toFixed(4)])
      }));
    }catch(e){}
  }, 400);
}

// ---- role loading ----
async function loadRole(name){
  role = name;
  const sel = $('roleSel'); if(sel.value !== name) sel.value = name;
  try{ localStorage.setItem('bg_last_role', name); }catch(e){}
  selBones = []; baseMode = 0; importedAligned = null;
  $('btnBase').textContent = '底图: 新立绘 [空格]';
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('bg_state_v2_'+name) || 'null'); }catch(e){}
  const enc = encodeURIComponent(name);
  const jobs = await Promise.allSettled([
    loadImage('/img/orig/'+enc+'.png'),
    loadImage('/role/'+enc+'/orig_eyes.png'),
    loadImage('/role/'+enc+'/orig_wind.png'),
    fetch('/role/'+enc+'/orig_eyes_mat.json').then(r=>{ if(!r.ok) throw 0; return r.json(); }),
    fetch('/role/'+enc+'/orig_wind_mat.json').then(r=>{ if(!r.ok) throw 0; return r.json(); }),
    fetch('/role/'+enc+'/orig_data.json').then(r=>{ if(!r.ok) throw 0; return r.json(); }),
    loadImage('/img/new/'+enc+'.png'),
    fetch('/role/'+enc+'/orig_boxes.json').then(r=>{ if(!r.ok) throw 0; return r.json(); }),
  ]);
  const res = jobs.map(j=>j.status==='fulfilled' ? j.value : null);
  origPortrait = res[0]; atlasImg = res[1]; windImg = res[2];
  mats.eyes = res[3]; mats.wind = res[4];
  data609 = res[5] ? res[5].sortedWorldPositions.map(p=>[p.x,p.y,p.z]) : Array.from({length:609}, ()=>[0,0,0]);
  rawNewImg = res[6]; importedAligned = null;
  Object.assign(fit, rawNewImg ? defaultFitFor(rawNewImg) : {scale:1, ox:0, oy:0});
  __alignedDirty = true;
  if(window.__warpCtx) window.__warpCtx.clearRect(0,0,CW,CH);
  applyMatDefaults();
  wctx.clearRect(0,0,MW,MH); wctx.drawImage(windImg, 0, 0, MW, MH); // load role's original wind mask into the edit layer
  // default half/icon boxes from the original art's official region
  const boxes = res[7] || {};
  halfBox = { cx: (boxes.half && boxes.half.cx) || 490, cy: (boxes.half && boxes.half.cy) || 790, size: (boxes.half && boxes.half.size) || 1024 };
  iconBox = { cx: (boxes.icon && boxes.icon.cx) || 500, cy: (boxes.icon && boxes.icon.cy) || 514, w: (boxes.icon && boxes.icon.w) || 356 };
  if(saved){
    if(saved.fit) Object.assign(fit, saved.fit);
  __alignedDirty = true;
    if(saved.crop) crop = saved.crop;
    if(saved.halfBox) Object.assign(halfBox, saved.halfBox);
    if(saved.iconBox) Object.assign(iconBox, saved.iconBox);
    if(saved.bones && saved.bones.length===609) data609 = saved.bones.map(p=>[p[0],p[1],p[2]]);
    else if(saved.boneYMap) for(const pr of saved.boneYMap) data609[pr[0]][1] = pr[1];
  bonesDirty = true;
  } else {
    if(mats.eyes && mats.eyes.floats && mats.eyes.floats._CropX!==undefined){
      const f = mats.eyes.floats;
      crop = {x: f._CropX/2 + f._CropW/4, y: CH - (f._CropY/2 + f._CropH/4), w: f._CropW/2, h: f._CropH/2};
    } else crop = {x:500, y:700, w:118, h:118};
  }
  if(!rawNewImg) Object.assign(fit, {scale:1, ox:0, oy:0});
  syncNums(); syncFit();
  $('atlasPrev').src = atlasImg.src;
  $('roleFlags').textContent = '';
  draw();
}

async function init(){
  cfg = await (await fetch('/api/config')).json();
  $('cfgOrig').value = cfg.orig_dir; $('cfgNew').value = cfg.new_dir; $('cfgRoles').value = cfg.roles_dir;
  const rr = await (await fetch('/api/roles')).json();
  const sel = $('roleSel'); sel.innerHTML = '';
  for(const x of rr.roles){
    const o = document.createElement('option');
    o.value = x.name;
    o.textContent = x.name + (x.hasNew ? '' : ' (无新图)') + (x.dynamicReady ? '' : ' (缺动态)');
    o.disabled = !x.hasNew;
    sel.appendChild(o);
  }
  sel.onchange = ()=> loadRole(sel.value);
  let last = null; try{ last = localStorage.getItem('bg_last_role'); }catch(e){}
  const want = (last && [...sel.options].find(o=>o.value===last)) ? last
             : (([...sel.options].find(o=>o.value==='宝菓') || sel.options[0]).value);
  sel.value = want;
}


// ---- dynamic preview (approximates the in-game shaders) ----
let previewRAF = null, previewOn = false;
const PREVIEW_GRID = 24; // px cells for mesh-warp approximation
function getPreviewParams(){
  return {
    windSpeed: +$('pFps').value > 0 ? 1.2 : 1.2,         // wind freq not user-edited; fixed
    windStrength: +$('wWs').value || 0.25,
    gWindStrength: +$('wGws').value || 0.2,
    maskThreshold: +$('wMt').value || 0.1,
    gMaskThreshold: +$('wGmt').value || 0.1,
    fps: +$('pFps').value || 14,
    pause: +$('pPause').value || 3,
    bones: data609,
  };
}
// preview all three outputs side by side (portrait + half + icon)
// ---- WebGL preview: GPU port of the game's animation shaders ----
// Architecture mirrors the game: 21x29 vertex mesh, per-vertex bone offsets
// (breathing) + mask-texture-driven cloth sway in the VERTEX SHADER,
// portrait texture in the fragment shader. One draw call per frame.
let gl = null, glProg = null, glTextures = {}, glMesh = null, glDirty = {};

const GL_VS = `
attribute vec2 a_uv;
attribute float a_bone;
uniform sampler2D u_mask;
uniform float u_time, u_multi, u_duration, u_wS, u_gWS, u_mTh, u_gMTh, u_rootFix, u_rootFalloff;
varying vec2 v_uv;
void main(){
  vec2 uv = a_uv;
  vec4 mask = texture2D(u_mask, uv);
  float r = clamp((mask.r - u_mTh) / max(1.0 - u_mTh, 0.001), 0.0, 1.0);
  float g = clamp((mask.g - u_gMTh) / max(1.0 - u_gMTh, 0.001), 0.0, 1.0);
  // bone-driven breathing: each vertex oscillates along its stored offset
  float phase = 6.28318 * u_time / max(u_duration, 0.1);
  float breath = sin(phase) * u_multi;
  // cloth sway with root falloff anchored at bottom center (uv.y=1)
  float rootDist = distance(uv, vec2(0.5, 1.0));
  float root = pow(clamp(rootDist * (1.0 + u_rootFix*4.0), 0.0, 1.0), max(u_rootFalloff, 0.2));
  float phaseG = u_time * 2.5 + uv.y * 3.0 * 6.28318;
  float sway = sin(phaseG) * g * u_gWS;
  // radial chest breath from mask.r
  vec2 bc = vec2(0.5, 0.62);
  vec2 br = vec2(0.18, 0.10);
  float rx = clamp((uv.x - bc.x)/br.x, -1.0, 1.0);
  float ry = clamp((uv.y - bc.y)/br.y, -1.0, 1.0);
  float b2 = sin(u_time * 1.2);
  float boneK = 40.0 * (0.4 + 0.6*min(1.0, uv.y*1.5));
  float dx = sway * root * 0.20 * 50.0 + rx * r * b2 * u_wS * 12.0;
  float dy = a_bone * breath * boneK + ry * r * b2 * u_wS * 6.0 + cos(phaseG) * g * u_gWS * root * 0.05 * 50.0;
  vec2 px = vec2(uv.x * 1000.0 + dx, (1.0 - uv.y) * 1400.0 + dy);
  vec2 ndc = vec2(px.x / 1000.0 * 2.0 - 1.0, 1.0 - px.y / 1400.0 * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  v_uv = uv;
}`;

const GL_FS = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_portrait;
void main(){
  vec4 c = texture2D(u_portrait, v_uv);
  gl_FragColor = vec4(c.rgb * c.a, c.a);
}`;

function glInit(){
  if(gl) return true;
  const cv = $('pvGL');
  gl = cv.getContext('webgl', {alpha: true, premultipliedAlpha: false, antialias: true, preserveDrawingBuffer: true});
  if(!gl) return false;
  function sh(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  glProg = gl.createProgram();
  gl.attachShader(glProg, sh(gl.VERTEX_SHADER, GL_VS));
  gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, GL_FS));
  gl.linkProgram(glProg);
  if(!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProg));
  gl.useProgram(glProg);
  // mesh: 21x29 grid, 2 triangles per cell
  const cols = 21, rows = 29, quads = (cols-1)*(rows-1);
  const uvArr = new Float32Array(609*2);
  const boneArr = new Float32Array(609);
  for(let r2 = 0; r2 < rows; r2++) for(let c2 = 0; c2 < cols; c2++){
    const i = r2*cols + c2;
    uvArr[i*2] = c2/(cols-1); uvArr[i*2+1] = r2/(rows-1);
  }
  const idx = new Uint16Array(quads*6);
  let q = 0;
  for(let r2 = 0; r2 < rows-1; r2++) for(let c2 = 0; c2 < cols-1; c2++){
    const a = r2*cols+c2, b = a+1, c = a+cols, d = c+1;
    idx[q++]=a; idx[q++]=c; idx[q++]=b; idx[q++]=b; idx[q++]=c; idx[q++]=d;
  }
  glMesh = {uvBuf: gl.createBuffer(), boneBuf: gl.createBuffer(), idxBuf: gl.createBuffer(), idxCount: quads*6};
  gl.bindBuffer(gl.ARRAY_BUFFER, glMesh.uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, uvArr, gl.STATIC_DRAW);
  const aUV = gl.getAttribLocation(glProg, 'a_uv');
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, glMesh.boneBuf);
  gl.bufferData(gl.ARRAY_BUFFER, boneArr, gl.DYNAMIC_DRAW);
  const aBone = gl.getAttribLocation(glProg, 'a_bone');
  gl.enableVertexAttribArray(aBone);
  gl.vertexAttribPointer(aBone, 1, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glMesh.idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  glTextures.portrait = gl.createTexture();
  glTextures.mask = gl.createTexture();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1i(gl.getUniformLocation(glProg, 'u_mask'), 0);
  gl.uniform1i(gl.getUniformLocation(glProg, 'u_portrait'), 1);
  glMesh.boneDirty = true;
  glMesh.portraitDirty = true;
  glMesh.maskDirty = true;
  return true;
}

function glUploadTexture(unit, tex, source){
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function glUploadBones(){
  const cols = 21, rows = 29;
  const boneArr = new Float32Array(609);
  for(let i = 0; i < 609; i++) boneArr[i] = data609[i][1];
  gl.bindBuffer(gl.ARRAY_BUFFER, glMesh.boneBuf);
  gl.bufferData(gl.ARRAY_BUFFER, boneArr, gl.DYNAMIC_DRAW);
}

function drawPreviewAll(){
  if(!previewOn) return;
  if(window.__markFrame) window.__markFrame();
  try{
    if(!glInit()){ drawPreviewCanvas2D(); return; }
    // capture the dirty flag BEFORE alignedCanvasCached() consumes it, so the
    // GL portrait texture is re-uploaded whenever the cache was rebuilt
    if(__alignedDirty) glMesh.portraitDirty = true;
    const base = alignedCanvasCached();
    if(glMesh.portraitDirty){ glUploadTexture(1, glTextures.portrait, base); glMesh.portraitDirty = false; }
    if(glMesh.maskDirty){ glUploadTexture(0, glTextures.mask, wc); glMesh.maskDirty = false; }
    if(glMesh.boneDirty){ glUploadBones(); glMesh.boneDirty = false; }
    const t = performance.now()/1000;
    gl.viewport(0, 0, 1000, 1400);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(glProg);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_time'), t);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_multi'), 0.8);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_duration'), 3.2);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_wS'), +$('wWs').value || 0.25);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_gWS'), +$('wGws').value || 0.2);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_mTh'), +$('wMt').value || 0.1);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_gMTh'), +$('wGmt').value || 0.1);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_rootFix'), 0.3);
    gl.uniform1f(gl.getUniformLocation(glProg, 'u_rootFalloff'), 2.0);
    gl.drawElements(gl.TRIANGLES, glMesh.idxCount, gl.UNSIGNED_SHORT, 0);
    // thumbnails from the aligned base (2D, cheap)
    const pvHalf = $('pvHalf'), pvIcon = $('pvIcon');
    if(pvHalf){
      const hc = pvHalf.getContext('2d');
      const hs = halfBox.size/2;
      hc.clearRect(0,0,256,256);
      hc.drawImage(base, halfBox.cx-hs, halfBox.cy-hs, halfBox.size, halfBox.size, 0, 0, 256, 256);
    }
    if(pvIcon){
      const ic2 = pvIcon.getContext('2d');
      const iw = iconBox.w, ih = iw*340/260;
      ic2.clearRect(0,0,260,340);
      ic2.drawImage(base, iconBox.cx-iw/2, iconBox.cy-ih/2, iw, ih, 0, 0, 260, 340);
    }
    // propagate dirt flags from the editor into GL uploads
    if(__maskDirty) glMesh.maskDirty = true;
    if(bonesDirty) glMesh.boneDirty = true;
  }catch(e){
    // fall back to canvas 2D on any GL failure
    drawPreviewCanvas2D();
  }
  previewRAF = requestAnimationFrame(drawPreviewAll);
}

function drawPreviewCanvas2D(){
  if(!previewOn) return;
  const t = performance.now()/1000;
  const base = alignedCanvasCached();
  if(__maskDirty){ __maskData = wctx.getImageData(0,0,MW,MH); __maskDirty = false; refreshPreviewParams(); }
  const cols = 21, rows = 29;
  function boneOffset(c, r){
    const x = c-0.5, y = r-0.5;
    const c0 = Math.max(0, Math.min(cols-1, Math.floor(x))), r0 = Math.max(0, Math.min(rows-1, Math.floor(y)));
    const c1 = Math.min(cols-1, c0+1), r1 = Math.min(rows-1, r0+1);
    const fx = x-c0, fy = y-r0;
    const o00=data609[r0*cols+c0][1], o10=data609[r0*cols+c1][1];
    const o01=data609[r1*cols+c0][1], o11=data609[r1*cols+c1][1];
    return (o00*(1-fx)+o10*fx)*(1-fy) + (o01*(1-fx)+o11*fx)*fy;
  }
  if(!window.__warpCv){
    const wc2 = document.createElement('canvas'); wc2.width=CW; wc2.height=CH;
    window.__warpCv = wc2; window.__warpCtx = wc2.getContext('2d');
  }
  const w2 = window.__warpCtx;
  const mres = __maskData.data;
  const breathPhase = Math.sin(t*1.2);
  const STRIP = 8;
  const NS = Math.ceil(CH/STRIP);
  for(let n=0; n<NS; n++){
    const sy = n*STRIP;
    const v1 = sy/CH, v2 = Math.min(1,(sy+STRIP)/CH);
    const bone1 = boneOffset(cols/2, (1-v1)*(rows-1)) * breathPhase * 40 * (0.4+0.6*Math.min(1, v1*1.5));
    const bone2 = boneOffset(cols/2, (1-v2)*(rows-1)) * breathPhase * 40 * (0.4+0.6*Math.min(1, v2*1.5));
    const vm = (v1+v2)/2;
    const mx = Math.min(MW-1, Math.round(0.5*MW)), my = Math.min(MH-1, Math.round(vm*MH));
    const o = (my*MW+mx)*4;
    const mr = Math.max(0, (mres[o]/255 - __pMaskTh) / Math.max(1-__pMaskTh, 0.001));
    const mg = Math.max(0, (mres[o+1]/255 - __pGMaskTh) / Math.max(1-__pGMaskTh, 0.001));
    const phaseG = t*2.5 + vm*3*6.28318;
    const dx = Math.sin(phaseG)*mg*__pGWS*30*(0.3+0.7*vm) + mr*breathPhase*__pWS*12*Math.sin(t*1.2+vm*2);
    const y1 = sy + bone1, y2 = sy + STRIP + bone2;
    w2.drawImage(base, 0, sy, CW, STRIP, dx, y1, CW, (y2-y1)+1);
  }
  ctx.clearRect(0,0,CW,CH);
  ctx.drawImage(window.__warpCv, 0, 0);
  const pvHalf = $('pvHalf'), pvIcon = $('pvIcon');
  if(pvHalf){
    const hc = pvHalf.getContext('2d');
    const hs = halfBox.size/2;
    hc.clearRect(0,0,256,256);
    hc.drawImage(base, halfBox.cx-hs, halfBox.cy-hs, halfBox.size, halfBox.size, 0, 0, 256, 256);
  }
  if(pvIcon){
    const ic2 = pvIcon.getContext('2d');
    const iw = iconBox.w, ih = iw*340/260;
    ic2.clearRect(0,0,260,340);
    ic2.drawImage(base, iconBox.cx-iw/2, iconBox.cy-ih/2, iw, ih, 0, 0, 260, 340);
  }
  previewRAF = requestAnimationFrame(drawPreviewAll);
}
function togglePreviewAll(){
  previewOn = !previewOn;
  $('btnPreview').textContent = '动态预览: ' + (previewOn?'开':'关');
  $('btnPreview').style.background = previewOn ? '#e95' : '#7a5';
  $('pvHalf').style.display = previewOn ? 'block' : 'none';
  $('pvIcon').style.display = previewOn ? 'block' : 'none';
  var glc = $('pvGL');
  if(glc) glc.style.display = previewOn ? 'block' : 'none';
  if(previewOn){
    if(fitMode) $('btnFit').click();
    refreshPreviewParams();
    previewRAF = requestAnimationFrame(drawPreviewAll);
  }
  else if(previewRAF){ cancelAnimationFrame(previewRAF); previewRAF=null; draw(); }
}

// ---- wire up ----
function wire(){
  $('btnBase').onclick = ()=>{ baseMode = baseMode===0?1:0;
    $('btnBase').textContent = baseMode===0 ? '底图: 新立绘 [空格]' : '底图: 原版立绘 [空格]';
    if(baseMode===1) setOnion(false); draw(); };
  function setOnion(v){ onion = v && baseMode===0;
    $('btnOnion').textContent = onion ? '叠影: 开' : '叠影: 关';
    $('btnOnion').style.background = onion ? '#e95' : '';
    $('btnOnion').style.color = onion ? '#111' : '';
    draw(); }
  $('btnOnion').onclick = ()=> setOnion(!onion);
  window.addEventListener('keydown', e=>{
    if(e.code==='Space' && e.target===document.body){ e.preventDefault(); $('btnBase').click(); }
    if((e.ctrlKey||e.metaKey) && e.code==='KeyZ'){ e.preventDefault();
      if(e.shiftKey) redo(); else undo(); }
    if((e.ctrlKey||e.metaKey) && e.code==='KeyY'){ e.preventDefault(); redo(); }
    if(e.target !== document.body) return;
    if(curTool()==='bone'){
      if((e.ctrlKey||e.metaKey) && e.code==='KeyC' && selBones.length){
        e.preventDefault();
        const p = data609[selBones[selBones.length-1]];
        boneClip = [p[0], p[1], p[2]];
        updateBonePanel();
      }
      if((e.ctrlKey||e.metaKey) && e.code==='KeyV' && selBones.length && boneClip){
        e.preventDefault();
        for(const i of selBones) data609[i] = [boneClip[0], boneClip[1], boneClip[2]];
        boneMarkDirty(); updateBonePanel(); draw(); persistSoon();
      }
      if(selBones.length && (e.code==='ArrowUp' || e.code==='ArrowDown' || e.code==='ArrowLeft' || e.code==='ArrowRight')){
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.01;
        const dy = e.code==='ArrowUp' ? step : (e.code==='ArrowDown' ? -step : 0);
        const dx = e.code==='ArrowRight' ? step*0.5 : (e.code==='ArrowLeft' ? -step*0.5 : 0);
        for(const i of selBones){
          data609[i][1] = Math.max(0, Math.min(1, data609[i][1] + dy));
          data609[i][0] = data609[i][0] + dx;
        }
        boneMarkDirty(); updateBonePanel(); draw(); persistSoon();
      }
    }
  });

  $('btnFit').onclick = ()=>{ fitMode = !fitMode;
    $('btnFit').textContent = '对位模式: ' + (fitMode?'开':'关');
    $('btnFit').style.background = fitMode ? '#e95' : '#5af';
    $('fitPanel').style.display = fitMode ? 'block' : 'none';
    draw(); };
  $('fitScale').oninput = ()=>{ const ns=+$('fitScale').value/100, cx=CW/2, cy=CH/2;
    const px=(cx-fit.ox)/fit.scale, py=(cy-fit.oy)/fit.scale;
    fit.scale=ns; fit.ox=cx-px*ns; fit.oy=cy-py*ns; __alignedDirty = true; draw(); };
  $('fitAlpha').oninput = draw;
  $('btnFitReset').onclick = ()=>{ if(rawNewImg) Object.assign(fit, defaultFitFor(rawNewImg)); __alignedDirty = true; syncFit(); draw(); };
  $('btnFitExport').onclick = ()=>{
    alignedCanvas().toBlob(b=>{ const a=document.createElement('a');
      a.href=URL.createObjectURL(b); a.download=(role||'role')+'_对位_1000x1400.png'; a.click();
      $('exportOut').textContent='对位立绘已导出'; }); };
  $('btnImport').onclick = ()=> $('importFile').click();
  $('btnPreview').onclick = togglePreviewAll;
  $('importFile').onchange = async e=>{ if(e.target.files[0]){ try{ await importPack(e.target.files[0]); }catch(err){ $('exportOut').textContent='导入失败: '+err.message; } e.target.value=''; } };
  $('btnExpAll').onclick = ()=> saveAll().catch(err=> $('exportOut').textContent='保存失败: '+err.message);

  $('btnCfgSave').onclick = async ()=>{
    await fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({orig_dir:$('cfgOrig').value, new_dir:$('cfgNew').value, roles_dir:$('cfgRoles').value})});
    location.reload(); };
  $('roleSel').onchange = ()=> loadRole($('roleSel').value);

  ['lyPortrait','lyWind','lyBones','lyCrop','lyNewCrop','lyHalf','lyIcon','lyGrid','windAlpha','boneSize','cropMode'].forEach(id=>{ $(id).oninput = ()=>{ __maskDirty = true; draw(); }; $(id).onchange = ()=>{ __maskDirty = true; draw(); }; });
  ['wMt','wGmt','wWs','wGws'].forEach(id=>{ $(id).oninput = ()=>{ refreshPreviewParams(); __maskDirty = true; }; });
  const cropFieldMap = {cx:'x', cy:'y', cw:'w', ch:'h'};
  ['cx','cy','cw','ch'].forEach(id=>{ $(id).oninput = ()=>{ crop[cropFieldMap[id]] = parseFloat($(id).value)||0; draw(); }; });
  document.querySelectorAll('input[name=tool]').forEach(r=>{ r.onchange = ()=>{ $('brushSub').style.opacity = curTool()==='brush' ? 1 : 0.35; draw(); }; });
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnResetWind').onclick = ()=>{ pushUndo(); wctx.clearRect(0,0,MW,MH); wctx.drawImage(windImg,0,0,MW,MH); __maskDirty = true; if(glMesh) glMesh.maskDirty = true; draw(); };
  $('btnClearWind').onclick = ()=>{ wctx.clearRect(0,0,MW,MH); __maskDirty = true; if(glMesh) glMesh.maskDirty = true; draw(); };
  function boneMarkDirty(){ bonesDirty = true; if(glMesh) glMesh.boneDirty = true; }
  function updateBonePanel(){
    if(!selBones.length){ $('boneInfo').textContent = '点击选点 · Ctrl+点击多选 · Ctrl+C复制 · Ctrl+V粘贴 · 方向键调整'; return; }
    const i = selBones[selBones.length-1], p = data609[i];
    const clip = boneClip ? ' | 剪贴板(x:'+boneClip[0].toFixed(2)+',y:'+boneClip[1].toFixed(2)+')' : '';
    $('boneInfo').innerHTML = selBones.length > 1
      ? '已选 '+selBones.length+' 点(末点#'+i+' col'+(i%21)+' row'+((i/21)|0)+')'+clip
      : '点#'+i+' (col '+(i%21)+', row '+((i/21)|0)+') — x:'+p[0].toFixed(3)+' y:'+p[1].toFixed(3)+' z:'+p[2].toFixed(3)+clip;
    $('boneY').value = Math.round(p[1]*100); $('boneYn').value = p[1].toFixed(2);
    $('boneX').value = p[0].toFixed(2);
  }
  $('btnBoneClear').onclick = ()=>{ if(!selBones.length) return;
    for(const i of selBones) data609[i]=[0,0,0];
    boneMarkDirty(); updateBonePanel(); draw(); persistSoon(); };
  function setBoneY(v){ if(!selBones.length){ $('boneInfo').textContent='先在画布上点击一个网格点'; return; }
    v = Math.max(0, Math.min(1, v));
    for(const i of selBones) data609[i][1] = v;
    boneMarkDirty(); updateBonePanel(); draw(); persistSoon(); }
  $('boneY').oninput = ()=> setBoneY(+$('boneY').value/100);
  $('boneYn').oninput = ()=> setBoneY(+$('boneYn').value);
  $('boneX').oninput = ()=>{ if(selBones.length){ for(const i of selBones) data609[i][0] = +$('boneX').value||0; boneMarkDirty(); } };

  cv.onmousedown = e=>{
    const pt = pos(e), mx=pt[0], my=pt[1];
    const tool = curTool();
    // eyedropper must run BEFORE the fitMode branch: in fit mode the mask is
    // visible too, and the Ctrl+click used to be swallowed by fit-move
    if((e.ctrlKey || e.metaKey) && (tool==='brush' || (fitMode && tool!=='bone'))){
      const mu = Math.max(0, Math.min(MW-1, Math.round(mx/CW*MW)));
      const mv = Math.max(0, Math.min(MH-1, Math.round(my/CH*MH)));
      var rv = 0, gv = 0;
      try{ var px = wc.getContext('2d').getImageData(mu, mv, 1, 1).data; rv = px[0]; gv = px[1]; }catch(e){}
      var modeSel = 'E';
      if(rv > 20 && gv > 20) modeSel = (Math.abs(rv-gv) > 20) ? 'C' : 'Y';
      else if(rv > 20) modeSel = 'R';
      else if(gv > 20) modeSel = 'G';
      if(modeSel==='C') window.__pickExact = [rv, gv];
      var strength = Math.max(rv, gv);
      document.querySelector('input[name=brush][value='+modeSel+']').checked = true;
      $('brushA').value = Math.max(5, Math.min(100, Math.round(strength/255*100)));
      $('boneInfo').textContent = '取色: ' + (modeSel==='C' ? '精确 R='+rv+' G='+gv
        : modeSel==='Y' ? '黄(R+G)' : modeSel==='R' ? '红(R)' : modeSel==='G' ? '绿(G)' : '空白(切到擦除)')
        + (modeSel==='C' ? '（涂出来的颜色与该点一致）' : ' 强度=' + $('brushA').value + '%');
      draw();
      return;
    }
    if(fitMode){ drag={type:'fitmove', ox:mx, oy:my, fx:fit.ox, fy:fit.oy}; return; }
    if(tool==='brush'){
      pushUndo(); paint(mx,my); drag={type:'paint'}; return;
    }
    if(tool==='half'){
      const hs = boxHandles(halfBox.cx, halfBox.cy, halfBox.size/2, halfBox.size/2);
      for(let i=0;i<8;i++){ if(Math.abs(mx-hs[i][0])<12 && Math.abs(my-hs[i][1])<12){ drag={type:'halfscale', i, s0:halfBox.size}; return; } }
      drag={type:'halfmove', ox:mx, oy:my, cx:halfBox.cx, cy:halfBox.cy}; return; }
    if(tool==='icon'){
      const w = iconBox.w, h = w*340/260;
      const hs = boxHandles(iconBox.cx, iconBox.cy, w/2, h/2);
      for(let i=0;i<8;i++){ if(Math.abs(mx-hs[i][0])<12 && Math.abs(my-hs[i][1])<12){ drag={type:'iconscale', i, w0:iconBox.w}; return; } }
      drag={type:'iconmove', ox:mx, oy:my, cx:iconBox.cx, cy:iconBox.cy}; return; }
    if(tool==='bone'){
      const gi = gridIndex(mx,my);
      if(e.ctrlKey || e.metaKey){
        drag = {type:'bonemarquee', x0:gi%21, y0:(gi/21|0), x1:gi%21, y1:(gi/21|0), additive: selBones.slice()};
        draw(); return;
      }
      selBones = [gi];
      updateBonePanel();
      draw(); return; }
    if(tool==='crop' && $('lyNewCrop').checked){
      const x=crop.x-crop.w/2, y=CH-crop.y-crop.h/2;
      const hs = handles();
      for(let i=0;i<8;i++){ if(Math.abs(mx-hs[i][0])<10 && Math.abs(my-hs[i][1])<10){ drag={type:'resize', i, mx:mx, my:my, c:Object.assign({},crop)}; return; } }
      if(mx>x&&mx<x+crop.w&&my>y&&my<y+crop.h){ drag={type:'move', ox:mx, oy:my, c:Object.assign({},crop)}; }
    }
  };
  cv.onmousemove = e=>{
    const p = pos(e); brushPos = p;
    const toolNow = curTool();
    cv.style.cursor = toolNow==='brush' ? 'none' : 'crosshair';
    if(!drag){ if(toolNow==='brush' || (toolNow==='bone' && bonesDirty)) draw(); return; }
    const pt = pos(e), mx=pt[0], my=pt[1], d = drag.type;
    if(d==='fitmove'){ fit.ox=drag.fx+(mx-drag.ox); fit.oy=drag.fy+(my-drag.oy); __alignedDirty = true; syncFit(); }
    else if(d==='halfmove'){ halfBox.cx=drag.cx+(mx-drag.ox); halfBox.cy=drag.cy+(my-drag.oy); }
    else if(d==='halfscale'){ halfBox.size=Math.max(200,Math.min(1400,drag.s0+2*(mx-drag.ox))); }
    else if(d==='iconmove'){ iconBox.cx=drag.cx+(mx-drag.ox); iconBox.cy=drag.cy+(my-drag.oy); }
    else if(d==='iconscale'){ iconBox.w=Math.max(120,Math.min(1000,drag.w0+(mx-drag.ox))); }
    else if(d==='bonemarquee'){
      const gi = gridIndex(mx,my);
      drag.x1 = gi%21; drag.y1 = (gi/21)|0;
      draw(); return;
    }
    else if(d==='paint'){
      if(lastPaint){
        const dx=mx-lastPaint[0], dy=my-lastPaint[1];
        const steps=Math.max(1, Math.ceil(Math.hypot(dx,dy)/6));
        for(let i=1;i<=steps;i++) paint(lastPaint[0]+dx*i/steps, lastPaint[1]+dy*i/steps);
      }
      lastPaint=[mx,my];
    }
    else if(d==='move'){ crop.x=drag.c.x+(mx-drag.ox); crop.y=drag.c.y-(my-drag.oy); syncNums(); }
    else if(d==='resize'){
      const c=drag.c, i=drag.i;
      const L=c.x-c.w/2, T=CH-c.y-c.h/2, R=L+c.w, B=T+c.h;
      let nL=L,nT=T,nR=R,nB=B;
      if(i===0||i===6||i===7) nL=mx; if(i===0||i===1||i===2) nT=my;
      if(i===2||i===3||i===4) nR=mx; if(i===4||i===5||i===6) nB=my;
      if(nR-nL>8 && nB-nT>8){ crop.w=nR-nL; crop.h=nB-nT; crop.x=(nL+nR)/2; crop.y=CH-(nT+nB)/2; syncNums(); }
    }
    draw();
  };
  cv.onmouseleave = ()=>{ brushPos=null; draw(); };
  window.onmouseup = ()=>{
    if(drag && drag.type==='bonemarquee'){
      const c0 = Math.min(drag.x0,drag.x1), c1 = Math.max(drag.x0,drag.x1);
      const r0 = Math.min(drag.y0,drag.y1), r1 = Math.max(drag.y0,drag.y1);
      var picked = [];
      for(var r2=r0; r2<=r1; r2++) for(var c2=c0; c2<=c1; c2++) picked.push(r2*21+c2);
      selBones = drag.additive.slice();
      for(var pi of picked) if(selBones.indexOf(pi) < 0) selBones.push(pi);
      updateBonePanel();
    }
    drag=null; lastPaint=null; draw();
  };
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const pt = pos(e), mx=pt[0], my=pt[1];
    const f = e.deltaY<0 ? 1.06 : 1/1.06;
    if(fitMode){
      const ns = Math.min(3, Math.max(0.2, fit.scale*f));
      const px=(mx-fit.ox)/fit.scale, py=(my-fit.oy)/fit.scale;
      fit.ox = mx-px*ns; fit.oy = my-py*ns; fit.scale = ns; __alignedDirty = true; syncFit(); draw(); return;
    }
    const tool = curTool();
    if(tool==='half'){
      const px=(mx-halfBox.cx)/halfBox.size, py=(my-halfBox.cy)/halfBox.size;
      halfBox.size = Math.max(200, Math.min(1400, halfBox.size*f));
      halfBox.cx = mx-px*halfBox.size; halfBox.cy = my-py*halfBox.size; draw(); return; }
    if(tool==='icon'){
      const px=(mx-iconBox.cx)/iconBox.w, py=(my-iconBox.cy)/(iconBox.w*340/260);
      iconBox.w = Math.max(120, Math.min(1000, iconBox.w*f));
      const nh = iconBox.w*340/260;
      iconBox.cx = mx-px*iconBox.w; iconBox.cy = my-py*nh; draw(); return; }
    if(tool==='crop'){ crop.w = Math.max(20, Math.min(600, crop.w*f)); crop.h = crop.w; syncNums(); draw(); return; }
  }, {passive:false});
}

async function start(){
  cfg = await (await fetch('/api/config')).json();
  $('cfgOrig').value = cfg.orig_dir; $('cfgNew').value = cfg.new_dir; $('cfgRoles').value = cfg.roles_dir;
  const rr = await (await fetch('/api/roles')).json();
  const sel = $('roleSel'); sel.innerHTML = '';
  for(const x of rr.roles){
    const o = document.createElement('option');
    o.value = x.name;
    o.textContent = x.name + (x.hasNew ? '' : ' (无新图)') + (x.dynamicReady ? '' : ' (缺动态)');
    o.disabled = !x.hasNew;
    sel.appendChild(o);
  }
  sel.onchange = ()=> loadRole(sel.value);
  let last = null; try{ last = localStorage.getItem('bg_last_role'); }catch(e){}
  const want = (last && [...sel.options].find(o=>o.value===last)) ? last
             : (([...sel.options].find(o=>o.value==='宝菓') || sel.options[0]).value);
  sel.value = want;
  wire();
  // import auto-fit seeds BEFORE first loadRole, so alignment params are
  // pre-tuned for every role. Only overwrites states without a manual-edit tag.
  try{
    var rs = await fetch('/api/seed_states');
    if(rs.ok){
      var j = await rs.json();
      for(var key in j.states){
        var mkey = 'bg_manual_' + key.replace('bg_state_v2_', '');
        if(localStorage.getItem(mkey)) continue; // user made manual edits
        var prev = null; try{ prev = JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){}
        if(prev && (prev.bones || prev.boneYMap)) continue; // legacy state with bone work — never clobber
        localStorage.setItem(key, JSON.stringify(j.states[key]));
      }
    }
  }catch(e){}
  await loadRole(want);
}

start();
