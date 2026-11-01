import { esc } from './safe.js';

/** Oddiy chiziqli grafik (SVG). Ranglar CSS o'zgaruvchilaridan — tun/kun rejimida ishlaydi.
 *  points: [{ label, value }]. Bo'sh ro'yxat — ''. Barcha matn esc() dan o'tadi. */
export function lineChartSVG({ points, yMin, yMax, ticks, decimals = 1, suffix = '', color = 'var(--teal)', label = '', width = 360, height = 176 }) {
  if (!points || !points.length || !(yMax > yMin)) return '';
  const padL = 36, padR = 16, padT = 18, padB = 28;
  const iw = width - padL - padR, ih = height - padT - padB;
  const r1 = (n) => Math.round(n * 10) / 10;
  const x = (i) => points.length === 1 ? padL + iw / 2 : padL + (iw * i) / (points.length - 1);
  const y = (v) => padT + ih * (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin));
  const fmt = (v) => Number(v).toFixed(decimals) + suffix;
  const grid = (ticks || [yMin, yMax]).map(tv =>
    `<line x1="${padL}" x2="${width - padR}" y1="${r1(y(tv))}" y2="${r1(y(tv))}" stroke="var(--line)" stroke-width="1"/>` +
    `<text x="${padL - 6}" y="${r1(y(tv) + 3.5)}" text-anchor="end" font-size="10" fill="var(--ink-soft)">${esc(tv + suffix)}</text>`).join('');
  const path = points.length > 1
    ? `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${r1(x(i))} ${r1(y(p.value))}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
    : '';
  const step = points.length > 8 ? 2 : 1;
  const dots = points.map((p, i) =>
    `<circle cx="${r1(x(i))}" cy="${r1(y(p.value))}" r="3.6" fill="${color}"/>` +
    `<text x="${r1(x(i))}" y="${r1(y(p.value) - 8)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--ink)">${esc(fmt(p.value))}</text>`).join('');
  const xl = points.map((p, i) => i % step ? '' :
    `<text x="${r1(x(i))}" y="${height - 9}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">${esc(p.label)}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${grid}${path}${dots}${xl}</svg>`;
}
