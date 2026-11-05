// Rete prima, cache se offline o lenta: un aggiornamento pubblicato arriva al primo avvio con rete.
// Solo GET dello stesso origin: le chiamate a Supabase non passano di qui.
const CACHE = 'palestra-v1';
const FILES = [
  './', 'index.html', 'stile.css', 'app.js', 'dati.js', 'coda.js', 'html.js', 'grafico.js', 'logica.js', 'voce.js',
  'viste/allenamento.js', 'viste/seduta.js', 'viste/storico.js', 'viste/piano.js', 'viste/archivio.js', 'viste/io.js',
  'vendor/supabase-2.118.0.js',
  'fonts/AtkinsonHyperlegibleNext-400.woff2', 'fonts/AtkinsonHyperlegibleNext-700.woff2', 'fonts/OFL.txt',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rete prima, ma dopo 3 s si risponde con la copia (la rete lenta in palestra non blocca l'avvio); la risposta
// arrivata dopo aggiorna comunque la cache. vendor/ e fonts/ non cambiano mai: prima la cache.
const WAIT = 3000;
self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  const fromNet = () => {
    const net = fetch(r, { cache: 'no-cache' }).then(async res => {
      if (res.ok && res.type === 'basic') await (await caches.open(CACHE)).put(r, res.clone());
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    return net;
  };
  if (/^\/(.*\/)?(vendor|fonts)\//.test(url.pathname)) return e.respondWith(caches.match(r).then(m => m || fromNet()));
  const net = fromNet();
  const slow = new Promise(ok => setTimeout(ok, WAIT)).then(() => caches.match(r)).then(m => m || net);
  e.respondWith(Promise.race([net, slow]).catch(() => caches.match(r).then(m => m || Response.error())));
});
