/* Controllo anti-robot (Cloudflare Turnstile) per gli accessi a Supabase.
   Antirobot.token() dà un gettone nuovo per ogni chiamata (ognuno vale una volta).
   Di solito non si vede niente; se Cloudflare ha dubbi compare, dentro il modulo ([data-antirobot]),
   un riquadro coi colori dell'app con la casella da spuntare. Lo stile è in pf.css / style.css (.antirobot).
   Stesso file in profarmer-it/riposa e profarmer-it/app. */
window.Antirobot = (() => {
  // site key pubblica, widget «Easy e Riposa Pro»; con ?antirobot=prova la chiave di prova di Cloudflare
  // che chiede sempre di spuntare la casella (per vedere la grafica)
  const CHIAVE = /[?&]antirobot=prova/.test(location.search) ? '3x00000000000000000000FF' : '0x4AAAAAAFsyi13NJ1UohFJ7';
  let libreria = null, widget = null;

  function carica() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!libreria) libreria = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => ok(window.turnstile);
      s.onerror = () => { libreria = null; ko(new Error('antirobot')); };
      document.head.appendChild(s);
    });
    return libreria;
  }

  // Il posto del controllo: il riquadro [data-antirobot] del modulo che si vede, se c'è.
  function posto() {
    const p = Array.from(document.querySelectorAll('[data-antirobot]')).find(el => el.parentElement && el.parentElement.offsetParent !== null);
    if (p) return p;
    let b = document.getElementById('antirobot');
    if (!b) {
      b = document.createElement('div');
      b.id = 'antirobot';
      b.className = 'antirobot antirobot-fisso';
      document.body.appendChild(b);
    }
    return b;
  }

  // Tema chiaro o scuro come lo sfondo della pagina.
  function tema() {
    const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255];
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 128 ? 'dark' : 'light';
  }

  // Se Cloudflare non risponde si va avanti senza gettone: ci pensa Supabase a dire di no.
  function token() {
    return carica().then(ts => new Promise(ok => {
      if (widget !== null) { try { ts.remove(widget); } catch (e) {} widget = null; }
      const box = posto();
      box.classList.remove('aperto');
      box.innerHTML = '<p class="antirobot-testo">Controllo di sicurezza: spunta la casella per continuare.</p><div class="antirobot-widget"></div>';
      const chiudi = () => box.classList.remove('aperto');
      const fine = t => { clearTimeout(attesa); chiudi(); ok(t || undefined); };
      const attesa = setTimeout(() => fine(), 60000);
      // sotto i 300 px che servono a Cloudflare si usa la casella compatta, al centro
      const stretto = box.parentElement.clientWidth - 26 < 300;
      const dove = box.querySelector('.antirobot-widget');
      dove.classList.toggle('stretto', stretto);
      widget = ts.render(dove, {
        sitekey: CHIAVE, language: 'it', appearance: 'interaction-only', theme: tema(), size: stretto ? 'compact' : 'flexible',
        'before-interactive-callback': () => box.classList.add('aperto'),
        'after-interactive-callback': chiudi,
        callback: t => fine(t), 'error-callback': () => fine(), 'expired-callback': () => fine()
      });
    })).catch(() => undefined);
  }

  const errore = e => /captcha/i.test(String(e && e.message || ''));
  return { token, errore, carica };
})();
