export const DB_NAME = 'dxfLibrary';
export const STORE = 'files';
const META = 'meta';

/** Открытие БД с авто-добавлением недостающих сто́ров/индексов */
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
    req.onsuccess = ()=> resolve(req.result);
  });
}

function txWrap(db, store, mode, runner){
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    Promise.resolve().then(()=>runner(s)).then(resolve, reject);
    tx.onerror = ()=> reject(tx.error);
  });
}

/* ====== Files API ====== */
export async function listDXF(){
  const db = await openDB();
  try{
    return await new Promise((res,rej)=>{
      const out=[];
      const tx = db.transaction(STORE,'readonly');
      const s = tx.objectStore(STORE);
      let idx;
      try{ idx = s.index('by_added'); }catch(_){ idx = null; }
      const open = idx ? idx.openCursor.bind(idx) : s.openCursor.bind(s);
      const rq = open(null, idx ? 'prev' : undefined);
      rq.onsuccess = ()=>{ const cur = rq.result; if (cur){ out.push(cur.value); cur.continue(); } };
      tx.oncomplete = ()=> res(out);
      tx.onerror = ()=> rej(tx.error);
    });
  } finally { db.close(); }
}

export async function addOrUpdateDXF(name, text){
  const db = await openDB();
  try{
    const nm = String(name||'').trim();
    const existing = await new Promise((res,rej)=>{
      try{
        const t = db.transaction(STORE,'readonly');
        const s = t.objectStore(STORE);
        const ix = s.index('by_name');
        const rq = ix.get(nm);
        rq.onsuccess = ()=> res(rq.result||null);
        rq.onerror = ()=> rej(rq.error);
      }catch(e){
        // нет индекса by_name — полный проход
        const t = db.transaction(STORE,'readonly');
        const s = t.objectStore(STORE);
        const rq = s.openCursor();
        rq.onsuccess = ()=>{
          const cur = rq.result;
          if(cur){
            if((cur.value.name||'')===nm){ res(cur.value); return; }
            cur.continue();
          }else res(null);
        };
        rq.onerror = ()=> rej(rq.error);
      }
    });
    if (existing){
      existing.text = String(text||'');
      existing.size = (text||'').length;
      existing.added = Date.now();
      await txWrap(db, STORE, 'readwrite', (s)=> new Promise((res,rej)=>{
        const r = s.put(existing); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
      }));
      return existing.id;
    }else{
      const row = { name: nm||'unnamed.dxf', text:String(text||''), size:(text||'').length, added:Date.now() };
      return await txWrap(db, STORE, 'readwrite', (s)=> new Promise((res,rej)=>{
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
    return await txWrap(db, STORE, 'readonly', (s)=> new Promise((res,rej)=>{
      const r = s.get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

export async function removeDXF(id){
  const db = await openDB();
  try{
    const key = Number(id);
    if(!Number.isFinite(key)) return;
    await txWrap(db, STORE, 'readwrite', (s)=> new Promise((res,rej)=>{
      const r = s.delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

export async function renameDXF(id, name){
  const db = await openDB();
  try{
    const key = Number(id);
    if(!Number.isFinite(key)) return;
    const row = await txWrap(db, STORE, 'readonly', (s)=> new Promise((res,rej)=>{
      const r = s.get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error);
    }));
    if(!row) return;
    row.name = String(name||'').trim() || row.name;
    await txWrap(db, STORE, 'readwrite', (s)=> new Promise((res,rej)=>{
      const r = s.put(row); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);
    }));
  } finally { db.close(); }
}

/* ====== Meta API (папка + автоимпорт) ====== */
const HAS_FS = typeof window!=='undefined' && 'showDirectoryPicker' in window;

async function getMeta(db, key){
  return await new Promise((res,rej)=>{
    const tx = db.transaction(META, 'readonly');
    const s  = tx.objectStore(META);
    const r = s.get(key);
    r.onsuccess = ()=> res(r.result ? r.result.v : null);
    r.onerror   = ()=> rej(r.error);
  });
}
async function putMeta(db, key, value){
  return await new Promise((res,rej)=>{
    const tx = db.transaction(META, 'readwrite');
    const s  = tx.objectStore(META);
    const r = s.put({ k:key, v:value });
    r.onsuccess = ()=> res(true);
    r.onerror   = ()=> rej(r.error);
  });
}

export async function setAutoImport(on){
  const db = await openDB();
  try{ await putMeta(db, 'auto_import', !!on); }
  finally{ db.close(); }
}
export async function getAutoImport(){
  const db = await openDB();
  try{ return !!(await getMeta(db, 'auto_import')); }
  finally{ db.close(); }
}
export async function saveDirHandle(handle){
  if(!HAS_FS) return false;
  const db = await openDB();
  try{ await putMeta(db, 'dxf_dir', handle); return true; }
  finally{ db.close(); }
}
export async function getDirHandle(){
  const db = await openDB();
  try{ return await getMeta(db, 'dxf_dir'); }
  finally{ db.close(); }
}

async function ensureDirReadable(){
  const h = await getDirHandle();
  if (!h) throw new Error('Папка не выбрана');
  if (h.queryPermission){
    const p = await h.queryPermission({mode:'read'});
    if (p !== 'granted'){
      if (h.requestPermission){
        const p2 = await h.requestPermission({mode:'read'});
        if (p2 !== 'granted') throw new Error('Нет доступа к папке');
      } else {
        throw new Error('Требуется выдать доступ к папке');
      }
    }
  }
  return h;
}

/** Скан папки (совместимо с values()/entries()) */
export async function scanDirAndImport(){
  if(!HAS_FS) return {imported:0, skipped:0};
  const dir = await ensureDirReadable();
  let imported=0, skipped=0;
  try{
    if (dir.values){
      for await (const entry of dir.values()){
        try{
          if (entry.kind === 'file' && /\.dxf$/i.test(entry.name)){
            const f = await entry.getFile();
            const txt = await f.text();
            await addOrUpdateDXF(entry.name, txt);
            imported++;
          }
        }catch(e){ skipped++; }
      }
    } else {
      for await (const [name, entry] of dir.entries()){
        try{
          if (entry.kind === 'file' && /\.dxf$/i.test(name)){
            const f = await entry.getFile();
            const txt = await f.text();
            await addOrUpdateDXF(name, txt);
            imported++;
          }
        }catch(e){ skipped++; }
      }
    }
  }catch(e){
    throw e;
  }
  return {imported, skipped};
}
