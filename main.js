import { $, on, dpr, fmt, setStatus } from './utils.js';
import { calcCutParams } from './cost.js';
import { parseDXFMainThread, sanitizeParsed } from './parse.js';
import { initCanvasInteractions, buildPaths, drawEntities, fitView } from './render.js';
import { partBBox, computeNesting, drawNesting, makeNestingReport } from './nesting.js';
import { createAnnotatedDXF, createDXFWithMarkers, createSVG, createCSV, downloadText } from './annotate.js';
import { makeRunTests } from './tests.js';

const state={rawDXF:'', parsed:null, tab:'orig', pan:{x:0,y:0}, zoom:1, nesting:null, paths:[], piercePaths:[], index:null};
let cv = null;

function initializeApp() {
  cv = $('cv');
  if (!cv) {
    console.error('Canvas element with ID "cv" not found!');
    setStatus('Ошибка: не найден элемент canvas', 'err');
    return;
  }
  
  // Test canvas context
  try {
    const testCtx = cv.getContext('2d');
    if (!testCtx) {
      console.error('Failed to get 2D canvas context');
      setStatus('Ошибка: не удалось получить контекст canvas', 'err');
      return;
    }
  } catch (e) {
    console.error('Canvas context error:', e);
    setStatus('Ошибка контекста canvas: ' + e.message, 'err');
    return;
  }
  
  try {
    initCanvasInteractions(state, cv, safeDraw);
    initializeEventHandlers();
    console.log('App initialized successfully');
  } catch (e) {
    console.error('Error initializing app:', e);
    setStatus('Ошибка инициализации: ' + e.message, 'err');
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

function safeDraw(){
  if (!cv) {
    console.error('Canvas not initialized');
    setStatus('Ошибка: Canvas не инициализирован', 'err');
    return;
  }
  
  try {
    const ctx = cv.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context in safeDraw');
      setStatus('Ошибка: не удалось получить контекст canvas', 'err');
      return;
    }
    
    if(!state.parsed){ 
      ctx.setTransform(1,0,0,1,0,0); 
      ctx.clearRect(0,0,cv.width,cv.height);
      console.log('No parsed data, canvas cleared');
      return; 
    }
    
    console.log('Drawing with tab:', state.tab, 'entities:', state.parsed?.entities?.length || 0);
    
    if(state.tab==='nest') {
      drawNesting(state, cv);
    } else {
      drawEntities(state, cv, state.tab==='annot');
    }
    
    console.log('Draw completed successfully');
  } catch(e) { 
    console.error('Error in safeDraw:', e); 
    setStatus('Ошибка при отрисовке: '+e.message,'err');
  }
}

function initializeEventHandlers() {
  // Tabs
  document.querySelectorAll('.tab').forEach(t=>on(t,'click',()=>{ state.tab=t.dataset.tab; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===t)); safeDraw() }));

  // UI events
  on($('th'),'input',()=>{ $('tVal').textContent=$('th').value; if(state.parsed) { recomputeParams(); updateCards(); } });
  on($('power'),'change',()=>state.parsed&&(recomputeParams(),updateCards()));
  on($('gas'),'change',()=>state.parsed&&(recomputeParams(),updateCards()));
  on($('calc'),'click',()=>{ if(!state.parsed) return; recomputeParams(); updateCards(); state.tab='annot'; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x.dataset.tab==='annot')); safeDraw() });

  // Exports
  on($('dlOrig'),'click',()=>downloadText('original.dxf',state.rawDXF));
  on($('dlAnn'),'click',()=>downloadText('annotated_comments.dxf',createAnnotatedDXF(state.rawDXF,state.parsed)));
  on($('dlDXFMarkers'),'click',()=>downloadText('with_markers.dxf',createDXFWithMarkers(state.rawDXF,state.parsed,0.5)));
  on($('dlSVG'),'click',()=>downloadText('drawing.svg',createSVG(state.parsed)));
  on($('dlCSV'),'click',()=>downloadText('entities.csv',createCSV(state.parsed)));
  on($('dlReport'),'click',()=>downloadText('nesting_report.txt', makeNestingReport(state)));

  // Drag & drop / file
  const drop=$('drop');
  on(drop,'dragover',e=>{e.preventDefault(); drop.style.borderColor='#6d8cff'});
  on(drop,'dragleave',()=>drop.style.borderColor='#44507a');
  on(drop,'drop',e=>{e.preventDefault(); drop.style.borderColor='#44507a'; const f=e.dataTransfer.files?.[0]; if(f) loadFile(f) });
  on(drop,'click',()=>$('file').click()); // Add click handler for file selection
  on($('file'),'change',e=>{ const f=e.target.files?.[0]; if(f) loadFile(f) });

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
    $('nTime').textContent = '—';
    $('nCost').textContent = '—';
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
}

// Note: Event handlers moved to initializeEventHandlers function to avoid duplicates

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
    console.log('Loading file:', f.name, 'size:', f.size);
    setStatus('Чтение файла…','warn');
    const txt = await f.text();
    console.log('File read, content length:', txt.length);
    state.rawDXF = txt;
    try{ $('file').value=''; }catch{}
    
    setStatus('Парсинг DXF…','warn');
    const parsed = sanitizeParsed(await parseDXF(txt));
    console.log('DXF parsed, entities:', parsed?.entities?.length || 0);
    
    if (!parsed || !parsed.entities || parsed.entities.length === 0) {
      throw new Error('Не найдено объектов в DXF файле');
    }
    
    state.parsed = parsed;
    console.log('Building paths...');
    buildPaths(state);
    console.log('Paths built, count:', state.paths?.length || 0);
    
    ['calc','nest','dlOrig','dlAnn','dlDXFMarkers','dlSVG','dlCSV','dlReport'].forEach(id=>{ const el = $(id); if(el) el.disabled=false; });
    if ($('dl')) $('dl').hidden=false;
    
    console.log('Updating cards...');
    updateCards();
    
    console.log('Fitting view...');
    fitView(state, cv); 
    
    console.log('Drawing...');
    safeDraw();
    
    console.log('File loaded successfully');
    setStatus(`Готово: объектов — ${parsed.entities.length}, длина — ${parsed.totalLen.toFixed(3)} м, врезок — ${parsed.pierceCount}`,'ok');
  }catch(err){
    console.error('Error loading file:', err);
    setStatus('Ошибка: '+(err?.message||String(err)),'err');
  }
}

// Cost/time
function recomputeParams(){
  const th=parseFloat($('th').value), power=$('power').value, gas=$('gas').value;
  const cp = calcCutParams(power, th, gas);
  $('cutSpd').value = cp.can ? cp.speed : 0;
  $('pierceSec').value = cp.can ? cp.pierce.toFixed(2) : 0;
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
}

// Note: Nesting and Tests handlers moved to initializeEventHandlers function to avoid duplicates
