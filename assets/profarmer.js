/* ============================================================================
   Riposa — GESTIONE PRO FARMER
   ----------------------------------------------------------------------------
   La pagina di Pro Farmer (ruolo "interno") dentro l'area venditori: prende
   il posto delle schede "Venditori", "Ordini", "Materiali" del foglio Google.
     Ordini      stato, data di liquidazione della provvigione, note interne,
                 e-mail partita o no (con "Rimanda")
     Provvigioni per agente: maturate da liquidare, con "Segna liquidate"
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
  let sezione = 'ordini';
  let dati = { ordini: [], venditori: [], condizioni: null, materiali: [] };
  let filtroStato = 'aperti';

  const SEZIONI = { ordini: 'Ordini', provvigioni: 'Provvigioni', venditori: 'Venditori',
                    condizioni: 'Condizioni', materiali: 'Materiali' };
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
      sb.from('materiali').select('*').order('posizione').order('creato_il')
    ]).then(([o, ve, c, m]) => {
      const err = [o, ve, c, m].find(x => x.error);
      if (err) throw new Error(err.error.message);
      dati = { ordini: o.data, venditori: ve.data, condizioni: c.data, materiali: m.data };
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
    box.querySelectorAll('[data-sezione]').forEach(b => b.addEventListener('click', () => { sezione = b.dataset.sezione; mostra(); }));
    const corpo = document.getElementById('pf-corpo');
    ({ ordini: ordini, provvigioni: provvigioni, venditori: venditori, condizioni: condizioni, materiali: materiali })[sezione](corpo);
  }

  /* Salva, ricarica e ridisegna; l'errore resta vicino al bottone. */
  function salva(bottone, lavoro) {
    const testo = bottone.textContent;
    const err = bottone.closest('form, li, .blocco').querySelector('.errore');
    bottone.disabled = true; bottone.textContent = 'Salvo…';
    return Promise.resolve().then(lavoro).then(r => {
      if (r && r.error) throw new Error(r.error.message);
      return carica();
    }).then(mostra).catch(e => {
      bottone.disabled = false; bottone.textContent = testo;
      if (err) { err.textContent = 'Non salvato: ' + e.message; err.hidden = false; }
    });
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
    const lista = dati.ordini.filter(o => filtroStato === 'tutti' ? true
      : filtroStato === 'aperti' ? !['pagato', 'annullato'].includes(o.stato) : o.stato === filtroStato);
    let h = '<div class="blocco"><div class="pannello-testa"><h3>Ordini</h3>'
      + '<select id="pf-filtro" class="pf-select" aria-label="Quali ordini">'
      + Object.entries(filtri).map(([k, n]) => `<option value="${k}"${k === filtroStato ? ' selected' : ''}>${esc(n)}</option>`).join('')
      + '</select></div>';
    const senzaMail = dati.ordini.filter(o => !o.email_inviata_il);
    if (senzaMail.length) {
      h += `<div class="avviso"><span class="avviso-icona">⚠</span><span>${senzaMail.length} `
        + `${senzaMail.length === 1 ? 'ordine senza e-mail partita' : 'ordini senza e-mail partita'}: `
        + 'li trovi qui sotto con «Rimanda l’e-mail».</span></div>';
    }
    if (!lista.length) h += '<p class="aiuto">Nessun ordine qui.</p>';
    h += '<ul class="lista-clienti">';
    lista.forEach(o => {
      const vend = o.venditori || {};
      const soldi = o.ruolo === 'agente' ? `provvigione ${euro(o.provvigione)}`
        : o.ruolo === 'rivenditore' ? `al rivenditore ${euro(o.totale_rivenditore)} · margine ${euro(o.margine)}` : '';
      h += `<li><form class="pf-ordine" data-id="${esc(o.id)}" novalidate>`
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
          ? `<label>Provvigione liquidata il<input type="date" name="liquidata" value="${esc(v(o.provvigione_liquidata_il))}"></label>` : '')
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

  /* ------------------------------------------------------------ provvigioni */

  /* La regola (proposta il 20/10/2026): maturata quando il cliente ha pagato,
     liquidata quando c'è la data di liquidazione. Gli annullati non contano. */
  function provvigioni(corpo) {
    const agenti = dati.venditori.filter(x => x.ruolo === 'agente');
    let h = '<div class="blocco"><h3>Provvigioni degli agenti</h3>'
      + '<p class="aiuto">In corso: ordini non ancora pagati dal cliente. Maturate: il cliente ha pagato, sono da liquidare. '
      + '«Segna liquidate oggi» mette la data di oggi su tutte le maturate di quell’agente.</p>'
      + '<div class="ordine-scorri"><table class="tabella ordine-conto"><thead><tr><th>Agente</th><th>In corso</th><th>Maturate</th><th>Liquidate</th><th></th></tr></thead><tbody>';
    agenti.forEach(a => {
      const suoi = dati.ordini.filter(o => o.venditore_id === a.id && o.stato !== 'annullato');
      const somma = l => l.reduce((s, o) => s + Number(o.provvigione || 0), 0);
      const liq = suoi.filter(o => o.provvigione_liquidata_il);
      const mat = suoi.filter(o => o.stato === 'pagato' && !o.provvigione_liquidata_il);
      const inc = suoi.filter(o => o.stato !== 'pagato' && !o.provvigione_liquidata_il);
      h += `<tr><th>${esc(a.nome)}</th><td>${euro(somma(inc))}</td><td><strong>${euro(somma(mat))}</strong></td><td>${euro(somma(liq))}</td>`
        + `<td>${mat.length ? `<button type="button" class="bottone bottone-fantasma pf-piccolo" data-liquida="${esc(a.id)}">Segna liquidate oggi</button>` : ''}</td></tr>`;
    });
    h += '</tbody></table></div><p class="errore" hidden></p></div>';
    corpo.innerHTML = h;
    corpo.querySelectorAll('[data-liquida]').forEach(b => b.addEventListener('click', () => {
      const ids = dati.ordini.filter(o => o.venditore_id === b.dataset.liquida && o.stato === 'pagato' && !o.provvigione_liquidata_il).map(o => o.id);
      if (!confirm(`Segno liquidate ${ids.length} ${ids.length === 1 ? 'provvigione' : 'provvigioni'} con la data di oggi?`)) return;
      salva(b, () => sb.from('ordini').update({ provvigione_liquidata_il: oggi() }).in('id', ids));
    }));
  }

  /* -------------------------------------------------------------- venditori */

  function campo(nome, etichetta, valore, tipo, extra) {
    return `<label>${esc(etichetta)}<input name="${nome}" type="${tipo || 'text'}" value="${esc(v(valore))}"${extra || ''}></label>`;
  }

  function moduloVenditore(x) {
    const nuovo = !x.id;
    let h = `<form class="pf-venditore" data-id="${esc(x.id || '')}" novalidate><div class="pf-campi">`
      + campo('nome', 'Nome', x.nome)
      + '<label>Ruolo<select name="ruolo" class="pf-select">'
      + Object.entries(RUOLI).map(([k, n]) => `<option value="${k}"${x.ruolo === k ? ' selected' : ''}>${n}</option>`).join('') + '</select></label>'
      + campo('email', 'E-mail (per entrare)', x.email, 'email', ' autocapitalize="off"')
      + campo('telefono', 'Telefono', x.telefono, 'tel')
      + campo('prezzo_bigbag', 'Rivenditore: big bag €/t', x.prezzo_bigbag, 'number', ' step="0.01" min="0"')
      + campo('prezzo_sacchi', 'Rivenditore: sacchi €/t', x.prezzo_sacchi, 'number', ' step="0.01" min="0"')
      + campo('provvigione_perc', 'Agente: provvigione piùLact %', x.provvigione_perc, 'number', ' step="0.1" min="0" max="100"')
      + campo('valide_fino', 'Condizioni valide fino al', x.valide_fino, 'date')
      + `<label class="pf-spunta"><input type="checkbox" name="attivo"${x.attivo !== false ? ' checked' : ''}> Attivo (può entrare)</label>`
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
      + '<div id="pf-venditore-nuovo"></div><ul class="lista-clienti">';
    dati.venditori.forEach(x => {
      h += `<li><div class="cliente-testa"><strong>${esc(x.nome)}</strong><span>${esc(RUOLI[x.ruolo])}${x.attivo ? '' : ' · non attivo'}</span></div>`
        + moduloVenditore(x) + '</li>';
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

    function aggancia(dove) {
      dove.querySelectorAll('.pf-venditore').forEach(f => {
        if (f.dataset.agganciato) return;
        f.dataset.agganciato = '1';
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
            note: nulloSeVuoto(String(d.get('note') || '').trim())
          };
          const err = f.querySelector('.errore');
          if (!riga.nome) { err.textContent = 'Serve il nome.'; err.hidden = false; return; }
          if (riga.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(riga.email)) { err.textContent = 'L’e-mail non sembra valida.'; err.hidden = false; return; }
          const id = f.dataset.id;
          salva(f.querySelector('button[type=submit]'), () => id
            ? sb.from('venditori').update(riga).eq('id', id)
            : sb.from('venditori').insert(riga));
        });
        const inv = f.querySelector('[data-invita]');
        if (inv) inv.addEventListener('click', () => salva(inv, () =>
          sb.functions.invoke('invita', { body: { id: f.dataset.id } }).then(x => {
            if (x.error) throw new Error('invito non partito, riprova più tardi');
          })));
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
