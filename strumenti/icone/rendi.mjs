import { svg } from './icona.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [tema, uscita] = process.argv.slice(2);
const pezzi = [['apple-touch-icon.png', 180, 0.14], ['icona-192.png', 192, 0.14], ['icona-512.png', 512, 0.14],
               ['icona-512-maskable.png', 512, 0.22], ['favicon-32.png', 32, 0.06, false]];
for (const [nome, lato, margine, conBovina = true] of pezzi) {
  const html = `<!doctype html><html><body style="margin:0;background:#000"><div style="width:${lato}px;height:${lato}px">${svg(tema, margine, conBovina).replace('width="1000" height="1000"', `width="${lato}" height="${lato}"`)}</div></body></html>`;
  writeFileSync('tmp.html', html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${lato},${lato}`, `--screenshot=${uscita}/${nome}`, 'file://' + process.cwd() + '/tmp.html'], { stdio: 'ignore' });
}
console.log('ok', tema);
