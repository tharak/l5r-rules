# iOS and web catalog comparison

Source: [LegendOfTheFiveRings at `1c43bfc9ce955c6d015ebcbb5677b62a0285262c`](https://github.com/tharak/LegendOfTheFiveRings/tree/1c43bfc9ce955c6d015ebcbb5677b62a0285262c/Sources/LegendOfTheFiveRings/Resources).
Web catalog SHA-256: `501688fe7e27e7f3630e97d1619249c36b2e207180625f5b41dfaef52fa207ff`. Includes the Yoritomo Bushi parser fix.

Compared all **1,199 rows across 14 JSON files**. Both directions are recorded in [the machine-readable report](ios-catalog-comparison.json).

## Findings to act on

**85 iOS entries have no structured catalog counterpart.** Missing counts: Families: 3, Katas: 5, Schools: 6, Skills: 3, Spells: 68.

Missing spells: Name magic: 44, Tsuno magic: 23, Other: 1. Name magic and Tsuno systems are reference material in the current site; their absence from the picker is distinct from ordinary Rokugani import failures.

**8 matched school rows lack one or more iOS technique rank slots.** See the per-row `missing_technique_ranks` values. Missing structured ranks do not necessarily mean the prose is absent from Books or a combined description.

[Manually reviewed findings and reconciliation priorities](ios-catalog-review.md) explain the import defects and concrete rule differences in this snapshot. That review is separate from this generated inventory.

The iOS source also requires cleanup: repeated spell identities can contain conflicting values, and several names/clan labels are misspelled. Replacing our data wholesale would carry those issues over. Retain web-only supplementary entries when reconciling the sources.

## How to read this audit

Name matching ignores case, punctuation, source tags and known school wrappers. Explicit spelling/title aliases are recorded below. Fuzzy suggestions never count as matches. Family membership and reused school names are scoped by clan where possible; school advanced flags and spell rings resolve remaining name collisions. Source rows are never discarded. Source identities use normalized name, clan, ring and advanced flag, so a path and advanced school with the same name remain distinct.

`Not in catalog` means absent from the structured character catalog. A wiki mention only proves text is present somewhere in Books; it does not prove a complete or selectable rules entry. Brotherhood's +1 Void is implemented in character rules rather than as a family choice. True Ronin options remain separate unmatched entries.

A differing field is a review finding, not proof the iOS value is correct. Prose comparison ignores case, ordinary typography and whitespace, preserves mathematical signs/fractions/decimals, and does not infer equivalent rules. School skills/outfits/spell lists are compared as text; reordered lists and equivalent phrasing can differ. Prerequisites combine multiple iOS fields into one web field and are flagged separately. Original school background prose, family/clan descriptions, advantage/disadvantage subtypes and skill types lack standalone comparable fields; see each item's `not_standalone_fields`. No source descriptions are silently treated as verified equivalents.

The report contains one record per iOS row, every comparable differing field, duplicate source conflicts and every web-only identity. Long values include an excerpt, character count and SHA-256 of the full value. Missing source fields are not assumed to mean a zero/default value.

## Catalog coverage

| Catalog | iOS rows | iOS identities | Web identities | Matched rows | Not in catalog | Other implementation | Ambiguous | Rows with field differences |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Advantages | 77 | 77 | 102 | 77 | 0 | 0 | 0 | 31 |
| Ancestors | 56 | 56 | 58 | 56 | 0 | 0 | 0 | 42 |
| Armors | 4 | 4 | 4 | 4 | 0 | 0 | 0 | 1 |
| Clans | 26 | 26 | 34 | 26 | 0 | 0 | 0 | 1 |
| Disadvantages | 67 | 67 | 78 | 67 | 0 | 0 | 0 | 35 |
| Families | 70 | 70 | 137 | 66 | 3 | 1 | 0 | 4 |
| Katas | 34 | 34 | 38 | 29 | 5 | 0 | 0 | 13 |
| Kihos | 61 | 61 | 71 | 61 | 0 | 0 | 0 | 32 |
| Schools | 136 | 136 | 384 | 130 | 6 | 0 | 0 | 127 |
| ShadowlandsPowers | 46 | 46 | 61 | 46 | 0 | 0 | 0 | 12 |
| Skills | 45 | 45 | 43 | 42 | 3 | 0 | 0 | 2 |
| Spells | 500 | 397 | 346 | 432 | 68 | 0 | 0 | 329 |
| Tattoos | 21 | 21 | 25 | 21 | 0 | 0 | 0 | 10 |
| Weapons | 56 | 56 | 56 | 56 | 0 | 0 | 0 | 0 |

## Advantages

Web-only identities: 25. Full names and rule links are in the JSON report.

Explicit title/spelling matches:

- Row 53: Sacrosant → Sacrosanct.
- Row 72: Versatility → Void Versatility.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 30, `points`: 8.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 2 / Allies | points | [1.0, 2.0, 4.0] | [] |
| 4 / Blackmail | points | [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0] | [] |
| 25 / Gentry | points | [8.0, 15.0, 18.0, 20.0, 25.0, 30.0] | [] |
| 38 / Kharmic Tie | points | [1.0, 2.0, 3.0, 4.0, 5.0] | [] |
| 39 / Languages | points | [1.0, 3.0] | [] |
| 46 / Perceived Honor | points | [2.0] | [3] |
| 52 / Sacred Weapon | points | [3.0, 5.0, 6.0] | [] |
| 68 / Wealthy | points | [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0] | [1] |

## Ancestors

Web-only identities: 2. Full names and rule links are in the JSON report.

Explicit title/spelling matches:

- Row 25: Kitsu → Kitus.
- Row 53: Basso → Basso (Shinmaki Sect].

Differing comparable fields (row counts; prose and list differences require review):

`clan`: 17, `demands`: 17, `description`: 24, `points`: 1.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 5 / Agasha | points | [11.0] | [6] |

## Armors

Web-only identities: 0. Full names and rule links are in the JSON report.

Differing comparable fields (row counts; prose and list differences require review):

`tn`: 1.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 4 / Riding Armor | tn | [4, 12] | 4 |

## Clans

Web-only identities: 8. Full names and rule links are in the JSON report.

Differing comparable fields (row counts; prose and list differences require review):

`great`: 1.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 9 / Spider | great | false | true |

## Disadvantages

Web-only identities: 11. Full names and rule links are in the JSON report.

Explicit title/spelling matches:

- Row 19: Dependant → Dependent.
- Row 44: Low Pain Threshold → Low Pain Threshhold.
- Row 54: Shadolands Taint → Shadowlands Taint.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 31, `points`: 10.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 7 / Blackmailed | points | [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0] | [] |
| 13 / Compulsion | points | [2.0, 3.0, 4.0] | [] |
| 14 / Consumed | points | [4.0, 5.0, 6.0] | [] |
| 19 / Dependant | points | [2.0, 3.0, 5.0, 6.0] | [] |
| 25 / Elemental Imbalance | points | [2.0, 4.0, 6.0, 8.0, 10.0] | [2] |
| 28 / Failure of Bushido | points | [3.0, 4.0, 6.0] | [] |
| 47 / Obligation | points | [3.0, 6.0] | [] |
| 51 / Phobia | points | [1.0, 2.0, 3.0] | [] |
| 61 / Unlucky | points | [2.0, 4.0, 6.0, 8.0, 10.0] | [2] |
| 66 / Bounty | points | [2.0, 4.0, 6.0] | [] |

## Families

Web-only identities: 71. Full names and rule links are in the JSON report.

Missing or separately implemented source entries:

- Row 59: **The Brotherhood of Shinsei** (The Brotherhood of Shinsei): implemented in character rules.
- Row 60: **True Ronin #1** (Ronin): not in structured catalog.
- Row 61: **True Ronin #2** (Ronin): not in structured catalog.
- Row 69: **Yoshun** (Owl): not in structured catalog; wiki mentions: `history`; unconfirmed suggestions: Yotsu.

Differing comparable fields (row counts; prose and list differences require review):

`benefit`: 3, `clan`: 1.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 23 / Agasha | benefit | "+1 Perception" | "Intelligence" |
| 46 / Kitsune | benefit | "+1 Willpower" | "Awareness" |
| 53 / Chuda | benefit | "+1 Strength" | "Intelligence" |
| 68 / Hantei | clan | "Owl" | "Imperial" |

## Katas

Web-only identities: 9. Full names and rule links are in the JSON report.

Missing or separately implemented source entries:

- Row 10: **Lee of the Stone** (Earth): not in structured catalog; wiki mentions: `katas`.
- Row 25: **Strike as the Avalanche** (Earth): not in structured catalog; wiki mentions: `katas`.
- Row 31: **The Power of the Mountain** (Earth): not in structured catalog; wiki mentions: `katas`; unconfirmed suggestions: Power of the Tsunami.
- Row 32: **The Strength of the Mountain** (Earth): not in structured catalog; wiki mentions: `katas`, `earth-spells`; unconfirmed suggestions: Strength of the Mantis, Strength of the Unicorn, Strength of the Lion.
- Row 34: **Weathered and Unbroken** (Earth): not in structured catalog; wiki mentions: `katas`.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 1, `mastery`: 1, `schools`: 12.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 1 / Art of Ninjutsu | schools | "Daigotsu Bushi, Bayushi Bushi, Daidoji Scout, Shosuro Actor, Shosuro Infiltrator, Goju Ninja" | "Daigotsu Bushi, Bayushi Bushi, Daidoji Scout, Shoshuro Actor, Shoshuro Infiltrator, Goju Ninja" |
| 4 / Dance Of The Winds | schools | "Daidoji Iron Warriors, Shiba Bushi" | "Daidoji Bushi, Shiba Bushi" |
| 11 / Reckless Abandon Style | schools | "Daigotsu Bushi, Matsu Berserker" | "Daigotsu Bushi, Matsu Berserker, Usagi Bushi" |
| 15 / Strength Of Purity Style | mastery | "4" | 3 |
| 16 / Strength Of The Crab | schools | "Crab Bushi" | "Any Crab Bushi" |
| 17 / Strength Of The Crane | schools | "Crane Bushi" | "Any Crane Bushi" |
| 18 / Strength Of The Dragon | schools | "Dragon Bushi" | "Any Dragon bushi" |
| 19 / Strength Of The Lion | schools | "Lion Bushi" | "Any Lion Bushi" |
| 20 / Strength of The Mantis | schools | "Mantis Bushi" | "Any Mantis Bushi" |
| 21 / Strength Of The Phoenix | schools | "Phoenix Bushi" | "Any Phoenix Bushi" |
| 22 / Strength Of The Scorpion | schools | "Scorpion Bushi" | "Any Scorpion Bushi" |
| 23 / Strength Of The Spider | schools | "Spider Bushi" | "Any Spider Bushi" |
| 24 / Strength Of The Unicorn | schools | "Unicorn Bushi" | "Any Unicorn Bushi" |

## Kihos

Web-only identities: 10. Full names and rule links are in the JSON report.

Explicit title/spelling matches:

- Row 5: Breaking Flow → Breaking Blow.
- Row 25: Flee the Darkness → Flee the Darknes.
- Row 27: Grasp of the Earth Dragon → Grasp the Earth Dragon.
- Row 32: Partaking the Waves → Partaking the Waters.

Differing comparable fields (row counts; prose and list differences require review):

`atemi`: 2, `description`: 27, `mastery`: 1, `type`: 3.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 2 / As the Breakers | mastery | "5" | 4 |
| 8 / Censure of Thunder | atemi | "1" | "0" |
| 17 / Earth Palm | type | "Martial" | "Martial (Atemi)" |
| 25 / Flee the Darkness | type | "Kharmic" | "Mystical" |
| 50 / The Rolling Avalanche | type | "Martial" | "Martial (Atemi)" |
| 54 / Touch of the Storm | atemi | "1" | "0" |

## Schools

Web-only identities: 254. Full names and rule links are in the JSON report.

Missing or separately implemented source entries:

- Row 47: **Original Chuda Shugenja** (Snake): not in structured catalog; wiki mentions: `scminor`; unconfirmed suggestions: Chuda Shugenja, Horiuchi Shugenja.
- Row 67: **Fukurokujin's Eyes** (The Brotherhood of Shinsei): not in structured catalog.
- Row 84: **Tsuno Ravager** (Tsuno): not in structured catalog; wiki mentions: `tsuno`; unconfirmed suggestions: Kitsune Ranger.
- Row 85: **Tsuno Soultwister** (Tsuno): not in structured catalog; wiki mentions: `tsuno`, `nezumi-tribes`.
- Row 124: **Order of Jurojin's Blessing** (The Brotherhood of Shinsei): not in structured catalog.
- Row 125: **Shrine of Heaven's Mirror (Path)** (The Brotherhood of Shinsei): not in structured catalog.

Explicit title/spelling matches:

- Row 8: Daidoji Iron Warriors → Daidoji Iron Warrior.
- Row 36: Order of the Spider → The Order of the Spider Monks.
- Row 77: Dark Paragons → Dark Paragon.
- Row 87: Dutiful Disciple → Dutiful Disciple Shugenja.
- Row 88: Ronin Order → Ronin Order Shugenja.
- Row 92: Kakita Artisans → Kakita Artisan.
- Row 93: Kakita Master Artisans → Kakita Master Artisan.
- Row 95: Tamor Master of the Mountain → Tamori Master of the Mountain.
- Row 96: Matsu Beastmasters → Matsu Beastmaster.
- Row 104: Shosuro Actors → Shosuro Actor.
- Row 105: Yogo Wardmasters → Yogo Wardmaster.
- Row 106: Meishodo Magic and the Horiuchi Shugenja → Horiuchi Shugenja.
- Row 107: Moto Vindicators → Moto Vindicator.
- Row 109: Hiruma Scouts → Hiruma Scout.
- Row 110: Scorpion Saboteurs → Scorpion Saboteur.
- Row 112: Hoshi Tsurui Zumi → The Hoshi Tsurui Zumi Order.
- Row 113: Hitomi Kikage Zumi → The Hitomi Kikage Zumi Order.
- Row 114: Moto Death Priests → Moto Death Priest.
- Row 115: Sodan-Senzo → Kitsu Sodan-Senzo.
- Row 117: Hantei Bushi → Hantei Bushi (Owl).
- Row 118: Otomo Diplomats → Otomo Diplomat (Owl).
- Row 119: Seppun Shugenja → Seppun Shugenja (Owl).
- Row 132: Hawk Purists (Path) → Hawk Purist.
- Row 135: Fudoist Monks → Fudoist Order.

Differing comparable fields (row counts; prose and list differences require review):

`affinity`: 20, `clan`: 11, `discipline`: 6, `honor`: 2, `other vs combined requirements`: 15, `outfit`: 67, `ringTraits vs combined requirements`: 16, `skills`: 60, `spells`: 22, `technique1`: 14, `technique1Description`: 87, `technique2`: 12, `technique2Description`: 51, `technique3`: 7, `technique3Description`: 53, `technique4`: 4, `technique4Description`: 48, `technique5`: 5, `technique5Description`: 46.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 4 / Hiruma Bushi | technique2 | "Wold's Little Lesson" | "Wolf's Little Lesson" |
| 5 / Kakita Bushi | technique2 | "Speed of Lightening" | "Speed of Lightning" |
| 8 / Daidoji Iron Warriors | technique2 | "The Shielf of Faith" | "The Shield of Faith" |
| 19 / Yoritomo Courtier | clan | "Mantsi" | "Mantis" |
| 27 / Bayushi Courtier | technique4 | "Scruitiny's Sweet Sting" | "Scrutiny's Sweet Sting" |
| 29 / Moto Bushi | technique2 | "Shinsei's Smil" | "Shinsei's Smile" |
| 30 / Iuchi Shugenja | technique1 | "Sprit of the Wind" | "Spirit of the Wind" |
| 33 / Daigotsu Bushi | technique5 | "Inhuman Assult" | "Inhuman Assault" |
| 35 / Daigotsu Courtier | technique1 | "Insidious Whisper" | "Insidious Whispers" |
| 39 / Heichi Bushi | technique5 | "Beyond the Mountains" | "" |
| 45 / Tsi Smith | discipline | "Artisan" | "Bushi" |
| 45 / Tsi Smith | technique2 | "Tsi Xing Gui's Blessing" | "Tsi Xing Guo's Blessing" |
| 53 / Miya Herald | technique4 | "Blessings of the Emperor" | "Blessing of the Emperor" |
| 54 / Four Temples | technique1 | "Soul of Civilty" | "Soul of Civility" |
| 61 / Forest Killers | honor | "4.5" | 1.5 |
| 70 / Imperial Scion | technique1 | "The Awe of the Throne" | "" |
| 70 / Imperial Scion | technique2 | "The Strength of the Throne" | "" |
| 70 / Imperial Scion | technique3 | "The Terror of the Throne" | "" |
| 72 / Shiba Artisan | discipline | "Artisan" | "Courtier" |
| 73 / Kobune Captain | technique3 | "Master of the Sea" | "Master of the Seas" |
| 74 / Doji Magistrate | technique1 | "Temper Stell with Honor" | "Temper Steel With Honor" |
| 77 / Dark Paragons | clan | "The Brotherhood of Shinsei" | "Spider" |
| 78 / Mirumoto Taoist Swordsman | technique5 | "Balance in Nothingness" | "Balance of Nothingness" |
| 80 / Kolat Assassin | technique1 | "Kiss of the Lotus" | "" |
| 80 / Kolat Assassin | technique2 | "Tiger's Claw" | "" |
| 80 / Kolat Assassin | technique3 | "Steal the Light" | "" |
| 81 / Dark Moto Cavalry | clan | "The Lost" | "Spider" |
| 82 / Maho-Bujin | clan | "The Lost" | "Spider" |
| 83 / Kenku Swordsman | clan | "Kenku" | "Other Rokugani" |
| 88 / Ronin Order | technique1 | "Path of Discipline" | "The Path of Discipline" |
| 89 / Kaiu Engineer | discipline | "Artisan, Bushi" | "Bushi" |
| 92 / Kakita Artisans | discipline | "Artisan" | "Bushi" |
| 92 / Kakita Artisans | technique1 | "Sould of the Artisan" | "Soul of the Artisan" |
| 93 / Kakita Master Artisans | discipline | "Artisan" | "Bushi" |
| 93 / Kakita Master Artisans | technique2 | "Mastery Unbounded" | "Mastery Unbound" |
| 101 / Moshi Guardian of the Sun (Path) | clan | "Matnis" | "Mantis" |
| 102 / Asako Henshin | technique2 | "The Riddle of Air" | "The Riddle of Earth" |
| 107 / Moto Vindicators | technique4 | "Avengine Our Own" | "Avenging Our Own" |
| 111 / Daidoji Harriers | discipline | "Ninja" | "Bushi" |
| 117 / Hantei Bushi | technique5 | "Judgement of the Celestial Dragon" | "Judgment of the Celestial Dragon" |
| 117 / Hantei Bushi | clan | "Owl" | "Imperial" |
| 118 / Otomo Diplomats | clan | "Owl" | "Imperial" |
| 119 / Seppun Shugenja | clan | "Owl" | "Imperial" |
| 121 / Order of Rebirth | technique1 | "Changing the Way" | "Starting technique" |
| 122 / Tengoku's Fist | technique1 | "The Temple of Heavenly Wisdom" | "The Hand of the Heavens" |
| 126 / Legion of two Thousand | technique1 | "Stand as Two Thousand" | "" |
| 126 / Legion of two Thousand | technique2 | "Kuronada's Honor" | "" |
| 126 / Legion of two Thousand | technique3 | "Tamago's Expertise" | "" |
| 127 / Disciples of Sun Tao | technique1 | "Terumoto's Lesson" | "" |
| 127 / Disciples of Sun Tao | technique2 | "Sun Tao's Lesson" | "" |
| 127 / Disciples of Sun Tao | technique3 | "Aikumo's Perfection" | "" |
| 128 / Generic Ronin | technique1 | "Strength of My Father" | "" |
| 128 / Generic Ronin | technique2 | "Never Yield" | "" |
| 128 / Generic Ronin | technique3 | "Bite of the Wolf" | "" |
| 128 / Generic Ronin | technique4 | "Twice-Cutting Spirit" | "" |
| 128 / Generic Ronin | technique5 | "Valor of the Wolf" | "" |
| 129 / Fuzake Shugenja | clan | "Ronin" | "Monkey" |
| 134 / Tsudao's Legion | technique3 | "Empowered by Her Name" | "" |
| 134 / Tsudao's Legion | clan | "Ronin" | "Imperial" |
| 135 / Fudoist Monks | honor | "1.5 or 4.5" | 1.5 |
| 136 / Children of Doji | technique1 | "Social Butterfly" | "" |

## ShadowlandsPowers

Web-only identities: 15. Full names and rule links are in the JSON report.

Explicit title/spelling matches:

- Row 34: Distrupt the Chi → Disrupt the Chi.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 8, `level`: 4.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 26 / Calligraphy of Thought | level | "Lesser" | "Minor" |
| 27 / Eyes of Hell | level | "Lesser" | "Minor" |
| 28 / Fear | level | "Lesser" | "Minor" |
| 29 / Sense Purity | level | "Lesser" | "Minor" |

## Skills

Web-only identities: 1. Full names and rule links are in the JSON report.

Missing or separately implemented source entries:

- Row 6: **Empathy**: not in structured catalog; wiki mentions: `traits`, `naga`, `advantages`, `ancestors`, `sclion`, `sclost`, `sccourt3`, `shapeshifter`.
- Row 44: **Firearms**: not in structured catalog; wiki mentions: `equipment`, `sccourt`.
- Row 45: **Cannon**: not in structured catalog; wiki mentions: `equipment`.

Explicit title/spelling matches:

- Row 33: War Fans → War Fan.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 1, `mastery`: 1, `trait`: 1.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 40 / Intimidation | trait | "Awareness" | ["Willpower"] |

## Spells

Web-only identities: 18. Full names and rule links are in the JSON report.

Missing or separately implemented source entries:

- Row 109: **The Mending Forge** (Fire): not in structured catalog; wiki mentions: `fire-spells`; unconfirmed suggestions: The Raging Forge.
- Row 321: **Beast Speech** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 322: **Bend Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 323: **Bless Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 324: **Conjure Dream** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 325: **Conjure Earth's Bounty** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 326: **Conjure Smoke** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 327: **Dream Walk** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 328: **Importune Transcendent** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 329: **Mend Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 330: **Named Friend** (Name): not in structured catalog.
- Row 331: **Named Weapon** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 332: **Smite the Nameless** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 333: **Burn Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 334: **Conjure Animal** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 335: **Conjure Named Weapon** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 336: **Conjure Perfect Self** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 337: **Hide Name** (Name): not in structured catalog; wiki mentions: `name-magic`; unconfirmed suggestions: Hidden Visage.
- Row 338: **Name Talent** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 339: **Purify Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 340: **Seek Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 341: **Share Cunning** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 342: **Share Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 343: **Bonds of Blood** (Name): not in structured catalog; wiki mentions: `name-magic`; unconfirmed suggestions: Symbol of Blood.
- Row 344: **Conjure Thoughts** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 345: **Conjure Trickster** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 346: **Curese of No-Lips** (Name): not in structured catalog.
- Row 347: **Named Warren** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 348: **Shield Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 349: **Temper Named Weapon** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 350: **Trade Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 351: **Find Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 352: **Bind Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 353: **Close the Door** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 354: **Conure Name** (Name): not in structured catalog.
- Row 355: **Paint the Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 356: **Set Blood Aside** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 357: **Steal Cunning** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 358: **Twist Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 359: **Conjure Chitatchikkan's Fury** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 360: **Conjure Nightmare** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 361: **Conjure Storm** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 362: **Conjure Tribe** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 363: **Take Name** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 364: **Dream Forever** (Name): not in structured catalog; wiki mentions: `name-magic`.
- Row 365: **Benevolence of Tengoku** (Fire): not in structured catalog; wiki mentions: `tsuno`.
- Row 366: **Bloodlust of Toshigoku** (Water): not in structured catalog; wiki mentions: `tsuno`.
- Row 367: **Dream Messages of Yume-do** (Water): not in structured catalog; wiki mentions: `tsuno`.
- Row 368: **Gaki-do's Grasping Hunger** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 369: **Meido's Lethargic Introspection** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 370: **Primal Senses of Chikushudo** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 371: **Sakkaku's Vandalism** (Fire): not in structured catalog; wiki mentions: `tsuno`.
- Row 372: **Yomi's Ancestral Separation** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 373: **Agony of Toshigoku** (Water): not in structured catalog; wiki mentions: `tsuno`.
- Row 374: **Bestial Nature of Chikushudo** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 375: **Gaki-do's Consuming Hunger** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 376: **Knowledge of Yomi** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 377: **Malicious Pranks of Sakkaku** (Fire): not in structured catalog; wiki mentions: `tsuno`.
- Row 378: **Meido's Call** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 379: **Shield of Tengoku** (Fire): not in structured catalog; wiki mentions: `tsuno`.
- Row 380: **Yume-do's Horrific Nightmares** (Water): not in structured catalog; wiki mentions: `tsuno`.
- Row 381: **Banished from Yomi** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 382: **Consumed by Gaki-do** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 383: **One with Chikushudo** (Air): not in structured catalog; wiki mentions: `tsuno`.
- Row 384: **Questioned by Meido** (Earth): not in structured catalog; wiki mentions: `tsuno`.
- Row 385: **Spruned by Sakkaku** (Fire): not in structured catalog.
- Row 386: **Tengoku's Grace** (Fire): not in structured catalog; wiki mentions: `tsuno`; unconfirmed suggestions: Suitengu's Embrace.
- Row 387: **Trapped in Yume-do** (Water): not in structured catalog; wiki mentions: `tsuno`.

Explicit title/spelling matches:

- Row 6: Cloak of the Night → Cloak of Night.
- Row 16: Hiden Visage → Hidden Visage.
- Row 37: Echoes on a Breeze → Echoes on the Breeze.
- Row 52: Tesubo of Earth → Tetsubo of Earth.
- Row 56: Foce of Will → Force of Will.
- Row 61: Bonds of Ningden-Do → Bonds of Ningen-Do.
- Row 75: Strike at he Roots → Strike at the Roots.
- Row 93: Enticing Danc of the Flam → Enticing the Dance of Flame.
- Row 138: Wisdom of Clarity → Wisdom & Clarity.
- Row 142: Strike of th Tsumi → Strike of the Tsunami.
- Row 164: Sense Vow → Sense Void.
- Row 174: Echoes of the Void → Echoes in the Void.
- Row 181: Fill with Emptiness → Fill the Emptiness.
- Row 186: Ring of Void → Ring of the Void.
- Row 193: Ispire Fear → Inspire Fear.
- Row 196: Summn Undead Champion → Summon Undead Champion.
- Row 209: Summon On → Summon Oni.
- Row 266: Tamori’s Curse → Agasha’s Shield (Tamori’s Curse).
- Row 287: Santuary of the Waves → SANCTUARY OF THE WAVES.
- Row 452: The Transmute Spell → Transmute.
- Row 456: Judgement of Yomi → Judgment Of Yomi.
- Row 458: Heart Betays Eyes → Heart Betrays Eyes.
- Row 482: Strength ofthe ts unami → STRENGTH OF THE TSUNAMI.
- Row 487: Santuary of the Waves → SANCTUARY OF THE WAVES.

Differing comparable fields (row counts; prose and list differences require review):

`area`: 134, `description`: 202, `duration`: 30, `keywords`: 71, `raises`: 63, `range`: 15, `ring`: 2.

Value/label differences:

| iOS row / item | Field | iOS | Web |
| --- | --- | --- | --- |
| 452 / The Transmute Spell | ring | "Any non-Void" | "Void" |
| 459 / Command | ring | "Any" | "All" |

Source duplicate identity groups: 103; 38 contain differing fields. Full row references and values are in JSON.

## Tattoos

Web-only identities: 4. Full names and rule links are in the JSON report.

Differing comparable fields (row counts; prose and list differences require review):

`description`: 10.

## Weapons

Web-only identities: 0. Full names and rule links are in the JSON report.

## Reproduce

Use a checkout of the source repository at the revision above, then run:

```sh
python3 scripts/compare_ios_catalogs.py \
  --ios-resources /path/to/LegendOfTheFiveRings/Sources/LegendOfTheFiveRings/Resources \
  --source-revision 1c43bfc9ce955c6d015ebcbb5677b62a0285262c
```

This command only writes the two comparison reports. It never updates the runtime catalog.
