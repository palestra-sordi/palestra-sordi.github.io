// Vista Storico: scheda Sedute (per programma e settimana) e scheda Esercizi (grafico per famiglia).
import { weeks, stats, famSeries, num, programOf } from '../logica.js';
import { esc, dataBreve, plurale } from '../html.js';
import { chart } from '../grafico.js';

let tab = 'sedute', fam = null, box = 0;
const filled = x => String(x ?? '').trim() !== '';
const dm = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const plus = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const lunedi = iso => plus(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));
const SVG_FRECCIA = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const SVG_GIU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const nomeProg = b => 'Programma ' + String(b).replace(/\D/g, '');

/* ---------- Sedute ---------- */
const NOMI = { ok: 'fatta', sk: 'saltata', no: 'non registrata' };
function riga(d, s) {
  const titolo = programOf(d, s.block)?.days?.[s.day]?.sub || 'Giorno ' + s.day;
  const ents = Object.values(s.entries || {}).filter(Boolean);
  const nEs = ents.filter(e => !e.skip && (e.sets || []).some(filled)).length;
  const note = ents.filter(e => filled(e.note)).length + (filled(s.note) ? 1 : 0);
  const sotto = s.skipped ? 'saltata' : [plurale(nEs, 'esercizio', 'esercizi'), note ? plurale(note, 'nota', 'note') : ''].filter(Boolean).join(' · ');
  return `<button class="riga seduta-riga${s.skipped ? ' saltata-riga' : ''}" data-apri="${esc(s.date)}|${esc(s.day)}">
    <span class="lettera">${esc(s.day)}</span><span class="t"><strong>${esc(titolo)}</strong><span>${esc(dataBreve(s.date))} · ${esc(sotto)}</span></span>${SVG_FRECCIA}</button>`;
}

function sedute(d) {
  const all = Object.values(d.sessions), st = stats(all);
  const P = d.program.current;
  const gs = weeks(all, { [d.currentProgram]: { start: P.start, weeks: P.weeks } });
  let h = `<div class="numeri"><div class="stat"><b>${st.done}</b><span>fatte</span></div><div class="stat"><b>${st.skipped}</b><span>saltate</span></div>
    <div class="stat"><b>${st.pct}%</b><span>costanza</span></div></div>`;
  let prog = null;
  gs.forEach((g, i) => {
    if (g.program !== prog) {
      prog = g.program;
      const ds = all.filter(s => s.block === prog).map(s => s.date).sort();
      const arch = prog !== d.currentProgram;
      h += `<h2 class="prog">${esc(nomeProg(prog))} <span class="secondario">· ${arch ? `${dm(ds[0])} – ${dm(ds[ds.length - 1])}, archiviato` : `dal ${dm(ds[0])}`}</span></h2>`;
    }
    const lun = lunedi(g.from);
    const dots = ['A', 'B', 'C'].map(x => { const k = g.days[x] || 'no'; return `<span class="dot ${k}">${x}</span>`; }).join('');
    const nomi = ['A', 'B', 'C'].map(x => `${x} ${NOMI[g.days[x] || 'no']}`).join(', ');
    h += `<details class="settimana"${i === 0 ? ' open' : ''}><summary><span class="wkh">SETTIMANA ${esc(g.week)} · ${dm(lun)} – ${dm(plus(lun, 6))}</span>
      <span class="dots" role="img" aria-label="${esc(nomi)}">${dots}</span>${SVG_GIU}</summary>
      <div class="wk">${g.sessions.map(s => riga(d, s)).join('')}</div></details>`;
  });
  return h;
}

/* ---------- Esercizi ---------- */
const famiglie = d => [...new Set(Object.values(d.sessions).flatMap(s => Object.values(s.entries || {}).map(e => e?.fam)).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'it'));

function prescrizione(d, s, f) {
  const it = programOf(d, s.block)?.days?.[s.day]?.items?.find(i => i.fam === f);
  return it && /^\d+$/.test(String(it.sets)) && filled(it.reps) ? ` · ${esc(it.sets)} × ${esc(it.reps)}` : '';
}

function boxCambio(c) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10" fill="#ffb86d"/></svg>
    <div><b>${esc(c.t)}.</b> ${esc(c.d)}</div>`;
}

function esercizi(d) {
  const lista = famiglie(d);
  const P = d.program.current;
  const items = Object.values(P.days).flatMap(D => D.items);
  if (!fam || !lista.includes(fam)) fam = items.find(i => lista.includes(i.fam))?.fam || lista[0];
  if (!fam) return '<p class="secondario">Ancora nessuna seduta.</p>';
  const oggi = items.find(i => i.fam === fam);
  const curDay = Object.entries(P.days).find(([, D]) => D.items.some(i => i.fam === fam))?.[0];
  const labels = [...Object.values(d.program.p1?.days || {}), ...Object.values(P.days)].flatMap(D => D.items).find(i => i.fam === fam && i.labels)?.labels;
  if (!labels || box >= labels.length) box = 0;

  const tutte = famSeries(Object.values(d.sessions), fam, curDay);
  // con più caselle di unità diverse (verticale) si grafica una sola casella; le vuote non danno punto
  const serie = labels ? tutte.map(p => ({ ...p, total: num(p.sets[box]), kg: null })).filter(p => p.total != null) : tutte;

  const per = {}; // inizio di ogni programma dopo il primo = prima seduta
  for (const s of Object.values(d.sessions)) if (!per[s.block] || s.date < per[s.block]) per[s.block] = s.date;
  const inizi = Object.entries(per).sort((a, b) => a[1] < b[1] ? -1 : 1).slice(1).map(([b, date]) => ({ date, label: nomeProg(b) }));
  const cambi = (d.notes.main.sections.find(s => s.title === 'Cosa è cambiato e perché')?.items || []).filter(i => i.fam === fam);
  const ultimo = [...cambi].sort((a, b) => (b.on || '').localeCompare(a.on || ''))[0];

  // il riassunto segue il giorno principale: il giorno C con un carico più basso non è un calo
  const pk = tutte.filter(p => p.kg != null), kp = pk.filter(p => p.same), cs = kp.length > 1 ? kp : pk;
  const fk = v => (tutte.some(p => /^\s*(\+|zavorra)/i.test(p.load || '')) && v > 0 ? '+' : '') + String(v).replace('.', ',') + ' kg';
  let frase = '';
  if (cs.length > 1 && !labels) {
    const w = Math.max(1, Math.round((Date.parse(cs[cs.length - 1].date) - Date.parse(cs[0].date)) / 604800000));
    frase = `Carico da <b>${esc(cs[0].kg === 0 ? '0' : fk(cs[0].kg))}</b> a <b class="primario-t">${esc(fk(cs[cs.length - 1].kg))}</b> in ${plurale(w, 'settimana', 'settimane')}.`;
  } else frase = `${plurale(tutte.length, 'seduta', 'sedute')}, dal ${dm(tutte[0]?.date || '2026-01-01')} al ${dm(tutte[tutte.length - 1]?.date || '2026-01-01')}.`;
  if (oggi && filled(oggi.load)) frase += ` Oggi in programma: <b>${esc(oggi.load)}</b>.`;

  const sel = `<div class="sel"><select id="s-fam" aria-label="Esercizio">${lista.map(f => `<option${f === fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>${SVG_GIU}</div>`;
  const selBox = labels ? `<div class="sel"><select id="s-box" aria-label="Casella da graficare">${labels.map((l, i) => `<option value="${i}"${i === box ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${SVG_GIU}</div>` : '';
  const hasLoad = serie.some(p => p.kg != null), vuoti = serie.some(p => !p.same);
  const leg = `<figcaption class="lg">${hasLoad ? `<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#8bd0ef"/></svg>${curDay ? 'giorno ' + esc(curDay) : 'sedute'}</span>` : ''}${
    hasLoad && vuoti ? '<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="#8bd0ef" stroke-width="2"/></svg>altri giorni</span>' : ''}${
    cambi.some(c => c.on) ? '<span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#ffb86d"/></svg>modifica (tocca)</span>' : ''}</figcaption>`;
  const svg = serie.length ? chart(serie, cambi, inizi, { name: fam, title: labels ? labels[box] : 'Ripetizioni totali' }) : '';
  const fig = svg ? `<figure class="grafico" data-cambi>${svg}${leg}</figure>` : '<p class="secondario">Nessun valore da mostrare per questa casella.</p>';

  const righe = [...tutte].reverse().map(p => {
    const valori = labels ? p.sets.map((v, i) => filled(v) ? `${esc(labels[i] || '')} ${esc(v)}` : '') : p.sets.filter(filled).map(esc);
    return `<div class="e"><div class="top"><span><b>${esc(dataBreve(p.date))}</b> · ${esc(p.day)}${prescrizione(d, p, fam)}</span><span>${esc(nomeProg(p.block))}</span></div>
      <div class="sets">${valori.filter(Boolean).map(v => `<span class="sv">${v}</span>`).join('')}${filled(p.load) ? `<span class="ld">${esc(p.load)}</span>` : ''}</div>
      ${filled(p.note) ? `<div class="nota">${esc(p.note)}</div>` : ''}</div>`;
  }).join('');
  return `${sel}${selBox}<p class="frase">${frase}</p>${fig}
    <div class="chg-box" id="chg-box" aria-live="polite"${ultimo ? '' : ' hidden'}>${ultimo ? boxCambio(ultimo) : ''}</div>${righe}`;
}

export function render(el, state, actions) {
  const d = state.data;
  if (!d) return;
  el.innerHTML = `<h1>Storico</h1><div class="tabs" role="tablist">
    <button role="tab" aria-selected="${tab === 'sedute'}" data-tab="sedute">Sedute</button>
    <button role="tab" aria-selected="${tab === 'esercizi'}" data-tab="esercizi">Esercizi</button></div>
    <div class="storico-corpo">${tab === 'sedute' ? sedute(d) : esercizi(d)}</div>`;
  const redo = () => render(el, state, actions);
  for (const b of el.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { tab = b.dataset.tab; redo() });
  for (const b of el.querySelectorAll('[data-apri]')) b.addEventListener('click', () => {
    const [date, day] = b.dataset.apri.split('|'); actions.show('seduta', { date, day });
  });
  el.querySelector('#s-fam')?.addEventListener('change', e => { fam = e.target.value; box = 0; redo() });
  el.querySelector('#s-box')?.addEventListener('change', e => { box = +e.target.value; redo() });
  const cambi = (d.notes.main.sections.find(s => s.title === 'Cosa è cambiato e perché')?.items || []).filter(i => i.fam === fam);
  const mostra = g => { const c = cambi[+g.dataset.chg], b = el.querySelector('#chg-box'); if (c && b) { b.hidden = false; b.innerHTML = boxCambio(c) } };
  for (const g of el.querySelectorAll('[data-chg]')) {
    g.addEventListener('click', () => mostra(g));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mostra(g) } });
  }
}
