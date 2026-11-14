import { app } from '../app.js';
import { $, $$, h, icon, toast, lvlBadge } from '../util.js';
import { friendlyError } from '../cloud.js';
import { tierForTitle } from '../titles.js';

const count = (n) => document.dispatchEvent(new CustomEvent('friends:count', { detail: n }));

export function initFriends() {
  const { cloud, router } = app;
  const body = $('#fr-body'), badge = $('#fr-count'), tabs = Array.from(document.querySelectorAll('section[data-screen="friends"] .fr-tab'));
  let tab = 'list', state = null, token = 0, searchTimer = 0, results = [];
  const info = new Map(); // uid -> public profile (name, picture), fetched lazily

  const message = (t) => { body.textContent = ''; body.append(h('div', 'lb-msg', t)); };

  function person(p, actions) {
    const row = h('div', 'fr-row');
    const main = h('button', 'fr-main'); main.type = 'button';
    const pic = h('span', 'lb-pic'); pic.innerHTML = icon('user');
    const av = h('span', 'lb-av'); av.append(pic);
    const identity = h('span', 'fr-identity');
    const nm = h('span', 'fr-name', p.name);
    const title = h('small', 'fr-title', 'Rookie');
    identity.append(nm, title);
    let badge = null;
    main.append(av, identity);
    main.onclick = () => router.go('profile', { uid: p.uid, name: p.name, lvl: info.get(p.uid)?.level, title: info.get(p.uid)?.title, from: 'friends' });
    row.append(main, actions || h('span'));
    const paint = (i) => {
      if (!i) return;
      if (i.name) nm.textContent = i.name;
      if (i.frame) pic.dataset.frame = i.frame;
      title.textContent = i.title || 'Rookie'; title.dataset.tier = tierForTitle(i.title || 'Rookie').id;
      if (i.level) { if (!badge) { badge = lvlBadge(i.level); av.append(badge); } else badge.textContent = String(i.level); }
      if (i.pic) { pic.textContent = ''; const im = document.createElement('img'); im.src = i.pic; im.alt = ''; pic.append(im); }
    };
    if (info.has(p.uid)) paint(info.get(p.uid));
    else cloud.fetchPublicProfile(p.uid).then((i) => { info.set(p.uid, i); paint(i); }).catch(() => {});
    return row;
  }

  async function act(btn, fn, ok) {
    btn.disabled = true;
    try { await fn(); if (ok) toast(ok); await refresh(); }
    catch (e) { toast(friendlyError(e)); btn.disabled = false; }
  }
  const textBtn = (label, cls, fn, ok) => { const b = h('button', `btn btn-sm ${cls}`, label); b.type = 'button'; b.onclick = () => act(b, fn, ok); return b; };
  const iconBtn = (name, label, fn, ok) => { const b = h('button', 'icon-btn'); b.type = 'button'; b.setAttribute('aria-label', label); b.innerHTML = icon(name); b.onclick = () => act(b, fn, ok); return b; };

  function renderList() {
    body.textContent = '';
    if (!state.friends.length) { body.append(h('div', 'lb-msg', 'No friends yet. Use ADD to find players.')); return; }
    body.append(h('div', 'section-label', `${state.friends.length} FRIEND${state.friends.length === 1 ? '' : 'S'}`));
    state.friends.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => body.append(person(p)));
  }

  function renderRequests() {
    body.textContent = '';
    if (!state.incoming.length && !state.sent.length) { body.append(h('div', 'lb-msg', 'No pending requests.')); return; }
    if (state.incoming.length) {
      body.append(h('div', 'section-label', 'INCOMING'));
      state.incoming.forEach((p) => {
        const a = h('div', 'fr-acts');
        a.append(
          iconBtn('check', `Accept ${p.name}`, () => cloud.acceptFriendRequest(p.uid, p.name), `You and ${p.name} are friends`),
          iconBtn('cross', `Decline ${p.name}`, () => cloud.declineFriendRequest(p.uid)),
        );
        body.append(person(p, a));
      });
    }
    if (state.sent.length) {
      body.append(h('div', 'section-label', 'SENT'));
      state.sent.forEach((p) => {
        const a = h('div', 'fr-acts');
        a.append(textBtn('CANCEL', '', () => cloud.cancelFriendRequest(p.uid)));
        body.append(person(p, a));
      });
    }
  }

  function resultRow(p) {
    const a = h('div', 'fr-acts');
    const isFriend = state.friends.some((f) => f.uid === p.uid), sent = state.sent.some((f) => f.uid === p.uid), inc = state.incoming.some((f) => f.uid === p.uid);
    if (isFriend) a.append(h('span', 'fr-label', 'FRIENDS'));
    else if (sent) a.append(h('span', 'fr-label', 'SENT'));
    else if (inc) a.append(textBtn('ACCEPT', 'btn-primary', () => cloud.acceptFriendRequest(p.uid, p.name), `You and ${p.name} are friends`));
    else a.append(textBtn('ADD', 'btn-primary', () => cloud.sendFriendRequest(p.uid, p.name), 'Request sent'));
    return person(p, a);
  }

  let box, list;
  function paintResults(note) {
    list.textContent = '';
    if (note) { list.append(h('div', 'lb-msg', note)); return; }
    results.forEach((p) => list.append(resultRow(p)));
  }
  function renderAdd() {
    body.textContent = '';
    box = h('input', 'fr-search'); box.type = 'search'; box.id = 'fr-q'; box.placeholder = 'Search by player name'; box.maxLength = 16;
    box.autocomplete = 'off'; box.autocapitalize = 'off'; box.setAttribute('aria-label', 'Search players');
    list = h('div'); list.id = 'fr-results'; list.style.cssText = 'display:flex;flex-direction:column;gap:.6rem';
    body.append(box, list);
    box.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 350); };
    if (results.length) paintResults(); else paintResults('Type at least 2 letters of a name.');
  }

  async function search() {
    const text = box.value.trim(), mine = ++token;
    if (text.length < 2) { results = []; paintResults('Type at least 2 letters of a name.'); return; }
    paintResults('Searching…');
    try {
      const found = await cloud.searchPlayers(text);
      if (mine !== token) return;
      // The database stores lower-case keys; show each player's real name when we can.
      await Promise.all(found.map(async (p) => {
        if (!info.has(p.uid)) { try { info.set(p.uid, await cloud.fetchPublicProfile(p.uid)); } catch { /* keep the key */ } }
        const i = info.get(p.uid); if (i && i.name) p.name = i.name;
      }));
      if (mine !== token) return;
      results = found;
      paintResults(found.length ? '' : 'No players found.');
    } catch (e) { if (mine === token) paintResults(friendlyError(e)); }
  }

  function paintTabs() {
    tabs.forEach((t) => { const on = t.dataset.tab === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    const n = state ? state.incoming.length : 0;
    badge.hidden = !n; badge.textContent = String(n);
    count(n);
  }

  function render() {
    paintTabs();
    if (!cloud.user) { message('Friends need an internet connection. Try again in a moment.'); return; }
    if (!state) { message('Loading…'); return; }
    if (tab === 'list') renderList(); else if (tab === 'requests') renderRequests(); else renderAdd();
  }

  async function refresh() {
    if (!cloud.user) { state = null; render(); return; }
    try { state = await cloud.friendsState(); }
    catch (e) { state = null; paintTabs(); message(friendlyError(e)); return; }
    if (tab === 'add' && box && document.activeElement === box) { paintTabs(); paintResults(results.length ? '' : undefined); }
    else render();
  }

  tabs.forEach((t) => { t.onclick = () => { tab = t.dataset.tab; render(); if (tab === 'add' && box) box.focus(); else refresh(); }; });
  cloud.onChange(() => { if (router.current === 'friends') refresh(); });

  return {
    enter(p = {}) { tab = p.tab || 'list'; info.clear(); results = []; state = null; render(); refresh(); },
    leave() { clearTimeout(searchTimer); token++; },
  };
}
