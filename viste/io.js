// Vista Io: peso, massimali, test del programma, costanza, uscita.
import { num, testValue, stats, settimaneCalendario, massimaliPerNome } from '../logica.js';
import { esc, today } from '../html.js';
import { sb } from '../dati.js';

const NO_RETE = 'Serve la rete per salvare il peso';
const dm = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const kg1 = v => String(v).replace('.', ',');
const giorni = iso => Math.floor((Date.parse(today() + 'T12:00:00Z') - Date.parse(iso + 'T12:00:00Z')) / 86400000);
const fa = n => n < 1 ? 'questa settimana' : n === 1 ? '1 settimana fa' : n + ' settimane fa';
const rete = (state, e) => state.data.offline || !navigator.onLine || /fetch|network/i.test(e?.message || '');

let wDate = null;   // data del peso che si sta scrivendo (null = oggi)
let bozzaPeso = ''; // bozza del peso: sopravvive ai ridisegni (ricarica in sottofondo), si azzera dopo il salvataggio o con Annulla

function peso(d) {
  const w = [...d.bodyWeights].sort((a, b) => a.date < b.date ? -1 : 1), last = w[w.length - 1], date = wDate || today();
  let h = '<h2 class="sez">Peso corporeo</h2><div class="card">';
  h += last ? `<div class="peso-ultimo"><b>${esc(kg1(last.kg))}</b><span>kg</span><small>${esc(dm(last.date))}${last.note ? ' · ' + esc(last.note) : ''}</small></div>`
            : '<div class="peso-ultimo"><span>Nessun peso registrato</span></div>';
  if (w.length > 1) {
    const X = 330, Y = 56, lo = Math.min(...w.map(p => p.kg)), hi = Math.max(...w.map(p => p.kg)) || 1;
    const t0 = Date.parse(w[0].date), t1 = Date.parse(last.date);
    const pt = p => `${(t1 === t0 ? X : (Date.parse(p.date) - t0) / (t1 - t0) * X) + 14},${hi === lo ? Y / 2 + 8 : 8 + (hi - p.kg) / (hi - lo) * Y}`;
    h += `<svg viewBox="0 0 358 ${Y + 16}" width="100%" role="img" aria-label="Peso da ${esc(dm(w[0].date))} a ${esc(dm(last.date))}: da ${esc(kg1(w[0].kg))} a ${esc(kg1(last.kg))} kg" style="display:block">
      <polyline points="${w.map(pt).join(' ')}" fill="none" stroke="var(--primario)" stroke-width="2.5" stroke-linejoin="round"/>
      ${w.map(p => `<circle cx="${pt(p).split(',')[0]}" cy="${pt(p).split(',')[1]}" r="3.5" fill="var(--primario)"/>`).join('')}</svg>
      <div class="peso-estremi"><span>${esc(dm(w[0].date))} · ${esc(kg1(w[0].kg))}</span><span>${esc(dm(last.date))} · ${esc(kg1(last.kg))}</span></div>`;
  } else h += '<div class="riquadro-fantasma">Il grafico compare dal secondo peso registrato</div>';
  h += `<form class="peso-form" id="io-peso" novalidate><div class="campo"><label for="io-kg">${date === today() ? 'Peso di oggi' : 'Peso del ' + esc(dm(date))}, kg</label>
    <input id="io-kg" inputmode="decimal" placeholder="80,0" autocomplete="off" value="${esc(bozzaPeso)}"></div><button class="btn primario">Salva</button></form>
    ${wDate ? '<button type="button" class="btn testo" id="io-peso-annulla">Annulla, torna al peso di oggi</button>' : ''}
    <p class="err" id="io-peso-err" role="alert"></p>`;
  if (w.length) h += '<div class="io-elenco">' + [...w].reverse().slice(0, 8).map(p =>
    `<button class="io-r" data-peso="${esc(p.date)}"><span class="t"><strong>${esc(dm(p.date))}</strong></span><span class="v">${esc(kg1(p.kg))}</span></button>`).join('') + '</div>';
  return h + '</div>';
}

const quando = m => m.date ? dm(m.date) : (m.label || 'senza data');

function massimali(d) {
  let h = '<h2 class="sez">Massimali</h2>';
  const gruppi = massimaliPerNome(d.maxes);
  if (gruppi.length) h += '<div class="io-elenco">' + gruppi.map(({ last: m }) => {
    const old = !m.date || giorni(m.date) > 84;
    const sub = m.date ? `${dm(m.date)} · ${fa(Math.floor(giorni(m.date) / 7))}` : m.label;
    return `<button class="io-r" data-max="${esc(m.name)}"><span class="t"><strong>${esc(m.name)}</strong>
      <span${old ? ' class="vecchio"' : ''}>${esc(sub)}${old ? (sub ? ' · ' : '') + 'da rifare' : ''}</span></span><span class="v">${esc(m.value)}</span></button>`;
  }).join('') + '</div>';
  return h + '<button class="btn largo" id="m-nuovo">+ Nuovo massimale</button>';
}

const again = (ev, f) => { // un solo invio alla volta: il bottone resta spento finché la richiesta non risponde
  const btn = ev.target.querySelector('button:not([type=button])'); if (btn.disabled) return; btn.disabled = true;
  return f().finally(() => { btn.disabled = false });
};

// Scheda di un massimale (g: il gruppo da massimaliPerNome) o di uno nuovo (g assente). È un <dialog> fuori da <main>:
// i ridisegni in sottofondo della vista non la toccano. Si chiude con ✕, un tocco fuori o il tasto indietro.
function scheda(state, actions, dopo, g) {
  const storico = g ? [g.last, ...g.prev] : [];
  const dlg = document.createElement('dialog');
  dlg.className = 'foglio';
  dlg.setAttribute('aria-labelledby', 'm-titolo');
  dlg.innerHTML = `<div class="foglio-dentro"><div class="foglio-testa"><div class="t">${g ? '<span class="sez-oggi">Massimale</span>' : ''}
      <h2 id="m-titolo">${g ? esc(g.last.name) : 'Nuovo massimale'}</h2></div>
      <button type="button" class="btn testo" id="m-chiudi" aria-label="Chiudi">✕</button></div>
    <form id="io-max" novalidate>
      ${g ? '' : '<div class="campo"><label for="m-name">Esercizio</label><input id="m-name" autocomplete="off" placeholder="es. Front lever tuck"></div>'}
      <div class="campo"><label for="m-value" id="m-modo">Nuova misura</label><input id="m-value" class="casella" autocomplete="off" placeholder="9 · +20 kg · 10 sec"></div>
      <div class="campo"><label for="m-date">Data (vuota se non la sai)</label><input id="m-date" type="date" value="${today()}"></div>
      <div class="campo"><label for="m-note">Nota</label><input id="m-note" autocomplete="off"></div>
      <p class="err" id="io-max-err" role="alert"></p>
      <button class="btn primario largo" id="m-salva">Salva</button></form>
    ${storico.length ? `<h3 class="sez">Misure registrate</h3><div class="io-elenco">${storico.map((x, i) =>
      `<button type="button" class="io-r" data-i="${i}"><span class="t"><strong>${esc(quando(x))}</strong>${x.note ? `<span>${esc(x.note)}</span>` : ''}</span><span class="v">${esc(x.value)}</span></button>`).join('')}</div>
      <p class="spiega">Tocca una misura per correggerla.</p>` : ''}</div>`;
  document.body.append(dlg);
  const $ = id => dlg.querySelector('#' + id);
  const nome = () => g ? g.last.name : $('m-name').value.trim();
  // Stesso nome e stessa data (o tutte e due senza data): è una correzione. Altrimenti è una misura nuova.
  const stessa = () => state.data.maxes.find(x => x.name === nome() && (x.date || null) === ($('m-date').value || null));
  const modo = () => {
    const s = stessa();
    $('m-modo').textContent = s ? `Correggi ${s.date ? 'la misura del ' + dm(s.date) : '«' + quando(s) + '»'} (era ${s.value})` : 'Nuova misura';
    $('m-salva').textContent = s ? 'Salva la correzione' : 'Salva';
    if (s && !$('m-value').value) { $('m-value').value = s.value; $('m-note').value = s.note || '' }
    for (const b of dlg.querySelectorAll('[data-i]')) b.classList.toggle('scelta-r', storico[b.dataset.i] === s);
  };
  modo();
  $('m-date').addEventListener('input', modo);
  $('m-name')?.addEventListener('input', modo);
  for (const b of dlg.querySelectorAll('[data-i]')) b.addEventListener('click', () => {
    const x = storico[b.dataset.i];
    $('m-value').value = x.value; $('m-date').value = x.date || ''; $('m-note').value = x.note || ''; modo();
    $('m-titolo').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('m-value').focus({ preventScroll: true });
  });
  $('m-chiudi').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() }); // il tocco sullo sfondo arriva al <dialog> stesso
  dlg.addEventListener('close', () => dlg.remove());
  $('io-max').addEventListener('submit', ev => { ev.preventDefault(); again(ev, async () => {
    const err = $('io-max-err'), name = nome(), value = $('m-value').value.trim(); err.textContent = '';
    if (!name || !value) { err.textContent = g ? 'Scrivi la misura.' : 'Servono l\'esercizio e la misura.'; return }
    if (state.data.offline) { err.textContent = 'Serve la rete per salvare il massimale'; return }
    const s = stessa(), date = $('m-date').value || null;
    const row = { name, value, date, label: s ? s.label : '', note: $('m-note').value.trim() };
    try {
      if (!s) await actions.insertRow('maxes', row); else { // id è GENERATED ALWAYS: l'upsert con id esplicito è rifiutato, serve un update
        const { data, error } = await sb.from('maxes').update(row).eq('id', s.id).select('id');
        if (error) throw new Error(error.message);
        if (!data.length) throw new Error('Massimale non trovato: non è stato modificato nulla.') }
      dlg.close(); await actions.reload(); dopo();
    } catch (e) { err.textContent = rete(state, e) ? 'Serve la rete per salvare il massimale' : e.message }
  }) });
  dlg.showModal();
}

function test(d) {
  const righe = [];
  const sedute = Object.values(d.sessions).filter(s => s.block === d.currentProgram && !s.skipped).sort((a, b) => a.date < b.date ? 1 : -1);
  for (const [day, g] of Object.entries(d.program.current.days || {})) for (const it of g.items || []) {
    if (!it.test) continue;
    let v = null, s = null;
    for (const x of sedute) { const e = x.entries?.[it.id]; if (e && (v = testValue(it, e)) != null) { s = x; break } }
    righe.push(`<div class="io-r"><span class="t"><strong>${esc(it.name)}</strong><span>${s ? esc(dm(s.date)) + ' · ' : ''}giorno ${esc(day)}</span></span><span class="v">${v == null ? '–' : esc(kg1(v))}</span></div>`);
  }
  return '<h2 class="sez">Test del programma</h2>' + (righe.length ? `<div class="io-elenco">${righe.join('')}</div>` : '<div class="riquadro-fantasma">Nessun test segnato nel programma in corso</div>');
}

function costanza(d) {
  const all = Object.values(d.sessions), st = stats(all);
  const gs = settimaneCalendario(all, today());
  const max = Math.max(3, ...gs.map(g => g.n)), prima = all.map(s => s.date).sort()[0];
  return `<h2 class="sez">Costanza</h2><div class="numeri"><div class="stat"><b>${st.done}</b><span>sedute fatte</span></div>
    <div class="stat"><b>${st.skipped}</b><span>saltate</span></div><div class="stat"><b>${st.pct}%</b><span>${prima ? 'dal ' + esc(dm(prima)) : ''}</span></div></div>
    <div class="card" style="margin-top:8px"><div class="secondario">Sedute per settimana</div>
    <div class="barre" role="img" aria-label="${esc(gs.map(g => g.n).join(', '))} sedute per settimana, dalla più vecchia">${gs.map((g, i) =>
      `<i style="height:${Math.max(4, g.n / max * 100)}%"${i === gs.length - 1 ? ' class="ora"' : ''}></i>`).join('')}</div>
    <div class="peso-estremi"><span>${gs.length ? esc(dm(gs[0].from)) : ''}</span><span>questa settimana</span></div></div>`;
}

export function render(el, state, actions) {
  const d = state.data;
  el.innerHTML = '<h1>Io</h1>' + peso(d) + massimali(d) + test(d) + costanza(d) +
    '<button class="btn errore largo" id="io-esci" style="margin-top:16px">Esci da questo telefono</button>';
  const $ = id => el.querySelector('#' + id);
  $('io-kg').addEventListener('input', e => { bozzaPeso = e.target.value });
  $('io-peso').addEventListener('submit', ev => { ev.preventDefault(); again(ev, async () => {
    const kg = num($('io-kg').value), err = $('io-peso-err'); err.textContent = '';
    if (kg == null || kg < 30 || kg > 250) { err.textContent = 'Scrivi il peso in kg, tra 30 e 250 (es. 80,4).'; return }
    if (state.data.offline) { err.textContent = NO_RETE; return }
    const date = wDate || today(), note = d.bodyWeights.find(b => b.date === date)?.note || '';
    try { await actions.insertRow('body_weights', { date, kg, note, updated_at: new Date().toISOString() }, 'date'); wDate = null; bozzaPeso = ''; await actions.reload(); render(el, state, actions) }
    catch (e) { $('io-peso-err').textContent = rete(state, e) ? NO_RETE : e.message }
  }) });
  $('io-peso-annulla')?.addEventListener('click', () => { wDate = null; bozzaPeso = ''; render(el, state, actions) });
  for (const b of el.querySelectorAll('[data-peso]')) b.addEventListener('click', () => {
    wDate = b.dataset.peso; bozzaPeso = kg1(d.bodyWeights.find(x => x.date === wDate).kg); render(el, state, actions); $('io-kg').focus();
  });
  const rifai = () => render(el, state, actions);
  for (const b of el.querySelectorAll('[data-max]')) b.addEventListener('click', () =>
    scheda(state, actions, rifai, massimaliPerNome(state.data.maxes).find(x => x.last.name === b.dataset.max)));
  $('m-nuovo').addEventListener('click', () => scheda(state, actions, rifai));
  // Esce solo dall'account: la coda dei salvataggi (palestra.coda) resta, il gestore di SIGNED_OUT toglie solo la copia dei dati.
  $('io-esci').addEventListener('click', async () => {
    if (!confirm('Uscire da questo telefono? Al prossimo accesso servono password e codice.')) return;
    await sb.auth.signOut();
  });
}
