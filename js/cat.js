// Zen mode's ginger cat, drawn from a pixel bitmap (left half is mirrored, so it is always symmetric).
// Palette: # body   d dark outline/stripes   w cream (ears, muzzle, chest, paws)   o eyes/nose   . empty

const HALF = [
  '....d......',
  '...d#d.....',
  '..d#w#d....',
  '..d#w#ddddd',
  '.d######d#d',
  'd#########d',
  'd##########',
  'd##########',
  'd#######wwo',
  'd#######wow',
  '.d#####wwww',
  '..ddddddddd',
  '..d########',
  '.d######www',
  '.d#####wwww',
  '.d#####wwww',
  '.d#####wwww',
  '.d#########',
  '.d###www###',
  '.dddddddddd',
];

// face rows (6-9) per state; everything else stays the same
const FACE = {
  idle:  { 6: 'd###wo#####', 7: 'd###oo#####', 8: 'd###oo##wwo', 9: 'd#######wow' },
  sleep: { 6: 'd##########', 7: 'd##ooo#####', 8: 'd#######wwo', 9: 'd#######wow' },
  happy: { 6: 'd####o#####', 7: 'd###o#o####', 8: 'd#######wwo', 9: 'd#######wow' },
  blink: { 6: 'd##########', 7: 'd##ooo#####', 8: 'd###oo##wwo', 9: 'd#######wow' },
  sad:   { 6: 'd##########', 7: 'd###oo#####', 8: 'd###o###wwo', 9: 'd###w###wow' },
};

// tail: 4 columns placed to the right of the body (cols 22-25), rows 10-19
const TAIL = [
  '.dd.', 'd##d', 'd##d', 'd##d', 'd##d', 'd##d', 'd##d', 'd##d', '###d', 'ddd.',
];
const TAIL_TOP = 10, TAIL_LEFT = 22, W = 26, H = 20;

export function catRows(state = 'idle') {
  const face = FACE[state] || FACE.idle;
  const rows = HALF.map((r, i) => {
    const half = face[i] || r;
    return ('.' + half + [...half].reverse().join('')).padEnd(W, '.');
  });
  const tail = rows.map(() => null);
  TAIL.forEach((t, k) => { tail[TAIL_TOP + k] = t; });
  return { rows, tail };
}

export function catSVG(state = 'idle') {
  const { rows, tail } = catRows(state);
  const paths = { b: '', d: '', w: '', o: '' }, tpaths = { b: '', d: '' };
  const key = { '#': 'b', d: 'd', w: 'w', o: 'o' };
  rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) if (key[row[x]]) paths[key[row[x]]] += `M${x} ${y}h1v1h-1z`;
    const t = tail[y];
    if (t) for (let k = 0; k < t.length; k++) {
      const c = t[k] === '#' ? 'b' : t[k] === 'd' ? 'd' : null;
      if (c) tpaths[c] += `M${TAIL_LEFT + k} ${y}h1v1h-1z`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="cat-svg" shape-rendering="crispEdges" aria-hidden="true">
    <g class="cat-tail"><path class="cat-b" d="${tpaths.b}"/><path class="cat-d" d="${tpaths.d}"/></g>
    <g class="cat-body"><path class="cat-b" d="${paths.b}"/><path class="cat-d" d="${paths.d}"/><path class="cat-w" d="${paths.w}"/><path class="cat-o" d="${paths.o}"/></g></svg>`;
}
