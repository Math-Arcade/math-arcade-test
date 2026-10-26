// Local two-player duel: phone flat on a table, players face each other.
import { app } from '../app.js';
import { $, $$, h, icon, num, renderProblem, fitProblem, toast } from '../util.js';
import { DuelEngine } from '../engine/duel.js';
import { openSheet, closeSheet } from '../router.js';

export function initDuel() {
  const { store, router, audio, fx } = app;
  const root = $('[data-screen="duel"]');
  const halves = [$('#d-h0'), $('#d-h1')]; // index = player (0 bottom, 1 top / rotated)
  const sheetPause = $('#d-pause'), sheetResult = $('#d-result'), countEl = $('#d-count');
  const scoreEls = [$('#d-s1'), $('#d-s2')];
  const fill = $('#d-fill');

  halves.forEach((half) => {
    half.innerHTML = `
      <div class="p-name"><span class="nm"></span><b class="sc">0</b></div>
      <div class="p-card"><div class="problem"></div></div>
      <div class="p-answers">${[0, 1, 2, 3].map((k) => `<button type="button" class="answer" data-i="${k}"></button>`).join('')}</div>
      <div class="p-result" hidden></div>`;
  });
  const P = halves.map((half) => ({
    half, name: $('.nm', half), sc: $('.sc', half), card: $('.p-card', half), problem: $('.problem', half),
    btns: $$('.answer', half), result: $('.p-result', half),
  }));

  let eng = null, runId = 0, running = false, paused = false, uiLock = true, inCountdown = false, startedAt = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const closeNow = (s) => { s.classList.remove('open'); s.hidden = true; };

  function enter() { start(); }
  function leave() { running = false; clearTimers(); runId++; closeNow(sheetPause); closeNow(sheetResult); countEl.hidden = true; }

  function start() {
    clearTimers();
    runId++;
    const id = runId;
    eng = new DuelEngine({ seed: (Math.random() * 2 ** 32) >>> 0, target: store.settings.duelTarget });
    running = false; paused = false; uiLock = true;
    closeNow(sheetPause); closeNow(sheetResult);
    P.forEach((p, i) => {
      p.name.textContent = store.settings[i === 0 ? 'p1' : 'p2'].toUpperCase();
      p.result.hidden = true; p.result.className = 'p-result';
      p.half.classList.remove('locked');
      p.card.classList.remove('ok', 'bad');
      p.problem.textContent = '';
      p.btns.forEach((b) => { b.disabled = true; b.className = 'answer'; b.textContent = ''; });
    });
    renderScores();
    countdown(id).then(() => {
      if (id !== runId) return;
      running = true;
      startedAt = performance.now();
      showRound();
    });
  }

  function countdown(id) {
    return new Promise((resolve) => {
      inCountdown = true;
      const seq = ['3', '2', '1', 'GO!'];
      let i = 0;
      countEl.hidden = false;
      const step = () => {
        if (id !== runId) return;
        if (i >= seq.length) { countEl.hidden = true; inCountdown = false; resolve(); return; }
        countEl.innerHTML = '';
        // one copy for each player, the far one rotated
        for (const flip of [true, false]) {
          const w = h('div', `cdw${flip ? ' flip' : ''}`);
          w.append(Object.assign(h('span'), { textContent: seq[i] }));
          countEl.append(w);
        }
        audio.sfx(i < 3 ? 'beep' : 'go');
        i++;
        later(step, i === seq.length ? 500 : 650);
      };
      step();
    });
  }

  function renderScores() {
    const [a, b] = eng.scores, t = eng.target;
    P[0].sc.textContent = a; P[1].sc.textContent = b;
    scoreEls[0].textContent = a; scoreEls[1].textContent = b;
    const pct = 50 + ((a - b) / t) * 50;
    fill.style.width = `${Math.max(4, Math.min(96, pct))}%`;
  }

  function showRound() {
    const p = eng.problem;
    P.forEach((pl) => {
      pl.card.classList.remove('ok', 'bad');
      renderProblem(pl.problem, p.text);
      fitProblem(pl.problem);
      pl.btns.forEach((b, k) => { b.disabled = false; b.className = 'answer'; b.textContent = num(p.choices[k]); });
      pl.half.classList.remove('locked');
    });
    uiLock = false;
  }

  function press(player, index) {
    if (!running || paused || uiLock) return;
    const now = performance.now();
    const r = eng.answer(player, index, now);
    if (r.type === 'ignored') return;
    const me = P[player];
    const mark = (b, cls, ic) => { b.className = `answer ${cls}`; b.insertAdjacentHTML('beforeend', icon(ic, 'mark')); };
    const pos = fx.at(me.btns[index]);

    if (r.type === 'wrong') {
      audio.sfx('wrong'); audio.buzz('wrong');
      me.btns.forEach((b) => { b.disabled = true; });
      mark(me.btns[index], 'bad', 'cross');
      me.half.classList.add('locked');
      const id = runId;
      later(() => {
        if (id !== runId || uiLock) return;
        me.half.classList.remove('locked');
        me.btns.forEach((b, k) => { if (k !== index) b.disabled = false; });
      }, r.lockMs);
      fx.floatText('-1', pos.x, pos.y - 30, 'bad');
      renderScores();
      return;
    }

    // correct (or winning) answer: freeze both sides and show the solution
    uiLock = true;
    audio.sfx('correct', 4); audio.buzz('correct');
    fx.burst(pos.x, pos.y, { kind: 'good' });
    fx.floatText('+1', pos.x, pos.y - 30);
    P.forEach((pl, pi) => {
      pl.half.classList.remove('locked');
      pl.btns.forEach((b, k) => {
        b.disabled = true;
        b.className = 'answer';
        if (k === r.problem.correctIndex) mark(b, 'good', 'check');
        else b.classList.add('dim');
      });
      renderProblem(pl.problem, r.problem.text.replace('?', num(r.problem.answer)));
      fitProblem(pl.problem);
      pl.card.classList.add(pi === player ? 'ok' : 'bad');
    });
    renderScores();
    const id = runId;
    if (r.type === 'win') later(() => { if (id === runId) endMatch(player); }, 700);
    else later(() => { if (id === runId) advance(showRound); }, 750);
  }

  let pending = null;
  const advance = (fn) => { if (paused) pending = fn; else fn(); };

  function endMatch(winner) {
    running = false;
    const loser = 1 - winner;
    P[winner].result.className = 'p-result win'; P[winner].result.textContent = 'YOU WIN!'; P[winner].result.hidden = false;
    P[loser].result.className = 'p-result lose'; P[loser].result.textContent = 'YOU LOSE'; P[loser].result.hidden = false;
    audio.sfx('win'); audio.buzz('win'); fx.confetti(80);
    store.update((p) => {
      p.totals.duelGames++;
      p.totals[winner === 0 ? 'duelWins0' : 'duelWins1']++;
      p.totals.seconds += Math.round((performance.now() - startedAt) / 1000);
    });
    const name = store.settings[winner === 0 ? 'p1' : 'p2'];
    $('#d-result-t').textContent = `${name.toUpperCase()} WINS!`;
    $('#d-r-score').textContent = `${eng.scores[0]} - ${eng.scores[1]}`;
    later(() => openSheet(sheetResult), 1300);
  }

  // pause / resume / quit
  function pause() {
    if (!running || paused || inCountdown) return;
    paused = true;
    openSheet(sheetPause);
  }
  function resume() {
    if (!paused) return;
    paused = false;
    closeSheet(sheetPause);
    if (pending) { const f = pending; pending = null; f(); }
  }
  function toMenu() { running = false; clearTimers(); runId++; router.go('modes', {}, { back: true }); }

  $('#d-pausebtn').onclick = pause;
  $('#d-resume').onclick = resume;
  $('#d-restart').onclick = () => { pending = null; start(); };
  $('#d-quit').onclick = toMenu;
  $('#d-r-again').onclick = () => { pending = null; start(); };
  $('#d-r-menu').onclick = toMenu;

  const prevGuard = router.guard;
  router.guard = (screen) => {
    if (screen !== 'duel') return prevGuard ? prevGuard(screen) : false;
    if (!sheetResult.hidden) { toMenu(); return true; }
    if (paused) { resume(); return true; }
    pause();
    return true;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && router.current === 'duel') pause(); });

  P.forEach((pl, player) => {
    pl.btns.forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        b.dataset.pd = '1';
        press(player, Number(b.dataset.i));
      });
      b.addEventListener('click', () => {
        if (b.dataset.pd) { delete b.dataset.pd; return; }
        press(player, Number(b.dataset.i));
      });
    });
  });
  window.addEventListener('resize', () => { if (router.current === 'duel') P.forEach((pl) => pl.problem.firstChild && fitProblem(pl.problem)); });

  if (new URLSearchParams(location.search).has('debug')) window.__duel = { get eng() { return eng; }, press };
  return { enter, leave };
}
