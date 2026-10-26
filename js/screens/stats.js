import { app } from '../app.js';
import { $, h, fmt } from '../util.js';
import { MODES, MODE_SIGN, MODE_NAME } from '../config.js';

export function initStats() {
  const { store } = app;
  const body = $('#st-body');

  function card(k, v) {
    const c = h('div', 'stat');
    c.append(h('span', 'k', k), h('span', 'v', v));
    return c;
  }
  const dur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.max(0, Math.floor(sec / 60))}m`);

  function render() {
    const { totals: t, best, days } = store.profile;
    const answered = t.correct + t.wrong;
    body.textContent = '';
    const grid = h('div', 'stat-cards');
    grid.append(
      card('Blitz games', fmt(t.blitzGames)),
      card('Correct answers', fmt(t.correct)),
      card('Accuracy', answered ? `${Math.round((t.correct / answered) * 100)}%` : '-'),
      card('Best streak', fmt(t.bestStreak)),
      card('Highest level', t.bestLevel ? String(t.bestLevel) : '-'),
      card('Daily streak', `${store.streak} day${store.streak === 1 ? '' : 's'}`),
      card('Dailies played', fmt(Object.keys(days).length)),
      card('Play time', dur(t.seconds)),
    );
    body.append(grid);

    const bests = h('div', 'panel');
    bests.append(h('h3', '', 'BLITZ BEST SCORES'));
    const max = Math.max(1, ...MODES.map((m) => best[m]));
    MODES.forEach((m) => {
      const r = h('div', 'best-row');
      r.setAttribute('aria-label', `${MODE_NAME[m]} ${best[m]}`);
      const s = h('span', `s${m === 'mix' ? ' mix' : ''}`, MODE_SIGN[m]);
      const bg = h('div', 'bar-bg'), i = h('i');
      i.style.width = `${Math.round((best[m] / max) * 100)}%`;
      bg.append(i);
      r.append(s, bg, h('span', 'n', fmt(best[m])));
      bests.append(r);
    });
    body.append(bests);

    const duel = h('div', 'panel');
    duel.append(h('h3', '', 'DUEL RECORD'));
    const row = h('div', 'stat-cards');
    row.append(card(`${store.settings.p1} wins`, fmt(t.duelWins0)), card(`${store.settings.p2} wins`, fmt(t.duelWins1)));
    duel.append(row, h('div', 'muted', `${fmt(t.duelGames)} duel${t.duelGames === 1 ? '' : 's'} played`));
    body.append(duel);
  }
  return { enter: render };
}
