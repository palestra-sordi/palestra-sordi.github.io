// Vista Piano: fase in corso e obiettivi di questa fase. Il resto sta in Archivio.
import { weekOf } from '../logica.js';
import { esc, today } from '../html.js';

const dm = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const ARCHIVIO = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg>';
const FRECCIA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

function fase(P) {
  const n = Math.min(Math.max(weekOf(P.start, today()) || 1, 1), P.weeks);
  const seg = Array.from({ length: P.weeks }, (_, i) => `<div class="wkseg${i + 1 === n ? ' ora' : ''}"><i></i><span>${i + 1}</span></div>`).join('');
  return `<section class="fase"><div class="sez">Fase in corso</div><div class="nome">${esc(P.name)}</div>
    <div>Settimana <b>${n} di ${esc(P.weeks)}</b> · dal ${dm(P.start)} al ${dm(P.end)}</div>
    <div class="segmenti" role="img" aria-label="Settimana ${n} di ${esc(P.weeks)}">${seg}</div>
    <div class="regola">Esercizi fissi fino al ${dm(P.end)}: cambiano solo i carichi, secondo i criteri.</div></section>`;
}

const clamp = x => Math.min(1, Math.max(0, x));
function obiettivo(g) {
  if (g.expected === false) return `<div class="card tratteggio"><h3>${esc(g.title)}</h3><div class="when">${esc(g.when)}</div></div>`;
  const bar = [g.startNum, g.nowNum, g.targetNum].every(x => x != null) && g.targetNum !== g.startNum
    ? `<div class="barra"><i style="width:${Math.round(clamp((g.nowNum - g.startNum) / (g.targetNum - g.startNum)) * 100)}%"></i></div>` : '';
  return `<div class="card"><h3>${esc(g.title)}</h3>
    <div class="nums"><div><span>PARTENZA</span><b>${esc(g.start)}</b></div><div><span>ADESSO</span><b class="ora">${esc(g.now)}</b></div><div><span>OBIETTIVO</span><b>${esc(g.target)}</b></div></div>
    ${bar}<div class="when">${esc(g.when)}</div></div>`;
}

export function render(el, state, actions) {
  const d = state.data, goals = d.goals?.[d.currentProgram] || [];
  el.innerHTML = '<h1>Piano</h1>' + fase(d.program.current) + '<h2 class="sez">Obiettivi di questa fase</h2>' +
    (goals.length ? goals.slice().sort((a, b) => a.pos - b.pos).map(obiettivo).join('')
      : '<p class="secondario">Gli obiettivi di questa fase arrivano con la prossima revisione.</p>') +
    `<button class="riga" id="vai-archivio">${ARCHIVIO}<span class="t"><strong>Archivio</strong><span>Regole, modifiche, diagnosi, programma 1</span></span>${FRECCIA}</button>`;
  el.querySelector('#vai-archivio').addEventListener('click', () => actions.show('archivio'));
}
