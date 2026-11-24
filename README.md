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

## Question types and progression
Each level unlocks one idea, and everything unlocked stays in the mix. Every newly reached level opens with the type it unlocks.

| Level | Unlocks | Format / answer buttons |
|---|---|---|
| 1 | Addition | number, 4 buttons |
| 2 | Multiplication | number, 4 buttons |
| 3 | Division, subtraction with negative results | number, 4 buttons |
| 4 | Find the Incorrect Equation | 4 selectable equations |
| 5 | Number sequences (and missing-number `7 + ? = 12`) | 4 number buttons |
| 6 | Equation comparison | 3 buttons: `>` `=` `<` |
| 7 | Powers (squares, cubes, powers of 2) | number |
| 8 | Square roots | number |
| 9 | Brackets and order of operations | number |
| 10-12 | Combinations of everything above, richer each level | number |

Every problem carries `format` (`number`, `sequence`, `equations`, `compare`) plus `choices`, `correctIndex` and format metadata (`seq`/`hole`/`rule`, `valid[]`, `left`/`right`/`relation`), so the UI draws it and shows the right buttons with no special cases: `renderQuestion` and `setChoices` in `js/util.js`. Single-operation Blitz modes (Addition, Subtraction, ...) stay number-only, and Duel only deals number questions (its layout has four number buttons per side).

Sequences (`js/engine/sequences.js`) are generated from a named rule and then proven unambiguous: every other value for the hidden term is tried, and none may complete the sequence into any known pattern (arithmetic, geometric, quadratic, cubic, alternating steps, Fibonacci-style, affine, interleaved).

## Store: frames and profile cards
Coins (earned with XP) buy cosmetics. The Store is one scrolling page with a titled section per kind of item (add a section in `SECTIONS` in `js/screens/store.js` to add a new kind):
- **Frames** decorate your avatar (Neon Edge, Frostbite, Gold Rush, Aurora, Prismatic).
- **Profile cards** restyle your whole row in Ranks and in Friends: Neon Grid, Snowdrift, Gold Ledger, Northern Lights, Crystal Prism. Each one reuses the look of a frame (neon glow, snowflakes, coins, aurora sparkles and curtain, the prism gem), and a frame and a card can be worn together.

Cards travel the same way frames do: `profile.card` in the store, `card` on your leaderboard entries and public profile, validated in `database.rules.json` and cleaned with `cleanCard` when read back. Styles are in `css/app.css` (`[data-card="..."]`); the catalog is `CARDS` in `js/shop.js`. **Deploy the updated `database.rules.json` before the new version**; until then the app still works (a rejected `card` field falls back to saving without it), but other players cannot see your card. Both frame and card animations stop when the device asks for reduced motion.

## Achievements
Rules live in `js/achievements.js` (catalog, thresholds, `evaluate`), the UI in `js/screens/achievements.js` (a panel on the Profile with three pinned medals, and a sheet listing everything).
- **Blitz**: The Adder / Subtractor / Multiplier / Divider / Polymath, one per mode. Bronze 100, Silver 500, Gold 1000 cumulative correct answers in that mode (`BLITZ_TIERS`; counted per mode in `profile.modeCorrect`, Blitz runs only). Platinum needs Gold plus the top 1% of that mode's leaderboard once at least 100 players are on it (`PLATINUM`), checked online by `js/achievementsync.js`.
- **The Streaker** (Daily Challenge 30 days in a row), **The Collector** (every Store item), **The Absolute** (every other live achievement and level 100). The four Elo ones are in the catalog with `live: false`; set `live: true` when online 1v1 exists and The Absolute will require them too.
- Every achievement name is a title: Blitz ones unlock it at Platinum, the others when earned. Earned tiers never go away and sync with max-merge (`profile.ach`). The title worn and the pinned medals are choices, so the newest copy wins.
- Public data: `ach`, `showcase` and `achTitle` on `publicProfiles/<uid>`. **Deploy the updated `database.rules.json`**; until then the app still works (the profile publishes without those fields) but other players will not see your medals.

## Tuning the game
Everything balance-related is in `js/engine/run.js` (`RULES`: start time, lives, `levelSteps` = correct answers per level, time bonus per level and per format, Daily levels, Zen range) and the tables at the top of `js/engine/problems.js` (`TYPES` unlock levels and weights, number ranges). Difficulty rises through new concepts and multi-step questions, not bigger numbers (no operand above ~260).

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
