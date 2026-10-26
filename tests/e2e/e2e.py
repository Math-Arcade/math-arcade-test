#!/usr/bin/env python3
"""Browser smoke tests: every mode, back button, auto-pause, and the full online flow
against a mocked Firebase (tests/e2e/mock). Needs: pip install playwright && playwright install chromium
Run from the project root:  python3 tests/e2e/e2e.py"""
import http.server, threading, functools, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK = pathlib.Path(__file__).resolve().parent / 'mock'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/index.html?debug'

fails, errors = [], []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

view = lambda pg: pg.evaluate("document.body.dataset.view")
cor = lambda pg: pg.evaluate("window.__ma.eng.problem.correctIndex")
tap = lambda pg, i: pg.locator(f'#g-answers .answer[data-i="{i}"]').tap()
back = lambda pg, scr: pg.locator(f'section[data-screen={scr}] [data-back]').tap()
fb = lambda pg, expr: pg.evaluate(f"(() => {{ const S = window.__fbmock; return {expr}; }})()")
def fresh(b, mock=False):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    if mock:
        ctx.route('https://www.gstatic.com/firebasejs/10.13.1/*.js', lambda r: r.fulfill(
            status=200, content_type='application/javascript', headers={'access-control-allow-origin': '*'},
            body=(MOCK / r.request.url.split('/')[-1]).read_text()))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'gstatic' not in m.text and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(1400)
    return pg

with sync_playwright() as p:
    b = p.chromium.launch()

    print('Blitz / Zen / Duel / Daily / navigation')
    pg = fresh(b)
    check(view(pg) == 'home', 'app boots to Home (offline guest, Firebase unreachable)')
    pg.locator('#h-play').tap(); pg.wait_for_timeout(450); pg.locator('#m-blitz').tap(); pg.wait_for_timeout(3700)
    for _ in range(5): tap(pg, cor(pg)); pg.wait_for_timeout(620)
    check(int(pg.inner_text('#g-score').replace(',', '')) > 0 and pg.is_visible('#g-combo'), 'Blitz scores points and shows the combo multiplier')
    pg.go_back(); pg.wait_for_timeout(400)
    check(pg.is_visible('#g-pause') and view(pg) == 'game', 'Android back button pauses the game')
    t0 = pg.evaluate("window.__ma.eng.timeLeft"); pg.wait_for_timeout(1200)
    check(abs(t0 - pg.evaluate("window.__ma.eng.timeLeft")) < 0.05, 'clock is frozen while paused')
    pg.locator('#g-resume').tap(); pg.wait_for_timeout(300)
    for _ in range(3): tap(pg, (cor(pg) + 1) % 4); pg.wait_for_timeout(1300)
    pg.wait_for_timeout(500)
    check('OUT OF LIVES' in pg.inner_text('#g-result-t') and pg.is_visible('#g-newbest'), 'three misses end the run and flag a new best')
    check(pg.evaluate("JSON.parse(localStorage.getItem('ma2.profile')).best.mix") > 0, 'best score is saved locally')
    pg.locator('#g-r-menu').tap(); pg.wait_for_timeout(450)
    stats_before = pg.evaluate("localStorage.getItem('ma2.profile')")
    pg.locator('#m-zen').tap(); pg.wait_for_timeout(700); tap(pg, cor(pg)); pg.wait_for_timeout(300)
    check(pg.inner_text('#g-score') == '1', 'Zen counts solved questions')
    pg.locator('#g-pausebtn').tap(); pg.wait_for_timeout(500)
    check(view(pg) == 'modes' and pg.evaluate("localStorage.getItem('ma2.profile')") == stats_before, 'Zen never counts toward stats')
    pg.locator('#m-targets [data-n="5"]').tap(); pg.locator('#m-duel').tap(); pg.wait_for_timeout(3900)
    pg.evaluate("window.__duel.press(1,(window.__duel.eng.problem.correctIndex+1)%4)"); pg.wait_for_timeout(200)
    check(pg.evaluate("window.__duel.eng.scores[1]") == 0, 'Duel: a wrong answer never drops below zero')
    for _ in range(5): pg.wait_for_timeout(900); pg.evaluate("window.__duel.press(0, window.__duel.eng.problem.correctIndex)")
    pg.wait_for_timeout(2200)
    check('PLAYER 1 WINS' in pg.inner_text('#d-result-t'), 'Duel: first to 5 wins')
    pg.locator('#d-r-menu').tap(); pg.wait_for_timeout(450); back(pg, 'modes'); pg.wait_for_timeout(450)
    pg.locator('#h-daily').tap(); pg.wait_for_timeout(3700)
    for i in range(10): c = cor(pg); tap(pg, c if i != 3 else (c + 1) % 4); pg.wait_for_timeout(1250 if i == 3 else 650)
    pg.wait_for_timeout(500)
    check('DAILY COMPLETE' in pg.inner_text('#g-result-t') and pg.inner_text('#g-r-score') == '9/10', 'Daily: 10 questions, result 9/10')
    pg.locator('#g-r-menu').tap(); pg.wait_for_timeout(450)
    check('Done: 9/10' in pg.inner_text('#h-daily-sub') and pg.inner_text('#h-streak-n') == '1', 'Home shows daily done + 1 day streak')
    pg.locator('#h-daily').tap(); pg.wait_for_timeout(700)
    check(pg.is_visible('#g-result') and pg.inner_text('#g-r-score') == '9/10', 'reopening a finished Daily shows the saved result')
    pg.context.close()

    print('Online flow (mock Firebase)')
    pg = fresh(b, mock=True)
    pg.locator('#h-player').tap(); pg.wait_for_timeout(450); pg.locator('#a-switch').tap()
    pg.fill('#a-name', 'Tester'); pg.fill('#a-email', 't@x.io'); pg.fill('#a-pass', 'secret1'); pg.locator('#a-submit').tap(); pg.wait_for_timeout(900)
    check(pg.inner_text('#h-name') == 'Tester' and view(pg) == 'home', 'sign up works and returns Home')
    pg.locator('#h-play').tap(); pg.wait_for_timeout(450); pg.locator('#m-blitz').tap(); pg.wait_for_timeout(3700)
    for _ in range(3): tap(pg, cor(pg)); pg.wait_for_timeout(620)
    for _ in range(3): tap(pg, (cor(pg) + 1) % 4); pg.wait_for_timeout(1300)
    pg.wait_for_timeout(500); pg.locator('#g-r-menu').tap(); pg.wait_for_timeout(450); back(pg, 'modes'); pg.wait_for_timeout(450)
    check(fb(pg, "S.db.leaderboard.mix.u1.score") > 0 and fb(pg, "S.db.usernames.tester") == 'u1', 'score is posted to the leaderboard and the name is claimed')
    pg.locator('#h-ranks').tap(); pg.wait_for_timeout(1000)
    check(pg.locator('.lb-row.me .lb-name').inner_text() == 'Tester', 'leaderboard highlights the player')
    back(pg, 'leaderboard'); pg.wait_for_timeout(450)
    pg.locator('#h-settings').tap(); pg.wait_for_timeout(450)
    pg.get_by_role('button', name='SIGN OUT').tap(); pg.wait_for_timeout(500); back(pg, 'settings'); pg.wait_for_timeout(450)
    check(pg.inner_text('#h-name') == 'Guest', 'sign out returns to guest')
    pg.locator('#h-player').tap(); pg.wait_for_timeout(450); pg.locator('#a-switch').tap()
    pg.fill('#a-name', 'TESTER'); pg.fill('#a-email', 'o@x.io'); pg.fill('#a-pass', 'secret1'); pg.locator('#a-submit').tap(); pg.wait_for_timeout(800)
    check('already taken' in pg.inner_text('#a-msg'), 'player names are unique (case-insensitive)')
    pg.locator('#a-switch').tap(); pg.fill('#a-email', 't@x.io'); pg.fill('#a-pass', 'bad'); pg.locator('#a-submit').tap(); pg.wait_for_timeout(700)
    check('incorrect' in pg.inner_text('#a-msg'), 'wrong password shows a friendly error')
    pg.fill('#a-pass', 'secret1'); pg.locator('#a-submit').tap(); pg.wait_for_timeout(1200)
    check(pg.inner_text('#h-name') == 'Tester', 'sign in works')
    pg.locator('#h-settings').tap(); pg.wait_for_timeout(450); pg.get_by_role('button', name='DELETE ACCOUNT').tap(); pg.wait_for_timeout(450)
    pg.fill('#dlg-in', 'nope'); pg.locator('#dlg-ok').tap(); pg.wait_for_timeout(600)
    check('Wrong password' in pg.inner_text('#dlg-err'), 'delete account: wrong password is rejected and the dialog stays open')
    pg.fill('#dlg-in', 'secret1'); pg.locator('#dlg-ok').tap(); pg.wait_for_timeout(900)
    check(fb(pg, "Object.keys(S.users).length") == 0 and fb(pg, "Object.keys(S.db.users||{}).length") == 0 and fb(pg, "Object.keys(S.db.leaderboard.mix||{}).length") == 0 and fb(pg, "Object.keys(S.db.usernames||{}).length") == 0,
          'delete account removes the login, cloud profile, leaderboard entries and name claim')
    pg.context.close()
    b.close()

check(not errors, 'no JavaScript errors in any run' + (f' -> {errors[:3]}' if errors else ''))
print(f'\n{"PASSED" if not fails else "FAILED: " + str(len(fails))}')
sys.exit(1 if fails else 0)
