import { app } from '../app.js';
import { $, h, fmt, toast, icon } from '../util.js';
import { MODE_SIGN, MODE_NAME } from '../config.js';
import { BLITZ_TIERS, PLATINUM, STREAK_DAYS, ABSOLUTE_LEVEL, SHOWCASE_MAX, SHOP_IDS, liveAchievements, achById, maxTier, tierOf, hasTitle, medalTier, cleanShowcase } from '../achievements.js';

const TIER_NAME = ['', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
const DESC = {
  blitz: (a) => `Correct answers in ${MODE_NAME[a.mode]} Blitz`,
  daily: () => `Complete the Daily Challenge ${STREAK_DAYS} days in a row`,
  shop: () => 'Own every item in the Store',
  ultimate: () => `Unlock every other achievement and reach level ${ABSOLUTE_LEVEL}`,
};

// The achievements panel on the profile (up to 3 pinned medals) and the sheet that lists them all.
export function initAchievements() {
  const { store, cloud } = app;
  const panel = $('#pf-ach'), show = $('#pfa-show'), count = $('#pfa-count'), note = $('#pfa-note');
  const sheet = $('#pf-achs'), scroll = $('#ach-scroll'), hero = $('#ach-hero');
  let other = null; // the pinned achievements of another player, while their profile is open

  const medalFace = (a, locked) => {
    if (locked) return icon('lock');
    return a.kind === 'blitz' ? MODE_SIGN[a.mode] : icon(a.kind === 'daily' ? 'flame' : a.kind === 'shop' ? 'coin' : 'trophy');
  };
  function medal(a, tier) {
    const m = h('span', 'tt-medal');
    if (tier < 1) m.innerHTML = medalFace(a, true);
    else if (a.kind === 'blitz') m.textContent = MODE_SIGN[a.mode]; else m.innerHTML = medalFace(a, false);
    return m;
  }

  // ---- what is shown for one achievement ----
  function info(a) {
    const p = store.profile, tier = tierOf(p.ach, a.id);
    if (a.kind === 'blitz') {
      const n = p.modeCorrect[a.mode] || 0, next = BLITZ_TIERS[tier];
      if (tier >= 4) return { tier, pct: 1, sub: 'PLATINUM · TITLE UNLOCKED' };
      if (tier === 3) {
        const st = app.platinum && app.platinum.status[a.mode];
        const msg = st ? (st.total < PLATINUM.minPlayers ? `Needs ${PLATINUM.minPlayers} players on the board (${st.total} now)` : st.qualifies ? 'You are in the top 1%!' : 'Not in the top 1% yet. Raise your best score!')
          : cloud.user ? 'Checking your rank…' : 'Go online to check your rank';
        return { tier, pct: 1, sub: `GOLD · TOP ${PLATINUM.topPercent}% FOR PLATINUM`, extra: msg };
      }
      return { tier, pct: Math.min(1, n / next.at), sub: `${fmt(n)} / ${fmt(next.at)} · NEXT ${next.name}` };
    }
    if (a.kind === 'daily') return { tier, pct: tier ? 1 : Math.min(1, store.streak / STREAK_DAYS), sub: tier ? 'UNLOCKED' : `STREAK ${store.streak} / ${STREAK_DAYS} DAYS` };
    if (a.kind === 'shop') { const have = SHOP_IDS.filter((id) => p.owned.includes(id)).length; return { tier, pct: tier ? 1 : have / SHOP_IDS.length, sub: tier ? 'UNLOCKED' : `OWNED ${have} / ${SHOP_IDS.length}` }; }
    const others = liveAchievements().filter((x) => x.kind !== 'ultimate'), done = others.filter((x) => tierOf(p.ach, x.id) >= maxTier(x)).length, lv = store.level.level;
    return { tier, pct: tier ? 1 : (done + Math.min(lv, ABSOLUTE_LEVEL) / ABSOLUTE_LEVEL) / (others.length + 1), sub: tier ? 'UNLOCKED' : `${done} / ${others.length} DONE · LEVEL ${lv} / ${ABSOLUTE_LEVEL}` };
  }

  // ---- the profile panel: three pinned medals ----
  function paintPanel() {
    const mine = !other;
    const ach = mine ? store.profile.ach : other.ach;
    const pinned = cleanShowcase(mine ? store.profile.showcase : other.showcase, ach);
    const live = liveAchievements(), done = live.filter((a) => tierOf(ach, a.id) >= maxTier(a)).length;
    count.textContent = 'ACHIEVEMENTS';
    note.textContent = mine ? `${done} / ${live.length} complete` : '';
    panel.hidden = !mine && !pinned.length;
    show.textContent = '';
    for (let i = 0; i < SHOWCASE_MAX; i++) {
      const id = pinned[i], a = id && achById(id);
      if (!a && !mine) continue;
      const slot = h('span', `ach-slot${a ? ' on' : ' empty'}`);
      if (a) {
        const tier = tierOf(ach, a.id);
        slot.dataset.tier = medalTier(a, tier);
        const t = h('small', 'ach-slot-tier', a.kind === 'blitz' ? TIER_NAME[tier] : 'UNLOCKED');
        slot.append(medal(a, tier), h('b', '', a.name), t);
      } else slot.append(h('span', 'ach-plus', '+'), h('small', '', 'EMPTY'));
      show.append(slot);
    }
    panel.setAttribute('aria-label', mine ? 'Open achievements' : 'Pinned achievements');
  }

  // ---- the sheet ----
  function paintSheet() {
    const p = store.profile, keep = scroll.scrollTop;
    const live = liveAchievements(), pinned = cleanShowcase(p.showcase, p.ach);
    const done = live.filter((a) => tierOf(p.ach, a.id) >= maxTier(a)).length;
    hero.textContent = '';
    const top = h('div', 'tt-hero-top');
    top.append(h('span', 'tt-eyebrow', 'COMPLETE'), h('span', 'tt-eyebrow tt-count', `PINNED ${pinned.length} / ${SHOWCASE_MAX}`));
    const chips = h('div', 'tt-chips');
    chips.append(h('span', 'tt-chip', 'TAP PIN TO SHOW ON YOUR PROFILE'));
    hero.append(top, h('b', 'tt-hero-name', `${done} / ${live.length}`), chips);

    scroll.textContent = '';
    live.forEach((a) => {
      const f = info(a), tier = f.tier, unlocked = tier >= 1, titleOn = hasTitle(p.ach, a.id), worn = p.achTitle === a.id;
      const row = h('div', `ach-row${unlocked ? ' unlocked' : ' locked'}`);
      row.dataset.tier = medalTier(a, Math.max(1, tier));
      const card = h('div', 'ach-card');
      const text = h('div', 'tt-text');
      text.append(h('b', 'tt-name', a.name), h('small', 'ach-desc', DESC[a.kind](a)));
      const bar = h('div', 'xp-track ach-bar'), fill = h('i'); fill.style.width = `${Math.round(f.pct * 100)}%`; bar.append(fill);
      const meta = h('div', 'ach-meta'); meta.append(h('small', 'tt-sub', f.sub));
      if (a.kind === 'blitz') {
        const pips = h('span', 'ach-pips'); pips.setAttribute('aria-hidden', 'true');
        for (let i = 1; i <= 4; i++) { const pip = h('i', i <= tier ? 'on' : ''); pip.dataset.tier = TIER_NAME[i].toLowerCase(); pips.append(pip); }
        meta.append(pips);
      }
      card.append(text, bar, meta);
      if (f.extra) card.append(h('small', 'ach-extra', f.extra));
      if (unlocked) {
        const acts = h('div', 'ach-acts');
        const pinOn = pinned.includes(a.id);
        const pin = h('button', `tt-state ach-btn${pinOn ? ' on' : ''}`, pinOn ? 'PINNED' : 'PIN'); pin.type = 'button'; pin.setAttribute('aria-pressed', String(pinOn));
        pin.onclick = () => {
          if (!pinOn && pinned.length >= SHOWCASE_MAX) { toast(`You can pin ${SHOWCASE_MAX}. Unpin one first`); return; }
          store.setShowcase(pinOn ? pinned.filter((x) => x !== a.id) : [...pinned, a.id]);
        };
        acts.append(pin);
        if (titleOn) {
          const wear = h('button', `tt-state ach-btn${worn ? ' on' : ''}`, worn ? 'TITLE WORN' : 'WEAR TITLE'); wear.type = 'button'; wear.setAttribute('aria-pressed', String(worn));
          wear.onclick = () => { store.equipAchTitle(worn ? null : a.id); toast(worn ? 'Level title restored' : `Wearing “${a.name}”`); };
          acts.append(wear);
        } else if (a.kind === 'blitz') acts.append(h('small', 'ach-lock', 'Title unlocks at Platinum'));
        card.append(acts);
      }
      row.append(medal(a, tier), card);
      scroll.append(row);
    });
    scroll.scrollTop = keep;
  }

  function open() {
    if (other) return;
    scroll.scrollTop = 0;
    paintSheet();
    sheet.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('open'); $('#pf-achs-close').focus({ preventScroll: true }); });
    if (app.platinum) Promise.resolve(app.platinum.check({ force: true })).then(() => { if (!sheet.hidden) paintSheet(); });
  }
  function close() { sheet.hidden = true; sheet.classList.remove('open'); panel.focus?.(); }

  panel.onclick = open;
  panel.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  $('#pf-achs-close').onclick = close;
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  store.on('profile', () => { if (!other) { paintPanel(); if (!sheet.hidden) paintSheet(); } });

  return {
    // your own profile
    showOwn() { other = null; panel.setAttribute('role', 'button'); panel.tabIndex = 0; panel.classList.remove('is-other'); sheet.hidden = true; paintPanel(); },
    // someone else's profile: only what they chose to pin
    showOther(p) { other = p || { ach: {}, showcase: [] }; panel.removeAttribute('role'); panel.tabIndex = -1; panel.classList.add('is-other'); sheet.hidden = true; paintPanel(); },
    hideOther() { other = { ach: {}, showcase: [] }; panel.classList.add('is-other'); panel.hidden = true; },
    close,
  };
}
