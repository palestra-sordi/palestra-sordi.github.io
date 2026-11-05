// Logica pura dell'app: nessun DOM, nessuna rete. Rispecchia le regole SQL (set_values, load_kg).

const NUM = /^\s*[0-9]+([.,][0-9]+)?\s*(s|sec)?\s*$/;
export const AUTO_CLOSE_MS = 4 * 3600 * 1000;
const DAYS = ['A', 'B', 'C'];

// bodyWeights esiste solo dopo la migrazione: con lo schema vecchio l'app non deve salvare.
// Un export senza programma in corso (RLS che nega tutto: secondo fattore mancante) non è un dato da tenere né da mostrare.
export const hasProgram = d => !!d?.program?.current && Array.isArray(d.bodyWeights);

export function num(raw) {
  raw = String(raw ?? '');
  if (!NUM.test(raw)) return null;
  return Number(raw.match(/[0-9]+(?:[.,][0-9]+)?/)[0].replace(',', '.'));
}

// Stessa regola di public.load_kg
export function loadKg(s) {
  if (s == null || s.trim() === '') return null;
  if (/^\s*zavorra\s+0/i.test(s)) return 0;
  let m = s.match(/([0-9]+)\s*[×xX]\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/);
  if (m) return Number(m[1]) * Number(m[2].replace(',', '.'));
  m = s.match(/([+-]?[0-9]+(?:[.,][0-9]+)?)\s*kg/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const dayMs = iso => Date.parse(iso + 'T12:00:00Z');

export function weekOf(start, date) {
  const d = Math.round((dayMs(date) - dayMs(start)) / 86400000);
  return d < 0 ? null : Math.floor(d / 7) + 1;
}

export const sessionKey = s => `${s.date}_${s.day}`;

const byTime = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || '') < (b.createdAt || '') ? -1 : (a.createdAt || '') > (b.createdAt || '') ? 1 : 0;

export function nextDay(sessions, programId) {
  const l = sessions.filter(s => s.block === programId).sort(byTime);
  if (!l.length) return 'A';
  return DAYS[(DAYS.indexOf(l[l.length - 1].day) + 1) % 3];
}

const age = (s, now) => now - new Date(s.updatedAt);
export const isOpen = (s, now) => !s.skipped && !s.endedAt && age(s, now) < AUTO_CLOSE_MS;
export const needsAutoClose = (s, now) => !s.skipped && !s.endedAt && age(s, now) >= AUTO_CLOSE_MS;

export function openSession(sessions, programId, now) {
  const l = sessions.filter(s => s.block === programId && isOpen(s, now)).sort(byTime);
  return l.length ? l[l.length - 1] : null;
}

const filled = x => String(x).trim() !== '';
const hasData = e => !!e && ((e.sets || []).some(filled) || (e.load && filled(e.load)) || (e.note && filled(e.note)));

// P1: gli id sono riusati; fa fede la fam (fallback), come in app.js
export function lastFor(sessions, item, beforeDate) {
  let fallback = null;
  for (const s of [...sessions].sort(byTime).reverse()) {
    if (s.date >= beforeDate || s.skipped || !s.entries) continue;
    const e = s.entries[item.id];
    if (e && !e.skip && hasData(e)) return { s, e };
    if (!fallback) {
      const f = Object.values(s.entries).find(x => x && x.fam === item.fam && !x.skip && hasData(x));
      if (f) fallback = { s, e: f };
    }
  }
  return fallback;
}

// ponytail: "fatta" = le prime n caselle tutte scritte (n assente = 1)
export function isDone(item, e) {
  if (!e) return false;
  if (e.skip) return true;
  const n = item.n || 1, sets = e.sets || [];
  return sets.length >= n && sets.slice(0, n).every(filled);
}

export function isBetter(raw, ghost) {
  const a = num(raw), b = num(ghost);
  return a != null && b != null && a > b;
}

// b vince campo per campo; mai null introdotti (save_session: sets null = svuota)
export function mergePatch(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    if (k === 'entries') {
      out.entries = { ...(out.entries || {}) };
      for (const [id, ev] of Object.entries(v)) {
        const m = { ...(out.entries[id] || {}) };
        for (const [f, x] of Object.entries(ev)) if (x !== undefined) m[f] = x;
        out.entries[id] = m;
      }
    } else out[k] = v;
  }
  return out;
}

// Applica un patch di save_session ai dati locali come farà il server: updatedAt = editedAt, e una seduta nuova
// nasce con createdAt = editedAt (così nextDay e isOpen valgono già prima della risposta).
export function applyPatch(data, p) {
  const k = sessionKey(p), { editedAt, ...rest } = p;
  const s = mergePatch(data.sessions[k] || { createdAt: editedAt, entries: {} }, rest);
  if (editedAt) s.updatedAt = editedAt;
  data.sessions[k] = s;
}

export function testValue(item, e) {
  let sets = e.sets || [];
  if (item.labels) sets = sets.slice(0, 1);
  const v = sets.map(num).filter(x => x != null);
  return v.length ? Math.max(...v) : null;
}

export function famSeries(sessions, fam, curDay) {
  const out = [];
  for (const s of [...sessions].sort(byTime)) {
    if (s.skipped || !s.entries) continue;
    const e = Object.values(s.entries).find(x => x && x.fam === fam && !x.skip && hasData(x));
    if (!e) continue;
    const sets = e.sets || [];
    out.push({
      date: s.date, day: s.day, block: s.block, load: e.load, kg: loadKg(e.load),
      total: sets.reduce((t, x) => t + (num(x) ?? 0), 0), sets, note: e.note, same: s.day === curDay,
    });
  }
  return out;
}

export function weeks(sessions, programs) {
  const groups = new Map();
  for (const s of [...sessions].sort(byTime).reverse()) {
    const st = programs[s.block]?.start;
    const week = st ? weekOf(st, s.date) : s.week;
    const k = `${s.block}|${week}`;
    if (!groups.has(k)) groups.set(k, { program: s.block, week, from: s.date, to: s.date, days: { A: null, B: null, C: null }, sessions: [] });
    const g = groups.get(k);
    g.from = s.date; // si scorre dal più recente: l'ultimo visto è il più vecchio
    g.sessions.push(s);
    g.days[s.day] = s.skipped ? 'sk' : 'ok';
  }
  return [...groups.values()];
}

export function stats(sessions) {
  const skipped = sessions.filter(s => s.skipped).length, done = sessions.length - skipped;
  return { done, skipped, pct: sessions.length ? Math.round(done / sessions.length * 100) : 0 };
}

// Il programma di una seduta: quello in corso o uno archiviato (chiave dell'export in minuscolo, es. p1)
export const programOf = (data, block) => block === data.currentProgram ? data.program.current : data.program[String(block).toLowerCase()];

// Sedute fatte per settimana di calendario (lunedì-domenica), dalla prima seduta alla settimana di `oggi` (ultime `max`).
// Le settimane senza sedute valgono 0; l'ultima è sempre quella corrente.
export function settimaneCalendario(sessions, oggi, max = 12) {
  const lun = iso => { const d = new Date(iso + 'T12:00:00Z'); return Math.floor(dayMs(iso) / 86400000) - ((d.getUTCDay() + 6) % 7) };
  const dates = sessions.map(s => s.date).sort();
  if (!dates.length) return [];
  const a = Math.max(lun(dates[0]), lun(oggi) - 7 * (max - 1)), b = lun(oggi), out = [];
  for (let w = a; w <= b; w += 7) out.push({ from: new Date(w * 86400000 + 43200000).toISOString().slice(0, 10), n: 0 });
  for (const s of sessions) if (!s.skipped) { const g = out[Math.floor((lun(s.date) - a) / 7)]; if (g && lun(s.date) >= a) g.n++ }
  return out;
}

// Massimali raggruppati per nome: l'ultima misura (per data; senza data = prima di tutte) e le precedenti, dalla più recente.
export function massimaliPerNome(maxes) {
  const key = m => (m.date || '') + String(m.id).padStart(9, '0');
  const g = new Map();
  for (const m of [...maxes].sort((a, b) => a.id - b.id)) (g.get(m.name) || g.set(m.name, []).get(m.name)).push(m);
  return [...g.values()].map(l => { l.sort((a, b) => key(a) < key(b) ? 1 : -1); return { last: l[0], prev: l.slice(1) } });
}
