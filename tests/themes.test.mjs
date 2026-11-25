import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_ITEMS, themeById, itemById } from '../js/shop.js';
import { ALL_THEME_IDS } from '../js/config.js';
import { store, mergeProfiles } from '../js/store.js';
import { SHOP_IDS } from '../js/achievements.js';
import { cleanPublic } from '../js/public.js';

const fresh = () => { store.resetAll(); store.settings.theme = 'green'; return store; };
const rich = (s, n = 99999) => s.update((p) => { p.coinsEarned = n; });

test('Notebook is a bought theme with a price, and every theme id is known', () => {
  assert.equal(THEME_ITEMS[0].id, 'notebook');
  assert.ok(THEME_ITEMS[0].price > 0);
  assert.equal(themeById('notebook').name, 'Notebook');
  assert.equal(itemById('notebook').id, 'notebook', 'it shares the owned list with frames and cards');
  assert.ok(ALL_THEME_IDS.includes('notebook') && ALL_THEME_IDS.includes('light'));
});

test('buying costs coins, unlocks and wears the theme', () => {
  const s = fresh();
  assert.equal(s.buyTheme('notebook'), false, 'not enough coins');
  rich(s, 1500);
  assert.equal(s.buyTheme('notebook'), true);
  assert.equal(s.coins, 0);
  assert.ok(s.profile.owned.includes('notebook'));
  assert.equal(s.theme, 'notebook');
  assert.equal(s.buyTheme('notebook'), false, 'cannot buy it twice');
  assert.equal(s.coins, 0);
});

test('an unowned bought theme never shows, even if the setting says so', () => {
  const s = fresh();
  s.set('theme', 'notebook');
  assert.equal(s.theme, 'green');
  assert.equal(s.equipTheme('notebook'), false, 'cannot wear what you do not own');
  rich(s); s.buyTheme('notebook');
  assert.equal(s.theme, 'notebook');
  assert.equal(s.equipTheme(null), true);
  assert.equal(s.theme, 'green', 'taking it off restores the default');
  assert.equal(s.equipTheme('notebook'), true);
  assert.equal(s.theme, 'notebook');
});

test('owning a theme survives sync (the owned list keeps it)', () => {
  const s = fresh(); rich(s); s.buyTheme('notebook');
  const merged = mergeProfiles(s.profile, mergeProfiles(null, null));
  assert.ok(merged.owned.includes('notebook'));
});

test('The Collector now needs the theme too, but stays once earned', () => {
  assert.ok(SHOP_IDS.includes('notebook'));
  const s = fresh();
  s.update((p) => { p.owned = SHOP_IDS.filter((id) => id !== 'notebook'); });
  assert.equal(s.profile.ach.collector, undefined);
  s.update((p) => { p.owned = [...SHOP_IDS]; });
  assert.equal(s.profile.ach.collector, 1);
});

test('other players can show the theme on their profile, unknown themes are dropped', () => {
  const base = { name: 'Nova', stats: {} };
  assert.equal(cleanPublic({ ...base, theme: 'notebook' }).theme, 'notebook');
  assert.equal(cleanPublic({ ...base, theme: 'hacked' }).theme, 'green');
});

test('Space is a bought theme too: priced, owned like Notebook, and known to profiles', () => {
  assert.equal(themeById('space').name, 'Space');
  assert.ok(themeById('space').price > 0);
  assert.ok(ALL_THEME_IDS.includes('space'));
  assert.ok(SHOP_IDS.includes('space'), 'The Collector needs it');
  const s = fresh();
  s.set('theme', 'space');
  assert.equal(s.theme, 'green', 'not shown until owned');
  rich(s, 1800);
  assert.equal(s.buyTheme('space'), true);
  assert.equal(s.theme, 'space');
  assert.equal(s.equipTheme('notebook'), false, 'owning one bought theme does not unlock the other');
  assert.equal(cleanPublic({ name: 'Nova', stats: {}, theme: 'space' }).theme, 'space');
});

test('Winter is a bought theme: priced, owned on its own, known to profiles', () => {
  assert.equal(themeById('winter').name, 'Winter');
  assert.ok(themeById('winter').price > 0);
  assert.ok(ALL_THEME_IDS.includes('winter') && SHOP_IDS.includes('winter'));
  const s = fresh(); rich(s, 1600);
  assert.equal(s.buyTheme('winter'), true);
  assert.equal(s.theme, 'winter');
  assert.equal(s.equipTheme('space'), false);
  assert.equal(cleanPublic({ name: 'Nova', stats: {}, theme: 'winter' }).theme, 'winter');
});

test('Candy is a bought theme: priced, owned on its own, known to profiles', () => {
  assert.equal(themeById('candy').name, 'Candy');
  assert.ok(themeById('candy').price > 0);
  assert.ok(ALL_THEME_IDS.includes('candy') && SHOP_IDS.includes('candy'));
  const s = fresh(); rich(s, 1700);
  assert.equal(s.buyTheme('candy'), true);
  assert.equal(s.theme, 'candy');
  assert.equal(s.equipTheme('winter'), false);
  assert.equal(cleanPublic({ name: 'Nova', stats: {}, theme: 'candy' }).theme, 'candy');
});

test('Gothic is a bought theme: priced, owned on its own, known to profiles', () => {
  assert.equal(themeById('gothic').name, 'Gothic');
  assert.ok(themeById('gothic').price > 0);
  assert.ok(ALL_THEME_IDS.includes('gothic') && SHOP_IDS.includes('gothic'));
  const s = fresh(); rich(s, 1900);
  assert.equal(s.buyTheme('gothic'), true);
  assert.equal(s.theme, 'gothic');
  assert.equal(s.equipTheme('candy'), false);
  assert.equal(cleanPublic({ name: 'Nova', stats: {}, theme: 'gothic' }).theme, 'gothic');
});
