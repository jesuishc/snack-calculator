const CACHE='snack-calculator-v5';
const SHELL=['/','/index.html','/config.js?v=5','/register-sw.js?v=5','/src/styles.css?v=5','/src/app.js?v=5','/src/retailer-extension.js?v=5','/src/domain/price-calculator.js','/src/domain/matcher.js','/src/domain/history.js','/src/domain/state-merge.js','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html')))
  );
});
