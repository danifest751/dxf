import { near } from './utils.js';

export function makeRunTests({ parseDXF: parseDXFMainThread, sanitizeParsed, computeNesting }){
  return async function runTests(){
    const card = document.getElementById('testsCard'); card.hidden=false;
    const out = document.getElementById('testsOut'); out.textContent='Выполняю…'; out.innerHTML='';

    const cases=[
      {name:'LINE + CIRCLE', dxf:sampleLineCircle(), expect:(r)=> near(r.totalLen, 0.298501, 0.005) && r.entities.length>=2 },
      {name:'LWPOLYLINE (прямоугольник 100x50, замкнутый)', dxf:sampleLWPoly(), expect:(r)=> near(r.totalLen, 0.300, 0.005) && r.entities.find(e=>e.type==='POLY') },
      {name:'ARC полукруг r=10', dxf:sampleArcHalf(), expect:(r)=> near(r.totalLen, 0.031416, 0.002) && r.entities.find(e=>e.type==='ARC') },
      {name:'ARC 350→10 (20° дуга)', dxf:sampleArcWrap(), expect:(r)=> r.entities.find(e=>e.type==='ARC') && near(r.totalLen, 0.003491, 0.0005) },
      {name:'ARC 0→270 (3/4 окружности)', dxf:sampleArc270(), expect:(r)=> r.entities.find(e=>e.type==='ARC') && near(r.totalLen, 0.047124, 0.001) },
      {name:'Пустой ENTITIES', dxf:sampleEmptyEntities(), expect:(r)=> r.entities.length===0 && r.pierceCount===0 },
      {name:'lowercase section/entities/endsec + lowercase entities', dxf:sampleLowercaseDXF(), expect:(r)=> r.entities.length===2 && near(r.totalLen, 0.298501, 0.005) }
    ];

    let passed=0, failed=0, i=0;
    const next=async()=>{
      if(i>=cases.length){
        try{
          const r1 = computeNesting(60,40,0,0, 999, 35,20, [0]);
          const ok1 = (r1.placed === 2);
          out.innerHTML += `<div>${ok1?'✅':'❌'} Нестинг 0° 60×40 / 35×20 → 2/лист</div>`;
          ok1 ? passed++ : failed++;

          const r2 = computeNesting(60,40,0,0, 999, 35,20, [0,90]);
          const ok2 = (r2.placed === 3);
          out.innerHTML += `<div>${ok2?'✅':'❌'} Нестинг 0/90° 60×40 / 35×20 → 3/лист</div>`;
          ok2 ? passed++ : failed++;
        }catch(e){
          out.innerHTML += `<div>❌ Доп. тесты (ошибка: ${e.message})</div>`; failed++;
        }
        out.innerHTML += `<div>Итог: <span class="test-pass">${passed} PASS</span>, <span class="test-fail">${failed} FAIL</span></div>`;
        return;
      }
      const t=cases[i++]; try{
        const parsed = sanitizeParsed(await parseDXFMainThread(t.dxf));
        const ok = !!t.expect(parsed);
        out.innerHTML += `<div>${ok?'✅':'❌'} ${t.name}</div>`;
        ok?passed++:failed++;
      }catch(e){
        out.innerHTML += `<div>❌ ${t.name} (ошибка: ${e.message})</div>`; failed++;
      }
      next();
    };
    next();
  };
}

const sampleHeader=()=>`0\nSECTION\n2\nENTITIES\n`;
const sampleFooter=()=>`0\nENDSEC\n0\nEOF\n`;
function sampleLineCircle(){
  return sampleHeader()+`0\nLINE\n10\n0\n20\n0\n11\n100\n21\n100\n0\nCIRCLE\n10\n50\n20\n50\n40\n25\n`+sampleFooter();
}
function sampleLWPoly(){
  return sampleHeader()+`0\nLWPOLYLINE\n70\n1\n10\n0\n20\n0\n10\n100\n20\n0\n10\n100\n20\n50\n10\n0\n20\n50\n`+sampleFooter();
}
function sampleArcHalf(){
  return sampleHeader()+`0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n180\n`+sampleFooter();
}
function sampleArcWrap(){
  return sampleHeader()+`0\nARC\n10\n0\n20\n0\n40\n10\n50\n350\n51\n10\n`+sampleFooter();
}
function sampleArc270(){
  return sampleHeader()+`0\nARC\n10\n0\n20\n0\n40\n10\n50\n0\n51\n270\n`+sampleFooter();
}
function sampleEmptyEntities(){ return sampleHeader()+sampleFooter() }
function sampleLowercaseDXF(){
  return `0\nsection\n2\nentities\n0\nline\n10\n0\n20\n0\n11\n100\n21\n100\n0\ncircle\n10\n50\n20\n50\n40\n25\n0\nendsec\n0\neof\n`;
}
