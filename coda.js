// Coda dei salvataggi, senza DOM né rete: send, storage e timer arrivano da fuori, così si prova con node.
// Formato persistito: {data_giorno: patch}. La vecchia app salvava qui sedute intere con la stessa chiave:
// una seduta intera è già un patch valido, quindi si legge così com'è.
import { mergePatch, sessionKey } from './logica.js';

export function readQueue(storage, key) {
  let raw = null;
  try { raw = storage.getItem(key) } catch { return {} }
  if (!raw) return {};
  try { const q = JSON.parse(raw); if (q && typeof q === 'object' && !Array.isArray(q)) return q } catch {}
  try { storage.setItem(key + '.illeggibile', raw) } catch {} // non si butta: resta da recuperare a mano
  return {};
}

const ora = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

// send(patch) → Promise<errore|null>; un errore senza code è "niente rete".
export function createQueue({ send, storage, key, status, onSaved = () => {}, timer = setTimeout, untimer = clearTimeout }) {
  const coda = readQueue(storage, key);
  const failed = new Map();          // chiave → messaggio: respinte dal server in questo giro, restano in coda
  let sending = false, retry = null, delay = 0, saved = 0, didSave = false;

  const persist = () => { try { storage.setItem(key, JSON.stringify(coda)); return true } catch { return false } };
  const errText = () => 'Non salvato (' + [...failed.values()].pop() + ').';

  // Un patch alla volta. La chiave esce solo dopo la risposta positiva e solo se nel frattempo non è cambiata.
  // Un patch respinto non ferma gli altri: si salta per questo giro e riparte con fresh (ricarica, Riprova).
  function flush(fresh = false) {
    if (fresh) failed.clear();
    untimer(retry); retry = null;
    if (sending) return;
    const k = Object.keys(coda).find(x => !failed.has(x));
    if (!k) {
      if (failed.size) status(errText(), true);
      else if (didSave) status('Salvato alle ' + ora());
      didSave = false;
      return;
    }
    const p = coda[k];
    sending = true;
    if (!delay) status('Salvataggio…'); // nei tentativi senza rete non si lampeggia
    send(p).then(error => {
      sending = false;
      if (!error) {
        delay = 0; saved++; didSave = true;
        if (coda[k] === p) { delete coda[k]; persist() }
        onSaved();
        return flush();
      }
      if (!error.code) {
        delay = Math.min(30000, delay ? delay * 2 : 2000);
        status('Senza rete: i dati restano sul telefono');
        retry = timer(flush, delay);
        return;
      }
      failed.set(k, error.message);
      flush();
    });
  }

  return {
    // false = non scritto sul telefono (memoria piena): il patch resta solo in memoria
    put(p) {
      const k = sessionKey(p);
      coda[k] = mergePatch(coda[k], p);
      failed.delete(k);
      const ok = persist();
      flush();
      return ok;
    },
    flush,
    pending: () => coda,
    saved: () => saved, // quanti invii riusciti: serve a scartare un export partito prima di un salvataggio
  };
}
