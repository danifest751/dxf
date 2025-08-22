export function createAnnotatedDXF(orig, parsed){
  const DXF_LINE_LIMIT = 255; // Standard DXF line length limit
  
  // Helper function to split long lines
  const wrapLine = (line) => {
    if (line.length <= DXF_LINE_LIMIT) return [line];
    const lines = [];
    for (let i = 0; i < line.length; i += DXF_LINE_LIMIT) {
      lines.push(line.substring(i, i + DXF_LINE_LIMIT));
    }
    return lines;
  };
  
  let ann = `\n; === АННОТАЦИИ ЛАЗЕРНОЙ РЕЗКИ ===\n`;
  ann += `; Объектов: ${parsed.entities.length}\n`;
  ann += `; Общая длина: ${parsed.totalLen.toFixed(3)} м\n`;
  ann += `; Врезок: ${parsed.pierceCount}\n`;
  
  parsed.entities.forEach((e,i)=>{ 
    if(!e) return; 
    const line = `; ${i+1}) ${e.type} L=${(e.len||0).toFixed(3)}м @ X=${(e.start?.[0]||0).toFixed(2)} Y=${(e.start?.[1]||0).toFixed(2)}`;
    const wrappedLines = wrapLine(line);
    ann += wrappedLines.join('\n') + '\n';
  });
  
  (parsed.piercePts||[]).forEach((p,i)=>{ 
    if(!p) return; 
    const line = `; P${i+1} X=${p[0].toFixed(2)} Y=${p[1].toFixed(2)}`;
    const wrappedLines = wrapLine(line);
    ann += wrappedLines.join('\n') + '\n';
  });
  
  return orig + ann;
}
export function createDXFWithMarkers(orig, parsed, radius=0.5){
  const mark = (x,y)=> `0\nCIRCLE\n8\nPIERCE\n10\n${x}\n20\n${y}\n40\n${radius}\n`;
  const lines = orig.split(/\r?\n/);
  const upper = lines.map(s=>s.toUpperCase());
  let entitiesStart=-1, entitiesEnd=-1;
  for(let i=0;i<upper.length-1;i++){
    if(upper[i]==='0' && upper[i+1]==='SECTION' && upper[i+2]==='2' && upper[i+3]==='ENTITIES'){
      entitiesStart=i; break;
    }
  }
  if(entitiesStart>=0){
    for(let i=entitiesStart+4;i<upper.length-1;i++){
      if(upper[i]==='0' && upper[i+1]==='ENDSEC'){ entitiesEnd=i; break; }
    }
  }
  if(entitiesEnd<0) return orig;
  const markerStr = (parsed.piercePts||[]).map(p=>mark(p[0].toFixed(4),p[1].toFixed(4))).join('');
  const newLines = lines.slice(0,entitiesEnd).join('\n') + '\n' + markerStr + lines.slice(entitiesEnd).join('\n');
  return newLines;
}
export function createSVG(parsed){
  const ents = parsed.entities||[];
  const b = bounds(ents);
  const pad=10, minX=b.minX-pad, minY=b.minY-pad, W=(b.maxX-b.minX)+2*pad, H=(b.maxY-b.minY)+2*pad;
  const p=[];
  p.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" width="${W}mm" height="${H}mm">`);
  p.push(`<g fill="none" stroke="#9db4ff" stroke-width="0.3">`);
  for(const e of ents){
    if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; p.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`); }
    else if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; p.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`); }
    else if(e.type==='ARC'){ const {cx,cy,r,a1=0,a2=0}=e.raw; const A1=a1*Math.PI/180,A2=a2*Math.PI/180;
      const x1=cx+r*Math.cos(A1), y1=cy+r*Math.sin(A1), x2=cx+r*Math.cos(A2), y2=cy+r*Math.sin(A2);
      const large=((a2-a1+360)%360)>180?1:0; p.push(`<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" />`); }
    else if(e.type==='POLY'){ const pts=e.raw.pts||[]; if(pts.length){ const d=['M',pts[0].x,pts[0].y]; for(let i=1;i<pts.length;i++){ d.push('L',pts[i].x,pts[i].y); } if(e.raw.closed) d.push('Z'); p.push(`<path d="${d.join(' ')}" />`); } }
  }
  p.push(`</g>`);
  const pts = parsed.piercePts||[];
  if(pts.length){ p.push(`<g fill="none" stroke="#ff8080" stroke-width="0.3">`);
    for(const pt of pts){ p.push(`<circle cx="${pt[0]}" cy="${pt[1]}" r="1.2"/>`); }
    p.push(`</g>`);
  }
  p.push(`</svg>`);
  return p.join('\n');
}
function bounds(ents){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of ents){ if(!e||!e.raw) continue;
    if(e.type==='LINE'){ const {x1,y1,x2,y2}=e.raw; minX=Math.min(minX,x1,x2); minY=Math.min(minY,y1,y2); maxX=Math.max(maxX,x1,x2); maxY=Math.max(maxY,y1,y2) }
    else if(e.type==='CIRCLE'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='ARC'){ const {cx,cy,r}=e.raw; minX=Math.min(minX,cx-r); minY=Math.min(minY,cy-r); maxX=Math.max(maxX,cx+r); maxY=Math.max(maxY,cy+r) }
    else if(e.type==='POLY'){ const pts=e.raw.pts||[]; for(const p of pts){ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y) } }
  }
  if(!isFinite(minX)) minX=minY=maxX=maxY=0;
  return {minX,minY,maxX,maxY};
}
export function createCSV(parsed){
  const lines = [];
  lines.push('type,len_m,start_x,start_y,extra');
  for(const e of parsed.entities||[]){
    const extra = e.type==='CIRCLE' ? `r=${e.raw.r}` :
                  e.type==='ARC' ? `cx=${e.raw.cx};cy=${e.raw.cy};r=${e.raw.r};a1=${e.raw.a1};a2=${e.raw.a2}` :
                  e.type==='POLY' ? `pts=${e.raw.pts.length};closed=${e.raw.closed}` : '';
    lines.push(`${e.type},${(e.len||0).toFixed(6)},${(e.start?.[0]||0)},${(e.start?.[1]||0)},${extra}`);
  }
  for(let i=0;i<(parsed.piercePts||[]).length;i++){
    const p = parsed.piercePts[i];
    lines.push(`PIERCE,0,${p[0]},${p[1]},id=${i+1}`);
  }
  return lines.join('\\n');
}
export function downloadText(name, text){
  const a=document.createElement('a'); a.download=name; a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'})); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
