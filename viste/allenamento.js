// Vista Allenamento (home): prossima seduta della rotazione, ultima seduta, saltate recenti.
import { nextDay, openSession, isOpen, weekOf, programOf, loadKg } from '../logica.js';
import { esc, today, dataLunga, plurale } from '../html.js';

let started = false, scegli = false;
const filled = x => String(x ?? '').trim() !== '';
const numerico = (a, b) => a.localeCompare(b, 'it', { numeric: true });

const SVG_FRECCIA = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const SVG_MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

function ultimaCard(d, s) {
  const p = programOf(d, s.block), titolo = p?.days?.[s.day]?.sub || 'Giorno ' + s.day;
  const ents = Object.entries(s.entries || {}).sort((a, b) => numerico(a[0], b[0])).map(x => x[1]);
  const righe = ents.filter(e => e && ((e.sets || []).some(filled) || e.skip)).map(e => {
    const v = e.skip ? 'saltato' : (e.sets || []).filter(filled).join(' · ');
    const kg = !e.skip && filled(e.load) && loadKg(e.load) != null; // un carico a parole va sulla riga sotto
    return `<div class="ex"><span class="n">${esc(e.name)}</span><span class="v">${esc(v)}${kg ? ` <span class="secondario">${esc(e.load)}</span>` : ''}</span>${
      !kg && !e.skip && filled(e.load) ? `<span class="l">${esc(e.load)}</span>` : ''}</div>`;
  }).join('');
  const note = ents.filter(e => e && filled(e.note)).length + (filled(s.note) ? 1 : 0);
  const stato = isOpen(s, Date.now()) ? 'in corso' : 'conclusa';
  return `<button class="card ultima" data-apri="${esc(s.date)}|${esc(s.day)}">
    <span class="testa-card"><span class="lettera">${esc(s.day)}</span>
      <span class="t"><strong>${esc(titolo)}</strong><span>${esc(dataLunga(s.date))} · ${stato}</span></span>${SVG_FRECCIA}</span>
    ${righe}${note ? `<span class="conta-note">${SVG_MIC}${plurale(note, 'nota', 'note')}</span>` : ''}</button>`;
}

export function render(el, state, actions) {
  const d = state.data;
  if (!d) return;
  const now = Date.now(), cur = d.currentProgram, P = d.program.current, oggi = today();
  const all = Object.values(d.sessions);
  const aperta = openSession(all, cur, now);
  if (!started) { started = true; if (aperta) return actions.show('seduta', { date: aperta.date, day: aperta.day }) }

  const w = weekOf(P.start, oggi);
  let h = `<div class="oggi"><div class="sez-oggi">${esc(dataLunga(oggi))}</div>
    <div class="secondario">${esc(P.name.split(':')[0])}${w && w <= P.weeks ? ` · settimana ${w} di ${P.weeks}` : ''}</div></div>`;

  if (aperta) {
    h += `<section class="hero"><div class="hero-testa"><span class="lettera grande">${esc(aperta.day)}</span>
      <span class="t"><span class="etichetta">SEDUTA IN CORSO</span><strong>${esc(P.days[aperta.day]?.sub)}</strong><span>${esc(dataLunga(aperta.date))}</span></span></div>
      <button class="btn primario grande largo" data-apri="${esc(aperta.date)}|${esc(aperta.day)}">Continua allenamento</button></section>`;
  } else {
    const day = nextDay(all, cur), D = P.days[day];
    const gruppi = new Set(D.items.map(i => i.group).filter(Boolean)).size;
    h += `<section class="hero"><div class="hero-testa"><span class="lettera grande">${esc(day)}</span>
      <span class="t"><span class="etichetta">PROSSIMA SEDUTA</span><strong>${esc(D.sub)}</strong>
      <span>${plurale(D.items.length, 'esercizio', 'esercizi')}${gruppi ? ` · ${gruppi} superset` : ''}</span></span></div>
      <button class="btn primario grande largo" data-inizia="${esc(day)}"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Inizia allenamento</button>
      <div class="hero-azioni"><button class="btn testo" id="altro" aria-expanded="${scegli}">Fai un altro giorno</button>
      ${d.sessions[oggi + '_' + day] ? '' : `<button class="btn testo" data-salta="${esc(day)}">Salta ${esc(day)}</button>`}</div>
      ${scegli ? `<div class="scelta">${['A', 'B', 'C'].map(x => `<button class="btn" data-inizia="${x}"><b>${x}</b><span>${esc(P.days[x]?.sub)}</span></button>`).join('')}</div>` : ''}
    </section>`;
  }

  const ordinate = all.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || ''));
  const ultima = ordinate.find(s => !s.skipped && s !== aperta);
  const limite = today(new Date(now - 14 * 86400000));
  const saltate = ordinate.filter(s => s.skipped && s.date >= limite).slice(0, 3);
  if (ultima || saltate.length) {
    h += '<h2 class="sez">Ultima seduta</h2>' + (ultima ? ultimaCard(d, ultima) : '');
    h += saltate.map(s => `<button class="saltata" data-apri="${esc(s.date)}|${esc(s.day)}"><span class="lettera piccola">${esc(s.day)}</span>${esc(dataLunga(s.date))} · saltata</button>`).join('');
  }
  el.innerHTML = h;

  el.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.apri) { const [date, day] = b.dataset.apri.split('|'); return actions.show('seduta', { date, day }) }
    if (b.dataset.inizia) { scegli = false; return actions.show('seduta', { date: today(), day: b.dataset.inizia, nuova: true }) }
    if (b.id === 'altro') { scegli = !scegli; return render(el, state, actions) }
    if (b.dataset.salta) {
      const day = b.dataset.salta, date = today(), ora = new Date().toISOString();
      if (!confirm(`Segno ${day} come saltata oggi? La rotazione passa al giorno dopo.`)) return;
      actions.queue({ date, day, block: cur, week: weekOf(P.start, date), skipped: true, editedAt: ora, endedAt: ora });
      render(el, state, actions);
    }
  };
}
