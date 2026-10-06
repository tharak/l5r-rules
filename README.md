# l5r-rules

Campaigns, personal PCs, and five searchable books for Legend of the Five Rings. The responsive top bar keeps Campaigns, Characters, and Books visible on mobile. Existing article hashes and `#/create-character` still work; the old home route opens Campaigns. Import attribution and licensing are in [ATTRIBUTION.md](ATTRIBUTION.md), which is excluded from the hosting build.

Signed-out users create, edit, print, and export device PCs. Google sign-in gives each account its own personal roster and cloud sync. **Copy device characters** explicitly imports device PCs with their existing IDs. Existing browser keys, account caches, pending writes, and active selections migrate to `l5r-rules` names.

Creating a campaign makes its creator the sole GM. Members link their own personal PCs; each association references the same live sheet. The GM edits the title and plain-text sessions, manages private name-and-notes NPCs, and removes members or PCs. Players read sessions, remove their own associations, and leave campaigns. Membership removal removes that player's associations. Campaign deletion preserves personal PCs. Sessions, PCs, and GM-only NPCs share a panel with a segmented selector. Sessions autosave plain text with its line breaks intact. **Save NPC** saves a new NPC and clears the form for the next entry.

The GM’s **Invite link** button beside **+PC** creates or reuses a valid invitation and copies it to the clipboard, with a copyable popup when clipboard access is unavailable. Expired links are renewed automatically. **Invite settings** under Members keeps replacement and revocation available. Invite links last seven days; signing in and pressing **Join campaign** is required. Invitations are stored separately from member-readable campaign data.

Each PC has six **Public** checkboxes. Identity starts public; the other sections start private. Owners control these settings. GMs can edit full linked sheets but cannot change their privacy. Other players read, print, and export only selected sections. A PC without public identity uses a neutral roster label. Skills share ranks and emphases, while summary and combat share their displayed derived totals when selected. Training is part of identity; concept, notes, equipment, and money are part of story.

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

For browser verification, sign in with a Google test account in the emulator widget, then run `playwright-cli run-code --filename scripts/browser_checks.js`. It checks desktop and mobile navigation, long sessions, joining, new PCs, private roster labels, NPC privacy, player print/export, and live GM edits. Run `scripts/browser_link_checks.js` through the same CLI command to check existing PCs in two campaigns and campaign deletion.

Deploy after checks:

```sh
firebase deploy --only hosting,firestore:rules
```

The predeploy build copies an explicit web-asset list and sanitizes imported source links. Repository documents, scripts, tests, configuration, and the source PDF are excluded.

## Refreshing books

`scripts/import_wiki.py` refreshes `public/wiki.json` and assets. `scripts/build_character_data.py` derives the creator catalog. Both require Beautiful Soup 4. After importing, retain source attribution in `ATTRIBUTION.md`; the build removes source metadata, localizes available article links, and preserves the text of other outbound links. Imported content is a snapshot and does not automatically refresh.
