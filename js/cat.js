// Zen mode's cat: one colour, drawn from a pixel bitmap (the left half is mirrored, so it is always symmetric).
// '#' = filled, '.' = empty. The eyes and nose are cut-outs, so the cat takes whatever colour the theme's text is.

const HALF = [
  '.#.....',
  '.##....',
  '.######',
  '.######',
  '.######',
  '.######',
  '.#####.',
  '..#####',
  '.######',
  '#######',
  '#######',
  '#######',
  '#######',
  '.##.###',
];

// face rows (3-5) per state; everything else stays the same
const FACE = {
  idle:  { 3: '.##.###', 4: '.##.###', 5: '.######' },
  blink: { 3: '.######', 4: '.##..##', 5: '.######' },
  sleep: { 3: '.######', 4: '.##..##', 5: '.######' },
  happy: { 3: '.##.###', 4: '.#.#.##', 5: '.######' }, // ^ ^
  sad:   { 3: '.######', 4: '.##.###', 5: '.##.###' },
};

// tail: 4 columns to the right of the body (cols 14-17), rows 7-12
const TAIL = { 7: '...#', 8: '...#', 9: '...#', 10: '..##', 11: '.##.', 12: '##..' };
const TAIL_LEFT = 14, W = 18, H = 14;

export function catRows(state = 'idle') {
  const face = FACE[state] || FACE.idle;
  const rows = HALF.map((r, i) => {
    const half = face[i] || r;
    return half + [...half].reverse().join('');
  });
  const tail = rows.map((_, y) => TAIL[y] || null);
  return { rows, tail };
}

export function catSVG(state = 'idle') {
  const { rows, tail } = catRows(state);
  let body = '', tl = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') body += `M${x} ${y}h1v1h-1z`;
    const t = tail[y];
    if (t) for (let k = 0; k < t.length; k++) if (t[k] === '#') tl += `M${TAIL_LEFT + k} ${y}h1v1h-1z`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="cat-svg" shape-rendering="crispEdges" aria-hidden="true">
    <g class="cat-tail"><path class="cat-px" d="${tl}"/></g>
    <g class="cat-body"><path class="cat-px" d="${body}"/></g></svg>`;
}
