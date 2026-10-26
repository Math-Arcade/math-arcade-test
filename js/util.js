export const $ = (sel, root = document) => {
  const n = root.querySelector(sel);
  if (!n) throw new Error(`Missing element: ${sel}`);
  return n;
};
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

export function clock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Build the big problem text safely (no innerHTML with data): handles ^2 and √.
export function renderProblem(el, text) {
  el.textContent = '';
  const re = /√(\d+)|\^2/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) el.append(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const rad = document.createElement('span');
      rad.className = 'rad';
      rad.innerHTML = '<svg class="ico rad-sign" aria-hidden="true"><use href="#i-root"></use></svg>';
      const n = document.createElement('span');
      n.className = 'radicand';
      n.textContent = m[1];
      rad.append(n);
      el.append(rad);
    } else {
      const sup = document.createElement('sup');
      sup.textContent = '2';
      el.append(sup);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
  const len = text.replace(/\^2/g, '²').length;
  el.style.setProperty('--fit', len <= 8 ? 1 : len <= 11 ? 0.86 : len <= 14 ? 0.72 : 0.6);
  el.setAttribute('aria-label', text
    .replace(/√(\d+)/g, 'square root of $1').replace(/\^2/g, ' squared')
    .replace('−', 'minus').replace('×', 'times').replace('÷', 'divided by').replace('?', 'what'));
}

export function countUp(el, to, ms = 800, format = fmt) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = format(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

export function h(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// numbers shown to the player use a real minus sign
export const num = (n) => String(n).replace('-', '\u2212');

// Shrink the big problem text so it never overflows its card.
export function fitProblem(el) {
  el.style.setProperty('--fit', 1);
  const avail = el.parentElement.clientWidth - 30;
  const w = el.offsetWidth;
  if (w > avail && w > 0) el.style.setProperty('--fit', Math.max(0.35, avail / w).toFixed(3));
}

export function trim(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
