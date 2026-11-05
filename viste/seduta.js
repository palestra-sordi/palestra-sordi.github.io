// Vista Seduta: un esercizio aperto alla volta, caselle con sotto i "fantasmi" dell'ultima volta.
// "Inizia" apre una bozza in memoria: la seduta nasce nel database al primo dato scritto.
import { isOpen, needsAutoClose, lastFor, isDone, isBetter, weekOf, sessionKey, loadKg, programOf } from '../logica.js';
import { esc, dataLunga, dataBreve, plurale } from '../html.js';
import { onStatus } from '../dati.js';
import { startDictation } from '../voce.js';

let cur = null, openId = null; // cur = {date, day, block, week}: la bozza tiene la sua data anche dopo mezzanotte
// openId: null = apri il primo da fare; '' = tutto chiuso dal tasto. In un superset si apre tutta la coppia.
const altri = new Set(); // id con "Nota e istruzioni" aperto nel superset: resta aperto ai ridisegni
const filled = x => String(x ?? '').trim() !== '';
const SALTATA = '–'; // valore di una serie non fatta
const prime = (n, sets) => Array.from({ length: n }, (_, i) => sets?.[i] ?? '');
const serieDaSaltare = (n, sets) => { const p = prime(n, sets); return p.some(filled) && !p.every(filled) };
const numerico = (a, b) => a.localeCompare(b, 'it', { numeric: true });

/* ---------- schermo acceso ---------- */
let lock = null, wantLock = false, pending = false;
async function wake() {
  if (!wantLock || pending || (lock && !lock.released) || !navigator.wakeLock) return;
  pending = true; // una sola richiesta alla volta; se nel frattempo si è usciti, il lock appena arrivato si rilascia
  try {
    const l = await navigator.wakeLock.request('screen');
    if (wantLock) lock = l; else l.release().catch(() => {});
  } catch { lock = null } finally { pending = false }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake() });
const rilascia = () => { wantLock = false; if (lock) lock.release().catch(() => {}); lock = null };
export function leave() { fermaDett(true); rilascia() }

/* ---------- dettatura in corso (una sola): si ferma a ogni ridisegno e quando si esce dalla vista ---------- */
let dett = null; // {h, key, scarta}
function fermaDett(scarta) { // scarta: il testo che arriva dopo non si scrive (uscita); altrimenti si salva, se la seduta è ancora la stessa
  if (!dett) return;
  if (scarta) dett.scarta = true;
  dett.fine(); dett.h.stop(); dett = null; // la sezione resta nel DOM anche nascosta: il riquadro si toglie qui
}

/* ---------- stato del salvataggio, ripetuto in fondo alla seduta ---------- */
let salv = { t: '', err: false };
const salvHtml = () => `<span>${esc(salv.t)}</span>${salv.err ? '<button class="btn testo" data-riprova>Riprova</button>' : ''}`;
onStatus((t, err) => { salv = { t, err }; const x = document.getElementById('seduta-salv'); if (x) x.innerHTML = salvHtml() });

/* ---------- pezzi ---------- */
const SVG_GIU = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const SVG_OK = '<svg class="spunta" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#88d7a1"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#00391d" stroke-width="2.4"/></svg>';
const SVG_INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/></svg>';

const lista = (titolo, xs) => !xs?.length ? '' : `<details class="riga-det"><summary class="riga"><span class="t"><strong>${titolo}</strong>
  <span>${plurale(xs.length, 'esercizio', 'esercizi')}</span></span>${SVG_GIU}</summary><ul class="elenco">${xs.map(w =>
  `<li><strong>${esc(w.name)}</strong> · ${esc(w.dose)}${filled(w.why) ? `<small>${esc(w.why)}</small>` : ''}</li>`).join('')}</ul></details>`;

const SVG_MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const btnVoce = id => `<button class="btn voce-btn" data-detta="${esc(id)}">${SVG_MIC}Detta una nota</button><div class="voce" data-voce-per="${esc(id)}"></div>`;

const setsText = e => (e?.sets || []).filter(filled).join(' · ');

function rigaChiusa(it, e, last) {
  let sub;
  if (e?.skip) sub = 'Saltato';
  else if (isDone(it, e)) {
    sub = esc(setsText(e)) + (filled(e.load) ? ' con ' + esc(e.load) : '');
    const a = loadKg(e.load), b = last ? loadKg(last.e.load) : null;
    if (a != null && b != null && a !== b) {
      const n = String(Math.round(Math.abs(a - b) * 100) / 100).replace('.', ',');
      sub += a > b ? ` <span class="meglio">↑ ${n} kg<span class="solo-lettori"> meglio della volta scorsa</span></span>` : ` ↓ ${n} kg`;
    }
  } else {
    sub = esc(`${it.sets} × ${it.reps}`) + (filled(it.load) && it.load !== '–' ? ' · ' + esc(it.load) : '');
    if (last && setsText(last.e)) sub += ' · ultima ' + esc(setsText(last.e)) + (filled(last.e.load) && last.e.load !== it.load ? ' con ' + esc(last.e.load) : '');
  }
  return `<button class="riga" data-apri="${esc(it.id)}">${isDone(it, e) ? SVG_OK : ''}<span class="t"><strong>${esc(it.name)}</strong><span>${sub}</span></span>${SVG_GIU}</button>`;
}

function cardAperta(it, e, last, inGruppo) {
  const n = it.n || 1, sets = e?.sets || [], gs = last?.e.sets || [];
  const conCarico = it.load !== '–' || filled(e?.load);
  let h = `<article class="card aperta${inGruppo ? ' stretta' : ''}" data-id="${esc(it.id)}"><h2><button class="chiudi" data-chiudi aria-expanded="true">${esc(it.name)}${SVG_GIU}</button></h2>
    <div class="rx"><span class="chip"><b>${esc(it.sets)} × ${esc(it.reps)}</b></span>${filled(it.load) && it.load !== '–' ? `<span class="chip">Carico <b>${esc(it.load)}</b></span>` : ''}${!inGruppo && filled(it.rest) ? `<span class="chip ambra">Recupero <b>${esc(it.rest)}</b></span>` : ''}</div>`;
  if (filled(it.tip)) h += `<div class="tip">${SVG_INFO}<span>${esc(it.tip)}</span></div>`;
  if (e?.skip) {
    h += '<p class="secondario">Segnato come saltato.</p>';
  } else {
    const cols = `repeat(${n}, minmax(0, 1fr))` + (conCarico ? ' 1.4fr' : '');
    let lab = '', box = '', gh = '';
    for (let i = 0; i < n; i++) {
      const v = sets[i] ?? '', g = gs[i] ?? '';
      lab += `<label class="lab" for="s-${esc(it.id)}-${i}">${esc(it.labels?.[i] || 'Serie ' + (i + 1))}</label>`;
      box += `<div class="cas"><input class="casella" id="s-${esc(it.id)}-${i}" data-i="${i}" inputmode="decimal" autocomplete="off" placeholder=" " value="${esc(v)}"><span class="su" ${isBetter(v, g) ? '' : 'hidden'}>↑<span class="solo-lettori">meglio della volta scorsa</span></span></div>`;
      if (last) gh += `<button class="fantasma" data-copia="${i}" ${filled(g) ? '' : 'disabled'} aria-label="Copia ${esc(g || 'vuoto')}">${filled(g) ? esc(g) : '–'}</button>`;
    }
    if (conCarico) {
      const g = last?.e.load;
      lab += `<label class="lab" for="l-${esc(it.id)}">Carico</label>`;
      box += `<div class="cas"><input class="casella carico" id="l-${esc(it.id)}" data-f="load" autocomplete="off" placeholder=" " value="${esc(e?.load ?? '')}"></div>`;
      if (last) gh += `<button class="fantasma carico" data-copia="load" ${filled(g) ? '' : 'disabled'} aria-label="Copia ${esc(g || 'vuoto')}">${filled(g) ? esc(g) : '–'}</button>`;
    }
    h += `<div class="griglia" style="grid-template-columns:${cols}">${lab}${box}${gh}</div>`;
    if (!inGruppo) h += last
      ? `<div class="spiega">In grigio: ${esc(dataLunga(last.s.date).split(' ')[0].toLowerCase() + ' ' + dataBreve(last.s.date).slice(-5))}${last.e.name && last.e.name !== it.name ? ` (${esc(last.e.name)})` : ''}. Tocca un valore grigio per copiarlo.</div>`
      : '<div class="spiega">Nessun dato precedente.</div>';
  }
  // nel superset nota, istruzioni e "salta" stanno in una riga sola, così la coppia entra nello schermo
  let x = '';
  if (!e?.skip) {
    if (last && filled(last.e.note)) x += `<div class="riquadro-fantasma"><b>NOTA DEL ${esc(dataBreve(last.s.date).slice(-5))}</b>${esc(last.e.note)}</div>`;
    x += `<div class="campo"><label for="n-${esc(it.id)}">La tua nota</label>${btnVoce('n-' + it.id)}<textarea id="n-${esc(it.id)}" data-f="note" rows="2">${esc(e?.note ?? '')}</textarea></div>`;
  }
  if (filled(it.how)) x += `<details class="istruzioni"><summary>Istruzioni</summary><p>${esc(it.how)}</p></details>`;
  x += '<div class="salta-azioni">' + (e?.skip ? '' : `<button class="btn contorno" data-salta-serie ${serieDaSaltare(n, sets) ? '' : 'hidden'}>Salta le serie vuote</button>`);
  x += `<button class="btn contorno" data-salta>${e?.skip ? 'Annulla “saltato”' : 'Segna come saltato'}</button></div>`;
  h += inGruppo ? `<details class="altro" data-altro="${esc(it.id)}" ${altri.has(it.id) || filled(e?.note) ? 'open' : ''}><summary>Nota e istruzioni${filled(e?.note) ? ' · nota scritta' : ''}</summary>${x}</details>` : x;
  return h + '</article>';
}

// Programma archiviato: gli id di P1 sono riusati, quindi solo l'elenco di ciò che è registrato.
function solaLettura(s) {
  let h = '<p class="secondario">Seduta di un programma archiviato: sola lettura.</p>';
  for (const [, e] of Object.entries(s.entries || {}).sort((a, b) => numerico(a[0], b[0]))) {
    if (!e || !((e.sets || []).some(filled) || filled(e.load) || filled(e.note) || e.skip)) continue;
    h += `<article class="card"><h2>${esc(e.name)}</h2>${e.skip ? '<p class="secondario">Saltato</p>' : ''}
      ${(e.sets || []).some(filled) ? `<div class="quadrati">${e.sets.filter(filled).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      ${filled(e.load) ? `<div class="secondario">${esc(e.load)}</div>` : ''}${filled(e.note) ? `<div class="riquadro-fantasma">${esc(e.note)}</div>` : ''}</article>`;
  }
  return h + (filled(s.note) ? `<div class="riquadro-fantasma"><b>NOTA SULLA SEDUTA</b>${esc(s.note)}</div>` : '');
}

/* ---------- vista ---------- */
export function render(el, state, actions) {
  const d = state.data, { date, day } = state.params;
  if (!d || !date) return;
  fermaDett(false); // il ridisegno distrugge il riquadro "Ti ascolto": il testo già ricevuto si tiene
  if (!cur || cur.date !== date || cur.day !== day) {
    const P = d.program.current, s0 = d.sessions[date + '_' + day];
    cur = { date, day, block: s0 ? s0.block : d.currentProgram, week: s0 ? s0.week : weekOf(P.start, date) };
    openId = null; altri.clear();
  }
  const s = d.sessions[sessionKey(cur)], now = Date.now();
  const P = programOf(d, cur.block), D = P?.days?.[day];
  const corrente = cur.block === d.currentProgram;
  const aperta = corrente && !s?.skipped && (!s || isOpen(s, now)); // bozza o in corso
  const entries = s?.entries || {};
  const items = corrente && D && !s?.skipped ? D.items : [];
  const fatti = items.filter(it => isDone(it, entries[it.id])).length;
  const w = corrente ? weekOf(P.start, date) : s?.week;
  if (openId == null || (openId && !items.some(it => it.id === openId))) openId = items.find(it => !isDone(it, entries[it.id]))?.id;

  let h = `<header class="testa"><div class="testa-riga"><span class="lettera${aperta ? ' primaria' : ''}">${esc(day)}</span>
    <span class="t"><strong>${esc(D?.sub || 'Giorno ' + day)}</strong><span>${esc(dataLunga(date))}${w ? ' · settimana ' + esc(w) : ''}</span></span>
    <span class="etichetta-stato ${aperta ? 'in-corso' : ''}">${s?.skipped ? 'SALTATA' : aperta ? 'IN CORSO' : 'CONCLUSA'}</span></div>
    ${items.length ? `<div class="avanza"><div class="barra"><div style="width:${Math.round(fatti / items.length * 100)}%"></div></div><span id="avanza-n">${fatti} di ${items.length} fatti</span></div>` : ''}</header>`;

  if (!corrente) h += s ? solaLettura(s) : '';
  else if (s?.skipped) h += '<p class="secondario">Hai segnato questa seduta come saltata.</p>';
  else {
    const all = Object.values(d.sessions);
    h += lista('Riscaldamento', P.warmup);
    let prevBlock = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const grp = it.group ? items.filter(x => x.group === it.group) : [it];
      if (grp[0] !== it) continue; // il gruppo si disegna dal primo
      if (it.block !== prevBlock) h += `<div class="sez">${esc(it.block)}</div>`;
      prevBlock = grp[grp.length - 1].block;
      const pezzi = grp.map(x => {
        const e = entries[x.id], last = lastFor(all, x, date);
        return grp.some(y => y.id === openId) ? cardAperta(x, e, last, !!it.group) : rigaChiusa(x, e, last);
      }).join('');
      if (it.group) {
        const rest = grp.find(x => filled(x.rest))?.rest;
        h += `<div class="gruppo"><div class="gruppo-testa"><span>Uno dopo l'altro, senza pausa</span>${rest ? `<span class="chip ambra">Recupero <b>${esc(rest)}</b> a coppia</span>` : ''}</div>${pezzi}</div>`;
      } else h += pezzi;
    }
    h += lista('Defaticamento', P.cooldown);
  }
  if (corrente) {
    h += `<div class="campo fine"><label for="nota-seduta">Nota sulla seduta</label>${btnVoce('nota-seduta')}<textarea id="nota-seduta" rows="2">${esc(s?.note ?? '')}</textarea></div>`;
    if (aperta && !s?.skipped) h += '<button class="btn largo termina" data-termina>Termina seduta</button>';
  }
  h += `<div class="salv" id="seduta-salv" role="status">${salvHtml()}</div>`;
  el.innerHTML = h;

  wantLock = aperta; if (aperta) wake(); else rilascia();

  // Nei gestori si legge state.data al momento: reload() può averlo sostituito mentre si scriveva (il ridisegno aspetta il blur).
  const sess = () => state.data.sessions[sessionKey(cur)];
  const item = id => items.find(x => x.id === id);
  const save = (fields, nowIso = new Date().toISOString()) => {
    const s = sess(), p = { date: cur.date, day: cur.day, block: cur.block, editedAt: nowIso, ...fields };
    if (!s) p.week = cur.week; // la prima scrittura crea la seduta
    else if (needsAutoClose(s, Date.parse(nowIso))) p.endedAt = s.updatedAt; // chiusa alla prima modifica dopo 4 ore
    actions.queue(p);
  };
  const saveEntry = (it, f) => save({ entries: { [it.id]: { name: it.name, fam: it.fam, ...f } } });
  const progress = () => {
    const ents = sess()?.entries || {}, n = items.filter(it => isDone(it, ents[it.id])).length;
    const x = el.querySelector('#avanza-n'); if (x) x.textContent = `${n} di ${items.length} fatti`;
    const b = el.querySelector('.barra > div'); if (b) b.style.width = Math.round(n / items.length * 100) + '%';
  };
  const setBox = (card, it, i, v) => {
    const e = sess()?.entries?.[it.id] || {};
    const sets = [...(e.sets || [])];
    while (sets.length < (it.n || 1)) sets.push('');
    sets[i] = v;
    const f = { sets };
    if (!filled(e.load) && filled(it.load) && it.load !== '–') { // carico del programma alla prima serie scritta
      f.load = it.load;
      const l = card.querySelector('[data-f="load"]'); if (l) l.value = it.load;
    }
    saveEntry(it, f);
    const last = lastFor(Object.values(state.data.sessions), it, cur.date);
    card.querySelectorAll('.su')[i].hidden = !isBetter(v, last?.e.sets?.[i]);
    const ss = card.querySelector('[data-salta-serie]'); if (ss) ss.hidden = !serieDaSaltare(it.n || 1, sets);
    progress();
  };

  // Dettatura: il testo si aggiunge alla nota e si salva col normale evento 'input' (stessa strada della tastiera).
  const slot = id => el.querySelector(`[data-voce-per="${id}"]`);
  const tastiera = (id, motivo) => {
    const x = slot(id); if (x) x.innerHTML = `<p class="voce-motivo" role="status">${esc(motivo)}</p>`;
    document.getElementById(id)?.focus();
  };
  const MOTIVI = { 'not-allowed': 'Il microfono non è permesso: scrivi con la tastiera.', 'service-not-allowed': 'Il microfono non è permesso: scrivi con la tastiera.',
    network: 'Senza rete il riconoscimento non funziona: scrivi con la tastiera.', 'no-speech': 'Non ho sentito niente: scrivi con la tastiera.' };
  const aggiungi = (id, testo) => {
    const ta = document.getElementById(id);
    if (ta) { ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + testo : testo; ta.dispatchEvent(new Event('input', { bubbles: true })); return }
    // la vista è stata ridisegnata durante l'ascolto: si parte dalla nota salvata
    const s = sess(), cur0 = id === 'nota-seduta' ? s?.note : s?.entries?.[id.slice(2)]?.note, nota = filled(cur0) ? cur0 + '\n' + testo : testo, it = item(id.slice(2));
    if (id === 'nota-seduta') save({ note: nota }); else if (it) saveEntry(it, { note: nota });
  };
  const detta = id => {
    const fine = () => { const x = slot(id); if (x) x.innerHTML = '' };
    const mia = { h: null, key: sessionKey(cur), scarta: false, fine };
    const h = startDictation({
      onPartial: t => { if (mia.scarta) return; const x = slot(id)?.querySelector('.voce-testo'); if (x) x.textContent = t || '…' },
      onFinal: t => { if (dett === mia) dett = null; if (mia.scarta || sessionKey(cur) !== mia.key) return; fine(); aggiungi(id, t) }, // altra seduta: niente si scrive
      onError: r => mia.scarta || tastiera(id, MOTIVI[r] || 'Il riconoscimento vocale non è andato: scrivi con la tastiera.'),
    });
    if (!h) return tastiera(id, 'Qui il riconoscimento vocale non c’è: scrivi con la tastiera.');
    mia.h = h; dett = mia;
    slot(id).innerHTML = `<div class="ascolto"><div class="ascolto-testa"><span class="punto"></span>Ti ascolto…</div><div class="voce-testo" aria-live="polite">…</div><button class="btn fine-voce" data-fine-voce>Fine</button></div>`;
    slot(id).querySelector('[data-fine-voce]').onclick = () => h.stop();
  };

  el.oninput = ev => {
    const t = ev.target, card = t.closest('[data-id]'), it = card && item(card.dataset.id);
    if (t.id === 'nota-seduta') return save({ note: t.value });
    if (!it) return;
    if (t.dataset.i != null) setBox(card, it, +t.dataset.i, t.value);
    else if (t.dataset.f) saveEntry(it, { [t.dataset.f]: t.value });
  };
  el.onclick = ev => {
    const sm = ev.target.closest('.altro > summary');
    if (sm) { const id = sm.parentElement.dataset.altro; if (sm.parentElement.open) altri.delete(id); else altri.add(id); return } // il click precede l'apertura
    const b = ev.target.closest('button');
    if (!b) return;
    const card = b.closest('[data-id]'), it = card && item(card.dataset.id);
    if (b.dataset.apri) {
      openId = b.dataset.apri;
      render(el, state, actions);
      const a = el.querySelector('.aperta'); (a?.closest('.gruppo') || a)?.scrollIntoView({ block: 'start' });
    } else if (b.hasAttribute('data-chiudi')) {
      openId = '';
      render(el, state, actions);
      el.querySelector(`[data-apri="${CSS.escape(card.dataset.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (b.dataset.copia != null && it) {
      const last = lastFor(Object.values(state.data.sessions), it, cur.date);
      if (b.dataset.copia === 'load') {
        card.querySelector('[data-f="load"]').value = last.e.load;
        saveEntry(it, { load: last.e.load });
      } else {
        const i = +b.dataset.copia, v = last.e.sets[i];
        card.querySelector(`[data-i="${i}"]`).value = v;
        setBox(card, it, i, v);
      }
    } else if (b.hasAttribute('data-salta') && it) {
      const skip = !sess()?.entries?.[it.id]?.skip;
      saveEntry(it, { skip });
      if (skip) openId = null; // si passa al primo da fare
      render(el, state, actions);
    } else if (b.hasAttribute('data-salta-serie') && it) {
      // serie non fatte: '–' (testo, niente numero in set_values); si annulla cancellando la casella
      saveEntry(it, { sets: prime(it.n || 1, sess()?.entries?.[it.id]?.sets).map(v => filled(v) ? v : SALTATA) });
      openId = null;
      render(el, state, actions);
    } else if (b.hasAttribute('data-termina')) {
      if (sess()) { const ora = new Date().toISOString(); save({ endedAt: ora }, ora) }
      actions.show('allenamento');
    } else if (b.dataset.detta) detta(b.dataset.detta);
    else if (b.hasAttribute('data-riprova')) actions.reload();
  };
}
