// Tiny pixel-art cat for Zen mode, drawn from bitmaps so it themes with CSS variables.
// '#' = body, 'o' = face details, '.' = empty

const BASE = [
  '.##........##.',
  '.###......###.',
  '.############.',
  '##############',
  '##############',
  '##############',
  '##############',
  '.############.',
  '.############.',
  '.############.',
  '..##########..',
  '..###....###..',
];

const face = {
  sleep: { 5: '##oo######oo##', 6: '######oo######' },
  awake: { 4: '##oo######oo##', 5: '##oo######oo##', 6: '######oo######' },
  happy: { 4: '###o######o###', 5: '##o#o####o#o##', 6: '######oo######', 7: '.#####oo#####.' },
  sad:   { 4: '##oo######oo##', 5: '###o######o###', 6: '######oo######', 7: '.#####oo#####.', 8: '.####o##o####.' },
};

export function catSVG(state = 'sleep') {
  const rows = BASE.map((r, i) => (face[state][i] || r).padEnd(14, '.'));
  let body = '', feat = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < 14; x++) {
      const c = row[x];
      if (c === '#') body += `M${x} ${y}h1v1h-1z`;
      else if (c === 'o') feat += `M${x} ${y}h1v1h-1z`;
    }
  });
  return `<svg viewBox="0 0 14 12" class="cat-svg" shape-rendering="crispEdges" aria-hidden="true"><path class="cat-body" d="${body}"/><path class="cat-face" d="${feat}"/></svg>`;
}
