/* ============================================================================
   Riposa — REGOLE DI DOSAGGIO
   ----------------------------------------------------------------------------
   Questo è l'UNICO file da modificare per cambiare la logica di dosaggio.
   Ogni scenario ha un flag `confermato`:
     true  -> valore preso dai materiali piùLact 2026
     false -> segnaposto messo in attesa di conferma: la pagina mostra un avviso
   ========================================================================== */

const CONFIG = {
  azienda: {
    nome: 'Pro Farmer',
    email: 'info@profarmer.it',
    sito: 'https://www.profarmer.it/piulact/',
    // numero WhatsApp aziendale, formato internazionale senza + e senza spazi
    // +39 376 129 6162
    whatsapp: '393761296162'
  },

  // Raccolta lead. Il calcolatore parla con UN solo indirizzo: la Web App di
  // Google Apps Script che vive dentro il foglio "Riposa — lead calcolatore".
  // È quello script a scrivere la riga sul foglio e a creare il contatto in
  // ActiveCampaign, tenendo la chiave API al sicuro sui server di Google.
  // Il codice dello script sta in integrazioni/foglio-google.gs
  raccoltaLead: {
    attivo: true,
    // Web App di Google Apps Script, versione 4 dell'8 settembre 2026.
    // La prima distribuzione era rimasta in uno stato rotto (rispondeva
    // "Script function not found: doGet" anche col codice giusto): questa è
    // una distribuzione nuova, creata da zero, e risponde.
    url: 'https://script.google.com/macros/s/AKfycbyMzaKgp6VBNIG_pkVPzzXSS7aLVOxAPEmopH0ZYKoUuK2DjwRg0dYVquMhzGNOz_ef/exec',
    // L'invio per e-mail lo fa lo script, non il sito. Va messo a true solo
    // dopo aver aggiunto MailApp allo script e ridistribuito una nuova versione:
    // finché è false il pulsante E-mail non compare, così non promettiamo
    // all'allevatore un invio che non parte.
    emailAttiva: true
  },

  // ⚠️ DA COMPILARE: pagina dell'informativa privacy su profarmer.it,
  // linkata dalla spunta di consenso. Se resta vuota la spunta c'è lo stesso,
  // ma senza link.
  urlPrivacy: 'https://www.iubenda.com/privacy-policy/12376136',

  // capi in mungitura -> cuccette, quando l'allevatore non conosce il numero di cuccette.
  // 1,2 e non 1,05: arrotonda per eccesso di proposito, per tenere dentro gli spazi delle
  // asciutte e il prodotto che in azienda finisce comunque in sala parto, infermeria e
  // gabbiette dei vitelli. Riferimento dato da Giulio: 100 vacche in lattazione -> 120 cuccette.
  rapportoCuccettePerCapo: 1.2,

  // 30 tondi, non 30,4: i conti restano leggibili e verificabili a mente.
  // Scelta di Giulio.
  giorniAlMese: 30
};

/* -------------------------------------------------------------------------- */
/* I tre prodotti della gamma                                                  */
/* -------------------------------------------------------------------------- */

const PRODOTTI = {
  base: {
    id: 'base',
    nome: 'piùLact',
    tagline: 'versatile',
    sintesi: 'Il prodotto principe della gamma. Alcalinizza la zona di riposo fino a 11 giorni, con polverosità ridotta ai minimi termini. Si usa tal quale o miscelato con paglia, segatura, separato e digestato.',
    confezioni: [
      { etichetta: 'sacchi da 25 kg', kg: 25 },
      { etichetta: 'big bag da 600 kg', kg: 600 }
    ]
  },

  la: {
    id: 'la',
    nome: 'piùLact LA',
    tagline: 'long action',
    sintesi: 'Formulazione dedicata alle stalle con mungitura robotizzata e cuccette a materassino, dove entrare in stalla il meno possibile fa la differenza. Il potere alcalinizzante viene ceduto in modo graduale, come un concime a lenta cessione.',
    confezioni: [
      { etichetta: 'sacchi da 25 kg', kg: 25 },
      { etichetta: 'big bag da 600 kg', kg: 600 }
    ]
  },

  pronto: {
    id: 'pronto',
    nome: 'piùLact PRONTO',
    tagline: 'già miscelato — canapulo + piùLact 80/20',
    sintesi: 'Un solo ingresso in stalla al posto di due. Arriva in big bag già miscelato: canapulo fine e piùLact nelle proporzioni corrette, senza possibilità di errore in azienda. Il canapulo tiene la cuccetta più asciutta più a lungo.',
    confezioni: [
      { etichetta: 'big bag da circa 300 kg', kg: 300 }
    ]
  }
};

/* -------------------------------------------------------------------------- */
/* Gli scenari di utilizzo                                                     */
/* -------------------------------------------------------------------------- */

const SCENARI = {

  /* ---- CUCCETTE A BUCA, con carro unifeed ------------------------- CONFERMATO */
  'buca-carro': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'miscelata',
    titolo: 'Miscelata in buca, distribuita con il carro',
    mixPerCuccettaKg: 35,
    quote: { piulact: 0.20, paglia: 0.40, acqua: 0.40 },
    // 7 giorni e non 9: la scheda prodotto dice 9, ma la settimana è il ritmo con cui
    // ragiona il management della maggior parte degli allevamenti. Scelta di Giulio.
    frequenzaGiorni: 7,
    etichettaFrequenza: 'una volta a settimana',
    distribuzione: 'carro unifeed o lanciapaglia',
    metodologia: [
      'Prepara la miscelata nel carro unifeed: 20% piùLact, 40% paglia macinata, 40% acqua.',
      'Distribuisci 35 kg di mix per cuccetta con il carro o il lanciapaglia, riempiendo la buca.',
      'Ripeti ogni 7 giorni: la cuccetta resta piena e il pH resta oltre 11 per tutto l’intervallo.',
      'Nel quotidiano continua a pulire la cuccetta come fai normalmente, senza aggiungere prodotto.'
    ],
    nota: 'È la configurazione documentata con i risultati migliori: pH della miscelata oltre 11 e cuccetta piena per tutto l’intervallo. Un passaggio a settimana, quattro al mese.'
  },

  /* ---- CUCCETTE A BUCA riempite di paglia lunga ------------------- CONFERMATO */
  'buca-spaglio': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact a spaglio sul materiale di riempimento',
    dosePerCuccettaKg: 0.5,
    frequenzaGiorni: 2,
    etichettaFrequenza: 'un giorno sì e uno no',
    distribuzione: 'a spaglio',
    metodologia: [
      'Riempi la buca come fai normalmente: paglia lunga, separato o digestato.',
      'Distribuisci 0,5 kg di piùLact per cuccetta a spaglio, sopra il materiale.',
      'Ripeti un giorno sì e uno no.'
    ],
    nota: 'Se hai accesso a un carro miscelatore, anche in conto lavoro, vale la pena valutarlo: con la miscelata 20/40/40 il pH resta oltre 11 e la cuccetta resta piena per tutta la settimana, con quattro passaggi al mese invece di quindici.'
  },

  /* ---- MATERASSINO + ROBOT · PREMIUM ------------------------------ CONFERMATO */
  'materassino-robot': {
    prodotto: 'la',
    confermato: true,
    premium: true,
    perche: 'Granulometria più grossolana e rilascio lento: si passa da quindici distribuzioni al mese a dieci. Meno manodopera, meno disturbo agli animali, e meno rischio di vacche che arrivano in ritardo al robot.',
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact LA a spaglio sul materassino',
    dosePerCuccettaKg: 0.5,
    frequenzaGiorni: 3,
    etichettaFrequenza: 'ogni 3 giorni',
    distribuzione: 'a spaglio',
    metodologia: [
      'Distribuisci 0,5 kg di piùLact LA per cuccetta, a spaglio sul materassino.',
      'Ripeti ogni 3 giorni.',
      'La cessione graduale del potere alcalinizzante ti permette di entrare in stalla meno spesso, senza perdere protezione della mammella.'
    ],
    nota: 'Con la mungitura robotizzata ogni ingresso in stalla è un’interferenza sul traffico delle vacche: LA è nato per questo.',
    alternativa: 'pronto'
  },

  /* ---- MATERASSINO + PRONTO · PREMIUM ----------------------------- CONFERMATO */
  'materassino-pronto': {
    prodotto: 'pronto',
    confermato: true,
    premium: true,
    perche: 'Un solo ingresso in stalla al posto di due: nella stessa passata distribuisci l’igienizzante e il lettime. Il canapulo assorbe fino a cinque volte il proprio peso e tiene la cuccetta asciutta più a lungo.',
    perchebiogas: 'E con il biogas o il biometano a valle c’è un motivo in più: nel digestore il canapulo rende più del doppio della paglia.',
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact PRONTO sul materassino',
    dosePerCuccettaKg: 3,
    frequenzaGiorni: 7,
    etichettaFrequenza: 'una volta a settimana',
    distribuzione: 'a spaglio o con il carro',
    metodologia: [
      'Distribuisci 3 kg di piùLact PRONTO per cuccetta, a spaglio o con il carro.',
      'Ripeti una volta a settimana.',
      'Non serve preparare nulla: canapulo e piùLact arrivano già miscelati nelle proporzioni corrette.'
    ],
    nota: 'Lettiera e igienizzante in un solo passaggio: un ingresso in stalla al posto di due. Il canapulo assorbe fino a cinque volte il proprio peso e tiene la cuccetta asciutta, il piùLact la alcalinizza. Con un impianto di biogas o biometano a valle, il canapulo rende nel digestore più del doppio della paglia.',
    alternativa: 'la'
  },

  /* ---- MATERASSINO, lettiera propria già in uso ------------------- CONFERMATO */
  'materassino-base': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact tal quale a spaglio sul materassino',
    dosePerCuccettaKg: 0.5,
    frequenzaGiorni: 2,
    etichettaFrequenza: 'un giorno sì e uno no',
    distribuzione: 'a spaglio',
    metodologia: [
      'Distribuisci 0,5 kg di piùLact per cuccetta a spaglio sul materassino, sopra o insieme alla lettiera che usi già.',
      'Ripeti un giorno sì e uno no.'
    ],
    nota: 'Se preferisci un solo passaggio invece di due, piùLact PRONTO porta lettiera e igienizzante già miscelati, con una distribuzione a settimana invece di quindici al mese.',
    alternativa: 'pronto'
  },

  /* ---- LETTIERA A RINNOVO FREQUENTE ------------------------------- CONFERMATO */
  /* Lettiera in paglia o simili, rimossa e rifatta con regolarità: sale parto,
     vitellaia, aree a riposo.                                                       */
  'lettiera-permanente': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'superficie',
    titolo: 'piùLact a spaglio sulla lettiera',
    dosePerMqKg: 0.05,
    // la frequenza dipende da quanto spazio ha ogni capo: più lettiera per capo,
    // meno si sporca, meno spesso serve intervenire
    frequenzaVariabile: { sogliaMqPerCapo: 9, sopraGiorni: 3, sottoGiorni: 2 },
    distribuzione: 'a spaglio',
    metodologia: [
      'Distribuisci piùLact a spaglio su tutta la superficie della lettiera: 0,05 kg per metro quadro.',
      'Con più di 9 m² di lettiera per capo ripeti ogni 3 giorni; con meno, un giorno sì e uno no.',
      'Continua a rinnovare la lettiera come fai normalmente: piùLact non sostituisce il materiale, alcalinizza l’ambiente.'
    ],
    nota: 'Vale per le lettiere in paglia o simili, rinnovate con regolarità. Se invece la pulizia arriva dopo diversi mesi e nel frattempo aggiungi materiale lavorandolo col coltivatore, sei in un compost barn: la gestione è diversa.'
  },

  /* ---- COMPOST BARN ---------------------------------------------- CONFERMATO */
  'compost-barn': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'superficie',
    titolo: 'piùLact nel compost barn',
    dosePerMqKg: 0.05,
    frequenzaGiorni: 1,
    etichettaFrequenza: 'a ogni lavorazione, in pratica tutti i giorni',
    distribuzione: 'a spaglio, prima del passaggio del coltivatore',
    metodologia: [
      'Distribuisci piùLact a spaglio su tutta la superficie: 0,05 kg per metro quadro.',
      'Fallo a ogni ingresso per la lavorazione del substrato, quindi in pratica tutti i giorni.',
      'Il coltivatore incorpora il prodotto nel substrato insieme al materiale che aggiungi.'
    ],
    nota: 'Nel compost barn la lettiera si rinnova di rado — la pulizia arriva dopo diversi mesi — e nel frattempo si aggiunge materiale lavorandolo col coltivatore. Il prodotto entra a ogni passaggio, ed è per questo che il consumo è più alto di una lettiera a rinnovo frequente.'
  }
};

/* -------------------------------------------------------------------------- */
/* L'albero decisionale                                                        */
/* -------------------------------------------------------------------------- */

function scegliScenario(d) {
  if (d.zona === 'compost') return 'compost-barn';
  if (d.zona === 'lettiera') return 'lettiera-permanente';

  if (d.zona === 'buca') {
    // non conta l'attrezzatura che possiede, conta come riempie la cuccetta:
    // chi prepara una miscelata la distribuisce comunque con carro o lanciapaglia
    return d.riempimento === 'miscelata' ? 'buca-carro' : 'buca-spaglio';
  }

  // Materassino: il piùLact classico è sempre la prima scelta proposta.
  // LA e PRONTO sono scelte premium, e come tali le decide l'allevatore:
  // arrivano dopo, calcolate, in scenariPremium().
  return 'materassino-base';
}

/* Le scelte premium proponibili su questa stalla, nell'ordine in cui mostrarle. */
function scenariPremium(d) {
  if (d.zona !== 'materassino') return [];
  // PRONTO è sempre proponibile su materassino; LA solo con la mungitura robotizzata.
  // Con il robot mettiamo LA per primo: è la ragione per cui esiste.
  return d.mungitura === 'robot'
    ? ['materassino-robot', 'materassino-pronto']
    : ['materassino-pronto'];
}

/* -------------------------------------------------------------------------- */
/* Proposte di prova                                                           */
/* -------------------------------------------------------------------------- */

const PROPOSTE = {
  /* Stalle con cuccette a materassino: fornitura composta, per far entrare
     piùLact PRONTO in stalla insieme all'ordine di piùLact classico. */
  provaMaterassino: {
    sacconiPiulact: 6,
    sacconiPronto: 2,
    titolo: 'Prova piùLact PRONTO in cuccetta',
    testo: 'Una fornitura composta: 6 sacconi di piùLact e 2 di piùLact PRONTO da provare. Due sacconi bastano per vedere come si comporta la cuccetta con il canapulo, senza cambiare tutta la gestione.'
  },

  /* Tutte le altre stalle: piùLact PRONTO nelle gabbiette dei vitelli.
     Quantità per dimensione dell'allevamento, in capi in lattazione. */
  gabbietteVitelli: {
    titolo: 'Prova piùLact PRONTO nelle gabbiette dei vitelli',
    testo: 'Non serve avere il materassino per usare PRONTO. Nelle gabbiette dei vitelli riempi in modo comodo con un materiale che ha un grande potere assorbente e che contrasta la proliferazione dei patogeni: un solo prodotto, due benefici per il vitello.'
  }
};

/* sotto i 300 capi in lattazione: 2 sacconi · da 300 a 600: 4 · oltre 600: 6 */
function sacconiGabbiette(capiInLattazione) {
  if (!capiInLattazione) return 2;
  if (capiInLattazione < 300) return 2;
  if (capiInLattazione <= 600) return 4;
  return 6;
}

/* -------------------------------------------------------------------------- */
/* Casi studio reali — usati nel blocco "potenziale"                           */
/* -------------------------------------------------------------------------- */

const CASI_STUDIO = [
  { luogo: 'Provincia di Cremona', tipo: 'cuccette a buca con riempimento', da: 280, a: 88,  mesi: 6 },
  { luogo: 'Provincia di Mantova', tipo: 'buca e materassino, robot con conta cellule', da: 250, a: 100, mesi: 3 },
  { luogo: 'Provincia di Lodi',    tipo: 'materassino e buca, mungitura robotizzata',   da: 200, a: 120, mesi: 4 }
];
