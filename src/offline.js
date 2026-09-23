const DB_NAME='kouturepro-offline-v1';
let openPromise;
function open(){if(!('indexedDB' in window))return Promise.reject(new Error('IndexedDB indisponible'));if(!openPromise)openPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('meta');db.createObjectStore('queue',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return openPromise;}
async function run(store,mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),os=tx.objectStore(store),req=action(os);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export const getSnapshot=()=>run('meta','readonly',store=>store.get('snapshot')).catch(()=>null);
export const saveSnapshot=(snapshot)=>run('meta','readwrite',store=>store.put(snapshot,'snapshot')).catch(()=>{});
export const clearSnapshot=()=>run('meta','readwrite',store=>store.delete('snapshot')).catch(()=>{});
export const getQueue=()=>run('queue','readonly',store=>store.getAll()).then(rows=>rows.sort((a,b)=>a.at-b.at)).catch(()=>[]);
export const enqueue=(entry)=>run('queue','readwrite',store=>store.put(entry));
export const removeQueued=(id)=>run('queue','readwrite',store=>store.delete(id));
export const clearQueue=async()=>{const rows=await getQueue();for(const row of rows)await removeQueued(row.id);};
