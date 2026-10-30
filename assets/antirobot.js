/* Controllo anti-robot (Cloudflare Turnstile) per gli accessi a Supabase.
   Antirobot.token() dà un gettone nuovo per ogni chiamata (ognuno vale una volta).
   Di solito non si vede niente; se Cloudflare ha dubbi compare in basso una casella da spuntare.
   Stesso file in profarmer-it/riposa e profarmer-it/app. */
window.Antirobot = (() => {
  const CHIAVE = '0x4AAAAAAFsyi13NJ1UohFJ7';   // site key pubblica, widget «Easy e Riposa Pro»
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

  function scatola() {
    let b = document.getElementById('antirobot');
    if (!b) {
      b = document.createElement('div');
      b.id = 'antirobot';
      b.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999';
      document.body.appendChild(b);
    }
    return b;
  }

  // Se Cloudflare non risponde si va avanti senza gettone: ci pensa Supabase a dire di no.
  function token() {
    return carica().then(ts => new Promise(ok => {
      if (widget !== null) { try { ts.remove(widget); } catch (e) {} widget = null; }
      const fine = t => { clearTimeout(attesa); ok(t || undefined); };
      const attesa = setTimeout(() => fine(), 60000);
      widget = ts.render(scatola(), {
        sitekey: CHIAVE, language: 'it', appearance: 'interaction-only',
        callback: t => fine(t), 'error-callback': () => fine(), 'expired-callback': () => fine()
      });
    })).catch(() => undefined);
  }

  const errore = e => /captcha/i.test(String(e && e.message || ''));
  return { token, errore, carica };
})();
