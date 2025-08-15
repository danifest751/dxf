export const DB_NAME = 'dxfLibrary';
export const STORE = 'files';
const META = 'meta';

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME);
    req.onerror = ()=> reject(req.error);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)){
        const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        try{ os.createIndex('by_name','name',{unique:false}); }catch(_){}
        try{ os.createIndex('by_added','added',{unique:false}); }catch(_){}
      }
      if (!db.objectStoreNames.contains(META)){
        db.createObjectStore(META, { keyPath: 'k' });
      }
    };
    req.onsuccess = ()=>{
      const db = req.result;
      if (!db.objectStoreNames.contains(META) || !db.objectStoreNames.contains(STORE)){
        const nextVer = (db.version||1)+1;
        db.close();
        const rq2 = indexedDB.open(DB_NAME, nextVer);
        rq2.onerror = ()=> reject(rq2.error);
        rq2.onupgradeneeded = ()=>{
          const d2 = rq2.result;
          if (!d2.objectStoreNames.contains(STORE)){
            const os = d2.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            try{ os.createIndex('by_name','name',{unique:false}); }catch(_){}
            try{ os.createIndex('by_added','added',{unique:false}); }catch(_){}
          }else{
            try{ d2.transaction(STORE, 'versionchange').objectStore(STORE).createIndex('by_name','name',{unique:false}); }catch(_){}
            try{ d2.transaction(STORE, 'versionchange').objectStore(STORE).createIndex('by_added','added',{unique:false}); }catch(_){}
          }
          if (!d2.objectStoreNames.contains(META)){
            d2.createObjectStore(META, { keyPath: 'k' });
          }
        };
        rq2.onsuccess = ()=> resolve(rq2.result);
      } else {
        resolve(db);
      }
    };
  });
}

function txWrap(db, mode, runner){
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE, mode);
    const s = tx.objectStore(STORE);
    Promise.resolve().then(()=>runner(s)).then(resolve, reject);
    tx.oncomplete = ()=>{};
    tx.onerror = ()=> reject(tx.error);
  });
}

export async function listDXF(){
  const db = await openDB();
  try{
    return await new Promise((res,rej)=>{
      const out=[];
      const tx = db.transaction(STORE,'readonly');
      const s = tx.objectStore(STORE);
      const idx = s.index('by_added');
      const rq = idx.openCursor(null,'prev');
      rq.onsuccess = ()=>{ const cur = rq.result; if (cur){ out.push(cur.value); cur.continue(); } };
      tx.oncomplete = ()=> res(out);
      tx.onerror = ()=> rej(tx.error);
    });
  } finally { db.close(); }
}

export async function addDXF(name, text){
  const db = await openDB();
  try{
    const row = { name:String(name||'').trim()||'unnamed.dxf', text:String(text||''), size:(text||'').length, added:Date.now() };
    return await txWrap(db,'readwrite',(s)=> new Promise((res,rej)=>{
      const r = s.add(row); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

export async function addOrUpdateDXF(name, text){
  const db = await openDB();
  try{
    const nm = String(name||'').trim();
    const existing = await new Promise((res,rej)=>{
      const t = db.transaction(STORE,'readonly');
      const s = t.objectStore(STORE);
      let got=false;
      try{
        const ix = s.index('by_name');
        const rq = ix.get(nm);
        rq.onsuccess = ()=>{ got=True; res(rq.result||null); };
        rq.onerror = ()=> rej(rq.error);
      }catch(e){
        // no index by_name; fallback scan
        const rq = s.openCursor();
        rq.onsuccess = ()=>{
          const cur=rq.result;
          if(cur){
            if((cur.value.name||'')===nm){ res(cur.value); return; }
            cur.continue();
          }else res(null);
        };
      }
    });
    if (existing){
      existing.text = String(text||'');
      existing.size = (text||'').length;
      existing.added = Date.now();
      await txWrap(db,'readwrite',(s)=> new Promise((res,rej)=>{
        const r = s.put(existing); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
      }));
      return existing.id;
    }else{
      const row = { name: nm||'unnamed.dxf', text:String(text||''), size:(text||'').length, added:Date.now() };
      return await txWrap(db,'readwrite',(s)=> new Promise((res,rej)=>{
        const r = s.add(row); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
      }));
    }
  } finally { db.close(); }
}

export async function getDXF(id){
  const db = await openDB();
  try{
    const key = Number(id);
    if(!Number.isFinite(key)) return null;
    return await txWrap(db,'readonly',(s)=> new Promise((res,rej)=>{
      const r = s.get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

export async function removeDXF(id){
  const db = await openDB();
  try{
    const key = Number(id);
    if(!Number.isFinite(key)) return;
    await txWrap(db,'readwrite',(s)=> new Promise((res,rej)=>{
      const r = s.delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

export async function renameDXF(id, name){
  const db = await openDB();
  try{
    const key = Number(id);
    if(!Number.isFinite(key)) return;
    const row = await txWrap(db,'readonly',(s)=> new Promise((res,rej)=>{
      const r = s.get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error);
    }));
    if(!row) return;
    row.name = String(name||'').trim() || row.name;
    await txWrap(db,'readwrite',(s)=> new Promise((res,rej)=>{
      const r = s.put(row); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

// ==== Permanent OPFS 'DXF' folder ====
const HAS_OPFS = !!(navigator && navigator.storage && navigator.storage.getDirectory);

async function getPermDXFFolder(){
  if (!HAS_OPFS) return null;
  const root = await navigator.storage.getDirectory();
  const dir  = await root.getDirectoryHandle('DXF', { create: true });
  return dir;
}
function sanitizeName(name){
  return String(name||'unnamed.dxf').replace(/[\\/\0]/g,'_').trim() || 'unnamed.dxf';
}
async function writeToPermanent(name, text){
  const dir = await getPermDXFFolder();
  if (!dir) return false;
  const safe = sanitizeName(name);
  const fh = await dir.getFileHandle(safe, { create: true });
  const w  = await fh.createWritable();
  await w.write(text);
  await w.close();
  return true;
}
async function listPermanentNames(){
  const dir = await getPermDXFFolder();
  if (!dir) return [];
  const out = [];
  if (dir.values){
    for await (const entry of dir.values()){
      if (entry.kind==='file' && /\.dxf$/i.test(entry.name)) out.push(entry.name);
    }
  }else if (dir.entries){
    for await (const [name, entry] of dir.entries()){
      if (entry.kind==='file' && /\.dxf$/i.test(name)) out.push(name);
    }
  }
  return out;
}

const HAS_FS = typeof window!=='undefined' && 'showDirectoryPicker' in window;

function putMeta(tx, key, value){
  return new Promise((res,rej)=>{
    const s = tx.objectStore(META);
    const keyPath = s.keyPath || 'k';
    const obj = { v: value }; obj[keyPath] = key;
    const r = s.put(obj); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error);
  });
}
function getMeta(tx, key){
  return new Promise((res,rej)=>{
    const s = tx.objectStore(META);
    const r = s.get(key); r.onsuccess=()=>res(r.result ? r.result.v : null); r.onerror=()=>rej(r.error);
  });
}

export async function setAutoImport(on){
  const db = await openDB();
  try{
    const tx = db.transaction(META, 'readwrite');
    await putMeta(tx, 'auto_import', !!on);
  } finally { db.close(); }
}
export async function getAutoImport(){
  const db = await openDB();
  try{
    const tx = db.transaction(META, 'readonly');
    const v = await getMeta(tx, 'auto_import');
    return !!v;
  } finally { db.close(); }
}
export async function saveDirHandle(handle){
  if(!HAS_FS) return false;
  const db = await openDB();
  try{
    const tx = db.transaction(META, 'readwrite');
    await putMeta(tx, 'dxf_dir', handle);
    return true;
  } finally { db.close(); }
}
export async function getDirHandle(){
  const db = await openDB();
  try{
    const tx = db.transaction(META, 'readonly');
    return await getMeta(tx, 'dxf_dir');
  } finally { db.close(); }
}

export async function scanDirAndImport(){
  if(!HAS_FS) return {imported:0, skipped:0};
  const dir = await getDirHandle();
  if(!dir) return {imported:0, skipped:0};
  let imported=0, skipped=0;
  for await (const [name, entry] of dir.entries()){
    if(!name.toLowerCase().endsWith('.dxf')) continue;
    try{
      const f = await entry.getFile();
      const txt = await f.text();
      await addOrUpdateDXF(name, txt);
      imported++;
    }catch(e){ skipped++; }
  }
  return {imported, skipped};
}

// Import all .dxf from the internal OPFS "DXF" folder into the library (idempotent)
export async function scanPermanentDXF(){
  const dir = await getPermDXFFolder();
  if (!dir) return { imported:0, skipped:0 };
  let imported=0, skipped=0;
  if (dir.values){
    for await (const entry of dir.values()){
      try{
        if (entry.kind==='file' && /\.dxf$/i.test(entry.name)){
          const f = await entry.getFile();
          const txt = await f.text();
          await addOrUpdateDXF(entry.name, txt); // will update if exists
          imported++;
        }
      }catch(_){ skipped++; }
    }
  } else if (dir.entries){
    for await (const [name, entry] of dir.entries()){
      try{
        if (entry.kind==='file' && /\.dxf$/i.test(name)){
          const f = await entry.getFile();
          const txt = await f.text();
          await addOrUpdateDXF(name, txt);
          imported++;
        }
      }catch(_){ skipped++; }
    }
  }
  return { imported, skipped };
}
