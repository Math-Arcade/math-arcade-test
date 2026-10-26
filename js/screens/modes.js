import { app } from '../app.js';
import { $, h, fmt } from '../util.js';
import { MODES, MODE_NAME, MODE_SIGN } from '../config.js';

export function buildOpChips(container, current, onPick) {
  container.textContent = '';
  MODES.forEach((m) => {
    const b = h('button', `cbtn${m === 'mix' ? '' : ' sign'}`, MODE_SIGN[m]);
    b.type = 'button';
    b.dataset.op = m;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', MODE_NAME[m]);
    b.setAttribute('aria-checked', String(m === current));
    b.onclick = () => onPick(m);
    container.append(b);
  });
}

export function setChecked(container, attr, value) {
  container.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute(attr) === String(value))));
}

export function initModes() {
  const { store, router } = app;
  const ops = $('#m-ops'), targets = $('#m-targets');

  buildOpChips(ops, store.settings.op, (m) => { store.set('op', m); render(); });

  [5, 10, 15, 20].forEach((n) => {
    const b = h('button', 'cbtn', String(n));
    b.type = 'button'; b.dataset.n = n; b.setAttribute('role', 'radio');
    b.onclick = () => { store.set('duelTarget', n); render(); };
    targets.append(b);
  });

  $('#m-blitz').onclick = () => router.go('game', { kind: 'blitz', mode: store.settings.op });
  $('#m-zen').onclick = () => router.go('game', { kind: 'zen', mode: store.settings.op });
  $('#m-duel').onclick = () => router.go('duel');

  function render() {
    const op = store.settings.op, p = store.profile;
    setChecked(ops, 'data-op', op);
    setChecked(targets, 'data-n', store.settings.duelTarget);
    $('#m-blitz-best').textContent = p.best[op] ? `BEST ${fmt(p.best[op])}` : '';
    $('#m-duel-sub').textContent = `Two players, one phone. First to ${store.settings.duelTarget} points wins.`;
  }
  store.on('profile', render);
  render();
  return { enter: render };
}
