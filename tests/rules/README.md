# Security-rule tests

`scenarios.mjs` lists what each kind of user may and may not do (rename, friends, requests, Daily results, username claims, account deletion, reading private data). Two runners execute it:

| Runner | Engine | Needs |
|---|---|---|
| `rules.test.mjs` | **Targaryen**, an open-source re-implementation of the rules language | `npm i -D targaryen` |
| `emulator.test.mjs` | **Google's Firebase Realtime Database emulator** (the real rules engine) | Java 11+, `npm i -D @firebase/rules-unit-testing firebase firebase-tools` |

```
npm run test:rules            # Targaryen
npm run test:rules:emulator   # the real emulator
```

Targaryen is not Google's engine, so only the emulator run counts as verification against Firebase itself.
Both runners also push the app's real delete/rename payloads (`js/cloudplan.js`) through the rules.
