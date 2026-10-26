/* ============================================================================
   Riposa — GESTIONE PRO FARMER
   ----------------------------------------------------------------------------
   La pagina di Pro Farmer (ruolo "interno") dentro l'area venditori: prende
   il posto delle schede "Venditori", "Ordini", "Materiali" del foglio Google.
     Ordini      stato, data di liquidazione della provvigione, note interne,
                 e-mail partita o no (con "Rimanda")
     Provvigioni per agente: da fatturare e da saldare, con "Saldate oggi"
     Venditori   condizioni personali, e-mail, attivo; "Manda invito"
     Condizioni  quelle uguali per tutti (listini, ballette, minimi)
     Materiali   i documenti che i venditori mandano ai clienti
   Questo file è pubblico come il resto del sito, ma non contiene dati: li
   legge dal database, che li dà SOLO a chi ha il ruolo interno (Row Level
   Security). Per chiunque altro le tabelle risultano vuote.
   ========================================================================== */

'use strict';

const ProFarmer = (() => {

  let sb = null;
  let box = null;
  let sezione = 'cruscotto';   // dal 24/10/2026 si apre sul cruscotto
  let cambiata = false;      // la sezione è appena cambiata: il contenuto entra con .entra
  let dati = { ordini: [], venditori: [], condizioni: null, materiali: [], lead: [], allevatori: [], messaggi: [], clienti: [], diamanti: null, premi: [], traguardi: [], chiamate: [], chiamateFatte: [], compleanni: [] };
  let filtroLead = 'nuovo';
  const leadAperti = new Set();
  let filtroStato = 'aperti';
  const aperti = new Set();   // i venditori aperti: restano aperti dopo un salvataggio

  const SEZIONI = { cruscotto: 'Cruscotto', ordini: 'Ordini', chiamate: 'Chiamate', clienti: 'Clienti', lead: 'Lead', allevatori: 'Allevatori', premi: 'Premi', provvigioni: 'Provvigioni',
                    venditori: 'Venditori', condizioni: 'Condizioni', materiali: 'Materiali' };
  /* Le ricerche delle liste: restano scritte quando la lista si ridisegna. */
  const cerca = {};
  let filtroVenditore = '';   // ordini e clienti: di chi ('' = tutti, 'diretti' = Pro Farmer)
  const STATI = ['inviato', 'confermato', 'consegnato', 'pagato', 'annullato'];
  const NOME_STATO = { inviato: 'Inviato', confermato: 'Confermato', consegnato: 'Consegnato', pagato: 'Pagato', annullato: 'Annullato' };
  const RUOLI = { agente: 'Agente', rivenditore: 'Rivenditore', interno: 'Pro Farmer' };

  function euro(n) {
    if (n === null || n === undefined || n === '') return '—';
    return num(Number(n), 2) + ' €';
  }
  function dataIt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
  }
  function oggi() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); }
  function v(x) { return x === null || x === undefined ? '' : x; }
  function nulloSeVuoto(x) { return x === '' || x === undefined ? null : x; }

  /* ----------------------------------------------------------- caricamento */

  function carica() {
    return Promise.all([
      sb.from('ordini').select('*, venditori(nome, ruolo)').order('creato_il', { ascending: false }).limit(500),
      sb.from('venditori').select('*').order('ruolo').order('nome'),
      sb.from('condizioni_generali').select('*').eq('id', 1).maybeSingle(),
      sb.from('materiali').select('*').order('posizione').order('creato_il'),
      sb.from('lead').select('*').order('creato_il', { ascending: false }).limit(500),
      sb.rpc('allevatori_gestione'),
      sb.from('messaggi_allevatori').select('*').order('programmato_il', { ascending: false }).limit(100),
      sb.from('clienti').select('*').order('ragione'),
      sb.rpc('diamanti_gestione'),
      sb.from('traguardi').select('*').order('posizione'),
      sb.rpc('chiamate_da_fare'),
      sb.rpc('chiamate_fatte'),
      sb.rpc('compleanni_prossimi')
    ]).then(([o, ve, c, m, le, al, me, cl, di, tr, ch, cf, co]) => {
      const err = [o, ve, c, m, le, al, me, cl, di, tr, ch, cf, co].find(x => x.error);
      if (err) throw new Error(err.error.message);
      dati = { ordini: o.data, venditori: ve.data, condizioni: c.data, materiali: m.data, lead: le.data,
               allevatori: al.data || [], messaggi: me.data || [], clienti: cl.data || [],
               diamanti: di.data || { agenti: [], cessati: [], movimenti: [], richieste: [] }, traguardi: tr.data || [],
               chiamate: ch.data || [], chiamateFatte: cf.data || [], compleanni: co.data || [] };
    });
  }

  function disegna(contenitore, collegamento) {
    sb = collegamento;
    box = contenitore;
    box.innerHTML = '<div class="blocco"><p class="aiuto">Carico i dati…</p></div>';
    carica().then(mostra).catch(e => {
      box.innerHTML = `<div class="blocco"><p class="errore">Non riesco a leggere i dati: ${esc(e.message)}</p></div>`;
    });
  }

  function mostra() {
    let h = '<h2 class="area-titolo">Gestione Pro Farmer</h2><div class="pf-schede" role="tablist">';
    Object.entries(SEZIONI).forEach(([id, nome]) => {
      h += `<button type="button" role="tab" class="pf-scheda${id === sezione ? ' attiva' : ''}" data-sezione="${id}" aria-selected="${id === sezione}">${esc(nome)}</button>`;
    });
    h += '</div><div id="pf-corpo"></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-sezione]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.sezione === sezione) return;
      sezione = b.dataset.sezione; cambiata = true; mostra();
    }));
    const attiva = box.querySelector('.pf-scheda.attiva');
    if (attiva) attiva.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const corpo = document.getElementById('pf-corpo');
    if (cambiata) { corpo.classList.add('entra'); cambiata = false; }
    setTimeout(() => agganciaCerca(corpo), 0);
    ({ cruscotto: cruscotto, ordini: ordini, chiamate: chiamate, clienti: clienti, lead: lead, allevatori: allevatori, premi: premi, provvigioni: provvigioni, venditori: venditori, condizioni: condizioni, materiali: materiali })[sezione](corpo);
  }

  /* La casella di ricerca di una lista: filtra le righe mentre si scrive,
     senza ridisegnare (il cursore resta dov'è). Ogni <li> porta il suo testo
     in data-cerca. Con tanti agenti le liste diventano lunghe (24/10/2026). */
  function casellaCerca(id, segnaposto) {
    return `<input type="search" class="pf-cerca" id="pf-cerca-${id}" data-lista="${id}" placeholder="${esc(segnaposto)}" `
      + `value="${esc(cerca[id] || '')}" autocomplete="off" aria-label="${esc(segnaposto)}">`
      + `<p class="aiuto pf-cerca-vuoto" id="pf-vuoto-${id}" hidden>Nessun risultato.</p>`;
  }
  const normale = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function agganciaCerca(corpo) {
    corpo.querySelectorAll('.pf-cerca').forEach(c => {
      const filtra = () => {
        const q = normale(c.value.trim());
        cerca[c.dataset.lista] = c.value;
        let visti = 0;
        corpo.querySelectorAll(`[data-lista-di="${c.dataset.lista}"] > li`).forEach(li => {
          const ok = !q || normale(li.dataset.cerca).includes(q);
          li.hidden = !ok; if (ok) visti++;
        });
        document.getElementById('pf-vuoto-' + c.dataset.lista).hidden = visti > 0;
      };
      c.addEventListener('input', filtra);
      filtra();
    });
  }
  function nomeVenditore(id) {
    const x = dati.venditori.find(v => v.id === id);
    return x ? (x.ruolo === 'interno' ? 'Pro Farmer (diretto)' : `${x.nome} · ${RUOLI[x.ruolo]}`) : '—';
  }
  function selectVenditore(nome, scelto, conTutti) {
    const gruppi = { interno: 'Pro Farmer', agente: 'Agenti', rivenditore: 'Rivenditori' };
    let h = `<select name="${nome}" class="pf-select">`;
    if (conTutti) h += `<option value="">Tutti</option><option value="diretti"${scelto === 'diretti' ? ' selected' : ''}>Diretti Pro Farmer</option>`;
    Object.entries(gruppi).forEach(([ruolo, et]) => {
      const lista = dati.venditori.filter(x => x.ruolo === ruolo);
      if (!lista.length || (conTutti && ruolo === 'interno')) return;
      h += `<optgroup label="${esc(et)}">` + lista.map(x =>
        `<option value="${esc(x.id)}"${x.id === scelto ? ' selected' : ''}>${esc(ruolo === 'interno' ? 'Pro Farmer (cliente diretto)' : x.nome)}</option>`).join('') + '</optgroup>';
    });
    return h + '</select>';
  }
  function diChi(idVenditore) {
    if (!filtroVenditore) return true;
    if (filtroVenditore === 'diretti') return (dati.venditori.find(v => v.id === idVenditore) || {}).ruolo === 'interno';
    return idVenditore === filtroVenditore;
  }

  /* Salva, ricarica e ridisegna; l'errore resta vicino al bottone. */
  function salva(bottone, lavoro, conferma) {
    const testo = bottone.textContent;
    const err = bottone.closest('form, li, .blocco').querySelector('.errore');
    bottone.disabled = true; bottone.textContent = 'Salvo…';
    return Promise.resolve().then(lavoro).then(r => {
      if (r && r.error) throw new Error(r.error.message);
      return carica();
    }).then(() => { mostra(); avvisa(conferma || 'Salvato'); }).catch(e => {
      bottone.disabled = false; bottone.textContent = testo;
      if (err) { err.textContent = 'Non salvato: ' + e.message; err.hidden = false; }
    });
  }

  /* La conferma dopo un salvataggio: un avviso in basso che sparisce da solo
     (24/10/2026). role=status: lo legge anche il lettore dello schermo. */
  let timerAvviso = null;
  function avvisa(testo) {
    let el = document.getElementById('pf-conferma');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pf-conferma'; el.className = 'pf-conferma'; el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = '✓ ' + testo;
    el.classList.remove('visibile'); void el.offsetWidth; el.classList.add('visibile');
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(() => el.classList.remove('visibile'), 3200);
  }

  /* ---------------------------------------------------------------- ordini */

  function pezzi(o) {
    const p = [];
    if (o.bigbag) p.push(`${o.bigbag} big bag`);
    if (o.sacchi) p.push(`${o.sacchi} bancali sacchi`);
    if (o.ballette) p.push(`${o.ballette} ballette`);
    return p.join(' · ');
  }

  function ordini(corpo) {
    const filtri = { aperti: 'Da seguire', tutti: 'Tutti' };
    STATI.forEach(s => { filtri[s] = NOME_STATO[s]; });
    const lista = dati.ordini.filter(o => (filtroStato === 'tutti' ? true
      : filtroStato === 'aperti' ? !['pagato', 'annullato'].includes(o.stato) : o.stato === filtroStato) && diChi(o.venditore_id));
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Ordini</h3>'
      + '<select id="pf-filtro" class="pf-select" aria-label="Quali ordini">'
      + Object.entries(filtri).map(([k, n]) => `<option value="${k}"${k === filtroStato ? ' selected' : ''}>${esc(n)}</option>`).join('')
      + '</select></div>'
      + '<div class="pf-filtri"><label>Di chi' + selectVenditore('pf-di-chi', filtroVenditore, true).replace('<select ', '<select id="pf-di-chi-ordini" ') + '</label>'
      + casellaCerca('ordini', 'Cerca cliente, numero, venditore') + '</div>';
    const senzaMail = dati.ordini.filter(o => !o.email_inviata_il);
    if (senzaMail.length) {
      h += `<div class="avviso"><span class="avviso-icona">⚠</span><span>${senzaMail.length} `
        + `${senzaMail.length === 1 ? 'ordine senza e-mail partita' : 'ordini senza e-mail partita'}: `
        + 'li trovi qui sotto con «Rimanda l’e-mail».</span></div>';
    }
    if (!lista.length) h += '<p class="aiuto">Nessun ordine qui.</p>';
    h += '<ul class="lista-clienti" data-lista-di="ordini">';
    lista.forEach(o => {
      const vend = o.venditori || {};
      const soldi = o.ruolo === 'agente' ? `provvigione ${euro(o.provvigione)}`
        : o.ruolo === 'rivenditore' ? `al rivenditore ${euro(o.totale_rivenditore)} · margine ${euro(o.margine)}` : '';
      h += `<li data-cerca="${esc([o.cliente, o.numero, vend.nome, (o.cliente_dati || {}).piva].join(' '))}"><form class="pf-ordine" data-id="${esc(o.id)}" novalidate>`
        + `<div class="cliente-testa"><strong>${esc(o.cliente || (o.ruolo === 'rivenditore' ? 'Magazzino del rivenditore' : '—'))}</strong>`
        + `<span>n. ${esc(o.numero)} · ${esc(dataIt(o.creato_il))}</span></div>`
        + `<p class="cliente-dati">${esc(vend.nome || '')} (${esc(RUOLI[o.ruolo] || o.ruolo)}) · ${esc(pezzi(o))}`
        + `${o.annuale ? ' · fornitura annuale' : ''} · ${num(o.t, 1)} t`
        + (o.totale_cliente !== null ? ` · al cliente ${euro(o.totale_cliente)}` : '') + (soldi ? ' · ' + soldi : '') + '</p>';
      const cd = o.cliente_dati || {};
      const fatt = [cd.piva && 'P.IVA ' + cd.piva, cd.pec && 'PEC ' + cd.pec, cd.sdi && 'SDI ' + cd.sdi, cd.telefono, cd.indirizzo, cd.provincia].filter(Boolean);
      if (fatt.length) h += `<p class="cliente-dati">${esc(fatt.join(' · '))}</p>`;
      if (o.note) h += `<p class="cliente-note">Nota del venditore: ${esc(o.note)}</p>`;
      h += '<div class="pf-campi">'
        + '<label>Stato<select name="stato" class="pf-select">'
        + STATI.map(s => `<option value="${s}"${o.stato === s ? ' selected' : ''}>${NOME_STATO[s]}</option>`).join('') + '</select></label>'
        + (o.ruolo === 'agente'
          ? `<label>Provvigione saldata il<input type="date" name="liquidata" value="${esc(v(o.provvigione_liquidata_il))}"></label>` : '')
        + `<label class="pf-largo">Note Pro Farmer <small>(il venditore non le vede)</small><textarea name="note_pf" rows="2">${esc(v(o.note_pf))}</textarea></label>`
        + '</div>';
      h += '<p class="cliente-dati">' + (o.email_inviata_il ? `E-mail partita il ${esc(dataIt(o.email_inviata_il))}.`
        : `<strong>E-mail non partita</strong>${o.email_errore ? ': ' + esc(o.email_errore) : ''}`) + '</p>';
      h += '<p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Salva</button>'
        + (o.email_inviata_il ? '' : '<button type="button" class="bottone bottone-fantasma" data-rimanda>Rimanda l’e-mail</button>')
        + '</div></form></li>';
    });
    h += '</ul></div>';
    corpo.innerHTML = h;
    document.getElementById('pf-filtro').addEventListener('change', ev => { filtroStato = ev.target.value; mostra(); });
    document.getElementById('pf-di-chi-ordini').addEventListener('change', ev => { filtroVenditore = ev.target.value; mostra(); });
    corpo.querySelectorAll('.pf-ordine').forEach(f => {
      f.addEventListener('submit', ev => {
        ev.preventDefault();
        const d = new FormData(f);
        const riga = { stato: d.get('stato'), note_pf: nulloSeVuoto(String(d.get('note_pf') || '').trim()) };
        if (d.has('liquidata')) riga.provvigione_liquidata_il = nulloSeVuoto(d.get('liquidata'));
        salva(f.querySelector('button[type=submit]'), () => sb.from('ordini').update(riga).eq('id', f.dataset.id));
      });
      const r = f.querySelector('[data-rimanda]');
      if (r) r.addEventListener('click', () => salva(r, () =>
        sb.functions.invoke('manda-ordine', { body: { id: f.dataset.id } }).then(x => {
          if (x.error) throw new Error('e-mail non partita, riprova più tardi');
        })));
    });
  }

  /* ------------------------------------------------------------------- lead */

  /* Gli allevatori che hanno usato il calcolatore (dal 23/10/2026 su
     Supabase, prima sul foglio Google). Si richiamano da qui: lo stato e le
     note sono solo di Pro Farmer. */
  const STATI_LEAD = { nuovo: 'Da richiamare', richiamato: 'Richiamato', cliente: 'Diventato cliente',
    'non interessato': 'Non interessato', prova: 'Prova / da ignorare' };
  const ZONE = { materassino: 'materassino', buca: 'cuccetta a buca', lettiera: 'lettiera', compost: 'compost barn' };
  /* Dal 25/10/2026 il lead può andare all'agente della provincia (22-lead-agli-agenti.sql).
     Prima decide Pro Farmer: «Direzionale» lo tiene per sé e non va mai a un agente.
     Se no, la Gestione propone l'agente che ha la provincia nelle sue zone e
     «Passa all'agente» glielo manda, con una notifica. Solo col consenso. */
  /* La zona di un venditore: sigle (LO) e regioni intere (Lombardia), dal 25/10/2026
     anche per i rivenditori (23-zone-regioni-rivenditori.sql). */
  const REGIONI = {
    'Abruzzo': 'AQ CH PE TE', 'Basilicata': 'MT PZ', 'Calabria': 'CS CZ KR RC VV', 'Campania': 'AV BN CE NA SA',
    'Emilia-Romagna': 'BO FC FE MO PC PR RA RE RN', 'Friuli-Venezia Giulia': 'GO PN TS UD', 'Lazio': 'FR LT RI RM VT',
    'Liguria': 'GE IM SP SV', 'Lombardia': 'BG BS CO CR LC LO MB MI MN PV SO VA', 'Marche': 'AN AP FM MC PU', 'Molise': 'CB IS',
    'Piemonte': 'AL AT BI CN NO TO VB VC', 'Puglia': 'BA BR BT FG LE TA', 'Sardegna': 'CA NU OR SS SU',
    'Sicilia': 'AG CL CT EN ME PA RG SR TP', 'Toscana': 'AR FI GR LI LU MS PI PO PT SI', 'Trentino-Alto Adige': 'BZ TN',
    'Umbria': 'PG TR', 'Valle d’Aosta': 'AO', 'Veneto': 'BL PD RO TV VE VI VR'
  };
  const chiaveZona = t => String(t).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const SIGLE = new Set(Object.values(REGIONI).join(' ').split(' '));
  // «LO, CR, Emilia Romagna» → ['LO', 'CR', 'Emilia-Romagna']; quello che non riconosce va in «scartati»
  function leggiZona(testo) {
    const out = [], scartati = [];
    String(testo || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).forEach(t => {
      const regione = Object.keys(REGIONI).find(n => chiaveZona(n) === chiaveZona(t));
      const sigla = t.toUpperCase();
      if (regione) out.push(regione); else if (SIGLE.has(sigla)) out.push(sigla); else scartati.push(t);
    });
    return { zona: [...new Set(out)], scartati };
  }
  const sigleDellaZona = z => (z || []).flatMap(x => REGIONI[x] ? REGIONI[x].split(' ') : [x]);
  const agentiAttivi = () => dati.venditori.filter(a => (a.ruolo === 'agente' || a.ruolo === 'rivenditore') && a.attivo);
  const agentiDellaProvincia = x => agentiAttivi().filter(a => x.provincia_sigla && sigleDellaZona(a.province).includes(x.provincia_sigla));
  function bloccoAgente(x) {
    const nome = id => (dati.venditori.find(a => a.id === id) || {}).nome || 'un agente';
    let h = '<div class="pf-lead-agente">';
    if (x.direzionale) {
      h += '<p class="cliente-dati"><strong>Direzionale</strong>: lo segue Pro Farmer, non va ad agenti o rivenditori.</p>'
        + `<div class="azioni pf-azioni"><button type="button" class="bottone bottone-fantasma" data-direzionale="${esc(x.id)}" data-si="0">Non più direzionale</button></div>`;
    } else if (x.assegnato_a) {
      h += `<p class="cliente-dati">Passato a <strong>${esc(nome(x.assegnato_a))}</strong> il ${esc(dataIt(x.assegnato_il))}.`
        + (x.esito_agente_il ? ` Il ${esc(dataIt(x.esito_agente_il))} ha segnato: <strong>${esc(STATI_LEAD[x.stato] || x.stato)}</strong>${x.note_agente ? ' · «' + esc(x.note_agente) + '»' : ''}.` : ' Non ha ancora segnato com’è andata.')
        + '</p><div class="azioni pf-azioni">'
        + `<button type="button" class="bottone bottone-fantasma" data-riprendi="${esc(x.id)}">Riprendilo</button>`
        + `<button type="button" class="bottone bottone-fantasma" data-direzionale="${esc(x.id)}" data-si="1">Segna direzionale</button></div>`;
    } else if (!x.consenso || x.stato === 'prova') {
      h += `<p class="cliente-dati">${x.stato === 'prova' ? 'È una prova' : 'Senza consenso a essere ricontattato'}: non si passa ad agenti o rivenditori.</p>`;
    } else {
      const proposti = agentiDellaProvincia(x);
      const altri = agentiAttivi().filter(a => !proposti.includes(a));
      h += `<p class="cliente-dati">${proposti.length
          ? `Della zona (${esc(x.provincia_sigla)}): <strong>${esc(proposti.map(a => a.nome).join(', '))}</strong>.`
          : `Nessun agente o rivenditore ha ${esc(x.provincia_sigla || x.provincia)} nella sua zona: sceglilo dall’elenco o tienilo direzionale.`}</p>`
        + '<div class="pf-campi"><label>A chi<select class="pf-select" data-agente-di="' + esc(x.id) + '">'
        + (proposti.length ? '' : '<option value="">Scegli a chi passarlo</option>')
        + proposti.concat(altri).map(a => `<option value="${esc(a.id)}">${esc(a.nome)} · ${a.ruolo === 'rivenditore' ? 'rivenditore' : 'agente'}${proposti.includes(a) ? ' (della zona)' : ''}</option>`).join('')
        + '</select></label></div><div class="azioni pf-azioni">'
        + `<button type="button" class="bottone bottone-fantasma" data-direzionale="${esc(x.id)}" data-si="1">Direzionale: lo seguiamo noi</button>`
        + `<button type="button" class="bottone" data-passa="${esc(x.id)}">Passalo</button></div>`;
    }
    return h + '<p class="errore" hidden></p></div>';
  }

  function lead(corpo) {
    const lista = dati.lead.filter(x => filtroLead === 'tutti' || x.stato === filtroLead);
    const nuovi = dati.lead.filter(x => x.stato === 'nuovo').length;
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Lead degli allevatori</h3>'
      + '<select id="pf-filtro-lead" class="pf-select" aria-label="Quali lead">'
      + Object.entries(Object.assign({ tutti: 'Tutti' }, STATI_LEAD))
        .map(([k, n]) => `<option value="${k}"${k === filtroLead ? ' selected' : ''}>${esc(n)}${k === 'nuovo' ? ` (${nuovi})` : ''}</option>`).join('')
      + '</select></div>'
      + '<p class="aiuto">Chi ha fatto il calcolo e ha ricevuto il risultato per e-mail. «Senza consenso» vuol dire che '
      + 'non ha accettato di essere ricontattato a scopo commerciale: non è in ActiveCampaign.</p>';
    if (!lista.length) h += '<p class="aiuto">Nessun lead qui.</p>';
    else h += casellaCerca('lead', 'Cerca azienda, nome, provincia, e-mail');
    h += '<ul class="lista-clienti" data-lista-di="lead">';
    lista.forEach(x => {
      const chi = x.direzionale ? 'direzionale' : x.assegnato_a ? 'a ' + ((dati.venditori.find(a => a.id === x.assegnato_a) || {}).nome || 'un agente') : '';
      const sotto = [x.nome, x.provincia, dataIt(x.creato_il), x.consenso ? '' : 'senza consenso', chi].filter(Boolean).join(' · ');
      h += `<li data-cerca="${esc([x.azienda, x.nome, x.provincia, x.email, x.telefono].join(' '))}"><details class="pf-dettagli" data-id="${esc(x.id)}"${leadAperti.has(x.id) ? ' open' : ''}>`
        + `<summary><span class="pf-sommario"><strong>${esc(x.azienda)}</strong><span>${esc(sotto)}</span></span>`
        + '<svg class="pf-freccia" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>'
        + bloccoAgente(x)
        + `<form class="pf-lead" data-id="${esc(x.id)}" novalidate>`
        + '<p class="cliente-dati">'
        + `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>`
        + (x.telefono ? ` · <a href="tel:${esc(String(x.telefono).replace(/[^\d+]/g, ''))}">${esc(x.telefono)}</a>` : '')
        + '</p><p class="cliente-dati">'
        + esc([ZONE[x.zona] || x.zona, x.cuccette && `${x.cuccette} cuccette`, x.mq && `${x.mq} m²`,
               x.capi && `${x.capi} capi`, x.mungitura === 'robot' ? 'robot' : ''].filter(Boolean).join(' · '))
        + '</p><p class="cliente-dati">'
        + esc([x.prodotto, x.dose, x.frequenza, x.kg_mese && `${x.kg_mese} kg al mese`].filter(Boolean).join(' · '))
        + '</p>'
        + `<p class="cliente-dati">E-mail: ${esc(x.esito_email || '—')} · ActiveCampaign: ${esc(x.esito_ac || '—')}</p>`
        + '<div class="pf-campi"><label>Stato<select name="stato" class="pf-select">'
        + Object.entries(STATI_LEAD).map(([k, n]) => `<option value="${k}"${x.stato === k ? ' selected' : ''}>${esc(n)}</option>`).join('')
        + '</select></label>'
        + `<label class="pf-largo">Note Pro Farmer<textarea name="note_pf" rows="2">${esc(v(x.note_pf))}</textarea></label></div>`
        + '<p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Salva</button></div>'
        + '</form></details></li>';
    });
    h += '</ul></div>';
    corpo.innerHTML = h;
    document.getElementById('pf-filtro-lead').addEventListener('change', ev => { filtroLead = ev.target.value; mostra(); });
    corpo.querySelectorAll('.pf-dettagli').forEach(d => d.addEventListener('toggle', () => {
      if (d.open) leadAperti.add(d.dataset.id); else leadAperti.delete(d.dataset.id);
    }));
    corpo.querySelectorAll('[data-passa]').forEach(b => b.addEventListener('click', () => {
      const sel = corpo.querySelector(`[data-agente-di="${b.dataset.passa}"]`);
      const ag = dati.venditori.find(a => a.id === sel.value);
      if (!ag) { const e = b.closest('.pf-lead-agente').querySelector('.errore'); e.textContent = 'Scegli a chi passarlo.'; e.hidden = false; return; }
      salva(b, () => sb.rpc('assegna_lead', { p_lead: b.dataset.passa, p_venditore: ag.id }), `Lead passato a ${ag.nome}`);
    }));
    corpo.querySelectorAll('[data-riprendi]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Riprendi il lead? Il venditore non lo vede più.')) return;
      salva(b, () => sb.rpc('assegna_lead', { p_lead: b.dataset.riprendi, p_venditore: null }), 'Lead ripreso');
    }));
    corpo.querySelectorAll('[data-direzionale]').forEach(b => b.addEventListener('click', () => {
      const si = b.dataset.si === '1';
      salva(b, () => sb.rpc('lead_direzionale', { p_lead: b.dataset.direzionale, p_si: si }), si ? 'Lead direzionale: lo seguite voi' : 'Lead non più direzionale');
    }));
    corpo.querySelectorAll('.pf-lead').forEach(f => f.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = new FormData(f);
      leadAperti.delete(f.dataset.id);
      salva(f.querySelector('button[type=submit]'), () => sb.from('lead')
        .update({ stato: d.get('stato'), note_pf: nulloSeVuoto(String(d.get('note_pf') || '').trim()) }).eq('id', f.dataset.id));
    }));
  }

  /* -------------------------------------------------------------- cruscotto
     Dal 24/10/2026, per Giulio ed Elsa: tutto quello che succede in Riposa
     (allevatori) e in Riposa Pro (venditori) in una pagina sola. Solo
     lettura: per lavorare su un ordine o un lead si tocca la riga e si va
     nella sua scheda. I numeri vengono dai dati già caricati, niente di nuovo
     dal database. */
  function cruscotto(corpo) {
    const t = n => num(Number(n) || 0, 1).replace(/,0$/, '');
    const oggiD = new Date();
    const inizioMese = new Date(oggiD.getFullYear(), oggiD.getMonth(), 1);
    const inizioPrima = new Date(oggiD.getFullYear(), oggiD.getMonth() - 1, 1);
    const validi = dati.ordini.filter(o => o.stato !== 'annullato');
    const delMese = validi.filter(o => new Date(o.creato_il) >= inizioMese);
    const mesePrima = validi.filter(o => new Date(o.creato_il) >= inizioPrima && new Date(o.creato_il) < inizioMese);
    const somma = (l, k) => l.reduce((x, o) => x + (Number(o[k]) || 0), 0);
    const daSeguire = validi.filter(o => ['inviato', 'confermato', 'consegnato'].includes(o.stato));
    const leadNuovi = dati.lead.filter(x => x.stato === 'nuovo');
    const fra14 = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toLocaleDateString('sv-SE'); })();
    const caldi = dati.allevatori.filter(a => a.avviso_il && a.avviso_il <= fra14);
    const senzaMail = dati.ordini.filter(o => !o.email_inviata_il);
    const nomeMese = d => d.toLocaleDateString('it-IT', { month: 'long' });
    const variazione = (a, b) => !b ? '' : ` · ${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}% su ${nomeMese(inizioPrima)}`;

    let h = '<div class="blocco"><h3>Da fare adesso</h3><div class="cr-subito">';
    const subito = [
      ['ordini', daSeguire.length, 'ordini da seguire', 'inviati, confermati o consegnati, non ancora pagati'],
      ['chiamate', dati.chiamate.length, 'chiamate di feedback', 'ai clienti, dopo il 1°, 3°, 5°… ordine'],
      ['lead', leadNuovi.length, 'lead da richiamare', 'allevatori che hanno fatto il calcolo'],
      ['allevatori', caldi.length, 'allevatori a fine scorta', 'nei prossimi 14 giorni: chiamarli'],
      ['ordini', senzaMail.length, 'e-mail d’ordine non partite', 'da rimandare dalla scheda Ordini'],
      ['premi', (dati.diamanti && dati.diamanti.richieste || []).filter(r => r.stato === 'richiesto').length, 'buoni da approvare', 'richieste degli agenti con i diamanti']
    ];
    subito.forEach(([dove, n, cosa, sotto]) => {
      h += `<button type="button" class="cr-casella${n ? ' cr-attenzione' : ''}" data-vai="${dove}">`
        + `<b>${n}</b><span>${esc(cosa)}</span><small>${esc(sotto)}</small></button>`;
    });
    h += '</div></div>';

    // i compleanni di oggi e della settimana: un messaggio di auguri
    if (dati.compleanni.length) {
      h += '<div class="blocco"><h3>🎂 Compleanni</h3><ul class="lista-clienti">';
      dati.compleanni.forEach(x => {
        const quando = x.fra === 0 ? 'oggi' : x.fra === 1 ? 'domani' : `fra ${x.fra} giorni`;
        let tel = String(x.telefono || '').replace(/[^\d+]/g, '');
        const wa = tel ? 'https://wa.me/' + (tel.startsWith('+') ? tel.slice(1) : tel.startsWith('00') ? tel.slice(2) : '39' + tel)
          + '?text=' + encodeURIComponent(`Buon compleanno${x.referente ? ' ' + String(x.referente).split(' ')[0] : ''}! Tanti auguri da tutta Pro Farmer.`) : '';
        h += `<li><div class="cliente-testa"><strong>${esc(x.referente || x.ragione)}</strong><span class="pf-proprietario${x.fra === 0 ? ' cr-oggi' : ''}">${quando}</span></div>`
          + `<p class="cliente-dati">${esc(x.referente ? x.ragione + ' · ' : '')}${esc(x.ruolo === 'interno' ? 'cliente diretto' : 'cliente di ' + x.venditore)}</p>`
          + (x.fra === 0 && x.ruolo === 'interno' && wa ? `<div class="azioni pf-azioni"><a class="bottone" href="${esc(wa)}" target="_blank" rel="noopener">Auguri su WhatsApp</a>`
            + `<a class="bottone bottone-fantasma" href="tel:${esc(tel)}">Chiama</a></div>` : '')
          + (x.fra === 0 && x.ruolo !== 'interno' ? `<p class="aiuto">Gli auguri li fa ${esc(x.venditore)}: ha ricevuto il promemoria.</p>` : '')
          + '</li>';
      });
      h += '</ul></div>';
    }

    // il mese
    h += `<div class="blocco"><h3>${esc(nomeMese(oggiD).replace(/^./, c => c.toUpperCase()))}</h3><dl class="numeri soldi">`
      + `<div class="numero-cella"><dt>Ordini</dt><dd>${delMese.length}<small>${esc(variazione(delMese.length, mesePrima.length).replace(/^ · /, '') || 'nel mese')}</small></dd></div>`
      + `<div class="numero-cella"><dt>Tonnellate</dt><dd>${t(somma(delMese, 't'))}<small>${esc(variazione(somma(delMese, 't'), somma(mesePrima, 't')).replace(/^ · /, '') || 'ordinate nel mese')}</small></dd></div>`
      + `<div class="numero-cella"><dt>Venduto</dt><dd>${euro(somma(delMese, 'totale_cliente'))}<small>al cliente, IVA esclusa</small></dd></div>`
      + `<div class="numero-cella"><dt>Provvigioni</dt><dd>${euro(somma(delMese, 'provvigione'))}<small>calcolate sugli ordini del mese</small></dd></div>`
      + '</dl>';
    const pezzi = { bigbag: ['Big bag', 0], sacchi: ['Bancali di sacchi', 0], ballette: ['Ballette Pronto', 0] };
    delMese.forEach(o => Object.keys(pezzi).forEach(k => { pezzi[k][1] += Number(o[k]) || 0; }));
    h += '<p class="cliente-dati">' + Object.values(pezzi).map(([n, q]) => `${n}: <strong>${q}</strong>`).join(' · ') + '</p></div>';

    // chi vende: ultimi 90 giorni
    const da90 = new Date(); da90.setDate(da90.getDate() - 90);
    const recenti = validi.filter(o => new Date(o.creato_il) >= da90);
    const perVenditore = new Map();
    recenti.forEach(o => {
      const x = perVenditore.get(o.venditore_id) || { t: 0, n: 0, ultimo: o.creato_il };
      x.t += Number(o.t) || 0; x.n++; if (o.creato_il > x.ultimo) x.ultimo = o.creato_il;
      perVenditore.set(o.venditore_id, x);
    });
    const righe = dati.venditori.filter(v => v.attivo).map(v => ({ v, ...(perVenditore.get(v.id) || { t: 0, n: 0, ultimo: null }) }))
      .sort((a, b) => b.t - a.t);
    const massimo = Math.max(1, ...righe.map(x => x.t));
    h += '<div class="blocco"><h3>Chi vende</h3><p class="aiuto">Ultimi 90 giorni, tonnellate ordinate. «Diretti» sono gli ordini di Pro Farmer per i suoi clienti.</p><ul class="cr-barre">';
    righe.forEach(x => {
      const nome = x.v.ruolo === 'interno' ? 'Diretti Pro Farmer' : x.v.nome;
      h += `<li><span class="cr-nome">${esc(nome)}<small>${esc(x.v.ruolo === 'interno' ? '' : RUOLI[x.v.ruolo])}</small></span>`
        + `<span class="cr-barra"><i style="width:${Math.round(x.t / massimo * 100)}%"></i></span>`
        + `<span class="cr-valore">${x.n ? `${t(x.t)} t<small>${x.n} ${x.n === 1 ? 'ordine' : 'ordini'} · ultimo ${esc(dataIt(x.ultimo))}</small>` : '<small>nessun ordine</small>'}</span></li>`;
    });
    h += '</ul></div>';

    // allevatori
    const da30 = new Date(); da30.setDate(da30.getDate() - 30);
    const lead30 = dati.lead.filter(x => new Date(x.creato_il) >= da30);
    const perProvincia = {};
    lead30.forEach(x => { const p = (x.provincia || '?').toUpperCase(); perProvincia[p] = (perProvincia[p] || 0) + 1; });
    const conNotifiche = dati.allevatori.filter(a => a.notifiche).length;
    h += '<div class="blocco"><h3>Allevatori (Riposa)</h3><dl class="numeri soldi">'
      + `<div class="numero-cella"><dt>Calcoli in 30 giorni</dt><dd>${lead30.length}<small>${lead30.filter(x => x.consenso).length} con consenso al ricontatto</small></dd></div>`
      + `<div class="numero-cella"><dt>Con l’app</dt><dd>${dati.allevatori.length}<small>${conNotifiche} con le notifiche</small></dd></div>`
      + `<div class="numero-cella"><dt>Lead diventati clienti</dt><dd>${dati.lead.filter(x => x.stato === 'cliente').length}<small>su ${dati.lead.length} in tutto</small></dd></div>`
      + '</dl>';
    const prov = Object.entries(perProvincia).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (prov.length) h += '<p class="cliente-dati">Da dove, negli ultimi 30 giorni: ' + prov.map(([p, n]) => `${esc(p)} <strong>${n}</strong>`).join(' · ') + '</p>';
    h += '</div>';

    h += statistiche(validi, t) + riordini(validi);

    // cosa è successo: ordini, lead, clienti nuovi, in ordine di tempo
    const eventi = [];
    dati.ordini.slice(0, 40).forEach(o => eventi.push({ quando: o.creato_il, dove: 'ordini', icona: 'ordine',
      testo: `Ordine n. ${o.numero} da ${(o.venditori || {}).nome || '—'} per ${o.cliente || 'il magazzino'}`, sotto: `${pezzi_(o)} · ${NOME_STATO[o.stato] || o.stato}` }));
    dati.lead.slice(0, 40).forEach(x => eventi.push({ quando: x.creato_il, dove: 'lead', icona: 'lead',
      testo: `Calcolo di ${x.azienda} (${x.provincia || '?'})`, sotto: [x.prodotto, x.kg_mese && `${x.kg_mese} kg/mese`, x.consenso ? '' : 'senza consenso'].filter(Boolean).join(' · ') }));
    dati.clienti.slice().sort((a, b) => String(b.creato_il).localeCompare(String(a.creato_il))).slice(0, 40).forEach(c => eventi.push({
      quando: c.creato_il, dove: 'clienti', icona: 'cliente', testo: `Nuovo cliente: ${c.ragione}`, sotto: nomeVenditore(c.venditore_id) }));
    // senza data non si sa dove metterli: fuori dalla cronologia
    eventi.splice(0, eventi.length, ...eventi.filter(e => e.quando));
    eventi.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
    h += '<div class="blocco"><h3>Cosa è successo</h3><ul class="cr-eventi">';
    eventi.slice(0, 20).forEach(e => {
      h += `<li><button type="button" data-vai="${e.dove}"><span class="cr-tipo cr-${e.icona}"></span>`
        + `<span class="cr-testo">${esc(e.testo)}<small>${esc(e.sotto)}</small></span>`
        + `<time>${esc(quandoBreve(e.quando))}</time></button></li>`;
    });
    if (!eventi.length) h += '<li class="aiuto">Ancora niente.</li>';
    h += '</ul></div>';

    corpo.innerHTML = h;
    corpo.querySelectorAll('[data-vai]').forEach(b => b.addEventListener('click', () => {
      sezione = b.dataset.vai; cambiata = true; mostra(); window.scrollTo(0, 0);
    }));
  }
  /* Statistiche: ultimi 12 mesi, tonnellate mese per mese, formati, da chi. */
  const KG = { bigbag: 600, sacchi: 1200, ballette: 850 };
  function statistiche(validi, t) {
    const oggiD = new Date();
    const mesi = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(oggiD.getFullYear(), oggiD.getMonth() - i, 1);
      mesi.push({ chiave: d.getFullYear() * 12 + d.getMonth(), nome: d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', ''), t: 0, n: 0 });
    }
    const primo = mesi[0].chiave;
    const anno = validi.filter(o => { const d = new Date(o.creato_il); return d.getFullYear() * 12 + d.getMonth() >= primo; });
    anno.forEach(o => {
      const d = new Date(o.creato_il); const m = mesi.find(x => x.chiave === d.getFullYear() * 12 + d.getMonth());
      if (m) { m.t += Number(o.t) || 0; m.n++; }
    });
    const max = Math.max(1, ...mesi.map(m => m.t));
    const tot = anno.reduce((x, o) => x + (Number(o.t) || 0), 0);
    let h = '<div class="blocco"><h3>Statistiche</h3><p class="aiuto">Ultimi 12 mesi, ordini non annullati.</p>';
    h += '<div class="cr-mesi" role="img" aria-label="Tonnellate ordinate mese per mese">';
    mesi.forEach(m => {
      h += `<div class="cr-mese" title="${esc(m.nome)}: ${t(m.t)} t, ${m.n} ordini"><span class="cr-mese-val">${m.t ? t(m.t) : ''}</span>`
        + `<span class="cr-mese-barra" style="height:${Math.max(2, Math.round(m.t / max * 100))}%"></span><span class="cr-mese-nome">${esc(m.nome)}</span></div>`;
    });
    h += '</div>';
    // i formati, in tonnellate
    const formati = { bigbag: 0, sacchi: 0, ballette: 0 };
    anno.forEach(o => Object.keys(formati).forEach(k => { formati[k] += (Number(o[k]) || 0) * KG[k] / 1000; }));
    const totF = Object.values(formati).reduce((a, b) => a + b, 0) || 1;
    const nomiF = { bigbag: 'piùLact big bag', sacchi: 'piùLact sacchi', ballette: 'Pronto ballette' };
    h += '<div class="cr-formati">' + Object.entries(formati).map(([k, v]) =>
      `<i class="cr-f-${k}" style="width:${v / totF * 100}%"></i>`).join('') + '</div>';
    h += '<p class="cr-legenda">' + Object.entries(formati).map(([k, v]) =>
      `<span><i class="cr-f-${k}"></i>${esc(nomiF[k])} <strong>${t(v)} t</strong> (${Math.round(v / totF * 100)}%)</span>`).join('') + '</p>';
    // da chi
    const ruoloDi = o => o.ruolo === 'interno' ? 'diretti' : o.ruolo;
    const perRuolo = { diretti: 0, agente: 0, rivenditore: 0 };
    anno.forEach(o => { perRuolo[ruoloDi(o)] = (perRuolo[ruoloDi(o)] || 0) + (Number(o.t) || 0); });
    const clientiAttivi = new Set(anno.map(o => o.cliente_id).filter(Boolean)).size;
    h += '<dl class="numeri soldi">'
      + `<div class="numero-cella"><dt>Tonnellate</dt><dd>${t(tot)}<small>in 12 mesi</small></dd></div>`
      + `<div class="numero-cella"><dt>Ordine medio</dt><dd>${anno.length ? t(tot / anno.length) : '—'} t<small>${anno.length} ordini</small></dd></div>`
      + `<div class="numero-cella"><dt>Clienti attivi</dt><dd>${clientiAttivi}<small>con almeno un ordine</small></dd></div>`
      + `<div class="numero-cella"><dt>Da chi</dt><dd class="cr-da-chi">${['diretti', 'agente', 'rivenditore'].map(r =>
          `${tot ? Math.round(perRuolo[r] / tot * 100) : 0}%`).join(' · ')}<small>diretti · agenti · rivenditori</small></dd></div>`
      + '</dl></div>';
    return h;
  }

  /* Riordini: per ogni cliente con almeno due ordini, ogni quanti giorni
     riordina in media e quando ci aspettiamo il prossimo. Chi è in ritardo o
     ci arriva nei prossimi 14 giorni va chiamato; chi ha ordinato una volta
     sola più di 60 giorni fa e non è tornato, anche. */
  function riordini(validi) {
    const giorno = 864e5, oggiT = Date.now();
    const perCliente = new Map();
    validi.filter(o => o.cliente_id).forEach(o => {
      const l = perCliente.get(o.cliente_id) || []; l.push(o); perCliente.set(o.cliente_id, l);
    });
    const attesi = [], unaVolta = [];
    let conRiordino = 0;
    perCliente.forEach((l, id) => {
      l.sort((a, b) => String(a.creato_il).localeCompare(String(b.creato_il)));
      const ultimo = l[l.length - 1];
      const c = dati.clienti.find(x => x.id === id) || { ragione: ultimo.cliente, venditore_id: ultimo.venditore_id };
      if (l.length >= 2) {
        conRiordino++;
        const giorni = (new Date(ultimo.creato_il) - new Date(l[0].creato_il)) / giorno / (l.length - 1);
        const atteso = new Date(new Date(ultimo.creato_il).getTime() + giorni * giorno);
        if (atteso.getTime() <= oggiT + 14 * giorno) attesi.push({ c, ultimo, ogni: Math.round(giorni), atteso, n: l.length });
      } else if (oggiT - new Date(ultimo.creato_il).getTime() > 60 * giorno) {
        unaVolta.push({ c, ultimo });
      }
    });
    attesi.sort((a, b) => a.atteso - b.atteso);
    const totClienti = perCliente.size;
    let h = '<div class="blocco"><h3>Riordini</h3>'
      + `<p class="aiuto">${totClienti ? `${conRiordino} clienti su ${totClienti} hanno riordinato almeno una volta (${Math.round(conRiordino / totClienti * 100)}%).` : 'I riordini compaiono dal secondo ordine di un cliente.'} `
      + 'Il prossimo ordine atteso è calcolato da ogni quanto il cliente ha ordinato finora.</p>';
    if (attesi.length) {
      h += '<h4>Da riordinare a breve</h4><ul class="lista-clienti">';
      attesi.forEach(x => {
        const tardi = x.atteso.getTime() < oggiT;
        h += `<li><div class="cliente-testa"><strong>${esc(x.c.ragione || '—')}</strong>`
          + `<span class="pf-proprietario${tardi ? ' cr-tardi' : ''}">${tardi ? 'in ritardo' : 'atteso'} il ${esc(dataIt(x.atteso.toISOString()))}</span></div>`
          + `<p class="cliente-dati">${esc(nomeVenditore(x.c.venditore_id))} · ${x.n} ordini, ogni ~${x.ogni} giorni · ultimo il ${esc(dataIt(x.ultimo.creato_il))}: ${esc(pezzi(x.ultimo))}</p></li>`;
      });
      h += '</ul>';
    }
    if (unaVolta.length) {
      h += `<h4>Un ordine solo, poi più niente</h4><p class="aiuto">Hanno ordinato una volta più di 60 giorni fa: vale una telefonata.</p><ul class="lista-clienti">`;
      unaVolta.sort((a, b) => String(a.ultimo.creato_il).localeCompare(String(b.ultimo.creato_il))).slice(0, 15).forEach(x => {
        h += `<li><div class="cliente-testa"><strong>${esc(x.c.ragione || '—')}</strong><span>${esc(dataIt(x.ultimo.creato_il))}</span></div>`
          + `<p class="cliente-dati">${esc(nomeVenditore(x.c.venditore_id))} · ${esc(pezzi(x.ultimo))}</p></li>`;
      });
      h += '</ul>';
    }
    if (!attesi.length && !unaVolta.length && totClienti) h += '<p class="aiuto">Nessun riordino in ritardo o atteso nei prossimi 14 giorni.</p>';
    return h + '</div>';
  }

  function pezzi_(o) { return pezzi(o) + (o.t ? ` · ${num(Number(o.t), 1)} t` : ''); }
  function quandoBreve(iso) {
    if (!iso) return '';
    const d = new Date(iso), ora = new Date();
    const giorni = Math.floor((new Date(ora.toDateString()) - new Date(d.toDateString())) / 864e5);
    const hm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return giorni === 0 ? `oggi ${hm}` : giorni === 1 ? `ieri ${hm}` : giorni < 7 ? `${giorni} giorni fa` : dataIt(iso);
  }

  /* ---------------------------------------------------------------- chiamate
     Dal 25/10/2026, regola di Giulio: si chiama il cliente per sentire com'è
     andata dopo il 1° ordine consegnato, dopo il 3° e poi ogni due ordini.
     Chiamata e valutazione: esito e voto. Positivo per un cliente di un agente
     = i diamanti del «Feedback positivo» all'agente. «Non raggiunto» la
     lascia da fare (e conta i tentativi). */
  const ESITI = { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo', non_raggiunto: 'Non raggiunto', fatta: 'Fatta' };
  // i clienti diretti: basta farsi sentire, niente valutazione (Giulio, 25/10/2026)
  const ESITI_DIRETTI = { fatta: 'Fatta', non_raggiunto: 'Non raggiunto' };
  const ESITI_VENDITORI = { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo', non_raggiunto: 'Non raggiunto' };
  function chiamate(corpo) {
    let h = '<div class="blocco"><h3>Chiamate di feedback da fare</h3>'
      + '<p class="aiuto">Dopo il 1° ordine consegnato di un cliente, dopo il 3° e poi ogni due ordini (5°, 7°…): una telefonata per sentire com’è andata. '
      + 'Con esito positivo, se il cliente è di un agente, l’agente vince i suoi diamanti.</p>';
    h += '<p class="aiuto">Anche i <strong>clienti diretti</strong> sono in calendario: niente voto e niente diamanti, conta farsi sentire.</p>';
    if (!dati.chiamate.length) h += '<p class="aiuto"><strong>Nessuna chiamata da fare.</strong></p>';
    h += '<ul class="lista-clienti chiamate">';
    dati.chiamate.forEach(x => {
      const tel = String(x.telefono || '').replace(/[^\d+]/g, '');
      h += `<li><form class="pf-chiamata" data-cliente="${esc(x.cliente_id)}" data-dopo="${x.dopo_ordine}" data-ragione="${esc(x.ragione)}" novalidate>`
        + `<div class="cliente-testa"><strong>${esc(x.ragione)}</strong><span class="pf-proprietario">dopo il ${x.dopo_ordine}° ordine</span></div>`
        + `<p class="cliente-dati">${esc([x.referente, [x.comune, x.provincia].filter(Boolean).join(' '), x.ruolo === 'interno' ? 'cliente diretto' : 'cliente di ' + x.venditore].filter(Boolean).join(' · '))}`
        + ` · ${x.ordini} ordini, l’ultimo il ${esc(dataIt(x.ultimo))}${x.tentativi ? ` · ${x.tentativi} ${x.tentativi === 1 ? 'tentativo' : 'tentativi'} a vuoto` : ''}</p>`
        + (tel ? `<a class="bottone chiama-cliente" href="tel:${esc(tel)}">Chiama ${esc(x.telefono)}</a>` : '<p class="cliente-dati">Senza telefono.</p>')
        + `<fieldset class="esiti${x.ruolo === 'interno' ? ' esiti-diretto' : ''}"><legend>${x.ruolo === 'interno' ? 'Ti sei fatto sentire?' : 'Com’è andata?'}</legend>`
        + Object.entries(x.ruolo === 'interno' ? ESITI_DIRETTI : ESITI_VENDITORI).map(([k, n]) => `<label class="esito-scelta esito-${k}"><input type="radio" name="esito" value="${k}"><span>${n}</span></label>`).join('')
        + '</fieldset>'
        + (x.ruolo === 'interno' ? '' : '<fieldset class="voto"><legend>Voto del cliente</legend>'
          + [1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="voto" value="${n}"><span aria-label="${n} su 5">${n}</span></label>`).join('')
          + '</fieldset>')
        + '<label class="pf-nota">Nota <small>(facoltativa)</small><textarea name="note" rows="2" maxlength="500"></textarea></label>'
        + (x.ruolo === 'interno' ? ''
          : `<label class="pf-spunta pf-condividi"><input type="checkbox" name="condividi" checked> Mostra la nota a ${esc(x.venditore)}</label>`
            + `<p class="aiuto pf-avviso-venditore">Esito e voto arrivano comunque a ${esc(x.venditore)} con una notifica e nella scheda del cliente.</p>`)
        + '<p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Registra la chiamata</button></div></form></li>';
    });
    h += '</ul></div>';
    if (dati.chiamateFatte.length) {
      h += '<div class="blocco"><h3>Chiamate fatte</h3><ul class="lista-clienti">' + dati.chiamateFatte.map(f =>
        `<li><div class="cliente-testa"><strong>${esc(f.ragione)}</strong><span class="pf-proprietario esito-${esc(f.esito)}">${esc(ESITI[f.esito] || f.esito)}${f.voto ? ' · ' + f.voto + '/5' : ''}</span></div>`
        + `<p class="cliente-dati">dopo il ${f.dopo_ordine}° ordine · ${esc(f.venditore || '')} · ${esc(dataIt(f.fatta_il))}${f.da ? ' · ' + esc(f.da) : ''}</p>`
        + (f.note ? `<p class="cliente-note">${esc(f.note)}${f.nota_al_venditore === false && f.esito !== 'non_raggiunto' ? ' <small class="nota-riservata">nota non mostrata al venditore</small>' : ''}</p>` : '') + '</li>').join('') + '</ul></div>';
    }
    corpo.innerHTML = h;
    corpo.querySelectorAll('.pf-chiamata').forEach(f => {
      // con «non raggiunto» il voto non serve
      f.addEventListener('change', () => { const v = f.querySelector('.voto'); if (v) v.hidden = (new FormData(f).get('esito') === 'non_raggiunto'); });
      f.addEventListener('submit', ev => {
        ev.preventDefault();
        const d = new FormData(f), err = f.querySelector('.errore');
        const esito = d.get('esito'), voto = d.get('voto') ? Number(d.get('voto')) : null;
        if (!esito) { err.textContent = 'Scegli com’è andata.'; err.hidden = false; return; }
        if (['positivo', 'neutro', 'negativo'].includes(esito) && !voto) { err.textContent = 'Dai il voto del cliente, da 1 a 5.'; err.hidden = false; return; }
        salva(f.querySelector('button[type=submit]'), () => sb.rpc('registra_chiamata', {
          p_cliente: f.dataset.cliente, p_dopo_ordine: Number(f.dataset.dopo), p_esito: esito, p_voto: ['positivo', 'neutro', 'negativo'].includes(esito) ? voto : null,
          p_note: String(d.get('note') || '').trim() || null, p_condividi: d.get('condividi') === 'on' }),
          esito === 'non_raggiunto' ? `${f.dataset.ragione}: da richiamare` : `Chiamata a ${f.dataset.ragione} registrata`);
      });
    });
  }

  /* ---------------------------------------------------------------- clienti
     Dal 24/10/2026. Tutti i clienti: quelli DIRETTI, seguiti da Pro Farmer
     (intestati al venditore interno), e quelli di agenti e rivenditori.
     Una P.IVA è di un solo venditore; da qui Pro Farmer sposta un cliente
     (per esempio da un agente ai diretti). Gli ordini già fatti restano a
     chi li ha mandati: si sposta solo il cliente, per i prossimi. */
  function clienti(corpo) {
    const diretti = new Set(dati.venditori.filter(x => x.ruolo === 'interno').map(x => x.id));
    const lista = dati.clienti.filter(c => diChi(c.venditore_id));
    const nDiretti = dati.clienti.filter(c => diretti.has(c.venditore_id)).length;
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Clienti</h3></div>'
      + `<p class="aiuto">${dati.clienti.length} clienti: ${nDiretti} diretti di Pro Farmer, ${dati.clienti.length - nDiretti} di agenti e rivenditori. `
      + 'I clienti diretti li segue Pro Farmer: li aggiungete e ordinate da «La mia area», come un venditore. '
      + 'Spostare un cliente vale per i prossimi ordini; quelli già fatti restano a chi li ha mandati.</p>'
      + '<div class="pf-filtri"><label>Di chi' + selectVenditore('pf-di-chi', filtroVenditore, true).replace('<select ', '<select id="pf-di-chi-clienti" ') + '</label>'
      + casellaCerca('clienti', 'Cerca ragione sociale, P.IVA, comune') + '</div>';
    if (!lista.length) h += '<p class="aiuto">Nessun cliente qui.</p>';
    h += '<ul class="lista-clienti" data-lista-di="clienti">';
    lista.forEach(c => {
      const ord = dati.ordini.filter(o => o.cliente_id === c.id && o.stato !== 'annullato');
      const luogo = [c.comune, c.provincia].filter(Boolean).join(' · ');
      const diretto = diretti.has(c.venditore_id);
      h += `<li data-cerca="${esc([c.ragione, c.piva, c.indirizzo, c.comune, c.provincia, c.referente, nomeVenditore(c.venditore_id)].join(' '))}">`
        + `<form class="pf-cliente" data-id="${esc(c.id)}" data-prima="${esc(c.venditore_id)}" novalidate>`
        + `<div class="cliente-testa"><strong>${esc(c.ragione)}</strong><span class="pf-proprietario${diretto ? ' diretto' : ''}">${esc(diretto ? 'Diretto Pro Farmer' : nomeVenditore(c.venditore_id))}</span></div>`
        + `<p class="cliente-indirizzo">${esc([c.indirizzo, luogo.replace(' · ', ' ')].filter(Boolean).join(', ') || 'Indirizzo da completare')}</p>`
        + `<p class="cliente-dati">${esc(['P.IVA ' + c.piva, c.telefono, c.referente].filter(Boolean).join(' · '))}</p>`
        + `<p class="cliente-dati">${ord.length ? `${ord.length} ${ord.length === 1 ? 'ordine' : 'ordini'}, l’ultimo il ${esc(dataIt(ord[0].creato_il))}` : 'Nessun ordine'}</p>`
        + '<div class="pf-campi"><label>Assegnato a' + selectVenditore('venditore_id', c.venditore_id, false) + '</label></div>'
        + '<p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone" disabled>Sposta</button></div>'
        + '</form></li>';
    });
    h += '</ul></div>';
    corpo.innerHTML = h;
    document.getElementById('pf-di-chi-clienti').addEventListener('change', ev => { filtroVenditore = ev.target.value; mostra(); });
    // «Sposta» si accende solo se l'assegnazione cambia davvero
    corpo.querySelectorAll('.pf-cliente').forEach(f => f.addEventListener('change', () => {
      f.querySelector('button[type=submit]').disabled = new FormData(f).get('venditore_id') === f.dataset.prima;
    }));
    corpo.querySelectorAll('.pf-cliente').forEach(f => f.addEventListener('submit', ev => {
      ev.preventDefault();
      const nuovo = new FormData(f).get('venditore_id');
      if (nuovo === f.dataset.prima) return;
      const ragione = f.querySelector('strong').textContent;
      if (!confirm(`Sposto ${ragione} a ${nomeVenditore(nuovo)}? Il venditore di prima non lo vedrà più; gli ordini già fatti restano suoi.`)) return;
      salva(f.querySelector('button[type=submit]'), () => sb.from('clienti').update({ venditore_id: nuovo }).eq('id', f.dataset.id), `${ragione} spostato`);
    }));
  }

  /* ------------------------------------------------------------------ premi
     Dal 25/10/2026: i Diamanti piùLact degli agenti (15-diamanti.sql).
     Buoni da approvare, agenti che hanno smesso, bonus a mano, classifica e
     traguardi. Dal 25/10/2026 i diamanti si riscattano solo in buoni acquisto
     (1 diamante = 4 €, buoni da 100 €: 20-diamanti-riscatto.sql); il catalogo
     premi non si usa più. Approvare scala i diamanti; rifiutare li
     restituisce. Cambiare i traguardi vale da ora in poi. */
  // azzurro = 1, viola = 10: come nell'area dell'agente (venditori.js)
  const GEMMA = c => `<svg class="gemma gemma-${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l5 6-10 12L2 9z"/><path class="gemma-luce" d="M7 3l2.6 6L12 3l2.4 6L17 3M2 9h20M9.6 9L12 21l2.4-12"/></svg>`;
  function gemme(n) {
    n = Math.max(0, Math.round(Math.abs(Number(n) || 0)));
    const viola = Math.floor(n / 10), azzurri = n % 10;
    if (!n) return `<span class="gemme">0 ${GEMMA('azzurra')}</span>`;
    const icone = viola + azzurri <= 8 ? GEMMA('viola').repeat(viola) + GEMMA('azzurra').repeat(azzurri)
      : (viola ? `${GEMMA('viola')}×${viola} ` : '') + (azzurri ? `${GEMMA('azzurra')}×${azzurri}` : '');
    return `<span class="gemme" title="${n} diamanti">${icone}</span>`;
  }

  function premi(corpo) {
    const D = dati.diamanti;
    const aperte = D.richieste.filter(r => r.stato === 'richiesto' || r.stato === 'approvato');
    const STATO = { richiesto: 'Da approvare', approvato: 'Approvato, da mandare', consegnato: 'Mandato', rifiutato: 'Rifiutato' };
    const euro = Number(D.euro) || 4, taglio = Number(D.taglio) || 25;
    let h = '<div class="blocco"><h3>Buoni da approvare</h3>';
    if (!aperte.length) h += '<p class="aiuto">Nessuna richiesta aperta.</p>';
    h += '<ul class="lista-clienti">';
    aperte.forEach(r => {
      h += `<li><div class="cliente-testa"><strong>${esc(r.premio)}</strong><span class="pf-proprietario">${esc(STATO[r.stato])}</span></div>`
        + `<p class="cliente-dati">${esc(r.nome)} · ${gemme(r.costo)} ${r.costo} · ${esc(dataIt(r.creato_il))}</p>`
        + '<p class="errore" hidden></p><div class="azioni pf-azioni">'
        + (r.stato === 'richiesto'
          ? `<button type="button" class="bottone" data-decidi="${esc(r.id)}" data-stato="approvato">Approva</button>`
            + `<button type="button" class="bottone bottone-fantasma" data-decidi="${esc(r.id)}" data-stato="rifiutato">Rifiuta</button>`
          : `<button type="button" class="bottone" data-decidi="${esc(r.id)}" data-stato="consegnato">Segna mandato</button>`)
        + '</div></li>';
    });
    h += '</ul></div>';

    // chi ha smesso: 30 giorni per il buono, lo chiede Pro Farmer per lui
    if ((D.cessati || []).length) {
      h += '<div class="blocco"><h3>Agenti che hanno smesso</h3><p class="aiuto">Non entrano più nell’app: '
        + 'se vogliono il buono lo chiedete voi per loro, entro la data. Poi i diamanti decadono da soli.</p><ul class="lista-clienti">';
      D.cessati.forEach(a => {
        const tagli = Math.floor(a.saldo / taglio);
        h += `<li><div class="cliente-testa"><strong>${esc(a.nome)}</strong><span class="pf-proprietario">fino al ${esc(a.scade_il)}</span></div>`
          + `<p class="cliente-dati">${gemme(a.saldo)} ${a.saldo} diamanti</p>`
          + (tagli >= 1
            ? `<div class="pf-campi"><label>Buono<select class="pf-select" data-tagli-di="${esc(a.id)}">`
              + Array.from({ length: Math.min(tagli, 8) }, (_, i) => `<option value="${i + 1}">${(i + 1) * taglio * euro} € (${(i + 1) * taglio} diamanti)</option>`).join('')
              + `</select></label></div><p class="errore" hidden></p><div class="azioni pf-azioni"><button type="button" class="bottone" data-buono-per="${esc(a.id)}" data-nome="${esc(a.nome)}">Chiedi il buono per lui</button></div>`
            : `<p class="aiuto">Non arriva a ${taglio} diamanti: niente buono.</p>`)
          + '</li>';
      });
      h += '</ul></div>';
    }

    // bonus a mano
    h += '<div class="blocco"><h3>Bonus a mano</h3><form id="pf-bonus" novalidate><div class="pf-campi">'
      + '<label>Agente<select name="agente" class="pf-select">' + D.agenti.map(a => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('') + '</select></label>'
      + '<label>Diamanti <small>(negativo per togliere)</small><input name="quanti" type="number" step="1" min="-100" max="100" value="1"></label>'
      + '<label class="pf-largo">Motivo<input name="motivo" maxlength="200" placeholder="es. fiera di Cremona, cliente importante"></label>'
      + '</div><p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Assegna</button></div></form></div>';

    // il feedback positivo ora nasce dalle Chiamate (17-chiamate-feedback.sql)
    h += '<div class="blocco"><h3>Feedback positivo</h3><p class="aiuto">Si assegna da solo quando registrate una chiamata '
      + 'con esito positivo nella scheda <strong>Chiamate</strong>: dopo il 1° ordine consegnato di un cliente, dopo il 3° e poi ogni due ordini.</p></div>';

    // classifica
    const cl = D.agenti.slice().sort((a, b) => b.vinti_anno - a.vinti_anno || a.nome.localeCompare(b.nome));
    h += '<div class="blocco"><h3>Classifica agenti</h3><p class="aiuto">Diamanti vinti quest’anno; tra parentesi il saldo da spendere. Gli agenti vedono solo nomi e diamanti vinti.</p><ol class="classifica">'
      + cl.map((a, i) => `<li><span class="classifica-pos">${i + 1}</span><span class="classifica-nome">${esc(a.nome)}</span><b>${gemme(a.vinti_anno)} <small>${a.vinti_anno} (saldo ${a.saldo})</small></b></li>`).join('')
      + '</ol></div>';

    // traguardi
    h += '<div class="blocco"><h3>Traguardi</h3><p class="aiuto">Valgono gli ordini consegnati. Cambiare i diamanti vale da ora in poi.</p><ul class="lista-clienti">';
    dati.traguardi.filter(t => !['bonus', 'scadenza', 'riscatto'].includes(t.codice)).forEach(t => {
      h += `<li><form class="pf-traguardo" data-codice="${esc(t.codice)}" novalidate>`
        + `<div class="cliente-testa"><strong>${esc(t.nome)}</strong></div><p class="cliente-dati">${esc(t.descrizione)}</p><div class="pf-campi">`
        + `<label>Diamanti<input name="diamanti" type="number" min="0" max="1000" step="1" value="${t.diamanti}"></label>`
        + (t.codice === 'volume' ? `<label>Soglia (t nel trimestre)<input name="soglia" type="number" min="1" step="0.5" value="${v(t.soglia)}"></label>` : '')
        + `<label class="pf-spunta"><input type="checkbox" name="attivo"${t.attivo ? ' checked' : ''}> Attivo</label>`
        + '</div><p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Salva</button></div></form></li>';
    });
    h += '</ul></div>';

    if (D.movimenti.length) {
      h += '<div class="blocco"><h3>Ultimi movimenti</h3><ul class="cr-eventi">' + D.movimenti.slice(0, 20).map(m =>
        `<li><button type="button" tabindex="-1"><span class="cr-tipo cr-cliente"></span><span class="cr-testo">${esc(m.nome)}: ${m.quanti > 0 ? '+' : '−'}${gemme(m.quanti)}<small>${esc(m.motivo)}</small></span><time>${esc(quandoBreve(m.creato_il))}</time></button></li>`).join('')
        + '</ul></div>';
    }
    corpo.innerHTML = h;

    corpo.querySelectorAll('[data-decidi]').forEach(b => b.addEventListener('click', () => {
      const parole = { approvato: 'Approvo la richiesta? I diamanti vengono scalati.', rifiutato: 'Rifiuto la richiesta? I diamanti restano all’agente.', consegnato: 'Segno il buono come mandato all’agente?' };
      if (!confirm(parole[b.dataset.stato])) return;
      salva(b, () => sb.rpc('decidi_premio', { p_richiesta: b.dataset.decidi, p_stato: b.dataset.stato, p_note: null }),
        { approvato: 'Buono approvato', rifiutato: 'Richiesta rifiutata', consegnato: 'Buono mandato' }[b.dataset.stato]);
    }));
    const fb = document.getElementById('pf-bonus');
    if (fb) fb.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = new FormData(fb), q = Math.trunc(Number(d.get('quanti'))), motivo = String(d.get('motivo') || '').trim();
      const err = fb.querySelector('.errore');
      if (!q || Math.abs(q) > 100) { err.textContent = 'Da 1 a 100 diamanti (negativo per togliere).'; err.hidden = false; return; }
      if (motivo.length < 3) { err.textContent = 'Scrivi il motivo: l’agente lo vede.'; err.hidden = false; return; }
      const nome = (D.agenti.find(a => a.id === d.get('agente')) || {}).nome;
      salva(fb.querySelector('button'), () => sb.rpc('bonus_diamanti', { p_venditore: d.get('agente'), p_quanti: q, p_motivo: motivo }),
        `${q > 0 ? "+" : ""}${q} diamanti a ${nome}`);
    });
    corpo.querySelectorAll('[data-buono-per]').forEach(b => b.addEventListener('click', () => {
      const tagli = Number(corpo.querySelector(`[data-tagli-di="${b.dataset.buonoPer}"]`).value);
      if (!confirm(`Chiedo per ${b.dataset.nome} un buono da ${tagli * taglio * euro} €? I diamanti vengono scalati subito.`)) return;
      salva(b, () => sb.rpc('buono_per', { p_venditore: b.dataset.buonoPer, p_tagli: tagli }), `Buono da ${tagli * taglio * euro} € per ${b.dataset.nome}`);
    }));
    corpo.querySelectorAll('.pf-traguardo').forEach(f => f.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = new FormData(f);
      const riga = { diamanti: Math.max(0, Math.trunc(Number(d.get('diamanti')) || 0)), attivo: d.get('attivo') === 'on' };
      if (d.has('soglia')) riga.soglia = Number(d.get('soglia')) || null;
      salva(f.querySelector('button'), () => sb.from('traguardi').update(riga).eq('codice', f.dataset.codice), 'Traguardo salvato');
    }));
  }

  /* ------------------------------------------------------------- allevatori
     Dal 24/10/2026. Gli allevatori che hanno Riposa sul telefono: chi ha le
     notifiche, chi sta per finire il prodotto (lead caldi), e i messaggi da
     mandargli: novità, offerte, consigli. Li manda il database ogni 15 minuti
     (giro_allevatori), a tutti o a una provincia, subito o alla data scelta. */
  const TIPI_MESSAGGIO = { novita: 'Novità', offerta: 'Offerta', consiglio: 'Consiglio d’uso' };

  function dataBreve(iso) {
    if (!iso) return '';
    const [a, m, g] = String(iso).slice(0, 10).split('-');
    return `${g}/${m}/${a}`;
  }

  function allevatori(corpo) {
    const tutti = dati.allevatori;
    const conNotifiche = tutti.filter(a => a.notifiche).length;
    const fra = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString('sv-SE'); };
    const caldi = tutti.filter(a => a.avviso_il && a.avviso_il <= fra(14));
    const province = [...new Set(tutti.map(a => a.provincia).filter(Boolean))].sort();

    let h = '<div class="blocco"><h3>Allevatori con Riposa</h3>'
      + '<dl class="numeri soldi">'
      + `<div class="numero-cella"><dt>Con l’app</dt><dd>${tutti.length}</dd></div>`
      + `<div class="numero-cella"><dt>Notifiche attive</dt><dd>${conNotifiche}</dd></div>`
      + `<div class="numero-cella"><dt>Stanno per finire</dt><dd>${caldi.length}<small>nei prossimi 14 giorni</small></dd></div>`
      + '</dl>';
    h += '<p class="aiuto">Un allevatore è qui quando ha mandato il calcolo dal telefono. Se ci dice la scorta, '
      + '10 giorni prima che finisca il prodotto avvisiamo lui e voi: è il momento di chiamarlo.</p>';
    if (caldi.length) {
      h += '<h4>Stanno per finire</h4><ul class="lista-clienti">';
      caldi.forEach(a => {
        h += `<li><div class="cliente-testa"><strong>${esc(a.azienda || '—')}</strong><span>${esc(a.provincia || '')}</span></div>`
          + `<p class="cliente-dati">${esc([a.nome, a.prodotto, a.scorta_pezzi && `${a.scorta_pezzi} ${a.formato || 'pezzi'} dal ${dataBreve(a.consegna_il)}`].filter(Boolean).join(' · '))}</p>`
          + `<p class="cliente-dati"><strong>Avviso il ${esc(dataBreve(a.avviso_il))}</strong>${a.avvisato_il ? ' · avvisato' : ''}`
          + `${a.notifiche ? '' : ' · senza notifiche: chiamatelo voi'}</p></li>`;
      });
      h += '</ul>';
    }
    h += '</div>';

    // i messaggi
    h += '<div class="blocco"><h3>Manda un messaggio agli allevatori</h3>'
      + `<p class="aiuto">Arriva come notifica sul telefono di chi le ha attivate (oggi ${conNotifiche}). `
      + 'Breve: il titolo si legge sulla schermata bloccata.</p>'
      + '<form id="pf-messaggio" novalidate><div class="pf-campi">'
      + '<label>Tipo<select name="tipo" class="pf-select">'
      + Object.entries(TIPI_MESSAGGIO).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('') + '</select></label>'
      + '<label>A chi<select name="provincia" class="pf-select"><option value="">Tutti</option>'
      + province.map(p => `<option value="${esc(p)}">Solo provincia ${esc(p)}</option>`).join('') + '</select></label>'
      + '<label class="pf-largo">Titolo <small>(max 80 caratteri)</small><input name="titolo" maxlength="80"></label>'
      + '<label class="pf-largo">Testo <small>(max 300 caratteri)</small><textarea name="testo" rows="3" maxlength="300"></textarea></label>'
      + `<label>Quando<input type="datetime-local" name="quando"><small>Vuoto = subito (entro 15 minuti)</small></label>`
      + '</div><p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Programma il messaggio</button></div></form>';
    if (dati.messaggi.length) {
      h += '<h4 style="margin-top:22px">Messaggi</h4><ul class="lista-clienti">';
      dati.messaggi.forEach(m => {
        const stato = m.mandato_il ? `Mandato il ${dataIt(m.mandato_il)} a ${m.destinatari || 0}`
          : `Programmato per il ${dataIt(m.programmato_il)} alle ${new Date(m.programmato_il).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
        h += `<li><div class="cliente-testa"><strong>${esc(m.titolo)}</strong><span>${esc(TIPI_MESSAGGIO[m.tipo] || m.tipo)}${m.provincia ? ' · ' + esc(m.provincia) : ''}</span></div>`
          + `<p class="cliente-dati">${esc(m.testo)}</p><p class="cliente-dati">${esc(stato)}</p>`
          + (m.mandato_il ? '' : `<div class="azioni pf-azioni"><button type="button" class="bottone bottone-fantasma pf-piccolo" data-togli-messaggio="${esc(m.id)}">Annulla</button></div><p class="errore" hidden></p>`)
          + '</li>';
      });
      h += '</ul>';
    }
    h += '</div>';
    corpo.innerHTML = h;

    const f = document.getElementById('pf-messaggio');
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = new FormData(f);
      const riga = {
        tipo: d.get('tipo'), provincia: nulloSeVuoto(d.get('provincia')),
        titolo: String(d.get('titolo') || '').trim(), testo: String(d.get('testo') || '').trim()
      };
      const quando = String(d.get('quando') || '');
      if (quando) riga.programmato_il = new Date(quando).toISOString();
      const err = f.querySelector('.errore');
      if (riga.titolo.length < 3 || riga.testo.length < 3) { err.textContent = 'Servono il titolo e il testo.'; err.hidden = false; return; }
      const a = riga.provincia ? `agli allevatori di ${riga.provincia}` : 'a tutti gli allevatori con le notifiche';
      if (!confirm(`Mando «${riga.titolo}» ${a}${quando ? ' alla data scelta' : ' entro 15 minuti'}?`)) return;
      salva(f.querySelector('button[type=submit]'), () => sb.from('messaggi_allevatori').insert(riga), 'Messaggio programmato');
    });
    corpo.querySelectorAll('[data-togli-messaggio]').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Annullo questo messaggio? Non partirà.')) return;
      salva(b, () => sb.from('messaggi_allevatori').delete().eq('id', b.dataset.togliMessaggio).is('mandato_il', null));
    }));
  }

  /* ------------------------------------------------------------ provvigioni */

  /* La regola di Giulio (26/10/2026): in attesa di pagamento finché il cliente
     non paga Pro Farmer; da fatturare quando ha pagato; saldata quando Pro
     Farmer paga l'agente, vista la fattura (la data). Gli annullati non contano. */
  function provvigioni(corpo) {
    const agenti = dati.venditori.filter(x => x.ruolo === 'agente');
    let h = '<div class="blocco"><h3>Provvigioni degli agenti</h3>'
      + '<p class="aiuto">In attesa di pagamento: il cliente non ha ancora pagato Pro Farmer. Da fatturare: ha pagato, l’agente ha avuto la notifica e manda la fattura. '
      + 'Quando la fattura arriva nel cassetto fiscale, «Saldate oggi» mette la data di oggi su tutte quelle da fatturare di quell’agente.</p>'
      + '<div class="ordine-scorri"><table class="tabella ordine-conto"><thead><tr><th>Agente</th><th>In attesa di pagamento</th><th>Da fatturare</th><th>Saldate</th><th></th></tr></thead><tbody>';
    agenti.forEach(a => {
      const suoi = dati.ordini.filter(o => o.venditore_id === a.id && o.stato !== 'annullato');
      const somma = l => l.reduce((s, o) => s + Number(o.provvigione || 0), 0);
      const liq = suoi.filter(o => o.provvigione_liquidata_il);
      const mat = suoi.filter(o => o.stato === 'pagato' && !o.provvigione_liquidata_il);
      const inc = suoi.filter(o => o.stato !== 'pagato' && !o.provvigione_liquidata_il);
      h += `<tr><th>${esc(a.nome)}</th><td>${euro(somma(inc))}</td><td><strong>${euro(somma(mat))}</strong></td><td>${euro(somma(liq))}</td>`
        + `<td>${mat.length ? `<button type="button" class="bottone bottone-fantasma pf-piccolo" data-liquida="${esc(a.id)}">Saldate oggi</button>` : ''}</td></tr>`;
    });
    h += '</tbody></table></div><p class="errore" hidden></p></div>';
    corpo.innerHTML = h;
    corpo.querySelectorAll('[data-liquida]').forEach(b => b.addEventListener('click', () => {
      const ids = dati.ordini.filter(o => o.venditore_id === b.dataset.liquida && o.stato === 'pagato' && !o.provvigione_liquidata_il).map(o => o.id);
      if (!confirm(`Fattura ricevuta: segno saldate ${ids.length} ${ids.length === 1 ? 'provvigione' : 'provvigioni'} con la data di oggi?`)) return;
      salva(b, () => sb.from('ordini').update({ provvigione_liquidata_il: oggi() }).in('id', ids));
    }));
  }

  /* -------------------------------------------------------------- venditori */

  function campo(nome, etichetta, valore, tipo, extra, classe) {
    return `<label${classe ? ` class="${classe}"` : ''}>${esc(etichetta)}<input name="${nome}" type="${tipo || 'text'}" value="${esc(v(valore))}"${extra || ''}></label>`;
  }

  function moduloVenditore(x) {
    const nuovo = !x.id;
    let h = `<form class="pf-venditore" data-id="${esc(x.id || '')}" data-ruolo="${esc(x.ruolo)}" novalidate><div class="pf-campi">`
      + campo('nome', 'Nome', x.nome)
      + '<label>Ruolo<select name="ruolo" class="pf-select">'
      + Object.entries(RUOLI).map(([k, n]) => `<option value="${k}"${x.ruolo === k ? ' selected' : ''}>${n}</option>`).join('') + '</select></label>'
      + campo('email', 'E-mail (per entrare)', x.email, 'email', ' autocapitalize="off"')
      + campo('telefono', 'Telefono', x.telefono, 'tel')
      + campo('prezzo_bigbag', 'piùLact big bag: paga €/t', x.prezzo_bigbag, 'number', ' step="0.01" min="0"', 'solo-rivenditore')
      + campo('prezzo_sacchi', 'piùLact sacchi: paga €/t', x.prezzo_sacchi, 'number', ' step="0.01" min="0"', 'solo-rivenditore')
      + campo('provvigione_perc', 'Provvigione piùLact %', x.provvigione_perc, 'number', ' step="0.1" min="0" max="100"', 'solo-agente')
      + campo('valide_fino', 'Condizioni valide fino al', x.valide_fino, 'date', '', 'non-interno')
      + `<label class="pf-spunta"><input type="checkbox" name="attivo"${x.attivo !== false ? ' checked' : ''}> Attivo (può entrare)</label>`
      + campo('province', 'Zona: province o regioni (es. LO, CR, Emilia-Romagna)', (x.province || []).join(', '), 'text', '', 'non-interno')
      + '<label class="solo-agente">Presentato da <small>(l’agente che l’ha portato: vale per i Diamanti)</small><select name="presentato_da" class="pf-select">'
      + '<option value="">Nessuno</option>' + dati.venditori.filter(a => a.ruolo === 'agente' && a.id !== x.id)
        .map(a => `<option value="${esc(a.id)}"${x.presentato_da === a.id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('') + '</select></label>'
      + `<label class="pf-largo">Note interne<textarea name="note" rows="2">${esc(v(x.note))}</textarea></label>`
      + '</div>';
    if (!nuovo) {
      h += '<p class="cliente-dati">' + (x.invitato_il ? `Invito mandato il ${esc(dataIt(x.invitato_il))}.` : 'Invito non ancora mandato.')
        + (x.valide_fino && x.valide_fino < oggi() ? ' <strong>Condizioni scadute: vede il promemoria.</strong>' : '') + '</p>';
    }
    h += '<p class="errore" hidden></p><div class="azioni pf-azioni">'
      + `<button type="submit" class="bottone">${nuovo ? 'Aggiungi' : 'Salva'}</button>`
      + (!nuovo && x.email && x.attivo ? `<button type="button" class="bottone bottone-fantasma" data-invita>${x.invitato_il ? 'Rimanda l’invito' : 'Manda l’invito'}</button>` : '')
      + '</div></form>';
    return h;
  }

  function venditori(corpo) {
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Venditori</h3>'
      + '<button type="button" class="bottone" id="pf-nuovo-venditore">Aggiungi venditore</button></div>'
      + '<p class="aiuto">Si entra con l’e-mail scritta qui: senza e-mail il venditore non può entrare. '
      + 'Dopo aver messo l’e-mail, «Manda l’invito» gli crea l’accesso e gli spiega come entrare. '
      + 'Togliere «Attivo» chiude l’accesso senza cancellare niente. Passata la data di validità non si blocca nulla: '
      + 'il venditore vede solo il promemoria.</p>'
      + '<div id="pf-venditore-nuovo"></div>' + casellaCerca('venditori', 'Cerca nome o e-mail')
      + '<ul class="lista-clienti" data-lista-di="venditori">';
    // chiusi: si apre solo quello da modificare
    dati.venditori.forEach(x => {
      const sotto = [RUOLI[x.ruolo], x.email || 'senza e-mail', x.attivo ? '' : 'non attivo'].filter(Boolean).join(' · ');
      h += `<li data-cerca="${esc([x.nome, x.email, RUOLI[x.ruolo]].join(' '))}"><details class="pf-dettagli" data-id="${esc(x.id)}"${aperti.has(x.id) ? ' open' : ''}>`
        + `<summary><span class="pf-sommario"><strong>${esc(x.nome)}</strong><span>${esc(sotto)}</span></span>`
        + '<svg class="pf-freccia" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>'
        + moduloVenditore(x) + '</details></li>';
    });
    h += '</ul></div>';
    corpo.innerHTML = h;
    document.getElementById('pf-nuovo-venditore').addEventListener('click', () => {
      const n = document.getElementById('pf-venditore-nuovo');
      n.innerHTML = '<div class="cliente-modulo"><h4>Nuovo venditore</h4>'
        + moduloVenditore({ ruolo: 'agente', attivo: true, provvigione_perc: 10, valide_fino: '2026-12-31' }) + '</div>';
      aggancia(n);
    });
    aggancia(corpo);
    corpo.querySelectorAll('.pf-dettagli').forEach(d => d.addEventListener('toggle', () => {
      if (d.open) aperti.add(d.dataset.id); else aperti.delete(d.dataset.id);
    }));

    function aggancia(dove) {
      dove.querySelectorAll('.pf-venditore').forEach(f => {
        if (f.dataset.agganciato) return;
        f.dataset.agganciato = '1';
        // i campi delle condizioni seguono il ruolo scelto
        f.ruolo.addEventListener('change', () => { f.dataset.ruolo = f.ruolo.value; });
        f.addEventListener('submit', ev => {
          ev.preventDefault();
          const d = new FormData(f);
          const riga = {
            nome: String(d.get('nome') || '').trim(),
            ruolo: d.get('ruolo'),
            email: nulloSeVuoto(String(d.get('email') || '').trim().toLowerCase()),
            telefono: nulloSeVuoto(String(d.get('telefono') || '').trim()),
            prezzo_bigbag: nulloSeVuoto(d.get('prezzo_bigbag')),
            prezzo_sacchi: nulloSeVuoto(d.get('prezzo_sacchi')),
            provvigione_perc: nulloSeVuoto(d.get('provvigione_perc')),
            valide_fino: nulloSeVuoto(d.get('valide_fino')),
            attivo: d.get('attivo') === 'on',
            note: nulloSeVuoto(String(d.get('note') || '').trim()),
            presentato_da: d.get('ruolo') === 'agente' ? nulloSeVuoto(d.get('presentato_da')) : null,
            // le zone dell'agente: i lead di queste province gli vengono proposti (22-lead-agli-agenti.sql)
            province: d.get('ruolo') === 'interno' ? [] : leggiZona(d.get('province')).zona
          };
          const nonCapite = d.get('ruolo') === 'interno' ? [] : leggiZona(d.get('province')).scartati;
          const err = f.querySelector('.errore');
          if (!riga.nome) { err.textContent = 'Serve il nome.'; err.hidden = false; return; }
          if (nonCapite.length) { err.textContent = `Nella zona non riconosco: ${nonCapite.join(', ')}. Scrivi la sigla della provincia (LO) o il nome della regione (Lombardia).`; err.hidden = false; return; }
          if (riga.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(riga.email)) { err.textContent = 'L’e-mail non sembra valida.'; err.hidden = false; return; }
          const id = f.dataset.id;
          if (id) aperti.delete(id);   // salvata, la scheda si chiude
          salva(f.querySelector('button[type=submit]'), () => id
            ? sb.from('venditori').update(riga).eq('id', id)
            : sb.from('venditori').insert(riga), id ? `Scheda di ${riga.nome} salvata` : `${riga.nome} aggiunto ai venditori`);
        });
        const inv = f.querySelector('[data-invita]');
        if (inv) inv.addEventListener('click', () => { aperti.delete(f.dataset.id); salva(inv, () =>
          sb.functions.invoke('invita', { body: { id: f.dataset.id } }).then(x => {
            if (x.error) throw new Error('invito non partito, riprova più tardi');
          }), 'Invito mandato'); });
      });
    }
  }

  /* ------------------------------------------------------------- condizioni */

  function condizioni(corpo) {
    const c = dati.condizioni || {};
    const perc = x => x === null || x === undefined ? '' : Math.round(x * 1000) / 10;
    let h = '<div class="blocco"><h3>Condizioni uguali per tutti</h3>'
      + '<p class="aiuto">Prezzi franco partenza, IVA esclusa. Le condizioni personali (prezzi dei rivenditori, provvigione '
      + 'degli agenti sul piùLact) stanno in Venditori. Valgono dal prossimo ordine: quelli già inviati non cambiano.</p>'
      + '<form id="pf-condizioni" novalidate><div class="pf-campi">'
      + campo('listino_bigbag', 'Listino piùLact big bag €/t', c.listino_bigbag, 'number', ' step="0.01"')
      + campo('listino_sacchi', 'Listino piùLact sacchi €/t', c.listino_sacchi, 'number', ' step="0.01"')
      + campo('listino_ballette_q', 'Listino ballette €/q', c.listino_ballette / 10, 'number', ' step="0.01"')
      + campo('sconto_riv_ballette', 'Ballette, sconto rivenditore %', perc(c.sconto_riv_ballette), 'number', ' step="0.1"')
      + campo('sconto_riv_ballette_ann', 'Ballette, sconto rivenditore annuale %', perc(c.sconto_riv_ballette_ann), 'number', ' step="0.1"')
      + campo('provv_ag_ballette', 'Ballette, provvigione agente %', perc(c.provv_ag_ballette), 'number', ' step="0.1"')
      + campo('provv_ag_ballette_ann', 'Ballette, provvigione agente annuale %', perc(c.provv_ag_ballette_ann), 'number', ' step="0.1"')
      + campo('minimo_bigbag', 'Ordine minimo big bag', c.minimo_bigbag, 'number', ' step="1"')
      + campo('minimo_sacchi', 'Ordine minimo bancali sacchi', c.minimo_sacchi, 'number', ' step="1"')
      + campo('minimo_ballette', 'Ordine minimo ballette', c.minimo_ballette, 'number', ' step="1"')
      + campo('kg_ballette', 'Peso di una balletta, kg (stima)', c.kg_ballette, 'number', ' step="1"')
      + '</div><p class="errore" hidden></p><div class="azioni pf-azioni"><button type="submit" class="bottone">Salva</button></div></form></div>';
    corpo.innerHTML = h;
    const f = document.getElementById('pf-condizioni');
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const d = new FormData(f);
      const n = k => Number(d.get(k));
      const riga = {
        listino_bigbag: n('listino_bigbag'), listino_sacchi: n('listino_sacchi'), listino_ballette: n('listino_ballette_q') * 10,
        sconto_riv_ballette: n('sconto_riv_ballette') / 100, sconto_riv_ballette_ann: n('sconto_riv_ballette_ann') / 100,
        provv_ag_ballette: n('provv_ag_ballette') / 100, provv_ag_ballette_ann: n('provv_ag_ballette_ann') / 100,
        minimo_bigbag: n('minimo_bigbag'), minimo_sacchi: n('minimo_sacchi'), minimo_ballette: n('minimo_ballette'),
        kg_ballette: n('kg_ballette'), aggiornato_il: new Date().toISOString()
      };
      if (Object.values(riga).some(x => typeof x === 'number' && !(x > 0))) {
        const err = f.querySelector('.errore'); err.textContent = 'Tutti i valori devono essere numeri maggiori di zero.'; err.hidden = false; return;
      }
      salva(f.querySelector('button[type=submit]'), () => sb.from('condizioni_generali').update(riga).eq('id', 1));
    });
  }

  /* -------------------------------------------------------------- materiali */

  function moduloMateriale(m) {
    return `<form class="pf-materiale" data-id="${esc(m.id || '')}" novalidate><div class="pf-campi">`
      + campo('titolo', 'Titolo', m.titolo)
      + campo('link', 'Link (https://…)', m.link, 'url')
      + `<label class="pf-largo">Descrizione<textarea name="descrizione" rows="2">${esc(v(m.descrizione))}</textarea></label>`
      + '<label>Per chi<select name="per" class="pf-select">'
      + [['tutti', 'Tutti'], ['agente', 'Solo agenti'], ['rivenditore', 'Solo rivenditori'], ['interno', 'Solo Pro Farmer']]
        .map(([k, n]) => `<option value="${k}"${m.per === k ? ' selected' : ''}>${n}</option>`).join('') + '</select></label>'
      + campo('posizione', 'Posizione nell’elenco', m.posizione, 'number', ' step="1"')
      + `<label class="pf-spunta"><input type="checkbox" name="attivo"${m.attivo !== false ? ' checked' : ''}> Visibile</label>`
      + '</div><p class="errore" hidden></p><div class="azioni pf-azioni">'
      + `<button type="submit" class="bottone">${m.id ? 'Salva' : 'Aggiungi'}</button>`
      + (m.id ? '<button type="button" class="bottone bottone-fantasma" data-togli>Elimina</button>' : '')
      + '</div></form>';
  }

  function materiali(corpo) {
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Materiali</h3>'
      + '<button type="button" class="bottone" id="pf-nuovo-materiale">Aggiungi materiale</button></div>'
      + '<p class="aiuto">I documenti che i venditori aprono e mandano ai clienti. Solo link https, per esempio un PDF '
      + 'nella pagina materiali/ di Riposa o un file condiviso su Google Drive.</p>'
      + '<div id="pf-materiale-nuovo"></div><ul class="lista-clienti">';
    dati.materiali.forEach(m => { h += `<li>${moduloMateriale(m)}</li>`; });
    h += '</ul></div>';
    corpo.innerHTML = h;
    document.getElementById('pf-nuovo-materiale').addEventListener('click', () => {
      const n = document.getElementById('pf-materiale-nuovo');
      n.innerHTML = '<div class="cliente-modulo"><h4>Nuovo materiale</h4>'
        + moduloMateriale({ per: 'tutti', attivo: true, posizione: dati.materiali.length + 1 }) + '</div>';
      aggancia(n);
    });
    aggancia(corpo);

    function aggancia(dove) {
      dove.querySelectorAll('.pf-materiale').forEach(f => {
        if (f.dataset.agganciato) return;
        f.dataset.agganciato = '1';
        f.addEventListener('submit', ev => {
          ev.preventDefault();
          const d = new FormData(f);
          const riga = {
            titolo: String(d.get('titolo') || '').trim(), link: String(d.get('link') || '').trim(),
            descrizione: nulloSeVuoto(String(d.get('descrizione') || '').trim()), per: d.get('per'),
            posizione: Math.floor(Number(d.get('posizione')) || 0), attivo: d.get('attivo') === 'on'
          };
          const err = f.querySelector('.errore');
          if (!riga.titolo || !/^https:\/\/\S+$/.test(riga.link)) {
            err.textContent = 'Servono il titolo e un link che inizi con https://'; err.hidden = false; return;
          }
          const id = f.dataset.id;
          salva(f.querySelector('button[type=submit]'), () => id
            ? sb.from('materiali').update(riga).eq('id', id) : sb.from('materiali').insert(riga));
        });
        const t = f.querySelector('[data-togli]');
        if (t) t.addEventListener('click', () => {
          if (!confirm('Elimino questo materiale? I venditori non lo vedranno più.')) return;
          salva(t, () => sb.from('materiali').delete().eq('id', f.dataset.id));
        });
      });
    }
  }

  return { disegna };
})();
