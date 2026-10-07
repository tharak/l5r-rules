# l5r-rules

Campaigns, personal PCs, and five searchable books for Legend of the Five Rings. The responsive top bar keeps Campaigns, Characters, and Books visible on mobile. Existing article hashes and `#/create-character` still work; the old home route opens Campaigns. Import attribution and licensing are in [ATTRIBUTION.md](ATTRIBUTION.md), which is excluded from the hosting build.

Signed-out users create, view, edit, print, and export device PCs. Google sign-in gives each account its own personal roster and cloud sync. **Copy device characters** explicitly imports device PCs with their existing IDs. Existing browser keys, account caches, pending writes, and active selections migrate to `l5r-rules` names.

Creating a campaign makes its creator the sole GM. Members link their own personal PCs; each association references the same live sheet. The GM edits the title and plain-text sessions, manages private name-and-notes NPCs, and removes linked PCs. Players read sessions, remove their own associations, and leave campaigns. Membership removal removes that player's associations. Campaign deletion preserves personal PCs. Sessions, PCs, and GM-only NPCs share a panel with a segmented selector. Sessions autosave plain text with its line breaks intact. The PC roster displays **PC name (Player name)** using each owner’s Google display name. Existing memberships gain their display names when their owners next sign in; accounts without a display name use **Player**. **Save session**, **Save PC**, and **Save NPC** save the draft and close its editor. Autosave continues while editing.

**View** in the personal Characters list and campaign PC roster opens a read-only sheet with print and JSON export. Owners and the GM see the full sheet; other players see only public sections. Viewing leaves the saved sheet and active editor selection unchanged. **Edit** remains separate for owners and the GM.

Campaign cards show each linked PC as **PC name - Player name**. Owners see their own PC names;
other viewers see server-confirmed public identity or **Private PC**. Names update live, and
accounts without a display name use **Player**. Empty campaigns show **No PCs linked yet**.

**Plots** lets every campaign member add plot points. Sessions, linked PCs, NPCs, and plots also support separate attached notes. New plots and notes default to **Private**, visible to their creator and the GM; **Public** makes them readable by campaign members who can access the parent. NPCs and their notes remain GM-only. Only the creator edits the text or changes visibility. Use **Save plot** or **Save note** to save the draft; **Cancel** discards unsaved entry edits. Making a plot private also revokes other players' access to its attached notes. Removing a parent removes its attached notes; the parent owner can delete those bodies without reading another creator's private text. Protected title/text documents are separate from shared metadata; private text never enters an unauthorized player's subscription. Campaign deletion removes all plot/note bodies, including other members' private entries, without reading them.

The GM’s **Invite link** button beside **+PC** creates or reuses a valid invitation and copies it to the clipboard, with a copyable popup when clipboard access is unavailable. Expired links are renewed automatically. **Invite settings** below the PC roster keeps replacement and revocation available. Invite links last seven days; signing in and pressing **Join campaign** is required. Invitations are stored separately from member-readable campaign data.

Each PC has seven **Public** checkboxes. Identity starts public; the other sections, including **Abilities**, start private. Owners control these settings. GMs can edit full linked sheets but cannot change their privacy. Other players read, print, and export only selected sections. A PC without public identity uses a neutral roster label. Skills share ranks, emphases, and mastery descriptions; summary shares derived combat totals. School techniques are part of identity; selected spells, kata, kiho, tattoos, and powers appear only under Abilities. Ancestors belong to advantages/disadvantages. Concept, notes, heritage, equipment, money, and social standing belong to story. XP history and exception explanations always stay private.

## Character creation and advancement

New and legacy sheets start in **Creation** with 40 XP by default; **Starting XP** in the compact totals bar changes the budget. Free family/school benefits, skills, emphases, outfit, and ability choices recalculate while creating a character. Missing choices, eligibility, creation rank limits, and the disadvantage XP cap are available under **Rules & table exceptions** in Identity; incomplete drafts remain saveable. **Begin play** in the totals bar requires completing these choices or recording a table exception with an explanation. Exceptions work without signing in. Character rule links open in a popup, including its internal references, without navigating away from the editor.

Each section has a **Reset** button during Creation. It clears that section’s inputs and associated exceptions, recalculates school grants, and preserves the character ID and privacy settings. This helps clear previous purchases and selections after changing clan or school. The confirmation lists the fields that will be reset; Advancement hides these buttons to preserve paid-cost history.

**Advancement** freezes creation benefits and paid costs without inventing earlier transactions. Record XP awards and corrections with explanations. Later purchases, memorization, price corrections, and refunds enter a private ledger; refunds use the original payment and later discounts do not reprice old purchases. Buying off a disadvantage requires table approval and costs its original points. Track School Ranks independently from Insight, including alternate paths, advanced schools, and Multiple Schools requirements.

Search the structured ability and ancestor catalogs, purchase skill emphases, equip weapons and armor, and edit Honor, Glory, Status, Taint, wounds, money, and recorded heritage. Rule descriptions and local book links explain situational effects. Permanent effects supported by the calculator apply automatically; explicit modifiers require a source explanation. Custom skills, purchases, equipment, and abilities remain available. Nonhuman, foreign, and unofficial fan-created systems stay available as book references and custom records.

The version-2 model is normalized by `character-rules.js`; pure calculations are separate from catalog helpers (`character-catalog.js`) and rendering (`character.js`). Migration preserves IDs, notes, selections, custom charges, visibility, and pending drafts. Six-section cloud documents remain accepted and migrate to seven sections on save, including GM edits with Abilities kept private.

## Data and sync

Canonical sheets stay at `/users/{uid}/characters/{id}`. Each save atomically writes the full sheet and `/users/{uid}/publicCharacters/{id}` with matching revisions. Rules compare each projected section against the full document's explicit visibility mask and sections. Legacy cloud sheets remain readable by their owners and upgrade on their next save or campaign link.

Campaigns have immutable `gmUid` and editable `title`, plus separate `members`, `sessions`, `npcs`, and `pcs` collections. Account membership indexes discover campaigns. Separate per-viewer grants for public reading and GM editing identify a campaign, PC association, and membership generation. Rules check current membership and the linked owner's membership generation on every read. Rejoining cannot revive an old grant or PC association.

Character and campaign edits save locally immediately and retry connection errors. Firestore uses the last accepted write for concurrent edits. Sessions are separate documents; oversized text stays in a local unsaved draft. Shared caches clear on sign-out and membership loss. Access-denied writes stop retrying and retain a detached draft visible from Campaigns. Account-specific pending writes survive sign-out. A browser storage failure can prevent durable saves; export important sheets as backups.

## Development and validation

Serve the repository root with `python3 -m http.server 8000`, or run `npm run build` and preview `dist/`. Production is https://l5r-rules.web.app.

```sh
npm ci
npm test
firebase emulators:start --only auth,firestore,hosting --project demo-l5r-rules
# In a second terminal:
npm run test:rules
```

The emulators require Java 21 or later. Open `http://127.0.0.1:5000/?emulators` for isolated browser testing against `demo-l5r-rules`. Without this opt-in, sign-in and saves use production Firebase. The security and service suites use separate emulator projects from the browser app. The rules suite checks owners, GMs, players, outsiders, anonymous users, stale and forged grants, invitation expiry/revocation, hidden-field reads, visibility changes, and PC association removal. The service suite exercises campaign CRUD, invitation replacement, linking, live edits across campaigns, member removal, leaving, and deletion. Unit tests cover character calculations, account sync, storage migration, all visibility masks, and durable campaign drafts.

For browser verification, sign in with a Google test account in the emulator widget, then run `playwright-cli run-code --filename scripts/browser_checks.js`. It checks desktop and mobile navigation, long sessions, joining, new PCs, private roster labels, NPC privacy, player print/export, and live GM edits. Run `scripts/browser_link_checks.js` through the same CLI command to check existing PCs in two campaigns and campaign deletion. `scripts/browser_character_checks.js` uses a fresh signed-out context for creation, explained exceptions, offline drafts, Begin play, advancement/refunds, equipment, abilities, responsive layouts, print/export, and Save PC closing. `scripts/browser_privacy_checks.js` creates isolated emulator accounts and checks all 128 masks in live player responses, views, print layouts, and exported files, followed by revocation. `scripts/verify_live.js` checks the deployed site using device characters only.

`scripts/browser_plot_checks.js` creates isolated emulator accounts for a GM and two players. It verifies public/private plots, notes on all four target types, creator-only editing, GM access, live privacy revocation, reload/cache behavior, direct server denials, and mobile layout.

Pushes to `main` run unit tests and build the site, then deploy Firebase Hosting using
[Deploy Firebase Hosting](https://github.com/tharak/l5r-rules/actions/workflows/firebase-hosting.yml).
The workflow also supports a manual run on `main`. Its deployment service account is stored
in the repository secret `FIREBASE_SERVICE_ACCOUNT_L5R_RULES`; credentials are never committed.
Hosting deployments do not publish Firestore rules. Google sign-in accepts both the Firebase
Hosting addresses and `tharak.github.io` for the GitHub Pages copy.

To deploy manually after checks (including Firestore rule changes):

```sh
firebase deploy --only hosting,firestore:rules
```

The predeploy build copies an explicit web-asset list and sanitizes imported source links. Repository documents, scripts, tests, configuration, and the source PDF are excluded.

## Refreshing books

`scripts/import_wiki.py` refreshes `public/wiki.json` and assets. `scripts/build_character_data.py` derives the creator catalog. Both require Beautiful Soup 4. Pass `--core-resources /path/to/LegendOfTheFiveRings/Sources/LegendOfTheFiveRings/Resources` to refresh reusable weapon, armor, and skill mastery catalogs from the older core library; without this argument the checked-in supplemental catalogs are retained. Calculations were verified against the printed fourth-edition core rules rather than copied from that library. After importing, retain source attribution in `ATTRIBUTION.md`; the build removes source metadata, localizes available article links, and preserves the text of other outbound links. Imported content is a snapshot and does not automatically refresh.

`scripts/browser_sheet_view_checks.js` verifies owner/GM full views, player public views, live updates, unchanged sheets and active selection, separate Edit controls, mobile layout, and print.
