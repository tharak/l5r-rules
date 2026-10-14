# Review of the iOS/web catalog comparison

This review applies to iOS commit `1c43bfc9ce955c6d015ebcbb5677b62a0285262c` and the web catalog after `bd7403c`. The [full inventory](ios-catalog-comparison.md) and [per-row JSON report](ios-catalog-comparison.json) contain the matching decisions, both directions of coverage, field differences and source hashes. This review does not change game data.

## Coverage

All 1,199 rows in all 14 iOS JSON catalogs were compared. There are 85 unmatched entries in the structured web catalog, plus Brotherhood's family-like +1 Void benefit implemented in character rules rather than as a selectable family.

| Catalog | Entries absent from the structured web catalog | Details |
| --- | ---: | --- |
| Spells | 68 | 44 Name magic, 23 Tsuno spells, The Mending Forge |
| Schools | 6 | Original Chuda Shugenja; Fukurokujin's Eyes; Tsuno Ravager; Tsuno Soultwister; Order of Jurojin's Blessing; Shrine of Heaven's Mirror |
| Kata | 5 | Lee of the Stone; Strike as the Avalanche; The Power of the Mountain; The Strength of the Mountain; Weathered and Unbroken |
| Skills | 3 | Empathy; Firearms; Cannon |
| Families/options | 3 | Yoshun; True Ronin #1; True Ronin #2 |

Name magic and nonhuman character systems currently live in Books/reference material. Their absence from character pickers is different from ordinary Rokugani import defects. True Ronin entries are creation packages with XP/disadvantage rules, not ordinary family trait bonuses; they cannot safely become simple family entries.

All iOS clan, advantage, disadvantage, ancestor, kiho, tattoo, weapon and armor names have counterparts after explicit spelling/title matches. All 56 weapon records match their source fields. Armor has one differing field: Riding Armor's alternative TN values. There are also many web-only supplementary entries; reconciliation must preserve those.

## Confirmed import defects

These observations were checked against the current builder, `public/wiki.json` and the runtime catalog, independently of which source's game rules are preferred.

- The five absent Earth kata use **Ring Mastery** labels. `powers_for()` recognizes `ring/mastery`, `ring/master` and `mastery`, so it skips these otherwise complete entries.
- **The Mending Forge** has a malformed `Ring/Mastery 4 (Craft)` line without a colon. `fields_after()` cannot parse that mastery, so the spell is skipped.
- **Commune and Sense** inherit following spells' fields/descriptions. Their exported range, area, duration and raises are the Summon values. Commune's description includes Sense and Summon; Sense's description includes Summon. The importer also creates a spurious spell whose name is an 805-character paragraph beginning “A spirit reached with Commune…”.
- Several technique headers use spelled-out ranks or split their titles across elements. `school_info()` recognizes only numeric `Rank N:` headers inside strong text. For example, **Heichi Bushi rank 5**, all three **Imperial Scion** ranks and all three **Kolat Assassin** ranks are present in Books but absent from structured technique arrays.
- **Transmute** has `Any non-Void 2` in its imported fields but its structured ring is **Void**. The builder's element regex selects the `Void` substring inside `non-Void`.
- **Snake clan's school is replaced with the Spider Chuda school.** The minor-school page contains the original Chuda school and its *To Punish the Wicked* technique, but the builder explicitly assigns Snake the Spider-clan school list. Its picker therefore exposes *Blood Like Water* instead of the original school.

Eight matched iOS school rows lack one or more structured rank slots: Heichi Bushi, Imperial Scion, Kolat Assassin, Legion of Two Thousand, Disciples of Sun Tao (advanced), Generic Ronin, Tsudao's Legion and Children of Doji. This count is a comparison finding; not every one has been established as an import defect. Several advanced schools retain technique prose in a combined description.

## Rule values needing reconciliation

These are source disagreements or information losses. This comparison does not establish which version is correct.

| Entry / field | iOS JSON | Web catalog |
| --- | --- | --- |
| Agasha family benefit | +1 Perception | +1 Intelligence |
| Kitsune family in Fox clan | +1 Willpower | +1 Awareness |
| Chuda family in Snake clan | +1 Strength | +1 Intelligence |
| Intimidation trait | Awareness | Willpower |
| Strength Of Purity Style mastery | 4 | 3 |
| As the Breakers mastery | 5 | 4 |
| Perceived Honor cost metadata | 2 | 3 |
| Agasha ancestor cost | 11 | 6 |
| Riding Armor TN | [4, 12] | 4 |
| Forest Killers starting Honor | 4.5 | 1.5 |
| Fudoist Monks starting Honor | 1.5 or 4.5 | 1.5 |

The armor builder explicitly reduces TN arrays to their first value. The current equipment calculation uses that scalar and has no mounted armor branch. Other conditional benefits may be recorded with manual modifiers; the alternative is no longer available as structured armor data.

Six school disciplines differ: Tsi Smith (Artisan/Bushi), Shiba Artisan (Artisan/Courtier), Kaiu Engineer (Artisan + Bushi/Bushi), Kakita Artisan (Artisan/Bushi), Kakita Master Artisan (Artisan/Bushi), and Daidoji Harriers (Ninja/Bushi). The builder guesses discipline from keywords in the title, which loses compound disciplines and Artisan designations. This can affect discipline-dependent option pricing.

Owl-clan Hantei, Otomo and Seppun names have web counterparts, but those counterparts are grouped under Imperial and there is no Owl clan selection. Their membership differences are recorded separately from missing names. The iOS `Clans.json` also omits Owl despite referring to it in family and school rows.

Raw cost-list differences on variable or ranked advantages/disadvantages need separate treatment. Empty lists do not mean the character editor charges zero: it accepts selected base costs, variants and custom costs. Clan/family/discipline adjustments are calculated from descriptions, so equivalent base prices alone do not prove equivalent pricing behavior. This audit compares catalog data, not every possible character configuration.

Some differences are presentation choices: web clans and families link to descriptive Books pages instead of storing a standalone description, and ancestor demands are embedded in their descriptions. Advantage/disadvantage subtype and skill type metadata lack standalone fields. All such cases are recorded in `not_standalone_fields` rather than claimed to match.

## iOS source quality

The 500 spell rows form 397 normalized name/ring identities. There are 103 duplicate identity groups, of which 38 contain differing fields after ignoring typography/case. Each row and every conflict is retained in the JSON report; selecting the first occurrence would silently discard disagreements.

The source also contains misspellings such as `Mantsi`/`Matnis` for Mantis and `Tamor` for Tamori, alongside many spell-title typos. Conversely, some names are misspelled on the web (`Kitus`, `Flee the Darknes`). Explicit mappings distinguish name discrepancies from missing entries. Disciples of Sun Tao has separate path and advanced entries, and Imperial/Owl schools reuse names: those identities must remain distinct.

## Suggested reconciliation order

1. Correct demonstrated import boundary/header failures: universal spells, the five Earth kata, The Mending Forge and spelled-out technique ranks. This recovers existing reference content without choosing between conflicting rules.
2. Compare conflicting bonuses, costs, disciplines and mastery values with the intended edition/source before changing them. Restore conditional values without reducing them to a single scalar.
3. Use normalized iOS JSON as an input for supported character catalogs, with explicit conflict decisions, retained source identifiers and web-only supplementary entries.
4. Handle Name magic, Tsuno systems, nonstandard skills and True Ronin packages according to the character builder's intended scope, rather than treating every missing selector as the same kind of defect.

The audit script regenerates the inventory and JSON report. This document is a manually reviewed interpretation of the pinned snapshot and should be reviewed again after catalog changes.
