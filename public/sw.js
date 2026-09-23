const CACHE='kouturepro-shell-v7';
const ESSENTIAL=['/','/app','/favicon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest','/assets/atelier-hero.jpg','/assets/gallery-style.jpg','/assets/gallery-wax.jpg','/assets/gallery-studio.jpg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(ESSENTIAL.map(url=>cache.add(url)))));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/receipt/')||url.pathname.includes('/@vite')||url.pathname.includes('/__vite'))return;
 event.respondWith((async()=>{
  try{const response=await fetch(req);if(response.ok&&response.type==='basic'&&!/no-store/i.test(response.headers.get('Cache-Control')||'')&&!/attachment/i.test(response.headers.get('Content-Disposition')||'')){
   const cache=await caches.open(CACHE);cache.put(req,response.clone()).catch(()=>{});
  }return response;
  }catch{
   const cached=await caches.match(req,{ignoreSearch:true});if(cached)return cached;
   if(req.mode==='navigate')return (await caches.match('/app'))||(await caches.match('/'));
   return new Response('Hors ligne',{status:503});
  }
 })());
});
