# Last Haiku archive

A modern static archive of the public [Last Haiku](https://lasthaiku.wikidot.com/) Legend of the Five Rings wiki. It includes a dark theme, foldable section navigation, full text search, article contents, mobile layouts, and links to each original page. Book titles open their menus directly; the home page lets readers choose a book and then a section. Book of Earth contains Combat and Rolls, while Book of Fire contains character options and equipment.

The character creator under Book of Fire uses the wiki's family, school, skill, advantage, and disadvantage data. It calculates starting bonuses, Rings, Insight, and XP; saves the character in the browser; and can print or export a JSON sheet. It is a creation aid, so read the linked source entries for restrictions and special cases.

The source wiki states that its content is licensed under [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The site retains attribution and the same license for imported content. Legend of the Five Rings is the property of its respective owners.

## Local use

Serve the repository root with any static file server, for example `python3 -m http.server 8000`, and open `http://localhost:8000`.

## Refreshing content

`scripts/import_wiki.py` fetches the public wiki pages into `public/wiki.json` and `public/assets`. `scripts/build_character_data.py` derives the creator catalog from that snapshot. Both scripts use Beautiful Soup 4. Run them in that order after installing `beautifulsoup4` in the Python environment. Imported pages are a snapshot; the published site does not automatically sync with the source wiki.
