// Icone per gli store: 1024 (App Store, senza trasparenza) e 512 (Google Play).
import { svg } from './icona.mjs';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [tema, uscita] = process.argv.slice(2);
for (const lato of [1024, 512]) {
  writeFileSync('tmp.html', `<!doctype html><body style="margin:0">${svg(tema, 0.14).replace('width="1000" height="1000"', `width="${lato}" height="${lato}"`)}</body>`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${lato},${lato}`, `--screenshot=${uscita}/icona-${lato}.png`, 'file://' + process.cwd() + '/tmp.html'], { stdio: 'ignore' });
}
console.log('ok', tema);
