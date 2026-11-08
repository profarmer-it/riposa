/* ============================================================================
   Riposa — l'app dell'allevatore sul suo telefono (dal 24/10/2026)
   ----------------------------------------------------------------------------
   Dopo il primo calcolo la funzione "lead" dà al telefono un id e una chiave:
   qui li teniamo (localStorage) insieme a quello che serve per la scorta.
   In cima alla pagina compare «La tua stalla»:
     - quanto consuma, e la scorta. Dal 7/11/2026 la scorta non la dice lui:
       quando in Gestione un suo ordine (stessa P.IVA del calcolo) diventa
       confermato, Riposa calcola quando finisce e 15 giorni prima arrivano il
       promemoria a lui e l'avviso a Pro Farmer (file 59). Qui la leggiamo con
       { azione: 'stato' } della funzione "allevatore";
     - le notifiche: promemoria, consigli e novità di Pro Farmer.
   Su iPhone le notifiche esistono solo con Riposa sulla schermata Home.
   Niente qui legge dati dal database: il telefono sa solo i suoi.
   ========================================================================== */

const Allevatore = (() => {
  const CHIAVE = 'riposa-allevatore';
  const URL = 'https://gmhmxybqmkcmnbjdnslz.supabase.co/functions/v1/allevatore';
  const VAPID = 'BBMiPSY2ADgUWEiZE7vpPz6aJLnfxfM-rUjhZKuNp2nQh8nv7NSMChvyL_MMjIEUnc1c3CZO_OflRINeQX_nZo4';
  const UNITA = { 25: 'sacchi da 25 kg', 600: 'big bag', 850: 'ballette' };

  const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch (e) { return null; } };
  const scrivi = d => { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch (e) {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataIt = iso => { const [a, m, g] = String(iso).split('-'); return `${+g}/${+m}/${a}`; };
  const oggi = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function installata() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }
  function suIPhone() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function notifichePossibili() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    return !suIPhone() || installata();
  }

  /* ------------------------------------------------ dopo il calcolo */

  // per la funzione "lead": il telefono che ha già una riga la aggiorna
  function credenziali() {
    const d = leggi();
    return d && d.id && d.chiave ? { id: d.id, chiave: d.chiave } : null;
  }

  function salva(app, info) {
    if (!app || !app.id || !app.chiave) return;
    const prima = leggi() || {};
    scrivi({ ...prima, id: app.id, chiave: app.chiave, ...info, scorta: null });
    biglietto(app);
    disegna();
    aggiorna();
    attivaSeConsentite();
  }

  /* Su iPhone l'app sulla schermata Home non vede la memoria di Safari (7/11/2026):
     dopo il calcolo l'indirizzo della pagina porta id e chiave, così l'icona
     aggiunta da qui apre Riposa già con «La tua stalla». Nell'app li leggiamo e
     li togliamo dall'indirizzo. */
  const PARAM = 'stalla';
  function biglietto(app) {
    if (installata()) return;
    try {
      const u = new window.URL(location.href);   // URL qui sopra è l'indirizzo della funzione
      u.searchParams.set(PARAM, app.id + '.' + app.chiave);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function leggiBiglietto() {
    try {
      const u = new window.URL(location.href);   // URL qui sopra è l'indirizzo della funzione
      const v = u.searchParams.get(PARAM);
      if (!v) return;
      const [id, chiave] = v.split('.');
      if (/^[0-9a-f-]{36}$/i.test(id || '') && (chiave || '').length >= 40) {
        const d = leggi();
        if (!d || d.id !== id) scrivi({ id, chiave });
      }
      if (installata()) {
        u.searchParams.delete(PARAM);
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
    } catch (e) {}
  }

  // la scorta e il resto li sa il server: li rileggiamo a ogni apertura
  function aggiorna() {
    const d = leggi();
    if (!d || !d.id) return Promise.resolve();
    return chiama('stato').then(j => {
      const x = leggi() || {};
      x.azienda = j.azienda || x.azienda; x.prodotto = j.prodotto || x.prodotto;
      x.kgMese = j.kgMese || x.kgMese; x.kgPezzo = j.kgPezzo || x.kgPezzo;
      x.scorta = j.scorta; x.piva = j.piva;
      x.notifiche = !!j.notifiche;
      scrivi(x); disegna();
      // il telefono ha detto sì ma il server non lo sa (iscrizione persa o non arrivata): la rifacciamo
      if (!j.notifiche) attivaSeConsentite();
    }).catch(e => {
      // il server non conosce più questo telefono (calcolo cancellato): lo dimentichiamo
      if (e && e.message === 'non riconosciuto') {
        try { localStorage.removeItem(CHIAVE); } catch (er) {}
        disegna();
      }
    });
  }

  function chiama(azione, extra) {
    const d = leggi();
    if (!d) return Promise.reject(new Error('nessun calcolo'));
    return fetch(URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, chiave: d.chiave, azione, ...extra })
    }).then(r => r.json().catch(() => ({})).then(j => { if (!r.ok || !j.ok) throw new Error(j.motivo || 'errore'); return j; }));
  }

  /* ------------------------------------------------ le notifiche */

  function chiaveVapid() {
    const b = atob((VAPID + '='.repeat((4 - VAPID.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
  }

  /* Dal tocco su «Calcola il dosaggio» (8/11/2026): la domanda del telefono
     compare durante il ragionamento. Restituisce la promessa della risposta,
     o null se qui non si può chiedere o la risposta c'è già. */
  function chiediNotifiche() {
    if (!notifichePossibili() || Notification.permission !== 'default') return null;
    try {
      const p = Notification.requestPermission();
      return p && typeof p.then === 'function' ? p : null;
    } catch (e) { return null; }
  }
  // dopo l'invio del calcolo: se ha già detto sì, iscriviamo il telefono senza chiedere altro
  function attivaSeConsentite() {
    if (!notifichePossibili() || Notification.permission !== 'granted') return;
    attivaNotifiche().then(disegna).catch(() => {});
  }

  async function attivaNotifiche() {
    // se il sì c'è già non lo richiediamo: su iPhone, fuori da un tocco, la domanda può non tornare
    if (Notification.permission !== 'granted') {
      const permesso = await Notification.requestPermission();
      if (permesso !== 'granted') throw new Error('permesso negato');
    }
    const reg = await navigator.serviceWorker.ready;
    const iscr = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapid() });
    await chiama('iscrivi', { iscrizione: iscr.toJSON(), dispositivo: navigator.userAgent.slice(0, 120) });
    const d = leggi(); d.notifiche = true; scrivi(d);
  }

  /* ------------------------------------------------ «La tua stalla» */

  function riquadro(d) {
    const unita = UNITA[d.kgPezzo] || 'pezzi';
    let h = '<section class="tua-stalla" id="tua-stalla" aria-label="La tua stalla">';
    h += `<p class="tua-stalla-titolo">La tua stalla${d.azienda ? ' · ' + esc(d.azienda) : ''}</p>`;
    h += `<p class="tua-stalla-consumo"><strong>${esc(d.prodotto || 'piùLact')}</strong>`
      + (d.kgMese ? `: circa <strong>${esc(Number(d.kgMese).toLocaleString('it-IT'))} kg al mese</strong>` : '') + '.</p>';

    // la scorta: la calcola Riposa dall'ultimo ordine confermato (7/11/2026)
    const s = d.scorta;
    if (s && s.avviso && (s.avvisato || s.avviso <= oggi())) {
      h += '<p class="tua-stalla-stato"><strong>Il prodotto sta per finire.</strong> '
        + 'Riordina per tempo: chiama Pro Farmer al <a href="tel:+393761296162">+39 376 129 6162</a> o il tuo rivenditore.</p>';
    } else if (s && s.avviso) {
      h += `<p class="tua-stalla-stato">Ultimo ordine confermato il ${esc(dataIt(s.dal))}`
        + (s.pezzi ? `: ${esc(s.pezzi)} ${esc(unita)}` : '') + '. '
        + `<strong>Ti avvisiamo verso il ${esc(dataIt(s.avviso))}</strong>, quindici giorni prima che finisca.</p>`;
    } else {
      h += '<p class="tua-stalla-stato">Quando Pro Farmer conferma un tuo ordine, calcoliamo noi quanto ti dura '
        + 'e ti avvisiamo quindici giorni prima che finisca.</p>';
    }

    // le notifiche
    const permesso = 'Notification' in window ? Notification.permission : 'default';
    if (d.notifiche && permesso === 'granted') {
      h += '<p class="tua-stalla-ok">✓ Notifiche attive: promemoria, consigli e novità piùLact.</p>';
    } else if (notifichePossibili() && permesso !== 'denied') {
      h += '<div class="tua-stalla-notifiche"><p>Ricevi sul telefono il promemoria quando il prodotto sta per finire, '
        + 'i consigli per le cuccette e le novità piùLact.</p>'
        + '<button type="button" class="bottone bottone-chiaro" id="ts-notifiche">Attiva le notifiche</button></div>';
    } else if (suIPhone() && !installata()) {
      h += '<p class="tua-stalla-nota">Per ricevere il promemoria sul telefono metti Riposa sulla schermata Home: '
        + 'in Safari, Condividi → «Aggiungi alla schermata Home». Poi apri Riposa dall’icona.</p>';
    } else if (permesso === 'denied') {
      h += '<p class="tua-stalla-nota">Le notifiche sono bloccate nelle impostazioni del telefono per Riposa.</p>';
    }
    h += '</section>';
    return h;
  }

  function disegna() {
    const d = leggi();
    const vecchio = document.getElementById('tua-stalla');
    if (!d || !d.id) { if (vecchio) vecchio.remove(); return; }
    const main = document.querySelector('main');
    if (vecchio) vecchio.outerHTML = riquadro(d); else main.insertAdjacentHTML('afterbegin', riquadro(d));
    aggancia();
  }

  function aggancia() {
    const n = document.getElementById('ts-notifiche');
    if (n) n.addEventListener('click', () => {
      n.disabled = true; n.textContent = 'Un attimo…';
      attivaNotifiche().then(disegna).catch(() => {
        disegna();
        // il motivo, dentro «La tua stalla» (7/11/2026): prima il riquadro si ridisegnava senza dire niente
        const sez = document.getElementById('tua-stalla');
        if (sez && Notification.permission !== 'denied') sez.insertAdjacentHTML('beforeend', '<p class="tua-stalla-nota">Non è andata: riprova tra poco.</p>');
      });
    });
  }

  /* Subito dopo il calcolo (7/11/2026): la domanda delle notifiche nella conferma.
     Dove non si può (iPhone senza l'app sulla schermata Home) non c'è: lì c'è
     l'invito a installare Riposa, e le notifiche si chiedono dentro l'app. */
  function invitoNotifiche() {
    const d = leggi();
    const permesso = 'Notification' in window ? Notification.permission : 'default';
    // solo se la domanda durante il calcolo è rimasta senza risposta: il sì si attiva da solo
    if (!d || !d.id || !notifichePossibili() || permesso !== 'default') return '';
    return '<div class="invito-notifiche"><p class="invito-app-titolo">Ti avvisiamo noi quando il prodotto sta per finire</p>'
      + '<p>Quando Pro Farmer conferma un tuo ordine, calcoliamo quanto ti dura e ti mandiamo un avviso sul telefono '
      + 'quindici giorni prima che finisca. In più i consigli per le cuccette e le novità piùLact.</p>'
      + '<button type="button" class="bottone" id="conf-notifiche">Attiva le notifiche</button>'
      + '<p class="aiuto" id="conf-notifiche-esito" hidden></p></div>';
  }
  function agganciaInvitoNotifiche() {
    const b = document.getElementById('conf-notifiche');
    if (!b) return;
    b.addEventListener('click', () => {
      b.disabled = true; b.textContent = 'Un attimo…';
      const esito = document.getElementById('conf-notifiche-esito');
      attivaNotifiche().then(() => {
        b.remove(); esito.textContent = '✓ Notifiche attive.'; esito.hidden = false; disegna();
      }).catch(() => {
        b.disabled = false; b.textContent = 'Attiva le notifiche';
        esito.textContent = Notification.permission === 'denied'
          ? 'Le notifiche sono bloccate nelle impostazioni del telefono per Riposa.'
          : 'Non è andata: riprova tra poco.';
        esito.hidden = false; disegna();
      });
    });
  }

  /* L'app sulla schermata Home, quando torna in primo piano, riprende la pagina
     che aveva in memoria e non si accorge di una versione nuova (8/11/2026).
     Se è pubblicata una versione nuova e l'allevatore non ha ancora iniziato
     il calcolo, ricarichiamo la pagina. */
  const versione = ((document.querySelector('script[src*="app.js?v="]') || {}).src || '').split('v=')[1];
  function nienteIniziato() {
    const box = document.getElementById('risultato');
    const form = document.getElementById('modulo');
    if (box && !box.hidden) return false;
    return !form || ![...form.elements].some(e => (e.type === 'radio' || e.type === 'checkbox') ? e.checked : (e.value && e.type !== 'submit' && e.type !== 'button'));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !versione || !nienteIniziato()) return;
    fetch('./?controlla-versione=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(t => {
      const v = (t.match(/app\.js\?v=([\w]+)/) || [])[1];
      if (v && v !== versione && nienteIniziato()) location.reload();
    }).catch(() => {});
  });

  // all'apertura: se il telefono ha già fatto un calcolo, «La tua stalla» è in cima
  leggiBiglietto();
  disegna();
  aggiorna();

  return { credenziali, salva, disegna, notifichePossibili, chiediNotifiche, invitoNotifiche, agganciaInvitoNotifiche };
})();
