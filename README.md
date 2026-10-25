# Math Arcade 2.0

Fast mental-math arcade for phones. Vanilla HTML/CSS/JS (ES modules), no build step, works offline, ready to wrap for Google Play.

**Modes:** Blitz (clock + 3 lives + combos), Zen (no pressure, pixel cat), Duel (2 players, one phone), Daily Challenge (same 10 questions for everyone, shareable result).

## Run it

```bash
npm start          # or: python3 -m http.server 8080
npm test           # engine + storage unit tests (Node 20+)
npm run test:e2e   # browser tests incl. a mocked-Firebase online flow (pip install playwright)
```
Open `http://localhost:8080/?debug` (the service worker is skipped on localhost; add `?sw=1` to test it).

## Project layout

```
index.html            all screens (markup only)
css/                  theme.css = 8 palettes + fonts, app.css = components
js/engine/            pure game logic (no DOM): problems, run rules, duel, seeded RNG
js/screens/           one file per screen
js/                   store (local-first save), audio (synth SFX), fx, router, cloud (Firebase)
tests/                unit tests (+ e2e/ browser tests)
tools/make-sprite.py  regenerates the pixel icon sprite inside index.html
database.rules.json   Firebase Realtime Database rules (DEPLOY THESE)
```

## Tuning the game
Everything balance-related is in `js/engine/run.js` (`RULES`: start time, lives, time bonus per level, combo step, score) and the level tables at the top of `js/engine/problems.js`.

## Firebase (accounts + leaderboard)
1. Firebase console, Realtime Database, Rules: paste `database.rules.json` and publish. Without it the leaderboard will not work (and old rules may expose user emails).
2. Authentication: enable Email/Password.
3. Recommended: restrict the API key (Google Cloud console) and enable App Check.
4. Scores are client-submitted, so a determined cheater can post fake scores. Fine for a casual board; for competitive play validate on the server (Cloud Functions).

Data layout: `users/<uid>/profile`, `usernames/<name>`, `leaderboard/<mode>/<uid> = {name, score}` (modes: mix, add, sub, mul, div).

## Releasing on Google Play (Capacitor)
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Math Arcade" com.yourname.matharcade --web-dir .
npx cap add android && npx cap sync
npx cap open android      # build the signed AAB in Android Studio
```
Checklist: [ ] fill the placeholders in `privacy.html` and host it (the store listing needs the URL) [ ] Data safety form: email + name collected, deletable in-app [ ] 512px icon is `assets/icons/icon-512.png`; screenshots and feature graphic are in `store/` [ ] confirm you own the rights to `assets/audio/*.mp3` (ambient loops) [ ] bump `VERSION` in `js/config.js` and `service-worker.js` each release.

## Online multiplayer (next step)
The engine is built for it: problems come from a seeded RNG, so both players only need to share a `seed` and `target`; `DuelEngine.answer(player, index, now)` takes an injectable clock, so a network layer can feed it remote events. Suggested path: Realtime Database room `rooms/<id>` with `{seed, target, players, events}`, Cloud Function to validate answers.
