/* ============================================================================
   Riposa — l'app dell'allevatore sul suo telefono (dal 24/10/2026)
   ----------------------------------------------------------------------------
   Dopo il primo calcolo la funzione "lead" dà al telefono un id e una chiave:
   qui li teniamo (localStorage) insieme a quello che serve per la scorta.
   In cima alla pagina compare «La tua stalla»:
     - quanto consuma, e la scorta: quanti pezzi ha ricevuto e quando →
       la funzione "allevatore" calcola quando finisce e 10 giorni prima
       arrivano il promemoria a lui e l'avviso a Pro Farmer;
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
    const stessoProdotto = prima.prodotto === info.prodotto && prima.kgPezzo === info.kgPezzo;
    scrivi({
      ...prima, id: app.id, chiave: app.chiave, ...info,
      // un calcolo con un altro prodotto o formato: la scorta di prima non vale più
      scorta: stessoProdotto ? prima.scorta : null
    });
    disegna();
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

  async function attivaNotifiche() {
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') throw new Error('permesso negato');
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

    // la scorta
    if (d.scorta && d.scorta.avviso && !d.cambiaScorta) {
      h += `<p class="tua-stalla-stato">Hai ricevuto ${esc(d.scorta.pezzi)} ${esc(unita)} il ${esc(dataIt(d.scorta.consegna))}. `
        + `<strong>Ti avvisiamo verso il ${esc(dataIt(d.scorta.avviso))}</strong>, una decina di giorni prima che finisca.</p>`
        + '<button type="button" class="tua-stalla-link" id="ts-cambia">Ho ricevuto una nuova fornitura</button>';
    } else if (d.kgPezzo && d.kgMese) {
      h += '<form class="tua-stalla-scorta" id="ts-scorta" novalidate>'
        + '<p class="tua-stalla-domanda">Dicci la tua scorta e ti avvisiamo prima che finisca.</p>'
        + `<label>Quanti ${esc(unita)} hai ricevuto?<input type="number" name="pezzi" min="1" max="500" inputmode="numeric" `
        + `value="${d.scorta ? esc(d.scorta.pezzi) : ''}" required></label>`
        + `<label>Quando?<input type="date" name="consegna" max="${oggi()}" value="${d.scorta ? esc(d.scorta.consegna) : oggi()}" required></label>`
        + '<button type="submit" class="bottone">Avvisami prima che finisca</button>'
        + '<p class="tua-stalla-errore" id="ts-errore" hidden></p></form>';
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
    const f = document.getElementById('ts-scorta');
    if (f) f.addEventListener('submit', ev => {
      ev.preventDefault();
      const err = document.getElementById('ts-errore');
      const pezzi = parseInt(f.pezzi.value, 10), consegna = f.consegna.value;
      if (!(pezzi >= 1)) { err.textContent = 'Scrivi quanti ne hai ricevuti.'; err.hidden = false; return; }
      if (!consegna) { err.textContent = 'Scrivi quando sono arrivati.'; err.hidden = false; return; }
      const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Un attimo…';
      chiama('scorta', { pezzi, consegna }).then(j => {
        const d = leggi(); d.scorta = { pezzi, consegna, avviso: j.avviso }; delete d.cambiaScorta; scrivi(d); disegna();
      }).catch(() => {
        b.disabled = false; b.textContent = 'Avvisami prima che finisca';
        err.textContent = navigator.onLine === false ? 'Sei senza rete: riprova quando torna il segnale.' : 'Non è andata: riprova tra poco.';
        err.hidden = false;
      });
    });
    const c = document.getElementById('ts-cambia');
    if (c) c.addEventListener('click', () => { const d = leggi(); d.cambiaScorta = true; scrivi(d); disegna(); });
    const n = document.getElementById('ts-notifiche');
    if (n) n.addEventListener('click', () => {
      n.disabled = true; n.textContent = 'Un attimo…';
      attivaNotifiche().then(disegna).catch(() => { disegna(); });
    });
  }

  // all'apertura: se il telefono ha già fatto un calcolo, «La tua stalla» è in cima
  disegna();

  return { credenziali, salva, disegna, notifichePossibili };
})();
