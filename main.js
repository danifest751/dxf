let __raf=0,__pending=false; function requestDraw(){ if(__pending) return; __pending=true; __raf=requestAnimationFrame(()=>{ __pending=false; onDraw(); }); }
import { $, on, dpr, fmt, setStatus } from './utils.js';
import { calcCutParams } from './cost.js';
import { parseDXFMainThread, sanitizeParsed } from './parse.js';
import { initCanvasInteractions, buildPaths, drawEntities, fitView, drawPierceLabels } from './render.js';
import { partBBox, computeNesting, drawNesting, makeNestingReport } from './nesting.js';
import { createAnnotatedDXF, createDXFWithMarkers, createSVG, createCSV, downloadText } from './annotate.js';
import { makeRunTests } from './tests.js';
import * as lib from './library.js';
const valNum = (id, d=0)=>{ const el=$(id); if(!el) return d; const v=parseFloat(el.value); return Number.isFinite(v)?v:d; };


const state={ origDXF:'',pierceLabelLimit:600, rawDXF:'', parsed:null, tab:'orig', pan:{x:0,y:0}, zoom:1, nesting:null, paths:[], piercePaths:[], index:null};
const cv=$('cv');
const cvAnn=$('cvAnn');

function ensureOverlaySize(){
  if(!cv || !cvAnn) return;
  const r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width * dpr));
  const h = Math.max(1, Math.floor(r.height * dpr));
  if (cvAnn.width !== w) cvAnn.width = w;
  if (cvAnn.height !== h) cvAnn.height = h;
}

function onDraw(){
  try{
    if (state.tab === 'nest' && state.nesting){
      drawNesting(state, cv);
    } else {
      drawEntities(state, cv);
    }
    ensureOverlaySize();
    if (cvAnn) drawPierceLabels(state, cvAnn);
}catch(e){
    console.error(e);
    setStatus('Ошибка при отрисовке: '+(e&&e.message?e.message:e),'err');
  }
}

function safeDraw(){ requestDraw(); }








initCanvasInteractions(state, cv, safeDraw);



  // Ensure overlay sized before first draw
  ensureOverlaySize();
// Keep overlay canvas in sync with base canvas size (device-pixel aware)
if (cv && cvAnn){
  const syncOverlay = ()=>{
    const r = cv.getBoundingClientRect();
    cvAnn.width = Math.max(1, Math.floor(r.width * dpr));
    cvAnn.height = Math.max(1, Math.floor(r.height * dpr));
    // immediate redraw of labels on size change
    requestAnimationFrame(()=>{ drawPierceLabels(state, cvAnn); });
  };
  const ro = new ResizeObserver(()=> syncOverlay());
  ro.observe(cv);
  // also sync once after init
  setTimeout(syncOverlay, 0);
}

// Tabs
document.querySelectorAll('.tab').forEach(t=>on(t,'click',()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===t)); state.tab = t.dataset.tab || 'orig'; if(cvAnn && state.tab!=='annot'){ const c=cvAnn.getContext('2d'); c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,cvAnn.width,cvAnn.height);} safeDraw(); }));

// UI events
on($('th'),'input',()=>{ $('tVal').textContent=$('th').value; if(state.parsed) { recomputeParams(); updateCards(); } });
on($('power'),'change',()=>state.parsed&&(recomputeParams(),updateCards()));
on($('gas'),'change',()=>state.parsed&&(recomputeParams(),updateCards()));
on($('calc'),'click',()=>{ if(!state.parsed) return; recomputeParams(); updateCards(); document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x.dataset.tab==='annot')); state.tab='annot'; if (cvAnn) drawPierceLabels(state, cvAnn); safeDraw(); });

// Exports
on($('dlOrig'),'click',()=>downloadText('original.dxf', state.origDXF || state.__lastFileText || state.rawDXF || ''));
on($('dlAnn'),'click',()=>downloadText('annotated_comments.dxf',createAnnotatedDXF(state.rawDXF,state.parsed,{ labels: !!$('showLabels')?.checked })));
on($('dlDXFMarkers'),'click',()=>downloadText('with_markers.dxf',createDXFWithMarkers(state.rawDXF,state.parsed,0.5)));
on($('dlSVG'),'click',()=>downloadText('drawing.svg',createSVG(state.parsed)));
on($('dlCSV'),'click',()=>downloadText('entities.csv',createCSV(state.parsed)));
on($('dlReport'),'click',()=>downloadText('nesting_report.txt', makeNestingReport(state)));

// Drag & drop / file
const drop=$('drop');
on(drop,'dragover',e=>{e.preventDefault(); drop.style.borderColor='#6d8cff'});
on(drop,'dragleave',()=>drop.style.borderColor='#44507a');
on(drop,'drop',e=>{e.preventDefault(); drop.style.borderColor='#44507a'; const f=e.dataTransfer.files?.[0]; if(f) loadFile(f) });
on($('file'),'change',e=>{ const f=e.target.files?.[0]; if(f) loadFile(f) });

// Worker management
let worker = null;
try{
  worker = new Worker('./parser-worker.js');
  worker.onerror = (e)=>console.error('[worker error]', e.message);
}catch(err){
  console.warn('Worker init failed:', err);
  worker = null;
}
function postToWorker(payload, timeoutMs=2500){
  return new Promise((resolve,reject)=>{
    if(!worker) return reject(new Error('no-worker'));
    let to = setTimeout(()=>{ worker.removeEventListener('message', onMsg); reject(new Error('timeout')) }, timeoutMs);
    function onMsg(e){ clearTimeout(to); worker.removeEventListener('message', onMsg); resolve(e.data) }
    worker.addEventListener('message', onMsg);
    worker.postMessage(payload);
  });
}
async function parseDXF(content){
  if(worker){
    try{
      const res = await postToWorker(content, 2500);
      if(res && res.ok) return res.res;
      console.warn('Worker returned error, fallback to main thread:', res?.err);
    }catch(e){
      console.warn('Worker timeout/fail, fallback to main thread:', e);
    }
  }
  return parseDXFMainThread(content);
}

// Load file
async function loadFile(f){
  try{
    setStatus('Чтение файла…','warn');
    const txt = await f.text();
    state.rawDXF = txt;
    state.origDXF = txt;
    state.__lastFileText = txt;
    state.__currentLibId = null;
    state.__currentName = (f && f.name) ? f.name : 'чертёж.dxf';
    try{ $('file').value=''; }catch{}
    setStatus('Парсинг DXF…','warn');
    const parsed = sanitizeParsed(await parseDXF(txt));
    state.parsed = parsed;
    buildPaths(state);
    ['calc','nest','dlOrig','dlAnn','dlDXFMarkers','dlSVG','dlCSV','dlReport'].forEach(id=>{ const el = $(id); if(el) el.disabled=false; });
    if ($('dl')) $('dl').hidden=false;
    updateCards();
    fitView(state, cv);
safeDraw();
if (cvAnn) drawPierceLabels(state, cvAnn);
if (typeof requestDrawLabels==='function') requestDrawLabels();
    setStatus(`Готово: объектов — ${parsed.entities.length}, длина — ${parsed.totalLen.toFixed(3)} м, врезок — ${parsed.pierceCount}`,'ok');
  }catch(err){
    console.error(err);
    setStatus('Ошибка: '+(err?.message||String(err)),'err');
  }
}

// Cost/time
function recomputeParams(){
  const th=parseFloat($('th').value), power=$('power').value, gas=$('gas').value;
  const cp = calcCutParams(power, th, gas);
  $('cutSpd').value = cp.can ? cp.speed : 0;
  $('pierceSec').value = cp.can ? cp.pierce.toFixed(2) : 0;
  if(state.nesting) updateNestingMetrics();
}
function updateCards(){
  if(!state.parsed) return;
  const th=parseFloat($('th').value), power=$('power').value, gas=$('gas').value;
  const {can,speed,pierce,gasCons} = calcCutParams(power, th, gas);
  const perM=parseFloat($('pPerM').value), perPierce=parseFloat($('pPierce').value), gasRubPerMin=parseFloat($('gasPrice').value), machRubPerHr=parseFloat($('machPrice').value);

  const cutMin = can ? (state.parsed.totalLen*1000) / speed : 0;
  const pierceMin = can ? (state.parsed.pierceCount * pierce) / 60 : 0;
  const totalMin = cutMin + pierceMin;

  const cutRub = perM * state.parsed.totalLen;
  const pierceRub = perPierce * state.parsed.pierceCount;
  const gasRub = gasRubPerMin * totalMin * (gasCons?gasCons/4:1);
  const machRub = (machRubPerHr/60) * totalMin;
  const totalRub = cutRub + pierceRub + gasRub + machRub;

  $('mLen').textContent = (state.parsed.totalLen).toFixed(3)+' м';
  $('mPierce').textContent = state.parsed.pierceCount;
  $('mEnt').textContent = state.parsed.entities.length;

  $('mCutMin').textContent = (cutMin).toFixed(2)+' мин';
  $('mPierceMin').textContent = (pierceMin).toFixed(2)+' мин';
  $('mTotalMin').textContent = (totalMin).toFixed(2)+' мин';

  $('mCutRub').textContent = (cutRub).toFixed(2)+' ₽';
  $('mPierceRub').textContent = (pierceRub).toFixed(2)+' ₽';
  $('mGasRub').textContent = (gasRub).toFixed(2)+' ₽';
  $('mMachRub').textContent = (machRub).toFixed(2)+' ₽';
  $('mTotalRub').textContent = (totalRub).toFixed(2)+' ₽';
  if(state.nesting) updateNestingMetrics();
}
function updateNestingMetrics(){
  if (!state.nesting || !state.parsed) return;
  const plan = state.nesting;
  const th = valNum('th'), power=$('power').value, gas=$('gas').value;
  const {can,speed,pierce,gasCons} = calcCutParams(power, th, gas);
  const perM=valNum('pPerM');
  const perPierce=valNum('pPierce');
  const gasRubPerMin=valNum('gasPrice');
  const machRubPerHr=valNum('machPrice');

  const lenPerPart = state.parsed.totalLen||0;
  const piercePerPart = state.parsed.pierceCount||0;
  const onSheet = Math.max(0, plan.placed||0);

  const lenSheet = lenPerPart * onSheet;
  const pierceSheet = piercePerPart * onSheet;

  const cutMin = can && speed>0 ? (lenSheet*1000) / speed : 0;
  const pierceMin = can ? (pierceSheet * (pierce||0)) / 60 : 0;
  const totalMin = cutMin + pierceMin;

  const cutRub = perM * lenSheet;
  const pierceRub = perPierce * pierceSheet;
  const gasRub = gasRubPerMin * totalMin * (gasCons?gasCons/4:1);
  const machRub = (machRubPerHr/60) * totalMin;
  const totalRub = cutRub + pierceRub + gasRub + machRub;

  if ($('nTime')) $('nTime').textContent = totalMin.toFixed(2)+' мин';
  if ($('nCost')) $('nCost').textContent = totalRub.toFixed(2)+' ₽';
}


// Nesting
on($('nest'), 'click', ()=>{
  if(!state.parsed){ setStatus('Сначала загрузите DXF','err'); return; }
  const W = +$('sW').value, H = +$('sH').value, m = +$('margin').value, g = +$('spacing').value, qty = +$('qty').value;
  const rotStr = $('rotations').value; const rots = rotStr.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!Number.isNaN(n));
  const box = partBBox(state.parsed);
  if (box.w<=0 || box.h<=0){ setStatus('Не удалось определить габарит детали','err'); return; }
  const plan = computeNesting(W,H,m,g, qty, box.w, box.h, rots);
  state.nesting = {...plan, box};
  document.getElementById('nestCard').hidden = false;
  $('nPlaced').textContent = plan.placed;
  $('nSheets').textContent = plan.sheets;
  const usedArea = plan.placed * (plan.pw * plan.ph);
  const eff = usedArea / (plan.W*plan.H) * 100;
  $('nEff').textContent = eff.toFixed(1)+'%';
  updateNestingMetrics();
  $('nRot').textContent = plan.rot + '°';
  state.tab = 'nest';
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab==='nest'));
  safeDraw();
  setStatus('Раскладка готова','ok');
});

// Tests
const runTests = makeRunTests({ parseDXF: parseDXFMainThread, sanitizeParsed, computeNesting });
on($('runTests'),'click', runTests);

// Init
setStatus('Готово к работе','ok');

(function bindServiceUI(){
  const $ = id => document.getElementById(id);
  const chk = $('showLabels');
  if (chk) { state.showPierceLabels = !!chk.checked; chk.addEventListener('change', e=>{ state.showPierceLabels = !!e.target.checked; requestDrawLabels(); }); }
  const epsSel = $('pierceEps'); if(epsSel) epsSel.addEventListener('change', async e=>{
    state.pierceEps = +e.target.value||0.8;
    if(state.__lastFileText){ window.PIERCE_EPS = state.pierceEps; await parseDXF(state.__lastFileText, true); } else { if(window.onDraw) requestDraw(); }
  });
})();


async function renderLibrary(filter=''){
  const box = document.getElementById('libList');
  if(!box) return;
  const rows = await lib.listDXF();
  const q = (filter||'').trim().toLowerCase();
  const fmt = (n)=> new Date(n).toLocaleString();
  const sizeKB = (n)=> (n/1024).toFixed(1)+' KB';
  box.innerHTML = '';
  for(const r of rows){
    if(q && !(String(r.name||'').toLowerCase().includes(q))) continue;
    const div = document.createElement('div'); div.className='lib-item'; div.dataset.id=r.id;
    div.innerHTML = `
  <div class="lib-title">${r.name||'(без имени)'}</div>
  <div class="lib-meta">${sizeKB(r.size||0)} · ${fmt(r.added)}</div>
  <div class="lib-actions lib-actions-under">
    <button class="icon-btn lib-use" data-id="${r.id}" title="Выбрать" aria-label="Выбрать">
      <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>
    </button>
    <button class="icon-btn lib-rename" data-id="${r.id}" title="Переименовать" aria-label="Переименовать">
      <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>
    </button>
    <button class="icon-btn lib-export" data-id="${r.id}" title="Скачать" aria-label="Скачать">
      <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
    </button>
    <button class="icon-btn lib-del" data-id="${r.id}" title="Удалить" aria-label="Удалить">
      <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6l1-2h6l1 2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg>
    </button>
  </div>`;
    box.appendChild(div);
  }
}

(function bindLibraryUI(){
  const impBtn = document.getElementById('libImportBtn');
  const imp = document.getElementById('libImport');
  const saveBtn = document.getElementById('libSaveCurrentBtn');
  const search = document.getElementById('libSearch');
const list = document.getElementById('libList');
const dirRow = document.getElementById('dxfDirRow');
const dirBtn = document.getElementById('libPickDirBtn');
const scanBtn = document.getElementById('libScanBtn');
const autoCb = document.getElementById('libAutoImport');
const dirName = document.getElementById('libDirName');
const HAS_FS = 'showDirectoryPicker' in window;

if (!HAS_FS && dirRow){
  dirRow.querySelectorAll('button,input').forEach(el=>{ el.disabled = true; el.title = 'Требуется Chrome/Edge (HTTPS или localhost)'; });
}

(async ()=>{
  try{
    // Always scan the internal OPFS "DXF" folder at startup
    try{
      const r0 = await lib.scanPermanentDXF();
      if (r0 && (r0.imported||r0.skipped)) {
        await renderLibrary(search?search.value:'');
      }
    }catch(e){ console.warn('OPFS DXF scan:', e); }

    const on = await lib.getAutoImport();
    if (autoCb) autoCb.checked = !!on;
    const h = await lib.getDirHandle();
    if (dirName) dirName.textContent = h ? 'Папка настроена' : 'Папка не выбрана';
    if (on && h){
      const r = await lib.scanDirAndImport();
      if (r && r.error) {
        setStatus('Авто-импорт: '+r.error, 'err');
        try{ await lib.saveDirHandle(null); }catch(_){}
        if (dirName) dirName.textContent = 'Папка не выбрана';
      } else {
        await renderLibrary(search?search.value:'');
      }
    }
  }catch(e){ console.warn(e); }
})();

if (autoCb){
  autoCb.addEventListener('change', async e=>{
    try{ await lib.setAutoImport(!!e.target.checked); }catch(err){ console.warn(err); }
  });
}
if (dirBtn){
  dirBtn.addEventListener('click', async ()=>{
    try{
      if (!HAS_FS) return;
      const handle = await window.showDirectoryPicker({ id:'dxf-folder' });
      await lib.saveDirHandle(handle);
      if (dirName) dirName.textContent = 'Папка настроена';
    }catch(err){ console.warn(err); }
  });
}
if (scanBtn){
  scanBtn.addEventListener('click', async ()=>{
    try{
      const r = await lib.scanDirAndImport();
      if (r && r.error) { setStatus('Авто-импорт: '+r.error,'err'); try{ await lib.saveDirHandle(null); }catch(_){} if (dirName) dirName.textContent='Папка не выбрана'; } else { await renderLibrary(search?search.value:''); }
      setStatus(`Импортировано: ${r.imported}, пропущено: ${r.skipped}`);
    }catch(err){ setStatus('Ошибка сканирования','err'); }
  });
}

  if(impBtn && imp) impBtn.addEventListener('click', ()=> imp.click());
  if(imp){
    imp.addEventListener('change', async (e)=>{
      const files = Array.from(e.target.files||[]);
      for(const f of files){
        const text = await new Promise((res,rej)=>{ const r=new FileReader(); r.onerror=()=>rej(new Error('read fail')); r.onload=()=>res(String(r.result||'')); r.readAsText(f); });
        await lib.addDXF(f.name, text);
      }
      await renderLibrary(search?search.value:'');
      setStatus('Импорт завершён');
      e.target.value = '';
    });
  }

  if(saveBtn) saveBtn.addEventListener('click', async ()=>{
    // Prefer the latest loaded text
    let text = state.__lastFileText;
    if(!text || !String(text).trim()){
      if(state.__currentLibId){
        const row = await lib.getDXF(state.__currentLibId);
        text = row && row.text || '';
      }
    }
    if(!text || !String(text).trim()){
      setStatus('Нет загруженного DXF','err'); return;
    }
    const defName = state.__currentName && String(state.__currentName).trim() ? state.__currentName : 'чертёж.dxf';
    const name = prompt('Название для библиотеки:', defName);
    if(!name) return;
    await lib.addDXF(name, String(text));
    setStatus('Сохранено в библиотеку');
    await renderLibrary(search?search.value:'');
  });

  if(search) search.addEventListener('input', ()=> renderLibrary(search.value||''));

  if(list) list.addEventListener('click', async (e)=>{
  const t = e.target.closest('button'); if(!t) return;
  let id = t.dataset.id;
  const idNum = Number(id);
  if(!Number.isFinite(idNum)){ setStatus('Некорректный ID записи','err'); return; }
  id = idNum;

  if(t.classList.contains('lib-use')){
    const row = await lib.getDXF(id); if(!row){ setStatus('Запись не найдена','err'); return; }
    state.__currentLibId = row.id;
    state.__currentName = row.name || ('file_'+id+'.dxf');
    state.__lastFileText = row.text || '';
    state.origDXF = row.text || '';
    state.rawDXF = row.text || '';
    state.origDXF = row.text || '';
    setStatus('Парсинг DXF…','warn');
    const parsed = sanitizeParsed(await parseDXF(state.__lastFileText));
    state.parsed = parsed;
    buildPaths(state);
    ['calc','nest','dlOrig','dlAnn','dlDXFMarkers','dlSVG','dlCSV'].forEach(k=>{ const el = $(k); if(el) el.disabled=false; });
    if ($('dl')) $('dl').hidden=false;
    fitView(state, cv);
if (window.onDraw) requestDraw();
if (typeof requestDrawLabels==='function') requestDrawLabels();
    if ($('mLen')) $('mLen').textContent = (state.parsed.totalLen).toFixed(3)+' м';
    if ($('mPierce')) $('mPierce').textContent = state.parsed.pierceCount;
    if ($('mEnt')) $('mEnt').textContent = state.parsed.entities.length;
    setStatus('Загружено из библиотеки: '+(row.name||id),'ok');
  } else if(t.classList.contains('lib-rename')){
    const row = await lib.getDXF(id); if(!row) return;
    const name = prompt('Новое имя', row.name||''); if(!name) return;
    await lib.renameDXF(id, name); await renderLibrary(search?search.value:'');
  } else if(t.classList.contains('lib-export')){
    const row = await lib.getDXF(id); if(!row) return;
    const blob = new Blob([row.text||''], {type:'application/dxf'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = row.name || ('file_'+id+'.dxf'); document.body.appendChild(a);
    a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  } else if(t.classList.contains('lib-del')){
    if(!confirm('Удалить файл из библиотеки?')) return;
    await lib.removeDXF(id); await renderLibrary(search?search.value:'');
  }
});

  // first render
  renderLibrary('');
})();
function requestDrawLabels(){ requestAnimationFrame(()=>{ ensureOverlaySize(); if(cvAnn) drawPierceLabels(state, cvAnn); }); }