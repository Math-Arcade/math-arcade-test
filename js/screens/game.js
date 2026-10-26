// Game screen controller for Blitz, Zen and Daily. All rules live in engine/run.js.
import { app } from '../app.js';
import { $, $$, h, icon, fmt, clock, num, trim, renderProblem, fitProblem, countUp, toast, utcDay } from '../util.js';
import { RunEngine, RULES } from '../engine/run.js';
import { MODE_NAME, MODE_SIGN } from '../config.js';
import { openSheet, closeSheet } from '../router.js';
import { catSVG } from '../cat.js';

export function initGame() {
  const { store, router, audio, fx, cloud } = app;
  const root = $('[data-screen="game"]');
  const E = {
    problem: $('#g-problem'), card: $('#g-card'), verdict: $('#g-verdict'), answers: $('#g-answers'), btns: $$('.answer', $('#g-answers')),
    score: $('#g-score'), scoreLabel: $('#g-score-label'), hearts: $('#g-hearts'), clock: $('#g-clock'), fill: $('#g-clock-fill'), clockText: $('#g-clock-text'),
    lv: $('#g-lv'), lvFill: $('#g-lvfill'), combo: $('#g-combo'), banner: $('#g-banner'), cat: $('#g-cat'), count: $('#g-count'),
    pause: $('#g-pause'), result: $('#g-result'),
  };

  let cfg = null, eng = null, pending = null;
  let runId = 0, running = false, paused = false, locked = true, inCountdown = false;
  let raf = 0, last = 0, lastSecond = -1, startedAt = 0, committed = false, scored = true;
  let catTimer = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); clearTimeout(catTimer); };

  // ---------- lifecycle ----------
  function enter(params) {
    cfg = { kind: 'blitz', mode: 'mix', ...params };
    root.dataset.kind = cfg.kind;
    if (cfg.view) { viewDaily(); return; }
    start();
  }

  function leave() {
    finalizeZen();
    stopLoop();
    clearTimers();
    runId++;
    closeNow(E.pause); closeNow(E.result);
    E.count.hidden = true;
  }

  function closeNow(sheet) { sheet.classList.remove('open'); sheet.hidden = true; }

  function start() {
    clearTimers();
    runId++;
    const id = runId;
    const { kind, mode } = cfg;
    cfg.date = utcDay();
    scored = kind !== 'daily' || !store.today;
    eng = new RunEngine({ kind, mode, seed: kind === 'daily' ? `daily-${cfg.date}` : undefined });
    running = false; paused = false; locked = true; committed = false; lastSecond = -1; pending = null; comboShown = 1;
    closeNow(E.pause); closeNow(E.result);
    E.card.classList.remove('ok', 'bad'); E.verdict.innerHTML = ''; E.banner.hidden = true;
    E.problem.textContent = '';
    E.btns.forEach((b) => { b.disabled = true; b.className = 'answer'; b.textContent = ''; });
    E.cat.hidden = kind !== 'zen';
    if (kind === 'zen') setCat('sleep');
    const pb = $('#g-pausebtn');
    pb.innerHTML = icon(kind === 'zen' ? 'back' : 'pause');
    pb.setAttribute('aria-label', kind === 'zen' ? 'Back' : 'Pause');
    E.scoreLabel.textContent = kind === 'daily' ? 'QUESTION' : kind === 'zen' ? 'SOLVED' : 'SCORE';
    renderHud();
    renderClock();
    countdown(id).then(() => {
      if (id !== runId) return;
      startedAt = performance.now();
      running = true;
      next();
      last = performance.now();
      raf = requestAnimationFrame(loop);
    });
  }

  function countdown(id) {
    if (cfg.kind === 'zen') return Promise.resolve();
    return new Promise((resolve) => {
      inCountdown = true;
      const seq = ['3', '2', '1', 'GO!'];
      let i = 0;
      E.count.hidden = false;
      const step = () => {
        if (id !== runId) return;
        if (i >= seq.length) { E.count.hidden = true; inCountdown = false; resolve(); return; }
        E.count.innerHTML = '';
        E.count.append(Object.assign(h('span'), { textContent: seq[i] }));
        audio.sfx(i < 3 ? 'beep' : 'go');
        i++;
        later(step, i === seq.length ? 500 : 650);
      };
      step();
    });
  }

  function stopLoop() { running = false; cancelAnimationFrame(raf); }

  // ---------- main loop ----------
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (!locked && !paused) {
      const r = eng.tick(dt);
      renderClock();
      if (r === 'timeout') onTimeout();
    }
    raf = requestAnimationFrame(loop);
  }

  function renderClock() {
    if (cfg.kind === 'zen') return;
    const t = eng.timeLeft;
    const total = cfg.kind === 'blitz' ? RULES.blitz.maxTime : RULES.daily.qTime;
    E.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, t / total))})`;
    const sec = Math.ceil(t);
    E.clockText.textContent = cfg.kind === 'blitz' ? clock(t) : `${sec}s`;
    const low = cfg.kind === 'blitz' ? 10 : 6, crit = cfg.kind === 'blitz' ? 5 : 3;
    E.clock.classList.toggle('low', t <= low && t > crit);
    E.clock.classList.toggle('crit', t <= crit);
    if (t <= crit && sec !== lastSecond && sec > 0) audio.sfx('tick');
    lastSecond = sec;
  }

  function renderHud() {
    const k = cfg.kind;
    if (k === 'blitz') {
      E.score.textContent = fmt(eng.score);
      E.hearts.innerHTML = '';
      for (let i = 0; i < RULES.blitz.lives; i++) E.hearts.insertAdjacentHTML('beforeend', icon(i < eng.lives ? 'heart' : 'heart-o', i < eng.lives ? '' : 'lost'));
      const lvl = eng.levelFor();
      E.lv.textContent = `LV ${lvl}`;
      E.lvFill.style.width = `${Math.round(eng.levelProgress * 100)}%`;
      setCombo();
    } else if (k === 'daily') {
      E.score.textContent = `${Math.min(eng.answered + 1, eng.total)}/${eng.total}`;
    } else {
      E.score.textContent = fmt(eng.correct);
    }
  }

  let comboShown = 1;
  function setCombo() {
    const m = eng.multiplier;
    E.combo.hidden = m < 2;
    E.combo.textContent = `x${m}`;
    if (m > comboShown) { E.combo.classList.remove('bump'); void E.combo.offsetWidth; E.combo.classList.add('bump'); }
    comboShown = m;
  }

  // ---------- questions & answers ----------
  function next() {
    const p = eng.next(performance.now());
    E.card.classList.remove('ok', 'bad');
    E.verdict.innerHTML = '';
    renderProblem(E.problem, p.text);
    fitProblem(E.problem);
    E.btns.forEach((b, k) => { b.disabled = false; b.className = 'answer'; b.textContent = num(p.choices[k]); });
    for (const el of [E.card, E.answers]) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
    renderHud();
    locked = false;
  }

  function answer(i) {
    if (!running || paused || locked || !eng.problem) return;
    locked = true;
    const p = eng.problem;
    const r = eng.answer(i, performance.now());
    const mark = (b, cls, ic) => { b.className = `answer ${cls}`; b.insertAdjacentHTML('beforeend', icon(ic, 'mark')); };
    E.btns.forEach((b, k) => {
      b.disabled = true;
      if (k === r.correctIndex) mark(b, 'good', 'check');
      else if (k === i) mark(b, 'bad', 'cross');
      else b.classList.add('dim');
    });
    renderProblem(E.problem, p.text.replace('?', num(p.answer)));
    fitProblem(E.problem);
    E.card.classList.add(r.correct ? 'ok' : 'bad');
    E.verdict.innerHTML = icon(r.correct ? 'check' : 'cross');

    const pos = i >= 0 ? fx.at(E.btns[i]) : fx.at(E.card);
    if (r.correct) {
      audio.sfx('correct', eng.streak); audio.buzz('correct');
      fx.burst(pos.x, pos.y, { kind: 'good' });
      if (cfg.kind === 'blitz') {
        fx.floatText(`+${r.points}`, pos.x, pos.y - 34, r.multiplier > 1 ? 'big' : '');
        if (r.timeBonus) { const c = fx.at(E.clock); fx.floatText(`+${trim(r.timeBonus)}s`, c.x + 40, c.y + 26, 'time'); }
      }
      if (r.leveledUp && cfg.kind !== 'daily') {
        banner(cfg.kind === 'zen' ? 'LEVEL UP!' : `LEVEL ${eng.levelFor()}`);
        audio.sfx('level'); audio.buzz('level');
      }
      if (cfg.kind === 'zen') setCat('happy', 1100);
    } else {
      audio.sfx('wrong'); audio.buzz('wrong');
      fx.shake(E.card); fx.flash('bad');
      if (cfg.kind === 'blitz') fx.floatText(r.timedOut ? 'TIME!' : 'MISS', pos.x, pos.y - 34, 'bad');
      if (cfg.kind === 'zen') setCat('sad', 1200);
    }
    renderHud();
    if (cfg.kind === 'blitz' && !r.correct) {
      const hearts = E.hearts.querySelectorAll('.ico');
      const lost = hearts[eng.lives]; if (lost) lost.classList.add('hit');
    }
    const id = runId;
    later(() => { if (id === runId) advance(() => (r.over ? endRun(r.over) : next())); }, r.correct ? 430 : 1050);
  }

  function onTimeout() {
    if (cfg.kind === 'daily') { answer(-1); return; }
    locked = true;
    eng.finish('time');
    audio.sfx('wrong'); audio.buzz('wrong'); fx.flash('bad');
    E.card.classList.add('bad');
    E.verdict.innerHTML = icon('cross');
    const id = runId;
    later(() => { if (id === runId) advance(() => endRun('time')); }, 650);
  }

  function banner(text) {
    E.banner.hidden = false;
    E.banner.textContent = text;
    E.banner.style.animation = 'none'; void E.banner.offsetWidth; E.banner.style.animation = '';
    later(() => { E.banner.hidden = true; }, 1300);
  }

  // ---------- cat (zen) ----------
  function setCat(state, back = 0) {
    clearTimeout(catTimer);
    E.cat.innerHTML = catSVG(state) + (state === 'sleep' ? '<span class="zzz">z z</span>' : '');
    if (back) catTimer = setTimeout(() => setCat('sleep'), back);
  }
  E.cat.onclick = () => {
    if (cfg && cfg.kind === 'zen') { setCat('happy', 1400); audio.sfx('coin'); const p = fx.at(E.cat); fx.burst(p.x, p.y - 20, { n: 8, kind: 'accent' }); }
  };

  // ---------- pause / quit ----------
  function pause() {
    if (!running || paused || inCountdown || !E.result.hidden) return;
    paused = true;
    openSheet(E.pause);
  }
  function resume() {
    if (!paused) return;
    paused = false;
    last = performance.now();
    closeSheet(E.pause);
    if (pending) { const f = pending; pending = null; f(); }
  }
  const advance = (fn) => { if (paused) pending = fn; else fn(); };
  function quit() {
    finalizeZen();
    leaveToModes();
  }
  function leaveToModes() {
    stopLoop(); clearTimers(); runId++;
    router.go(cfg.kind === 'daily' ? 'home' : 'modes', {}, { back: true });
  }

  $('#g-pausebtn').onclick = () => { if (cfg.kind === 'zen') quit(); else pause(); };
  $('#g-resume').onclick = resume;
  $('#g-restart').onclick = () => { finalizeZen(); start(); };
  $('#g-quit').onclick = quit;
  $('#g-r-again').onclick = () => start();
  $('#g-r-menu').onclick = () => leaveToModes();
  $('#g-r-share').onclick = share;

  router.guard = (screen) => {
    if (screen !== 'game') return false;
    if (!E.result.hidden) { leaveToModes(); return true; }
    if (paused) { resume(); return true; }
    if (cfg && cfg.kind === 'zen') { quit(); return true; }
    pause();
    return true;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && router.current === 'game') pause(); });
  document.addEventListener('keydown', (e) => {
    if (router.current !== 'game') return;
    if (e.key === 'Escape') { paused ? resume() : (cfg.kind === 'zen' ? quit() : pause()); return; }
    const n = ['1', '2', '3', '4'].indexOf(e.key);
    if (n >= 0) answer(n);
  });
  window.addEventListener('resize', () => { if (router.current === 'game' && E.problem.firstChild) fitProblem(E.problem); });

  // fast taps: respond on pointerdown, keep click for keyboard/assistive tech
  E.btns.forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      b.dataset.pd = '1';
      answer(Number(b.dataset.i));
    });
    b.addEventListener('click', () => {
      if (b.dataset.pd) { delete b.dataset.pd; return; }
      answer(Number(b.dataset.i));
    });
  });

  // ---------- results ----------
  function finalizeZen() {
    if (!eng || cfg.kind !== 'zen' || committed || !running) return;
    committed = true;
    const s = eng.summary();
    if (!s.answered) return;
    store.update((p) => {
      p.totals.zenSolved += s.correct; p.totals.correct += s.correct; p.totals.wrong += s.wrong;
      p.totals.bestStreak = Math.max(p.totals.bestStreak, s.bestStreak);
      p.totals.seconds += Math.round((performance.now() - startedAt) / 1000);
    });
    pushCloud();
  }

  function pushCloud(mode, score, isBest) {
    if (!cloud.user) return;
    (async () => {
      try {
        if (isBest) await cloud.submitScore(mode, score);
        await cloud.pushProfile(store.profile);
      } catch (e) { console.warn('cloud sync failed', e); }
    })();
  }

  function endRun(reason) {
    stopLoop();
    const s = eng.summary();
    const { kind, mode } = cfg;
    const prevBest = store.profile.best[mode];
    const newBest = kind === 'blitz' && s.score > prevBest && s.score > 0;
    committed = true;
    store.update((p) => {
      p.totals.correct += s.correct; p.totals.wrong += s.wrong;
      p.totals.bestStreak = Math.max(p.totals.bestStreak, s.bestStreak);
      p.totals.bestLevel = Math.max(p.totals.bestLevel, s.maxLevel);
      p.totals.seconds += Math.round((performance.now() - startedAt) / 1000);
      if (kind === 'blitz') { p.totals.blitzGames++; if (newBest) p.best[mode] = s.score; }
      if (kind === 'daily' && scored) p.days[cfg.date] = { score: s.correct, ms: Math.round(s.avgMs * s.answered), grid: s.history.map((x) => (x ? 1 : 0)).join('') };
    });
    pushCloud(mode, s.score, newBest);
    showResult({ ...s, newBest, prevBest });
  }

  function showResult(s, quiet = false) {
    const { kind, mode } = cfg;
    const title = kind === 'daily' ? 'DAILY COMPLETE' : s.over === 'lives' ? 'OUT OF LIVES' : "TIME'S UP";
    $('#g-result-t').textContent = title;
    $('#g-newbest').hidden = !s.newBest;
    const scoreEl = $('#g-r-score');
    const best = $('#g-r-best'), grid = $('#g-r-grid'), stats = $('#g-r-stats');
    stats.textContent = '';
    grid.textContent = '';
    const stat = (k, v) => { const d = h('div'); d.append(h('dt', '', k), h('dd', '', v)); stats.append(d); };
    const acc = `${Math.round(s.accuracy * 100)}%`;
    const avg = s.answered ? `${(s.avgMs / 1000).toFixed(1)}s` : '-';

    if (kind === 'daily') {
      scoreEl.textContent = `${s.correct}/${s.answered || eng?.total || 10}`;
      best.textContent = `${store.streak} DAY STREAK`;
      grid.hidden = false;
      s.history.forEach((ok) => { const q = h('span', `sq${ok ? ' ok' : ''}`); q.innerHTML = icon(ok ? 'check' : 'cross'); grid.append(q); });
      stat('Accuracy', acc); stat('Avg time', avg);
      $('#g-r-again').hidden = true;
      $('#g-r-share').className = 'btn btn-primary';
    } else {
      grid.hidden = true;
      countUp(scoreEl, s.score);
      best.textContent = s.newBest ? (s.prevBest ? `PREVIOUS BEST ${fmt(s.prevBest)}` : 'FIRST SCORE!') : `BEST ${fmt(store.profile.best[mode])}`;
      stat('Level', String(s.maxLevel)); stat('Correct', String(s.correct));
      stat('Accuracy', acc); stat('Best streak', String(s.bestStreak));
      $('#g-r-again').hidden = false;
      $('#g-r-share').className = 'btn';
    }
    openSheet(E.result);
    if (quiet) return;
    if (s.newBest) { audio.sfx('best'); audio.buzz('win'); fx.confetti(); }
    else if (kind === 'daily' && s.correct >= 8) { audio.sfx('win'); audio.buzz('win'); fx.confetti(60); }
    else audio.sfx('over');
  }

  // Re-open today's finished daily (no new run)
  function viewDaily() {
    const d = store.today;
    eng = null; running = false; paused = false; clearTimers();
    E.cat.hidden = true;
    const hist = (d.grid || '').split('').map((c) => c === '1');
    const total = hist.length || 10;
    cfg.date = utcDay();
    showResult({ correct: d.score, answered: total, accuracy: total ? d.score / total : 0, avgMs: total ? d.ms / total : 0, history: hist, over: 'done', newBest: false }, true);
  }

  async function share() {
    let text;
    if (cfg.kind === 'daily') {
      const d = store.today;
      const sq = (d && d.grid ? d.grid : '').split('').map((c) => (c === '1' ? '\u{1F7E9}' : '\u{1F7E5}')).join('');
      text = `Math Arcade Daily ${cfg.date}\n${d ? d.score : 0}/10\n${sq}`;
    } else {
      const sc = fmt(store.profile.best[cfg.mode]);
      text = `I scored ${sc} in Math Arcade Blitz (${MODE_NAME[cfg.mode]}). Can you beat it?`;
    }
    const url = location.href.split('?')[0];
    try {
      if (navigator.share) await navigator.share({ text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Copied to clipboard!'); }
    } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing is not available here'); }
  }

  // expose a tiny debug/test hook
  if (new URLSearchParams(location.search).has('debug')) window.__ma = { get eng() { return eng; }, answer };
  return { enter, leave };
}
