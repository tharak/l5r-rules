# l5r-rules

Campaigns, personal PCs, and five searchable books for Legend of the Five Rings. The responsive top bar keeps Campaigns, Characters, and Books visible on mobile. Existing article hashes and `#/create-character` still work; the old home route opens Campaigns. Import attribution and licensing are in [ATTRIBUTION.md](ATTRIBUTION.md), which is excluded from the hosting build.

Signed-out users create, edit, print, and export device PCs. Google sign-in gives each account its own personal roster and cloud sync. **Copy device characters** explicitly imports device PCs with their existing IDs. Existing browser keys, account caches, pending writes, and active selections migrate to `l5r-rules` names.

Creating a campaign makes its creator the sole GM. Members link their own personal PCs; each association references the same live sheet. The GM edits the title and plain-text sessions, manages private name-and-notes NPCs, and removes linked PCs. Players read sessions, remove their own associations, and leave campaigns. Membership removal removes that player's associations. Campaign deletion preserves personal PCs. Sessions, PCs, and GM-only NPCs share a panel with a segmented selector. Sessions autosave plain text with its line breaks intact. The PC roster displays **PC name (Player name)** using each owner’s Google display name. Existing memberships gain their display names when their owners next sign in; accounts without a display name use **Player**. **Save session**, **Save PC**, and **Save NPC** save the draft and close its editor. Autosave continues while editing.

Personal characters and campaign PCs open through **Edit** for owners and the GM. The read-only character page and its View links have been removed pending a redesign. Existing public projections and access rules continue to protect shared data.

Campaign cards show each linked PC as **PC name - Player name**. Owners see their own PC names;
other viewers see server-confirmed public identity or **Private PC**. Names update live, and
accounts without a display name use **Player**. Empty campaigns show **No PCs linked yet**.

**Plots** lets every campaign member add plot points. Sessions, linked PCs, NPCs, and plots also support separate attached notes. New plots and notes default to **Private**, visible to their creator and the GM; **Public** makes them readable by campaign members who can access the parent. NPCs and their notes remain GM-only. Only the creator edits the text or changes visibility. Use **Save plot** or **Save note** to save the draft; **Cancel** discards unsaved entry edits. Making a plot private also revokes other players' access to its attached notes. Removing a parent removes its attached notes; the parent owner can delete those bodies without reading another creator's private text. Protected title/text documents are separate from shared metadata; private text never enters an unauthorized player's subscription. Campaign deletion removes all plot/note bodies, including other members' private entries, without reading them.

The GM’s **Invite link** button beside **+PC** creates or reuses a valid invitation and copies it to the clipboard, with a copyable popup when clipboard access is unavailable. Expired links are renewed automatically. **Invite settings** below the PC roster keeps replacement and revocation available. Invite links last seven days; signing in and pressing **Join campaign** is required. Invitations are stored separately from member-readable campaign data.

Each PC has seven **Public** checkboxes. Identity starts public; the other sections, including **Abilities**, start private. Owners control these settings. GMs can edit full linked sheets but cannot change their privacy. Public projections expose only the selected sections to other players; the read-only page is currently unavailable. A PC without public identity uses a neutral roster label. Skills share ranks, emphases, and mastery descriptions; summary shares derived combat totals. School techniques are part of identity; selected spells, kata, kiho, tattoos, and powers appear only under Abilities. Ancestors belong to advantages/disadvantages. Concept, notes, heritage, equipment, money, and social standing belong to story. XP history and exception explanations always stay private.

## Character editor

Characters use one editor with 40 starting XP by default. The character record displays **XP: value**. A stepper and **Add** button below it record an award or correction at any time. XP history remains private. There is no Creation/Advancement switch or separate advancement panel. Traits show a maximum Rank of 5, Skills a maximum Rank of 10, and advantages a maximum total of 15 points as guidance. All characters calculate benefits and XP costs from their current selections. Old advancement baselines and payment histories remain saved as historical data; only XP awards affect the current budget. Begin Play, phase restrictions, locked grants, purchase/refund ledgers, and disadvantage buyoffs have been removed. Limits appear with the cost guidance; values beyond the usual limits remain editable and saveable.

Family and school bonuses appear in their dropdown choices. Required school choices appear directly in Skills or Abilities. Incomplete drafts remain saveable, with missing choices and eligibility messages in the relevant section. Previously saved table approvals remain attached to their sheets. Character rule links open in a popup without navigating away from the editor.

**00 Rolls** is the first section of the default editor, above the editing panels. **01 Identity** includes the character record, XP, standing, rings, Insight, combat, and wounds. Its identity and summary privacy controls remain independent. Rings sit side by side in a responsive grid, wrap into fewer columns as space narrows, and stack on mobile. Traits remain stacked within each Ring. Each trait panel places its name and value on the left and its skills in a horizontal grid beside them, with emphases side by side beneath their skill. Ring and trait values sit directly beside their names. Untrained skills are available by unchecking **Hide 0 rank skills**. **Hide Artisan**, **Hide Games**, **Hide Perform**, and **Hide Lore** hide only rank 0 skills in those categories; trained skills always stay visible. Filter preferences are remembered on the device. The compact skill cards show only the skill name, dice pool, and selected emphases. **02 Rings & traits** retains the trait rank controls; **03 Skills** retains its skill rank controls, trait choices, emphasis popup, and mastery details. Edits update Rolls immediately. Multi-trait skills follow their selected roll trait. Fixed skill traits are displayed as text; skills with multiple valid traits use segmented choices. Known specialties use their own fixed trait, while custom skills can choose a trait. **+emphasis** at the end of a trained skill row opens a popup of catalog choices and a custom-entry field. Purchases cost 2 XP and selected emphases use a more readable label. The experimental layout and its switch have been removed; old experimental links redirect to the default editor.

Click a Ring, trait, skill name or dice pool, or selected emphasis in **00 Rolls** to open a popup and roll immediately. The popup has one **XkY+Z** row of minus/value/plus controls, initialized with the roll's values, then a button to roll again. Changing these values retains the current result; **Reset bonuses** restores the original pool and clears it, while **Roll** replaces it with a new result. Bonuses apply before the ten-dice conversion. Results highlight the highest kept dice, show explosion and emphasis reroll details, and display the kept values plus any flat bonus as an equation ending in the total. Rank 0 skill rolls do not explode; an emphasis rerolls initial ones once. Rolls and their temporary bonuses do not change the character or XP.

Advantages and disadvantages show their rules directly, with the full-rules link beside each column title. Prices use printed clan, family, and school-discipline adjustments; selection lists and XP totals show the applicable price. Specific choice appears only for options that need a parameter; Consumed has a variant dropdown, including the Crane Perfection adjustment. Rank and option-cost controls use **− / value / +** buttons. Honor, Glory, Status, and Taint appear in that order below XP in section 01, with a single column on mobile. A compact Insight card appears beneath them in the Character Record, with its current Ring values, total Skill ranks, Courtier and Etiquette mastery bonuses, and any Insight modifier in the formula. Wounds taken appears after the last Ring in **00 Rolls**.

Section resets clear inputs and associated exceptions while preserving the character ID, privacy settings, and XP history. Resets, outfit choices, training removal, and ordinary disadvantage removal are available for every sheet. Later training is available under Identity; School Ranks remain independent of Insight, including paths, advanced schools, and Multiple Schools requirements.

Story and Equipment have separate panels and navigation buttons, and retain the shared Story & equipment privacy setting. Equipment uses side-by-side koku, bu, and zeni steppers. Optional ability training checkboxes share a horizontal row that wraps on narrow screens. Separate pickers list Spells, Kata, Kiho, Tattoos, and Shadowlands powers. Search the ancestor catalog, manage a list of equipment, and edit money and recorded heritage. Supported permanent effects apply automatically; explicit modifiers require a source explanation. Custom skills, purchases, equipment, and abilities remain available. Nonhuman, foreign, and unofficial systems remain book references and custom records.

The version-2 model is normalized by `character-rules.js`; pure calculations are separate from catalog helpers (`character-catalog.js`) and rendering (`character.js`). Migration preserves IDs, notes, selections, custom charges, visibility, and pending drafts. Six-section cloud documents remain accepted and migrate to seven sections on save, including GM edits with Abilities kept private.

## Data and sync

Canonical sheets stay at `/users/{uid}/characters/{id}`. Each save atomically writes the full sheet and `/users/{uid}/publicCharacters/{id}` with matching revisions. Rules compare each projected section against the full document's explicit visibility mask and sections. Legacy cloud sheets remain readable by their owners and upgrade on their next save or campaign link.

Campaigns have immutable `gmUid` and editable `title`, plus separate `members`, `sessions`, `npcs`, and `pcs` collections. Account membership indexes discover campaigns. Separate per-viewer grants for public reading and GM editing identify a campaign, PC association, and membership generation. Rules check current membership and the linked owner's membership generation on every read. Rejoining cannot revive an old grant or PC association.

Character and campaign edits save locally immediately and retry connection errors. Firestore uses the last accepted write for concurrent edits. Sessions are separate documents; oversized text stays in a local unsaved draft. Shared caches clear on sign-out and membership loss. Access-denied writes stop retrying and retain a detached draft visible from Campaigns. Account-specific pending writes survive sign-out. A browser storage failure can prevent durable saves; export important sheets as backups.

## Development and validation

**Design Guideline**, linked in the footer at `#/design-guideline`, groups the active UI into 33 families with 111 preserved variants and visual previews, permanent `UI-…` IDs, variants, selectors, and usage locations. Filter by ID, name, selector, or page; click an ID to share its direct link. Old variant IDs remain valid. Previews load only when opened. Page coverage scans every stored reference article. The guide is available without signing in, and its script-free previews use fictional data without invoking app actions.

Use the stateless `window.UI` renderers in `ui-components.js` for buttons, links, fields, checkboxes, choice groups, steppers, disclosures, panels, headings, action rows, cards, record rows, dialogs, feedback, and record editors. `ui-components.css` owns their shared screen appearance; domain CSS owns layout, ring tints, and print. Buttons have `primary`, `secondary`, and `quiet` variants and `regular` or `compact` sizes. Pass raw text through `text`, `label`, `value`, and `attrs`; only `*Html` slots (and button/link `html`) accept already composed trusted markup. Keep data attributes and event handling in the page controllers.

```js
UI.button({text:'Save session',attrs:{'data-campaign':'session-save',disabled:busy}});
UI.field({label:'Title',value:session.title,attrs:{'data-campaign-field':'session-title'}});
UI.stepper({value:rank,label:'Skill rank',decrease:{'data-delta':-1,disabled:rank===0},increase:{'data-delta':1}});
```

When changing a UI pattern, update its example and metadata in `design-guideline.js`. Preserve existing IDs when renaming or moving entries; add variants to an existing family when they share structure and assign a new semantic family ID only for a new pattern. Exclude retired templates and unused CSS. `npm test` checks inventory integrity and active template coverage. Run `playwright-cli run-code --filename scripts/browser_design_guideline_checks.js` from a static repository or `dist/` preview to verify filtering, deep links, responsive layout, print previews, safe interactions, and navigation regressions without signing in.

Serve the repository root with `python3 -m http.server 8000`, or run `npm run build` and preview `dist/`. Production is https://l5r-rules.web.app.

```sh
npm ci
npm test
firebase emulators:start --only auth,firestore,hosting --project demo-l5r-rules
# In a second terminal:
npm run test:rules
```

The emulators require Java 21 or later. Open `http://127.0.0.1:5000/?emulators` for isolated browser testing against `demo-l5r-rules`. Without this opt-in, sign-in and saves use production Firebase. The security and service suites use separate emulator projects from the browser app. The rules suite checks owners, GMs, players, outsiders, anonymous users, stale and forged grants, invitation expiry/revocation, hidden-field reads, visibility changes, and PC association removal. The service suite exercises campaign CRUD, invitation replacement, linking, live edits across campaigns, member removal, leaving, and deletion. Unit tests cover character calculations, account sync, storage migration, all visibility masks, and durable campaign drafts.

For browser verification, sign in with a Google test account in the emulator widget, then run `playwright-cli run-code --filename scripts/browser_checks.js`. It checks desktop and mobile navigation, long sessions, joining, new PCs, private roster labels, NPC privacy, player access controls and live GM edits. Run `scripts/browser_link_checks.js` through the same CLI command to check existing PCs in two campaigns and campaign deletion. `scripts/browser_character_checks.js` uses a fresh signed-out context for inline required choices, offline drafts, XP awards, emphasis popups, segmented traits, equipment, abilities, responsive layouts, print/export, and Save PC closing. `scripts/browser_privacy_checks.js` creates isolated emulator accounts and checks all 128 masks in live player responses, followed by revocation. `scripts/verify_live.js` checks the deployed site using device characters only.

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
