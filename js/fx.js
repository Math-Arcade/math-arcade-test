// Visual effects: pixel particles + confetti on one canvas, floating score text, shake, flash.

let canvas, ctx, W = 0, H = 0, dpr = 1, raf = 0, last = 0;
let parts = [];
let store = null;
let layer = null;
const colors = { primary: '#19C37D', accent: '#6EE7B7', good: '#19C37D', bad: '#FF5C6C', warn: '#FFC53D' };

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of Object.keys(colors)) {
    const v = cs.getPropertyValue(k === 'accent' ? '--primary-2' : `--${k}`).trim();
    if (v) colors[k] = v;
  }
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  ctx.clearRect(0, 0, W, H);
  parts = parts.filter((p) => (p.life -= dt) > 0);
  for (const p of parts) {
    p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
    ctx.fillStyle = p.c;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
  ctx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(frame) : 0;
}

function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
const on = () => store.settings.particles && !store.settings.reduceMotion;

export const fx = {
  init(s) {
    store = s;
    canvas = document.getElementById('fx');
    layer = document.getElementById('fx-layer');
    ctx = canvas.getContext('2d');
    resize(); readColors();
    window.addEventListener('resize', resize);
    store.on('settings', (k) => { if (k === 'theme') requestAnimationFrame(readColors); });
  },

  burst(x, y, { n = 14, kind = 'good', speed = 280, size = 6 } = {}) {
    if (!on()) return;
    const base = [colors[kind] || colors.primary, colors.accent, colors.primary];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 800, life: 0.6 + Math.random() * 0.4, max: 1,
        s: size * (0.6 + Math.random() * 0.9) | 0 || 3, c: base[i % base.length] });
    }
    kick();
  },

  confetti(n = 110) {
    if (!on()) return;
    const pal = [colors.primary, colors.accent, colors.warn, colors.good, '#ffffff'];
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * W, y: -10 - Math.random() * H * 0.3, vx: (Math.random() - 0.5) * 140, vy: 120 + Math.random() * 220,
        g: 160, life: 1.8 + Math.random() * 1.4, max: 2, s: 5 + ((Math.random() * 5) | 0), c: pal[i % pal.length] });
    }
    kick();
  },

  floatText(text, x, y, cls = '') {
    if (!layer) return;
    const d = document.createElement('div');
    d.className = `float ${cls}`;
    d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  },

  clear() { parts = []; if (ctx) ctx.clearRect(0, 0, W, H); if (layer) layer.textContent = ''; },

  at(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },

  shake(el) {
    if (store.settings.reduceMotion) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 450);
  },

  flash(kind = 'bad') {
    const f = document.getElementById('flash');
    if (!f || store.settings.reduceMotion) return;
    f.className = '';
    void f.offsetWidth;
    f.className = `on ${kind}`;
  },
};
