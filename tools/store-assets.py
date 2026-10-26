#!/usr/bin/env python3
"""Regenerates the Google Play listing art in store/: 6 phone screenshots (1080x1920)
and the 1024x500 feature graphic. Needs: pip install playwright pillow fonttools brotli."""
import http.server, threading, functools, pathlib, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'store'; (OUT / 'screenshots').mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_port}/index.html?debug'

def cor(pg): return pg.evaluate("window.__ma.eng.problem.correctIndex")
def tap(pg, i): pg.locator(f'#g-answers .answer[data-i="{i}"]').tap()

with sync_playwright() as p:
    b = p.chromium.launch()
    def page(theme):
        ctx = b.new_context(viewport={'width': 360, 'height': 640}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); pg.goto(BASE)
        pg.evaluate(f"localStorage.setItem('ma2.settings', JSON.stringify({{theme:'{theme}', duelTarget:10}}))")
        pg.reload(); pg.wait_for_timeout(1500); return pg
    shot = lambda pg, n: pg.screenshot(path=str(OUT / 'screenshots' / f'{n}.png'))

    pg = page('green'); shot(pg, '1-home'); pg.context.close()

    pg = page('blue'); pg.locator('#h-play').tap(); pg.wait_for_timeout(450); pg.locator('#m-blitz').tap(); pg.wait_for_timeout(3700)
    for _ in range(7): tap(pg, cor(pg)); pg.wait_for_timeout(620)
    pg.wait_for_timeout(250); shot(pg, '2-blitz'); pg.context.close()

    pg = page('purple'); pg.locator('#h-play').tap(); pg.wait_for_timeout(450); pg.locator('#m-duel').tap(); pg.wait_for_timeout(3900)
    for who in (0, 1, 0, 0, 1, 0, 1):
        pg.evaluate(f"window.__duel.press({who}, window.__duel.eng.problem.correctIndex)"); pg.wait_for_timeout(950)
    shot(pg, '3-duel'); pg.context.close()

    pg = page('yellow'); pg.locator('#h-daily').tap(); pg.wait_for_timeout(3700)
    for i in range(10):
        c = cor(pg); tap(pg, c if i != 4 else (c + 1) % 4); pg.wait_for_timeout(1250 if i == 4 else 650)
    pg.wait_for_timeout(3600); shot(pg, '4-daily'); pg.context.close()

    pg = page('red'); pg.locator('#h-play').tap(); pg.wait_for_timeout(450); pg.locator('[data-op="mul"]').first.tap(); pg.locator('#m-zen').tap(); pg.wait_for_timeout(800)
    tap(pg, cor(pg)); pg.wait_for_timeout(1500); shot(pg, '5-zen'); pg.context.close()

    pg = page('colorblind'); pg.locator('#h-settings').tap(); pg.wait_for_timeout(600)
    pg.evaluate("document.querySelector('section[data-screen=settings] .scroll').scrollTo(0, 330)"); pg.wait_for_timeout(300); shot(pg, '6-themes'); pg.context.close()
    b.close()

# ---- feature graphic 1024x500
def ttf(name):
    f = TTFont(ROOT / f'assets/fonts/{name}-latin-400-normal.woff2'); f.flavor = None
    buf = io.BytesIO(); f.save(buf); buf.seek(0); return buf
px = lambda s: ImageFont.truetype(ttf('press-start-2p'), s)
W, H = 1024, 500
img = Image.new('RGB', (W, H), (18, 26, 36)); d = ImageDraw.Draw(img)
for x in range(0, W, 40): d.line([(x, 0), (x, H)], fill=(24, 36, 48), width=2)
for y in range(0, H, 40): d.line([(0, y), (W, y)], fill=(24, 36, 48), width=2)
def shadow_text(xy, text, font, fill, sh):
    x, y = xy
    for o in (8, 4): d.text((x, y + o), text, font=font, fill=sh)
    d.text((x, y), text, font=font, fill=fill)
shadow_text((60, 120), 'MATH', px(110), (110, 231, 183), (11, 95, 64))
shadow_text((64, 262), 'ARCADE', px(64), (234, 242, 250), (47, 66, 89))
d.text((66, 380), 'Beat the clock. Duel a friend.', font=px(15), fill=(148, 168, 189))
tiles = [('+', (25, 195, 125)), ('-', (255, 197, 61)), ('x', (255, 92, 108)), ('/', (76, 141, 255))]
for i, (s, col) in enumerate(tiles):
    x, y = 640 + (i % 2) * 175, 70 + (i // 2) * 185
    d.rounded_rectangle([x, y + 8, x + 150, y + 158], 14, fill=(11, 16, 22))
    d.rounded_rectangle([x, y, x + 150, y + 150], 14, fill=(27, 38, 51), outline=(47, 66, 89), width=4)
    cx, cy, k = x + 75, y + 75, 38
    if s == '+': d.rectangle([cx - k, cy - 8, cx + k, cy + 8], fill=col); d.rectangle([cx - 8, cy - k, cx + 8, cy + k], fill=col)
    if s == '-': d.rectangle([cx - k, cy - 8, cx + k, cy + 8], fill=col)
    if s == 'x': d.line([cx - k, cy - k, cx + k, cy + k], fill=col, width=18); d.line([cx - k, cy + k, cx + k, cy - k], fill=col, width=18)
    if s == '/': d.rectangle([cx - k, cy - 8, cx + k, cy + 8], fill=col); d.rectangle([cx - 9, cy - 38, cx + 9, cy - 20], fill=col); d.rectangle([cx - 9, cy + 20, cx + 9, cy + 38], fill=col)
img.save(OUT / 'feature-graphic.png')
print('store assets written to', OUT)
