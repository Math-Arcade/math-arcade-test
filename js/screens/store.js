import { app } from '../app.js';
import { $, h, fmt, toast, lvlBadge } from '../util.js';
import { confirmDialog } from '../router.js';
import { FRAMES, CARDS } from '../shop.js';
import { equippedTitleName, tierForTitle } from '../titles.js';

// Store: everything on one scrolling page, one titled section per kind of item, paid for with coins.
// To add a new kind of item, add one entry here (and its catalog in shop.js); no new buttons or tabs.
//   layout: 'grid' = two per row (small previews), 'list' = one per row (wide previews)
const SECTIONS = [
  { id: 'frames', title: 'AVATAR FRAMES', note: 'Decorate your picture', layout: 'grid', items: FRAMES, label: 'Frame', worn: (p) => p.frame,
    buy: (s, id) => s.buyFrame(id), equip: (s, id) => s.equipFrame(id) },
  { id: 'cards', title: 'PROFILE CARDS', note: 'Restyle your row in Ranks and Friends', layout: 'list', items: CARDS, label: 'Card', worn: (p) => p.card,
    buy: (s, id) => s.buyCard(id), equip: (s, id) => s.equipCard(id) },
];

export function initStore() {
  const { store, cloud, router } = app;
  const body = $('#store-body'), coins = $('#st-coins b');

  const picture = (frame) => {
    const mine = store.settings.avatar;
    const pic = h('span', 'lb-pic'); if (frame) pic.dataset.frame = frame;
    if (mine) { const im = document.createElement('img'); im.src = mine; im.alt = ''; pic.append(im); } else pic.innerHTML = '<svg class="ico"><use href="#i-user"></use></svg>';
    return pic;
  };

  const stateChip = (item, has, on) => {
    const state = h('span', 'st-state', on ? 'EQUIPPED' : has ? 'EQUIP' : fmt(item.price));
    if (!has) state.insertAdjacentHTML('afterbegin', '<svg class="ico"><use href="#i-coin"></use></svg>');
    return state;
  };

  // a miniature Ranks row, so a card is previewed exactly as other players will see it
  function previewRow(cardId) {
    const me = (cloud.user && cloud.user.name) || store.settings.localName || 'You';
    const row = h('span', 'lb-row st-row'); row.dataset.card = cardId;
    const av = h('span', 'lb-av'); av.append(picture(store.profile.frame), lvlBadge(store.level.level));
    const title = equippedTitleName(store.profile, store.level.level);
    const ttl = h('small', 'lb-title', title); ttl.dataset.tier = tierForTitle(title).id;
    const identity = h('span', 'lb-identity'); identity.append(h('span', 'lb-name', me), ttl);
    row.append(h('span', 'lb-rank', '#1'), av, identity, h('span', 'lb-score', '1,250'));
    return row;
  }

  // one shop item: buy it, wear it, or take it off
  function itemButton(sec, item) {
    const { owned } = store.profile;
    const has = owned.includes(item.id), on = sec.worn(store.profile) === item.id;
    const el = h('button', `st-card${sec.layout === 'list' ? ' st-cd' : ''}${on ? ' on' : ''}${has ? ' own' : ''}`);
    if (sec.id === 'cards') el.append(previewRow(item.id));
    else { const prev = picture(item.id); prev.classList.add('st-prev'); el.append(prev); }
    el.append(h('b', 'st-name', item.name), stateChip(item, has, on));
    el.type = 'button';
    el.setAttribute('aria-label', `${item.name}, ${on ? 'equipped' : has ? 'owned, tap to equip' : `${item.price} coins`}`);
    el.onclick = async () => {
      if (on) { sec.equip(store, null); toast(`${sec.label} removed`); return; }
      if (has) { sec.equip(store, item.id); toast(`Wearing ${item.name}`); return; }
      if (store.coins < item.price) { toast(`You need ${fmt(item.price - store.coins)} more coins`); return; }
      const r = await confirmDialog({ title: `Buy ${item.name}?`, text: `It costs ${fmt(item.price)} coins. You have ${fmt(store.coins)}.`, ok: 'BUY' });
      if (r && r.ok && sec.buy(store, item.id)) toast(`${item.name} is yours`);
    };
    return el;
  }

  function render() {
    coins.textContent = fmt(store.coins);
    body.textContent = '';
    for (const sec of SECTIONS) {
      const wrap = h('section', 'st-sec'); wrap.dataset.sec = sec.id;
      const head = h('div', 'st-head'); head.append(h('h3', '', sec.title), h('small', '', sec.note));
      const grid = h('div', `st-grid${sec.layout === 'list' ? ' cards' : ''}`);
      sec.items.forEach((item) => grid.append(itemButton(sec, item)));
      wrap.append(head, grid);
      body.append(wrap);
    }
  }

  store.on('profile', () => { if (router.current === 'store') render(); });
  store.on('settings', (k) => { if (k === 'avatar' && router.current === 'store') render(); });
  return { enter() { render(); } };
}
