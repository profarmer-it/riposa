/* ============================================================================
   Riposa — AREA VENDITORI
   ----------------------------------------------------------------------------
   Agenti, rivenditori e commerciali Pro Farmer entrano con il codice personale
   (riposa.profarmer.it/#venditori) e trovano la loro area, in sei schede:
     Calcolo e ordine · Clienti · Ordini · Provvigioni (o Margini) · Materiali · Profilo
   Il calcolo è quello dell'allevatore, ma il risultato si vede subito a
   schermo, senza il muro dei lead, e sotto c'è il modulo d'ordine.

   In questo file NON ci sono condizioni, codici né dati di clienti: il sito è
   pubblico. Tutto arriva dallo script Google dopo l'accesso, e ognuno riceve
   solo le sue righe. Il conto che fa fede è quello che rifà lo script quando
   riceve l'ordine: qui è un'anteprima.
   ========================================================================== */

'use strict';

const Venditori = (() => {

  const CHIAVE = 'riposa-codice';
  let codice = null;
  let cond = null;          // le condizioni di chi è entrato
  let area = null;          // profilo, clienti, ordini, materiali (dallo script)
  let scheda = 'calcolo';   // la scheda aperta
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
  const CAMPI_CLIENTE = [
    { id: 'ragione', etichetta: 'Ragione sociale', obbligatorio: true },
    { id: 'piva', etichetta: 'P.IVA' },
    { id: 'referente', etichetta: 'Referente' },
    { id: 'telefono', etichetta: 'Telefono', tipo: 'tel' },
    { id: 'email', etichetta: 'E-mail', tipo: 'email' },
    { id: 'indirizzo', etichetta: 'Indirizzo' },
    { id: 'comune', etichetta: 'Comune' },
    { id: 'provincia', etichetta: 'Provincia' },
    { id: 'capi', etichetta: 'Capi in lattazione', tipo: 'number' }
  ];
  const PRO_FARMER = { email: 'info@profarmer.it', telefono: '+39 376 129 6162', tel: '+393761296162' };

  function statoVuoto() {
    return { bigbag: '', sacchi: '', ballette: '', annuale: false, direzionale: false, clienteId: '' };
  }

  /* ---------------------------------------------------------------- utilità */

  function memoria(azione, valore) {
    try {
      if (azione === 'leggi') return sessionStorage.getItem(CHIAVE);
      if (azione === 'scrivi') sessionStorage.setItem(CHIAVE, valore);
      if (azione === 'togli') sessionStorage.removeItem(CHIAVE);
    } catch (e) { /* navigazione privata: si rientra col codice, pazienza */ }
    return null;
  }

  function euro(n) {
    if (n === null || n === undefined) return 'da definire';
    return num(n, 2) + ' €';
  }

  function perc(x) {
    return x === null || x === undefined ? 'da definire' : num(x * 100, Number.isInteger(x * 100) ? 0 : 1) + '%';
  }

  /* Chiamata allo script Google in JSONP, come fa il calcolatore per i lead. */
  function chiama(parametri) {
    return new Promise((ok, ko) => {
      const url = CONFIG.raccoltaLead && CONFIG.raccoltaLead.url;
      if (!url) return ko(new Error('script non configurato'));
      const cb = 'venditoriCallback' + Date.now() + Math.floor(Math.random() * 1000);
      const el = document.createElement('script');
      const timer = setTimeout(() => { pulisci(); ko(new Error('nessuna risposta')); }, 20000);
      function pulisci() { clearTimeout(timer); delete window[cb]; el.remove(); }
      window[cb] = risposta => { pulisci(); ok(risposta); };
      el.onerror = () => { pulisci(); ko(new Error('rete')); };
      el.src = `${url}?${new URLSearchParams(parametri).toString()}&callback=${cb}`;
      document.body.appendChild(el);
    });
  }

  /* --------------------------------------------------------------------------
     IL CONTO DI UN ORDINE
     ATTENZIONE: copia UGUALE di contoOrdine() in integrazioni/foglio-google.gs.
     Se cambi una, cambia l'altra. Fa fede quella dello script.
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
        r.clienteT = (voce === 'ballette' && opz.direzionale) ? c.ballette.direzionaleT : listinoT;
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

  function mostraAccesso(messaggio) {
    const el = barra();
    el.innerHTML = '<h2 class="titolo-sezione">Area venditori</h2>'
      + '<p class="aiuto">Per agenti, rivenditori e commerciali Pro Farmer. Entra con il tuo codice personale: '
      + 'trovi i tuoi clienti, i tuoi ordini, le tue provvigioni e i materiali da mandare ai clienti.</p>'
      + '<form id="form-accesso" class="venditori-accesso" novalidate>'
      + '<div class="campo"><label for="v-codice">Il tuo codice</label>'
      + '<input id="v-codice" name="codice" autocomplete="off" autocapitalize="characters" placeholder="es. ABCD-1234"></div>'
      + '<button type="submit" class="bottone">Entra</button>'
      + '</form>'
      + (messaggio ? `<p class="errore">${esc(messaggio)}</p>` : '');
    document.getElementById('form-accesso').addEventListener('submit', ev => {
      ev.preventDefault();
      const c = document.getElementById('v-codice').value.trim();
      if (!c) return;
      entra(c);
    });
  }

  /* Accesso e caricamento dell'area in una sola chiamata. */
  function entra(c, silenzioso) {
    const el = barra();
    const b = el.querySelector('button[type=submit]');
    if (!silenzioso && b) b.textContent = 'Controllo…';
    chiama({ azione: 'area', codice: c }).then(r => {
      if (!r || !r.ok) {
        memoria('togli');
        return mostraAccesso(r && r.motivo === 'troppe richieste'
          ? 'Troppi tentativi in quest’ora: riprova più tardi.'
          : 'Codice non riconosciuto. Controlla di averlo scritto bene o chiedilo a Pro Farmer.');
      }
      codice = c;
      ricevi(r);
      memoria('scrivi', c);
      document.body.classList.add('in-area-venditori');
      disegnaBarra();
      apri(scheda);
    }).catch(() => mostraAccesso('Non riesco a collegarmi: controlla la connessione e riprova.'));
  }

  function ricevi(r) {
    cond = r.condizioni;
    area = {
      profilo: r.profilo || { nome: cond.nome, ruolo: cond.ruolo, email: '' },
      clienti: r.clienti || [],
      ordini: r.ordini || [],
      // solo link web sicuri, anche se lo script li ha già filtrati
      materiali: (r.materiali || []).filter(m => /^https:\/\//.test(m.link || ''))
    };
  }

  /* Ricarica clienti e ordini dopo un salvataggio, senza cambiare scheda. */
  function ricarica() {
    return chiama({ azione: 'area', codice }).then(r => { if (r && r.ok) ricevi(r); });
  }

  function nomeSoldi() {
    return cond.ruolo === 'agente' ? 'Provvigioni' : cond.ruolo === 'rivenditore' ? 'Margini' : 'Venduto';
  }

  function disegnaBarra() {
    const el = barra();
    const schede = [
      ['calcolo', 'Calcolo e ordine'], ['clienti', `Clienti (${area.clienti.length})`],
      ['ordini', `Ordini (${area.ordini.length})`], ['soldi', nomeSoldi()],
      ['materiali', 'Materiali'], ['profilo', 'Profilo']
    ];
    let h = '<div class="venditori-testa">';
    h += `<p><strong>${esc(cond.nome)}</strong> <span class="venditori-ruolo">${esc(RUOLI[cond.ruolo] || cond.ruolo)}</span></p>`;
    h += '<div class="venditori-azioni"><button type="button" class="bottone bottone-fantasma" id="v-esci">Esci</button></div>';
    h += '</div>';
    if (cond.daAggiornare) {
      h += '<div class="avviso"><span class="avviso-icona">⚠</span><span>Promemoria: le tue condizioni su piùLact '
        + `erano valide fino al ${esc(cond.validoFino)} e sono da aggiornare con Pro Farmer. Intanto restano quelle.</span></div>`;
    }
    h += '<nav class="venditori-schede" role="tablist">';
    schede.forEach(([id, et]) => {
      h += `<button type="button" role="tab" data-scheda="${id}" aria-selected="${scheda === id}">${esc(et)}</button>`;
    });
    h += '</nav>';
    el.innerHTML = h;
    document.getElementById('v-esci').addEventListener('click', esci);
    el.querySelectorAll('[data-scheda]').forEach(b => b.addEventListener('click', () => apri(b.dataset.scheda)));
  }

  function apri(id) {
    scheda = id;
    barra().querySelectorAll('[data-scheda]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.scheda === id)));
    const calc = id === 'calcolo';
    modulo.hidden = !calc;
    boxRis.hidden = !calc || !boxRis.innerHTML;
    const p = pannello();
    p.hidden = calc;
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
    const disegna = { clienti: disegnaClienti, ordini: disegnaOrdini, soldi: disegnaSoldi,
                      materiali: disegnaMateriali, profilo: disegnaProfilo }[id];
    p.innerHTML = disegna();
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
    boxRis.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function esci() {
    codice = null;
    cond = null;
    area = null;
    scheda = 'calcolo';
    ultimoCalcolo = null;
    suggeriti = null;
    stato = statoVuoto();
    memoria('togli');
    document.body.classList.remove('in-area-venditori');
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
      if (c.referente) h += `${esc(c.referente)} · `;
      if (c.telefono) h += `<a href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">${esc(c.telefono)}</a> · `;
      if (c.email) h += `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · `;
      if (c.cuccetta) h += `${esc(CUCCETTE[c.cuccetta] || c.cuccetta)} · `;
      if (c.capi) h += `${esc(c.capi)} capi · `;
      h += ord.length ? `${ord.length} ${ord.length === 1 ? 'ordine' : 'ordini'}, l’ultimo il ${esc(ord[0].data)}` : 'nessun ordine';
      h += '</p>';
      if (c.note) h += `<p class="cliente-note">${esc(c.note)}</p>`;
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
    CAMPI_CLIENTE.forEach(f => {
      h += `<div class="campo"><label for="cl-${f.id}">${esc(f.etichetta)}`
        + (f.obbligatorio ? '' : ' <span class="opzionale">facoltativo</span>') + '</label>'
        + `<input id="cl-${f.id}" name="${f.id}" type="${f.tipo || 'text'}" value="${esc(c ? c[f.id] : '')}"></div>`;
    });
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
      const err = document.getElementById('cl-errore');
      if (!d.ragione) { err.textContent = 'Serve la ragione sociale.'; err.hidden = false; return; }
      if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { err.textContent = 'L’e-mail non sembra valida.'; err.hidden = false; return; }
      const b = ev.currentTarget.querySelector('button[type=submit]');
      b.disabled = true; b.textContent = 'Salvo…';
      const p = Object.assign({ azione: 'cliente', codice }, d);
      if (c) p.id = c.id;
      chiama(p).then(r => {
        if (!r || !r.ok) throw new Error(r && r.motivo || 'errore');
        return ricarica();
      }).then(() => { disegnaBarra(); apri('clienti'); })
        .catch(() => { b.disabled = false; b.textContent = 'Salva'; err.textContent = 'Non sono riuscito a salvare: riprova tra poco.'; err.hidden = false; });
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
    } else {
      h += '<label class="spunta"><input type="checkbox" name="direzionale"' + (stato.direzionale ? ' checked' : '') + '>'
        + '<span>Cliente direzionale <small>(ballette a 22 €/q)</small></span></label>';
    }

    h += '<div id="ordine-conto"></div>';

    h += `<h3 style="margin-top:22px">${rivend ? 'Per chi è' : 'Il cliente'}</h3>`;
    h += '<div class="campo"><label for="o-scegli">Dalla tua lista</label><select id="o-scegli" name="clienteId">'
      + `<option value="">${rivend ? 'Per il mio magazzino, o un cliente nuovo' : 'Cliente nuovo: lo scrivo qui sotto'}</option>`
      + area.clienti.slice().sort((a, b) => a.ragione.localeCompare(b.ragione, 'it'))
          .map(c => `<option value="${esc(c.id)}"${stato.clienteId === c.id ? ' selected' : ''}>${esc(c.ragione)}${c.comune ? ' — ' + esc(c.comune) : ''}</option>`).join('')
      + '</select></div>';
    h += `<div id="o-nuovo"${stato.clienteId ? ' hidden' : ''}>`;
    if (rivend) h += '<p class="aiuto">Se l’ordine è per il tuo magazzino lascia vuota la ragione sociale.</p>';
    h += '<div class="contatti">';
    h += campo('cliente', 'Ragione sociale', !rivend);
    h += campo('provincia', 'Provincia', false);
    h += campo('indirizzo', 'Indirizzo di consegna', false);
    h += campo('telefono', 'Telefono', false, 'tel');
    h += campo('email', 'E-mail', false, 'email');
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

  function campo(id, etichetta, obbligatorio, tipo) {
    return `<div class="campo"><label for="o-${id}">${esc(etichetta)}`
      + (obbligatorio ? '' : ' <span class="opzionale">facoltativo</span>') + '</label>'
      + `<input id="o-${id}" name="${id}" type="${tipo || 'text'}" value="${esc(stato[id] || '')}"></div>`;
  }

  function leggiStato(f) {
    const d = new FormData(f);
    VOCI.forEach(v => { stato[v.id] = d.get(v.id) || ''; });
    ['cliente', 'provincia', 'indirizzo', 'telefono', 'email', 'note', 'clienteId'].forEach(k => { stato[k] = (d.get(k) || '').trim(); });
    stato.annuale = d.get('annuale') === 'on';
    stato.direzionale = d.get('direzionale') === 'on';
  }

  function righeOrdine() {
    return VOCI.map(v => ({ voce: v.id, pezzi: stato[v.id] }));
  }

  function disegnaConto() {
    const box = document.getElementById('ordine-conto');
    if (!box) return;
    const conto = contoOrdine(cond, righeOrdine(), { annuale: stato.annuale, direzionale: stato.direzionale });
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
    if (cond.ruolo !== 'rivenditore' && !scelto && !stato.cliente) return errore('Scegli il cliente dalla lista o scrivi la ragione sociale.');
    if (!scelto && stato.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(stato.email)) return errore('L’e-mail del cliente non sembra valida.');
    err.hidden = true;

    const p = { azione: 'ordine', codice };
    VOCI.forEach(v => { if (Number(stato[v.id]) > 0) p[v.id] = Math.floor(Number(stato[v.id])); });
    if (scelto) p.clienteId = scelto.id;
    else ['cliente', 'provincia', 'indirizzo', 'telefono', 'email'].forEach(k => { if (stato[k]) p[k] = stato[k]; });
    if (stato.note) p.note = stato.note;
    if (stato.annuale) p.annuale = 'si';
    if (stato.direzionale) p.direzionale = 'si';
    const chi = scelto ? scelto.ragione : (stato.cliente || cond.nome);
    if (ultimoCalcolo) p.calcolo = testoRiepilogo({ azienda: chi }, ultimoCalcolo);

    const bottone = f.querySelector('button[type=submit]');
    bottone.disabled = true;
    bottone.textContent = 'Invio in corso…';
    chiama(p).then(r => {
      if (!r || !r.ok) throw new Error(r && r.motivo || 'errore');
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
        ricarica().then(() => { disegnaBarra(); apri('ordini'); barra().scrollIntoView({ behavior: 'smooth' }); });
      });
    }).catch(e => {
      bottone.disabled = false;
      bottone.textContent = 'Manda l’ordine a Pro Farmer';
      errore(e.message === 'manca il cliente' ? 'Serve la ragione sociale del cliente.'
        : 'L’ordine non è partito: riprova tra poco. Se continua, chiama Pro Farmer.');
    });
  }

  /* ------------------------------------------------------------------ avvio */

  function avvia() {
    const salvato = memoria('leggi');
    if (salvato) { barra().innerHTML = '<p class="aiuto">Rientro nell’area venditori…</p>'; entra(salvato, true); return; }
    if (location.hash === '#venditori') mostraAccesso();
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
