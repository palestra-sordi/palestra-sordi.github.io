// Dati dell'app: client Supabase, caricamento con copia sul telefono, coda dei salvataggi.
import { applyPatch, hasProgram } from './logica.js';
import { createQueue } from './coda.js';

const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const sb = supabase.createClient(
  LOCAL ? 'http://127.0.0.1:54321' : 'https://nxktfkoqfqdkvfmvqgwh.supabase.co',
  LOCAL ? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' : 'sb_publishable_WO6kozZYJ_vGeOl9tD2-tA_jXWhOGBj'
);

export const DKEY = 'palestra.dati'; // ultimo export_json riuscito
const read = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} };

let data = null;
const listeners = [];
export const onStatus = fn => { listeners.push(fn) };
const status = (t, err = false) => listeners.forEach(f => f(t, err));

const q = createQueue({
  send: p => sb.rpc('save_session', { s: p }).then(r => r.error),
  storage: localStorage, key: 'palestra.coda', status,
  onSaved: () => { if (data) write(DKEY, { ...data, offline: undefined }) }, // la copia include ciò che è appena arrivato
});
const withPatches = d => { for (const p of Object.values(q.pending())) applyPatch(d, p); return d }; // ciò che non è arrivato vince

// Copia sul telefono, per aprire subito: load() la sostituisce appena risponde il server.
export function cached() {
  if (!data) { const d = read(DKEY); if (hasProgram(d)) data = withPatches(d) }
  return data;
}

const TIMEOUT = 8000;
// Un errore senza codice viene da fetch (o dal tempo scaduto): niente rete.
export async function load() {
  const gen = q.saved();
  const r = await Promise.race([
    sb.rpc('export_json'),
    new Promise(ok => setTimeout(ok, TIMEOUT, { error: { message: 'tempo scaduto', code: '' } })),
  ]);
  if (r.error) {
    if (r.error.code) throw new Error(r.error.message);
    if (data) { // già in memoria: è la copia più fresca
      if (!data.offline) status('Senza rete: vedi i dati dell’ultima apertura');
      data.offline = true;
    } else {
      const d = read(DKEY);
      if (!hasProgram(d)) throw new Error('Senza rete, e sul telefono non ci sono ancora dati');
      data = withPatches(d);
      data.offline = true;
      status('Senza rete: vedi i dati dell’ultima apertura');
    }
  } else if (data && q.saved() !== gen) {
    // La risposta è partita prima di un salvataggio riuscito e può non contenerlo: si tiene quella in memoria.
  } else if (!hasProgram(r.data)) {
    throw new Error(r.data?.program?.current
      ? 'il database va aggiornato prima di usare questa versione dell’app'
      : 'nessun dato: accesso incompleto, esci e rientra');
  } else {
    write(DKEY, r.data);
    data = withPatches(r.data);
    status('');
  }
  q.flush(true);
  return data;
}

export function queue(patch) {
  if (data) applyPatch(data, patch);
  if (!q.put(patch)) status('Memoria del telefono piena: questa modifica resta solo finché l’app è aperta.', true);
}

export async function insertRow(table, row, onConflict) {
  const t = sb.from(table);
  const { error } = await (onConflict ? t.upsert(row, { onConflict }) : t.insert(row));
  if (error) throw new Error(error.message);
}
