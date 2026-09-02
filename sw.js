// Service worker minimo: la pagina sempre dalla rete (con ripiego alla copia
// salvata se sei offline), i file statici pesanti dalla cache. I dati dei treni
// (/api/) non vengono MAI messi in cache: un semaforo vecchio e' peggio di
// nessun semaforo.
const V = "riviera-v1";
const STATICI = ["/", "/index.html", "/motore.js", "/linea.json", "/logo.png", "/logo@2x.png", "/manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(STATICI)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate" || u.pathname === "/motore.js" || u.pathname === "/linea.json") {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((k) => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  if (/\.(png|ico|json|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((k) => k.put(e.request, c)); return r; })));
  }
});
