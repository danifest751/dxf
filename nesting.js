export function partBBox(parsed){
  const b = bounds(parsed.entities);
  // Check if bounds are valid (not infinite)
  const hasBounds = b.minX < Infinity && b.minY < Infinity && b.maxX > -Infinity && b.maxY > -Infinity;
  if (!hasBounds) {
    return { w: 0, h: 0, minX: 0, minY: 0 };
  }
  return { w: Math.max(0, b.maxX - b.minX), h: Math.max(0, b.maxY - b.minY), minX:b.minX, minY:b.minY };
}
function bounds(ents){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of ents){ if(!e||!e.raw) continue;
    if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; minX=Math.min(minX,x1,x2); minY=Math.min(minY,y1,y2); maxX=Math.max(maxX,x1,x2); maxY=Math.max(maxY,y1,y2) }
    else if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='ARC'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='POLY'){ const pts=e.raw.pts||[]; for(const p of pts){ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y) } }
  }
  return {minX,minY,maxX,maxY};
}
export function computeGrid(W,H,m,g,pw,ph, qty){
  // Validate all input parameters to prevent unexpected behavior
  if (typeof W !== 'number' || !isFinite(W) || W <= 0) return {cols:0,rows:0,placed:0,positions:[]};
  if (typeof H !== 'number' || !isFinite(H) || H <= 0) return {cols:0,rows:0,placed:0,positions:[]};
  if (typeof m !== 'number' || !isFinite(m) || m < 0) m = 0;
  if (typeof g !== 'number' || !isFinite(g) || g < 0) g = 0;
  if (typeof pw !== 'number' || !isFinite(pw) || pw <= 0) return {cols:0,rows:0,placed:0,positions:[]};
  if (typeof ph !== 'number' || !isFinite(ph) || ph <= 0) return {cols:0,rows:0,placed:0,positions:[]};
  if (typeof qty !== 'number' || !isFinite(qty) || qty < 0) qty = 0;
  
  const workW = W - 2*m, workH = H - 2*m;
  if (workW<=0 || workH<=0) return {cols:0,rows:0,placed:0,positions:[]};
  
  const cols = Math.max(0, Math.floor((workW + g) / (pw + g)));
  const rows = Math.max(0, Math.floor((workH + g) / (ph + g)));
  const capacity = cols * rows;
  const placed = Math.min(qty, capacity);
  const positions = [];
  let n=0;
  for (let r=0; r<rows && n<placed; r++){
    for (let c=0; c<cols && n<placed; c++){
      positions.push({ x: m + c*(pw+g), y: m + r*(ph+g) });
      n++;
    }
  }
  return {cols,rows,placed,positions, workW, workH};
}
export function computeNesting(W,H,m,g, qty, pw,ph, rotations=[0,90]){
  const opts = [];
  const rotSet = Array.from(new Set(rotations.map(r=>((r%360)+360)%360)));
  for(const r of rotSet){
    const w = (r===90 || r===270) ? ph : pw;
    const h = (r===90 || r===270) ? pw : ph;
    const gridRes = computeGrid(W,H,m,g,w,h, qty);
    opts.push({...gridRes, rot:r, pw:w, ph:h});
  }
  opts.sort((a,b)=> b.placed - a.placed || (b.workW*b.workH) - (a.workW*a.workH));
  const best = opts[0]||{cols:0,rows:0,placed:0,rot:0,pw:pw,ph:ph, positions:[]};
  const sheets = Math.max(1, Math.ceil(qty / Math.max(best.placed,1)));
  return {...best, sheets, W,H,m,g, rotations:rotSet};
}
export function drawNesting(state, canvas){
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
  const n = state.nesting;
  if(!n){ ctx.fillStyle='#7180a3'; ctx.font='14px system-ui'; ctx.fillText('Сначала рассчитайте раскладку', 18, 28); return; }

  const pad = 30 * (window.devicePixelRatio||1);
  const k = Math.min((canvas.width-2*pad)/n.W, (canvas.height-2*pad)/n.H);
  const ox = (canvas.width - n.W*k)/2, oy = (canvas.height - n.H*k)/2;

  ctx.fillStyle='#101828'; ctx.strokeStyle='#2b3753'; ctx.lineWidth=2;
  ctx.fillRect(ox,oy,n.W*k,n.H*k); ctx.strokeRect(ox,oy,n.W*k,n.H*k);

  ctx.setLineDash([8,8]); ctx.strokeStyle='#394b78';
  ctx.strokeRect(ox+n.m*k, oy+n.m*k, (n.W-2*n.m)*k, (n.H-2*n.m)*k);
  ctx.setLineDash([]);

  ctx.strokeStyle='#77a1ff'; ctx.fillStyle='rgba(109,140,255,0.18)'; ctx.lineWidth=2;
  const pw = n.pw, ph = n.ph;
  for (let i=0;i<n.positions.length;i++){
    const p = n.positions[i];
    const x = ox + p.x*k, y = oy + p.y*k, w = pw*k, h = ph*k;
    ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
    ctx.fillStyle='#d7e0ff'; ctx.font = `${12*(window.devicePixelRatio||1)}px system-ui`;
    ctx.fillText(String(i+1), x+4, y+14);
    ctx.fillStyle='rgba(109,140,255,0.18)';
  }
}
export function makeNestingReport(state){
  const n = state.nesting; if(!n) return 'Нет раскладки';
  const lines = [];
  lines.push('=== ОТЧЁТ ПО РАСКЛАДКЕ ===');
  lines.push(`Размер листа: ${n.W} x ${n.H} мм, отступ ${n.m} мм, зазор ${n.g} мм`);
  lines.push(`Поворот детали: ${n.rot}°`);
  lines.push(`На листе: ${n.placed} шт (сетка ${n.cols} x ${n.rows})`);
  lines.push(`Нужно листов: ${n.sheets}`);
  const usedArea = n.placed * (n.pw * n.ph);
  const eff = usedArea / (n.W*n.H) * 100;
  lines.push(`Эффективность площади: ${eff.toFixed(1)}%`);
  return lines.join('\\n');
}
