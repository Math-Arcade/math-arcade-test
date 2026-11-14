import { app } from '../app.js';
import { $, h, fmt, toast } from '../util.js';
import { confirmDialog } from '../router.js';
import { FRAMES } from '../shop.js';

// Store: avatar frames, paid for with coins.
export function initStore() {
  const { store, router } = app;
  const body = $('#store-body'), coins = $('#st-coins b');

  function render() {
    const { owned, frame } = store.profile, mine = store.settings.avatar;
    coins.textContent = fmt(store.coins);
    body.textContent = '';
    FRAMES.forEach((f) => {
      const has = owned.includes(f.id), on = frame === f.id;
      const card = h('button', `st-card${on ? ' on' : ''}${has ? ' own' : ''}`);
      card.type = 'button';
      card.setAttribute('aria-label', `${f.name}, ${on ? 'equipped' : has ? 'owned, tap to equip' : `${f.price} coins`}`);
      const prev = h('span', 'lb-pic st-prev'); prev.dataset.frame = f.id;
      if (mine) { const im = document.createElement('img'); im.src = mine; im.alt = ''; prev.append(im); } else prev.innerHTML = '<svg class="ico"><use href="#i-user"></use></svg>';
      const state = h('span', 'st-state', on ? 'EQUIPPED' : has ? 'EQUIP' : fmt(f.price));
      if (!has) state.insertAdjacentHTML('afterbegin', '<svg class="ico"><use href="#i-coin"></use></svg>');
      card.append(prev, h('b', 'st-name', f.name), state);
      card.onclick = async () => {
        if (on) { store.equipFrame(null); toast('Frame removed'); return; }
        if (has) { store.equipFrame(f.id); toast(`Wearing ${f.name}`); return; }
        if (store.coins < f.price) { toast(`You need ${fmt(f.price - store.coins)} more coins`); return; }
        const r = await confirmDialog({ title: `Buy ${f.name}?`, text: `It costs ${fmt(f.price)} coins. You have ${fmt(store.coins)}.`, ok: 'BUY' });
        if (r && r.ok && store.buyFrame(f.id)) toast(`${f.name} is yours`);
      };
      body.append(card);
    });
  }

  store.on('profile', () => { if (router.current === 'store') render(); });
  store.on('settings', (k) => { if (k === 'avatar' && router.current === 'store') render(); });
  return { enter: render };
}
