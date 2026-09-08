/* ============================================================================
   Riposa — raccolta lead
   ----------------------------------------------------------------------------
   Questo script vive DENTRO il foglio "Riposa — lead calcolatore piùLact".
   Fa tre cose, in quest'ordine:
     1. scrive una riga sul foglio con tutto il calcolo
     2. se il canale scelto è l'e-mail, manda il riepilogo all'allevatore
     3. se le chiavi ActiveCampaign sono configurate, crea o aggiorna il contatto
        e gli applica il tag "riposa"

   Perché così: la chiave API di ActiveCampaign resta qui, sui server di Google,
   e non finisce mai nel codice pubblico del sito.

   ----------------------------------------------------------------------------
   COME SI INSTALLA
   1. Apri il foglio → Estensioni → Apps Script
   2. Cancella tutto quello che c'è nell'editor e incolla QUESTO file
   3. ⚠️ SALVA con Cmd+S — senza salvare, la distribuzione pubblica il vecchio codice
   4. Distribuisci → Gestisci distribuzioni → icona matita → Versione: Nuova
      versione → Distribuisci.  (Alla prima volta: Distribuisci → Nuova
      distribuzione → tipo App web → Esegui come: Me stesso → Chi ha accesso:
      Chiunque)
   5. L'indirizzo che finisce con /exec resta lo stesso: non serve rimandarlo

   FACOLTATIVO — per far arrivare i contatti in ActiveCampaign
   Ingranaggio "Impostazioni progetto" → "Proprietà script" → due proprietà:
      AC_API_URL   es. https://profarmer65399.api-us1.com
      AC_API_KEY   ActiveCampaign → Impostazioni → Sviluppatore
   Senza queste due lo script scrive solo sul foglio e manda le e-mail.
   ========================================================================== */

/* Le colonne del foglio, nell'ordine. Lo script sistema da sé la riga di
   intestazione, così foglio e codice non possono andare fuori sincrono. */
var INTESTAZIONI = [
  'Data e ora', 'Azienda', 'Nome', 'Provincia', 'Telefono', 'Email', 'Consenso',
  'Canale', 'Zona di riposo', 'Cuccette', 'Cuccette stimate', 'Capi in mungitura',
  'Mungitura', 'Riempimento buca', 'Lettiera attuale', 'Biogas', 'Mq lettiera',
  'Capi in zona lettiera', 'Cellule somatiche', 'Prodotto consigliato', 'Dose',
  'Frequenza', 'Kg per passaggio', 'Kg al mese', 'Formato consigliato',
  'Premium di interesse', 'Proposta di prova', 'Esito e-mail',
  'Esito ActiveCampaign'
];

/* I parametri che arrivano dal calcolatore, nello stesso ordine delle colonne.
   'data' e le due colonne di esito le riempie lo script. */
var CAMPI = [
  'data', 'azienda', 'nome', 'provincia', 'telefono', 'email', 'consenso',
  'canale', 'zona', 'cuccette', 'cuccetteStimate', 'capi', 'mungitura',
  'riempimento', 'lettiera', 'biogas', 'mq', 'capiZona', 'cellule', 'prodotto',
  'dose', 'frequenza', 'kgPassaggio', 'kgMese', 'formato', 'premium', 'prova'
];

var TAG_RIPOSA = 18;              // il tag "riposa" in ActiveCampaign
var MITTENTE = 'Pro Farmer';
var OGGETTO_MAIL = 'Il tuo calcolo piùLact — Pro Farmer';

/* id dei campi personalizzati ActiveCampaign, creati il 5 settembre 2026 */
var CAMPI_AC = {
  azienda:   17,
  provincia: 20,
  zona:      21,
  mungitura: 22,
  prodotto:  23,
  premium:   24
};

/* -------------------------------------------------------------------------- */

function doGet(e)  { return gestisci(e); }
function doPost(e) { return gestisci(e); }

function gestisci(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var esito = { ok: false };

  try {
    var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    assicuraIntestazioni(foglio);

    var esitoMail = mandaMail(p);
    var esitoAc   = inviaAdActiveCampaign(p);

    var riga = [];
    for (var i = 0; i < CAMPI.length; i++) {
      var chiave = CAMPI[i];
      riga.push(chiave === 'data' ? new Date() : (p[chiave] || ''));
    }
    riga.push(esitoMail);
    riga.push(esitoAc);

    foglio.appendRow(riga);
    esito = { ok: true, mail: esitoMail, activecampaign: esitoAc };

  } catch (err) {
    esito = { ok: false, errore: String(err) };
    try { console.error(err); } catch (ignora) {}
  }

  return rispondi(esito, p.callback);
}

/* La riga 1 la decide lo script: se non corrisponde, la riscrive. */
function assicuraIntestazioni(foglio) {
  var attuali = foglio.getLastRow() > 0
    ? foglio.getRange(1, 1, 1, INTESTAZIONI.length).getValues()[0]
    : [];
  if (attuali.join('|') === INTESTAZIONI.join('|')) return;

  if (foglio.getLastRow() === 0) {
    foglio.appendRow(INTESTAZIONI);
  } else {
    foglio.getRange(1, 1, 1, INTESTAZIONI.length).setValues([INTESTAZIONI]);
  }
  foglio.getRange(1, 1, 1, INTESTAZIONI.length).setFontWeight('bold');
  foglio.setFrozenRows(1);
}

/* Risposta in JSONP: così il calcolatore può chiamare questo script da un altro
   dominio senza che il browser blocchi la richiesta. */
function rispondi(oggetto, callback) {
  var corpo = JSON.stringify(oggetto);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + corpo + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(corpo)
    .setMimeType(ContentService.MimeType.JSON);
}

/* -------------------------------------------------------------------------- */
/* L'e-mail all'allevatore                                                    */
/* -------------------------------------------------------------------------- */

function mandaMail(p) {
  if (p.canale !== 'email') return '';
  if (!p.email)     return 'nessuna email';
  if (!p.riepilogo) return 'nessun riepilogo';

  try {
    MailApp.sendEmail({
      to: p.email,
      subject: OGGETTO_MAIL,
      name: MITTENTE,
      body: p.riepilogo.replace(/\*/g, ''),
      htmlBody: corpoHtml(p)
    });
    return 'inviata';
  } catch (err) {
    return 'errore: ' + String(err);
  }
}

/* Il riepilogo arriva col grassetto in stile WhatsApp (*così*): lo traduciamo
   in HTML e mandiamo anche la versione a testo semplice come ripiego. */
function corpoHtml(p) {
  var testo = String(p.riepilogo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;'
    + 'font-size:15px;line-height:1.6;color:#14243C;max-width:560px">'
    + '<p style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;'
    + 'color:#2F86E0;margin:0 0 6px">Riposa · calcolo dosaggio</p>'
    + '<p style="margin:0 0 18px">Ciao ' + (p.nome || '') + ', ecco il calcolo '
    + 'per la tua stalla.</p>'
    + '<div style="padding:18px;background:#F4F0E7;border-radius:10px">'
    + testo + '</div>'
    + '<p style="margin:18px 0 0">I valori sono indicativi e vanno adattati alla '
    + 'singola stalla: se vuoi, un tecnico Pro Farmer viene a fare il punto.</p>'
    + '<p style="margin:14px 0 0;font-size:13px;color:#5A6A80">'
    + 'piùLact è un prodotto commercializzato da Pro Farmer — '
    + 'Via Milazzo 19, 26100 Cremona — www.profarmer.it</p>'
    + '</div>';
}

/* -------------------------------------------------------------------------- */
/* ActiveCampaign                                                             */
/* -------------------------------------------------------------------------- */

function inviaAdActiveCampaign(p) {
  var prop = PropertiesService.getScriptProperties();
  var base = prop.getProperty('AC_API_URL');
  var key  = prop.getProperty('AC_API_KEY');

  if (!base || !key)        return 'non configurato';
  if (!p.email)             return 'nessuna email';
  if (p.consenso !== 'si')  return 'senza consenso, non inviato';

  var valori = [];
  for (var chiave in CAMPI_AC) {
    if (p[chiave]) valori.push({ field: String(CAMPI_AC[chiave]), value: String(p[chiave]) });
  }

  var opzioni = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Api-Token': key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contact: {
        email: p.email,
        firstName: p.nome || '',
        phone: p.telefono || '',
        fieldValues: valori
      }
    })
  };

  var radice = base.replace(/\/$/, '');
  var risp = UrlFetchApp.fetch(radice + '/api/3/contact/sync', opzioni);
  if (risp.getResponseCode() >= 300) return 'errore ' + risp.getResponseCode();

  var contatto = JSON.parse(risp.getContentText()).contact;
  if (!contatto) return 'contatto non restituito';

  // Niente liste: l'account ha esaurito le liste disponibili, quindi
  // segmentiamo con il tag "riposa", che fa partire le automazioni allo
  // stesso modo.
  UrlFetchApp.fetch(radice + '/api/3/contactTags', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Api-Token': key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contactTag: { contact: Number(contatto.id), tag: TAG_RIPOSA }
    })
  });

  return 'ok, contatto ' + contatto.id + ', taggato riposa';
}
