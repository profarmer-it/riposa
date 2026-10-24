// Genera l'SVG dell'icona. tema: 'riposa' | 'pro'; margine: quota del lato lasciata libera attorno al segno
export function svg(tema, margine = 0.14, conBovina = true) {
  const T = {
    riposa: { f1: '#1B4277', f2: '#0B1E39', c1: '#3FC4F2', c2: '#4A7DF7', luce: 'rgba(120,190,255,.22)', muso: '#8CC4F5', macchia: '#2F86E0' },
    pro:    { f1: '#13223D', f2: '#050B16', c1: '#F4CF7A', c2: '#C9912E', luce: 'rgba(244,207,122,.16)', muso: '#F1D59A', macchia: '#C9912E' }
  }[tema];
  const L = 1000, m = L * margine, s = L - 2 * m;           // il segno sta in un quadrato di lato s
  const b = s * 0.30;                                        // spessore dei bracci della croce
  const r = b * 0.16;                                        // angoli appena smussati
  const cx = L / 2, cy = L / 2;
  const croce = `<rect x="${cx - b / 2}" y="${m}" width="${b}" height="${s}" rx="${r}"/>`
              + `<rect x="${m}" y="${cy - b / 2}" width="${s}" height="${b}" rx="${r}"/>`;
  // la bovina di Riposa, centrata sull'incrocio (stesse forme di app.js, viewBox 0 0 92 84 ritagliato)
  const k = b * 1.78 / 92;                                   // larga poco più dell'incrocio
  const tx = cx - 46 * k, ty = cy - 46 * k;
  const bovina = `<g transform="translate(${tx} ${ty}) scale(${k})">
    <ellipse cx="19" cy="34" rx="7.5" ry="12" transform="rotate(-34 19 34)" fill="#D7E3F0"/>
    <ellipse cx="73" cy="34" rx="7.5" ry="12" transform="rotate(34 73 34)" fill="#D7E3F0"/>
    <path d="M28 22c-3-4-2-8 1-10 1 3 2 6 4 8z" fill="#B9C9DA"/>
    <path d="M64 22c3-4 2-8-1-10-1 3-2 6-4 8z" fill="#B9C9DA"/>
    <ellipse cx="46" cy="48" rx="26" ry="24" fill="#fff"/>
    <path d="M46 24c-9 0-16 4-19 10 5 2 11 1 15-2 3 3 8 4 12 3-1-6-4-10-8-11z" fill="${T.macchia}"/>
    <ellipse cx="46" cy="68" rx="17.5" ry="12" fill="${T.muso}"/>
    <circle cx="39.5" cy="67" r="2.4" fill="#0E2340"/><circle cx="52.5" cy="67" r="2.4" fill="#0E2340"/>
    <circle cx="36" cy="44" r="3.6" fill="#0E2340"/><circle cx="56" cy="44" r="3.6" fill="#0E2340"/>
    <circle cx="37.2" cy="42.8" r="1.2" fill="#fff"/><circle cx="57.2" cy="42.8" r="1.2" fill="#fff"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${L}" width="${L}" height="${L}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.f1}"/><stop offset="1" stop-color="${T.f2}"/></linearGradient>
    <radialGradient id="luce" cx=".3" cy=".22" r=".7"><stop offset="0" stop-color="${T.luce}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
    <linearGradient id="croce" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.c1}"/><stop offset="1" stop-color="${T.c2}"/></linearGradient>
    <filter id="ombra" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="${L * 0.012}" stdDeviation="${L * 0.018}" flood-color="#000" flood-opacity=".28"/></filter>
  </defs>
  <rect width="${L}" height="${L}" fill="url(#fondo)"/>
  <rect width="${L}" height="${L}" fill="url(#luce)"/>
  <g fill="url(#croce)">${croce}</g>
  ${conBovina ? `<g filter="url(#ombra)">${bovina}</g>` : ""}
</svg>`;
}
