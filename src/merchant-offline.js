// Only queued, idempotent customer/order writes are kept here. They are
// encrypted at rest with an origin-local, non-exportable WebCrypto key. Never
// store a cookie, password, payment token or the merchant dashboard snapshot.
const DB_NAME = 'kouturepro-merchant-queue-v1';
let connection;
function open() {
  if (!('indexedDB' in window)) throw new Error('Le stockage hors ligne est indisponible.');
  if (!connection) connection = new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('meta');
      request.result.createObjectStore('queue',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  return connection;
}
async function store(name,mode,action) {
  const db=await open();
  return new Promise((resolve,reject) => {
    const tx=db.transaction(name,mode),request=action(tx.objectStore(name));
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=()=>reject(tx.error||request.error);
    tx.onerror=()=>reject(tx.error);
  });
}
let keyPromise;
async function key() {
  if (!keyPromise) keyPromise=(async()=>{
    const existing=await store('meta','readonly',s=>s.get('encryption-key'));
    if(existing)return existing;
    const created=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    // add (not put) makes concurrent tabs keep the first key that won.
    try{await store('meta','readwrite',s=>s.add(created,'encryption-key'));return created;}
    catch{const winner=await store('meta','readonly',s=>s.get('encryption-key'));if(winner)return winner;throw new Error('Impossible de protéger la file hors ligne.');}
  })().catch(error=>{keyPromise=null;throw error});
  return keyPromise;
}
export async function enqueueMerchant(entry) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),new TextEncoder().encode(JSON.stringify(entry)));
  await store('queue','readwrite',s=>s.put({id:entry.id,at:Date.now(),iv,data}));
}
export async function merchantQueue() {
  const rows=await store('queue','readonly',s=>s.getAll());
  if(!rows.length)return [];
  const secret=await key();
  return Promise.all(rows.sort((a,b)=>a.at-b.at).map(async row => {
    const text=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv},secret,row.data);
    return JSON.parse(new TextDecoder().decode(text));
  }));
}
export const removeMerchantQueued=id=>store('queue','readwrite',s=>s.delete(id));
