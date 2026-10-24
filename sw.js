/* ============================================================================
   Riposa — service worker
   ----------------------------------------------------------------------------
   È il pezzo che fa di Riposa un'app installabile: tiene sul telefono la
   pagina, gli stili, il motore di calcolo, i font e le icone, così l'app si
   apre in fretta e il CALCOLO funziona anche senza rete (in stalla il segnale
   è spesso debole).

   Cosa NON tiene: le chiamate a Supabase (accesso, clienti, ordini,
   lead). Quelle vanno sempre in rete, perché devono essere vere e fresche.
   Senza rete l'ordine non parte, e la pagina lo dice.

   Come si aggiorna: ogni volta che si pubblica, la pagina viene riletta dalla
   rete se c'è (prima la rete, poi la copia); i file in assets/ hanno il numero
   di versione nell'indirizzo (?v=...), quindi una versione nuova è un file
   nuovo e la copia vecchia non può restare in mezzo. Cambiare CACHE solo se
   serve buttare via tutto.
   ========================================================================== */

const CACHE = 'riposa-v2';   // v2: icone nuove (24/10/2026)

/* All'installazione legge la pagina e mette da parte tutto quello che usa
   (stili, script, immagini, font citati nel CSS). Così la lista dei file non
   va tenuta a mano qui dentro e non può andare fuori sincrono con la pagina. */
self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const pagina = await fetch('./', { cache: 'no-cache' });
    const html = await pagina.clone().text();
    await cache.put('./', pagina);

    const file = new Set(['manifest.webmanifest']);
    for (const m of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
      if (!m[1].startsWith('materiali/')) file.add(m[1]);   // i PDF no: pesano
    }
    for (const f of [...file]) {
      if (!/\.css(\?|$)/.test(f)) continue;
      const css = await (await fetch(f)).text();
      const base = f.replace(/[^/]*$/, '');
      for (const m of css.matchAll(/url\('?([^')]+)'?\)/g)) file.add(base + m[1]);
    }
    file.add('pro/');                       // Riposa Pro, l'app dei venditori (dal 24/10/2026)
    file.add('pro/manifest.webmanifest');
    await Promise.all([...file].map(f => cache.add(f).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Supabase e ogni altro sito: sempre in rete

  // La pagina: prima la rete (così si vede subito la versione nuova), senza rete la copia.
  // Due pagine: quella dell'allevatore ('./') e Riposa Pro ('pro/').
  if (req.mode === 'navigate') {
    const pagina = url.pathname.startsWith('/pro') ? 'pro/' : './';
    ev.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && /^\/(pro\/?)?(index\.html)?$/.test(url.pathname)) {
          (await caches.open(CACHE)).put(pagina, r.clone());
        }
        return r;
      } catch (e) {
        return (await caches.match(req)) || (await caches.match(pagina));
      }
    })());
    return;
  }

  // Tutto il resto: la copia se c'è, altrimenti la rete (e se ne tiene una copia).
  ev.respondWith((async () => {
    const c = await caches.match(req);
    if (c) return c;
    const r = await fetch(req);
    if (r.ok && !url.pathname.endsWith('.pdf')) (await caches.open(CACHE)).put(req, r.clone());
    return r;
  })());
});

/* ----------------------------------------------------------- le notifiche
   Dal 22/10/2026. Le manda la funzione "notifica" su Supabase (ordine nuovo,
   stato dell'ordine, provvigione liquidata). Su iPhone arrivano solo con
   Riposa installata sulla schermata Home. Il tocco apre l'area venditori. */
self.addEventListener('push', ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { testo: ev.data && ev.data.text() }; }
  ev.waitUntil(self.registration.showNotification(d.titolo || 'Riposa', {
    body: d.testo || '',
    icon: 'assets/icone/icona-192.png',
    badge: 'assets/icone/favicon-32.png',
    tag: d.tag || undefined,          // lo stesso ordine non si accumula: l'ultima notizia sostituisce la prima
    data: { link: d.link || '/pro/' }
  }));
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const link = new URL((ev.notification.data && ev.notification.data.link) || '/pro/', self.location.origin).href;
  ev.waitUntil((async () => {
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate ? c.navigate(link) : null; }
    }
    return self.clients.openWindow(link);
  })());
});
