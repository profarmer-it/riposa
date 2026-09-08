# Riposa

Calcolatore di dosaggio per la gamma **piùLact** — igienizzante minerale per la
zona di riposo delle bovine da latte, prodotto e commercializzato da
**Pro Farmer** (Cremona).

Dalle caratteristiche della stalla — dove riposano le vacche, quante cuccette,
che tipo di mungitura, come si riempie la buca — restituisce il prodotto giusto
della gamma, la dose per cuccetta, la frequenza, il consumo mensile e i formati
da ordinare. Il risultato non compare a schermo: arriva su WhatsApp o via
e-mail, e il contatto diventa un lead profilato.

## Da dove partire

- [`MAPPA.html`](MAPPA.html) — **la mappa del progetto**: flusso, strumenti,
  paletti, strade aperte, cosa manca. Aprila con un doppio clic. È il file da
  guardare per primo dopo una pausa.

## Documentazione di dettaglio

- [`docs/SPEC.md`](docs/SPEC.md) — visione, le due versioni previste, roadmap in fasi
- [`docs/REGOLE-CALCOLO.md`](docs/REGOLE-CALCOLO.md) — albero decisionale e dosi
- [`docs/dosaggi-confermati.html`](docs/dosaggi-confermati.html) — la verifica dei sette scenari, con il metro dei kg per cuccetta al giorno
- [`docs/GITHUB-GUIDA.md`](docs/GITHUB-GUIDA.md) — come pubblicare e aggiornare questo progetto
- [`integrazioni/foglio-google.gs`](integrazioni/foglio-google.gs) — lo script che vive dentro il foglio Google: scrive la riga, manda l'e-mail, parla con ActiveCampaign

## Come provarlo in locale

Nessuna installazione, nessuna compilazione: apri `index.html` con un doppio clic.

## Come cambiare le dosi

Tutto sta in [`assets/regole.js`](assets/regole.js). Ogni scenario ha un flag
`confermato`: se è `false`, la pagina mostra un avviso "valori da confermare".
Nessun altro file va toccato.

## Le due cose da non fare mai

1. **Non mettere chiavi API in questi file.** Il sito è statico: il suo codice è
   pubblico per chiunque. Le chiavi di ActiveCampaign stanno nelle *Proprietà
   script* dell'Apps Script (`AC_API_URL`, `AC_API_KEY`), sui server di Google.
2. **Non modificare le dosi in `app.js`.** Le dosi vivono solo in `regole.js`.

## Stato

**Fase 1 completa e collaudata** (8 settembre 2026). I sette scenari sono
confermati sui numeri reali. La consegna funziona su entrambi i canali,
WhatsApp e e-mail, e ogni calcolo scrive una riga di 29 colonne sul foglio
Google e crea il contatto in ActiveCampaign con il tag `riposa`.

Resta da compilare, in `assets/regole.js` dentro `CONFIG`:

- `urlPrivacy` — indirizzo dell'informativa privacy su profarmer.it, linkata
  dalla spunta di consenso

E resta da fare il passo grosso: **pubblicare il sito su GitHub Pages**
(guida in `docs/GITHUB-GUIDA.md`).
