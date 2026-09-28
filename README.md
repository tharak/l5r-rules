# Last Haiku archive

A modern static archive of the public [Last Haiku](https://lasthaiku.wikidot.com/) Legend of the Five Rings wiki. It includes section navigation, full text search, article contents, mobile layouts, and links to each original page.

The source wiki states that its content is licensed under [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The site retains attribution and the same license for imported content. Legend of the Five Rings is the property of its respective owners.

## Local use

Serve the repository root with any static file server, for example `python3 -m http.server 8000`, and open `http://localhost:8000`.

## Refreshing content

`scripts/import_wiki.py` fetches the public wiki pages into `public/wiki.json` and `public/assets`. It uses Beautiful Soup 4. Run it with `python3 scripts/import_wiki.py` after installing `beautifulsoup4` in the Python environment. Imported pages are a snapshot; the published site does not automatically sync with the source wiki.
