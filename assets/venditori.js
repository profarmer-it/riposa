/* ============================================================================
   Riposa — AREA VENDITORI
   ----------------------------------------------------------------------------
   Agenti, rivenditori e commerciali Pro Farmer entrano con il codice personale
   (riposa.profarmer.it/#venditori). Dopo l'accesso il calcolatore mostra il
   risultato a schermo, senza il muro dei lead, e sotto il modulo d'ordine con
   la provvigione (agente) o il margine (rivenditore).

   In questo file NON ci sono condizioni né codici: il sito è pubblico. Le
   condizioni arrivano dallo script Google dopo l'accesso, e ognuno riceve
   solo le sue. Il conto che fa fede è quello che rifà lo script quando
   riceve l'ordine: qui è un'anteprima.
   ========================================================================== */

'use strict';

const Venditori = (() => {

  const CHIAVE = 'riposa-codice';
  let codice = null;
  let cond = null;          // le condizioni di chi è entrato
  let ultimoCalcolo = null; // il risultato del calcolatore, se c'è
  // quello che il venditore ha scritto nel modulo d'ordine: sopravvive ai
  // ridisegni del risultato (per esempio quando sceglie l'alternativa)
  let stato = { bigbag: '', sacchi: '', ballette: '', annuale: false, direzionale: false };
  let suggeriti = null;     // le quantità proposte dal calcolo, per capire se le ha cambiate

  const RUOLI = { agente: 'agente', rivenditore: 'rivenditore', interno: 'Pro Farmer' };
  const VOCI = [
    { id: 'bigbag',   nome: 'piùLact, big bag da 600 kg',        unita: 'big bag' },
    { id: 'sacchi',   nome: 'piùLact, bancali di sacchi da 25 kg (1,2 t)', unita: 'bancali' },
    { id: 'ballette', nome: 'piùLact Pronto, ballette da circa 850 kg', unita: 'ballette' }
  ];

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

  /* ------------------------------------------------------------ la barra */

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

  function mostraAccesso(messaggio) {
    const el = barra();
    el.innerHTML = '<h2 class="titolo-sezione">Area venditori</h2>'
      + '<p class="aiuto">Per agenti, rivenditori e commerciali Pro Farmer. Entra con il tuo codice personale: '
      + 'il calcolo ti mostra il risultato a schermo e puoi mandare l’ordine a Pro Farmer.</p>'
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

  function entra(c, silenzioso) {
    const el = barra();
    if (!silenzioso) el.querySelector('button[type=submit]').textContent = 'Controllo…';
    chiama({ azione: 'accesso', codice: c }).then(r => {
      if (!r || !r.ok) {
        memoria('togli');
        return mostraAccesso(r && r.motivo === 'troppe richieste'
          ? 'Troppi tentativi in quest’ora: riprova più tardi.'
          : 'Codice non riconosciuto. Controlla di averlo scritto bene o chiedilo a Pro Farmer.');
      }
      codice = c;
      cond = r.condizioni;
      memoria('scrivi', c);
      mostraBenvenuto();
    }).catch(() => mostraAccesso('Non riesco a collegarmi: controlla la connessione e riprova.'));
  }

  function mostraBenvenuto() {
    const el = barra();
    let h = '<div class="venditori-testa">';
    h += `<p><strong>${esc(cond.nome)}</strong> <span class="venditori-ruolo">${esc(RUOLI[cond.ruolo] || cond.ruolo)}</span></p>`;
    h += '<div class="venditori-azioni">'
      + '<button type="button" class="bottone bottone-fantasma" id="v-diretto">Ordine diretto</button>'
      + '<button type="button" class="bottone bottone-fantasma" id="v-esci">Esci</button></div>';
    h += '</div>';
    h += '<p class="aiuto">Compila la stalla del cliente qui sotto e premi <strong>Calcola</strong>: vedi il risultato '
      + 'e il modulo d’ordine già riempito. Se sai già cosa serve, vai su <strong>Ordine diretto</strong>.</p>';
    if (cond.daAggiornare) {
      h += '<div class="avviso"><span class="avviso-icona">⚠</span><span>Promemoria: le tue condizioni su piùLact '
        + `erano valide fino al ${esc(cond.validoFino)} e sono da aggiornare con Pro Farmer. Intanto restano quelle.</span></div>`;
    }
    el.innerHTML = h;
    document.getElementById('v-esci').addEventListener('click', esci);
    document.getElementById('v-diretto').addEventListener('click', () => {
      ultimoCalcolo = null;
      suggeriti = null;
      boxRis.innerHTML = '';
      boxRis.hidden = false;
      mostraOrdine(null);
      boxRis.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelector('#modulo button[type=submit]').textContent = 'Calcola';
  }

  function esci() {
    codice = null;
    cond = null;
    memoria('togli');
    boxRis.hidden = true;
    boxRis.innerHTML = '';
    document.querySelector('#modulo button[type=submit]').textContent = 'Calcola il dosaggio';
    history.replaceState(null, '', location.pathname);
    const el = document.getElementById('area-venditori');
    if (el) el.remove();
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
    if (rivend) h += '<p class="aiuto">Se l’ordine è per il tuo magazzino lascia vuota la ragione sociale.</p>';
    h += '<div class="contatti">';
    h += campo('cliente', 'Ragione sociale', !rivend);
    h += campo('provincia', 'Provincia', false);
    h += campo('indirizzo', 'Indirizzo di consegna', false);
    h += campo('telefono', 'Telefono', false, 'tel');
    h += campo('email', 'E-mail', false, 'email');
    h += '<div class="campo pieno"><label for="o-note">Note <span class="opzionale">facoltativo</span></label>'
      + `<textarea id="o-note" name="note" rows="3">${esc(stato.note || '')}</textarea></div>`;
    h += '</div>';

    h += '<p id="ordine-errore" class="errore" hidden></p>';
    h += '<div class="azioni"><button type="submit" class="bottone">Manda l’ordine a Pro Farmer</button></div>';
    h += '<p class="aiuto">Prezzi franco partenza, IVA esclusa. Ballette: importo stimato su 850 kg a balletta, '
      + 'si fattura il peso reale. L’ordine arriva a Pro Farmer per e-mail, che lo conferma.</p>';
    h += '</form></div>';

    boxRis.insertAdjacentHTML('beforeend', h);

    const f = document.getElementById('form-ordine');
    f.addEventListener('input', () => { leggiStato(f); disegnaConto(); });
    f.addEventListener('change', () => { leggiStato(f); disegnaConto(); });
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
    ['cliente', 'provincia', 'indirizzo', 'telefono', 'email', 'note'].forEach(k => { stato[k] = (d.get(k) || '').trim(); });
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
    if (!conto.righe.length) return errore('Indica almeno una quantità.');
    if (cond.ruolo !== 'rivenditore' && !stato.cliente) return errore('Serve la ragione sociale del cliente.');
    if (stato.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(stato.email)) return errore('L’e-mail del cliente non sembra valida.');
    err.hidden = true;

    const p = { azione: 'ordine', codice };
    VOCI.forEach(v => { if (Number(stato[v.id]) > 0) p[v.id] = Math.floor(Number(stato[v.id])); });
    ['cliente', 'provincia', 'indirizzo', 'telefono', 'email', 'note'].forEach(k => { if (stato[k]) p[k] = stato[k]; });
    if (stato.annuale) p.annuale = 'si';
    if (stato.direzionale) p.direzionale = 'si';
    if (ultimoCalcolo) p.calcolo = testoRiepilogo({ azienda: stato.cliente || cond.nome }, ultimoCalcolo);

    const bottone = f.querySelector('button[type=submit]');
    bottone.disabled = true;
    bottone.textContent = 'Invio in corso…';
    chiama(p).then(r => {
      if (!r || !r.ok) throw new Error(r && r.motivo || 'errore');
      const box = document.getElementById('blocco-ordine');
      box.innerHTML = '<div class="trovato"><span class="trovato-spunta">✓</span>'
        + `<h2>Ordine inviato a Pro Farmer</h2><p>Numero <strong>${esc(r.numero)}</strong>. `
        + (r.copia ? 'Te ne arriva una copia per e-mail. ' : '')
        + 'Pro Farmer ti ricontatta per la conferma e la consegna.</p>'
        + '<div class="azioni"><button type="button" class="bottone bottone-fantasma" id="v-nuovo">Nuovo calcolo</button></div></div>';
      stato = { bigbag: '', sacchi: '', ballette: '', annuale: false, direzionale: false };
      suggeriti = null;
      document.getElementById('v-nuovo').addEventListener('click', () => {
        boxRis.hidden = true;
        boxRis.innerHTML = '';
        modulo.reset();
        modulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
