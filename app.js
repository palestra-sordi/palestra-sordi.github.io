// Palestra: avvio, login (email + password + codice TOTP), router delle viste.
import { sb, load, cached, queue, onStatus, insertRow, DKEY } from './dati.js';
import { esc } from './html.js';
import { needsAutoClose } from './logica.js';
import * as allenamento from './viste/allenamento.js';
import * as seduta from './viste/seduta.js';
import * as storico from './viste/storico.js';
import * as piano from './viste/piano.js';
import * as archivio from './viste/archivio.js';
import * as io from './viste/io.js';

const VISTE = { allenamento, seduta, storico, piano, archivio, io };
const VOCE = { seduta: 'allenamento', archivio: 'piano' }; // voce della barra accesa per le viste interne

export const state = { data: null, view: null, params: {} };
const actions = { show, queue, reload, insertRow };

const $ = id => document.getElementById(id);
function setStatus(t, err) {
  $('stato').textContent = t;
  $('stato-box').classList.toggle('err', !!err);
  $('riprova-stato').hidden = !err;
}
onStatus(setStatus);
$('riprova-stato').addEventListener('click', () => start());

/* ---------- viste ---------- */
// Le viste interne (seduta, archivio) hanno una voce di cronologia: "indietro" di Android torna alla scheda
// invece di chiudere l'app. Uscendo in altro modo la voce si toglie, così "indietro" non resta a vuoto.
let sub = false, skipPop = false, from = null; // from = scheda da cui si è aperta la vista interna
window.addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return }
  if (sub) { sub = false; show(from || VOCE[state.view]) }
});
export function show(view, params = {}) {
  if (state.view !== view) VISTE[state.view]?.leave?.();
  if (VOCE[view] && !sub) { history.pushState(null, ''); sub = true; from = state.view && !VOCE[state.view] && VISTE[state.view] ? state.view : null }
  else if (!VOCE[view] && sub) { sub = false; skipPop = true; history.back() }
  state.view = view; state.params = params;
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== view;
  $('nav').hidden = view === 'login';
  const voce = VOCE[view] ? from || VOCE[view] : view;
  for (const b of $('nav').querySelectorAll('button')) {
    if (b.dataset.vista === voce) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (VISTE[view]) VISTE[view].render($(view), state, actions);
  window.scrollTo(0, 0);
}
for (const b of $('nav').querySelectorAll('button')) b.addEventListener('click', () => show(b.dataset.vista));

// Non si ridisegna sotto le dita: se si sta scrivendo nella vista, si aspetta che il campo perda il fuoco.
let pending = false;
function rerender() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('main > section') && !a.closest('#login')) { pending = true; return }
  pending = false;
  if (VISTE[state.view]) VISTE[state.view].render($(state.view), state, actions);
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending) rerender() }, 50));

// Senza rete si riprova ogni 15 s: l'evento "online" può arrivare prima che la rete funzioni davvero.
let again = null;
async function reload() {
  clearTimeout(again);
  const was = state.data;
  try { state.data = await load() } catch (e) { setStatus('Dati non caricati (' + (e.message || e) + ').', true); return }
  if (state.data.offline) again = setTimeout(reload, 15000);
  const closed = autoClose();
  if (!state.view || state.view === 'login') show('allenamento'); else if (state.data !== was || closed) rerender();
}

// Le sedute del programma in corso ferme da 4 ore si chiudono davvero, la prima volta che l'app le vede:
// ended_at = ultima modifica, e editedAt uguale perché la chiusura non sposta l'ora.
function autoClose() {
  const d = state.data, now = Date.now();
  let n = 0;
  for (const s of Object.values(d.sessions)) {
    if (s.block === d.currentProgram && needsAutoClose(s, now)) {
      queue({ date: s.date, day: s.day, block: s.block, editedAt: s.updatedAt, endedAt: s.updatedAt });
      n++;
    }
  }
  return n > 0;
}

/* ---------- login: password, poi codice TOTP (o la prima configurazione) ---------- */
async function boot() {
  const r = await sb.auth.getSession();
  if (!r.data.session) {
    // Token scaduto e niente rete: la sessione resta sul telefono, si apre coi dati salvati.
    if (supabase.isAuthRetryableFetchError(r.error) && localStorage.getItem(DKEY)) return reload();
    if (r.error || !navigator.onLine) return state.data ? undefined : noNetwork(); // già aperta dalla copia: resta usabile
    return loginPassword();
  }
  const a = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (a.error) return loginPassword(a.error.message);
  if (a.data.currentLevel === 'aal2') return reload();
  if (!navigator.onLine) return state.data ? undefined : noNetwork();
  if (a.data.nextLevel === 'aal2') return loginCode();
  return enrollTotp();
}
function noNetwork() {
  show('login'); setStatus('');
  $('login').innerHTML = '<h1>Senza rete</h1><p>Per entrare serve la connessione. Riprova quando torna.</p>' +
    '<button class="btn primario largo" id="riprova">Riprova</button>';
  $('riprova').addEventListener('click', () => start());
}
function loginForm(title, text, fields, button, onSubmit, err) {
  show('login'); setStatus('');
  const v = $('login');
  v.innerHTML = '<h1>' + esc(title) + '</h1><p>' + text + '</p><form id="lf" novalidate>' + fields +
    '<p class="err" id="lerr" role="alert">' + esc(err || '') + '</p><button class="btn primario grande largo">' + esc(button) + '</button></form>';
  const f = $('lf'), first = f.querySelector('input'); if (first) first.focus();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = f.querySelector('button'); b.disabled = true; $('lerr').textContent = '';
    try { const msg = await onSubmit(f); if (msg) { $('lerr').textContent = msg; b.disabled = false } }
    catch (e) { $('lerr').textContent = e.message || String(e); b.disabled = false }
  });
}
const CODE_FIELD = '<div class="campo"><label for="l-code">Codice a 6 cifre</label><input id="l-code" class="codice" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>';
function loginPassword(err) {
  loginForm('Accedi', 'Solo il proprietario può entrare.',
    '<div class="campo"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="username" required></div>' +
    '<div class="campo"><label for="l-pw">Password</label><input id="l-pw" type="password" autocomplete="current-password" required></div>',
    'Entra', async () => {
      const r = await sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-pw').value });
      if (supabase.isAuthRetryableFetchError(r.error)) return 'Senza rete: per entrare serve la connessione.';
      if (r.error) return r.error.status === 400 ? 'Email o password errate.' : r.error.message;
      boot();
    }, err);
}
async function verifyCode(factorId) {
  const r = await sb.auth.mfa.challengeAndVerify({ factorId, code: $('l-code').value.trim() });
  if (r.error) return 'Codice non valido. Riprova con quello nuovo.';
  boot();
}
async function loginCode() {
  const f = await sb.auth.mfa.listFactors();
  if (f.error) return loginPassword(f.error.message);
  const t = f.data.totp[0];
  loginForm('Codice di verifica', 'Apri l’app di autenticazione e scrivi il codice di Palestra.', CODE_FIELD, 'Verifica', () => verifyCode(t.id));
}
async function enrollTotp() {
  const f = await sb.auth.mfa.listFactors();
  if (f.error) return loginPassword(f.error.message);
  for (const x of f.data.all) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id });
  const r = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Palestra' });
  if (r.error) return loginPassword(r.error.message);
  loginForm('Secondo fattore', 'Prima volta: inquadra il codice QR con un’app di autenticazione (Google Authenticator, 1Password, Aegis…), poi scrivi il codice che ti mostra. Se sei sul telefono stesso, copia la chiave a mano.',
    '<img alt="Codice QR per l’app di autenticazione" src="' + esc(r.data.totp.qr_code) + '"><code>' + esc(r.data.totp.secret) + '</code>' + CODE_FIELD,
    'Attiva', () => verifyCode(r.data.id));
}

/* ---------- avvio ---------- */
// Riaprendo l'app (anche dopo una modifica di Claude) i dati si ricaricano; idem quando torna la rete.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.data) reload() });
window.addEventListener('online', () => { if (state.data) reload() });
sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') { localStorage.removeItem(DKEY); location.reload() } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
// Con una sessione salvata e la copia dei dati si apre subito; login e caricamento proseguono dietro.
// Se poi online il login non vale più, boot() porta al login.
function start() {
  let stored = null;
  try { stored = localStorage.getItem(sb.auth.storageKey) } catch {}
  if (!state.data && stored && (state.data = cached())) { autoClose(); show('allenamento') }
  boot().catch(e => setStatus('Errore: ' + (e.message || e) + '.', true));
}
start();
