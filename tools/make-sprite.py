#!/usr/bin/env python3
"""Pixel-icon sprite generator. Edit ICONS, run `python3 tools/make-sprite.py`,
and the block between the SPRITE markers in index.html is rewritten."""
import re, pathlib

ICONS = {
 'play': ["#........","###......","#####....","#######..","#########","#######..","#####....","###......","#........"],
 'pause': ["###.###"]*9,
 'back': ["....###","...###.","..###..",".###...","###....",".###...","..###..","...###.","....###"],
 'heart': [".##...##.","####.####","#########","#########",".#######.","..#####..","...###...","....#...."],
 'heart-o': [".##...##.","#..#.#..#","#...#...#","#.......#",".#.....#.","..#...#..","...#.#...","....#...."],
 'trophy': ["#########","#.#####.#","#.#####.#",".#######.","..#####..","...###...","....#....","...###...","..#####.."],
 'chart': [".......##",".......##","...##..##","...##..##","##.##..##","##.##..##","##.##..##","##.##..##","#########"],
 'cog': ["....#....",".##.#.##.",".#######.","..##.##..","###...###","..##.##..",".#######.",".##.#.##.","....#...."],
 'user': ["...###...","..#####..","..#####..","...###...",".#######.","#########","#########","#########"],
 'vol': ["....#......","...##..#...","####....#..","####.#..#..","####.#..#..","####....#..","...##..#...","....#......"],
 'mute': ["....#......","...##......","####.#...#.","####..#.#..","####...#...","####..#.#..","...##.#...#","....#......"],
 'flame': ["...#...","...##..","..###..",".####.#",".#####.","######.","######.",".####..","..##..."],
 'bolt': ['....##.','...##..','..##...','.#####.','...##..','..##...','.##....','.#.....'],
 'cal': [".#.....#.","#########","#.......#","#.#.#.#.#","#.......#","#.#.#.#.#","#.......#","#.......#","#########"],
 'check': ["........#",".......##","#.....##.","##...##..",".##.##...","..###....","...#....."],
 'cross': ["##...##","###.###",".#####.","..###..",".#####.","###.###","##...##"],
 'coffee': ['..#..#......','...#..#.....','..#..#......','............','.########...','.########.##','.########..#','.########.##','..######....','.##########.'],
 'store': ["#.#.#.#.#","#########","#.......#","#.##.##.#","#.##.##.#","#.......#","#..###..#","#..#.#..#","#########"],
 'refresh': ["...####.#","..##..###","##....###","#......##","#.......#","#.......#","##.....##",".##...##.","..#####.."],
 'root': ["......#.","......#.",".....#..",".....#..","#...#...",".#.#....","..#....."],
}

# Any tools/icons/<name>.svg (e.g. from pixelarticons, MIT) overrides the grid icon of the same name.
def svg_symbol(name, f):
    t = f.read_text()
    vb = re.search(r'viewBox="([^"]+)"', t).group(1)
    d = ''.join(re.findall(r'<path[^>]*\sd="([^"]+)"', t))
    return f'<symbol id="i-{name}" viewBox="{vb}"><path d="{d}"/></symbol>'

def symbol(name, rows):
    w, h = max(len(r) for r in rows), len(rows)
    d = []
    for y, row in enumerate(rows):
        x = 0
        while x < w:
            if x < len(row) and row[x] == '#':
                s = x
                while x < len(row) and row[x] == '#': x += 1
                d.append(f"M{s} {y}h{x-s}v1h-{x-s}z")
            else:
                x += 1
    return f'<symbol id="i-{name}" viewBox="0 0 {w} {h}"><path d="{"".join(d)}"/></symbol>'

ICONS_DIR = pathlib.Path(__file__).resolve().parent / 'icons'
ICONS.setdefault('store', None); ICONS.setdefault('edit', None)
sprite = ('<!-- SPRITE:START -->\n<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false" shape-rendering="crispEdges">'
          + ''.join(svg_symbol(n, ICONS_DIR / f'{n}.svg') if (ICONS_DIR / f'{n}.svg').exists() else symbol(n, r) for n, r in ICONS.items()) + '</svg>\n<!-- SPRITE:END -->')
p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
html = p.read_text()
html = re.sub(r'<!-- SPRITE:START -->.*?<!-- SPRITE:END -->', lambda m: sprite, html, flags=re.S)
p.write_text(html)
print('sprite updated:', len(ICONS), 'icons')
