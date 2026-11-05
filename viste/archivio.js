// Vista Archivio: tutto ciò che non sta in Piano. Sezioni chiuse da aprire, cronologia, programma archiviato.
import { esc } from '../html.js';

const SVG_GIU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const dl = items => '<dl>' + items.map(i => `<dt>${esc(i.t)}</dt><dd>${esc(i.d)}</dd>`).join('') + '</dl>';
const box = (titolo, corpo) => `<details class="riga-det"><summary class="riga"><span class="t"><strong>${esc(titolo)}</strong></span>${SVG_GIU}</summary><div class="corpo">${corpo}</div></details>`;

// "30/10, trazioni zavorrate" -> data in evidenza + titolo; senza data il titolo resta intero
function timeline(items) {
  return '<ol class="timeline">' + items.map(i => {
    const m = /^(\d{1,2}\/\d{1,2})[,:]?\s*(.*)$/s.exec(i.t);
    return `<li><b class="quando">${esc(m ? m[1] : '')}</b><div><strong>${esc(m ? m[2] : i.t)}</strong><p>${esc(i.d)}</p></div></li>`;
  }).join('') + '</ol>';
}

function programma(p) {
  const giorni = Object.keys(p.days).sort().map(k => {
    const g = p.days[k];
    return `<h3>${esc(g.title)}: ${esc(g.sub)}</h3><dl>` + g.items.map(i =>
      `<dt>${esc(i.name)} – ${esc(i.sets)} × ${esc(i.reps)}${i.load ? ', ' + esc(i.load) : ''}</dt><dd>${esc(i.how)}</dd>`).join('') + '</dl>';
  }).join('');
  return box((p.name || 'Programma precedente') + ' completo, con le istruzioni', giorni);
}

export function render(el, state, actions) {
  const d = state.data, secs = d.notes?.main?.sections || [];
  const sezioni = secs.filter(s => !s.title.startsWith('Obiettivi del blocco')).map(s =>
    box(s.title, s.title === 'Cosa è cambiato e perché' ? timeline(s.items) : dl(s.items))).join('');
  const archiviati = Object.entries(d.program).filter(([k]) => k !== 'current').map(([, p]) => programma(p)).join('');
  el.innerHTML = '<button class="btn" id="indietro">← Piano</button><h1>Archivio</h1>' +
    (sezioni || '<p class="secondario">Le note non sono ancora nel database.</p>') + archiviati;
  el.querySelector('#indietro').addEventListener('click', () => history.back());
}
