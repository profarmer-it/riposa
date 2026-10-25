/* ============================================================================
   Riposa — AREA VENDITORI
   ----------------------------------------------------------------------------
   Agenti, rivenditori e commerciali Pro Farmer entrano con la loro e-mail e
   un codice di 6 cifre che arriva per e-mail. Dal 24/10/2026 sta in Riposa Pro,
   riposa.profarmer.it/pro/ (pro/index.html, generato da strumenti/genera-pro.mjs)
   e trovano la loro area, in sei schede:
     Calcolo e ordine · Clienti · Ordini · Provvigioni (o Margini) · Materiali · Profilo
   Pro Farmer (ruolo interno) ha in più la Gestione: vedi profarmer.js.
   Il calcolo è quello dell'allevatore, ma il risultato si vede subito a
   schermo, senza il muro dei lead, e sotto c'è il modulo d'ordine.

   Dal novembre 2026 i dati stanno su Supabase (prima: script Google + foglio).
   In questo file NON ci sono condizioni né dati di clienti: il sito è
   pubblico, e la chiave qui sotto è quella pubblica. Quello che ognuno vede
   lo decide il database (Row Level Security): ognuno riceve solo le sue
   righe. Il conto che fa fede è quello che rifà invia_ordine() nel database
   quando riceve l'ordine: qui è un'anteprima.
   Lo schema del database sta in integrazioni/supabase/ (fuori da GitHub).
   ========================================================================== */

'use strict';

const Venditori = (() => {

  /* Il progetto Supabase "riposa" (Francoforte). La chiave è quella
     pubblica: può stare nel sito, la sicurezza la fa il database. */
  const SUPABASE = {
    url: 'https://gmhmxybqmkcmnbjdnslz.supabase.co',
    chiave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtaG14eWJxbWtjbW5iamRuc2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjM4OTgsImV4cCI6MjEwODIzOTg5OH0.af0OZrnCjJ6Wznmv0vmimnUSOPeLcrRSU5AhyvIRNBc'
  };
  /* Dentro Riposa Pro (/pro/, dal 24/10/2026) l'area è tutta l'app: si parte
     dall'accesso, e uscendo si torna all'accesso, non al calcolatore. */
  const PRO = !!window.RIPOSA_PRO;
  const CHIAVE_VECCHIA = 'riposa-codice';   // il codice personale di prima di novembre 2026
  let sb = null;            // il collegamento a Supabase
  let emailAccesso = '';    // l'e-mail a cui è stato mandato il codice
  let cond = null;          // le condizioni di chi è entrato
  let area = null;          // profilo, clienti, ordini, materiali (dallo script)
  let homeVista = false;   // la home è già comparsa in questa visita?
  let scheda = 'home';      // la sezione aperta: 'home' è "La mia area"
  let ultimoCalcolo = null; // il risultato del calcolatore, se c'è
  // quello che il venditore ha scritto nel modulo d'ordine: sopravvive ai
  // ridisegni del risultato (per esempio quando sceglie l'alternativa)
  let stato = statoVuoto();
  let suggeriti = null;     // le quantità proposte dal calcolo, per capire se le ha cambiate

  const RUOLI = { agente: 'agente', rivenditore: 'rivenditore', interno: 'Pro Farmer' };
  const VOCI = [
    { id: 'bigbag',   nome: 'piùLact, big bag da 600 kg',        unita: 'big bag',
      prodotto: 'piùLact', formato: 'Big bag da 600 kg', una: 'big bag' },
    { id: 'sacchi',   nome: 'piùLact, bancali di sacchi da 25 kg (1,2 t)', unita: 'bancali',
      prodotto: 'piùLact', formato: 'Bancale di sacchi da 25 kg (1,2 t)', una: 'bancale' },
    { id: 'ballette', nome: 'piùLact Pronto, ballette da circa 850 kg', unita: 'ballette',
      prodotto: 'piùLact Pronto', formato: 'Ballette da circa 850 kg', una: 'balletta' }
  ];
  const STATI = {
    inviato: 'Inviato', confermato: 'Confermato', consegnato: 'Consegnato',
    pagato: 'Pagato', annullato: 'Annullato'
  };
  const CUCCETTE = { '': '—', materassino: 'Materassino', buca: 'Buca', lettiera: 'Lettiera', compost: 'Compost barn' };
  /* I dati del cliente. Obbligatori per fatturare (Giulio, 22/10/2026):
     ragione sociale, P.IVA, telefono, e PEC o codice univoco (uno dei due). */
  const CAMPI_CLIENTE = [
    { id: 'ragione', etichetta: 'Ragione sociale', obbligatorio: true },
    { id: 'piva', etichetta: 'P.IVA', obbligatorio: true, modo: 'numeric' },
    { id: 'pec', etichetta: 'PEC', tipo: 'email', unoDeiDue: true },
    { id: 'sdi', etichetta: 'Codice univoco (SDI)', unoDeiDue: true, maiuscolo: true },
    { id: 'telefono', etichetta: 'Telefono', obbligatorio: true, tipo: 'tel' },
    { id: 'email', etichetta: 'E-mail', tipo: 'email' },
    { id: 'referente', etichetta: 'Referente' },
    { id: 'indirizzo', etichetta: 'Indirizzo (via e numero, per la consegna)' },
    { id: 'comune', etichetta: 'Comune' },
    { id: 'provincia', etichetta: 'Provincia' },
    { id: 'capi', etichetta: 'Capi in lattazione', tipo: 'number' }
  ];
  /* Nel modulo d'ordine, per un cliente nuovo, servono solo questi. */
  const CAMPI_ORDINE = ['ragione', 'piva', 'pec', 'sdi', 'telefono', 'email', 'indirizzo', 'comune', 'provincia'];

  /* La stessa regola di mancaNelCliente() nello script Google: se cambi una,
     cambia l'altra. Restituisce il messaggio da mostrare, o ''. */
  function validaCliente(c) {
    const t = k => String(c[k] || '').trim();
    if (!t('ragione')) return 'Serve la ragione sociale.';
    if (!/^\d{11}$/.test(t('piva').replace(/^IT/i, '').replace(/\s/g, ''))) return 'Serve la P.IVA: 11 cifre.';
    if (!t('pec') && !t('sdi')) return 'Serve la PEC oppure il codice univoco: almeno uno dei due.';
    if (t('pec') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t('pec'))) return 'La PEC non sembra valida.';
    if (t('sdi') && !/^[A-Za-z0-9]{6,7}$/.test(t('sdi'))) return 'Il codice univoco ha 7 caratteri, lettere e numeri.';
    if (t('telefono').replace(/\D/g, '').length < 8) return 'Serve il telefono del cliente.';
    if (t('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t('email'))) return 'L’e-mail del cliente non sembra valida.';
    return '';
  }

  /* Un campo cliente, per la scheda clienti (prefisso "cl") o per l'ordine ("o"). */
  function campoCliente(f, valore, prefisso) {
    const nota = f.obbligatorio ? '' : f.unoDeiDue ? ' <span class="opzionale">uno dei due</span>'
      : ' <span class="opzionale">facoltativo</span>';
    return `<div class="campo"><label for="${prefisso}-${f.id}">${esc(f.etichetta)}${nota}</label>`
      + `<input id="${prefisso}-${f.id}" name="${f.id}" type="${f.tipo || 'text'}"`
      + (f.modo ? ` inputmode="${f.modo}"` : '') + (f.maiuscolo ? ' autocapitalize="characters"' : '')
      + ` value="${esc(valore || '')}"></div>`;
  }
  const PRO_FARMER = { email: 'info@profarmer.it', telefono: '+39 376 129 6162', tel: '+393761296162' };

  function statoVuoto() {
    return { bigbag: '', sacchi: '', ballette: '', annuale: false, clienteId: '' };
  }

  /* ---------------------------------------------------------------- utilità */

  /* L'accesso resta sul telefono finché il venditore non preme "Esci":
     con l'app installata la apre ed è già dentro (decisione di Giulio,
     22 ottobre 2026). Lo tiene Supabase in localStorage. */
  function collegamento() {
    if (sb) return sb;
    if (!window.supabase || /^__/.test(SUPABASE.url)) return null;
    sb = window.supabase.createClient(SUPABASE.url, SUPABASE.chiave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'riposa-accesso' }
    });
    return sb;
  }

  /* Il vecchio codice personale non serve più: via dal telefono. */
  function togliCodiceVecchio() {
    try { localStorage.removeItem(CHIAVE_VECCHIA); sessionStorage.removeItem(CHIAVE_VECCHIA); } catch (e) {}
  }

  /* Le chiamate al database. Un errore scritto dal database (raise
     exception) arriva col suo messaggio, già in italiano. */
  function rpc(nome, parametri) {
    return collegamento().rpc(nome, parametri).then(({ data, error }) => {
      if (error) throw Object.assign(new Error(error.message), { delDatabase: error.code === 'P0001' });
      return data;
    });
  }

  /* ------------------------------------------------- l'app sul telefono */

  const CHIAVE_INSTALLA = 'riposa-installa-no';
  let promptAndroid = null;   // l'invito "Installa" di Chrome, quando il telefono lo offre
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    promptAndroid = ev;
    if (cond) aggiorna();
  });
  window.addEventListener('appinstalled', () => { promptAndroid = null; if (cond) aggiorna(); });

  function installata() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function suIPhone() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPad recenti
  }
  function nonOra() {
    try { return localStorage.getItem(CHIAVE_INSTALLA) === '1'; } catch (e) { return false; }
  }

  /* Il riquadro "Installa Riposa": solo nell'area venditori, solo se l'app non
     è già installata e se il venditore non ha detto "Non ora". Su iPhone non
     esiste un invito automatico, quindi spieghiamo i due tocchi in Safari. */
  function riquadroInstalla() {
    if (installata() || nonOra()) return '';
    let corpo = '';
    if (suIPhone()) {
      const disp = /ipad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && !/iphone/i.test(navigator.userAgent) ? 'iPad' : 'iPhone';
      corpo = `<strong>Metti Riposa sul tuo ${disp}, come un'app.</strong> In Safari tocca `
        + '<span class="icona-condividi" aria-label="Condividi">Condividi <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">'
        + '<path d="M10 2v11M6 6l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M5 9H4v9h12V9h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>'
        + ' e poi <strong>«Aggiungi alla schermata Home»</strong>. Dieci secondi, una volta sola: poi Riposa si apre dall’icona, a schermo intero, '
        + 'e resti dentro finché non premi «Esci».';
    } else if (promptAndroid) {
      corpo = '<strong>Metti Riposa sul telefono, come un’app.</strong> Si apre dall’icona, a schermo intero, e resti dentro finché non premi «Esci».';
    } else {
      return '';   // computer o browser che non sa installare: niente riquadro
    }
    return '<div class="installa">' + '<p>' + corpo + '</p><div class="azioni">'
      + (promptAndroid && !suIPhone() ? '<button type="button" class="bottone" id="v-installa">Installa l’app</button>' : '')
      + '<button type="button" class="bottone bottone-fantasma" id="v-installa-no">Non ora</button></div></div>';
  }

  function agganciaInstalla() {
    const si = document.getElementById('v-installa');
    if (si) si.addEventListener('click', () => {
      promptAndroid.prompt();
      promptAndroid.userChoice.finally(() => { promptAndroid = null; aggiorna(); });
    });
    const no = document.getElementById('v-installa-no');
    if (no) no.addEventListener('click', () => {
      try { localStorage.setItem(CHIAVE_INSTALLA, '1'); } catch (e) {}
      aggiorna();
    });
  }

  /* --------------------------------------------------- le notifiche (Web Push)
     Dal 22/10/2026. Il telefono si iscrive quando il venditore tocca
     «Attiva le notifiche» (il permesso si può chiedere solo dopo un tocco).
     L'iscrizione va nel database (salva_iscrizione); le notifiche le manda
     la funzione "notifica" su Supabase, e le mostra sw.js.
     Su iPhone esistono solo con Riposa installata sulla schermata Home. */
  const VAPID = 'BBMiPSY2ADgUWEiZE7vpPz6aJLnfxfM-rUjhZKuNp2nQh8nv7NSMChvyL_MMjIEUnc1c3CZO_OflRINeQX_nZo4';
  const CHIAVE_NOTIFICHE = 'riposa-notifiche-no';

  function notifichePossibili() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  /* 'attive', 'spente', 'negate', 'installa' (iPhone non installata), 'no' (telefono che non le sa fare) */
  function statoNotifiche() {
    if (suIPhone() && !installata()) return 'installa';
    if (!notifichePossibili()) return 'no';
    if (Notification.permission === 'denied') return 'negate';
    return Notification.permission === 'granted' ? 'attive' : 'spente';
  }
  function chiaveVapid() {
    const b = atob(VAPID.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }
  function iscrizioneAttuale() {
    return navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(s => ({ reg, s })));
  }
  function salvaIscrizione(s) {
    const j = s.toJSON();
    j.dispositivo = navigator.userAgent.slice(0, 200);
    return rpc('salva_iscrizione', { s: j });
  }
  /* Con il permesso già dato, a ogni accesso il telefono si ri-lega a chi è
     entrato (anche se sullo stesso telefono prima c'era un altro venditore). */
  function sincronizzaNotifiche() {
    if (statoNotifiche() !== 'attive') return;
    iscrizioneAttuale().then(({ reg, s }) => s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapid() }))
      .then(salvaIscrizione).catch(() => {});
  }
  function attivaNotifiche(bottone) {
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Un momento…'; }
    return Notification.requestPermission()
      .then(p => { if (p !== 'granted') throw new Error('negato'); return iscrizioneAttuale(); })
      .then(({ reg, s }) => s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapid() }))
      .then(salvaIscrizione)
      .catch(() => {})
      .then(() => aggiornaVista());
  }
  function disattivaNotifiche(bottone) {
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Un momento…'; }
    return togliQuestoTelefono().then(() => {
      try { localStorage.setItem(CHIAVE_NOTIFICHE, '1'); } catch (e) {}
      aggiornaVista();
    });
  }
  /* Esci e «Disattiva»: questo telefono non riceve più niente. */
  function togliQuestoTelefono() {
    if (!notifichePossibili() || !sb) return Promise.resolve();
    const lavoro = iscrizioneAttuale().then(({ s }) => {
      if (!s) return;
      return rpc('togli_iscrizione', { endpoint: s.endpoint }).catch(() => {}).then(() => s.unsubscribe());
    }).catch(() => {});
    // senza service worker o senza rete non si resta appesi: dopo 4 secondi si va avanti
    return Promise.race([lavoro, new Promise(ok => setTimeout(ok, 4000))]);
  }
  function aggiornaVista() {
    if (cond && (scheda === 'home' || scheda === 'profilo')) apri(scheda);
  }
  function cosaAvvisa() {
    return cond.ruolo === 'interno' ? 'quando un agente o un rivenditore manda un ordine'
      : cond.ruolo === 'agente' ? 'quando i tuoi ordini sono confermati, consegnati e pagati, e quando ti liquidiamo le provvigioni'
        : 'quando i tuoi ordini sono confermati, consegnati e pagati';
  }

  /* In home, una volta: l'invito ad attivarle. Mai insieme all'invito a installare. */
  function riquadroNotifiche() {
    if (statoNotifiche() !== 'spente') return '';
    try { if (localStorage.getItem(CHIAVE_NOTIFICHE) === '1') return ''; } catch (e) {}
    return '<div class="installa avviso-notifiche"><p><strong>Vuoi un avviso sul telefono?</strong> Ti scriviamo noi '
      + esc(cosaAvvisa()) + '.</p><div class="azioni">'
      + '<button type="button" class="bottone" id="v-notifiche-si">Attiva le notifiche</button>'
      + '<button type="button" class="bottone bottone-fantasma" id="v-notifiche-no">Non ora</button></div></div>';
  }
  function agganciaNotifiche() {
    const si = document.getElementById('v-notifiche-si');
    if (si) si.addEventListener('click', () => attivaNotifiche(si));
    const no = document.getElementById('v-notifiche-no');
    if (no) no.addEventListener('click', () => {
      try { localStorage.setItem(CHIAVE_NOTIFICHE, '1'); } catch (e) {}
      aggiornaVista();
    });
    const via = document.getElementById('v-notifiche-via');
    if (via) via.addEventListener('click', () => disattivaNotifiche(via));
  }
  /* Nel profilo: lo stato su questo telefono, sempre. */
  function bloccoNotifiche() {
    const st = statoNotifiche();
    let h = '<div class="blocco"><h3>Notifiche su questo telefono</h3>';
    if (st === 'attive') {
      h += `<p>Attive: ti avvisiamo ${esc(cosaAvvisa())}.</p>`
        + '<div class="azioni"><button type="button" class="bottone bottone-fantasma" id="v-notifiche-via">Disattiva su questo telefono</button></div>';
    } else if (st === 'spente') {
      h += `<p>Spente. Se le attivi ti avvisiamo ${esc(cosaAvvisa())}.</p>`
        + '<div class="azioni"><button type="button" class="bottone" id="v-notifiche-si">Attiva le notifiche</button></div>';
    } else if (st === 'installa') {
      h += '<p>Su iPhone le notifiche arrivano solo con Riposa installata: in Safari tocca Condividi e poi '
        + '«Aggiungi alla schermata Home», apri Riposa dall’icona e torna qui.</p>';
    } else if (st === 'negate') {
      h += '<p>Le hai bloccate per Riposa. Per riattivarle: Impostazioni del telefono → Notifiche → Riposa.</p>';
    } else {
      h += '<p>Questo telefono o browser non sa ricevere le notifiche di Riposa.</p>';
    }
    return h + '</div>';
  }

  function euro(n) {
    if (n === null || n === undefined) return 'da definire';
    return num(n, 2) + ' €';
  }

  function perc(x) {
    return x === null || x === undefined ? 'da definire' : num(x * 100, Number.isInteger(x * 100) ? 0 : 1) + '%';
  }

  /* --------------------------------------------------------------------------
     IL CONTO DI UN ORDINE
     ATTENZIONE: stessa logica di conto_ordine() nel database
     (integrazioni/supabase/01-schema.sql). Se cambi una, cambia l'altra.
     Fa fede quella del database.
     -------------------------------------------------------------------------- */
  function contoOrdine(c, righe, opz) {
    opz = opz || {};
    var tot = { t: 0, listino: 0, cliente: 0, acquisto: 0, provvigione: 0, margine: 0, daDefinire: false };
    var out = [];
    for (var i = 0; i < righe.length; i++) {
      var voce = righe[i].voce;
      var pezzi = Math.max(0, Math.floor(Number(righe[i].pezzi) || 0));
      if (!pezzi || !c.listinoT[voce]) continue;
      var t = pezzi * c.kgPezzo[voce] / 1000;
      var listinoT = c.listinoT[voce];
      var r = { voce: voce, pezzi: pezzi, t: t, listinoT: listinoT, listino: t * listinoT };
      var tipo = opz.annuale ? 'annuale' : 'standard';

      if (c.ruolo === 'agente') {
        var perc = voce === 'ballette' ? c.ballette.provvigione[tipo] : c.piulact.provvigione;
        r.clienteT = listinoT;
        r.cliente = r.listino;
        r.percProvvigione = perc;
        r.provvigione = perc === null || perc === undefined ? null : r.listino * perc;
      } else if (c.ruolo === 'rivenditore') {
        var acqT = voce === 'ballette' ? listinoT * (1 - c.ballette.sconto[tipo]) : c.piulact[voce];
        r.acquistoT = acqT === undefined ? null : acqT;
        r.acquisto = r.acquistoT === null ? null : t * r.acquistoT;
        r.margine = r.acquisto === null ? null : r.listino - r.acquisto;
      } else {
        r.clienteT = listinoT;
        r.cliente = t * r.clienteT;
      }
      r.sottoMinimo = c.minimi && pezzi < c.minimi[voce];

      tot.t += t;
      tot.listino += r.listino;
      if (r.cliente != null) tot.cliente += r.cliente;
      if (r.acquisto != null) tot.acquisto += r.acquisto;
      if (r.provvigione != null) tot.provvigione += r.provvigione;
      if (r.margine != null) tot.margine += r.margine;
      if ((c.ruolo === 'agente' && r.provvigione === null)
          || (c.ruolo === 'rivenditore' && r.acquisto === null)) tot.daDefinire = true;
      out.push(r);
    }
    return { righe: out, totale: tot };
  }

  /* ------------------------------------------------------- la barra e le schede */

  function barra() {
    let el = document.getElementById('area-venditori');
    if (!el) {
      el = document.createElement('section');
      el.id = 'area-venditori';
      el.className = 'scheda venditori';
      const main = document.querySelector('main');
      main.insertBefore(el, main.firstChild);
    }
    return el;
  }

  function pannello() {
    let el = document.getElementById('area-pannello');
    if (!el) {
      el = document.createElement('section');
      el.id = 'area-pannello';
      el.className = 'venditori-pannello';
      barra().insertAdjacentElement('afterend', el);
    }
    return el;
  }

  /* La schermata di accesso è una pagina a sé: niente calcolatore sotto, un
     campo grande (sopra i 16 px, così l'iPhone non zooma quando lo tocchi).
     Due passi: l'e-mail, poi il codice di 6 cifre che arriva per e-mail.
     Niente link magico: su iPhone aprirebbe Safari e non l'app installata. */
  function mostraAccesso(messaggio, conRiprova) {
    document.body.classList.add('accesso-venditori');
    document.body.classList.remove('in-area-venditori');
    const p = document.getElementById('area-pannello');
    if (p) p.hidden = true;
    const el = barra();
    el.innerHTML = '<div class="accesso">'
      + (PRO ? '' : '<p class="soprattitolo">Riposa · area venditori</p>')
      + '<h2>Entra nella tua area</h2>'
      + '<p class="aiuto">Per agenti, rivenditori e commerciali Pro Farmer: i tuoi clienti, i tuoi ordini, '
      + 'le tue provvigioni e i materiali da mandare ai clienti.</p>'
      + '<form id="form-accesso" class="venditori-accesso" novalidate>'
      + '<label for="v-email">La tua e-mail</label>'
      + '<input id="v-email" name="email" type="email" autocomplete="email" autocapitalize="off" autocorrect="off" '
      + `spellcheck="false" enterkeyhint="send" inputmode="email" placeholder="nome@esempio.it" value="${esc(emailAccesso)}">`
      + '<button type="submit" class="bottone bottone-grande">Mandami il codice</button>'
      + '</form>'
      + (messaggio ? `<p class="errore">${esc(messaggio)}</p>` : '')
      + (conRiprova ? '<div class="azioni"><button type="button" class="bottone" id="v-riprova">Riprova</button></div>' : '')
      + '<p class="accesso-piede">Usa l’e-mail che hai dato a Pro Farmer. Non sei registrato? Chiama Pro Farmer: '
      + `<a href="tel:${PRO_FARMER.tel}">${PRO_FARMER.telefono}</a></p>`
      + (PRO
        ? '<p class="accesso-piede"><a href="../">Sei un allevatore? Vai al calcolatore</a></p>'
        : '<p class="accesso-piede"><a href="./" id="v-al-calcolatore">← Torna al calcolatore per l’allevatore</a></p>')
      + '</div>';
    const riprova = document.getElementById('v-riprova');
    if (riprova) riprova.addEventListener('click', () => caricaArea());
    if (!PRO) document.getElementById('v-al-calcolatore').addEventListener('click', ev => {
      ev.preventDefault();
      chiudiAccesso();
    });
    document.getElementById('form-accesso').addEventListener('submit', ev => {
      ev.preventDefault();
      const e = document.getElementById('v-email').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return mostraAccesso('Scrivi un’e-mail completa, per esempio nome@libero.it.');
      chiediCodice(e, ev.currentTarget.querySelector('button'));
    });
    // dopo che il browser ha rimesso la posizione di scorrimento della visita prima
    setTimeout(() => window.scrollTo(0, 0), 0);
  }

  function chiediCodice(e, bottone) {
    if (!collegamento()) return mostraAccesso('L’area venditori non è raggiungibile: riprova tra poco.');
    if (bottone) { bottone.disabled = true; bottone.textContent = 'Mando il codice…'; }
    emailAccesso = e;
    sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } }).then(({ error }) => {
      if (!error) return mostraCodice();
      const m = String(error.message || '');
      if (error.status === 429 || /rate|seconds|too many/i.test(m)) {
        return mostraAccesso('Hai chiesto il codice da poco: aspetta un minuto e riprova.');
      }
      if (/signup|not allowed|not found|user/i.test(m)) {
        return mostraAccesso('Questa e-mail non è registrata. Controlla di averla scritta bene, o chiedi a Pro Farmer di aggiungerla.');
      }
      mostraAccesso(navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.'
        : 'Non riesco a mandare il codice: riprova tra poco.');
    });
  }

  function mostraCodice(messaggio) {
    const el = barra();
    el.innerHTML = '<div class="accesso accesso-codice">'
      + (PRO ? '' : '<p class="soprattitolo">Riposa · area venditori</p>')
      + '<h2>Controlla la posta</h2>'
      + `<p class="aiuto">Ti abbiamo mandato un codice di 6 cifre a <strong>${esc(emailAccesso)}</strong>. `
      + 'Se non lo trovi, guarda nella posta indesiderata.</p>'
      + '<form id="form-codice" class="venditori-accesso" novalidate>'
      + '<label for="v-codice">Il codice</label>'
      + '<input id="v-codice" name="codice" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" '
      + 'maxlength="6" enterkeyhint="go" placeholder="123456">'
      + '<button type="submit" class="bottone bottone-grande">Entra</button>'
      + '</form>'
      + (messaggio ? `<p class="errore">${esc(messaggio)}</p>` : '')
      + '<p class="accesso-piede"><a href="#venditori" id="v-altra-email">← Un’altra e-mail, o un codice nuovo</a></p>'
      + '</div>';
    document.getElementById('v-altra-email').addEventListener('click', ev => { ev.preventDefault(); mostraAccesso(); });
    const campo = document.getElementById('v-codice');
    campo.focus();
    document.getElementById('form-codice').addEventListener('submit', ev => {
      ev.preventDefault();
      const codice = campo.value.replace(/\D/g, '');
      if (codice.length !== 6) return mostraCodice('Il codice ha 6 cifre.');
      const b = ev.currentTarget.querySelector('button');
      b.disabled = true; b.textContent = 'Controllo…';
      sb.auth.verifyOtp({ email: emailAccesso, token: codice, type: 'email' }).then(({ error }) => {
        if (error) {
          return mostraCodice(/expired|invalid/i.test(error.message)
            ? 'Codice sbagliato o scaduto (vale un’ora). Ricontrolla, o chiedine uno nuovo.'
            : 'Non riesco a controllare il codice: riprova tra poco.');
        }
        togliCodiceVecchio();
        caricaArea();
      });
    });
  }

  function chiudiAccesso() {
    document.body.classList.remove('accesso-venditori');
    history.replaceState(null, '', location.pathname);
    const el = document.getElementById('area-venditori');
    if (el) el.remove();
    window.scrollTo(0, 0);
  }

  /* Dopo l'accesso: tutta l'area in una chiamata (area() nel database). */
  function caricaArea() {
    rpc('area').then(r => {
      if (!r || !r.ok) {
        // l'utente c'è ma non è (più) un venditore attivo
        sb.auth.signOut();
        return mostraAccesso('Il tuo accesso non è attivo. Chiedi a Pro Farmer.');
      }
      ricevi(r);
      sincronizzaNotifiche();
      caricaDiamanti();
      document.body.classList.remove('accesso-venditori');
      document.body.classList.add('in-area-venditori');
      // le scorciatoie dell'app (tieni premuta l'icona) e i link delle notifiche
      const vai = { '#nuovo-ordine': 'diretto', '#clienti': 'clienti', '#ordini': 'ordini', '#calcolo': 'calcolo', '#mappa': 'mappa', '#diamanti': 'diamanti',
                    '#gestione': cond.ruolo === 'interno' ? 'gestione' : null }[location.hash];
      if (vai) { history.replaceState(null, '', location.pathname); apri(vai); return; }
      apri(scheda);
    }).catch(() => {
      /* Senza rete l'accesso NON si perde: appena torna il segnale basta
         "Riprova". Il calcolo per la stalla intanto funziona lo stesso. */
      mostraAccesso(navigator.onLine === false
        ? 'Sei senza rete. La tua area si carica quando torna il segnale; intanto il calcolatore per la stalla funziona lo stesso (lo trovi qui sotto, «Torna al calcolatore»).'
        : 'Non riesco a collegarmi: controlla la connessione e riprova.', true);
    });
  }

  function ricevi(r) {
    cond = r.condizioni;
    area = {
      profilo: r.profilo || { nome: cond.nome, ruolo: cond.ruolo, email: '' },
      clienti: r.clienti || [],
      ordini: r.ordini || [],
      // solo link web sicuri, anche se il database li ha già filtrati
      materiali: (r.materiali || []).filter(m => /^https:\/\//.test(m.link || ''))
    };
  }

  /* Ricarica clienti e ordini dopo un salvataggio, senza cambiare scheda. */
  function ricarica() {
    return rpc('area').then(r => { if (r && r.ok) ricevi(r); }).then(caricaDiamanti);
  }

  function nomeSoldi() {
    return cond.ruolo === 'agente' ? 'Provvigioni' : cond.ruolo === 'rivenditore' ? 'Margini' : 'Venduto';
  }

  function iniziali(nome) {
    return String(nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  /* Le icone delle sezioni: tratti semplici, stesso spessore, colore del testo. */
  const ICONE = {
    calcolo: '<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4"/>',
    diretto: '<path d="M4 7h16l-1.5 11h-13z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    clienti: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.6M18 14.5c1.8.8 3 2.6 3 4.5"/>',
    diamanti: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6M12 9v12"/>',
    mappa: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    ordini: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
    soldi: '<circle cx="12" cy="12" r="8.5"/><path d="M15 8.5c-.7-.9-1.8-1.5-3-1.5-2.2 0-4 2.2-4 5s1.8 5 4 5c1.2 0 2.3-.6 3-1.5M6.5 11h6M6.5 13.5h6"/>',
    materiali: '<path d="M4 6.5 12 3l8 3.5-8 3.5z"/><path d="M4 11.5 12 15l8-3.5M4 16.5 12 20l8-3.5"/>',
    profilo: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.6 3.9-6 7.5-6s6.7 2.4 7.5 6"/>',
    gestione: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="7" cy="18" r="1.8"/>'
  };
  function icona(id) {
    return `<svg class="tessera-icona" viewBox="0 0 24 24" aria-hidden="true">${ICONE[id]}</svg>`;
  }

  /* La testata dell'account: sempre in alto quando si è dentro. Fuori dalla
     home porta il pulsante per tornare a "La mia area". */
  function disegnaBarra() {
    const el = barra();
    let h = '<div class="account">'
      + avatar('account-iniziali')
      + `<div class="account-nome"><strong>${esc(cond.nome)}</strong><span>${esc(RUOLI[cond.ruolo] || cond.ruolo)}</span></div>`
      + '<button type="button" class="account-esci" id="v-esci">Esci</button>'
      + '</div>';
    if (scheda !== 'home') {
      h += '<button type="button" class="area-indietro" id="v-home">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>La mia area</button>';
    }
    el.innerHTML = h;
    document.getElementById('v-esci').addEventListener('click', esci);
    const home = document.getElementById('v-home');
    if (home) home.addEventListener('click', () => apri('home'));
  }

  function aggiorna() {
    disegnaBarra();
    if (scheda === 'home') apri('home');
  }

  /* "La mia area": una tessera per sezione, ognuna con il dato che serve a colpo d'occhio. */
  function disegnaHome() {
    const validi = area.ordini.filter(o => o.stato !== 'annullato');
    const ultimo = validi[0];
    const nC = area.clienti.length, nO = validi.length, nM = area.materiali.length;
    let soldi = '';
    if (cond.ruolo === 'agente') {
      const mat = validi.filter(o => o.stato === 'pagato' && !o.liquidata).reduce((x, o) => x + (o.provvigione || 0), 0);
      const inc = validi.filter(o => o.stato !== 'pagato' && !o.liquidata).reduce((x, o) => x + (o.provvigione || 0), 0);
      soldi = nO ? `${euro(mat)} maturate · ${euro(inc)} in corso` : 'Le vedrai dal primo ordine';
    } else if (cond.ruolo === 'rivenditore') {
      const m = validi.reduce((x, o) => x + (o.margine || 0), 0);
      soldi = nO ? `${euro(m)} di margine stimato` : 'Lo vedrai dal primo ordine';
    } else {
      soldi = nO ? `${euro(validi.reduce((x, o) => x + (o.totaleCliente || 0), 0))} venduti` : 'Dal primo ordine';
    }
    /* Dal 24/10/2026 il lavoro di tutti i giorni viene prima: l'ordine. Il
       calcolo della stalla è una delle strade, non la porta d'ingresso. */
    const tessere = [
      ['diretto', 'Nuovo ordine', 'Scegli il cliente e le quantità', true],
      ['calcolo', 'Calcola una stalla', 'Prodotto e quantità, poi l’ordine', false],
      ['clienti', cond.ruolo === 'interno' ? 'Clienti diretti' : 'Clienti', nC ? `${nC} ${nC === 1 ? 'cliente' : 'clienti'}` : 'Aggiungi il primo', false],
      ['mappa', 'Mappa clienti', nC ? 'Dove sono, e il navigatore per arrivarci' : 'I clienti compaiono qui', false],
      ['ordini', 'Ordini', nO ? `${nO} ${nO === 1 ? 'ordine' : 'ordini'} · l’ultimo il ${ultimo.data}` : 'Ancora nessun ordine', false],
      ['soldi', nomeSoldi(), soldi, false],
      ['materiali', 'Materiali', nM ? `${nM} ${nM === 1 ? 'documento' : 'documenti'} da mandare ai clienti` : 'Per ora nessuno', false],
      ['profilo', 'Profilo', 'Le tue condizioni e i contatti Pro Farmer', false]
    ];
    // Pro Farmer gestisce da qui ordini, venditori, condizioni e materiali
    if (cond.ruolo === 'agente') {
      const d = area.diamanti;
      tessere.splice(2, 0, ['diamanti', 'I miei diamanti',
        d ? `${d.saldo} diamanti${posizioneInClassifica(d) ? ' · ' + posizioneInClassifica(d) + '° in classifica' : ''}` : 'Traguardi, premi e classifica', false, true]);
    }
    if (cond.ruolo === 'interno') tessere.splice(1, 0, ['gestione', 'Cruscotto e gestione', 'Cosa succede oggi: ordini, lead, allevatori, venditori', false, true]);
    let h = '<h2 class="area-titolo">La mia area</h2>';
    if (cond.daAggiornare) {
      h += '<div class="avviso"><span class="avviso-icona">⚠</span><span>Promemoria: le tue condizioni su piùLact '
        + `erano valide fino al ${esc(cond.validoFino)} e sono da aggiornare con Pro Farmer. Intanto restano quelle.</span></div>`;
    }
    const inst = riquadroInstalla();
    h += inst || riquadroNotifiche();
    // le tessere entrano una dopo l'altra solo la prima volta, all'accesso:
    // dopo, tornare alla home dev'essere immediato
    h += `<div class="tessere${homeVista ? '' : ' tessere-entrano'}">`;
    homeVista = true;
    tessere.forEach(([id, titolo, sotto, primaria, larga], i) => {
      h += `<button type="button" class="tessera${primaria ? ' tessera-primaria' : ''}${larga ? ' tessera-larga' : ''}" `
        + `data-apri="${id}" style="--i:${i}">`
        + icona(id) + `<strong>${esc(titolo)}</strong><span>${esc(sotto)}</span></button>`;
      if (i === 0) h += riordiniVeloci();
    });
    h += '</div>';
    return h;
  }

  function apri(id) {
    if (id === 'diretto') return ordineDiretto();
    scheda = id;
    disegnaBarra();
    const calc = id === 'calcolo';
    // un ordine diretto lasciato a metà non resta sotto il calcolatore
    if (calc && !ultimoCalcolo) boxRis.innerHTML = '';
    modulo.hidden = !calc;
    boxRis.hidden = !calc || !boxRis.innerHTML;
    const p = pannello();
    p.hidden = calc;
    window.scrollTo(0, 0);
    if (calc) {
      document.querySelector('#modulo button[type=submit]').textContent = 'Calcola';
      if (!document.getElementById('v-diretto')) {
        modulo.insertAdjacentHTML('afterbegin',
          '<div class="venditori-diretto"><p class="aiuto">Compila la stalla del cliente e premi <strong>Calcola</strong>: '
          + 'vedi il risultato e il modulo d’ordine già riempito. Se sai già cosa serve:</p>'
          + '<button type="button" class="bottone bottone-fantasma" id="v-diretto">Ordine senza calcolo</button></div>');
        document.getElementById('v-diretto').addEventListener('click', () => ordineDiretto());
      }
      return;
    }
    if (id === 'gestione') {
      if (typeof ProFarmer !== 'undefined') ProFarmer.disegna(p, sb);
      entra(p);
      return;
    }
    const disegna = { home: disegnaHome, clienti: disegnaClienti, ordini: disegnaOrdini, soldi: disegnaSoldi,
                      materiali: disegnaMateriali, profilo: disegnaProfilo, mappa: disegnaMappa, diamanti: disegnaDiamanti }[id];
    p.innerHTML = disegna();
    if (id !== 'home') entra(p);
    if (id === 'home') {
      agganciaInstalla();
      agganciaNotifiche();
      p.querySelectorAll('[data-apri]').forEach(b => b.addEventListener('click', () => apri(b.dataset.apri)));
    }
    p.querySelectorAll('[data-riordina]').forEach(b => b.addEventListener('click', () => riordina(b.dataset.riordina)));
    agganciaCerca(p);
    if (id === 'clienti') agganciaClienti();
    if (id === 'mappa') avviaMappa();
    if (id === 'diamanti') agganciaDiamanti();
    if (id === 'materiali') agganciaMateriali();
    if (id === 'profilo') { agganciaNotifiche(); agganciaFoto(); }
  }

  /* La sezione nuova compare con una dissolvenza breve dal basso: il
     contenuto non salta da una schermata all'altra. Vedi .entra in style.css. */
  function entra(el) {
    el.classList.remove('entra');
    void el.offsetWidth;   // riparte anche se la classe c'era già
    el.classList.add('entra');
  }

  /* I riordini in home: l'ultimo ordine di ciascuno degli ultimi tre clienti.
     Un tocco e il modulo d'ordine si apre con le stesse quantità. */
  function riordiniVeloci() {
    const visti = new Set(), ultimi = [];
    area.ordini.forEach(o => {
      const chi = o.clienteId || o.cliente;
      if (o.stato === 'annullato' || !chi || visti.has(chi) || ultimi.length >= 3) return;
      visti.add(chi);
      ultimi.push(o);
    });
    if (!ultimi.length) return '';
    return '<div class="riordini"><p class="riordini-titolo">Riordina</p>'
      + ultimi.map(o => `<button type="button" class="riordino" data-riordina="${esc(o.id)}">`
        + `<strong>${esc(o.cliente || 'Il mio magazzino')}</strong>`
        + `<span>${esc(descriviPezzi(o))} · ${esc(o.data)}</span></button>`).join('')
      + '</div>';
  }

  function riordina(id) {
    const o = area.ordini.find(x => x.id === id);
    if (!o) return;
    stato = statoVuoto();
    VOCI.forEach(v => { stato[v.id] = o[v.id] ? String(o[v.id]) : ''; });
    stato.annuale = !!o.annuale;
    const ancora = area.clienti.some(c => c.id === o.clienteId);   // il cliente c'è ancora in lista?
    ordineDiretto(ancora ? o.clienteId : '');
  }

  function ordineDiretto(clienteId) {
    ultimoCalcolo = null;
    suggeriti = null;
    if (clienteId !== undefined) stato.clienteId = clienteId;
    apri('calcolo');
    // nell'ordine diretto si vede solo l'ordine: il calcolatore della stalla
    // non c'entra, e scorrendo in su non deve ricomparire
    modulo.hidden = true;
    boxRis.innerHTML = '';
    boxRis.hidden = false;
    mostraOrdine(null);
    entra(boxRis);
    window.scrollTo(0, 0);
  }

  function esci() {
    // prima il telefono esce dalle notifiche (serve ancora l'accesso), poi l'accesso
    const telefono = togliQuestoTelefono();
    if (sb) telefono.then(() => sb.auth.signOut());   // anche senza rete: la sessione sul telefono si cancella comunque
    cond = null;
    area = null;
    scheda = 'home';
    homeVista = false;
    ultimoCalcolo = null;
    suggeriti = null;
    stato = statoVuoto();
    togliCodiceVecchio();
    document.body.classList.remove('in-area-venditori', 'accesso-venditori');
    boxRis.hidden = true;
    boxRis.innerHTML = '';
    modulo.hidden = false;
    const d = document.querySelector('.venditori-diretto');
    if (d) d.remove();
    document.querySelector('#modulo button[type=submit]').textContent = 'Calcola il dosaggio';
    history.replaceState(null, '', location.pathname);
    ['area-venditori', 'area-pannello'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    if (PRO) mostraAccesso();
  }

  /* La ricerca di una lista lunga: filtra mentre si scrive, senza ridisegnare.
     Compare da 6 voci in su (24/10/2026). */
  function casellaCerca(id, segnaposto) {
    return `<input type="search" class="pf-cerca" data-lista="${id}" placeholder="${esc(segnaposto)}" aria-label="${esc(segnaposto)}" autocomplete="off">`
      + `<p class="aiuto pf-cerca-vuoto" data-vuoto="${id}" hidden>Nessun risultato.</p>`;
  }
  function agganciaCerca(p) {
    const normale = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    p.querySelectorAll('.pf-cerca').forEach(c => c.addEventListener('input', () => {
      const q = normale(c.value.trim());
      let visti = 0;
      p.querySelectorAll(`[data-lista-di="${c.dataset.lista}"] > li`).forEach(li => {
        const ok = !q || normale(li.dataset.cerca).includes(q); li.hidden = !ok; if (ok) visti++;
      });
      p.querySelector(`[data-vuoto="${c.dataset.lista}"]`).hidden = visti > 0;
    }));
  }

  /* -------------------------------------------------------------- diamanti
     Dal 25/10/2026, solo per gli agenti. I traguardi li calcola il database
     sugli ordini CONSEGNATI (15-diamanti.sql): qui si mostrano il saldo, i
     traguardi in corso, il catalogo dei premi, le richieste e la classifica
     (solo nomi e diamanti, mai tonnellate o soldi degli altri). */
  function caricaDiamanti() {
    if (!cond || cond.ruolo !== 'agente') return Promise.resolve();
    return rpc('diamanti_agente').then(d => {
      area.diamanti = d;
      // in home cambia solo il testo della tessera: niente ridisegno, la pagina non salta
      const t = document.querySelector('[data-apri="diamanti"] span');
      if (scheda === 'home' && t && d) t.textContent = `${d.saldo} diamanti` + (posizioneInClassifica(d) ? ` · ${posizioneInClassifica(d)}° in classifica` : '');
      if (scheda === 'diamanti') apri('diamanti');
      const leg = document.getElementById('legenda-diamanti');
      if (scheda === 'profilo' && leg && !leg.querySelector('.legenda-traguardi')) { const aperta = leg.open; leg.outerHTML = legendaDiamanti(); if (aperta) document.getElementById('legenda-diamanti').open = true; }
    }).catch(() => {});
  }
  function posizioneInClassifica(d) {
    const i = (d.classifica || []).findIndex(x => x.io);
    return i >= 0 && d.classifica[i].diamanti > 0 ? i + 1 : 0;
  }
  /* I diamanti disegnati (25/10/2026): azzurro = 1, viola = 10 (Giulio). 23 si
     vede come 2 viola e 3 azzurri. Oltre gli 8 disegni si scrivono i numeri. */
  const GEMMA = c => `<svg class="gemma gemma-${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l5 6-10 12L2 9z"/><path class="gemma-luce" d="M7 3l2.6 6L12 3l2.4 6L17 3M2 9h20M9.6 9L12 21l2.4-12"/></svg>`;
  function gemme(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    const viola = Math.floor(n / 10), azzurri = n % 10;
    const testo = `${n} ${n === 1 ? 'diamante' : 'diamanti'}`;
    if (!n) return `<span class="gemme" aria-label="${testo}">0 ${GEMMA('azzurra')}</span>`;
    const icone = viola + azzurri <= 8
      ? GEMMA('viola').repeat(viola) + GEMMA('azzurra').repeat(azzurri)
      : (viola ? `${GEMMA('viola')}×${viola} ` : '') + (azzurri ? `${GEMMA('azzurra')}×${azzurri}` : '');
    return `<span class="gemme" aria-label="${testo}" title="${testo}">${icone}</span>`;
  }

  // i traguardi in corso, dagli ordini consegnati o pagati che l'agente ha già
  function progressi(d) {
    const ok = area.ordini.filter(o => ['consegnato', 'pagato'].includes(o.stato));
    const mese = s => { const [g, m, a] = String(s).split('/').map(Number); return a * 12 + m - 1; };
    const oggi = new Date(), adesso = oggi.getFullYear() * 12 + oggi.getMonth();
    const mesi = new Set(ok.map(o => mese(o.data)));
    // la serie: i mesi di fila fino a questo (se ha già ordinato) o fino al mese scorso
    let serie = 0, m = mesi.has(adesso) ? adesso : adesso - 1;
    while (mesi.has(m)) { serie++; m--; }
    const nomeMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    const out = [];
    (d.traguardi || []).forEach(t => {
      const lungo = { costanza3: 3, costanza6: 6, costanza12: 12 }[t.codice];
      if (lungo) {
        const fatto = serie % lungo, manca = lungo - fatto;
        const testo = mesi.has(adesso)
          ? `${fatto || lungo} ${(fatto || lungo) === 1 ? 'mese' : 'mesi'} su ${lungo}${fatto === 0 && serie ? ': vinto!' : ''}`
          : `${fatto} su ${lungo}: manda un ordine entro il ${nomeMese}`;
        out.push({ t, valore: fatto || (serie && mesi.has(adesso) ? lungo : 0), max: lungo, testo, nota: manca && mesi.has(adesso) ? `ne mancano ${manca}` : '' });
      } else if ((t.codice === 'volume_motrice' || t.codice === 'volume_bilico') && t.soglia) {
        const tm = ok.filter(o => mese(o.data) === adesso).reduce((x, o) => x + (Number(o.t) || 0), 0);
        out.push({ t, valore: Math.min(tm, t.soglia), max: Number(t.soglia), testo: tm >= t.soglia
          ? `${num(tm, 1)} t consegnate questo mese: traguardo raggiunto!`
          : `${num(tm, 1)} t su ${num(t.soglia, 1)} t consegnate questo mese` });
      } else if (t.codice === 'presentato' && d.presentati) {
        out.push({ t, testo: `${t.descrizione} Venditori che hai portato: ${d.presentati}.` });
      } else {
        out.push({ t, testo: t.descrizione });
      }
    });
    return out;
  }

  function disegnaDiamanti() {
    const d = area.diamanti;
    if (!d) return '<div class="blocco"><p class="aiuto">Carico i tuoi diamanti…</p></div>';
    const pos = posizioneInClassifica(d);
    let h = '<div class="blocco diamanti-testa">'
      + `<p class="diamanti-saldo"><b>${d.saldo}</b><span>${d.saldo === 1 ? 'diamante' : 'diamanti'}</span></p>`
      + `<p class="diamanti-icone">${gemme(d.saldo)}</p>`
      + `<p class="diamanti-sotto">${d.disponibili !== d.saldo ? `${d.disponibili} disponibili · ` : ''}${d.vinti_anno} vinti quest’anno${pos ? ` · ${pos}° in classifica` : ''}</p>`
      + '<p class="aiuto">Si vincono con gli ordini <strong>consegnati</strong> e si spendono nel catalogo premi. '
      + '<button type="button" class="link-legenda" id="d-legenda">Leggi il regolamento</button></p></div>';

    h += '<div class="blocco"><h3>I traguardi</h3><p class="aiuto">10 diamanti azzurri fanno un diamante viola.</p><ul class="traguardi">';
    let gruppo = null;
    progressi(d).forEach(x => {
      if (x.t.gruppo && x.t.gruppo !== gruppo) { gruppo = x.t.gruppo; h += `<li class="traguardi-gruppo">${esc(gruppo)}</li>`; }
      h += `<li><div class="traguardo-testa"><strong>${esc(x.t.nome)}</strong><span class="traguardo-premio">${gemme(x.t.diamanti)}</span></div>`
        + (x.max ? `<div class="traguardo-barra"><i style="width:${Math.round(x.valore / x.max * 100)}%"></i></div>` : '')
        + `<p>${esc(x.testo)}${x.nota ? ` · ${esc(x.nota)}` : ''}</p></li>`;
    });
    h += '</ul></div>';

    h += '<div class="blocco"><h3>Il catalogo premi</h3>';
    if (!d.premi.length) h += '<p class="aiuto">Pro Farmer sta preparando il catalogo: i diamanti intanto si accumulano.</p>';
    h += '<ul class="premi">';
    d.premi.forEach(p => {
      const posso = d.disponibili >= p.costo;
      h += `<li><div><strong>${esc(p.nome)}</strong>${p.descrizione ? `<small>${esc(p.descrizione)}</small>` : ''}</div>`
        + `<button type="button" class="bottone${posso ? '' : ' bottone-fantasma'}" data-premio="${esc(p.id)}" data-nome="${esc(p.nome)}" data-costo="${p.costo}"${posso ? '' : ' disabled'}>`
        + `${gemme(p.costo)}</button></li>`;
    });
    h += '</ul><p class="errore" id="premio-errore" hidden></p>';
    if (d.richieste.length) {
      const STATO = { richiesto: 'in attesa', approvato: 'approvato', consegnato: 'consegnato', rifiutato: 'non approvato' };
      h += '<h4>Le tue richieste</h4><ul class="lista-ordini">' + d.richieste.map(x =>
        `<li><div class="ordine-testa"><strong>${esc(x.premio)}</strong><span class="stato stato-${x.stato === 'rifiutato' ? 'annullato' : x.stato === 'richiesto' ? 'inviato' : 'pagato'}">${esc(STATO[x.stato])}</span></div>`
        + `<p class="ordine-dati">${esc(x.data)} · ${gemme(x.costo)}</p></li>`).join('') + '</ul>';
    }
    h += '</div>';

    h += '<div class="blocco"><h3>La classifica</h3><p class="aiuto">Diamanti vinti quest’anno dagli agenti Pro Farmer.</p><ol class="classifica">';
    d.classifica.forEach((x, i) => {
      h += `<li class="${x.io ? 'io' : ''}"><span class="classifica-pos">${i + 1}</span><span class="classifica-nome">${esc(x.nome)}${x.io ? ' (tu)' : ''}</span><b>${gemme(x.diamanti)}</b></li>`;
    });
    h += '</ol></div>';

    if (d.movimenti.length) {
      h += '<div class="blocco"><h3>Gli ultimi diamanti</h3><ul class="lista-ordini">' + d.movimenti.map(m =>
        `<li><div class="ordine-testa"><strong>${esc(m.motivo)}</strong><span class="diamanti-mov${m.quanti < 0 ? ' meno' : ''}">${m.quanti > 0 ? '+' : '−'}${gemme(Math.abs(m.quanti))}</span></div>`
        + `<p class="ordine-dati">${esc(m.data)}</p></li>`).join('') + '</ul></div>';
    }
    return h;
  }

  /* La Legenda dei 💎: il regolamento, in Profilo (Giulio, 25/10/2026).
     I traguardi e i valori vengono dal database: se Pro Farmer li cambia,
     la legenda è già aggiornata. */
  function legendaDiamanti() {
    const d = area.diamanti;
    let h = '<details class="blocco legenda" id="legenda-diamanti"><summary><h3>Legenda dei 💎</h3>'
      + '<span>Il regolamento dei Diamanti piùLact</span></summary><div class="legenda-corpo">';
    h += '<h4>Come funziona</h4><ul>'
      + `<li>I diamanti si vincono raggiungendo i traguardi qui sotto. Valgono solo gli ordini <strong>consegnati</strong> (o pagati): un ordine annullato non conta.</li>`
      + `<li>${gemme(1)} un diamante azzurro vale 1. ${gemme(10)} un diamante viola vale 10: dieci azzurri fanno un viola.</li>`
      + '<li>Li conta il sistema da solo, appena Pro Farmer segna un ordine come consegnato. Ti arriva una notifica.</li>'
      + '<li>Si spendono nel <strong>catalogo premi</strong>: chiedi il premio, Pro Farmer approva e scala i diamanti, poi te lo consegna. Se una richiesta non viene approvata, i diamanti restano tuoi.</li>'
      + '<li>La <strong>classifica</strong> conta i diamanti vinti dall’inizio dell’anno. Gli altri agenti vedono solo il tuo nome e i diamanti, mai tonnellate o soldi.</li>'
      + '<li>Quando un agente vince almeno 3 diamanti, gli altri ricevono una notifica senza il suo nome (al massimo una al giorno).</li></ul>';
    if (d && d.traguardi && d.traguardi.length) {
      h += '<h4>I traguardi</h4>';
      let gruppo = null;
      d.traguardi.forEach(t => {
        if (t.gruppo !== gruppo) { if (gruppo !== null) h += '</dl>'; gruppo = t.gruppo; h += `<p class="legenda-gruppo">${esc(gruppo || 'Altri')}</p><dl class="legenda-traguardi">`; }
        h += `<div><dt>${esc(t.nome)}</dt><dd>${gemme(t.diamanti)}<span>${esc(t.descrizione)}</span></dd></div>`;
      });
      h += '</dl>';
    } else {
      h += '<p class="aiuto">I traguardi si caricano con la tua area: riapri il Profilo tra un attimo.</p>';
    }
    h += '<h4>Le regole che tengono il gioco pulito</h4><ul>'
      + '<li>Un riordino vale se arriva almeno <strong>21 giorni</strong> dopo l’ordine precedente dello stesso cliente.</li>'
      + '<li><strong>Motrice e bilico</strong> si contano sulle tonnellate consegnate nello stesso mese, e si sommano: chi arriva al bilico ha vinto anche la motrice.</li>'
      + '<li>La <strong>costanza</strong> vuole almeno un ordine consegnato in ogni mese, senza salti: un mese vuoto fa ripartire la serie.</li>'
      + '<li>Il <strong>nuovo venditore</strong> lo approva Pro Farmer. Vale quando consegna il primo ordine a un cliente nuovo; poi per il suo primo anno ricevi 1 diamante ogni volta che vince.</li>'
      + '<li>Il <strong>feedback positivo</strong> lo assegna Pro Farmer dopo aver chiamato il cliente: una volta l’anno per cliente.</li>'
      + '<li>Pro Farmer può dare <strong>bonus</strong> a mano, sempre con il motivo, e cambiare i valori dei traguardi: le modifiche valgono da quel momento, le vincite già fatte restano.</li></ul>';
    return h + '</div></details>';
  }

  function agganciaDiamanti() {
    if (!area.diamanti) caricaDiamanti();
    const l = document.getElementById('d-legenda');
    if (l) l.addEventListener('click', () => {
      apri('profilo');
      const el = document.getElementById('legenda-diamanti');
      if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); }
    });
    pannello().querySelectorAll('[data-premio]').forEach(b => b.addEventListener('click', () => {
      if (!confirm(`Chiedi «${b.dataset.nome}» per ${b.dataset.costo} diamanti? Pro Farmer ti conferma la richiesta.`)) return;
      b.disabled = true;
      rpc('chiedi_premio', { p_premio: b.dataset.premio }).then(caricaDiamanti).catch(e => {
        const err = document.getElementById('premio-errore');
        err.textContent = e.delDatabase ? e.message : 'La richiesta non è partita: riprova tra poco.';
        err.hidden = false; b.disabled = false;
      });
    }));
  }

  /* ------------------------------------------------------------------ mappa
     Dal 25/10/2026. I clienti sulla cartina (OpenStreetMap). La posizione si
     cerca dall'indirizzo una volta sola (Nominatim, un indirizzo al secondo
     come chiede il servizio) e si salva nel cliente: le volte dopo la mappa
     è subito pronta. Toccando un cliente: il navigatore (Google Maps, Waze,
     e Mappe su iPhone) e il telefono. Senza rete la mappa non c'è. */
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const nonTrovati = new Set();   // in questa visita non li cerchiamo di nuovo
  let mappa = null;

  function caricaLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((ok, ko) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET + 'leaflet.js'; js.onload = ok; js.onerror = ko;
      document.head.appendChild(js);
    });
  }

  function disegnaMappa() {
    return '<div class="blocco blocco-mappa"><div class="pannello-testa"><h3>Mappa clienti</h3>'
      + '<button type="button" class="bottone bottone-fantasma mappa-io" id="m-io">Dove sono io</button></div>'
      + '<p class="aiuto" id="m-stato">Carico la mappa…</p>'
      + '<div id="v-mappa" class="v-mappa" aria-label="Mappa dei clienti"></div>'
      + '<div id="m-senza"></div></div>';
  }

  function indirizzoDi(c) { return [c.indirizzo, c.comune, c.provincia].filter(Boolean).join(', '); }

  function popupCliente(c) {
    const dest = `${c.lat},${c.lng}`;
    const tel = c.telefono ? c.telefono.replace(/[^\d+]/g, '') : '';
    return `<div class="m-popup"><strong>${esc(c.ragione)}</strong>`
      + `<span>${esc(indirizzoDi(c))}</span>`
      + (c.posizione === 'comune' ? '<em>Posizione indicativa: solo il comune. Completa l’indirizzo per quella esatta.</em>' : '')
      + '<div class="m-azioni">'
      + `<a class="bottone" href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener">Google Maps</a>`
      + `<a class="bottone bottone-fantasma" href="https://waze.com/ul?ll=${dest}&navigate=yes" target="_blank" rel="noopener">Waze</a>`
      + (suIPhone() ? `<a class="bottone bottone-fantasma" href="https://maps.apple.com/?daddr=${dest}" target="_blank" rel="noopener">Mappe</a>` : '')
      + (tel ? `<a class="bottone bottone-fantasma" href="tel:${esc(tel)}">Chiama</a>` : '')
      + '</div></div>';
  }

  function cercaPosizione(c) {
    const prova = q => fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&accept-language=it&q='
      + encodeURIComponent(q)).then(r => r.ok ? r.json() : []).then(j => j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null);
    const pieno = [c.indirizzo, c.comune, c.provincia, 'Italia'].filter(Boolean).join(', ');
    const soloComune = c.comune ? [c.comune, c.provincia, 'Italia'].filter(Boolean).join(', ') : '';
    return (c.indirizzo ? prova(pieno) : Promise.resolve(null)).then(x => {
      if (x) return { ...x, posizione: 'indirizzo' };
      if (!soloComune) return null;
      return new Promise(ok => setTimeout(ok, 1100)).then(() => prova(soloComune)).then(y => y ? { ...y, posizione: 'comune' } : null);
    });
  }

  function aggiungiSegnaposto(c) {
    const icona = L.divIcon({ className: 'm-segno' + (c.posizione === 'comune' ? ' m-indicativo' : ''), iconSize: [22, 22], iconAnchor: [11, 11] });
    L.marker([c.lat, c.lng], { icon: icona, title: c.ragione }).addTo(mappa).bindPopup(popupCliente(c), { maxWidth: 280 });
  }

  function avviaMappa() {
    const stato = document.getElementById('m-stato');
    if (navigator.onLine === false) { stato.textContent = 'Sei senza rete: la mappa si carica quando torna il segnale.'; return; }
    caricaLeaflet().then(() => {
      const el = document.getElementById('v-mappa');
      if (!el) return;
      mappa = L.map(el, { scrollWheelZoom: false, zoomControl: false }).setView([45.2, 9.9], 8);
      L.control.zoom({ position: 'bottomright' }).addTo(mappa);   // in alto lascia spazio ai cartellini   // la pianura padana, finché non ci sono clienti
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mappa);
      const conPos = area.clienti.filter(c => c.lat && c.lng);
      conPos.forEach(aggiungiSegnaposto);
      const inquadra = () => {
        const tutti = area.clienti.filter(c => c.lat && c.lng);
        if (tutti.length) mappa.fitBounds(tutti.map(c => [c.lat, c.lng]), { padding: [30, 30], maxZoom: 13 });
      };
      inquadra();
      document.getElementById('m-io').addEventListener('click', () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(p => {
          L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F86E0', fillOpacity: 1 })
            .addTo(mappa).bindTooltip('Sei qui');
          mappa.setView([p.coords.latitude, p.coords.longitude], 11);
        }, () => { stato.textContent = 'Non ho il permesso di sapere dove sei: lo dai nelle impostazioni del telefono.'; });
      });
      // la posizione di chi non ce l'ha ancora: una ricerca al secondo
      const daCercare = area.clienti.filter(c => !(c.lat && c.lng) && !nonTrovati.has(c.id) && (c.indirizzo || c.comune));
      const riassunto = () => {
        const n = area.clienti.filter(c => c.lat && c.lng).length;
        stato.textContent = area.clienti.length
          ? `${n} ${n === 1 ? 'cliente' : 'clienti'} sulla mappa su ${area.clienti.length}. Tocca un cliente per il navigatore.`
          : 'Non hai ancora clienti: compaiono qui quando li aggiungi.';
        const senza = area.clienti.filter(c => !(c.lat && c.lng));
        document.getElementById('m-senza').innerHTML = senza.length
          ? '<p class="aiuto m-senza-titolo">Senza posizione: manca l’indirizzo, o non l’abbiamo trovato. Completalo da Clienti → Modifica.</p><ul class="m-senza">'
            + senza.map(c => `<li>${esc(c.ragione)}<small>${esc(indirizzoDi(c) || 'nessun indirizzo')}</small></li>`).join('') + '</ul>'
          : '';
      };
      riassunto();
      let i = 0;
      const prossimo = () => {
        if (!document.getElementById('v-mappa') || i >= daCercare.length) { riassunto(); inquadra(); return; }
        const c = daCercare[i++];
        stato.textContent = `Cerco la posizione dei clienti: ${i} di ${daCercare.length}…`;
        cercaPosizione(c).then(pos => {
          if (!pos) { nonTrovati.add(c.id); return; }
          Object.assign(c, pos);
          aggiungiSegnaposto(c);
          return collegamento().from('clienti').update(pos).eq('id', c.id);
        }).catch(() => nonTrovati.add(c.id)).then(() => setTimeout(prossimo, 1100));
      };
      if (daCercare.length) prossimo();
    }).catch(() => { stato.textContent = 'La mappa non si carica: controlla la connessione e riprova.'; });
  }

  /* ---------------------------------------------------------------- clienti */

  function ordiniDelCliente(id) {
    return area.ordini.filter(o => o.clienteId === id && o.stato !== 'annullato');
  }

  function disegnaClienti() {
    let h = `<div class="blocco"><div class="pannello-testa"><h3>${cond.ruolo === 'interno' ? 'Clienti diretti di Pro Farmer' : 'I tuoi clienti'}</h3>`
      + '<button type="button" class="bottone" id="cl-nuovo">Aggiungi cliente</button></div>';
    h += '<div id="cl-modulo"></div>';
    if (!area.clienti.length) {
      h += '<p class="aiuto">Non hai ancora clienti. Aggiungili qui, oppure si aggiungono da soli quando mandi un ordine '
        + 'con un cliente nuovo.</p>';
    }
    if (area.clienti.length > 5) h += casellaCerca('v-clienti', 'Cerca cliente, P.IVA, comune');
    h += '<ul class="lista-clienti" data-lista-di="v-clienti">';
    area.clienti.slice().sort((a, b) => a.ragione.localeCompare(b.ragione, 'it')).forEach(c => {
      const ord = ordiniDelCliente(c.id);
      h += `<li class="cliente" data-cerca="${esc([c.ragione, c.piva, c.indirizzo, c.comune, c.provincia, c.referente].join(' '))}">`;
      h += `<div class="cliente-testa"><strong>${esc(c.ragione)}</strong></div>`;   // comune e provincia sono nella riga dell'indirizzo
      // l'indirizzo in chiaro, e se la mappa l'ha trovato, il navigatore a un tocco
      const dove = [c.indirizzo, [c.comune, c.provincia].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      h += dove
        ? `<p class="cliente-indirizzo">${esc(dove)}`
          + (c.lat && c.lng ? ` · <a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener">Portami qui</a>` : '')
          + '</p>'
        : '<p class="cliente-indirizzo cliente-indirizzo-manca">Indirizzo da completare: tocca Modifica.</p>';
      h += '<p class="cliente-dati">';
      if (c.piva) h += `P.IVA ${esc(c.piva)} · `;
      if (c.referente) h += `${esc(c.referente)} · `;
      if (c.telefono) h += `<a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">${esc(c.telefono)}</a> · `;
      if (c.email) h += `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · `;
      if (c.cuccetta) h += `${esc(CUCCETTE[c.cuccetta] || c.cuccetta)} · `;
      if (c.capi) h += `${esc(c.capi)} capi · `;
      h += ord.length ? `${ord.length} ${ord.length === 1 ? 'ordine' : 'ordini'}, l’ultimo il ${esc(ord[0].data)}` : 'nessun ordine';
      h += '</p>';
      if (c.note) h += `<p class="cliente-note">${esc(c.note)}</p>`;
      if (validaCliente(c)) h += '<p class="sotto-minimo">Dati per la fattura da completare: tocca Modifica.</p>';
      h += '<div class="azioni">'
        + (ord.length ? `<button type="button" class="bottone" data-riordina="${esc(ord[0].id)}">Riordina come il ${esc(ord[0].data)}</button>` : '')
        + `<button type="button" class="bottone${ord.length ? ' bottone-fantasma' : ''}" data-ordina="${esc(c.id)}">Nuovo ordine</button>`
        + `<button type="button" class="bottone bottone-fantasma" data-modifica="${esc(c.id)}">Modifica</button></div>`;
      h += '</li>';
    });
    h += '</ul></div>';
    return h;
  }

  function agganciaClienti() {
    document.getElementById('cl-nuovo').addEventListener('click', () => moduloCliente(null));
    pannello().querySelectorAll('[data-modifica]').forEach(b =>
      b.addEventListener('click', () => moduloCliente(area.clienti.find(c => c.id === b.dataset.modifica))));
    pannello().querySelectorAll('[data-ordina]').forEach(b =>
      b.addEventListener('click', () => ordineDiretto(b.dataset.ordina)));
  }

  function moduloCliente(c) {
    const box = document.getElementById('cl-modulo');
    let h = `<form id="form-cliente" class="contatti cliente-modulo" novalidate><h4 class="pieno">${c ? 'Modifica cliente' : 'Nuovo cliente'}</h4>`;
    CAMPI_CLIENTE.forEach(f => { h += campoCliente(f, c ? c[f.id] : '', 'cl'); });
    h += '<div class="campo"><label for="cl-cuccetta">Tipo di cuccetta <span class="opzionale">facoltativo</span></label>'
      + '<select id="cl-cuccetta" name="cuccetta">'
      + Object.entries(CUCCETTE).map(([v, et]) => `<option value="${v}"${c && c.cuccetta === v ? ' selected' : ''}>${esc(et)}</option>`).join('')
      + '</select></div>';
    h += '<div class="campo pieno"><label for="cl-note">Note <span class="opzionale">facoltativo</span></label>'
      + `<textarea id="cl-note" name="note" rows="3">${esc(c ? c.note : '')}</textarea></div>`;
    h += '<p id="cl-errore" class="errore pieno" hidden></p>';
    h += '<div class="azioni pieno"><button type="submit" class="bottone">Salva</button>'
      + '<button type="button" class="bottone bottone-fantasma" id="cl-annulla">Annulla</button></div></form>';
    box.innerHTML = h;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('cl-annulla').addEventListener('click', () => { box.innerHTML = ''; });
    document.getElementById('form-cliente').addEventListener('submit', ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.currentTarget).entries());
      Object.keys(d).forEach(k => { d[k] = String(d[k]).trim(); });
      d.sdi = (d.sdi || '').toUpperCase();
      const err = document.getElementById('cl-errore');
      const manca = validaCliente(d);
      if (manca) { err.textContent = manca; err.hidden = false; return; }
      const b = ev.currentTarget.querySelector('button[type=submit]');
      b.disabled = true; b.textContent = 'Salvo…';
      // i campi vuoti diventano "niente"; venditore e date li mette il database
      const riga = {};
      Object.keys(d).forEach(k => { riga[k] = d[k] === '' ? null : d[k]; });
      if (riga.capi !== null) riga.capi = Math.max(0, Math.floor(Number(riga.capi) || 0));
      const q = c ? sb.from('clienti').update(riga).eq('id', c.id) : sb.from('clienti').insert(riga);
      q.then(({ error }) => {
        if (error) throw Object.assign(new Error(error.message), { delDatabase: error.code === 'P0001' });
        return ricarica();
      }).then(() => apri('clienti'))
        .catch(e => {
          b.disabled = false; b.textContent = 'Salva';
          err.textContent = e.delDatabase ? 'Non salvato: ' + e.message : 'Non sono riuscito a salvare: riprova tra poco.';
          err.hidden = false;
        });
    });
  }

  /* ----------------------------------------------------------------- ordini */

  function descriviPezzi(o) {
    const p = [];
    if (o.bigbag) p.push(`${o.bigbag} big bag`);
    if (o.sacchi) p.push(`${o.sacchi} bancali di sacchi`);
    if (o.ballette) p.push(`${o.ballette} ballette`);
    return p.join(' · ');
  }

  function importoOrdine(o) {
    return cond.ruolo === 'rivenditore' ? o.totaleRivenditore : o.totaleCliente;
  }

  function soldiOrdine(o) {
    return cond.ruolo === 'agente' ? o.provvigione : cond.ruolo === 'rivenditore' ? o.margine : null;
  }

  /* Gli ordini come schede, non come tabella: sul telefono una tabella di sei
     colonne non si legge (24/10/2026). Da ognuno si riordina con un tocco. */
  function disegnaOrdini() {
    let h = '<div class="blocco"><h3>I tuoi ordini</h3>';
    if (!area.ordini.length) {
      return h + '<p class="aiuto">Non hai ancora mandato ordini. Li trovi qui dal primo che invii.</p></div>';
    }
    h += '<p class="aiuto">Lo stato lo aggiorna Pro Farmer: inviato, confermato, consegnato, pagato.</p>';
    const etSoldi = cond.ruolo === 'agente' ? 'provvigione' : cond.ruolo === 'rivenditore' ? 'margine' : '';
    if (area.ordini.length > 5) h += casellaCerca('v-ordini', 'Cerca cliente o numero');
    h += '<ul class="lista-ordini" data-lista-di="v-ordini">';
    area.ordini.forEach(o => {
      h += `<li class="ordine${o.stato === 'annullato' ? ' annullato' : ''}" data-cerca="${esc([o.cliente, o.numero, STATI[o.stato]].join(' '))}">`
        + `<div class="ordine-testa"><strong>${esc(o.cliente || 'Il mio magazzino')}</strong>`
        + `<span class="stato stato-${esc(o.stato)}">${esc(STATI[o.stato] || o.stato)}</span></div>`
        + `<p class="ordine-pezzi">${esc(descriviPezzi(o))} · ${num(o.t, 1)} t${o.annuale ? ' · fornitura annuale' : ''}</p>`
        + `<p class="ordine-dati">${esc(o.data)} · n. ${esc(o.numero)} · ${cond.ruolo === 'rivenditore' ? 'paghi' : 'importo'} `
        + `<b>${euro(importoOrdine(o))}</b>`
        + (etSoldi ? ` · ${etSoldi} <b>${euro(soldiOrdine(o))}</b>` : '')
        + (o.liquidata ? ` · liquidata il ${esc(o.liquidata)}` : '') + '</p>'
        + `<button type="button" class="riordina-qui" data-riordina="${esc(o.id)}">Riordina</button></li>`;
    });
    h += '</ul></div>';
    return h;
  }

  /* ------------------------------------------------- provvigioni e margini */

  /* La regola, decisa nello script: maturata quando il cliente ha pagato,
     liquidata quando Pro Farmer ha scritto la data di liquidazione. */
  function disegnaSoldi() {
    const validi = area.ordini.filter(o => o.stato !== 'annullato');
    const quanto = o => cond.ruolo === 'interno' ? (importoOrdine(o) || 0) : (soldiOrdine(o) || 0);
    const somma = l => l.reduce((s, o) => s + quanto(o), 0);
    const liquidate = validi.filter(o => o.liquidata);
    const maturate = validi.filter(o => o.stato === 'pagato' && !o.liquidata);
    const inCorso = validi.filter(o => o.stato !== 'pagato' && !o.liquidata);

    let h = `<div class="blocco"><h3>${esc(nomeSoldi())}</h3>`;
    if (cond.ruolo === 'agente') {
      h += '<dl class="numeri soldi">'
        + cellaSoldi('In corso', somma(inCorso), `${inCorso.length} ${inCorso.length === 1 ? 'ordine' : 'ordini'} non ancora ${inCorso.length === 1 ? 'pagato' : 'pagati'} dal cliente`)
        + cellaSoldi('Maturate', somma(maturate), 'cliente ha pagato, da liquidare')
        + cellaSoldi('Liquidate', somma(liquidate), 'già pagate a te')
        + '</dl>';
      h += `<p class="aiuto">Le provvigioni maturano quando il cliente paga, e diventano liquidate quando Pro Farmer te le paga. `
        + 'Gli ordini annullati non contano.</p>';
    } else if (cond.ruolo === 'rivenditore') {
      h += '<p class="aiuto">Quanto hai acquistato da Pro Farmer e il margine che ti resta rivendendo a listino. '
        + 'È una stima: il margine vero dipende dal prezzo a cui rivendi. Gli ordini annullati non contano.</p>';
    }

    // per mese
    const mesi = {};
    validi.forEach(o => {
      const m = (o.data || '').slice(3); // MM/yyyy
      mesi[m] = mesi[m] || { ordini: 0, t: 0, importo: 0, soldi: 0, chiave: m.split('/').reverse().join('') };
      mesi[m].ordini += 1; mesi[m].t += o.t; mesi[m].importo += importoOrdine(o) || 0; mesi[m].soldi += soldiOrdine(o) || 0;
    });
    const elenco = Object.entries(mesi).sort((a, b) => b[1].chiave.localeCompare(a[1].chiave));
    if (!elenco.length) return h + '<p class="aiuto">Qui vedrai il rendiconto mese per mese dal primo ordine.</p></div>';
    h += '<div class="ordine-scorri"><table class="tabella ordine-conto"><thead><tr><th>Mese</th><th>Ordini</th>'
      + `<th>${cond.ruolo === 'rivenditore' ? 'Acquistato' : 'Venduto'}</th>`
      + (cond.ruolo === 'interno' ? '' : `<th>${cond.ruolo === 'rivenditore' ? 'Margine stimato' : esc(nomeSoldi())}</th>`) + '</tr></thead><tbody>';
    elenco.forEach(([m, x]) => {
      h += `<tr><th>${esc(m)}</th><td>${x.ordini}</td><td>${euro(x.importo)}</td>`
        + (cond.ruolo === 'interno' ? '' : `<td><strong>${euro(x.soldi)}</strong></td>`) + '</tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  function cellaSoldi(et, valore, sotto) {
    return `<div class="numero-cella"><dt>${esc(et)}</dt><dd>${euro(valore)}<small>${esc(sotto)}</small></dd></div>`;
  }

  /* -------------------------------------------------------------- materiali */

  function disegnaMateriali() {
    let h = '<div class="blocco"><h3>Materiali da mandare ai clienti</h3>';
    if (!area.materiali.length) return h + '<p class="aiuto">Per ora non ci sono materiali.</p></div>';
    h += '<ul class="lista-materiali">';
    area.materiali.forEach((m, i) => {
      h += `<li><strong>${esc(m.titolo)}</strong>${m.descrizione ? `<p>${esc(m.descrizione)}</p>` : ''}`
        + '<div class="azioni">'
        + `<a class="bottone" href="${esc(m.link)}" target="_blank" rel="noopener">Apri</a>`
        + `<a class="bottone bottone-whatsapp" href="https://wa.me/?text=${encodeURIComponent(m.titolo + ' — ' + m.link)}" target="_blank" rel="noopener">Manda su WhatsApp</a>`
        + `<button type="button" class="bottone bottone-fantasma" data-copia="${i}">Copia il link</button>`
        + '</div></li>';
    });
    h += '</ul></div>';
    return h;
  }

  function agganciaMateriali() {
    pannello().querySelectorAll('[data-copia]').forEach(b => b.addEventListener('click', () => {
      const m = area.materiali[Number(b.dataset.copia)];
      (navigator.clipboard ? navigator.clipboard.writeText(m.link) : Promise.reject())
        .then(() => { b.textContent = 'Copiato ✓'; })
        .catch(() => { b.textContent = m.link; });
    }));
  }

  /* ---------------------------------------------------------------- profilo */

  /* ------------------------------------------------------- la foto del profilo
     Dal 25/10/2026. Scatta o scegli dalla galleria: il telefono la ritaglia
     quadrata, la porta a 400×400 e la ricodifica in JPEG (così spariscono i
     dati nascosti dello scatto, GPS compreso), poi la carica nella cartella
     del venditore su Supabase Storage. Vedi 14-foto-profilo.sql. */
  const FOTO_LATO = 400;

  function avatar(classe) {
    const f = area && area.profilo && area.profilo.foto;
    return f
      ? `<img class="${classe} account-foto" src="${esc(f)}" alt="" width="46" height="46">`
      : `<span class="${classe}" aria-hidden="true">${esc(iniziali(cond.nome))}</span>`;
  }

  function bloccoFoto() {
    const ha = !!area.profilo.foto;
    return '<div class="blocco blocco-foto"><h3>La tua foto</h3><div class="foto-riga">'
      + avatar('foto-grande')
      + '<div class="foto-azioni">'
      + '<label class="bottone foto-bottone"><input type="file" accept="image/*" capture="user" id="f-scatta" hidden>Scatta una foto</label>'
      + '<label class="bottone bottone-fantasma foto-bottone"><input type="file" accept="image/*" id="f-galleria" hidden>Scegli dalla galleria</label>'
      + (ha ? '<button type="button" class="foto-togli" id="f-togli">Togli la foto</button>' : '')
      + '</div></div><p class="aiuto" id="f-stato">La vedono Pro Farmer e, accanto al tuo nome, chi lavora con te nell’app.</p></div>';
  }

  // la foto dal file: ritaglio quadrato al centro, 400×400, JPEG
  function preparaFoto(file) {
    const dalFile = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
      : Promise.reject(new Error('vecchio'));
    const conImmagine = () => new Promise((ok, ko) => {
      const img = new Image(); const u = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(u); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(u); ko(new Error('formato')); };
      img.src = u;
    });
    return dalFile.catch(conImmagine).then(img => {
      const w = img.width, h = img.height, lato = Math.min(w, h);
      const c = document.createElement('canvas'); c.width = c.height = FOTO_LATO;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (w - lato) / 2, (h - lato) / 2, lato, lato, 0, 0, FOTO_LATO, FOTO_LATO);
      return new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error('formato')), 'image/jpeg', 0.86));
    });
  }

  function agganciaFoto() {
    const stato = document.getElementById('f-stato');
    if (!stato) return;
    const dopo = (testo) => { aggiorna(); apri('profilo'); const s2 = document.getElementById('f-stato'); if (s2) { s2.textContent = testo; s2.classList.add('foto-ok'); } };
    const carica = file => {
      if (!file) return;
      if (navigator.onLine === false) { stato.textContent = 'Sei senza rete: riprova quando torna il segnale.'; return; }
      stato.textContent = 'Preparo la foto…'; stato.classList.remove('foto-ok');
      preparaFoto(file).then(blob => {
        stato.textContent = 'Carico la foto…';
        return collegamento().auth.getUser().then(() => rpc('mio_id')).then(mio => {
          const percorso = `${mio}/profilo.jpg`;
          return collegamento().storage.from('foto-profilo').upload(percorso, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' })
            .then(({ error }) => {
              if (error) throw error;
              const url = collegamento().storage.from('foto-profilo').getPublicUrl(percorso).data.publicUrl + '?t=' + Date.now();
              return rpc('salva_foto', { indirizzo: url }).then(() => url);
            });
        });
      }).then(url => { area.profilo.foto = url; dopo('✓ Foto salvata.'); })
        .catch(e => {
          stato.textContent = /formato/.test(String(e && e.message))
            ? 'Questa immagine non si apre: scegli una foto JPEG o PNG.'
            : 'La foto non è stata salvata: riprova tra poco.';
        });
    };
    ['f-scatta', 'f-galleria'].forEach(id => {
      const i = document.getElementById(id);
      if (i) i.addEventListener('change', () => { carica(i.files && i.files[0]); i.value = ''; });
    });
    const togli = document.getElementById('f-togli');
    if (togli) togli.addEventListener('click', () => {
      if (!confirm('Tolgo la tua foto? Tornano le iniziali.')) return;
      rpc('mio_id').then(mio => collegamento().storage.from('foto-profilo').remove([`${mio}/profilo.jpg`]))
        .then(() => rpc('salva_foto', { indirizzo: null }))
        .then(() => { area.profilo.foto = null; dopo('Foto tolta.'); })
        .catch(() => { stato.textContent = 'Non sono riuscito a toglierla: riprova tra poco.'; });
    });
  }

  function disegnaProfilo() {
    const p = area.profilo;
    let h = bloccoFoto() + (cond.ruolo === 'agente' ? legendaDiamanti() : '')
      + '<div class="blocco"><h3>Il tuo profilo</h3><table class="tabella profilo"><tbody>';
    h += `<tr><th>Nome</th><td>${esc(p.nome)}</td></tr>`;
    h += `<tr><th>Ruolo</th><td>${esc(RUOLI[p.ruolo] || p.ruolo)}</td></tr>`;
    h += `<tr><th>E-mail</th><td>${p.email ? esc(p.email) : 'non registrata: chiedila a Pro Farmer, così ricevi copia dei tuoi ordini'}</td></tr>`;
    h += '</tbody></table></div>';

    h += '<div class="blocco"><h3>Le tue condizioni</h3><table class="tabella profilo"><tbody>';
    const L = cond.listinoT;
    if (cond.ruolo === 'agente') {
      h += `<tr><th>piùLact, big bag</th><td>listino ${euro(L.bigbag)}/t · provvigione ${perc(cond.piulact.provvigione)}</td></tr>`;
      h += `<tr><th>piùLact, sacchi</th><td>listino ${euro(L.sacchi)}/t · provvigione ${perc(cond.piulact.provvigione)}</td></tr>`;
      h += `<tr><th>piùLact Pronto, ballette</th><td>listino ${euro(L.ballette / 10)}/q · provvigione ${perc(cond.ballette.provvigione.standard)}, `
        + `${perc(cond.ballette.provvigione.annuale)} con fornitura annuale</td></tr>`;
      h += '<tr><th>Su cosa</th><td>Solo sulle tue vendite dirette al cliente finale.</td></tr>';
    } else if (cond.ruolo === 'rivenditore') {
      h += `<tr><th>piùLact, big bag</th><td>paghi ${euro(cond.piulact.bigbag)}/t · listino ${euro(L.bigbag)}/t</td></tr>`;
      h += `<tr><th>piùLact, sacchi</th><td>paghi ${euro(cond.piulact.sacchi)}/t · listino ${euro(L.sacchi)}/t</td></tr>`;
      h += `<tr><th>piùLact Pronto, ballette</th><td>sconto ${perc(cond.ballette.sconto.standard)} sul listino di ${euro(L.ballette / 10)}/q, `
        + `${perc(cond.ballette.sconto.annuale)} con fornitura annuale</td></tr>`;
    } else {
      h += `<tr><th>Listini</th><td>big bag ${euro(L.bigbag)}/t · sacchi ${euro(L.sacchi)}/t · ballette ${euro(L.ballette / 10)}/q</td></tr>`;
    }
    h += `<tr><th>Ordine minimo</th><td>${cond.minimi.bigbag} big bag · ${cond.minimi.sacchi} bancali · ${cond.minimi.ballette} ballette</td></tr>`;
    if (cond.validoFino) h += `<tr><th>Valide fino al</th><td>${esc(cond.validoFino)}</td></tr>`;
    h += '</tbody></table><p class="aiuto">Prezzi franco partenza, IVA esclusa.</p></div>';

    h += '<div class="blocco"><h3>Come si lavora</h3><ol class="passi">'
      + '<li><strong>Nuovo ordine</strong>: scegli il cliente e le quantità. Per un cliente che riordina, tocca il suo nome sotto <strong>Riordina</strong>: le quantità sono già quelle dell’ultima volta.</li>'
      + '<li>Per un allevamento nuovo, <strong>Calcola una stalla</strong>: prodotto, dose e quantità sono pronti, e sotto c’è già l’ordine da mandare.</li>'
      + '<li>Pro Farmer conferma e aggiorna lo stato: lo segui in <strong>Ordini</strong>, e in <strong>' + esc(nomeSoldi()) + '</strong> vedi quanto hai maturato.</li>'
      + '</ol></div>';

    h += bloccoNotifiche();

    h += '<div class="blocco"><h3>Pro Farmer</h3><p>'
      + `<a href="mailto:${PRO_FARMER.email}">${PRO_FARMER.email}</a> · <a href="tel:${PRO_FARMER.tel}">${PRO_FARMER.telefono}</a>`
      + '</p>'
      // richiesto dagli store (Apple 5.1.1): una via per chiedere la cancellazione dell'account
      + `<p class="aiuto"><a href="mailto:${PRO_FARMER.email}?subject=${encodeURIComponent('Cancellazione account Riposa Pro')}`
      + `&body=${encodeURIComponent('Chiedo la cancellazione del mio account Riposa Pro: ' + (area.profilo.email || ''))}">`
      + 'Chiedi la cancellazione del tuo account</a>: Pro Farmer chiude l’accesso e cancella i tuoi dati, salvo quelli che la legge chiede di tenere (gli ordini fatturati).</p>'
      + '</div>';
    return h;
  }

  /* --------------------------------------------------- le quantità proposte */

  /* Le stesse regole del consiglio sul trasporto (TRASPORTO in regole.js):
     ballette sul mese a bancali interi, piùLact sul trimestre, mai sotto il minimo. */
  function pezziDaCalcolo(r) {
    const scelto = (r.premium || []).find(a => a.idScenario === premiumScelto);
    const x = scelto || r;
    const T = TRASPORTO;
    const q = { bigbag: '', sacchi: '', ballette: '' };
    const c = x.confezioneConsigliata;
    if (!c || !x.kgMese) return q;
    if (c.kg === T.ballettaKg) {
      const servono = Math.ceil(x.kgMese * T.mesiOrizzonteBallette / T.ballettaKg);
      q.ballette = Math.max(T.balletteMinimo, Math.ceil(servono / T.ballettePerBancale) * T.ballettePerBancale);
    } else if (c.kg === T.bigBagKg) {
      q.bigbag = Math.max(T.bigBagMinimo, Math.ceil(x.kgMese * T.mesiOrizzonte / T.bigBagKg));
    } else {
      q.sacchi = Math.max(T.bancaliMinimo, Math.ceil(x.kgMese * T.mesiOrizzonte / T.bancaleKg));
    }
    return q;
  }

  /* --------------------------------------------------------- l'ordine */

  function mostraOrdine(r) {
    ultimoCalcolo = r;
    if (r) {
      const nuovi = pezziDaCalcolo(r);
      // le quantità del calcolo prendono il posto delle vecchie solo se il
      // venditore non le aveva toccate
      const toccate = suggeriti && VOCI.some(v => String(stato[v.id]) !== String(suggeriti[v.id]));
      if (!toccate) VOCI.forEach(v => { stato[v.id] = nuovi[v.id]; });
      suggeriti = nuovi;
    }

    const rivend = cond.ruolo === 'rivenditore';
    let h = '<div class="blocco venditori-ordine" id="blocco-ordine">';
    h += '<h3>L’ordine</h3>';
    h += '<form id="form-ordine" novalidate>';

    /* Una riga per prodotto (24/10/2026): a sinistra cosa e in che formato,
       a destra quante, con − e + e l'unità di misura scritta accanto. */
    h += '<div class="righe-ordine">';
    VOCI.forEach(v => {
      const min = cond.minimi && cond.minimi[v.id];
      h += `<div class="riga-ordine"><p class="riga-cosa"><strong>${esc(v.prodotto)}</strong> · ${esc(v.formato)}</p>`
        + `<p class="riga-minimo">${min ? `Minimo ${min} ${esc(min === 1 ? v.una : v.unita)}` : ''}</p>`
        + `<div class="contatore"><button type="button" class="contatore-passo" data-passo="-1" data-voce="${v.id}" aria-label="Un ${esc(v.una)} in meno">−</button>`
        + `<label class="contatore-campo"><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" `
        + `name="${v.id}" value="${esc(stato[v.id])}" aria-label="${esc(v.unita)} di ${esc(v.prodotto)}">`
        + `<span>${esc(v.unita)}</span></label>`
        + `<button type="button" class="contatore-passo" data-passo="1" data-voce="${v.id}" aria-label="Un ${esc(v.una)} in più">+</button></div></div>`;
    });
    h += '</div>';

    if (cond.ruolo !== 'interno') {
      h += '<label class="spunta-riga"><input type="checkbox" name="annuale"' + (stato.annuale ? ' checked' : '') + '>'
        + '<span>Fornitura annuale a condizioni bloccate<small>Vale solo per le ballette.</small></span></label>';
    }

    h += '<div id="ordine-conto"></div>';

    h += `<h3 style="margin-top:22px">${rivend ? 'Per chi è' : 'Il cliente'}</h3>`;
    h += '<div class="campo"><label for="o-scegli">Dalla tua lista</label><select id="o-scegli" name="clienteId">'
      + `<option value="">${rivend ? 'Per il mio magazzino, o un cliente nuovo' : 'Cliente nuovo: lo scrivo qui sotto'}</option>`
      + area.clienti.slice().sort((a, b) => a.ragione.localeCompare(b.ragione, 'it'))
          .map(c => `<option value="${esc(c.id)}"${stato.clienteId === c.id ? ' selected' : ''}>${esc(c.ragione)}${c.comune ? ' — ' + esc(c.comune) : ''}</option>`).join('')
      + '</select></div>';
    h += `<div id="o-nuovo"${stato.clienteId ? ' hidden' : ''}>`;
    if (rivend) h += '<p class="aiuto">Se l’ordine è per il tuo magazzino lascia vuoti i dati del cliente.</p>';
    h += '<div class="contatti">';
    CAMPI_ORDINE.forEach(id => { h += campoCliente(CAMPI_CLIENTE.find(f => f.id === id), stato[id], 'o'); });
    h += '</div><p class="aiuto">Un cliente nuovo entra da solo nella tua lista quando mandi l’ordine.</p></div>';
    h += '<div class="campo pieno"><label for="o-note">Note <span class="opzionale">facoltativo</span></label>'
      + `<textarea id="o-note" name="note" rows="3">${esc(stato.note || '')}</textarea></div>`;

    h += '<p id="ordine-errore" class="errore" hidden></p>';
    h += '<div class="azioni"><button type="submit" class="bottone">Manda l’ordine a Pro Farmer</button></div>';
    h += '<p class="aiuto aiuto-centro">L’ordine arriva a Pro Farmer per e-mail, che te lo conferma.</p>';
    h += '</form></div>';

    boxRis.insertAdjacentHTML('beforeend', h);

    const f = document.getElementById('form-ordine');
    f.addEventListener('input', () => { leggiStato(f); disegnaConto(); });
    f.addEventListener('change', () => {
      leggiStato(f);
      document.getElementById('o-nuovo').hidden = !!stato.clienteId;
      disegnaConto();
    });
    f.addEventListener('submit', ev => { ev.preventDefault(); invia(f); });
    // − e +: cambiano la quantità di uno, mai sotto zero, e rifanno il conto
    f.querySelectorAll('[data-passo]').forEach(b => b.addEventListener('click', () => {
      const campo = f.elements[b.dataset.voce];
      const n = Math.max(0, (parseInt(campo.value, 10) || 0) + Number(b.dataset.passo));
      campo.value = n ? String(n) : '';
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    disegnaConto();
  }

  function leggiStato(f) {
    const d = new FormData(f);
    VOCI.forEach(v => { stato[v.id] = d.get(v.id) || ''; });
    CAMPI_ORDINE.concat(['note', 'clienteId']).forEach(k => { stato[k] = (d.get(k) || '').trim(); });
    stato.sdi = stato.sdi.toUpperCase();
    stato.annuale = d.get('annuale') === 'on';
  }

  function righeOrdine() {
    return VOCI.map(v => ({ voce: v.id, pezzi: stato[v.id] }));
  }

  function disegnaConto() {
    const box = document.getElementById('ordine-conto');
    if (!box) return;
    const conto = contoOrdine(cond, righeOrdine(), { annuale: stato.annuale });
    if (!conto.righe.length) {
      box.innerHTML = '<p class="aiuto">Indica almeno una quantità.</p>';
      return;
    }
    const ruolo = cond.ruolo;
    const nomi = { bigbag: 'piùLact big bag', sacchi: 'piùLact sacchi', ballette: 'piùLact Pronto' };
    let h = '<div class="ordine-scorri"><table class="tabella ordine-conto"><thead><tr><th>Voce</th><th>t</th>';
    if (ruolo === 'rivenditore') h += '<th>Paghi</th><th>Rivendi</th><th>Margine</th>';
    else if (ruolo === 'agente') h += '<th>Il cliente paga</th><th>Provvigione</th>';
    else h += '<th>Il cliente paga</th>';
    h += '</tr></thead><tbody>';
    conto.righe.forEach(r => {
      h += `<tr><th>${esc(nomi[r.voce])}${r.sottoMinimo ? ' <span class="sotto-minimo">sotto il minimo di ' + cond.minimi[r.voce] + '</span>' : ''}</th>`;
      h += `<td>${num(r.t, 1)}</td>`;
      if (ruolo === 'rivenditore') {
        h += `<td>${euro(r.acquisto)}<small>${r.acquistoT == null ? '' : euro(r.acquistoT) + '/t'}</small></td>`
          + `<td>${euro(r.listino)}<small>${euro(r.listinoT)}/t</small></td><td><strong>${euro(r.margine)}</strong></td>`;
      } else if (ruolo === 'agente') {
        h += `<td>${euro(r.cliente)}<small>${euro(r.clienteT)}/t</small></td>`
          + `<td><strong>${euro(r.provvigione)}</strong><small>${r.percProvvigione == null ? '' : num(r.percProvvigione * 100) + '%'}</small></td>`;
      } else {
        h += `<td>${euro(r.cliente)}<small>${euro(r.clienteT)}/t</small></td>`;
      }
      h += '</tr>';
    });
    const t = conto.totale;
    h += `<tr class="totale"><th>Totale</th><td>${num(t.t, 1)}</td>`;
    if (ruolo === 'rivenditore') h += `<td>${euro(t.acquisto)}</td><td>${euro(t.listino)}</td><td><strong>${euro(t.margine)}</strong></td>`;
    else if (ruolo === 'agente') h += `<td>${euro(t.cliente)}</td><td><strong>${euro(t.provvigione)}</strong></td>`;
    else h += `<td>${euro(t.cliente)}</td>`;
    h += '</tr></tbody></table></div>';
    if (t.daDefinire) {
      h += '<p class="aiuto">Per qualche voce le tue condizioni non sono ancora inserite: il conto lo completa Pro Farmer.</p>';
    }
    // le condizioni del conto, sotto le cifre a cui si riferiscono
    h += '<ul class="note-conto"><li>Prezzi franco partenza, IVA esclusa.</li>'
      + (conto.righe.some(r => r.voce === 'ballette')
        ? '<li>Ballette: importo stimato su 850 kg a balletta; si fattura il peso reale.</li>' : '')
      + '</ul>';
    box.innerHTML = h;
  }

  function invia(f) {
    leggiStato(f);
    const err = document.getElementById('ordine-errore');
    const conto = contoOrdine(cond, righeOrdine(), stato);
    const errore = t => { err.textContent = t; err.hidden = false; };
    const scelto = stato.clienteId && area.clienti.find(c => c.id === stato.clienteId);
    if (!conto.righe.length) return errore('Indica almeno una quantità.');
    // il rivenditore che ordina per il magazzino non indica un cliente: è l'unico caso
    const perMagazzino = cond.ruolo === 'rivenditore' && !scelto && !CAMPI_ORDINE.some(k => stato[k]);
    if (!perMagazzino) {
      if (scelto && validaCliente(scelto)) {
        return errore('A questo cliente mancano dati per la fattura (P.IVA, PEC o codice univoco, telefono). '
          + 'Completali in Clienti → Modifica, poi manda l’ordine.');
      }
      if (!scelto) {
        const manca = validaCliente(stato);
        if (manca) return errore(manca);
      }
    }
    err.hidden = true;

    const p = {};
    VOCI.forEach(v => { if (Number(stato[v.id]) > 0) p[v.id] = Math.floor(Number(stato[v.id])); });
    if (scelto) p.clienteId = scelto.id;
    else if (!perMagazzino) CAMPI_ORDINE.forEach(k => { if (stato[k]) p[k] = stato[k]; });
    if (stato.note) p.note = stato.note;
    if (stato.annuale) p.annuale = true;
    const chi = scelto ? scelto.ragione : (stato.ragione || cond.nome);
    if (ultimoCalcolo) p.calcolo = testoRiepilogo({ azienda: chi }, ultimoCalcolo);

    const bottone = f.querySelector('button[type=submit]');
    bottone.disabled = true;
    bottone.textContent = 'Invio in corso…';
    rpc('invia_ordine', { p }).then(r => {
      const box = document.getElementById('blocco-ordine');
      box.innerHTML = '<div class="trovato ordine-partito"><span class="trovato-spunta" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>'
        + `<h2>Ordine inviato a Pro Farmer</h2><p>Numero <strong>${esc(r.numero)}</strong>. `
        + (r.copia ? 'Te ne arriva una copia per e-mail. ' : '')
        + 'Pro Farmer ti ricontatta per la conferma e la consegna. Lo trovi in <strong>Ordini</strong>.</p>'
        + '<div class="azioni"><button type="button" class="bottone bottone-fantasma" id="v-nuovo">Nuovo calcolo</button>'
        + '<button type="button" class="bottone bottone-fantasma" id="v-vedi">Vedi i miei ordini</button></div></div>';
      stato = statoVuoto();
      suggeriti = null;
      ricarica().then(disegnaBarra);
      document.getElementById('v-nuovo').addEventListener('click', () => {
        boxRis.innerHTML = '';
        modulo.reset();
        apri('calcolo');   // anche dopo un ordine diretto: torna il calcolatore
      });
      document.getElementById('v-vedi').addEventListener('click', () => {
        ricarica().then(() => apri('ordini'));
      });
    }).catch(e => {
      bottone.disabled = false;
      bottone.textContent = 'Manda l’ordine a Pro Farmer';
      errore(e.delDatabase ? e.message
        : navigator.onLine === false
          ? 'Sei senza rete: l’ordine non è partito. I dati restano qui: premi di nuovo quando torna il segnale.'
          : 'L’ordine non è partito: riprova tra poco. Se continua, chiama Pro Farmer.');
    });
  }

  /* ------------------------------------------------------------------ avvio */

  function avvia() {
    const c = collegamento();
    // chi aveva il vecchio codice personale rientra con l'e-mail
    let vecchio = false;
    try { vecchio = !!(localStorage.getItem(CHIAVE_VECCHIA) || sessionStorage.getItem(CHIAVE_VECCHIA)); } catch (e) {}
    if (vecchio) togliCodiceVecchio();
    if (!c) { if (PRO || location.hash === '#venditori') mostraAccesso(); return; }
    c.auth.getSession().then(({ data }) => {
      const dentro = !!(data && data.session);
      // nell'area si parte sempre dall'alto: niente posizione rimessa dal browser
      if (PRO || dentro || vecchio || location.hash === '#venditori') {
        try { history.scrollRestoration = 'manual'; } catch (e) {}
      }
      if (dentro) {
        document.body.classList.add('in-area-venditori');
        barra().innerHTML = '<p class="aiuto">Rientro nella tua area…</p>';
        caricaArea();
      } else if (vecchio) {
        mostraAccesso('Da novembre si entra con la tua e-mail: scrivila qui e ti mandiamo un codice di 6 cifre. Il vecchio codice personale non serve più.');
      } else if (PRO || location.hash === '#venditori') {
        mostraAccesso();
      }
    });
  }
  window.addEventListener('hashchange', () => { if (location.hash === '#venditori' && !cond) mostraAccesso(); });

  return {
    avvia,
    attivo: () => !!cond,
    mostraOrdine,
    contoOrdine   // esposto per i collaudi
  };
})();

Venditori.avvia();
