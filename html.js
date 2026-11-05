// Aiuti per scrivere HTML. Testo dell'utente dentro innerHTML: sempre passato da esc (anche dentro attributi tra '…' o "…").
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => MAP[c]);

const pad = n => String(n).padStart(2, '0');
const cap = s => s[0].toUpperCase() + s.slice(1);
const at = iso => new Date(iso + 'T12:00:00');
// Data locale del telefono (Europe/Rome), YYYY-MM-DD
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// "Venerdì 30 ottobre" (titoli) e "Ven 30/10" (elenchi)
export const dataLunga = iso => cap(at(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }));
export const dataBreve = iso => { const d = at(iso); return cap(d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')) + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) };
export const plurale = (n, uno, molti) => n + ' ' + (n === 1 ? uno : molti);
