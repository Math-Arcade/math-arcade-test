// Screen router with slide/fade transitions and Android-style back handling.

import { $, $$ } from './util.js';
import { app } from './app.js';

const PARENT = { modes: 'home', settings: 'home', leaderboard: 'home', stats: 'home', auth: 'settings', game: 'modes', duel: 'modes' };
const DURATION = 220;

export class Router {
  constructor(store) {
    this.store = store;
    this.nodes = {};
    this.hooks = {};
    this.current = null;
    this.busy = false;
    this.guard = null; // (screen) => true if it handled "back" itself (e.g. pause a game)
    $$('section[data-screen]').forEach((n) => { this.nodes[n.dataset.screen] = n; });
    $$('[data-back]').forEach((b) => b.addEventListener('click', () => this.back()));

    // Keep one extra history entry so the hardware/gesture Back button comes to us first.
    try { history.replaceState({ base: true }, ''); history.pushState({ app: true }, ''); } catch { /* sandboxed frame */ }
    window.addEventListener('popstate', () => {
      if (this.current === 'home' || !this.current) { history.back(); return; }
      this.back();
      try { history.pushState({ app: true }, ''); } catch { /* ignore */ }
    });
  }

  register(name, hooks) { this.hooks[name] = hooks; }

  go(name, params = {}, { back = false } = {}) {
    if (name === this.current || this.busy) return Promise.resolve();
    const from = this.current && this.nodes[this.current];
    const to = this.nodes[name];
    if (!to) throw new Error(`Unknown screen: ${name}`);
    const quick = this.store.settings.reduceMotion;
    this.busy = true;
    if (this.current && app.fx) app.fx.clear();
    if (this.current) this.hooks[this.current]?.leave?.();

    to.hidden = false;
    to.dataset.state = back ? 'enter-back' : 'enter';
    void to.offsetWidth;
    this.hooks[name]?.enter?.(params);
    to.dataset.state = 'active';
    if (from) from.dataset.state = back ? 'leave-back' : 'leave';
    const prev = this.current;
    this.current = name;
    document.body.dataset.view = name;

    return new Promise((resolve) => {
      setTimeout(() => {
        if (from) { from.hidden = true; from.dataset.state = ''; }
        this.busy = false;
        resolve(prev);
      }, quick ? 0 : DURATION);
    });
  }

  back() {
    if (this.guard && this.guard(this.current)) return;
    const parent = PARENT[this.current];
    if (parent) this.go(parent, {}, { back: true });
  }
}

// ---- dialogs & sheets -----------------------------------------------------------------

export function openSheet(sheet) {
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
  const first = sheet.querySelector('.btn-primary, .btn, input');
  setTimeout(() => first && first.focus({ preventScroll: true }), 60);
}

export function closeSheet(sheet) {
  sheet.classList.remove('open');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 200);
}

// Promise-based confirm dialog. With `onConfirm` (async) the dialog stays open and shows the thrown
// message until the action succeeds, so a wrong password can simply be retyped.
export function confirmDialog({ title, text, ok = 'OK', cancel = 'CANCEL', danger = false, password = false, onConfirm = null }) {
  const d = $('#dlg');
  $('#dlg-t').textContent = title;
  $('#dlg-p').textContent = text;
  const field = $('#dlg-f'), input = $('#dlg-in'), err = $('#dlg-err');
  field.hidden = !password; input.value = ''; err.textContent = '';
  const okBtn = $('#dlg-ok'), noBtn = $('#dlg-cancel');
  okBtn.textContent = ok; noBtn.textContent = cancel; okBtn.disabled = false;
  okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  openSheet(d);
  return new Promise((resolve) => {
    const close = (v) => { okBtn.onclick = noBtn.onclick = d.onkeydown = null; closeSheet(d); resolve(v); };
    noBtn.onclick = () => close({ ok: false });
    okBtn.onclick = async () => {
      if (okBtn.disabled) return;
      if (password && !input.value) { err.textContent = 'Enter your password.'; return; }
      err.textContent = '';
      if (!onConfirm) { close({ ok: true, value: input.value }); return; }
      okBtn.disabled = true;
      try { await onConfirm(input.value); close({ ok: true }); }
      catch (e) { err.textContent = (e && e.message) || 'Something went wrong.'; okBtn.disabled = false; }
    };
    d.onkeydown = (e) => { if (e.key === 'Escape') noBtn.onclick(); else if (e.key === 'Enter') okBtn.onclick(); };
  });
}
