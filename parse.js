export function parseDXFMainThread(content){
  const lines = content.split(/\r?\n/); const N = lines.length; let i = 0;
  function nextPair(){ if(i+1>=N) return null; const code=parseInt((lines[i++]||'').trim(),10); const value=(lines[i++]||'').trim(); if(Number.isNaN(code)) return nextPair(); return {code,value}; }
  const up=s=>String(s||'').toUpperCase();

  let p,inEntities=false;
  while((p=nextPair())){
    if(p.code===0 && up(p.value)==='SECTION'){
      let name=null,q;
      while((q=nextPair())){ if(q.code===2) name=up(q.value); else if(q.code===0){ i-=2; break } }
      if(name==='ENTITIES'){ inEntities=true; break }
    }
  }
  if(!inEntities) throw new Error('Нет секции ENTITIES');

  const entsRaw=[]; let pair; let cur=null; let polyOpen=null;
  const supported = new Set(['LINE','CIRCLE','ARC','LWPOLYLINE','POLYLINE','VERTEX','SEQEND']);
  while((pair=nextPair())){
    if(pair.code===0 && up(pair.value)==='ENDSEC') break;
    if(pair.code===0){
      const t=up(pair.value);
      if(t==='VERTEX' && polyOpen){ cur=polyOpen; }
      else if(t==='SEQEND' && polyOpen){ entsRaw.push(polyOpen); polyOpen=null; cur=null; continue; }
      else {
        if(cur && supported.has(cur.type) && cur!==polyOpen) entsRaw.push(cur);
        cur = {type:t, data:{}, verts:[]};
        if(t==='POLYLINE') { polyOpen=cur; }
      }
      continue;
    }
    if(!cur) continue;
    const v = parseFloat(pair.value);
    switch(cur.type){
      case 'LINE':
        if(pair.code===10) cur.data.x1=v; else if(pair.code===20) cur.data.y1=v;
        else if(pair.code===11) cur.data.x2=v; else if(pair.code===21) cur.data.y2=v; break;
      case 'CIRCLE':
        if(pair.code===10) cur.data.cx=v; else if(pair.code===20) cur.data.cy=v; else if(pair.code===40) cur.data.r=v; break;
      case 'ARC':
        if(pair.code===10) cur.data.cx=v; else if(pair.code===20) cur.data.cy=v; else if(pair.code===40) cur.data.r=v; else if(pair.code===50) cur.data.a1=v; else if(pair.code===51) cur.data.a2=v; break;
      case 'LWPOLYLINE':
        if(pair.code===10) cur.verts.push({x:v});
        else if(pair.code===20){ if(cur.verts.length) cur.verts[cur.verts.length-1].y=v; }
        else if(pair.code===70) cur.data.flags=parseInt(pair.value,10); break;
      case 'POLYLINE':
      case 'VERTEX':
        if(pair.code===10) cur.verts.push({x:v});
        else if(pair.code===20){ if(cur.verts.length) cur.verts[cur.verts.length-1].y=v; } break;
    }
  }
  if(cur && cur!==polyOpen && supported.has(cur.type)) entsRaw.push(cur);

  const ents=[]; let total=0; const piercePts=[];
  const push=(obj)=>{ if(obj && obj.type && isFinite(obj.len) && obj.len>=0){ obj.id=ents.length; ents.push(obj); total+=obj.len } };

  for(const e of entsRaw){
    if(!e || !e.type) continue;
    if(e.type==='LINE'){
      const {x1,y1,x2,y2}=e.data; if([x1,y1,x2,y2].every(Number.isFinite)){
        push({type:'LINE', len:Math.hypot(x2-x1,y2-y1)/1000, start:[x1,y1], raw: { x1: x1, y1: y1, x2: x2, y2: y2 }});
      }
    }else if(e.type==='CIRCLE'){
      const {cx=0,cy=0,r=0}=e.data; if(r>0){
        push({type:'CIRCLE', len:2*Math.PI*r/1000, start:[cx,cy], raw: { cx: cx, cy: cy, r: r }});
      }
    }else if(e.type==='ARC'){
      const {cx=0,cy=0,r=0,a1=0,a2=0}=e.data; if(r>0){
        let A1=a1*Math.PI/180, A2=a2*Math.PI/180; let d=A2-A1; if(d<0) d+=2*Math.PI;
        push({type:'ARC', len:r*d/1000, start:[cx+r*Math.cos(A1), cy+r*Math.sin(A1)], raw: { cx: cx, cy: cy, r: r, a1: a1, a2: a2 }});
      }
    }else if(e.type==='LWPOLYLINE' || e.type==='POLYLINE'){
      const pts=e.verts.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      if(pts.length>=2){
        let L=0; for(let i=1;i<pts.length;i++) L+=Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
        const closed = !!(e.data.flags & 1) || (pts.length>2 && (pts[0].x===pts.at(-1).x && pts[0].y===pts.at(-1).y));
        if(closed) L+=Math.hypot(pts[0].x-pts.at(-1).x, pts[0].y-pts.at(-1).y);
        push({type:'POLY', len: L/1000, start:[pts[0].x,pts[0].y], raw: { pts: pts, closed: closed }});
      }
    }
  }

  // === Pierce detection (quantized endpoint adjacency) ===
  const EPS = 0.8; // mm quantization
  function qkey(x,y){ return (Math.round(x/EPS)) + ',' + (Math.round(y/EPS)); }

  function endPts(ent){
    if(!ent) return [];
    if(ent.type==='LINE'){
      const r = ent.raw; return [{x:r.x1,y:r.y1},{x:r.x2,y:r.y2}];
    }
    if(ent.type==='ARC'){
      const r = ent.raw, cx=r.cx||0, cy=r.cy||0, R=r.r||0;
      let A1=(r.a1||0)*Math.PI/180, A2=(r.a2||0)*Math.PI/180; if(A2<A1) A2+=2*Math.PI;
      return [{x:cx+R*Math.cos(A1),y:cy+R*Math.sin(A1)},{x:cx+R*Math.cos(A2),y:cy+R*Math.sin(A2)}];
    }
    if(ent.type==='POLY'){
      const pts=ent.raw.pts||[]; if(!pts.length) return [];
      if(ent.raw.closed) return []; // closed: independent loop; candidate computed separately
      return [{x:pts[0].x,y:pts[0].y},{x:pts[pts.length-1].x,y:pts[pts.length-1].y}];
    }
    return [];
  }
  function candPts(ent){
    if(ent.type==='CIRCLE'){ const r=ent.raw; return [{x:r.cx+r.r, y:r.cy}]; }
    if(ent.type==='POLY' && ent.raw.closed){ const p=ent.raw.pts||[]; if(p.length) return [{x:p[0].x,y:p[0].y}]; }
    return endPts(ent);
  }

  const used = new Array(ents.length).fill(false);
  let pierce = 0;
  piercePts.length = 0; // override local to ensure consistent

  // Build quantized adjacency map for endpoints of non-circle, non-closed-poly entities
  const nodeMap = new Map(); // key -> Set of entity ids
  for(let i=0;i<ents.length;i++){
    const e = ents[i];
    if(!e) continue;
    if(e.type==='CIRCLE') continue;
    if(e.type==='POLY' && e.raw && e.raw.closed) continue;
    const eps = endPts(e);
    for(const p of eps){
      const k = qkey(p.x, p.y);
      let set = nodeMap.get(k); if(!set){ set = new Set(); nodeMap.set(k,set); }
      set.add(i);
    }
  }
  // Build adjacency list
  const adj = Array.from({length:ents.length}, ()=>new Set());
  for(const set of nodeMap.values()){
    const ids = Array.from(set);
    for(let a=0;a<ids.length;a++){
      for(let b=a+1;b<ids.length;b++){
        adj[ids[a]].add(ids[b]);
        adj[ids[b]].add(ids[a]);
      }
    }
  }

  // BFS over all entities; circles and closed polys become their own components
  for(let i=0;i<ents.length;i++){
    if(used[i]) continue;
    const e0 = ents[i];
    if(!e0){ used[i]=true; continue; }

    // Start a new component
    const comp = [];
    const queue = [i];
    used[i]=true;

    while(queue.length){
      const k = queue.shift();
      comp.push(k);
      // Only traverse adjacency for types that participate
      const ek = ents[k];
      if(ek && !(ek.type==='CIRCLE' || (ek.type==='POLY' && ek.raw && ek.raw.closed))){
        for(const nb of adj[k]){
          if(!used[nb]){ used[nb]=true; queue.push(nb); }
        }
      }
    }

    // Choose a pierce candidate for this component
    const cands = [];
    for(const id of comp){
      const e = ents[id];
      const arr = candPts(e);
      for(const p of arr) cands.push(p);
    }
    if(cands.length){
      cands.sort((a,b)=> a.x===b.x ? a.y-b.y : a.x-b.x);
      const c=cands[0]; piercePts.push([c.x,c.y]);
    }
    pierce++;
  }
// Holes/cut order
  const loops = [];
  function polyArea(pts){ let s=0; for(let k=0;k<pts.length;k++){ const a=pts[k], b=pts[(k+1)%pts.length]; s+= (a.x*b.y - b.x*a.y); } return 0.5*s; }
  function bboxOf(ent){
    if(ent.type==='LINE'){ const {x1,y1,x2,y2}=ent.raw; return {minX:Math.min(x1,x2),minY:Math.min(y1,y2),maxX:Math.max(x1,x2),maxY:Math.max(y1,y2)}; }
    if(ent.type==='CIRCLE'){ const {cx, cy, r} = ent.raw; return {minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r}; }
    if(ent.type==='ARC'){ const {cx, cy, r} = ent.raw; return {minX:cx-r,minY:cy-r,maxX:cx+r,maxY:cy+r}; }
    if(ent.type==='POLY'){ const pts=ent.raw.pts||[]; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);} return {minX,minY,maxX,maxY}; }
    return {minX:0,minY:0,maxX:0,maxY:0};
  }
  function pointInPoly(pts, x, y){
    let inside=false;
    for(let i=0,j=pts.length-1; i<pts.length; j=i++){
      const xi=pts[i].x, yi=pts[i].y, xj=pts[j].x, yj=pts[j].y;
      const intersect=((yi>y)!=(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi+1e-9)+xi);
      if(intersect) inside=!inside;
    }
    return inside;
  }
  function contains(loopA, loopB){
    if(loopA.bbox.minX>loopB.bbox.minX || loopA.bbox.maxX<loopB.bbox.maxX || loopA.bbox.minY>loopB.bbox.minY || loopA.bbox.maxY<loopB.bbox.maxY) return false;
    const rep = loopB.rep;
    if(loopA.kind==='poly'){
      if(loopB.kind==='circle'){
        return pointInPoly(loopA.pts, loopB.cx, loopB.cy);
      }else{
        return pointInPoly(loopA.pts, rep.x, rep.y);
      }
    }else{
      const dx = (loopB.kind==='circle' ? loopB.cx : rep.x) - loopA.cx;
      const dy = (loopB.kind==='circle' ? loopB.cy : rep.y) - loopA.cy;
      const dist = Math.hypot(dx,dy);
      if(loopB.kind==='circle') return dist + loopB.r <= loopA.r + 1e-6;
      else return dist <= loopA.r + 1e-6;
    }
  }

  for(const e of ents){
    if(e.type==='CIRCLE'){
      const {cx, cy, r} = e.raw; loops.push({id:e.id, ent:e, kind:'circle', area:Math.PI*r*r, depth:0, bbox:bboxOf(e), rep:{x:cx,y:cy}, cx: cx, cy: cy, r: r });
    }else if(e.type==='POLY' && e.raw.closed){
      const pts=e.raw.pts; const area=polyArea(pts);
      const rep = pts[0];
      loops.push({id:e.id, ent:e, kind:'poly', area:Math.abs(area), signedArea:area, depth:0, bbox:bboxOf(e), rep: rep, pts: pts});
    }
  }
  for(let i=0;i<loops.length;i++){
    let d=0;
    for(let j=0;j<loops.length;j++){
      if(i===j) continue;
      if(contains(loops[j], loops[i])) d++;
    }
    loops[i].depth=d;
  }
  const cutOrder = loops.slice().sort((a,b)=> b.depth - a.depth || a.area - b.area).map(l=>l.id);

  return {entities: ents, totalLen: total, pierceCount: pierce, piercePts: piercePts, loops: loops, cutOrder: cutOrder};
}

export function sanitizeParsed(res){
  if(!res) throw new Error('Парсинг вернул пусто');
  res.entities = (res.entities||[]).filter(e=>e && e.type && e.raw);
  res.totalLen = Number(res.totalLen)||0;
  res.pierceCount = Number(res.pierceCount)||0;
  res.piercePts = res.piercePts||[];
  res.loops = res.loops||[];
  res.cutOrder = res.cutOrder||[];
  return res;
}
