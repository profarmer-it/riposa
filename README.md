# Riposa

Calcolatore di dosaggio per la gamma **piùLact** — igienizzante minerale per la
zona di riposo delle bovine da latte, prodotto e commercializzato da
**Pro Farmer** (Cremona).

Dalle caratteristiche della stalla — dove riposano le vacche, quante cuccette,
che tipo di mungitura, come si riempie la buca — restituisce il prodotto giusto
della gamma, la dose per cuccetta, la frequenza, il consumo mensile e i formati
da ordinare. Il risultato non compare a schermo: arriva via e-mail, oppure su
WhatsApp **dal numero Pro Farmer**, e il contatto diventa un lead profilato.

**Il calcolatore è online: https://riposa.profarmer.it**

## Cosa c'è in questo repository, e cosa no

Qui dentro c'è **solo quello che può stare online**: la pagina, gli stili, il
motore di calcolo, i font, i materiali commerciali. Tutto ciò che è nel
repository viene servito da GitHub Pages a un indirizzo indovinabile.

I documenti interni — la mappa del progetto (`MAPPA.html`), le regole di
dosaggio (`docs/`) e lo script del foglio Google (`integrazioni/`) — restano
nella cartella sul Mac e il `.gitignore` li tiene fuori da qui. Ci sono dentro
il know-how sui dosaggi e il ragionamento commerciale: non è roba da vetrina.

## Come provarlo in locale

Nessuna installazione, nessuna compilazione: apri `index.html` con un doppio clic.

## Come cambiare le dosi

Tutto sta in [`assets/regole.js`](assets/regole.js). Ogni scenario ha un flag
`confermato`: se è `false`, la pagina mostra un avviso "valori da confermare".
Nessun altro file va toccato.

## Le due cose da non fare mai

1. **Non mettere chiavi né indirizzi di webhook in questi file.** Il sito è
   statico: il suo codice è pubblico per chiunque. Le chiavi di ActiveCampaign e
   l'indirizzo del webhook Zapier stanno nelle *Proprietà script* dell'Apps
   Script (`AC_API_URL`, `AC_API_KEY`, `ZAPIER_HOOK_URL`), sui server di Google.
   Chi ha l'indirizzo del webhook può far partire messaggi dal numero aziendale.
2. **Non modificare le dosi in `app.js`.** Le dosi vivono solo in `regole.js`.

## Come si aggiorna il sito online

Il sito è pubblicato con **GitHub Pages** dal ramo `main` di questo
repository: ogni modifica che arriva su GitHub va online da sola in un paio
di minuti. Non c'è niente da caricare a mano.

## Stato

**Fase 1 completa, collaudata e online** (9 settembre 2026). I sette scenari
sono confermati sui numeri reali. Ogni calcolo scrive una riga di 32 colonne sul
foglio Google e crea il contatto in ActiveCampaign con il tag `riposa`.

La consegna funziona su entrambi i canali. Via e-mail la manda l'Apps Script.
Su WhatsApp l'allevatore manda al numero Pro Farmer una richiesta di due righe,
e quel suo messaggio apre la finestra di 24 ore dentro la quale un workflow
Zapier gli consegna il calcolo **dal numero aziendale**, come messaggio normale.
Collaudato end-to-end il 9 settembre.

L'informativa privacy è collegata alla spunta di consenso e dichiara gli otto
servizi che il calcolatore usa davvero.
