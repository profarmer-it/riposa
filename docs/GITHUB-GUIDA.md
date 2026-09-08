# GitHub, spiegato una volta sola

Non serve imparare GitHub. Servono cinque concetti, e li usi tutti su questo
progetto. Il resto lo impari quando ti serve — cioè probabilmente mai.

## I cinque concetti

| Parola | Cosa vuol dire davvero |
|--------|------------------------|
| **repository** (o *repo*) | La cartella del progetto. Questa cartella `Riposa` diventa un repo. |
| **commit** | Una fotografia della cartella in un momento preciso, con una frase che dice cosa hai cambiato. È un salvataggio che non si sovrascrive mai: puoi tornare a qualsiasi fotografia di sei mesi fa. |
| **push** | Mandare le tue fotografie su GitHub, cioè su internet. Da lì sono al sicuro e visibili anche da altri computer. |
| **branch** | Una copia parallela dove provi una modifica senza toccare la versione che funziona. Per ora non ti serve. Te lo dico quando serve. |
| **Pages** | Il servizio gratuito di GitHub che prende il repo e lo pubblica come sito internet vero, con un indirizzo raggiungibile da chiunque. |

Il motivo per cui vale la pena: **niente di quello che facciamo si perde e niente
si sovrascrive per errore**. Ogni modifica alle regole di dosaggio resta tracciata,
con la data e la spiegazione. Fra un anno saprai perché una dose è cambiata.

---

## Passo 1 — L'account

1. Vai su **github.com** e clicca *Sign up*.
2. Usa `info@profarmer.it` come email: questo è un progetto aziendale, non personale.
3. Come nome utente ti suggerisco `profarmer` (o `profarmer-it` se il primo è
   occupato): comparirà nell'indirizzo del sito.
4. Scegli il piano **Free**. Basta e avanza.
5. Conferma l'email.

## Passo 2 — GitHub Desktop

Il terminale non ti serve. GitHub Desktop fa le stesse cose con i pulsanti.

1. Scarica **GitHub Desktop** da `desktop.github.com` (versione per Mac).
2. Aprilo, accedi con l'account appena creato.
3. Quando ti chiede nome e email per i commit, confermali.

## Passo 3 — Trasformare questa cartella in un repo

1. In GitHub Desktop: menù **File → Add Local Repository**.
2. Scegli la cartella `Riposa`
   (in `Claude/Projects/piùLact/Riposa`).
3. Ti dirà che non è ancora un repository e ti offrirà **"create a repository"**:
   accetta.
4. Nome: `riposa`. Descrizione: *Calcolatore dosaggio piùLact*.
   Lascia tutto il resto come sta e conferma.

Ora vedi nella colonna di sinistra l'elenco di tutti i file: sono le modifiche in
attesa di essere fotografate.

## Passo 4 — Il primo commit e il primo push

1. In basso a sinistra, nel campo **Summary**, scrivi:
   `Prima versione del calcolatore Riposa`
2. Clicca **Commit to main**. Hai fatto la tua prima fotografia.
3. In alto clicca **Publish repository**.
4. **Togli la spunta** a *Keep this code private* — serve per il passo 5, e in
   questa fase nel repo non c'è nulla di riservato: nessun prezzo, nessun listino,
   nessuna password. Quando arriveremo ai listini personalizzati passeremo a un
   repo privato con un hosting adeguato.
5. Clicca **Publish repository**.

Il codice è su internet. Da qui in avanti il ciclo è sempre lo stesso: modifichi
un file → scrivi cosa hai cambiato → *Commit* → *Push origin*.

## Passo 5 — Mettere online il calcolatore

1. Sul sito github.com apri il tuo repo `riposa`.
2. Scheda **Settings** (in alto a destra) → nella colonna di sinistra **Pages**.
3. Alla voce *Source* scegli **Deploy from a branch**.
4. Branch: **main**, cartella: **/ (root)**. Clicca **Save**.
5. Aspetta un paio di minuti e ricarica la pagina: comparirà l'indirizzo, del tipo
   `https://profarmer.github.io/riposa/`

Quello è il link che dai ai tuoi agenti. Ogni volta che fai *Push*, il sito si
aggiorna da solo in un minuto o due.

> Nota sui repo privati: al momento GitHub Pages pubblica gratuitamente solo da
> repository pubblici; per pubblicare da un repo privato serve un piano a
> pagamento. Se in futuro vorrai tenere il codice privato ma il sito pubblico, si
> collega il repo privato a Netlify o Cloudflare Pages, che lo fanno gratis. Non
> serve deciderlo adesso.

## Passo 6 — Un indirizzo tuo (facoltativo, dopo)

`profarmer.github.io/riposa` funziona ma non è bellissimo su un biglietto da
visita. Quando il calcolatore è validato, si può puntare
`riposa.profarmer.it` allo stesso sito: si aggiunge un record CNAME nel DNS del
tuo dominio e si scrive il nome nel campo *Custom domain* di GitHub Pages.
Dieci minuti, gratis. Ne parliamo quando ci arriviamo.

---

## Le due cose da non fare mai

1. **Non mettere password, chiavi o token nei file del repo.** Se un giorno
   serviranno (per ActiveCampaign, per il database), vanno in un posto separato che ti
   indico io. Una chiave finita in un commit resta nella storia del repo per
   sempre, anche se la cancelli dopo.
2. **Non modificare i file direttamente sul sito github.com** quando stai anche
   lavorando in locale. Fai le modifiche sul tuo Mac, poi *Commit* e *Push*.
   Altrimenti le due versioni divergono e devi metterle d'accordo a mano.

## Se qualcosa va storto

GitHub Desktop ha **History**: l'elenco di tutte le fotografie. Da lì si torna
indietro. Non hai mai perso niente, anche quando sembra il contrario. Se ti trovi
in una situazione confusa, fermati e chiedimi: si sistema sempre.
