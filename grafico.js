// Grafico di un esercizio, SVG scritto a mano (nessuna libreria): pannello del carico (linea) sopra, ripetizioni totali
// (barre) sotto, linee tratteggiate grigie per l'inizio dei programmi, ambra con pallino per le modifiche di Claude.
// Tutto il testo dell'utente passa da esc, anche dentro attributi.
import { esc } from './html.js';

const W = 358, X0 = 46, X1 = 344, PRIMARIO = '#8bd0ef', SUP = '#191612', FANT = '#a39a90', AMBRA = '#ffb86d';
const ms = iso => Date.parse(iso + 'T12:00:00Z');
const dm = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const n1 = v => String(Math.round(v * 10) / 10).replace('.', ',');

// series: output di famSeries (eventualmente con total già scelto); changes: {on, t, d}; programStarts: date o {date, label}
// opts: {name, title (titolo del pannello sotto, default "RIPETIZIONI TOTALI")}
export function chart(series, changes = [], programStarts = [], opts = {}) {
  if (!series.length) return '';
  const hasLoad = series.some(p => p.kg != null);
  const signed = series.some(p => /^\s*(\+|zavorra)/i.test(p.load || ''));
  const fmtKg = v => (signed && v > 0 ? '+' : '') + n1(v);
  const okDate = d => /^\d{4}-\d\d-\d\d$/.test(d || '') && !isNaN(ms(d));
  const marks = changes.filter(c => okDate(c.on));
  const starts = programStarts.map((p, i) => typeof p === 'string' ? { date: p, label: 'Programma ' + (i + 2) } : p).filter(p => okDate(p.date));

  const dates = [...series.map(p => p.date), ...marks.map(c => c.on), ...starts.map(p => p.date)];
  const lo = ms(dates.reduce((a, b) => a < b ? a : b)), hi = ms(dates.reduce((a, b) => a > b ? a : b));
  const x = iso => hi === lo ? (X0 + X1) / 2 : X0 + (ms(iso) - lo) / (hi - lo) * (X1 - X0);

  const LT = 64, LB = 140;                       // pannello carico
  const ry0 = hasLoad ? 156 : 0, RT = hasLoad ? ry0 + 30 : 64, RH = hasLoad ? 56 : 90, RB = RT + RH; // pannello ripetizioni
  const H = RB + 30;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(
    `${opts.name || 'Esercizio'}: ${hasLoad ? 'carico e ' : ''}${(opts.title || 'ripetizioni totali').toLowerCase()}, ${series.length} sedute dal ${dm(series[0].date)} al ${dm(series[series.length - 1].date)}`)}" style="display:block;font-family:inherit">`;

  // pannello carico
  let linea = '', punti = '';
  if (hasLoad) {
    const kgs = series.map(p => p.kg).filter(v => v != null);
    const a = Math.min(0, ...kgs); let b = Math.max(...kgs); if (b <= a) b = a + 1;
    const y = v => LB - (v - a) / (b - a) * (LB - LT);
    s += `<text x="4" y="14" fill="#c0b8ae" font-size="13" font-weight="700">CARICO</text>`;
    for (const v of [a, (a + b) / 2, b]) {
      s += `<line x1="${X0}" y1="${y(v)}" x2="${X1 + 2}" y2="${y(v)}" stroke="${v === a ? '#3a342d' : '#2a251f'}"/>` +
        `<text x="${X0 - 10}" y="${y(v) + 4}" fill="${FANT}" font-size="13" text-anchor="end">${fmtKg(v)}</text>`;
    }
    const load = series.filter(p => p.kg != null);
    linea = load.length > 1 ? `<polyline points="${load.map(p => `${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')}" fill="none" stroke="${PRIMARIO}" stroke-width="3" stroke-linejoin="round"/>` : '';
    punti = load.map(p => `<circle class="pt" data-hollow="${p.same ? 0 : 1}" cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="5.5" ` +
      (p.same ? `fill="${PRIMARIO}"` : `fill="${SUP}" stroke="${PRIMARIO}" stroke-width="2.5"`) + '/>').join('');
  }

  // pannello ripetizioni (barre)
  const tot = series.map(p => p.total);
  const mx = Math.max(1, ...tot);
  s += `<text x="4" y="${ry0 + 14}" fill="#c0b8ae" font-size="13" font-weight="700">${esc((opts.title || 'RIPETIZIONI TOTALI').toUpperCase())}</text>` +
    `<line x1="${X0}" y1="${RB}" x2="${X1 + 2}" y2="${RB}" stroke="#3a342d"/>` +
    `<text x="${X0 - 10}" y="${RT + 4}" fill="${FANT}" font-size="13" text-anchor="end">${n1(mx)}</text>`;
  const bw = Math.max(4, Math.min(14, (X1 - X0) / series.length / 1.6));
  for (const p of series) {
    if (!(p.total > 0)) continue;
    const h = p.total / mx * RH, bx = (x(p.date) - bw / 2).toFixed(1);
    s += `<rect class="bar" data-hollow="${p.same ? 0 : 1}" x="${bx}" y="${(RB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" ` +
      (p.same ? `fill="${FANT}"` : `fill="none" stroke="${FANT}" stroke-width="2"`) + '/>';
  }

  // asse x: quattro date (con un solo giorno, una data sotto il punto)
  for (let i = 0; i < 4; i++) {
    const iso = new Date(lo + (hi - lo) * i / 3).toISOString().slice(0, 10), one = hi === lo;
    s += `<text x="${(one ? (X0 + X1) / 2 : X0 + (X1 - X0) * i / 3).toFixed(1)}" y="${RB + 22}" fill="${FANT}" font-size="13" text-anchor="${one || (i > 0 && i < 3) ? 'middle' : i === 0 ? 'start' : 'end'}">${dm(iso)}</text>`;
    if (one) break;
  }

  // linee dei programmi; l'etichetta sta in una riga propria e si salta se tocca la precedente
  let fine = -1;
  for (const p of [...starts].sort((a, b) => a.date < b.date ? -1 : 1)) {
    const px = x(p.date), w = String(p.label).length * 7.5, left = px - 4 - w < X0 - 40, a = left ? px + 4 : px - 4 - w;
    s += `<line x1="${px.toFixed(1)}" y1="38" x2="${px.toFixed(1)}" y2="${RB}" stroke="#70787d" stroke-dasharray="3 3"/>`;
    if (a < fine + 4) continue;
    fine = a + w;
    s += `<text x="${(left ? px + 4 : px - 4).toFixed(1)}" y="50" fill="#c0b8ae" font-size="13" text-anchor="${left ? 'start' : 'end'}">${esc(p.label)}</text>`;
  }
  // linea e punti del carico sopra le linee dei programmi
  if (hasLoad) s += linea + punti;

  // modifiche: linea ambra, pallino e area di tocco alta 48; larga fino a metà strada dai vicini, così ognuna è raggiungibile
  const xs = marks.map(c => x(c.on)), ord = marks.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  ord.forEach((i, k) => {
    const c = marks[i], cx = xs[i];
    const l = k ? Math.max(cx - 24, (xs[ord[k - 1]] + cx) / 2) : cx - 24, r = k < ord.length - 1 ? Math.min(cx + 24, (xs[ord[k + 1]] + cx) / 2) : cx + 24;
    s += `<g class="chg" data-chg="${changes.indexOf(c)}" role="button" tabindex="0" aria-label="${esc(`Modifica del ${dm(c.on)}: ${c.t}`)}">` +
      `<line x1="${cx.toFixed(1)}" y1="30" x2="${cx.toFixed(1)}" y2="${RB}" stroke="${AMBRA}" stroke-dasharray="3 3"/>` +
      `<circle cx="${cx.toFixed(1)}" cy="26" r="7" fill="${AMBRA}"/><rect x="${l.toFixed(1)}" y="2" width="${(r - l).toFixed(1)}" height="48" fill="transparent"/></g>`;
  });
  return s + '</svg>';
}
