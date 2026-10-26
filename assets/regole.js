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
    sito: 'https://www.profarmer.it/piulact/'
  },

  // Raccolta lead. Dal 23/10/2026 il calcolatore manda i dati alla funzione
  // "lead" su Supabase (progetto riposa, Francoforte): scrive il lead, manda
  // l'e-mail all'allevatore e, col consenso, crea il contatto in
  // ActiveCampaign. Le chiavi stanno sul server, qui c'è solo l'indirizzo.
  // Il codice sta in integrazioni/supabase/functions/lead.
  // Prima era lo script Google del foglio "Riposa — lead calcolatore".
  /* Il contatore anonimo dei passaggi (26/10/2026, 25-contatore-passaggi.sql):
     solo quante volte al giorno si arriva a ogni passaggio, nessun dato della
     persona. La chiave è quella pubblica (anon), la stessa di Riposa Pro. */
  contatore: {
    url: 'https://gmhmxybqmkcmnbjdnslz.supabase.co/rest/v1/rpc/conta_passo',
    chiave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtaG14eWJxbWtjbW5iamRuc2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjM4OTgsImV4cCI6MjEwODIzOTg5OH0.af0OZrnCjJ6Wznmv0vmimnUSOPeLcrRSU5AhyvIRNBc'
  },
  raccoltaLead: {
    url: 'https://gmhmxybqmkcmnbjdnslz.supabase.co/functions/v1/lead'
  },

  // Informativa privacy, linkata dalla spunta di consenso. È il documento
  // iubenda di profarmer.it (public id 12376136), che dall'8 settembre 2026
  // dichiara anche i servizi usati dal calcolatore: modulo di contatto,
  // mailing list, ActiveCampaign, Google Sheets, Google Cloud, GitHub Pages,
  // WhatsApp. Se qui resta vuoto la spunta c'è lo stesso, ma senza link.
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
/* I due prodotti della gamma                                                  */
/* -------------------------------------------------------------------------- */
/* Dal 18 ottobre 2026 la gamma proposta è di due prodotti: piùLact e piùLact
   Pronto in ballette. piùLact LA e il PRONTO col canapulo escono dall'app:
   decisione di Giulio. */

/* --------------------------------------------------------------------------
   IL TRASPORTO
   --------------------------------------------------------------------------
   Regole date da Giulio la sera del 9 settembre 2026. Il senso commerciale:
   sotto una certa quantità la consegna passa da una logistica e portare 4 big
   bag o 5 cambia poco sull'incidenza per tonnellata. Il margine da prendersi
   compare quando il carico si avvicina a saturare un camion, e allora ha senso
   proporre all'allevatore di arrivarci.

   Il consiglio ragiona sul TRIMESTRE, non sul mese: sul mese quasi nessuno
   arriva a un camion, sul trimestre ci arriva una stalla media.

   Vale per i big bag. Le ballette di piùLact Pronto hanno regole loro, in
   fondo a questo blocco. Chi prende i bancali di sacchetti è un'azienda
   piccola e non arriverà mai a una motrice intera: per lei conta solo
   arrotondare a bancali interi e rispettare il minimo.

   Le due soglie NON si toccano senza chiederlo a Giulio: sono suo giudizio
   commerciale, non un calcolo. Il 9 settembre gli ho proposto di abbassare la
   soglia della motrice da 20 a 15 big bag e ha detto no. */
const TRASPORTO = {
  mesiOrizzonte: 3,        // il consiglio parla del fabbisogno di un trimestre

  bigBagKg: 600,
  bigBagMinimo: 4,         // ordine minimo: 4 big bag = 2,4 t
  bancaleKg: 1200,         // 48 sacchi da 25 kg
  bancaliMinimo: 2,        // ordine minimo: 2 bancali = 2,4 t

  motrice: 26,             // big bag che saturano una motrice: 15,6 t
  bilico: 50,              // big bag che saturano un bilico: 30 t

  sogliaMotrice: 20,       // da 20 big bag (12 t) si propone la motrice
  sogliaBilico: 35,        // da 35 big bag (21 t) si propone il bilico

  /* piùLact Pronto in ballette. Dati di Giulio, 18 ottobre 2026: ordine minimo
     10 ballette, disposte su 5 bancali (2 ballette per bancale). Il 26/10
     Giulio ha confermato: una motrice ne porta 18, un bilico 36. Il fabbisogno
     si dà sul MESE e non sul trimestre (confermato il 25/10): con 35 kg a
     cuccetta a settimana una stalla media consuma una ventina di ballette al
     mese, e tre mesi di ballette sono un fienile. */
  ballettaKg: 850,
  balletteMinimo: 10,
  ballettePerBancale: 2,
  ballettePerMotrice: 18,
  ballettePerBilico: 36,
  mesiOrizzonteBallette: 1
};

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

  /* Le percentuali della miscela NON vanno scritte qui: questo file è pubblico.
     Si dicono solo gli ingredienti. Regola di riservatezza di Giulio. */
  pronto: {
    id: 'pronto',
    nome: 'piùLact Pronto',
    tagline: 'in ballette, pronto all’uso',
    sintesi: 'Paglia e piùLact già miscelati, per la cuccetta a buca e per il materassino. piùLact, paglia macinata depolverizzata, acqua e acqua di calce, miscelati da noi con il carro e confezionati in ballette fasciate. In azienda non si prepara niente: si apre la balletta e si distribuisce.',
    confezioni: [
      { etichetta: 'ballette da circa 850 kg', kg: 850 }
    ]
  }
};

/* -------------------------------------------------------------------------- */
/* Gli scenari di utilizzo                                                     */
/* -------------------------------------------------------------------------- */

const SCENARI = {

  /* ---- CUCCETTE A BUCA, con piùLact Pronto in ballette ------------ CONFERMATO */
  /* La prima proposta per chi riempie la buca con una miscelata. Stessa dose
     della miscelata fatta in casa: 35 kg a cuccetta, una volta a settimana.
     Decisione di Giulio, 18 ottobre 2026.                                      */
  'buca-pronto': {
    prodotto: 'pronto',
    confermato: true,
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact Pronto in buca, una volta a settimana',
    dosePerCuccettaKg: 35,
    frequenzaGiorni: 7,
    etichettaFrequenza: 'una volta a settimana',
    distribuzione: 'con il lanciapaglia, la pala distributrice, il carro unifeed o un carro tipo spandiletame',
    perche: 'La miscelata arriva già pronta: niente carro da caricare, niente dosi da pesare, niente acqua da aggiungere. Le proporzioni sono sempre quelle giuste, perché la miscelata la facciamo noi.',
    metodologia: [
      'Apri la balletta e caricala nel lanciapaglia, nella pala distributrice, nel carro unifeed o in un carro tipo spandiletame: è già miscelata, non serve aggiungere nulla.',
      'Distribuisci 35 kg di piùLact Pronto per cuccetta, riempiendo la buca.',
      'Ripeti ogni 7 giorni: la cuccetta resta piena e il pH resta alto per tutto l’intervallo.',
      'Nel quotidiano continua a pulire la cuccetta come fai normalmente, senza aggiungere prodotto.'
    ],
    nota: 'Un passaggio a settimana, quattro al mese, e nessuna preparazione in azienda: il tempo che oggi passi a fare la miscelata lo recuperi tutto.',
    alternativa: 'buca-carro'
  },

  /* ---- CUCCETTE A BUCA, miscelata fatta in azienda --------------- CONFERMATO */
  /* Per chi preferisce prepararsi la miscelata da solo: basta piùLact.         */
  'buca-carro': {
    prodotto: 'base',
    confermato: true,
    tipoCalcolo: 'miscelata',
    titolo: 'Miscelata in buca preparata in azienda',
    mixPerCuccettaKg: 35,
    quote: { piulact: 0.20, paglia: 0.40, acqua: 0.40 },
    // 7 giorni e non 9: la scheda prodotto dice 9, ma la settimana è il ritmo con cui
    // ragiona il management della maggior parte degli allevamenti. Scelta di Giulio.
    frequenzaGiorni: 7,
    etichettaFrequenza: 'una volta a settimana',
    distribuzione: 'carro unifeed o lanciapaglia',
    perche: 'Se hai il carro e preferisci prepararla tu, ti basta piùLact: la miscelata la fai in azienda con la tua paglia e la tua acqua.',
    metodologia: [
      'Prepara la miscelata nel carro unifeed: 20% piùLact, 40% paglia macinata, 40% acqua.',
      'Distribuisci 35 kg di mix per cuccetta con il carro o il lanciapaglia, riempiendo la buca.',
      'Ripeti ogni 7 giorni: la cuccetta resta piena e il pH resta oltre 11 per tutto l’intervallo.',
      'Nel quotidiano continua a pulire la cuccetta come fai normalmente, senza aggiungere prodotto.'
    ],
    nota: 'Un passaggio a settimana, quattro al mese. Se un giorno vuoi risparmiarti la preparazione, piùLact Pronto è la stessa miscelata già fatta, in ballette.',
    // quando compare come alternativa al Pronto in buca
    alternativaTesti: {
      domanda: 'Preferisci preparare la miscelata in azienda?',
      scegli: 'Preferisco prepararla in azienda',
      scelto: 'Preferisci prepararla in azienda',
      riepilogo: 'Se preferisci preparare la miscelata in azienda'
    }
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
    nota: 'Se un giorno vuoi passare alla miscelata in buca, con la cuccetta piena per tutta la settimana e quattro passaggi al mese invece di quindici, piùLact Pronto te la porta già fatta, in ballette.'
  },

  /* ---- MATERASSINO ------------------------------------------------ CONFERMATO */
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
    nota: 'Tal quale o insieme alla lettiera che usi già: piùLact alcalinizza la superficie del materassino e la tiene asciutta. Si sparge a mano con la paletta o con un semplice carrellino spandi polveri.',
    alternativa: 'materassino-pronto'
  },

  /* ---- MATERASSINO, con piùLact Pronto in ballette --------------- CONFERMATO */
  /* Alternativa per chi ha una pala distributrice, un lanciapaglia o il carro:
     di solito sul materassino si entra una volta per la paglia e un'altra per
     l'igienizzante, con le ballette si portano in cuccetta tutti e due con un
     solo ingresso. 5 kg a cuccetta a passaggio, due volte a settimana: dati di
     Giulio, 22 ottobre 2026 (il 19 erano 4 kg). 3,5 giorni = due passaggi a
     settimana.                                                                  */
  'materassino-pronto': {
    prodotto: 'pronto',
    confermato: true,
    tipoCalcolo: 'spaglio',
    titolo: 'piùLact Pronto sul materassino, due volte a settimana',
    dosePerCuccettaKg: 5,
    frequenzaGiorni: 3.5,
    etichettaFrequenza: 'due volte a settimana',
    distribuzione: 'con il lanciapaglia, la pala distributrice, il carro unifeed o un carro tipo spandiletame',
    perche: 'Di solito sul materassino si entra una volta per la paglia e un’altra per l’igienizzante. Con le ballette porti in cuccetta paglia macinata e piùLact insieme, con un solo ingresso: il lavoro si dimezza. Serve un lanciapaglia, una pala distributrice, il carro unifeed o un carro tipo spandiletame.',
    metodologia: [
      'Apri la balletta e caricala nel lanciapaglia, nella pala distributrice, nel carro unifeed o in un carro tipo spandiletame: è già miscelata, non serve aggiungere nulla.',
      'Distribuisci 5 kg di piùLact Pronto per cuccetta sul materassino.',
      'Ripeti due volte a settimana: con un solo ingresso metti paglia e igienizzante.'
    ],
    nota: 'Paglia e piùLact in un solo passaggio: un ingresso in stalla al posto di due.',
    alternativaTesti: {
      domanda: 'Vuoi mettere paglia e piùLact con un solo ingresso?',
      scegli: 'Preferisco le ballette',
      scelto: 'Preferisci le ballette',
      riepilogo: 'Se vuoi portare paglia e piùLact in cuccetta con un solo ingresso'
    }
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
    // Chi riempie la buca con una miscelata: prima proposta piùLact Pronto in
    // ballette, la miscelata già fatta. Chi riempie con paglia lunga e spaglia
    // il prodotto sopra: piùLact. Decisione di Giulio, 18 ottobre 2026.
    return d.riempimento === 'miscelata' ? 'buca-pronto' : 'buca-spaglio';
  }

  return 'materassino-base';
}

/* L'alternativa calcolata sugli stessi numeri, quando c'è. Oggi due: chi ha
   la buca a miscelata e preferisce prepararsela in azienda usa piùLact; chi ha
   il materassino e vuole mettere paglia e igienizzante con un solo ingresso
   usa piùLact Pronto in ballette. I testi stanno in `alternativaTesti`. */
function scenariAlternativi(d) {
  const s = SCENARI[scegliScenario(d)];
  return s.alternativa ? [s.alternativa] : [];
}

/* -------------------------------------------------------------------------- */
/* Casi studio reali — usati nel blocco "potenziale"                           */
/* -------------------------------------------------------------------------- */

const CASI_STUDIO = [
  { luogo: 'Provincia di Cremona', tipo: 'cuccette a buca con riempimento', da: 280, a: 88,  mesi: 6 },
  { luogo: 'Provincia di Mantova', tipo: 'buca e materassino, robot con conta cellule', da: 250, a: 100, mesi: 3 },
  { luogo: 'Provincia di Lodi',    tipo: 'materassino e buca, mungitura robotizzata',   da: 200, a: 120, mesi: 4 }
];
