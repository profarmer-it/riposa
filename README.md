# Riposa

Calcolatore di dosaggio per la gamma **piùLact** — igienizzante minerale per la
zona di riposo delle bovine da latte, prodotto e commercializzato da
**Pro Farmer** (Cremona). La gamma è di due prodotti: **piùLact**, in big bag o
in sacchi da 25 kg, e **piùLact Pronto**, paglia e piùLact già miscelati in
ballette, per la cuccetta a buca e per il materassino.

Dalle caratteristiche della stalla — dove riposano le vacche, quante cuccette,
come si riempie la buca — restituisce il prodotto giusto, la dose per cuccetta,
la frequenza, il consumo mensile e quanto ordinare. Il risultato non compare a
schermo: arriva per e-mail, e il contatto diventa un lead profilato.

Agenti, rivenditori e commerciali Pro Farmer hanno un'app loro, **Riposa Pro**,
su `riposa.profarmer.it/pro/` (dal 24/10/2026; i vecchi link `#venditori` ci
portano da soli). Entrano con la loro e-mail e un codice di 6 cifre che arriva
per e-mail; il cuore è il lavoro di tutti i giorni: nuovo ordine, riordino con
un tocco, clienti, provvigioni o margini, materiali. Il calcolo della stalla è
una delle strade, con il risultato a schermo e l'ordine già riempito.

`pro/index.html` **non si modifica a mano**: si genera da `index.html` con
`node strumenti/genera-pro.mjs`, così il modulo del calcolo resta scritto in un
posto solo. Va rifatto dopo ogni modifica a `index.html`.

Dal 22-23 ottobre 2026 tutto il server di Riposa è **Supabase** (progetto
"riposa", Francoforte): area venditori, ordini, lead degli allevatori, e-mail
(Resend, da riposa@profarmer.it), notifiche sul telefono. Nel codice di questo
repository c'è solo la chiave pubblica: quello che ognuno vede lo decide il
database. Lo script Google del foglio non serve più.

**Il calcolatore è online: https://riposa.profarmer.it**

## Cosa c'è in questo repository, e cosa no

Qui dentro c'è **solo quello che può stare online**: la pagina, gli stili, il
motore di calcolo, i font, i materiali commerciali. Tutto ciò che è nel
repository viene servito da GitHub Pages a un indirizzo indovinabile.

I documenti interni — la mappa del progetto (`MAPPA.html`), le regole di
dosaggio (`docs/`) e lo schema e le funzioni di Supabase (`integrazioni/`) — restano
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
   statico: il suo codice è pubblico per chiunque. Le chiavi (ActiveCampaign,
   Resend, notifiche) stanno nei *secrets* delle Edge Function di Supabase.
2. **Non modificare le dosi in `app.js`.** Le dosi vivono solo in `regole.js`.

## Come si aggiorna il sito online

Il sito è pubblicato con **GitHub Pages** dal ramo `main` di questo
repository: ogni modifica che arriva su GitHub va online da sola in un paio
di minuti. Non c'è niente da caricare a mano.

Quando cambiano insieme il sito e il database o le funzioni di Supabase,
l'ordine è sempre lo stesso: **prima Supabase, poi il sito**.

## Stato

Il calcolatore è online dal 9 settembre 2026; dal 18 ottobre propone la gamma
di due prodotti. Dal 23 ottobre 2026 il risultato arriva **solo per e-mail**
(WhatsApp è uscito): la funzione `lead` su Supabase scrive il lead, manda
l'e-mail e, col consenso, crea il contatto in ActiveCampaign con il tag
`riposa`. Pro Farmer vede e segue i lead nella Gestione dell'area venditori.

L'informativa privacy è collegata alla spunta di consenso.
