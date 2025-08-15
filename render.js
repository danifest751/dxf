import { dpr, screenToWorld, clamp } from './utils.js';

export function initCanvasInteractions(state, canvas, onDraw){
  const ctx = canvas.getContext('2d');
  function resize(){
    const r=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.floor(r.width*dpr));
    canvas.height=Math.max(1,Math.floor(r.height*dpr));
    onDraw();
  }
  window.addEventListener('resize', resize);
  resize();

  const world = ()=>{
    ctx.setTransform(state.zoom*dpr,0,0,-state.zoom*dpr,state.pan.x,canvas.height-state.pan.y);
  };
  state.__ctx = ctx;
  state.__world = world;

  let dragging=false, last={x:0,y:0};
  canvas.addEventListener('mousedown',e=>{dragging=true; last={x:e.clientX,y:e.clientY}; state.__hover = null; hideTooltip();});
  window.addEventListener('mouseup',()=>dragging=false);
  window.addEventListener('mousemove',e=>{
    if(dragging){
      const dx=e.clientX-last.x, dy=e.clientY-last.y;
      last={x:e.clientX,y:e.clientY};
      state.pan.x+=dx; state.pan.y+=dy; onDraw(); return;
    }
    if(!state.index) return;
    const pt = screenToWorld(state, canvas, e.clientX, e.clientY);
    const found = hitTest(state, pt.x, pt.y, 4/state.zoom);
    state.__hover = found;
    if(found){
      showTooltip(e.clientX, e.clientY, tooltipText(state, found));
    }else hideTooltip();
    onDraw();
  }, {passive:true});
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const k=Math.exp(-e.deltaY*0.0015);
    const rect=canvas.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*dpr, my=(e.clientY-rect.top)*dpr;
    const x=(mx-state.pan.x)/(state.zoom*dpr);
    const y=(canvas.height-my-state.pan.y)/(state.zoom*dpr);
    state.zoom*=k; state.zoom=clamp(state.zoom,0.05,50);
    const nx=x*state.zoom*dpr+state.pan.x;
    const ny=canvas.height-(y*state.zoom*dpr+state.pan.y);
    state.pan.x+=mx-nx; state.pan.y+=my-ny; onDraw();
  }, {passive:false});
}

function tooltipText(state, h){
  const e = state.parsed.entities[h.id];
  if(!e) return '';
  const base = `${e.type} • L=${(e.len||0).toFixed(3)} м`;
  return base;
}
function showTooltip(x,y, html){
  const tt = document.getElementById('tooltip');
  if(!tt) return;
  tt.innerHTML = html;
  tt.style.display='block';
  tt.style.left = x+'px';
  tt.style.top = y+'px';
}
function hideTooltip(){
  const tt = document.getElementById('tooltip');
  if(tt) tt.style.display='none';
}

export function buildPaths(state){
  state.paths = [];
  state.piercePaths = [];
  const ents = state.parsed?.entities||[];
  for(const e of ents){
    const p = new Path2D();
    if(e.type==='LINE'){
      const {x1,y1,x2,y2}=e.raw; p.moveTo(x1,y1); p.lineTo(x2,y2);
    }else if(e.type==='CIRCLE'){
      const {cx,cy,r}=e.raw; p.moveTo(cx+r,cy); p.arc(cx,cy,r,0,Math.PI*2,false);
    }else if(e.type==='ARC'){
      const {cx,cy,r,a1=0,a2=0}=e.raw;
      let A1=a1*Math.PI/180, A2=a2*Math.PI/180; let d=A2-A1; if(d<0) d+=2*Math.PI;
      const steps = Math.max(24, Math.min(360, Math.ceil((r*d)/1.5)));
      for(let k=0;k<=steps;k++){
        const a=A1 + d*(k/steps); const x=cx + r*Math.cos(a); const y=cy + r*Math.sin(a);
        if(k===0) p.moveTo(x,y); else p.lineTo(x,y);
      }
    }else if(e.type==='POLY'){
      const pts=e.raw.pts||[]; if(pts.length){ p.moveTo(pts[0].x,pts[0].y); for(let i=1;i<pts.length;i++) p.lineTo(pts[i].x,pts[i].y); if(e.raw.closed) p.closePath(); }
    }
    state.paths.push(p);
  }
  const piercePts = state.parsed?.piercePts||[];
  for(const pt of piercePts){
    const pp = new Path2D();
    const r=3; pp.moveTo(pt[0]+r,pt[1]); pp.arc(pt[0],pt[1],r,0,Math.PI*2,false);
    state.piercePaths.push(pp);
  }
  state.index = buildIndex(state);
}

export function bounds(ents){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of ents){ if(!e||!e.raw) continue;
    if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; minX=Math.min(minX,x1,x2); minY=Math.min(minY,y1,y2); maxX=Math.max(maxX,x1,x2); maxY=Math.max(maxY,y1,y2) }
    else if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='ARC'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='POLY'){ const pts=e.raw.pts||[]; for(const p of pts){ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y) } }
  }
  return {minX,minY,maxX,maxY};
}

export function fitView(state, canvas){
  if(!state.parsed || !state.parsed.entities.length){ state.pan={x:0,y:0}; state.zoom=1; return; }
  const b = bounds(state.parsed.entities);
  const pad=20; const w=(b.maxX-b.minX)||1, h=(b.maxY-b.minY)||1;
  const W=canvas.width, H=canvas.height;
  const k = Math.min((W-2*pad*dpr)/w, (H-2*pad*dpr)/h);
  state.zoom = Math.max(0.05, k);
  state.pan.x = (W - (b.minX+b.maxX)*state.zoom*dpr)/2;
  state.pan.y = (H - (b.minY+b.maxY)*state.zoom*dpr)/2;
}

export function drawEntities(state, canvas, annot=false){
  const ctx = state.__ctx, world = state.__world;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
  world();
  const stroke=(rgb,width=2,alpha=1)=>{ ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`; ctx.lineWidth=width; };

  stroke([80,90,120],1,0.6); ctx.beginPath(); ctx.moveTo(-1e5,0); ctx.lineTo(1e5,0); ctx.moveTo(0,-1e5); ctx.lineTo(0,1e5); ctx.stroke();

  const ents = state.parsed?.entities||[];
  const paths = state.paths||[];
  for(let i=0;i<ents.length;i++){
    const e=ents[i]; const p=paths[i]; if(!e||!p) continue;
    if(state.__hover && state.__hover.id===e.id){
      ctx.shadowColor='rgba(109,140,255,0.8)'; ctx.shadowBlur=8;
      stroke([109,140,255],3); ctx.stroke(p);
      ctx.shadowBlur=0;
    }else{
      if(e.type==='LINE'){ stroke([120,180,255],2); ctx.stroke(p); }
      else if(e.type==='CIRCLE'){ stroke([255,180,120],2); ctx.stroke(p); }
      else if(e.type==='ARC'){ stroke([160,255,160],2); ctx.stroke(p); }
      else if(e.type==='POLY'){ stroke([200,200,255],2); ctx.stroke(p); }
    }
  }

  if(annot){
    const strokeR=(width=2)=>{ ctx.strokeStyle=`rgba(255,80,80,1)`; ctx.lineWidth=width; };
    strokeR(2);
    for(const pp of state.piercePaths){ ctx.stroke(pp); }

    
  }
}

/* tiny R-tree for hover */
function entBBox(e){
  if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; return {minX:Math.min(x1,x2),minY:Math.min(y1,y2),maxX:Math.max(x1,x2),maxY:Math.max(y1,y2), id:e.id}; }
  if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; return {minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r, id:e.id}; }
  if(e.type==='ARC'){ const {cx,cy,r}=e.raw; return {minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r, id:e.id}; }
  if(e.type==='POLY'){ const pts=e.raw.pts||[]; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);} return {minX,minY,maxX,maxY,id:e.id}; }
  return {minX:0,minY:0,maxX:0,maxY:0,id:e.id};
}
function bboxUnion(a,b){ return {minX:Math.min(a.minX,b.minX),minY:Math.min(a.minY,b.minY),maxX:Math.max(a.maxX,b.maxX),maxY:Math.max(a.maxY,b.maxY)}; }
function buildIndex(state, M=8){
  const items = (state.parsed?.entities||[]).map(entBBox);
  if(!items.length) return null;
  const n=items.length;
  const sliceCount = Math.ceil(Math.sqrt(n/M));
  const sliceSize = Math.ceil(n / sliceCount);
  items.sort((a,b)=>a.minX-b.minX);
  const leaves=[];
  for(let s=0; s<sliceCount; s++){
    const slice = items.slice(s*sliceSize, (s+1)*sliceSize).sort((a,b)=>a.minY-b.minY);
    for(let i=0;i<slice.length;i+=M){
      const group = slice.slice(i,i+M);
      const bb = group.reduce((acc,c)=>acc?bboxUnion(acc,c):{minX:c.minX,minY:c.minY,maxX:c.maxX,maxY:c.maxY}, null);
      leaves.push({children:group, leaf:true, ...bb});
    }
  }
  let level = leaves;
  while(level.length>1){
    const next=[];
    level.sort((a,b)=>a.minX-b.minX);
    for(let i=0;i<level.length;i+=M){
      const group = level.slice(i,i+M);
      const bb = group.reduce((acc,c)=>acc?bboxUnion(acc,c):{minX:c.minX,minY:c.minY,maxX:c.maxX,maxY:c.maxY}, null);
      next.push({children:group, leaf:false, ...bb});
    }
    level = next;
  }
  return level[0];
}
function bboxContains(b, x,y, tol){ return x>=b.minX-tol && x<=b.maxX+tol && y>=b.minY-tol && y<=b.maxY+tol; }
function queryPoint(node, x,y, tol, out){
  if(!node) return;
  if(!bboxContains(node, x,y, tol)) return;
  if(node.leaf){ for(const it of node.children){ if(bboxContains(it, x,y, tol)) out.push(it.id); } }
  else{ for(const ch of node.children) queryPoint(ch, x,y, tol, out); }
}
function distPointSeg(px,py,x1,y1,x2,y2){
  const vx=x2-x1, vy=y2-y1; const wx=px-x1, wy=py-y1; const L=vx*vx+vy*vy||1; let t=(vx*wx+vy*wy)/L; t=Math.max(0,Math.min(1,t));
  const sx=x1+t*vx, sy=y1+t*vy; const dx=px-sx, dy=py-sy; const d=Math.hypot(dx,dy);
  return {d};
}
function hitTest(state, x,y, tol){
  const cand = []; queryPoint(state.index, x,y, tol, cand);
  if(!cand.length) return null;
  let best=null, bestD=Infinity;
  for(const id of cand){
    const e = state.parsed.entities[id]; if(!e) continue;
    let d=Infinity;
    if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; d = distPointSeg(x,y,x1,y1,x2,y2).d; }
    else if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; d = Math.abs(Math.hypot(x-cx,y-cy)-r); }
    else if(e.type==='ARC'){ const {cx,cy,r}=e.raw; d = Math.abs(Math.hypot(x-cx,y-cy)-r); }
    else if(e.type==='POLY'){ const pts=e.raw.pts||[]; for(let i=1;i<pts.length;i++){ const r = distPointSeg(x,y,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y).d; if(r<d) d=r; } if(e.raw.closed && pts.length>2){ const r = distPointSeg(x,y,pts.at(-1).x,pts.at(-1).y,pts[0].x,pts[0].y).d; if(r<d) d=r; } }
    if(d<bestD){bestD=d; best={id, d};}
  }
  return (bestD<=tol)?best:null;
}


export function drawPierceLabels(state, canvas){
  const ctx = canvas.getContext('2d');
  // clear overlay
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const pts = (state?.parsed?.piercePts) || [];
  if (!state.showPierceLabels || !pts.length) return;
  if (state.tab && state.tab !== 'annot') return;

  const DPR = (typeof dpr !== 'undefined' ? dpr : (window.devicePixelRatio||1));
  const cssSize = Math.max(12, Math.min(28, 12 + 4 * Math.log2((state.zoom||1) + 0.75)));
  const px = Math.round(cssSize * DPR);
  ctx.font = `600 ${px}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, Math.floor(px/4));
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = '#ffdf5d';

  const cell = Math.max(18*DPR, Math.floor(px*1.3));
  const seen = new Set();
  const maxLabels = state.pierceLabelLimit || 600;

  // Use geometry's exact screen transform if present
  const tf = state.screenTf;
  const map = tf
    ? (x,y)=>[tf.a*x + tf.c*y + tf.e, tf.b*x + tf.d*y + tf.f]
    : (x,y)=>{
        const z = (state.zoom||1) * DPR;
        const panX = (state.pan?.x||0) * DPR;
        const panY = (state.pan?.y||0) * DPR;
        return [x*z + panX, canvas.height - (y*z + panY)];
      };

  let drawn = 0;
  for (let i=0; i<pts.length; i++){
    const p = pts[i]; if(!p) continue;
    const [sx, sy] = map(+p[0], +p[1]);
    if (sx < -20 || sy < -20 || sx > canvas.width+20 || sy > canvas.height+20) continue;

    const gx = (sx / cell) | 0, gy = (sy / cell) | 0;
    const key = gx+':'+gy; if (seen.has(key)) continue; seen.add(key);

    const label = 'P'+(i+1);
    ctx.strokeText(label, sx, sy);
    ctx.fillText(label,   sx, sy);

    if (++drawn >= maxLabels) break;
  }
}






export function worldToScreen(state, x, y, canvas){
  const DPR = (typeof dpr !== 'undefined' ? dpr : (window.devicePixelRatio||1));
  const z = (state.zoom||1) * DPR;
  const panX = (state.pan?.x||0) * DPR;
  const panY = (state.pan?.y||0) * DPR;
  const sx = x * z + panX;
  const sy = canvas.height - (y * z + panY);
  return [sx, sy];
}
