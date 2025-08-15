/** Annotate & export helpers **/

// Trigger client-side download of a text file
export function downloadText(name, text){
  try{
    const blob = new Blob([String(text||'')], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name || 'file.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }catch(e){
    console.error('downloadText failed', e);
  }
}

// CSV report: summary + pierce points + entities (best-effort)
export function createCSV(parsed){
  const p = parsed || {};
  const rows = [];
  const push = (arr)=> rows.push(arr.map(v => (v==null?'':String(v).replaceAll('"','""'))).join(','));

  push(['section','key','value']);
  push(['summary','entities', (p.entities?.length||0)]);
  push(['summary','total_len_m', (p.totalLen!=null ? p.totalLen.toFixed(3) : '')]);
  push(['summary','pierces', (p.pierceCount!=null ? p.pierceCount : (p.piercePts?.length||0))]);
  rows.push('');

  push(['pierce','index','x','y']);
  (p.piercePts||[]).forEach((pt,i)=>{
    if(!pt) return;
    push(['pierce', i+1, Number(pt[0]).toFixed(3), Number(pt[1]).toFixed(3)]);
  });
  rows.push('');

  push(['entity','index','type','length']);
  (p.entities||[]).forEach((e,i)=>{
    const t = e && (e.type || e.Type || e.kind || typeof e);
    const len = (e && (e.len ?? e.length));
    push(['entity', i+1, t||'', (typeof len==='number' ? len.toFixed(3) : '')]);
  });

  return rows.join('\n');
}

// Insert small circle markers at pierce points into DXF ENTITIES
export function createDXFWithMarkers(orig, parsed, r=0.5){
  try{
    const src = String(orig||'');
    const pts = (parsed && Array.isArray(parsed.piercePts)) ? parsed.piercePts : [];
    if(!pts.length) return src;
    const lines = src.split(/\r?\n/);

    // find ENTITIES section
    let entEnd = -1, entStart = -1;
    for(let i=0;i<lines.length-1;i++){
      if(lines[i].trim()==='0' && lines[i+1]?.trim()==='SECTION'){
        // check for ENTITIES
        for(let j=i+2;j<Math.min(i+12, lines.length-1); j+=2){
          if(lines[j]?.trim()==='2' && (lines[j+1]?.trim()||'').toUpperCase()==='ENTITIES'){
            entStart = j+2;
            // find ENDSEC
            for(let k=entStart;k<lines.length-1;k++){
              if(lines[k].trim()==='0' && lines[k+1]?.trim()==='ENDSEC'){ entEnd=k; break; }
            }
            break;
          }
        }
      }
      if(entEnd!==-1) break;
    }
    if(entEnd===-1){
      // fallback: append as comments
      let ann = '\n; MARKERS\n';
      pts.forEach((p,i)=>{ if(p) ann += `; M${i+1} X=${p[0].toFixed(2)} Y=${p[1].toFixed(2)}\n`; });
      return src + ann;
    }

    const ents = [];
    const R = Math.max(1e-6, Number(r)||0.5);
    pts.forEach((p)=>{
      if(!p) return;
      const x = +p[0], y = +p[1];
      ents.push(
        '0','CIRCLE',
        '8','MARKERS',
        '10', String(x),
        '20', String(y),
        '30','0',
        '40', String(R)
      );
    });

    const insert = ents.join('\n') + '\n';
    return lines.slice(0, entEnd).join('\n') + '\n' + insert + lines.slice(entEnd).join('\n');
  }catch(_e){
    return String(orig||'');
  }
}

// Simple SVG: show pierce points as circles; this is a minimal visual export
export function createSVG(parsed){
  const p = parsed || {};
  const pts = p.piercePts || [];
  // Determine bbox from points if available
  let minX=0, minY=0, maxX=100, maxY=100;
  if(pts.length){
    minX = Math.min(...pts.map(q=>+q[0])), maxX = Math.max(...pts.map(q=>+q[0]));
    minY = Math.min(...pts.map(q=>+q[1])), maxY = Math.max(...pts.map(q=>+q[1]));
    if(minX===maxX) { minX-=10; maxX+=10; }
    if(minY===maxY) { minY-=10; maxY+=10; }
  }
  const w = (maxX-minX) || 100, h = (maxY-minY) || 100;
  const viewBox = [minX, -maxY, w, h].join(' ');
  const circles = pts.map(pt => `<circle cx="${pt[0]}" cy="${-pt[1]}" r="1"/>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">
  <g fill="none" stroke="black" stroke-width="0.5">${circles}</g>
</svg>`;
}

// Annotated DXF with P# labels as TEXT entities
export function createAnnotatedDXF(orig, parsed, opts={}){
  try{
    const withLabels = opts.labels !== false;
    const src = String(orig||'');
    if(!withLabels) return src;
    const pts = (parsed && Array.isArray(parsed.piercePts)) ? parsed.piercePts : [];
    if(!pts.length) return src;

    const lines = src.split(/\r?\n/);
    // locate ENTITIES
    let entEnd = -1, entStart = -1;
    for(let i=0;i<lines.length-1;i++){
      if(lines[i].trim()==='0' && lines[i+1]?.trim()==='SECTION'){
        for(let j=i+2;j<Math.min(i+12, lines.length-1); j+=2){
          if(lines[j]?.trim()==='2' && (lines[j+1]?.trim()||'').toUpperCase()==='ENTITIES'){
            entStart = j+2;
            for(let k=entStart;k<lines.length-1;k++){
              if(lines[k].trim()==='0' && lines[k+1]?.trim()==='ENDSEC'){ entEnd=k; break; }
            }
            break;
          }
        }
      }
      if(entEnd!==-1) break;
    }
    if(entEnd===-1){
      let ann = '\n; PIERCE LABELS\n';
      pts.forEach((p,i)=>{ if(p) ann += `; P${i+1} X=${p[0].toFixed(2)} Y=${p[1].toFixed(2)}\n`; });
      return src + ann;
    }

    const H = 5;
    const ents = [];
    pts.forEach((p,i)=>{
      if(!p) return;
      const x = +p[0], y = +p[1];
      const label = 'P'+(i+1);
      ents.push(
        '0','TEXT',
        '8','ANNOT',
        '10', String(x),
        '20', String(y),
        '30','0',
        '40', String(H),
        '1', label,
        '50','0'
      );
    });
    const insert = ents.join('\n') + '\n';
    return lines.slice(0, entEnd).join('\n') + '\n' + insert + lines.slice(entEnd).join('\n');
  }catch(_e){
    return String(orig||'');
  }
}
