/* ============================================================================
   Riposa e Riposa Pro — le novità di ogni versione (dal 19/11/2026)
   ----------------------------------------------------------------------------
   Regola di Giulio: a ogni aggiornamento corrisponde una versione, e deve
   essere evidente a chi usa l'app che è stato fatto. La versione è il ?v= dei
   file (20261119d → «19/11/2026 d»). Per ogni pubblicazione:
     1. si alza il ?v= in index.html;
     2. si aggiunge QUI in cima la voce di quella versione, con frasi brevi
        per chi usa l'app (non per noi): «venditori» per Riposa Pro,
        «allevatori» per Riposa; una delle due può mancare;
     3. node strumenti/genera-pro.mjs: si ferma se la voce manca.
   Riposa Pro mostra la novità una volta in home dopo l'aggiornamento, e
   sempre nel Profilo; Riposa la mostra in fondo alla pagina.
   ========================================================================== */
var NOVITA = [
  { v: '20261119h', data: '19/11/2026',
    venditori: [
      'Rivenditori a cui il prezzo del piùLact lo indica Pro Farmer: nel conto il totale dice «da Pro Farmer», non più 0,00 €.'
    ] },
  { v: '20261119g', data: '19/11/2026',
    venditori: [
      'Nei clienti contano solo gli ordini veri: i preventivi non ancora accettati non compaiono più come ordini.',
      'Testi più chiari in diversi punti, e sul telefono la Gestione non esce più dai bordi.'
    ],
    allevatori: [
      'Sotto «Da ordinare» ora c’è anche per quanto tempo basta.',
      'Il numero di Pro Farmer si tocca per chiamare.'
    ] },
  { v: '20261119f', data: '19/11/2026',
    venditori: [
      'Gli importi degli ordini sono quelli di Fatture in Cloud: il preventivo, poi la fattura con il peso reale delle ballette.'
    ] },
  { v: '20261119e', data: '19/11/2026',
    venditori: [
      'In ogni aggiornamento ora vedi cosa è cambiato, qui e nel Profilo. Nel Profilo c’è anche «Scrivi un suggerimento».',
      'Allevatori: dopo il calcolo vedono subito prodotto, dose e quanto ordinare.',
      'Rivenditori con magazzino: l’ordine è un tocco, «Un bilico di piùLact» (48 big bag) o «Un bilico di ballette» (36). Le altre quantità restano sotto, per i casi particolari.',
      'Rivenditori senza magazzino: l’ordine propone solo la consegna in stalla.',
      'Agenti: nelle Provvigioni l’elenco degli ordini da fatturare, uno per uno.'
    ],
    allevatori: [
      'Dopo il calcolo vedi subito il risultato: prodotto, dose e quanto ordinare. Il dettaglio arriva per e-mail.'
    ] },
  { v: '20261119c', data: '19/11/2026',
    venditori: [
      'Rivenditori: si sceglie sempre dove consegnare, «Al mio magazzino» o in stalla dal cliente; il riordino del magazzino è in home.',
      'Primo accesso più semplice: pulsante in vista e «Mandami un altro codice».',
      'I prezzi che ti indica Pro Farmer compaiono come «su richiesta», non più come 0,00 €.'
    ] },
  { v: '20261119b', data: '19/11/2026',
    venditori: ['Ballette da circa 810 kg: calcolo, ordini, anteprima e materiali aggiornati.'],
    allevatori: ['Ballette da circa 810 kg: il calcolo è aggiornato.'] },
  { v: '20261118b', data: '18/11/2026',
    venditori: ['I numeri col punto delle migliaia si leggono giusti: «2.000» vale 2000.', 'Nomi ed e-mail lunghi vanno a capo.'],
    allevatori: ['I numeri col punto delle migliaia si leggono giusti: «2.000» cuccette valgono 2000.'] },
  { v: '20261118a', data: '18/11/2026',
    venditori: ['Rivenditori: il cliente è tuo. Per la consegna in stalla bastano nome, indirizzo e telefono, niente dati fiscali.'] }
];

/* «20261119d» → «19/11/2026 d» */
function nomeVersione(v) {
  var m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})([a-z]*)$/);
  return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1] + (m[4] ? ' ' + m[4] : '') : String(v || '');
}
