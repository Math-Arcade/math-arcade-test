#!/usr/bin/env python3
"""Account system regression tests (guests, registration, switching, renaming, deletion) against the mocked Firebase.
Run from the project root:  python3 tests/e2e/accounts.py"""
import http.server, threading, functools, pathlib, json, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK = pathlib.Path(__file__).resolve().parent / 'mock'
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/index.html?debug'

fails = []
def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond: fails.append(msg)

CALL = """async ([fn, args]) => { try { const r = await window.__cloud[fn](...args); return { ok: true, name: r && r.name ? r.name : null }; }
  catch (e) { return { ok: false, code: e.code || e.message, msg: (await import('./js/cloud.js')).friendlyError(e) }; } }"""

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 760}); pg = ctx.new_page()
    errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    ctx.route('https://www.gstatic.com/firebasejs/10.13.1/*.js', lambda r: r.fulfill(status=200, content_type='application/javascript', headers={'access-control-allow-origin': '*'}, body=(MOCK / r.request.url.split('/')[-1]).read_text()))
    pg.add_init_script("window.__fbmock = { users: {}, cur: null, subs: [], db: {}, n: 0, anon: true };")
    ev = lambda js, arg=None: pg.evaluate(js, arg)
    cloud = lambda fn, *a: pg.evaluate(CALL, [fn, list(a)])
    db = lambda: ev("window.__fbmock.db")
    xp = lambda: ev("window.__store.profile.xp")
    owner = lambda: ev("window.__store.owner")
    slot = lambda key: (lambda v: json.loads(v) if v else None)(ev("(k) => localStorage.getItem(k)", key))
    last = {'uid': None}
    def guest(_label=None):  # waits for the next guest session (whatever its uid) and returns that uid
        pg.wait_for_function("(prev) => window.__cloud?.user && window.__cloud.user.guest && window.__cloud.user.uid !== prev", arg=last['uid'], timeout=10000); pg.wait_for_timeout(700)
        last['uid'] = ev("window.__cloud.user.uid"); return last['uid']
    def signed(uid):
        pg.wait_for_function("(u) => window.__cloud?.user && !window.__cloud.user.guest && window.__cloud.user.uid === u", arg=uid, timeout=10000); pg.wait_for_timeout(900)
    def give(n, best=0):
        ev("([n, b]) => window.__store.update((p) => { p.xp = n; p.best.mix = b; })", [n, best]); pg.wait_for_timeout(300)

    FOOT = """(uid) => { const out = {}; const walk = (n, path) => { if (n && typeof n === 'object') { for (const [k, v] of Object.entries(n)) { if (k === uid) out[path + '/' + k] = JSON.stringify(v); walk(v, path + '/' + k); } } else if (n === uid) out[path] = uid; }; walk(window.__fbmock.db, ''); return out; }"""
    footprint = lambda uid: ev(FOOT, uid)
    def seed_guest(uid, name):
        ev("""([uid, name]) => { const d = window.__fbmock.db; const t = Date.now();
          d.friends = Object.assign(d.friends || {}, { [uid]: { fx: 'Fox' }, fx: Object.assign((d.friends || {}).fx || {}, { [uid]: name }) });
          d.friendRequests = Object.assign(d.friendRequests || {}, { [uid]: { iy: { name: 'Iris', ts: 5 } }, oz: Object.assign((d.friendRequests || {}).oz || {}, { [uid]: { name, ts: 6 } }) });
          d.friendSent = Object.assign(d.friendSent || {}, { iy: Object.assign((d.friendSent || {}).iy || {}, { [uid]: { name, ts: 5 } }), [uid]: { oz: { name: 'Oz', ts: 6 } } });
          d.dailyResults = Object.assign(d.dailyResults || {}, { [uid]: { '2026-01-01': { name, score: 7, total: 10, ms: 900, grid: '1111111000' } } }); }""", [uid, name])
    pg.goto(URL); guest('g1')
    print('Guest -> registered (upgrade in place)')
    check(owner() == 'guest' and any(v == 'g1' for v in db()['usernames'].values()), 'the app starts as a guest with a reserved guest name')
    give(500, 100); cloud('submitScore', 'mix', 100)
    guest_name = ev("window.__cloud.user.name")
    r = cloud('signUp', 'Alice', 'a@x.io', 'secret1'); signed('g1')
    check(r['ok'] and ev("window.__cloud.user.uid") == 'g1' and owner() == 'g1', 'registering upgrades the guest account in place (same uid)')
    check(xp() == 500 and slot('ma2.profile')['xp'] == 0, "the guest's progress moves into the new account and the guest slot starts fresh")
    d = db()
    check(d['usernames'].get('alice') == 'g1' and guest_name.lower() not in d['usernames'] and sum(1 for v in d['usernames'].values() if v == 'g1') == 1, 'the new name is claimed and the old guest name released (no duplicates)')
    check(d['leaderboard']['mix']['g1']['name'] == 'Alice', 'the existing leaderboard entry shows the new name')
    check(list(ev("Object.keys(window.__fbmock.alive)")) == ['g1'], 'no abandoned guest login is left behind')

    r = ev("async () => { const c = window.__cloud; const [a, b] = await Promise.allSettled([c.reserveUsername('Zoe', 'uA'), c.reserveUsername('zoe', 'uB')]); return [a.status, b.status, window.__fbmock.db.usernames.zoe]; }")
    check(sorted(r[:2]) == ['fulfilled', 'rejected'] and r[2] in ('uA', 'uB'), 'two simultaneous claims of the same name (any capitalisation): exactly one wins')
    ev("delete window.__fbmock.db.usernames.zoe")
    print('Account -> guest isolation')
    cloud('signOut'); guest('g2')
    check(owner() == 'guest' and xp() == 0, "signing out never leaves the account's progress on screen")
    give(40, 30)
    print('Guest -> existing account (no transfer, no ghosts)')
    r = cloud('signIn', 'a@x.io', 'secret1'); signed('g1')
    d = db()
    check(owner() == 'g1' and xp() == 500, "the existing account keeps only its own progress (not 540)")
    check('g2' not in d.get('users', {}) and 'g2' not in d['leaderboard'].get('mix', {}) and 'g2' not in d['usernames'].values() and 'g2' not in ev("window.__fbmock.alive"), "the abandoned guest's online traces are removed")
    cloud('signOut'); guest('g3')
    check(owner() == 'guest' and xp() == 40, "back as a guest you see the guest's own progress, not the account's")
    print('Account A / B / guest switching')
    r = cloud('signUp', 'Bob', 'b@x.io', 'secret1'); signed('g3')
    check(owner() == 'g3' and xp() == 40, 'a new account carries the guest progress it was registered from')
    cloud('signOut'); guest('g4'); check(xp() == 0, 'after signing out the guest slot is empty again')
    cloud('signIn', 'a@x.io', 'secret1'); signed('g1'); check(xp() == 500, 'A -> guest -> A restores A')
    cloud('signOut'); guest('g5')
    cloud('signIn', 'b@x.io', 'secret1'); signed('g3'); check(xp() == 40, "A -> B: B never inherits A's progress")
    check(slot('ma2.profile.g1')['xp'] == 500 and slot('ma2.profile.g3')['xp'] == 40, 'each account has its own local profile')
    print('Wrong password keeps the guest')
    cloud('signOut'); guest('g6'); give(7, 20); cloud('submitScore', 'mix', 20)
    r = cloud('signIn', 'a@x.io', 'WRONG')
    pg.wait_for_timeout(1200)
    d = db()
    check((not r['ok']) and r['code'] == 'auth/invalid-credential' and ev("window.__cloud.user.uid") == 'g6' and ev("window.__cloud.user.guest"), 'a failed sign-in leaves you signed in as the same guest')
    check(d['leaderboard']['mix'].get('g6', {}).get('score') == 20 and 'g6' in d['usernames'].values() and xp() == 7, "and the guest's leaderboard entry, name and progress are all still there")

    print('Registration errors')
    ev("window.__fbmock.db.usernames.carol = 'u99'")
    r = cloud('signUp', 'CAROL', 'c@x.io', 'secret1')
    check((not r['ok']) and r['code'] == 'name-taken' and 'c@x.io' not in ev("Object.keys(window.__fbmock.users)") and ev("window.__cloud.user.uid") == 'g6', 'a taken name (any capitalisation) is refused and nothing is created')
    r = cloud('signUp', 'BOB', 'bb@x.io', 'secret1')
    check((not r['ok']) and r['code'] == 'name-taken', 'registered names are unique ignoring case')
    r = cloud('signUp', 'Dave', 'a@x.io', 'secret1')
    check((not r['ok']) and r['code'] == 'auth/email-already-in-use' and 'dave' not in db()['usernames'], 'an email already in use says so and releases the name it reserved')
    r = cloud('signUp', 'Eve', 'e@x.io', '123')
    check((not r['ok']) and r['code'] == 'auth/weak-password' and 'eve' not in db()['usernames'], 'a weak password is reported as such, without an orphaned name')
    ev("window.__fbmock.failDb = { ops: ['transaction'] }")
    r = cloud('signUp', 'Frank', 'f@x.io', 'secret1')
    ev("window.__fbmock.failDb = null")
    check((not r['ok']) and 'taken' not in r['msg'] and 'not ready' in r['msg'], 'a database failure is not reported as "name already taken"')
    ev("window.__fbmock.fail = { link: true }")
    r = cloud('signUp', 'Frank', 'f@x.io', 'secret1')
    ev("window.__fbmock.fail = null")
    check((not r['ok']) and "Can't reach" in r['msg'] and 'frank' not in db()['usernames'], 'a network failure says so and releases the reserved name')
    for bad, code in (('a', 'name-length'), ('x' * 17, 'name-length'), ('bad!name', 'name-chars')):
        check(cloud('signUp', bad, 'z@x.io', 'secret1')['code'] == code, f'invalid name {bad[:8]!r} is rejected ({code})')
    r = cloud('signUp', 'Abc', 'abc@x.io', 'secret1'); signed('g6'); check(r['ok'], 'the shortest allowed name (3) registers'); cloud('signOut'); guest('g7')
    r = cloud('signUp', 'a' * 16, 'long@x.io', 'secret1'); signed('g7'); check(r['ok'], 'the longest allowed name (16) registers'); cloud('signOut'); guest('g8')

    print('Renaming')
    cloud('signIn', 'a@x.io', 'secret1'); signed('g1')
    ev("""() => { const d = window.__fbmock.db; d.friends = { g1: { x1: 'Xena' }, x1: { g1: 'Alice' } };
      d.friendRequests = { g1: { y1: { name: 'Yuri', ts: 1 } }, z1: { g1: { name: 'Alice', ts: 2 } } };
      d.friendSent = { y1: { g1: { name: 'Alice', ts: 1 } }, g1: { z1: { name: 'Zed', ts: 2 } } };
      d.dailyResults = { g1: { '2026-01-01': { name: 'Alice', score: 5, total: 10, ms: 1000, grid: '1111100000' } } }; }""")
    cloud('submitScore', 'mix', 100)
    r = cloud('changeName', 'Alicia'); pg.wait_for_timeout(500)
    d = db()
    check(r['ok'] and d['usernames'].get('alicia') == 'g1' and 'alice' not in d['usernames'] and sum(1 for v in d['usernames'].values() if v == 'g1') == 1, 'rename moves the name claim (no duplicate reservations)')
    check(d['friends']['x1']['g1'] == 'Alicia', "your friends' copy of your name is updated")
    check(d['friendSent']['y1']['g1']['name'] == 'Alicia' and d['friendSent']['y1']['g1']['ts'] == 1, 'requests you received show your new name (timestamp kept)')
    check(d['friendRequests']['z1']['g1']['name'] == 'Alicia' and d['friendRequests']['z1']['g1']['ts'] == 2, 'requests you sent show your new name (timestamp kept)')
    check(d['dailyResults']['g1']['2026-01-01']['name'] == 'Alicia' and d['leaderboard']['mix']['g1']['name'] == 'Alicia', 'Daily results and the leaderboard show the new name')
    check(ev("window.__cloud.user.name") == 'Alicia', 'the signed-in name updates immediately')
    r = cloud('changeName', 'ALICIA'); check(r['ok'] and ev("window.__cloud.user.name") == 'ALICIA' and sum(1 for v in db()['usernames'].values() if v == 'g1') == 1, 'changing only the capitals works without a second claim')
    before = json.dumps(db()['usernames'], sort_keys=True)
    cloud('changeName', 'ALICIA'); check(json.dumps(db()['usernames'], sort_keys=True) == before, 'renaming to the same name changes nothing')
    r = cloud('changeName', 'Bob'); check((not r['ok']) and r['code'] == 'name-taken' and ev("window.__cloud.user.name") == 'ALICIA', 'renaming to a taken name is refused and keeps the old one')
    ev("window.__fbmock.fail = { updateProfile: true }")
    r = cloud('changeName', 'Newname'); ev("window.__fbmock.fail = null")
    check((not r['ok']) and 'newname' not in db()['usernames'] and ev("window.__cloud.user.name") == 'ALICIA', 'a failed rename rolls back completely')
    ev("window.__fbmock.failDb = { ops: ['update'] }")
    r = cloud('changeName', 'Renamed'); ev("window.__fbmock.failDb = null")
    check(r['ok'] and ev("window.__cloud.user.name") == 'Renamed' and 'alicia' not in db()['usernames'] and db()['usernames'].get('renamed') == 'g1', 'if only the name copies fail, the rename itself still completes consistently')
    cloud('changeName', 'Alice')


    print('Guest cleanup during sign-in (review fixes)')
    cloud('signOut'); G = guest(); give(11, 40); cloud('submitScore', 'mix', 40)
    gname = ev("window.__cloud.user.name"); seed_guest(G, gname); pg.wait_for_timeout(300)
    before = footprint(G); verifies = ev("window.__fbmock.verifies || 0")
    check(len(before) >= 8, 'the test guest owns leaderboard, profile, Daily, name, friend and request records')
    # A: the cleanup cannot be completed -> do not sign in, keep the guest session and every record
    ev("(g) => { window.__fbmock.failDb = { ops: ['update'], match: 'users/' + g }; }", G)
    r = cloud('signIn', 'a@x.io', 'secret1'); ev("window.__fbmock.failDb = null"); pg.wait_for_timeout(300)
    check((not r['ok']) and r['code'] == 'guest-cleanup-failed' and 'not signed in' in r['msg'], 'if the guest cleanup fails, sign-in is refused with an accurate message')
    check(ev("window.__cloud.user.uid") == G and ev("window.__cloud.user.guest") and ev("window.__fbmock.cur.uid") == G and footprint(G) == before, 'and the guest session and every guest record are untouched')
    # B: wrong password -> nothing is ever deleted
    verifies = ev("window.__fbmock.verifies || 0")
    r = cloud('signIn', 'a@x.io', 'WRONG'); pg.wait_for_timeout(500)
    check((not r['ok']) and r['code'] == 'auth/invalid-credential' and footprint(G) == before and ev("window.__fbmock.cur.uid") == G, 'a wrong password changes nothing at all (all guest records are identical afterwards)')
    check(ev("window.__fbmock.verifies || 0") == verifies, 'the password check never signed the real session in')
    # B2: password right, the real sign-in then fails on the network -> restore what the rules allow
    ev("window.__fbmock.fail = { signInMain: true }")
    r = cloud('signIn', 'a@x.io', 'secret1'); ev("window.__fbmock.fail = null"); pg.wait_for_timeout(1500)
    after = footprint(G); lost = [k for k in before if k not in after]
    check((not r['ok']) and ev("window.__cloud.user.uid") == G and ev("window.__cloud.user.guest"), 'a network failure during the real sign-in leaves you as the same guest')
    check(all(k.startswith('/friends/') or k.startswith('/friendRequests/' + G) or k.startswith('/friendSent/iy/') for k in lost), 'everything restorable (leaderboard, profile, Daily, name, requests you sent) is restored; only friendships and requests others sent can be missing')
    check(r['code'] == 'signin-failed-guest-partial' and "couldn't be put back" in r['msg'], 'and the message says honestly what could not be put back')
    # C: success -> cleaned and the account loads
    seed_guest(G, ev("window.__cloud.user.name"))
    cloud('signIn', 'a@x.io', 'secret1'); signed('g1')
    check(footprint(G) == {} and G not in ev("window.__fbmock.alive"), "after a successful sign-in none of the old guest's records remain (including friends' and requesters' copies)")
    check(owner() == 'g1' and xp() == 500, 'and the registered account loads with its own progress')
    cloud('signOut'); guest()

    print('Publishing under the right account (review fixes)')
    cloud('signIn', 'a@x.io', 'secret1'); signed('g1')
    ev("""() => { window.__store.set('avatar', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');          // hold image loading until the test says go
      Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get: d.get, set(v) { (window.__held ||= []).push(() => d.set.call(this, v)); } }); }""")
    ev("""async () => { const m = await import('./js/public.js');
      const publish = m.publishFor || (async (s, c) => { await c.publishProfile(await m.buildPublic(s, c)); }); // old code path when publishFor does not exist
      window.__pub = publish(window.__store, window.__cloud); window.__hasPublishFor = !!m.publishFor; }""")
    pg.wait_for_timeout(200)
    bob_before = json.dumps(db().get('publicProfiles', {}).get('g3'))
    cloud('signOut'); guest(); cloud('signIn', 'b@x.io', 'secret1'); signed('g3')
    ev("() => { (window.__held || []).splice(0).forEach((f) => f()); }"); pg.wait_for_timeout(800)
    ev("async () => { try { await window.__pub; } catch (e) { /* the stale publish may be refused */ } }")
    bob = db().get('publicProfiles', {}).get('g3') or {}
    check(bob.get('name') != 'Alice' and bob.get('name') != 'Renamed' and bob.get('xp') != 500, "a profile built for account A while A's picture was loading is never written onto account B")
    ev("() => { delete HTMLImageElement.prototype.src; }")
    cloud('signOut'); guest()

    print('Pending sync during an account switch')
    ev("window.__store.update((p) => { p.xp = 510; })")
    cloud('signOut'); guest('g9')
    cloud('signIn', 'b@x.io', 'secret1'); signed('g3'); pg.wait_for_timeout(6000)
    d = db(); lvl_b = ev("window.__store.level.level")
    check(d['publicProfiles']['g3']['xp'] == 40 and d['leaderboard']['mix'].get('g3', {}).get('lvl', 1) == lvl_b, "A's pending updates never get written onto B")
    check(d['publicProfiles']['g1']['xp'] != 40, "and A's own profile is untouched by B")

    print('Account deletion')
    cloud('signOut'); guest('g10'); give(9, 0)
    guest_slot_xp = xp()
    cloud('signIn', 'a@x.io', 'secret1'); signed('g1')
    ev("window.__store.update((p) => { p.xp = 500; })"); cloud('submitScore', 'mix', 100); pg.wait_for_timeout(500)
    r = cloud('deleteAccount', 'wrongpw')
    check((not r['ok']) and 'g1' in ev("window.__fbmock.alive") and 'users' in db() and 'g1' in db()['users'], 'a wrong password deletes nothing')
    ev("window.__fbmock.failDb = { ops: ['update'], match: 'users/g1' }")
    r = cloud('deleteAccount', 'secret1'); ev("window.__fbmock.failDb = null")
    check((not r['ok']) and r['code'] == 'delete-data-failed' and 'nothing was deleted' in r['msg'] and 'g1' in db()['users'] and 'g1' in ev("window.__fbmock.alive") and xp() == 500, "if the online data can't be removed, nothing is deleted and the message says so")
    ev("window.__fbmock.fail = { deleteUser: true }")
    r = cloud('deleteAccount', 'secret1'); ev("window.__fbmock.fail = null")
    check((not r['ok']) and r['code'] == 'delete-account-failed' and 'g1' in ev("window.__fbmock.alive") and 'online data was removed' in r['msg'], 'if the login itself can\'t be deleted it is NOT reported as deleted')
    check('g1' not in db().get('users', {}) and xp() == 500 and slot('ma2.profile.g1') is not None, 'and the local profile is kept until deletion really succeeds')
    r = cloud('deleteAccount', 'secret1'); pg.wait_for_timeout(1500)
    check(r['ok'] and 'a@x.io' not in ev("Object.keys(window.__fbmock.users)") and 'g1' not in ev("Object.keys(window.__fbmock.alive)"), 'retrying finishes the deletion and the login is gone')
    g_after = guest()
    blob = json.dumps(db())
    check('"g1"' not in blob and '"alice"' not in blob and '"alicia"' not in blob, 'no online record of the account remains (users, profiles, leaderboard, names, friends, requests, Daily)')
    check(ev("(k) => localStorage.getItem(k)", 'ma2.profile.g1') is None and ev("(k) => localStorage.getItem(k)", 'ma2.prefs.g1') is None, 'the local profile is removed')
    check(owner() == 'guest' and xp() == guest_slot_xp and db()['users'][g_after]['profile']['xp'] == guest_slot_xp, "the new guest has the guest's own progress, never the deleted account's")
    pg.wait_for_timeout(2500)
    check('"g1"' not in json.dumps(db()), 'deleted data does not come back later')
    check(cloud('signIn', 'a@x.io', 'secret1')['code'] == 'auth/invalid-credential', 'signing in to a deleted account fails')
    check(not errors, 'no JavaScript errors' + (': ' + errors[0][:120] if errors else ''))
    b.close()

print('\nFAILED: ' + str(len(fails)) if fails else '\nPASSED')
sys.exit(1 if fails else 0)
