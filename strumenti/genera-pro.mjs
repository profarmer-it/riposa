/* ============================================================================
   Riposa Pro — genera pro/index.html da index.html
   ----------------------------------------------------------------------------
   Dal 24/10/2026 i venditori hanno un'app loro, su riposa.profarmer.it/pro/,
   installabile a parte. Dentro c'è lo stesso calcolatore dell'allevatore, ma
   il modulo del calcolo deve restare scritto in un posto solo: index.html.
   Questo script ne fa la copia per i venditori, con le differenze qui sotto.

   QUANDO: dopo ogni modifica a index.html. Senza, /pro/ resta indietro.
   COME:   node strumenti/genera-pro.mjs   (dalla cartella Riposa)
   Si ferma con un errore se un pezzo che deve cambiare non c'è più: meglio
   fermarsi che pubblicare una pagina sbagliata.
   ========================================================================== */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
let h = readFileSync(join(radice, 'index.html'), 'utf8');

function cambia(cosa, con, nome) {
  const prima = h;
  h = h.replace(cosa, con);
  if (h === prima) throw new Error(`genera-pro: non trovo "${nome}" in index.html`);
}

// 1. i percorsi: la pagina sta un livello più giù
h = h.replace(/(href|src)="assets\//g, '$1="../assets/');
cambia(`register('sw.js')`, `register('../sw.js')`, 'registrazione del service worker');

// 2. nome, titolo, manifest: un'app a sé
cambia(/<title>[^<]*<\/title>/, '<title>Riposa Pro — area agenti e rivenditori piùLact</title>', 'title');
cambia(/<meta name="description"[^>]*>/,
  '<meta name="description" content="L’app di agenti e rivenditori Pro Farmer: clienti, ordini, riordini, provvigioni e materiali piùLact.">\n<meta name="robots" content="noindex">',
  'description');
// href="manifest.webmanifest" resta com'è: dentro /pro/ è pro/manifest.webmanifest
if (!h.includes('href="manifest.webmanifest"')) throw new Error('genera-pro: non trovo il manifest');
cambia('content="Riposa">', 'content="Riposa Pro">', 'apple-mobile-web-app-title');

// 3. via quello che serve solo all'allevatore
// lo script in testa: niente rinvio a /pro/ (siamo già qui), resta solo la scelta dell'apertura
cambia(/<script data-solo-allevatore>[\s\S]*?<\/script>\n/, `<script>
  /* L'apertura animata di Riposa Pro: nell'app installata a ogni apertura,
     nel browser una volta per visita, mai con «riduci movimento». */
  try {
    var app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (/[?&]apertura=prova/.test(location.search)) sessionStorage.removeItem('riposa-pro-apertura');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && (app || sessionStorage.getItem('riposa-pro-apertura') !== '1')) {
      document.documentElement.classList.add('con-apertura');
      sessionStorage.setItem('riposa-pro-apertura', '1');
    }
  } catch (e) {}
</script>
`, 'script in testa');
cambia(/<script src="\.\.\/assets\/allevatore\.js[^"]*"><\/script>\n/, '', "l'app dell'allevatore");
// l'apertura animata, nei colori di Riposa Pro: croce oro su blu quasi nero
{
  const m = h.match(/<!-- APERTURA:[\s\S]*?<!-- \/APERTURA -->\n/);
  if (!m) throw new Error('genera-pro: non trovo "apertura animata" in index.html');
  const pro = m[0]
    .replace('class="apertura"', 'class="apertura apertura-pro"')
    .replace('stop-color="#3FC4F2"', 'stop-color="#F4CF7A"').replace('stop-color="#4A7DF7"', 'stop-color="#C9912E"')
    .replace('fill="#2F86E0"', 'fill="#C9912E"').replace('fill="#8CC4F5"', 'fill="#F1D59A"')
    .replace('<p class="apertura-nome">Riposa</p>', '<p class="apertura-nome">Riposa <b>Pro</b></p>')
    .replace('<p class="apertura-sotto">il dosaggio giusto di piùLact</p>', '<p class="apertura-sotto">agenti e rivenditori piùLact</p>');
  if (pro === m[0] || !pro.includes('Riposa <b>Pro</b>')) throw new Error('genera-pro: apertura Pro non riuscita');
  h = h.replace(m[0], pro);
}
cambia(/<section class="eroe">[\s\S]*?<\/section>\n\n/, '', 'sezione eroe');
cambia(/<p class="pedana-nota pedana-altra-app">.*<\/p>/,
  '<p class="pedana-nota pedana-altra-app"><a href="../">Il calcolatore per l’allevatore, da girare ai clienti</a></p>',
  'link a Riposa Pro nel piede');

// icone e colore della barra: quelle di Riposa Pro (croce oro, blu più scuro)
h = h.replace(/\.\.\/assets\/icone\/(favicon-32|apple-touch-icon)\.png/g, '../assets/icone/pro/$1.png');
if (!h.includes('icone/pro/apple-touch-icon.png')) throw new Error('genera-pro: non trovo le icone');
cambia('<meta name="theme-color" content="#0E2340">', '<meta name="theme-color" content="#071426">', 'theme-color');

// 4. il segno dell'app e gli script dei venditori
cambia('<body>', '<body class="app-pro">', 'body');
cambia(/(<img class="logo-profarmer"[^>]*>)/,
  '<span class="testata-nome">Riposa <b>Pro</b></span>\n    $1', 'logo Pro Farmer');
const v = (h.match(/app\.js\?v=([\w]+)/) || [])[1];
if (!v) throw new Error('genera-pro: non trovo la versione di app.js');
cambia('<!-- RIPOSA PRO: qui strumenti/genera-pro.mjs aggiunge gli script dei venditori -->',
  `<script>window.RIPOSA_PRO = true;</script>\n<script src="../assets/profarmer.js?v=${v}"></script>\n<script src="../assets/venditori.js?v=${v}"></script>`,
  'segnaposto degli script');

h = '<!-- GENERATO da strumenti/genera-pro.mjs a partire da index.html: non modificare qui. -->\n' + h;
mkdirSync(join(radice, 'pro'), { recursive: true });
writeFileSync(join(radice, 'pro', 'index.html'), h);
console.log('pro/index.html aggiornato (script versione ' + v + ')');
