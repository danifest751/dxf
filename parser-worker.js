// Clean worker: robust parse + pierce detection; no shorthands, no syntax pitfalls.

self.onmessage = (e)=>{
  try{
    const res = parseDXF(e.data);
    self.postMessage({ ok: true, res: res });
  }catch(err){
    self.postMessage({ ok: false, err: String(err && err.message ? err.message : err) });
  }
};

function parseDXF(content){
  // --- read pairs ---
  const lines = String(content||"").split(/\r?\n/);
  const N = lines.length; let i = 0;
  function nextPair(){
    if(i+1>=N) return null;
    const code = parseInt((lines[i++]||"").trim(), 10);
    const value = (lines[i++]||"").trim();
    if(Number.isNaN(code)) return nextPair();
    return { code: code, value: value };
  }
  function up(s){ return String(s||"").toUpperCase(); }

  // --- find ENTITIES ---
  let p, inEntities = false;
  while((p = nextPair())){
    if(p.code===0 && up(p.value)==="SECTION"){
      let name = null, q;
      while((q = nextPair())){
        if(q.code===2) name = up(q.value);
        else if(q.code===0){ i -= 2; break; }
      }
      if(name==="ENTITIES"){ inEntities = true; break; }
    }
  }
  if(!inEntities) throw new Error("Нет секции ENTITIES");

  // --- collect raw entities ---
  const entsRaw = [];
  let pair, cur = null, polyOpen = null;
  const supported = { LINE:1, CIRCLE:1, ARC:1, LWPOLYLINE:1, POLYLINE:1, VERTEX:1, SEQEND:1 };
  while((pair = nextPair())){
    if(pair.code===0 && up(pair.value)==="ENDSEC") break;
    if(pair.code===0){
      const t = up(pair.value);
      if(t==="VERTEX" && polyOpen){ cur = polyOpen; continue; }
      if(t==="SEQEND" && polyOpen){ entsRaw.push(polyOpen); polyOpen = null; cur = null; continue; }
      if(cur && supported[cur.type] && cur!==polyOpen) entsRaw.push(cur);
      cur = { type: t, data: {}, verts: [] };
      if(t==="POLYLINE") polyOpen = cur;
      continue;
    }
    if(!cur) continue;
    const v = parseFloat(pair.value);
    switch(cur.type){
      case "LINE":
        if(pair.code===10) cur.data.x1=v; else if(pair.code===20) cur.data.y1=v;
        else if(pair.code===11) cur.data.x2=v; else if(pair.code===21) cur.data.y2=v;
        break;
      case "CIRCLE":
        if(pair.code===10) cur.data.cx=v; else if(pair.code===20) cur.data.cy=v; else if(pair.code===40) cur.data.r=v;
        break;
      case "ARC":
        if(pair.code===10) cur.data.cx=v; else if(pair.code===20) cur.data.cy=v; else if(pair.code===40) cur.data.r=v;
        else if(pair.code===50) cur.data.a1=v; else if(pair.code===51) cur.data.a2=v;
        break;
      case "LWPOLYLINE":
        if(pair.code===10) cur.verts.push({x:v});
        else if(pair.code===20){ if(cur.verts.length) cur.verts[cur.verts.length-1].y=v; }
        else if(pair.code===70) cur.data.flags=parseInt(pair.value,10);
        break;
      case "POLYLINE":
      case "VERTEX":
        if(pair.code===10) cur.verts.push({x:v});
        else if(pair.code===20){ if(cur.verts.length) cur.verts[cur.verts.length-1].y=v; }
        break;
    }
  }
  if(cur && cur!==polyOpen && supported[cur.type]) entsRaw.push(cur);

  // --- normalize entities ---
  const ents = []; let total = 0;
  function push(obj){
    if(obj && obj.type && isFinite(obj.len) && obj.len>=0){
      obj.id = ents.length;
      ents.push(obj); total += obj.len;
    }
  }
  for(const e of entsRaw){
    if(!e || !e.type) continue;
    if(e.type==="LINE"){
      const x1=e.data.x1, y1=e.data.y1, x2=e.data.x2, y2=e.data.y2;
      if([x1,y1,x2,y2].every(Number.isFinite)){
        push({ type:"LINE", len: Math.hypot(x2-x1,y2-y1)/1000, start:[x1,y1], raw:{ x1:x1, y1:y1, x2:x2, y2:y2 } });
      }
    }else if(e.type==="CIRCLE"){
      const cx=e.data.cx||0, cy=e.data.cy||0, r=e.data.r||0;
      if(r>0) push({ type:"CIRCLE", len: 2*Math.PI*r/1000, start:[cx,cy], raw:{ cx:cx, cy:cy, r:r } });
    }else if(e.type==="ARC"){
      const cx=e.data.cx||0, cy=e.data.cy||0, r=e.data.r||0, a1=e.data.a1||0, a2=e.data.a2||0;
      if(r>0){
        let A1=a1*Math.PI/180, A2=a2*Math.PI/180; let d=A2-A1; if(d<0) d+=2*Math.PI;
        push({ type:"ARC", len: r*d/1000, start:[cx+r*Math.cos(A1), cy+r*Math.sin(A1)], raw:{ cx:cx, cy:cy, r:r, a1:a1, a2:a2 } });
      }
    }else if(e.type==="LWPOLYLINE" || e.type==="POLYLINE"){
      const pts = (e.verts||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      if(pts.length>=2){
        let L=0; for(let k=1;k<pts.length;k++) L+=Math.hypot(pts[k].x-pts[k-1].x, pts[k].y-pts[k-1].y);
        const closed = !!(e.data.flags & 1) || (pts.length>2 && (pts[0].x===pts[pts.length-1].x && pts[0].y===pts[pts.length-1].y));
        if(closed) L+=Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].y-pts[pts.length-1].y);
        push({ type:"POLY", len: L/1000, start:[pts[0].x,pts[0].y], raw:{ pts: pts, closed: closed } });
      }
    }
  }

  // --- pierce detection (quantized endpoints) ---
  const piercePts = [];
  const EPS = 0.8;
  function qkey(x,y){ return (Math.round(x/EPS)) + "," + (Math.round(y/EPS)); }
  function endPts(ent){
    if(!ent) return [];
    if(ent.type==="LINE"){ const r=ent.raw; return [{x:r.x1,y:r.y1},{x:r.x2,y:r.y2}]; }
    if(ent.type==="ARC"){
      const r=ent.raw, cx=r.cx||0, cy=r.cy||0, R=r.r||0;
      let A1=(r.a1||0)*Math.PI/180, A2=(r.a2||0)*Math.PI/180; if(A2<A1) A2+=2*Math.PI;
      return [{x:cx+R*Math.cos(A1),y:cy+R*Math.sin(A1)},{x:cx+R*Math.cos(A2),y:cy+R*Math.sin(A2)}];
    }
    if(ent.type==="POLY"){
      const pts=ent.raw.pts||[]; if(!pts.length) return [];
      if(ent.raw.closed) return [];
      return [{x:pts[0].x,y:pts[0].y},{x:pts[pts.length-1].x,y:pts[pts.length-1].y}];
    }
    return [];
  }
  function candPts(ent){
    if(ent.type==="CIRCLE"){ const r=ent.raw; return [{x:r.cx+r.r, y:r.cy}]; }
    if(ent.type==="POLY" && ent.raw.closed){ const p=ent.raw.pts||[]; if(p.length) return [{x:p[0].x,y:p[0].y}]; }
    return endPts(ent);
  }

  const used = new Array(ents.length).fill(false);
  const nodeMap = new Map();
  for(let idx=0; idx<ents.length; idx++){
    const e = ents[idx];
    if(!e) continue;
    if(e.type==="CIRCLE") continue;
    if(e.type==="POLY" && e.raw && e.raw.closed) continue;
    const eps = endPts(e);
    for(const pt of eps){
      const k = qkey(pt.x, pt.y);
      let set = nodeMap.get(k); if(!set){ set = new Set(); nodeMap.set(k,set); }
      set.add(idx);
    }
  }
  const adj = new Array(ents.length);
  for(let ii=0; ii<ents.length; ii++) adj[ii] = new Set();
  for(const set of nodeMap.values()){
    const ids = Array.from(set);
    for(let a=0;a<ids.length;a++) for(let b=a+1;b<ids.length;b++){
      adj[ids[a]].add(ids[b]); adj[ids[b]].add(ids[a]);
    }
  }
  let pierce = 0;
  for(let s=0; s<ents.length; s++){
    if(used[s]) continue;
    const q=[s]; used[s]=true; const comp=[];
    while(q.length){ const k=q.shift(); comp.push(k);
      const ek = ents[k];
      if(ek && !(ek.type==="CIRCLE" || (ek.type==="POLY" && ek.raw && ek.raw.closed))){
        for(const nb of adj[k]) if(!used[nb]){ used[nb]=true; q.push(nb); }
      }
    }
    const cands=[];
    for(const id of comp){ const arr=candPts(ents[id]); for(const p of arr) cands.push(p); }
    if(cands.length){ cands.sort((a,b)=> a.x===b.x ? a.y-b.y : a.x-b.x); const c=cands[0]; piercePts.push([c.x,c.y]); }
    pierce++;
  }

  return {
    entities: ents,
    totalLen: total,
    pierceCount: pierce,
    piercePts: piercePts,
    loops: [],
    cutOrder: []
  };
}
