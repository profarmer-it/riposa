/* ============================================================================
   Riposa — AREA VENDITORI
   ----------------------------------------------------------------------------
   Agenti, rivenditori e commerciali Pro Farmer entrano con la loro e-mail e
   un codice di 6 cifre che arriva per e-mail (riposa.profarmer.it/#venditori)
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
  const CHIAVE_VECCHIA = 'riposa-codice';   // il codice personale di prima di novembre 2026
  let sb = null;            // il collegamento a Supabase
  let emailAccesso = '';    // l'e-mail a cui è stato mandato il codice
  let cond = null;          // le condizioni di chi è entrato
  let area = null;          // profilo, clienti, ordini, materiali (dallo script)
  let scheda = 'home';      // la sezione aperta: 'home' è "La mia area"
  let ultimoCalcolo = null; // il risultato del calcolatore, se c'è
  // quello che il venditore ha scritto nel modulo d'ordine: sopravvive ai
  // ridisegni del risultato (per esempio quando sceglie l'alternativa)
  let stato = statoVuoto();
  let suggeriti = null;     // le quantità proposte dal calcolo, per capire se le ha cambiate

  const RUOLI = { agente: 'agente', rivenditore: 'rivenditore', interno: 'Pro Farmer' };
  const VOCI = [
    { id: 'bigbag',   nome: 'piùLact, big bag da 600 kg',        unita: 'big bag' },
    { id: 'sacchi',   nome: 'piùLact, bancali di sacchi da 25 kg (1,2 t)', unita: 'bancali' },
    { id: 'ballette', nome: 'piùLact Pronto, ballette da circa 850 kg', unita: 'ballette' }
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
    { id: 'indirizzo', etichetta: 'Indirizzo di consegna' },
    { id: 'comune', etichetta: 'Comune' },
    { id: 'provincia', etichetta: 'Provincia' },
    { id: 'capi', etichetta: 'Capi in lattazione', tipo: 'number' }
  ];
  /* Nel modulo d'ordine, per un cliente nuovo, servono solo questi. */
  const CAMPI_ORDINE = ['ragione', 'piva', 'pec', 'sdi', 'telefono', 'indirizzo', 'email', 'provincia'];

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
      + '<p class="soprattitolo">Riposa · area venditori</p>'
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
      + '<p class="accesso-piede"><a href="./" id="v-al-calcolatore">← Torna al calcolatore per l’allevatore</a></p>'
      + '</div>';
    const riprova = document.getElementById('v-riprova');
    if (riprova) riprova.addEventListener('click', () => caricaArea());
    document.getElementById('v-al-calcolatore').addEventListener('click', ev => {
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
    el.innerHTML = '<div class="accesso">'
      + '<p class="soprattitolo">Riposa · area venditori</p>'
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
      document.body.classList.remove('accesso-venditori');
      document.body.classList.add('in-area-venditori');
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
    return rpc('area').then(r => { if (r && r.ok) ricevi(r); });
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
      + `<span class="account-iniziali" aria-hidden="true">${esc(iniziali(cond.nome))}</span>`
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
    const tessere = [
      ['calcolo', 'Nuovo calcolo', 'Calcola la stalla e prepara l’ordine', true],
      ['diretto', 'Ordine diretto', 'Sai già cosa serve al cliente', false],
      ['clienti', 'Clienti', nC ? `${nC} ${nC === 1 ? 'cliente' : 'clienti'}` : 'Aggiungi il primo', false],
      ['ordini', 'Ordini', nO ? `${nO} ${nO === 1 ? 'ordine' : 'ordini'} · l’ultimo il ${ultimo.data}` : 'Ancora nessun ordine', false],
      ['soldi', nomeSoldi(), soldi, false],
      ['materiali', 'Materiali', nM ? `${nM} ${nM === 1 ? 'documento' : 'documenti'} da mandare ai clienti` : 'Per ora nessuno', false],
      ['profilo', 'Profilo', 'Le tue condizioni e i contatti Pro Farmer', false]
    ];
    // Pro Farmer gestisce da qui ordini, venditori, condizioni e materiali
    if (cond.ruolo === 'interno') tessere.splice(1, 0, ['gestione', 'Gestione Pro Farmer', 'Ordini di tutti, venditori, condizioni, materiali', false]);
    let h = '<h2 class="area-titolo">La mia area</h2>';
    if (cond.daAggiornare) {
      h += '<div class="avviso"><span class="avviso-icona">⚠</span><span>Promemoria: le tue condizioni su piùLact '
        + `erano valide fino al ${esc(cond.validoFino)} e sono da aggiornare con Pro Farmer. Intanto restano quelle.</span></div>`;
    }
    h += riquadroInstalla();
    h += '<div class="tessere">';
    tessere.forEach(([id, titolo, sotto, primaria]) => {
      h += `<button type="button" class="tessera${primaria ? ' tessera-primaria' : ''}" data-apri="${id}">`
        + icona(id) + `<strong>${esc(titolo)}</strong><span>${esc(sotto)}</span></button>`;
    });
    h += '</div>';
    return h;
  }

  function apri(id) {
    if (id === 'diretto') return ordineDiretto();
    scheda = id;
    disegnaBarra();
    const calc = id === 'calcolo';
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
          + '<button type="button" class="bottone bottone-fantasma" id="v-diretto">Ordine diretto</button></div>');
        document.getElementById('v-diretto').addEventListener('click', () => ordineDiretto());
      }
      return;
    }
    if (id === 'gestione') {
      if (typeof ProFarmer !== 'undefined') ProFarmer.disegna(p, sb);
      return;
    }
    const disegna = { home: disegnaHome, clienti: disegnaClienti, ordini: disegnaOrdini, soldi: disegnaSoldi,
                      materiali: disegnaMateriali, profilo: disegnaProfilo }[id];
    p.innerHTML = disegna();
    if (id === 'home') {
      agganciaInstalla();
      p.querySelectorAll('[data-apri]').forEach(b => b.addEventListener('click', () => apri(b.dataset.apri)));
    }
    if (id === 'clienti') agganciaClienti();
    if (id === 'materiali') agganciaMateriali();
  }

  function ordineDiretto(clienteId) {
    ultimoCalcolo = null;
    suggeriti = null;
    if (clienteId !== undefined) stato.clienteId = clienteId;
    apri('calcolo');
    boxRis.innerHTML = '';
    boxRis.hidden = false;
    mostraOrdine(null);
    boxRis.scrollIntoView({ block: 'start' });
  }

  function esci() {
    if (sb) sb.auth.signOut();   // anche senza rete: la sessione sul telefono si cancella comunque
    cond = null;
    area = null;
    scheda = 'home';
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
  }

  /* ---------------------------------------------------------------- clienti */

  function ordiniDelCliente(id) {
    return area.ordini.filter(o => o.clienteId === id && o.stato !== 'annullato');
  }

  function disegnaClienti() {
    let h = '<div class="blocco"><div class="pannello-testa"><h3>I tuoi clienti</h3>'
      + '<button type="button" class="bottone" id="cl-nuovo">Aggiungi cliente</button></div>';
    h += '<div id="cl-modulo"></div>';
    if (!area.clienti.length) {
      h += '<p class="aiuto">Non hai ancora clienti. Aggiungili qui, oppure si aggiungono da soli quando mandi un ordine '
        + 'con un cliente nuovo.</p>';
    }
    h += '<ul class="lista-clienti">';
    area.clienti.slice().sort((a, b) => a.ragione.localeCompare(b.ragione, 'it')).forEach(c => {
      const ord = ordiniDelCliente(c.id);
      const luogo = [c.comune, c.provincia].filter(Boolean).join(' · ');
      h += '<li class="cliente">';
      h += `<div class="cliente-testa"><strong>${esc(c.ragione)}</strong>${luogo ? `<span>${esc(luogo)}</span>` : ''}</div>`;
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
        + `<button type="button" class="bottone" data-ordina="${esc(c.id)}">Nuovo ordine</button>`
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

  function disegnaOrdini() {
    let h = '<div class="blocco"><h3>I tuoi ordini</h3>';
    if (!area.ordini.length) {
      return h + '<p class="aiuto">Non hai ancora mandato ordini. Li trovi qui dal primo che invii.</p></div>';
    }
    h += '<p class="aiuto">Lo stato lo aggiorna Pro Farmer: inviato, confermato, consegnato, pagato.</p>';
    h += '<div class="ordine-scorri"><table class="tabella ordini-storico"><thead><tr><th>Data</th><th>Cliente</th><th>t</th>'
      + `<th>${cond.ruolo === 'rivenditore' ? 'Paghi' : 'Importo'}</th>`
      + (cond.ruolo === 'interno' ? '' : `<th>${cond.ruolo === 'agente' ? 'Provvigione' : 'Margine'}</th>`)
      + '<th>Stato</th></tr></thead><tbody>';
    area.ordini.forEach(o => {
      h += `<tr${o.stato === 'annullato' ? ' class="annullato"' : ''}><th>${esc(o.data)}<small>n. ${esc(o.numero)}</small></th>`
        + `<td>${esc(o.cliente || '—')}<small>${esc(descriviPezzi(o))}${o.annuale ? ' · fornitura annuale' : ''}</small></td>`
        + `<td>${num(o.t, 1)}</td><td>${euro(importoOrdine(o))}</td>`
        + (cond.ruolo === 'interno' ? '' : `<td>${euro(soldiOrdine(o))}</td>`)
        + `<td><span class="stato stato-${esc(o.stato)}">${esc(STATI[o.stato] || o.stato)}</span></td></tr>`;
    });
    h += '</tbody></table></div></div>';
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

  function disegnaProfilo() {
    const p = area.profilo;
    let h = '<div class="blocco"><h3>Il tuo profilo</h3><table class="tabella profilo"><tbody>';
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
      + '<li>In stalla, apri <strong>Calcolo e ordine</strong>, compila la stalla del cliente e premi Calcola: prodotto, dose e quantità sono pronti.</li>'
      + '<li>Sotto il risultato scegli il cliente dalla tua lista (o scrivine uno nuovo) e manda l’ordine: arriva a Pro Farmer.</li>'
      + '<li>Pro Farmer conferma e aggiorna lo stato: lo segui in <strong>Ordini</strong>, e in <strong>' + esc(nomeSoldi()) + '</strong> vedi quanto hai maturato.</li>'
      + '</ol></div>';

    h += '<div class="blocco"><h3>Pro Farmer</h3><p>'
      + `<a href="mailto:${PRO_FARMER.email}">${PRO_FARMER.email}</a> · <a href="tel:${PRO_FARMER.tel}">${PRO_FARMER.telefono}</a>`
      + '</p></div>';
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

    h += '<table class="tabella ordine-righe"><tbody>';
    VOCI.forEach(v => {
      h += `<tr><th>${esc(v.nome)}</th><td><input type="number" min="0" step="1" inputmode="numeric" `
        + `name="${v.id}" value="${esc(stato[v.id])}" aria-label="${esc(v.unita)}"> ${esc(v.unita)}</td></tr>`;
    });
    h += '</tbody></table>';

    if (cond.ruolo !== 'interno') {
      h += '<label class="spunta"><input type="checkbox" name="annuale"' + (stato.annuale ? ' checked' : '') + '>'
        + '<span>Fornitura annuale a condizioni bloccate <small>(solo ballette)</small></span></label>';
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
    h += '<p class="aiuto">Prezzi franco partenza, IVA esclusa. Ballette: importo stimato su 850 kg a balletta, '
      + 'si fattura il peso reale. L’ordine arriva a Pro Farmer per e-mail, che lo conferma.</p>';
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
      box.innerHTML = '<div class="trovato"><span class="trovato-spunta">✓</span>'
        + `<h2>Ordine inviato a Pro Farmer</h2><p>Numero <strong>${esc(r.numero)}</strong>. `
        + (r.copia ? 'Te ne arriva una copia per e-mail. ' : '')
        + 'Pro Farmer ti ricontatta per la conferma e la consegna. Lo trovi in <strong>Ordini</strong>.</p>'
        + '<div class="azioni"><button type="button" class="bottone bottone-fantasma" id="v-nuovo">Nuovo calcolo</button>'
        + '<button type="button" class="bottone bottone-fantasma" id="v-vedi">Vedi i miei ordini</button></div></div>';
      stato = statoVuoto();
      suggeriti = null;
      ricarica().then(disegnaBarra);
      document.getElementById('v-nuovo').addEventListener('click', () => {
        boxRis.hidden = true;
        boxRis.innerHTML = '';
        modulo.reset();
        modulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (!c) { if (location.hash === '#venditori') mostraAccesso(); return; }
    c.auth.getSession().then(({ data }) => {
      const dentro = !!(data && data.session);
      // nell'area si parte sempre dall'alto: niente posizione rimessa dal browser
      if (dentro || vecchio || location.hash === '#venditori') {
        try { history.scrollRestoration = 'manual'; } catch (e) {}
      }
      if (dentro) {
        document.body.classList.add('in-area-venditori');
        barra().innerHTML = '<p class="aiuto">Rientro nella tua area…</p>';
        caricaArea();
      } else if (vecchio) {
        mostraAccesso('Da novembre si entra con la tua e-mail: scrivila qui e ti mandiamo un codice di 6 cifre. Il vecchio codice personale non serve più.');
      } else if (location.hash === '#venditori') {
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
