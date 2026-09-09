/* ============================================================================
   Riposa — motore di calcolo e pagina
   Le dosi non stanno qui: stanno in assets/regole.js
   ========================================================================== */

'use strict';

const modulo    = document.getElementById('modulo');
const boxErrore = document.getElementById('errore');
const boxRis    = document.getElementById('risultato');
const boxRiemp  = document.getElementById('blocco-riempimento');
const boxSup    = document.getElementById('blocco-superficie');

let ultimoRisultato = null;
let premiumScelto = null;   // id dello scenario premium scelto dall'allevatore
let canale = null;          // 'whatsapp' | 'email'
let consegnato = false;     // il risultato è già stato inviato?
let datiContatto = null;

/* ---------------------------------------------------------------- utilità -- */

function num(n, dec = 0) {
  return Number(n).toLocaleString('it-IT', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
}

// arrotonda "all'italiana": sotto 10 con un decimale, sopra 10 intero
function kg(n) {
  return n < 10 ? num(n, 1) : num(Math.round(n));
}

// i passaggi al mese: 15 e non 15,0, ma 4,3 quando il decimale c'è davvero
function passaggi(n) {
  return Number.isInteger(n) ? num(n) : num(n, 1);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/* ------------------------------------------------- mostra/nascondi il carro */

modulo.addEventListener('change', e => {
  // le domande che compaiono solo dove hanno senso
  if (e.target.name === 'zona') {
    const z = e.target.value;
    boxRiemp.hidden = z !== 'buca';
    boxSup.hidden   = !(z === 'lettiera' || z === 'compost');
    return;
  }

  // "Niente" e il resto si escludono a vicenda
  if (e.target.name === 'lettieraAttuale') {
    const spunte = [...modulo.querySelectorAll('input[name="lettieraAttuale"]')];
    const niente = spunte.find(i => i.dataset.esclusiva);
    if (e.target === niente && niente.checked) {
      spunte.forEach(i => { if (i !== niente) i.checked = false; });
    } else if (e.target !== niente && e.target.checked && niente) {
      niente.checked = false;
    }
  }
});

/* --------------------------------------------------- lettura e validazione */

function leggiModulo() {
  const f = new FormData(modulo);
  const zona = f.get('zona');
  const cuccetteInput = parseInt(f.get('cuccette'), 10);
  const capiInput     = parseInt(f.get('capi'), 10);

  if (!zona) return { errore: 'Indica com’è fatta la zona di riposo.' };
  if (!f.get('mungitura')) return { errore: 'Indica come mungi: sala o robot.' };

  let cuccette = null;
  if (Number.isFinite(cuccetteInput) && cuccetteInput > 0) {
    cuccette = cuccetteInput;
  } else if (Number.isFinite(capiInput) && capiInput > 0) {
    cuccette = Math.round(capiInput * CONFIG.rapportoCuccettePerCapo);
  }

  const suSuperficie = (zona === 'lettiera' || zona === 'compost');
  const mq       = parseInt(f.get('mq'), 10);
  const capiZona = parseInt(f.get('capiZona'), 10);

  if (suSuperficie) {
    if (!(Number.isFinite(mq) && mq > 0)) {
      return { errore: 'Serve la superficie della lettiera in metri quadri.' };
    }
    if (!(Number.isFinite(capiZona) && capiZona > 0)) {
      return { errore: 'Serve il numero di capi presenti nella zona a lettiera.' };
    }
  } else if (!cuccette) {
    return { errore: 'Serve il numero di cuccette, oppure i capi in mungitura.' };
  }

  if (zona === 'buca' && !f.get('riempimento')) {
    return { errore: 'Dicci come riempi la buca: con una miscelata o spagliando il prodotto sopra il materiale.' };
  }

  const cellule = parseInt(f.get('cellule'), 10);

  return {
    zona,
    cuccette,
    cuccetteStimate: !(Number.isFinite(cuccetteInput) && cuccetteInput > 0),
    capi: Number.isFinite(capiInput) ? capiInput : null,
    mungitura: f.get('mungitura'),
    riempimento: f.get('riempimento'),
    mq: suSuperficie ? mq : null,
    capiZona: suSuperficie ? capiZona : null,
    lettieraAttuale: f.getAll('lettieraAttuale'),
    biogas: f.get('biogas') === 'si',
    cellule: Number.isFinite(cellule) && cellule > 0 ? cellule : null
  };
}

/* --------------------------------------------------------------- il calcolo */

function calcolaScenario(idScenario, d) {
  const s = SCENARI[idScenario];
  const p = PRODOTTI[s.prodotto];

  const r = { dati: d, idScenario, scenario: s, prodotto: p };

  if (s.tipoCalcolo === 'consulenza') {
    r.soloConsulenza = true;
    return r;
  }

  /* lettiera permanente e compost barn: si dosa sui metri quadri */
  if (s.tipoCalcolo === 'superficie') {
    r.superficie = true;
    r.mqPerCapo = d.mq / d.capiZona;

    let freq = s.frequenzaGiorni;
    let etichetta = s.etichettaFrequenza;
    if (s.frequenzaVariabile) {
      const v = s.frequenzaVariabile;
      const largo = r.mqPerCapo > v.sogliaMqPerCapo;
      freq = largo ? v.sopraGiorni : v.sottoGiorni;
      etichetta = largo ? 'ogni 3 giorni' : 'un giorno sì e uno no';
      r.sogliaSuperata = largo;
    }
    r.frequenzaGiorni = freq;
    r.etichettaFrequenza = etichetta;

    r.dosePerMq       = s.dosePerMqKg;
    r.kgApplicazione  = s.dosePerMqKg * d.mq;
    r.applicazioniMese = CONFIG.giorniAlMese / freq;
    r.kgMese          = r.kgApplicazione * r.applicazioniMese;
    r.kgAnno          = r.kgMese * 12;

    r.confezioni = p.confezioni.map(c => ({
      etichetta: c.etichetta, kg: c.kg, alMese: r.kgMese / c.kg
    }));
    const gr = r.confezioni[r.confezioni.length - 1];
    r.confezioneConsigliata = gr.alMese >= 0.5 ? gr : r.confezioni[0];
    return r;
  }

  if (s.tipoCalcolo === 'miscelata') {
    r.mixPerCuccetta    = s.mixPerCuccettaKg;
    r.dosePerCuccetta   = s.mixPerCuccettaKg * s.quote.piulact;
    r.pagliaPerCuccetta = s.mixPerCuccettaKg * s.quote.paglia;
    r.acquaPerCuccetta  = s.mixPerCuccettaKg * s.quote.acqua;
    r.miscelata = true;
  } else {
    r.dosePerCuccetta = s.dosePerCuccettaKg;
  }

  r.kgApplicazione   = r.dosePerCuccetta * d.cuccette;
  r.frequenzaGiorni  = s.frequenzaGiorni;
  r.etichettaFrequenza = s.etichettaFrequenza;
  r.applicazioniMese = CONFIG.giorniAlMese / s.frequenzaGiorni;
  r.kgMese           = r.kgApplicazione * r.applicazioniMese;
  r.kgAnno           = r.kgMese * 12;

  if (r.miscelata) {
    r.pagliaMese = r.pagliaPerCuccetta * d.cuccette * r.applicazioniMese;
    r.acquaMese  = r.acquaPerCuccetta  * d.cuccette * r.applicazioniMese;
  }

  r.confezioni = p.confezioni.map(c => ({
    etichetta: c.etichetta,
    kg: c.kg,
    alMese: r.kgMese / c.kg
  }));
  // consigliamo il formato grande se ne serve almeno mezzo al mese
  const grande = r.confezioni[r.confezioni.length - 1];
  r.confezioneConsigliata = grande.alMese >= 0.5 ? grande : r.confezioni[0];

  if (d.cellule && d.cellule > 150) {
    r.potenziale = {
      attuale: d.cellule,
      obiettivo: Math.max(80, Math.round(d.cellule * 0.5 / 10) * 10)
    };
  }

  return r;
}

/* La risposta completa: la prima scelta, le eventuali scelte premium calcolate
   sugli stessi numeri, e la proposta di prova adatta a questa stalla. */
function calcola(d) {
  const r = calcolaScenario(scegliScenario(d), d);

  r.premium = scenariPremium(d)
    .filter(id => id !== r.idScenario)
    .map(id => calcolaScenario(id, d));

  // capi in lattazione, per dimensionare la proposta di prova
  r.capiRiferimento = d.capi
    || (d.cuccette ? Math.round(d.cuccette / CONFIG.rapportoCuccettePerCapo) : null)
    || d.capiZona
    || null;

  r.proposta = (d.zona === 'materassino')
    ? Object.assign({ tipo: 'materassino' }, PROPOSTE.provaMaterassino)
    : Object.assign({ tipo: 'gabbiette', sacconi: sacconiGabbiette(r.capiRiferimento) },
                    PROPOSTE.gabbietteVitelli);

  return r;
}

/* ------------------------------------------------------------- il risultato */
/* ⚠️ Con il muro attivo questa funzione NON è nel percorso pubblico: il
   risultato a schermo lo vedrà l'agente dall'area riservata (Fase 3). Resta qui
   pronta, e resta l'unico posto dove i numeri diventano pagina.               */

function disegnaRisultato(r) {
  const s = r.scenario, p = r.prodotto, d = r.dati;
  let h = '';

  /* --- intestazione prodotto --- */
  h += '<div class="esito">';
  h += '<p class="esito-etichetta">Il prodotto per la tua stalla</p>';
  h += `<h2 class="esito-nome">${esc(p.nome)}</h2>`;
  h += `<p class="esito-tagline">${esc(p.tagline)}</p>`;
  h += `<p class="esito-sintesi">${esc(p.sintesi)}</p>`;

  if (!r.soloConsulenza) {
    h += '<dl class="numeri">';
    if (r.superficie) {
      h += cella('Per m²', `${num(r.dosePerMq, 2)} kg`, r.etichettaFrequenza);
      h += cella('Per passaggio', `${kg(r.kgApplicazione)} kg`, `su ${num(d.mq)} m²`);
    } else {
      h += cella('Per cuccetta', `${kg(r.dosePerCuccetta)} kg`, r.etichettaFrequenza);
      h += cella('Per passaggio', `${kg(r.kgApplicazione)} kg`, `su ${num(d.cuccette)} cuccette`);
    }
    h += cella('Al mese', `${kg(r.kgMese)} kg`, `${passaggi(r.applicazioniMese)} passaggi`);
    h += '</dl>';
  }
  h += '</div>';

  /* --- avviso valori da confermare --- */
  if (!s.confermato) {
    h += '<div class="blocco"><div class="avviso" style="margin-top:0">'
      + '<span class="avviso-icona">⚠</span><span>'
      + '<strong>Valori da confermare.</strong> Per questa configurazione la dose indicata è '
      + 'una stima di partenza, non un valore di listino. Contattaci prima di ordinare: '
      + 'ti diamo il dosaggio corretto per la tua situazione.'
      + '</span></div></div>';
  }

  /* --- consulenza (lettiera permanente) --- */
  if (r.soloConsulenza) {
    h += '<div class="blocco">';
    h += `<h3>${esc(s.titolo)}</h3>`;
    s.metodologia.forEach(t => { h += `<p>${esc(t)}</p>`; });
    h += `<p class="nota-scenario">${esc(s.nota)}</p>`;
    h += '</div>';
    mostra(h);
    return;
  }

  /* --- come si usa --- */
  h += '<div class="blocco">';
  h += `<h3>Come si usa · ${esc(s.titolo)}</h3>`;
  h += '<ol class="passi">';
  s.metodologia.forEach(t => { h += `<li>${esc(t)}</li>`; });
  h += '</ol>';
  if (s.nota) h += `<p class="nota-scenario">${esc(s.nota)}</p>`;
  h += '</div>';

  /* --- perché quella frequenza, sulla lettiera --- */
  if (r.superficie && r.mqPerCapo) {
    h += '<div class="blocco">';
    h += '<h3>I tuoi metri quadri a capo</h3>';
    h += `<p><strong>${num(r.mqPerCapo, 1)} m² per capo</strong> — ${num(d.mq)} m² di lettiera `
      + `divisi per ${num(d.capiZona)} capi.</p>`;
    if (r.sogliaSuperata !== undefined) {
      h += r.sogliaSuperata
        ? '<p class="nota-scenario">Sopra i 9 m² a capo la lettiera si sporca più lentamente: '
          + 'basta intervenire ogni 3 giorni.</p>'
        : '<p class="nota-scenario">Sotto i 9 m² a capo la lettiera lavora di più: conviene '
          + 'intervenire un giorno sì e uno no.</p>';
    }
    h += '</div>';
  }

  /* --- la miscelata --- */
  if (r.miscelata) {
    h += '<div class="blocco">';
    h += '<h3>La miscelata, per cuccetta</h3>';
    h += '<table class="tabella"><tbody>';
    h += riga('piùLact <span style="color:#5A6A80;font-weight:400">(20%)</span>', `${kg(r.dosePerCuccetta)} kg`);
    h += riga('Paglia macinata <span style="color:#5A6A80;font-weight:400">(40%)</span>', `${kg(r.pagliaPerCuccetta)} kg`);
    h += riga('Acqua <span style="color:#5A6A80;font-weight:400">(40%)</span>', `${kg(r.acquaPerCuccetta)} litri`);
    h += riga('<strong>Totale mix</strong>', `<strong>${kg(r.mixPerCuccetta)} kg</strong>`);
    h += '</tbody></table>';
    h += `<p class="aiuto" style="margin-top:14px">Sul mese, per ${num(d.cuccette)} cuccette: `
      + `<strong>${kg(r.kgMese)} kg di piùLact</strong>, ${kg(r.pagliaMese)} kg di paglia macinata `
      + `e ${kg(r.acquaMese)} litri di acqua.</p>`;
    h += '</div>';
  }

  /* --- confezioni --- */
  h += '<div class="blocco">';
  h += '<h3>Quanto ordinare</h3>';
  h += '<table class="tabella"><tbody>';
  r.confezioni.forEach(c => { h += riga(esc(c.etichetta), testoConfezione(c)); });
  h += '</tbody></table>';
  h += `<p class="aiuto" style="margin-top:14px">Formato consigliato per la tua dimensione: `
    + `<strong>${esc(r.confezioneConsigliata.etichetta)}</strong>. `
    + `Distribuzione ${esc(s.distribuzione)}.</p>`;
  h += '</div>';

  /* --- potenziale sulle cellule --- */
  if (r.potenziale) {
    h += '<div class="blocco">';
    h += '<h3>Dove possono arrivare le tue cellule</h3>';
    h += '<div class="potenziale-cifre">'
      + `<b>${num(r.potenziale.attuale)}</b><span>→</span><b>${num(r.potenziale.obiettivo)}</b>`
      + '<span style="font-size:14px">mila cellule / ml</span></div>';
    h += '<p>Non è una promessa: è l’ordine di grandezza che vediamo nelle stalle che '
      + 'passano a piùLact e lo usano con continuità. I casi qui sotto sono reali, '
      + 'con i numeri veri delle analisi del latte.</p>';
    h += '<ul class="casi">';
    CASI_STUDIO.forEach(c => {
      h += `<li><b>${num(c.da)} → ${num(c.a)} mila</b> in ${c.mesi} mesi — `
        + `${esc(c.luogo)}, ${esc(c.tipo)}</li>`;
    });
    h += '</ul>';
    h += '</div>';
  }

  /* --- le scelte premium, calcolate sugli stessi numeri --- */
  if (r.premium && r.premium.length) {
    h += '<div class="blocco">';
    h += '<h3>' + (r.premium.length > 1 ? 'Le scelte premium' : 'La scelta premium') + '</h3>';
    h += '<p style="color:#5A6A80;font-size:15px">piùLact classico è la risposta giusta per la tua '
      + 'stalla, ed è da lì che partiamo. Se però vuoi entrare in stalla meno spesso, o portare '
      + 'dentro lettime e igienizzante in un solo passaggio, ecco cosa cambierebbe — con i tuoi numeri.</p>';
    r.premium.forEach(a => {
      let perche = a.scenario.perche || '';
      if (a.scenario.perchebiogas && d.biogas) perche += ' ' + a.scenario.perchebiogas;
      const scelto = premiumScelto === a.idScenario;
      h += `<div class="premium${scelto ? ' scelto' : ''}">`;
      h += `<h4>${esc(a.prodotto.nome)} <span>${esc(a.prodotto.tagline)}</span></h4>`;
      if (perche) h += `<p>${esc(perche)}</p>`;
      h += '<table class="tabella"><tbody>';
      h += riga('Per cuccetta', `${kg(a.dosePerCuccetta)} kg, ${esc(a.etichettaFrequenza)}`);
      h += riga('Al mese', `${kg(a.kgMese)} kg`);
      h += riga(esc(a.confezioneConsigliata.etichetta), testoConfezione(a.confezioneConsigliata));
      h += '</tbody></table>';
      h += `<button type="button" class="bottone premium-scegli${scelto ? ' bottone-scelto' : ''}" `
        + `data-scenario="${esc(a.idScenario)}">`
        + (scelto ? `✓ Ti interessa ${esc(a.prodotto.nome)}` : `Mi interessa ${esc(a.prodotto.nome)}`)
        + '</button>';
      h += '</div>';
    });
    h += '</div>';
  }

  /* --- la proposta di prova --- */
  if (r.proposta) {
    h += '<div class="blocco blocco-prova">';
    h += `<h3>${esc(r.proposta.titolo)}</h3>`;
    h += `<p>${esc(r.proposta.testo)}</p>`;
    h += r.proposta.tipo === 'materassino'
      ? `<p class="prova-cifra"><strong>${r.proposta.sacconiPiulact} sacconi di piùLact `
        + `+ ${r.proposta.sacconiPronto} di piùLact PRONTO</strong></p>`
      : `<p class="prova-cifra"><strong>${r.proposta.sacconi} sacconi di piùLact PRONTO</strong>`
        + `<span>la quantità che proponiamo a una stalla della tua dimensione</span></p>`;
    h += '</div>';
  }

  mostra(h);
  agganciaPremium(r);
}

/* Scrive nel riquadro risultato, scorrendoci sopra solo la prima volta. */
function mostra(h) {
  const scorri = boxRis.hidden;
  boxRis.innerHTML = h;
  boxRis.hidden = false;
  if (scorri) boxRis.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cella(et, valore, sotto) {
  return `<div class="numero-cella"><dt>${esc(et)}</dt>`
       + `<dd>${valore}<small>${esc(sotto)}</small></dd></div>`;
}

function riga(et, valore) {
  return `<tr><th>${et}</th><td>${valore}</td></tr>`;
}

function testoConfezione(c) {
  return c.alMese >= 1
    ? `${num(Math.ceil(c.alMese))} al mese`
    : `1 ogni ${num(Math.round(1 / c.alMese * 10) / 10, 1)} mesi`;
}

/* ============================================================================
   Il percorso dopo il calcolo
   ragionamento → scelta del canale → contatti → risultato
   ========================================================================== */

/* --- 1. il ragionamento ------------------------------------------------- */

const PASSI_RAGIONAMENTO = [
  'Leggo le caratteristiche della tua stalla…',
  'Confronto le tre formulazioni piùLact…',
  'Calcolo il dosaggio e la frequenza…',
  'Verifico i formati e la quantità da ordinare…'
];

const DURATA_RAGIONAMENTO = 2500;

function bovinaChePensa() {
  return `
  <svg class="bovina" viewBox="0 0 124 104" role="img" aria-label="Una bovina che ragiona">
    <g class="pensieri">
      <circle class="pensiero p1" cx="88" cy="36" r="4"/>
      <circle class="pensiero p2" cx="100" cy="25" r="5.5"/>
      <circle class="pensiero p3" cx="114" cy="12" r="7.5"/>
    </g>
    <g class="testa">
      <!-- orecchie -->
      <ellipse class="orecchio" cx="19" cy="34" rx="7.5" ry="12" transform="rotate(-34 19 34)"/>
      <ellipse class="orecchio" cx="73" cy="34" rx="7.5" ry="12" transform="rotate(34 73 34)"/>
      <!-- corna -->
      <path class="corno" d="M28 22c-3-4-2-8 1-10 1 3 2 6 4 8z"/>
      <path class="corno" d="M64 22c3-4 2-8-1-10-1 3-2 6-4 8z"/>
      <!-- testa -->
      <ellipse class="cranio" cx="46" cy="48" rx="26" ry="24"/>
      <!-- ciuffo e macchia -->
      <path class="macchia" d="M46 24c-9 0-16 4-19 10 5 2 11 1 15-2 3 3 8 4 12 3-1-6-4-10-8-11z"/>
      <!-- muso -->
      <ellipse class="muso" cx="46" cy="68" rx="17.5" ry="12"/>
      <circle class="narice" cx="39.5" cy="67" r="2.4"/>
      <circle class="narice" cx="52.5" cy="67" r="2.4"/>
      <!-- occhi -->
      <circle class="occhio" cx="36" cy="44" r="3.6"/>
      <circle class="occhio" cx="56" cy="44" r="3.6"/>
      <circle class="luce" cx="37.2" cy="42.8" r="1.2"/>
      <circle class="luce" cx="57.2" cy="42.8" r="1.2"/>
    </g>
  </svg>`;
}

function mostraRagionamento(r) {
  let h = '<div class="ragiona">';
  h += bovinaChePensa();
  h += '<p class="ragiona-titolo">Sto ragionando sulla tua stalla</p>';
  h += '<p class="ragiona-passo" id="ragiona-passo">' + esc(PASSI_RAGIONAMENTO[0]) + '</p>';
  h += '<div class="ragiona-barra"><span id="ragiona-avanzamento"></span></div>';
  h += '</div>';
  mostra(h);

  const testo = document.getElementById('ragiona-passo');
  const barra = document.getElementById('ragiona-avanzamento');
  requestAnimationFrame(() => { barra.style.width = '100%'; });

  const intervallo = DURATA_RAGIONAMENTO / PASSI_RAGIONAMENTO.length;
  PASSI_RAGIONAMENTO.forEach((passo, i) => {
    if (i === 0) return;
    setTimeout(() => {
      testo.style.opacity = '0';
      setTimeout(() => {
        testo.textContent = passo;
        testo.style.opacity = '1';
      }, 140);
    }, intervallo * i);
  });

  setTimeout(() => mostraCanale(r), DURATA_RAGIONAMENTO);
}

/* --- 2. come vuoi riceverlo -------------------------------------------- */

function emailDisponibile() {
  const c = CONFIG.raccoltaLead;
  return !!(c && c.attivo && c.url && c.emailAttiva);
}

function mostraCanale(r) {
  const dueVie = emailDisponibile();
  let h = '<div class="trovato">';
  h += '<span class="trovato-spunta">✓</span>';
  h += '<h2>Il calcolatore ha trovato la soluzione ideale per la tua realtà</h2>';
  h += `<p>${dueVie ? 'Come preferisci ricevere il risultato?' : 'Ecco come ricevere il risultato.'}</p>`;
  h += '<div class="canali">';
  h += '<button type="button" class="canale canale-whatsapp" data-canale="whatsapp">'
    + '<strong>WhatsApp</strong>'
    + '<small>ti rispondiamo dal numero Pro Farmer</small>'
    + '<small class="canale-nota">⚡️ Ricevi in un lampo!</small></button>';
  if (dueVie) {
    h += '<button type="button" class="canale canale-email" data-canale="email">'
      + '<strong>E-mail</strong>'
      + '<small>te lo mandiamo per iscritto</small>'
      + '<small class="canale-nota">‼️ Controlla anche lo SPAM</small></button>';
  }
  h += '</div></div>';
  mostra(h);

  boxRis.querySelectorAll('.canale').forEach(b => {
    b.addEventListener('click', () => {
      canale = b.dataset.canale;
      mostraContatti(r);
    });
  });
}

/* --- 3. i contatti ------------------------------------------------------ */

function mostraContatti(r) {
  const viaMail = canale === 'email';
  let h = '<div class="blocco">';
  h += `<h3>${viaMail ? 'Dove te lo mandiamo?' : 'Su quale numero te lo mandiamo?'}</h3>`;
  h += '<p style="color:#5A6A80;font-size:15px">Tre dati e il risultato è tuo.</p>';
  h += '<form id="modulo-contatti" class="contatti" novalidate>';
  h += campoTesto('nome', 'Nome e cognome', 'text', true);
  h += campoTesto('azienda', 'Ragione sociale', 'text', true);
  h += campoTesto('provincia', 'Provincia', 'text', true);
  h += viaMail
    ? campoTesto('email', 'E-mail', 'email', true)
    : campoTesto('telefono', 'Numero di telefono', 'tel', true);
  h += spuntaConsenso();
  h += '<p id="errore-contatti" class="errore pieno" hidden></p>';
  h += '<div class="azioni pieno">';
  h += `<button type="submit" class="bottone ${viaMail ? '' : 'bottone-whatsapp'}">`
    + `${viaMail ? 'Mandami il risultato per e-mail' : 'Mandami il risultato su WhatsApp'}</button>`;
  h += '<button type="button" class="bottone bottone-fantasma" id="btn-indietro">Cambia canale</button>';
  h += '</div></form></div>';
  mostra(h);

  document.getElementById('btn-indietro').addEventListener('click', () => mostraCanale(r));

  document.getElementById('modulo-contatti').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const err = document.getElementById('errore-contatti');
    const dati = Object.fromEntries(new FormData(f).entries());

    /* Gli spazi di troppo si mangiano qui, una volta per tutte: uno spazio in
       coda alla ragione sociale rompe il grassetto del messaggio WhatsApp
       (*Agrinova * non diventa grassetto) e sporca la riga sul foglio. */
    for (const chiave in dati) {
      if (typeof dati[chiave] === 'string') dati[chiave] = dati[chiave].trim();
    }

    dati.consenso = document.getElementById('c-consenso').checked;

    if (!dati.nome || !dati.nome.trim()) {
      return errore(err, 'Serve il tuo nome.');
    }
    if (!dati.azienda || !dati.azienda.trim()) {
      return errore(err, 'Serve la ragione sociale dell’azienda.');
    }
    if (!dati.provincia || !dati.provincia.trim()) {
      return errore(err, 'Serve la provincia.');
    }
    if (viaMail) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((dati.email || '').trim())) {
        return errore(err, 'Serve un indirizzo e-mail valido.');
      }
    } else if (!dati.telefono || dati.telefono.replace(/\D/g, '').length < 8) {
      return errore(err, 'Serve un numero di telefono valido.');
    }
    err.hidden = true;

    datiContatto = dati;
    consegna(r);
    mostraConferma(r);
  });
}

function errore(el, testo) {
  el.textContent = testo;
  el.hidden = false;
}

/* --- 4. la consegna ---------------------------------------------------- */

function consegna(r) {
  inviaLead(datiContatto, r);
  if (canale === 'whatsapp') apriWhatsApp(datiContatto, r);
  consegnato = true;
}

/* Il muro: il risultato non compare a schermo, arriva solo sul canale scelto.
   L'agente lo vedrà a schermo dall'area riservata, quando la faremo. */
function mostraConferma(r) {
  const viaMail = canale === 'email';
  let h = '<div class="trovato">';
  h += '<span class="trovato-spunta">✓</span>';
  h += `<h2>${viaMail ? 'Te l’abbiamo mandato per e-mail' : 'Manca solo il tuo invio'}</h2>`;
  h += `<p>${viaMail
    ? 'Controlla la casella di ' + esc(datiContatto.email) + '. Se non lo trovi, guarda nello SPAM.'
    : 'Si è aperto WhatsApp con la richiesta già scritta: <strong>premi invia</strong> e ti rispondiamo dal numero Pro Farmer col calcolo per la tua stalla.'}</p>`;
  h += '<div class="azioni">';
  if (!viaMail) {
    h += '<button type="button" class="bottone bottone-whatsapp" id="btn-rinvia">Riapri WhatsApp</button>';
    // Se non ha premuto invia, la finestra delle 24 ore non si apre e il calcolo
    // non gli arriva: questo pulsante e' la sua seconda occasione.
  }
  h += '<button type="button" class="bottone bottone-fantasma" id="btn-ricomincia">Fai un altro calcolo</button>';
  h += '</div>';
  h += '<p class="conferma-nota">Se hai bisogno di una mano ti richiamiamo noi: '
    + 'un tecnico Pro Farmer può fare il punto sulla tua stalla.</p>';
  h += '</div>';
  mostra(h);

  const rinvia = document.getElementById('btn-rinvia');
  if (rinvia) rinvia.addEventListener('click', () => apriWhatsApp(datiContatto, r));
  document.getElementById('btn-ricomincia').addEventListener('click', () => {
    boxRis.hidden = true;
    boxRis.innerHTML = '';
    modulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function spuntaConsenso() {
  const link = CONFIG.urlPrivacy
    ? `<a href="${esc(CONFIG.urlPrivacy)}" target="_blank" rel="noopener">informativa privacy</a>`
    : 'informativa privacy';
  return '<label class="consenso pieno">'
    + '<input type="checkbox" id="c-consenso" name="consenso" checked>'
    + '<span>Acconsento a essere ricontattato da Pro Farmer e a ricevere '
    + 'informazioni su piùLact. Ho letto l’' + link + '.</span>'
    + '</label>';
}

function campoTesto(id, etichetta, tipo, obbligatorio, classe) {
  return `<div class="campo ${classe || ''}">`
    + `<label for="c-${id}">${esc(etichetta)}`
    + (obbligatorio ? '' : ' <span class="opzionale">facoltativo</span>')
    + '</label>'
    + `<input type="${tipo}" id="c-${id}" name="${id}" autocomplete="${tipo === 'tel' ? 'tel' : tipo === 'email' ? 'email' : 'on'}">`
    + '</div>';
}

function agganciaPremium(r) {
  boxRis.querySelectorAll('.premium-scegli').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.scenario;
      premiumScelto = (premiumScelto === id) ? null : id;   // ri-cliccare annulla
      // se il lead è già partito, aggiorniamo: l'interesse per un premium
      // è il segnale più importante che questo contatto può darci
      if (consegnato && datiContatto) inviaLead(datiContatto, r);
      disegnaRisultato(r);
    });
  });
}

/* ------------------------------------------------------------ il riepilogo */

function testoRiepilogo(dati, r) {
  const d = r.dati, s = r.scenario, p = r.prodotto;
  const L = [];

  /* Il PRIMO messaggio dice solo l'essenziale: che prodotto serve, come si
     applica e quanto distribuirne a ogni passaggio. Niente scelte premium,
     niente proposta di prova: quelle sono materia della conversazione che
     l'agente apre dopo, non del messaggio che arriva per primo.
     Why: un allevatore in stalla legge quattro righe, non una scheda. */

  L.push(`*Riposa — il calcolo per ${dati.azienda || dati.nome || 'la tua stalla'}*`);
  L.push('');

  // Una riga sola di contesto: serve a riconoscere di quale stalla si parla.
  const zone = { materassino: 'cuccette a materassino', buca: 'cuccette a buca',
                 lettiera: 'lettiera a rinnovo frequente', compost: 'compost barn' };
  const contesto = [zone[d.zona]];
  if (r.superficie) {
    contesto.push(`${num(d.mq)} m²`);
  } else if (d.cuccette) {
    contesto.push(`${num(d.cuccette)} cuccette`);
  }
  if (d.mungitura === 'robot') contesto.push('mungitura con robot');
  L.push(contesto.join(' · '));
  L.push('');

  if (r.soloConsulenza) {
    L.push('*Questa zona richiede una valutazione dedicata:* ti ricontattiamo noi.');
    L.push('');
    L.push('Calcolo generato con Riposa — Pro Farmer');
    return L.join('\n');
  }

  L.push(`*Prodotto:* ${p.nome}`);
  L.push(`*Come si applica:* ${s.distribuzione}`);
  if (r.miscelata) {
    L.push(`*La miscela, per cuccetta:* piùLact ${kg(r.dosePerCuccetta)} kg + paglia ${kg(r.pagliaPerCuccetta)} kg + acqua ${kg(r.acquaPerCuccetta)} litri`);
  }
  // Nella miscelata la dose l'ha gia' detta la riga della miscela: non la ripetiamo.
  if (!r.miscelata) {
    L.push(r.superficie
      ? `*Dose:* ${num(r.dosePerMq, 2)} kg per m²`
      : `*Dose:* ${kg(r.dosePerCuccetta)} kg per cuccetta`);
  }
  L.push(`*Ogni quanto:* ${r.etichettaFrequenza}`);
  L.push(`*Da distribuire a ogni passaggio:* ${kg(r.kgApplicazione)} kg`);
  L.push('');

  L.push(`Fanno ${kg(r.kgMese)} kg al mese — formato consigliato: ${r.confezioneConsigliata.etichetta}`);
  L.push('');
  L.push('Calcolo generato con Riposa — Pro Farmer');
  return L.join('\n');
}

/* Il messaggio che il wa.me precompila NON e' piu' il calcolo: e' una richiesta
   breve che l'allevatore manda a Pro Farmer. Why: quel suo messaggio apre la
   finestra di 24 ore in cui WhatsApp permette a un'azienda di rispondere con
   messaggi liberi, senza template approvati da Meta. Il calcolo completo parte
   dopo, dal numero Pro Farmer, come messaggio normale.
   Nome e ragione sociale servono ad agganciare la riga sul foglio. */
function testoRichiesta(dati) {
  const chi = [dati.nome, dati.azienda].filter(Boolean).join(' — ');
  return 'Ciao Pro Farmer, ho usato il calcolatore Riposa per la mia stalla.\n'
    + (chi ? chi + '\n' : '')
    + 'Mi mandate il risultato?';
}

function apriWhatsApp(dati, r) {
  const testo = encodeURIComponent(testoRichiesta(dati));
  const numero = (CONFIG.azienda.whatsapp || '').replace(/\D/g, '');
  const url = numero
    ? `https://wa.me/${numero}?text=${testo}`
    : `https://wa.me/?text=${testo}`;   // senza numero configurato: l'utente sceglie il destinatario
  window.open(url, '_blank', 'noopener');
}

/* ------------------------------------------------------------ raccolta lead */
/* Un solo indirizzo: la Web App di Google Apps Script dentro il foglio.
   Chiamata in JSONP, così funziona da un sito statico su un altro dominio.
   Nessuna chiave di nessun tipo passa da qui.                                */

function inviaLead(dati, r) {
  const conf = CONFIG.raccoltaLead;
  if (!conf.attivo || !conf.url) return;

  const d = r.dati;
  const s = r.scenario;
  const scelta = (r.premium || []).find(x => x.idScenario === premiumScelto);

  const q = new URLSearchParams({
    azienda:        dati.azienda || '',
    nome:           dati.nome || '',
    provincia:      dati.provincia || '',   // non più chiesta nel modulo breve
    telefono:       dati.telefono || '',
    email:          dati.email || '',
    consenso:       dati.consenso ? 'si' : 'no',
    zona:           d.zona || '',
    cuccette:       d.cuccette || '',
    cuccetteStimate: d.cuccetteStimate ? 'si' : 'no',
    capi:           d.capi || '',
    mungitura:      d.mungitura || '',
    riempimento:    d.riempimento || '',
    lettiera:       (d.lettieraAttuale || []).join(', '),
    biogas:         d.biogas ? 'si' : 'no',
    mq:             d.mq || '',
    capiZona:       d.capiZona || '',
    cellule:        d.cellule || '',
    prodotto:       r.prodotto.nome || '',
    dose:           r.superficie ? `${r.dosePerMq} kg/m²`
                    : (r.dosePerCuccetta ? `${r.dosePerCuccetta} kg/cuccetta` : ''),
    frequenza:      r.etichettaFrequenza || '',
    kgPassaggio:    r.kgApplicazione ? Math.round(r.kgApplicazione) : '',
    kgMese:         r.kgMese ? Math.round(r.kgMese) : '',
    formato:        r.confezioneConsigliata ? r.confezioneConsigliata.etichetta : '',
    premium:        scelta ? scelta.prodotto.nome : '',
    prova:          r.proposta
                      ? (r.proposta.tipo === 'materassino'
                          ? `${r.proposta.sacconiPiulact} piùLact + ${r.proposta.sacconiPronto} PRONTO`
                          : `${r.proposta.sacconi} sacconi PRONTO (gabbiette)`)
                      : ''
  });

  q.set('canale', canale || '');
  q.set('riepilogo', testoRiepilogo(dati, r));

  const cb = 'leadCallback' + Date.now();
  window[cb] = () => { delete window[cb]; };
  const el = document.createElement('script');
  el.src = `${conf.url}?${q.toString()}&callback=${cb}`;
  el.onload = el.onerror = () => el.remove();
  document.body.appendChild(el);
}

/* ------------------------------------------------------------------- avvio */

modulo.addEventListener('submit', ev => {
  ev.preventDefault();
  const d = leggiModulo();

  if (d.errore) {
    boxErrore.textContent = d.errore;
    boxErrore.hidden = false;
    boxErrore.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  boxErrore.hidden = true;

  premiumScelto = null;
  canale = null;
  consegnato = false;
  datiContatto = null;
  ultimoRisultato = calcola(d);
  mostraRagionamento(ultimoRisultato);
});
