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
const boxCucc   = document.getElementById('blocco-cuccette');
const titoloLettiera = document.getElementById('titolo-lettiera-attuale');

let ultimoRisultato = null;
let premiumScelto = null;   // id dello scenario alternativo scelto dall'allevatore
let consegnato = false;     // il risultato è già stato inviato?
let datiContatto = null;

/* ---------------------------------------------------------------- utilità -- */

/* I numeri li formattiamo a mano, non con toLocaleString('it-IT').
   Why: su parecchi telefoni il motore JS sa fare la virgola dei decimali ma
   NON il punto delle migliaia, e "3600 kg" al posto di "3.600 kg" si legge
   male. Facendolo noi il risultato e' identico su qualsiasi dispositivo. */
function raggruppa(intero) {
  return String(intero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function num(n, dec = 0) {
  const pezzi = Number(n).toFixed(dec).split('.');
  return raggruppa(pezzi[0]) + (pezzi[1] ? ',' + pezzi[1] : '');
}

// arrotonda "all'italiana": sotto 10 con un decimale, sopra 10 intero.
// Il decimale solo quando c'è davvero: 0,5 kg sì, "4,0 kg" no.
function kg(n) {
  return n < 10 && Math.round(n * 10) % 10 !== 0 ? num(n, 1) : num(Math.round(n));
}

function migliaia(n) {
  return raggruppa(Math.round(n));
}

// prima lettera maiuscola, con "big bag" trattato come nome proprio del formato
function maiuscola(t) {
  const s = String(t || '');
  return (s.charAt(0).toUpperCase() + s.slice(1)).replace(/^Big bag/, 'Big Bag');
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

/* ------------------------------------------------------- il contatore */
/* Dal 26/10/2026: conta quante volte si arriva a ogni passaggio del percorso,
   una volta per pagina aperta. Solo sul sito vero e solo per l'allevatore
   (non in Riposa Pro, non nelle prove in locale). Nessun dato della persona. */
const passiContati = new Set();
function contaPasso(passo) {
  if (window.RIPOSA_PRO || location.pathname.indexOf('/pro') === 0 || location.hostname !== 'riposa.profarmer.it' || passiContati.has(passo)) return;
  passiContati.add(passo);
  const c = CONFIG.contatore;
  try {
    fetch(c.url, { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: c.chiave, Authorization: 'Bearer ' + c.chiave },
      body: JSON.stringify({ p_passo: passo }) }).catch(() => {});
  } catch (e) {}
}
contaPasso((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true ? 'visita_app' : 'visita');

/* ------------------------------------------------- mostra/nascondi il carro */

modulo.addEventListener('change', e => {
  // le domande che compaiono solo dove hanno senso
  if (e.target.name === 'zona') {
    contaPasso('zona');
    const z = e.target.value;
    const suSuperficie = z === 'lettiera' || z === 'compost';
    boxRiemp.hidden = z !== 'buca';
    boxSup.hidden   = !suSuperficie;
    // su lettiera e compost barn si ragiona a metri quadri: le cuccette non servono
    boxCucc.hidden  = suSuperficie;
    titoloLettiera.firstChild.textContent = suSuperficie
      ? 'Cosa usi oggi in lettiera? ' : 'Cosa usi oggi in cuccetta? ';
    // scelta la zona, la pagina scende da sola alla domanda dopo (Giulio, 25/10/2026)
    const dopo = suSuperficie ? boxSup : boxCucc;
    const piano = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => dopo.scrollIntoView({ behavior: piano ? 'auto' : 'smooth', block: 'start' }));
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

  if (!zona) return { errore: 'Indica com’è fatta la zona di riposo.', campo: 'input[name=zona]' };
  if (!f.get('mungitura')) return { errore: 'Indica come mungi: sala o robot.', campo: 'input[name=mungitura]' };

  let cuccette = null;
  if (Number.isFinite(cuccetteInput) && cuccetteInput > 0) {
    cuccette = cuccetteInput;
  } else if (Number.isFinite(capiInput) && capiInput > 0) {
    cuccette = Math.round(capiInput * CONFIG.rapportoCuccettePerCapo);
  }

  const suSuperficie = (zona === 'lettiera' || zona === 'compost');
  // i campi delle cuccette sono nascosti: se erano stati compilati prima di
  // cambiare zona, non devono finire nel calcolo né sul foglio
  if (suSuperficie) cuccette = null;
  const mq       = parseInt(f.get('mq'), 10);
  const capiZona = parseInt(f.get('capiZona'), 10);

  if (suSuperficie) {
    if (!(Number.isFinite(mq) && mq > 0)) {
      return { errore: 'Serve la superficie della lettiera in metri quadri.', campo: '#mq' };
    }
    if (!(Number.isFinite(capiZona) && capiZona > 0)) {
      return { errore: 'Serve il numero di capi presenti nella zona a lettiera.', campo: '#capiZona' };
    }
  } else if (!cuccette) {
    return { errore: 'Serve il numero di cuccette, oppure i capi in mungitura.', campo: '#cuccette' };
  }

  if (zona === 'buca' && !f.get('riempimento')) {
    return { errore: 'Dicci come riempi la buca: con una miscelata o spagliando il prodotto sopra il materiale.', campo: 'input[name=riempimento]' };
  }

  const cellule = parseInt(f.get('cellule'), 10);

  return {
    zona,
    cuccette,
    cuccetteStimate: !suSuperficie && !(Number.isFinite(cuccetteInput) && cuccetteInput > 0),
    capi: !suSuperficie && Number.isFinite(capiInput) ? capiInput : null,
    mungitura: f.get('mungitura'),
    riempimento: f.get('riempimento'),
    mq: suSuperficie ? mq : null,
    capiZona: suSuperficie ? capiZona : null,
    lettieraAttuale: f.getAll('lettieraAttuale'),
    biogas: false,   // domanda tolta il 18 ottobre 2026: serviva solo al canapulo
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

/* La risposta completa: la prima scelta e l'eventuale alternativa calcolata
   sugli stessi numeri. Il campo si chiama ancora `premium` perché così lo
   leggono il foglio Google e la pagina; oggi contiene l'alternativa. */
function calcola(d) {
  const r = calcolaScenario(scegliScenario(d), d);

  r.premium = scenariAlternativi(d)
    .filter(id => id !== r.idScenario)
    .map(id => calcolaScenario(id, d));

  return r;
}

/* ------------------------------------------------------------- il risultato */
/* Questa funzione NON è nel percorso pubblico, dove c'è il muro: il risultato
   a schermo lo vede chi è entrato nell'area venditori (assets/venditori.js).
   Resta l'unico posto dove i numeri diventano pagina.                         */

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

  /* --- l'alternativa, calcolata sugli stessi numeri --- */
  if (r.premium && r.premium.length) {
    r.premium.forEach(a => {
      const t = a.scenario.alternativaTesti;
      h += '<div class="blocco">';
      h += `<h3>${esc(t.domanda)}</h3>`;
      const perche = a.scenario.perche || '';
      const scelto = premiumScelto === a.idScenario;
      h += `<div class="premium${scelto ? ' scelto' : ''}">`;
      h += `<h4>${esc(a.prodotto.nome)} <span>${esc(a.prodotto.tagline)}</span></h4>`;
      if (perche) h += `<p>${esc(perche)}</p>`;
      h += '<table class="tabella"><tbody>';
      h += riga('Per cuccetta', a.miscelata
        ? `${kg(a.dosePerCuccetta)} kg di piùLact in ${kg(a.mixPerCuccetta)} kg di mix, ${esc(a.etichettaFrequenza)}`
        : `${kg(a.dosePerCuccetta)} kg, ${esc(a.etichettaFrequenza)}`);
      h += riga('Al mese', `${kg(a.kgMese)} kg di ${esc(a.prodotto.nome)}`);
      if (a.miscelata) {
        h += riga('Da aggiungere al mese', `${kg(a.pagliaMese)} kg di paglia, ${kg(a.acquaMese)} litri di acqua`);
      }
      h += riga(esc(a.confezioneConsigliata.etichetta), testoConfezione(a.confezioneConsigliata));
      h += '</tbody></table>';
      h += `<button type="button" class="bottone premium-scegli${scelto ? ' bottone-scelto' : ''}" `
        + `data-scenario="${esc(a.idScenario)}">`
        + esc(scelto ? '✓ ' + t.scelto : t.scegli)
        + '</button>';
      h += '</div>';
      h += '</div>';
    });
  }

  mostra(h);
  agganciaPremium(r);
  // nell'area venditori, sotto il risultato c'è il modulo d'ordine
  if (typeof Venditori !== 'undefined' && Venditori.attivo()) Venditori.mostraOrdine(r);
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
   ragionamento → contatti → il risultato arriva per e-mail
   Dal 23/10/2026 il risultato arriva solo per e-mail: WhatsApp è uscito.
   ========================================================================== */

/* --- 1. il ragionamento ------------------------------------------------- */

const PASSI_RAGIONAMENTO = [
  'Leggo le caratteristiche della tua stalla…',
  'Metto a confronto con le scelte di altri allevatori…',
  'Calcolo il dosaggio e la frequenza…',
  'Verifico le disponibilità…'
];

/* 4,5 secondi (Giulio, 25/10/2026): i passi si spuntano uno alla volta, la
   barra avanza a scatti morbidi con loro, poi un attimo di «fatto». */
const DURATA_RAGIONAMENTO = 4500;

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
  contaPasso('calcolo');
  const n = PASSI_RAGIONAMENTO.length, passo = 950;          // 4 passi × 0,95 s, poi «fatto»
  let h = '<div class="ragiona">';
  h += bovinaChePensa();
  h += '<p class="ragiona-titolo" id="ragiona-titolo">Sto ragionando sulla tua stalla</p>';
  h += '<ol class="ragiona-passi">' + PASSI_RAGIONAMENTO.map(p =>
    `<li><span class="ragiona-segno" aria-hidden="true"></span>${esc(p.replace(/…$/, ''))}</li>`).join('') + '</ol>';
  h += '<div class="ragiona-barra"><span id="ragiona-avanzamento"></span></div>';
  h += '</div>';
  mostra(h);

  const voci = document.querySelectorAll('.ragiona-passi li');
  const barra = document.getElementById('ragiona-avanzamento');
  // ogni chiamata ridisegna tutti i passi: l'ordine dei timer non conta
  const avanza = i => {
    voci.forEach((v, j) => { v.className = j < i ? 'fatto' : j === i ? 'in-corso' : ''; });
    barra.style.width = Math.round((i + (i < n ? .6 : 0)) / n * 100) + '%';
  };
  setTimeout(() => avanza(0), 30);
  for (let i = 1; i <= n; i++) setTimeout(() => avanza(i), passo * i);
  setTimeout(() => {
    const t = document.getElementById('ragiona-titolo');
    if (t) { t.textContent = 'Fatto: ecco la tua soluzione'; t.classList.add('ragiona-fatto'); }
  }, passo * n + 50);
  setTimeout(() => mostraContatti(r), DURATA_RAGIONAMENTO);
}

/* --- 2. dove te lo mandiamo ------------------------------------------- */

function mostraContatti(r) {
  contaPasso('contatti');
  let h = '<div class="trovato trovato-contatti">';
  h += '<span class="trovato-spunta">✓</span>';
  h += '<h2>Il calcolatore ha trovato la soluzione ideale per la tua realtà</h2>';
  h += '<p>Dove te la mandiamo? Ti arriva per e-mail tra pochi secondi.</p>';
  h += '<form id="modulo-contatti" class="contatti" novalidate>';
  h += campoTesto('nome', 'Nome e cognome', 'text', true);
  h += campoTesto('azienda', 'Ragione sociale', 'text', true);
  h += campoTesto('provincia', 'Provincia', 'text', true);
  h += campoTesto('email', 'E-mail', 'email', true);
  h += campoTesto('telefono', 'Telefono', 'tel', false, 'pieno');
  h += spuntaConsenso();
  h += '<p id="errore-contatti" class="errore pieno" hidden></p>';
  h += '<div class="azioni pieno">';
  h += '<button type="submit" class="bottone">Mandami il risultato per e-mail</button>';
  h += '</div></form></div>';
  mostra(h);

  document.getElementById('modulo-contatti').addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const err = document.getElementById('errore-contatti');
    const dati = Object.fromEntries(new FormData(f).entries());

    // gli spazi di troppo si mangiano qui, una volta per tutte
    for (const chiave in dati) {
      if (typeof dati[chiave] === 'string') dati[chiave] = dati[chiave].trim();
    }
    dati.consenso = document.getElementById('c-consenso').checked;

    if (!dati.nome) return errore(err, 'Serve il tuo nome.');
    if (!dati.azienda) return errore(err, 'Serve la ragione sociale dell’azienda.');
    if (!dati.provincia) return errore(err, 'Serve la provincia.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dati.email || '')) return errore(err, 'Serve un indirizzo e-mail valido.');
    if (dati.telefono && dati.telefono.replace(/\D/g, '').length < 8) return errore(err, 'Il telefono non sembra completo.');
    if (!dati.consenso) { contaPasso('senza_consenso'); return errore(err, 'Per ricevere il risultato spunta «Sì, ricontattatemi».'); }
    err.hidden = true;

    datiContatto = dati;
    const b = f.querySelector('button[type=submit]');
    b.disabled = true;
    b.textContent = 'Invio in corso…';
    inviaLead(dati, r).then(esito => {
      consegnato = true;
      contaPasso('inviato');
      mostraConferma(esito);
    }).catch(e => {
      b.disabled = false;
      b.textContent = 'Mandami il risultato per e-mail';
      errore(err, navigator.onLine === false
        ? 'Sei senza rete: il risultato non è partito. I dati restano qui, riprova quando torna il segnale.'
        : e.message === 'troppe richieste'
          ? 'Troppe richieste in questo momento: riprova tra qualche minuto.'
          : 'Non sono riuscito a mandarlo: riprova tra poco. Se continua, chiama Pro Farmer al +39 376 129 6162.');
    });
  });
}

function errore(el, testo) {
  el.textContent = testo;
  el.hidden = false;
}

/* --- l'app sul telefono dell'allevatore (24/10/2026) ---------------------
   Dopo il risultato lo invitiamo a tenere Riposa sul telefono. Su Android il
   telefono offre l'installazione e la apriamo noi col pulsante; su iPhone non
   esiste, quindi spieghiamo i due tocchi in Safari. Se è già installata, o
   se ha detto «Non ora», niente riquadro. */
let invitoAndroid = null;
window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); invitoAndroid = ev; });
const CHIAVE_NON_ORA = 'riposa-installa-allevatore-no';

function appInstallata() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
// dopo il calcolo, un'occhiata a «La tua stalla»: la scorta si dice da lì
function rimandaATuaStalla() {
  if (!document.querySelector('.invito-app')) return;
  const p = document.createElement('p');
  p.className = 'conferma-nota';
  p.innerHTML = 'In cima alla pagina trovi <a href="#tua-stalla">La tua stalla</a>: dicci la scorta e ti avvisiamo prima che finisca.';
  document.querySelector('.trovato').appendChild(p);
}
function suIPhone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function invitoInstalla() {
  let nonOra = false;
  try { nonOra = localStorage.getItem(CHIAVE_NON_ORA) === '1'; } catch (e) {}
  if (appInstallata() || nonOra || (!suIPhone() && !invitoAndroid)) return '';
  const condividi = '<span class="icona-condividi">Condividi <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">'
    + '<path d="M10 2v11M6 6l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M5 9H4v9h12V9h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>';
  let h = '<div class="invito-app">';
  h += '<img src="assets/icone/icona-192.png" alt="" width="64" height="64" class="invito-app-icona">';
  h += '<div><p class="invito-app-titolo">Tieni Riposa sul telefono</p>';
  h += '<p>Si apre dall’icona, come un’app. Ti avvisiamo quando il prodotto sta per finire, '
    + 'e rifai il calcolo in un attimo, anche in stalla senza campo.</p>';
  if (suIPhone()) {
    h += `<p class="invito-app-come">In Safari tocca ${condividi} e poi <strong>«Aggiungi alla schermata Home»</strong>.</p>`;
  }
  h += '<div class="invito-app-azioni">';
  if (!suIPhone()) h += '<button type="button" class="bottone" id="btn-installa">Installa Riposa</button>';
  h += '<button type="button" class="invito-app-no" id="btn-installa-no">Non ora</button></div></div></div>';
  return h;
}

function agganciaInvito() {
  const box = document.querySelector('.invito-app');
  if (!box) return;
  const si = document.getElementById('btn-installa');
  if (si) si.addEventListener('click', () => {
    if (!invitoAndroid) return;
    invitoAndroid.prompt();
    invitoAndroid.userChoice.finally(() => { invitoAndroid = null; box.remove(); });
  });
  document.getElementById('btn-installa-no').addEventListener('click', () => {
    try { localStorage.setItem(CHIAVE_NON_ORA, '1'); } catch (e) {}
    box.remove();
  });
}

/* --- 3. la conferma ---------------------------------------------------- */

/* Il muro: il risultato non compare a schermo, arriva solo per e-mail. */
function mostraConferma(esito) {
  let h = '<div class="trovato">';
  h += '<span class="trovato-spunta">✓</span>';
  h += '<h2>Te l’abbiamo mandato per e-mail</h2>';
  // il motivo vero, se l'e-mail non è partita (audit 28/10/2026)
  const perche = esito && esito.email === false ? (esito.perche || 'recente') : null;
  h += `<p>${perche === 'recente'
    ? 'Questo stesso calcolo te l’abbiamo già mandato pochi minuti fa a ' + esc(datiContatto.email) + ': controlla la casella e la posta indesiderata.'
    : perche
      ? 'L’abbiamo ricevuto, ma in questo momento l’e-mail non è partita. Ti ricontattiamo noi, oppure chiamaci al +39 376 129 6162.'
      : 'Controlla la casella di ' + esc(datiContatto.email) + '. Se non lo trovi tra qualche minuto, guarda nella posta indesiderata.'}</p>`;
  h += '<div class="azioni">';
  h += '<button type="button" class="bottone bottone-fantasma" id="btn-ricomincia">Fai un altro calcolo</button>';
  h += '</div>';
  h += '<p class="conferma-nota">Se hai bisogno di una mano ti richiamiamo noi: '
    + 'un tecnico Pro Farmer può fare il punto sulla tua stalla.</p>';
  h += '</div>';
  h += invitoInstalla();
  mostra(h);
  agganciaInvito();

  const ts = document.getElementById('tua-stalla');
  if (ts) rimandaATuaStalla();
  document.getElementById('btn-ricomincia').addEventListener('click', () => {
    contaPasso('altro_calcolo');
    boxRis.hidden = true;
    boxRis.innerHTML = '';
    modulo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function spuntaConsenso() {
  const link = CONFIG.urlPrivacy
    ? `<a href="${esc(CONFIG.urlPrivacy)}" target="_blank" rel="noopener">Informativa privacy</a>`
    : 'Informativa privacy';
  return '<label class="consenso pieno">'
    // non spuntata in partenza: il consenso va dato con un gesto. Dal 26/10/2026
    // è OBBLIGATORIO per avere il risultato: decisione di Giulio, informato che
    // per il GDPR (art. 7.4) un consenso condizionato al servizio può non essere
    // considerato libero. Testo scelto da Giulio.
    + '<input type="checkbox" id="c-consenso" name="consenso" required aria-required="true">'
    + '<span><strong>Sì, ricontattatemi:</strong> Pro Farmer o il suo agente di zona, anche con novità su piùLact. '
    + link + '</span>'
    + '</label>';
}

/* Il telefono riconosce i campi e propone i dati salvati: due tocchi invece
   di scrivere tutto. La provincia italiana per il browser è "address-level2". */
const AUTOCOMPLETA = { nome: 'name', azienda: 'organization', provincia: 'address-level2', email: 'email', telefono: 'tel' };

function campoTesto(id, etichetta, tipo, obbligatorio, classe) {
  return `<div class="campo ${classe || ''}">`
    + `<label for="c-${id}">${esc(etichetta)}`
    + (obbligatorio ? '' : ' <span class="opzionale">facoltativo</span>')
    + '</label>'
    + `<input type="${tipo}" id="c-${id}" name="${id}" autocomplete="${AUTOCOMPLETA[id] || 'on'}"${id === 'provincia' ? ' autocapitalize="characters"' : ''}>`
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

/* Tonnellate leggibili: 15,6 resta 15,6 ma 30 non diventa "30,0". */
function ton(kg) {
  const t = kg / 1000;
  return Number.isInteger(t) ? num(t) : num(t, 1);
}

/* Il consiglio sul trasporto, in una riga sola per il messaggio.
   Ragiona sul trimestre e sul formato consigliato. Le soglie e i pesi stanno
   in TRASPORTO (regole.js): qui c'e' solo il testo.
   Sopra i 50 big bag continuiamo a proporre un bilico saturo: e' l'unita' di
   carico piu' grande che ha senso nominare, e ordinarne uno pieno resta il
   modo migliore di far viaggiare il prodotto. */
function consiglioTrasporto(r) {
  const c = r.confezioneConsigliata;
  if (!c || !r.kgMese) return '';

  const T = TRASPORTO;
  const kgOrizzonte = r.kgMese * T.mesiOrizzonte;
  const camion = '\u{1F69A}';

  // Ballette di piùLact Pronto: sul mese, bancali interi da 2, minimo 10.
  if (c.kg === T.ballettaKg) {
    const kgB = r.kgMese * T.mesiOrizzonteBallette;
    const servono = Math.ceil(kgB / T.ballettaKg);
    const staff = 'La consegna la organizza lo staff Pro Farmer';
    /* Sotto il minimo il fabbisogno e l'ordine sono due numeri diversi, e vanno
       detti tutti e due: "servono 10" a chi ne consuma 6 sarebbe falso. */
    if (servono < T.balletteMinimo) {
      const mesi = T.balletteMinimo * T.ballettaKg / r.kgMese;
      return `${camion} Al mese servono ${num(servono)} ballette. L'ordine minimo \u00E8 di `
        + `${num(T.balletteMinimo)} ballette su ${num(T.balletteMinimo / T.ballettePerBancale)} bancali, `
        + `circa ${ton(T.balletteMinimo * T.ballettaKg)} t, e ti copre circa ${num(mesi, 1)} mesi. ${staff}`;
    }
    const ballette = Math.ceil(servono / T.ballettePerBancale) * T.ballettePerBancale;
    // il camion (Giulio, 26/10/2026): una motrice ne porta 18, un bilico 36
    const carico = `. Una motrice ne porta ${T.ballettePerMotrice}, un bilico ${T.ballettePerBilico}`;
    return `${camion} Al mese servono ${num(ballette)} ballette, su ${num(ballette / T.ballettePerBancale)} bancali, `
      + `circa ${ton(ballette * T.ballettaKg)} t${carico}. ${staff}`;
  }

  /* Sotto il minimo, come per le ballette, fabbisogno e ordine sono due numeri
     diversi e si dicono tutti e due: "sul trimestre servono 2,4 t" a chi ne
     consuma 0,7 sarebbe falso. */
  const sottoMinimo = (minimoKg, testoMinimo, chiusa) => {
    const mesi = minimoKg / r.kgMese;
    return `${camion} Sul trimestre servono circa ${migliaia(kgOrizzonte)} kg. `
      + `L'ordine minimo \u00E8 di ${testoMinimo}, ${ton(minimoKg)} t, e ti copre circa ${num(mesi, 1)} mesi. ${chiusa}`;
  };

  // Sacchetti: bancali interi, minimo 2, nessun camion da saturare.
  if (c.kg === 25) {
    const staff = 'La consegna la organizza lo staff Pro Farmer';
    const servono = Math.ceil(kgOrizzonte / T.bancaleKg);
    if (servono < T.bancaliMinimo) {
      return sottoMinimo(T.bancaliMinimo * T.bancaleKg,
        `${num(T.bancaliMinimo)} bancali di sacchetti da 25 kg`, staff);
    }
    const minimo = servono === T.bancaliMinimo ? ", che \u00E8 anche l'ordine minimo" : '';
    return `${camion} Sul trimestre servono ${num(servono)} bancali di sacchetti da 25 kg, `
      + `${ton(servono * T.bancaleKg)} t${minimo}. ${staff}`;
  }

  // Un formato che non conosciamo:
  // niente numeri inventati.
  if (c.kg !== T.bigBagKg) {
    return `${camion} Quantit\u00E0 e trasporto da valutare con lo staff Pro Farmer`;
  }

  const bbServono = Math.ceil(kgOrizzonte / T.bigBagKg);
  if (bbServono < T.bigBagMinimo) {
    return sottoMinimo(T.bigBagMinimo * T.bigBagKg, `${num(T.bigBagMinimo)} Big Bag`,
      'A queste quantit\u00E0 la consegna passa dalla logistica: le condizioni migliori le definisci con lo staff Pro Farmer');
  }
  const bb = bbServono;
  const testa = `${camion} Sul trimestre servono ${num(bb)} Big Bag, ${ton(bb * T.bigBagKg)} t`;
  const chiusa = "e l'incidenza del trasporto scende al minimo: da valutare con lo staff Pro Farmer";

  /* Come si nomina il carico dipende da dove sta l'allevatore rispetto a esso.
     Se gliene servono MENO di un camion pieno, la proposta e' arrivarci: "con
     26 Big Bag". Se gliene servono di piu', il camion pieno non e' l'ordine ma
     la spedizione: "spedendone 26 per viaggio". Senza questa distinzione, a chi
     serve 34 avremmo detto "con 26" e sarebbe sembrato un invito a ordinare
     meno del necessario. */
  const proposta = (quanti, mezzo, verbo) => bb <= quanti
    ? `Con ${num(quanti)} Big Bag ${verbo} ${mezzo}, ${ton(quanti * T.bigBagKg)} t, ${chiusa}`
    : `Spedendone ${num(quanti)} per viaggio ${verbo} ${mezzo}, ${ton(quanti * T.bigBagKg)} t, ${chiusa}`;

  if (bb >= T.sogliaBilico) {
    return `${testa}. ` + proposta(T.bilico, 'un bilico', 'si satura');
  }
  if (bb >= T.sogliaMotrice) {
    return `${testa}. ` + proposta(T.motrice, 'una motrice', 'si riempie');
  }

  const minimo = bb === T.bigBagMinimo ? ", che \u00E8 anche l'ordine minimo" : '';
  return `${testa}${minimo}. A queste quantit\u00E0 la consegna passa dalla logistica: `
    + 'le condizioni migliori le definisci con lo staff Pro Farmer';
}

/* La fornitura per l'e-mail all'allevatore (Giulio, 25/10/2026): un numero
   secco, con le stesse regole di consiglioTrasporto. Trimestre per big bag e
   sacchi (arrotondato al camion quando ci si avvicina), mese per le ballette. */
function fornituraConsigliata(r) {
  const c = r.confezioneConsigliata, T = TRASPORTO;
  if (!c || !r.kgMese) return null;
  /* Sotto l'ordine minimo la fornitura non è più di uno o tre mesi: si dice
     che è il minimo e quanti mesi copre (come in consiglioTrasporto). */
  const esito = (n, kgPezzo, testo, mesi, minimo) => minimo
    ? { testo, mesi, minimo: true, copre: Math.round(n * kgPezzo / r.kgMese) }
    : { testo, mesi, minimo: false };
  if (c.kg === T.ballettaKg) {
    const servono = Math.ceil(r.kgMese * T.mesiOrizzonteBallette / T.ballettaKg);
    const pari = Math.ceil(servono / T.ballettePerBancale) * T.ballettePerBancale;
    const n = Math.max(pari, T.balletteMinimo);
    return esito(n, T.ballettaKg, `${num(n)} ballette da ${num(T.ballettaKg)} kg, circa ${ton(n * T.ballettaKg)} t`,
      T.mesiOrizzonteBallette, servono < T.balletteMinimo);
  }
  const kg3 = r.kgMese * T.mesiOrizzonte;
  if (c.kg === 25) {
    const servono = Math.ceil(kg3 / T.bancaleKg), n = Math.max(servono, T.bancaliMinimo);
    return esito(n, T.bancaleKg, `${num(n)} bancali di sacchi da 25 kg, ${ton(n * T.bancaleKg)} t`, T.mesiOrizzonte, servono < T.bancaliMinimo);
  }
  if (c.kg !== T.bigBagKg) return null;
  const servono = Math.ceil(kg3 / T.bigBagKg);
  let n = Math.max(servono, T.bigBagMinimo);
  if (n >= T.sogliaBilico && n <= T.bilico) n = T.bilico;
  else if (n >= T.sogliaMotrice && n <= T.motrice) n = T.motrice;
  return esito(n, T.bigBagKg, `${num(n)} Big Bag da ${num(T.bigBagKg)} kg, ${ton(n * T.bigBagKg)} t`, T.mesiOrizzonte, servono < T.bigBagMinimo);
}

function testoRiepilogo(dati, r) {
  const d = r.dati, s = r.scenario, p = r.prodotto;
  const L = [];

  /* Il PRIMO messaggio dice solo l'essenziale: che prodotto serve, come si
     applica e quanto distribuirne. Niente scelte premium, niente proposta di
     prova: quelle sono materia della conversazione che l'agente apre dopo,
     non del messaggio che arriva per primo.
     Why: un allevatore in stalla legge sei righe, non una scheda.
     Il grassetto si scrive *cosi*: nell'e-mail lo traduce in HTML la
     funzione "lead" su Supabase. Attenzione a non lasciare mai uno spazio prima
     dell'asterisco di chiusura, o il grassetto non viene applicato. */

  const chi = dati.azienda || dati.nome || 'la tua stalla';
  L.push(`\u{1F4AA} *RIPOSA*, l'app Pro Farmer che calcola per *${chi}*`);
  L.push('');

  // Le caratteristiche servono a riconoscere di quale stalla si parla.
  const zone = { materassino: 'cuccette a materassino', buca: 'cuccette a buca',
                 lettiera: 'lettiera a rinnovo frequente', compost: 'compost barn' };
  const contesto = [zone[d.zona]];
  if (r.superficie) {
    contesto.push(`${num(d.mq)} m\u00B2`);
  } else if (d.cuccette) {
    contesto.push(`${num(d.cuccette)} cuccette`);
  }
  if (d.mungitura === 'robot') contesto.push('mungitura con robot');
  L.push(`Caratteristiche stalla: ${maiuscola(contesto.join(', '))}`);
  L.push('');

  if (r.soloConsulenza) {
    L.push('\u2705 *Questa zona richiede una valutazione dedicata:* ti ricontattiamo noi.');
    L.push('');
    L.push("\u{1F449} Calcolo generato da *RIPOSA*, un'app ideata da Pro Farmer");
    return L.join('\n');
  }

  L.push(`\u2705 Prodotto consigliato: *${p.nome}*`);
  L.push('');

  const dose = r.superficie
    ? `${num(r.dosePerMq, 2)} kg per m\u00B2`
    : `${kg(r.dosePerCuccetta)} kg per cuccetta`;
  L.push(`\u{1F91D} Modalit\u00E0 di applicazione, quantit\u00E0 e frequenza di distribuzione consigliate: distribuzione ${s.distribuzione}, ${dose}, ${r.etichettaFrequenza}. Totale per l'intera stalla: ${kg(r.kgApplicazione)} kg`);
  if (r.miscelata) {
    L.push('');
    L.push(`La miscela, per cuccetta: pi\u00F9Lact ${kg(r.dosePerCuccetta)} kg + paglia ${kg(r.pagliaPerCuccetta)} kg + acqua ${kg(r.acquaPerCuccetta)} litri`);
  }
  L.push('');

  L.push(`Calcolo fabbisogno sul mese: ${migliaia(r.kgMese)} kg`);
  L.push('');
  L.push(`Formato consigliato: ${maiuscola(r.confezioneConsigliata.etichetta)}`);
  L.push('');

  /* Il quarto punto promesso in home, e dal 9 settembre sera con i numeri veri:
     le regole stanno in TRASPORTO, dentro regole.js. */
  const trasporto = consiglioTrasporto(r);
  if (trasporto) {
    L.push(trasporto);
    L.push('');
  }

  /* L'alternativa, in due righe: chi riceve le ballette come prima scelta deve
     sapere che, se la miscelata preferisce farla lui, gli basta piùLact; chi
     ha il materassino, che con le ballette mette paglia e piùLact insieme. */
  (r.premium || []).forEach(a => {
    const dose = a.miscelata
      ? `${kg(a.dosePerCuccetta)} kg per cuccetta in ${kg(a.mixPerCuccetta)} kg di mix`
      : `${kg(a.dosePerCuccetta)} kg per cuccetta`;
    L.push(`\u{1F504} ${a.scenario.alternativaTesti.riepilogo}: *${a.prodotto.nome}*, `
      + `${dose}, ${a.etichettaFrequenza}. `
      + `Fabbisogno sul mese: ${migliaia(a.kgMese)} kg di ${a.prodotto.nome}`);
    L.push('');
  });

  L.push("\u{1F449} Calcolo generato da *RIPOSA*, un'app ideata da Pro Farmer");
  return L.join('\n');
}

/* ------------------------------------------------------------ raccolta lead */
/* Dal 23/10/2026: un POST alla funzione "lead" su Supabase, che controlla i
   dati, scrive il lead, manda l'e-mail all'allevatore (con il link ai
   materiali aggiunto dal server) e, col consenso, crea il contatto in
   ActiveCampaign. Nessuna chiave passa da qui. Vedi
   integrazioni/supabase/functions/lead. */

function inviaLead(dati, r) {
  const conf = CONFIG.raccoltaLead;
  const d = r.dati;
  const scelta = (r.premium || []).find(x => x.idScenario === premiumScelto);

  const corpo = {
    azienda:        dati.azienda || '',
    nome:           dati.nome || '',
    provincia:      dati.provincia || '',
    telefono:       dati.telefono || '',
    email:          dati.email || '',
    consenso:       !!dati.consenso,
    zona:           d.zona || '',
    cuccette:       d.cuccette || '',
    cuccetteStimate: !!d.cuccetteStimate,
    capi:           d.capi || '',
    mungitura:      d.mungitura || '',
    riempimento:    d.riempimento || '',
    lettiera:       (d.lettieraAttuale || []).join(', '),
    biogas:         !!d.biogas,
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
    riepilogo:      testoRiepilogo(dati, r),
    // l'e-mail all'allevatore, a punti (25/10/2026)
    distribuzione:  r.scenario && r.scenario.distribuzione ? maiuscola(r.scenario.distribuzione) : '',
    perDistribuzione: r.superficie
                    ? `${num(r.dosePerMq, 2)} kg per m\u00B2, ${kg(r.kgApplicazione)} kg in tutto`
                    : (r.dosePerCuccetta ? `${kg(r.dosePerCuccetta)} kg per cuccetta, ${kg(r.kgApplicazione)} kg per tutta la stalla` : ''),
    fornitura:      (fornituraConsigliata(r) || {}).testo || '',
    fornituraMesi:  (fornituraConsigliata(r) || {}).mesi || '',
    fornituraCopre: (fornituraConsigliata(r) || {}).minimo ? fornituraConsigliata(r).copre : '',
    // l'alternativa di «Come lo propone Riposa», anche nell'e-mail (audit 28/10/2026)
    alternativa:    (r.premium || []).map(a => `${a.scenario.alternativaTesti.riepilogo}: ${a.prodotto.nome}, `
                    + `${kg(a.dosePerCuccetta)} kg per cuccetta${a.miscelata ? ` in ${kg(a.mixPerCuccetta)} kg di mix` : ''}, `
                    + `${a.etichettaFrequenza} (${migliaia(a.kgMese)} kg al mese)`).join('. '),
    // l'app sul telefono (24/10/2026): il telefono che ha già fatto un calcolo si fa riconoscere
    kgPezzo:        r.confezioneConsigliata ? r.confezioneConsigliata.kg : '',
    app:            typeof Allevatore !== 'undefined' ? Allevatore.credenziali() : null
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  return fetch(conf.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: ctrl.signal
  }).then(x => x.json().catch(() => ({})).then(j => {
    if (!x.ok || !j.ok) throw new Error(j.motivo || 'errore');
    if (j.app && typeof Allevatore !== 'undefined') {
      Allevatore.salva(j.app, {
        azienda: dati.azienda || '', prodotto: r.prodotto.nome || '',
        kgMese: r.kgMese ? Math.round(r.kgMese) : null,
        kgPezzo: r.confezioneConsigliata ? r.confezioneConsigliata.kg : null
      });
    }
    return j;
  })).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------------- avvio */

function togliErroreCampo() {
  modulo.querySelectorAll('.errore-campo').forEach(e => e.remove());
  modulo.querySelectorAll('.campo-mancante').forEach(e => e.classList.remove('campo-mancante'));
}
// appena l'allevatore risponde, l'avviso sparisce
modulo.addEventListener('change', togliErroreCampo);

modulo.addEventListener('submit', ev => {
  ev.preventDefault();
  const d = leggiModulo();

  togliErroreCampo();
  if (d.errore) {
    /* L'errore si scrive accanto alla domanda che manca, e la pagina ci va:
       sul telefono la domanda è spesso molto più su del pulsante (24/10/2026). */
    const campo = d.campo && modulo.querySelector(d.campo);
    const box = campo && campo.closest('fieldset, .campo');
    if (box) {
      boxErrore.hidden = true;
      box.classList.add('campo-mancante');
      box.insertAdjacentHTML('beforeend', `<p class="errore errore-campo" role="alert">${esc(d.errore)}</p>`);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (campo.type !== 'radio') campo.focus({ preventScroll: true });
      return;
    }
    boxErrore.textContent = d.errore;
    boxErrore.hidden = false;
    boxErrore.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  boxErrore.hidden = true;

  premiumScelto = null;
  consegnato = false;
  datiContatto = null;
  ultimoRisultato = calcola(d);
  /* Il venditore vede il risultato subito, a schermo: il muro dei lead vale
     per l'allevatore, non per chi gli sta facendo il conto davanti. */
  if (typeof Venditori !== 'undefined' && Venditori.attivo()) {
    disegnaRisultato(ultimoRisultato);
    return;
  }
  mostraRagionamento(ultimoRisultato);
});
