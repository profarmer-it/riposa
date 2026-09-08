# Riposa — specifica di progetto

**Riposa** è lo strumento che accompagna la vendita di piùLact: dice a chi ha una
stalla di bovine da latte quale prodotto della gamma piùLact serve, quanto ne
serve e come si usa, a partire dalle caratteristiche reali della sua stalla.

Il nome viene dalla zona di riposo, che è il punto in cui piùLact lavora.

---

## Perché esiste

Oggi la conversazione commerciale su un igienizzante minerale finisce quasi
sempre sul prezzo al quintale. È il terreno peggiore per piùLact, che costa più
di un carbonato ma ne vale di più — ed è esattamente la dimostrazione che la
brochure fa a mano, slide dopo slide.

Riposa sposta la conversazione: non "quanto costa", ma "quanto ti serve e cosa
ottieni". Fa il conto davanti al cliente, con i numeri della sua stalla.

Doppio ritorno:

- **Per l'allevatore** — una risposta concreta in due minuti, senza aspettare la
  visita dell'agente.
- **Per Pro Farmer** — ogni calcolo è un lead profilato: numero di cuccette, tipo
  di zona di riposo, tipo di mungitura, cellule somatiche attuali. Dati che un
  form "richiedi informazioni" non darà mai.

---

## Le due versioni

### Versione pubblica — allevatore
Nessun login. Compila le caratteristiche della stalla, ottiene:

- prodotto consigliato della gamma (piùLact / LA / PRONTO) + eventuale alternativa
- dose per cuccetta, frequenza, kg al mese e all'anno
- numero di sacchi da 25 kg o di big bag
- per la miscelata in buca: anche kg di paglia e litri di acqua
- metodologia di utilizzo in parole semplici
- se ha inserito le cellule somatiche: il potenziale di miglioramento sulla base
  dei casi studio reali

Il risultato si invia **via WhatsApp** con un tocco, e il contatto entra nella
lista Pro Farmer.

### Versione riservata — agenti, rivenditori, commerciali
Area con login. Due percorsi:

1. **Ordine diretto** — sa già cosa vuole, ordina.
2. **Calcolo poi ordine** — usa lo stesso motore della versione pubblica per la
   stalla che sta visitando, poi trasforma il risultato in un ordine.

In entrambi i casi l'ordine è calcolato sul **listino specifico di chi è
loggato**: ogni agente e ogni rivenditore ha i suoi accordi. Questo è il motivo
per cui serve un vero login e non una password condivisa.

---

## Roadmap — in fasi, non tutto insieme

**Fase 1 — Calcolatore pubblico** ← siamo qui
Sito statico, nessun server, nessun database. Online su GitHub Pages, gratis.
Serve a validare le regole di dosaggio sul campo con i tuoi agenti prima di
costruirci sopra qualcosa di complesso.

**Fase 2 — Raccolta lead**
Invio WhatsApp e iscrizione del contatto a ActiveCampaign con i dati di stalla.

**Fase 3 — Area agenti, sola lettura**
Login, e per ogni agente il calcolatore che mostra anche i prezzi del suo
listino. Ancora nessun ordine: si guarda, si stampa, si manda al cliente.

**Fase 4 — Ordini**
Carrello, invio dell'ordine, storico. Qui servono un vero backend e un database,
e qui il progetto smette di essere gratuito.

**Fase 5 — Estensioni**
Storico stalle per agente, ricalcolo automatico, confronto con il prodotto
concorrente, aggancio all'andamento delle cellule somatiche nel tempo.

---

## Scelte tecniche, e perché

| Fase | Scelta | Motivo |
|------|--------|--------|
| 1–2 | HTML, CSS e JavaScript senza framework | il repo resta leggibile: sono quattro file, li apri e capisci cosa fanno. Nessun passaggio di compilazione da imparare. |
| 1–2 | GitHub Pages | gratis, si pubblica da solo a ogni modifica, e ti fa usare GitHub per quello che serve davvero. |
| 2 | WhatsApp tramite link `wa.me` | zero costi e zero burocrazia. L'API ufficiale di WhatsApp Business è a pagamento e richiede verifica aziendale: la valutiamo se il volume di lead la giustifica. |
| 2 | ActiveCampaign | è il tuo strumento per le email, e i campi personalizzati e le automazioni permettono di segmentare i lead per tipo di stalla. |
| 3–4 | Da decidere quando ci arriviamo | probabilmente Next.js su Vercel con Supabase per login e database. Non serve deciderlo oggi. |

Una nota onesta sulla Fase 4: gestire ordini con listini personalizzati significa
avere dati di clienti e prezzi su un server. Non è difficile, ma non è più un
progetto gratuito e va fatto con attenzione. Meglio arrivarci con la Fase 1 già
validata sul campo.

---

## Come arriva il lead

Due canali, e fanno due mestieri diversi.

**WhatsApp — il canale caldo.** Il messaggio parte dal telefono dell'allevatore e
arriva sul numero aziendale (+39 376 129 6162). Questo cambia cosa ha senso scriverci
dentro:

- **Il numero dell'allevatore ce l'hai già**: è il mittente della chat.
- **Nel testo compare solo il nome dell'azienda**, nella riga di apertura:
  *Calcolo fabbisogno igienizzante per cuccette per l'azienda: …*
- **Le scelte premium compaiono solo se l'allevatore le ha scelte**, con il pulsante
  "Mi interessa" sulla scheda del prodotto.
- **Il consumo annuo non entra**: al mese basta e non spaventa.

**Google Sheets + ActiveCampaign — il canale freddo.** In parallelo il calcolatore
chiama una Web App di Google Apps Script che vive dentro il foglio
*"Riposa — lead calcolatore piùLact"*. Quello script:

1. scrive una riga sul foglio con **tutti** i dati del calcolo, 26 colonne;
2. se le chiavi sono configurate, crea o aggiorna il contatto in ActiveCampaign con
   i pochi campi su cui AC può davvero agire — Azienda, Provincia, Zona di riposo,
   Tipo mungitura, Prodotto consigliato, Premium di interesse — e lo iscrive alla
   lista *Riposa — calcolo dosaggio*.

Il codice dello script sta in `integrazioni/foglio-google.gs`.

> **Perché questa architettura.** Il sito è statico e il suo codice è pubblico: una
> chiave API lì dentro sarebbe leggibile da chiunque. Con lo script di mezzo, la
> chiave di ActiveCampaign resta sui server di Google e il calcolatore conosce un
> solo indirizzo, quello della Web App, che è pubblico per costruzione. In più il
> foglio tiene la storia completa di ogni calcolo, anche di chi non lascia l'email.

**Il modulo di contatto continua a chiedere tutto** — azienda, nome, provincia e
telefono obbligatori, email facoltativa — perché quei dati servono a profilare
l'azienda. Snellire il messaggio WhatsApp non vuol dire raccogliere meno.

**Consenso.** Il modulo ha una spunta esplicita: senza quella il contatto finisce sul
foglio ma **non** viene inviato ad ActiveCampaign. Lo script lo scrive nella colonna
*Esito ActiveCampaign* come "senza consenso, non inviato", così resta tracciato.

---

## Struttura della cartella

```
Riposa/
├── index.html          la pagina del calcolatore
├── assets/
│   ├── regole.js       ⭐ prodotti, dosi e frequenze — l'unico file da toccare
│   │                      per cambiare la logica di dosaggio
│   ├── app.js          il motore di calcolo e la pagina
│   └── style.css       la grafica
├── docs/
│   ├── SPEC.md             questo documento
│   ├── REGOLE-CALCOLO.md   l'albero decisionale e i valori, con i buchi aperti
│   └── GITHUB-GUIDA.md     come mettere online tutto questo
└── materiali/          brochure, PDF gamma, loghi
```
