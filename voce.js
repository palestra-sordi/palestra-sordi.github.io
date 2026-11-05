// Dettatura: l'API del browser, niente di più. Una sola istanza attiva; null se l'API manca (iPhone, Firefox).
let attiva = null;
export function startDictation({ onPartial, onFinal, onError }) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return null;
  attiva?.stop(); // il testo della precedente arriva dal suo onend
  const r = new R();
  r.lang = 'it-IT'; r.interimResults = true; r.continuous = false;
  let fin = '', ultimo = '', errore = false;
  r.onresult = ev => {
    const fs = [];
    let p = '';
    for (const x of Array.from(ev.results)) {
      const t = x[0].transcript.trim();
      if (!x.isFinal) p += x[0].transcript;
      else if (t && t !== fs[fs.length - 1]) fs.push(t); // Chrome Android a volte ripete il finale
    }
    fin = fs.join(' ');
    ultimo = [fin, p.trim()].filter(Boolean).join(' ');
    onPartial(ultimo);
  };
  r.onerror = ev => { errore = true; onError(ev.error || 'errore') };
  r.onend = () => { if (attiva === h) attiva = null; if (errore) return; const t = fin || ultimo; if (t) onFinal(t); else onError('no-speech') }; // "Fine" con solo il testo intermedio: si tiene quello
  const h = { stop: () => { try { r.stop() } catch {} } };
  attiva = h;
  try { r.start() } catch { attiva = null; return null }
  return h;
}
