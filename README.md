# Last Haiku archive

A modern static archive of the public [Last Haiku](https://lasthaiku.wikidot.com/) Legend of the Five Rings wiki. It includes a dark theme, foldable section navigation, full text search, article contents, mobile layouts, and links to each original page. Book titles open their menus directly. Book of Earth contains Combat and Rolls, while Book of Fire contains the original character creation guide, character options, and equipment.

The campaign desk lists locally saved characters and has a roll and keep dice roller. The new character creator uses the wiki's family, school, skill, advantage, and disadvantage data. It calculates starting bonuses, Rings, Insight, and XP; saves multiple characters in the browser; and can print or export a JSON sheet. An existing single character save is migrated into the roster. It is a creation aid, so read the linked source entries for restrictions and special cases.

Selecting a school adds its free skill ranks and emphases, outfit, starting money, and training details. School skill and equipment choices are saved with the character. Changing schools replaces its grants while retaining personal equipment, purchased skill ranks, and story notes. The printed sheet and JSON export include the resulting skills and equipment.

Trait and skill changes also recalculate skill roll pools, initiative, base Armor TN, healing, unarmed damage, Void Points, and cumulative wound thresholds. Skills use their source trait by default; choose a different trait for a particular task or a skill whose trait varies. These values update in the creator, printed sheet, and JSON export.

The source wiki states that its content is licensed under [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The site retains attribution and the same license for imported content. Legend of the Five Rings is the property of its respective owners.

## Local use

Serve the repository root with any static file server, for example `python3 -m http.server 8000`, and open `http://localhost:8000`.

Run `node scripts/test_character.cjs` to check school grants, XP accounting, choices, school changes, saved characters, and dependent stats.

## Firebase

The site uses the `l5r-rules` Firebase project and is hosted at https://l5r-rules.web.app. Google sign-in enables private character saves in Cloud Firestore (São Paulo, `southamerica-east1`). Each account has its own roster and browser cache. Signed-out characters stay on the device; after signing in, choose **Copy device characters** to add them to your account. Repeating the copy skips characters already in the account.

Changes save locally immediately and sync after a short delay. Offline edits and deletions are queued and retried when connected; signing out retains that account's pending changes for its next sign-in. The sidebar reports whether cloud sync has completed. Edits to the same character from multiple devices use the last write accepted by Firestore, so avoid editing one sheet simultaneously on two devices. Browser-local characters are specific to the site address: export important saves before switching from a previous host.

`firebase-config.js` contains the public web app configuration; access is protected by `firestore.rules`, which permits only the account owner to read or change `/users/{uid}/characters/{id}`. Google is enabled in [Firebase Authentication](https://console.firebase.google.com/project/l5r-rules/authentication/providers). Additional hosting domains must be added to Authentication's authorized domains.

Deploy with the signed-in Firebase CLI:

```sh
node scripts/test_character.cjs
node scripts/test_character_sync.cjs
firebase deploy --only hosting,firestore:rules
```

The Hosting predeploy hook builds `dist/` from an explicit list of web assets. The source PDF, scripts, configuration, and Git files are excluded. To preview the deployment locally, run `node scripts/build_site.cjs` and `firebase emulators:start --only hosting`, then open http://localhost:5000. This preview uses production sign-in and cloud saves by default. For isolated local development, run the Auth, Firestore, and Hosting emulators and append `?emulators` to the local URL; the Firestore emulator requires Java. Run `node scripts/test_character_sync.cjs` to verify account isolation, device imports, offline retries, deletions, and account changes during uploads.

## Refreshing content

`scripts/import_wiki.py` fetches the public wiki pages into `public/wiki.json` and `public/assets`. `scripts/build_character_data.py` derives the creator catalog from that snapshot. Both scripts use Beautiful Soup 4. Run them in that order after installing `beautifulsoup4` in the Python environment. Imported pages are a snapshot; the published site does not automatically sync with the source wiki.
