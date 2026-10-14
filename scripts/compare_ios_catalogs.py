"""Audit every iOS resource row against the web catalog without modifying either.

Usage: python3 scripts/compare_ios_catalogs.py --ios-resources PATH --source-revision SHA
Only explicit aliases and normalized names are matched; fuzzy matches are suggestions.
"""

import argparse
from collections import Counter, defaultdict
import difflib
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REPO = "https://github.com/tharak/LegendOfTheFiveRings"
CATEGORIES = ["Advantages", "Ancestors", "Armors", "Clans", "Disadvantages", "Families",
              "Katas", "Kihos", "Schools", "ShadowlandsPowers", "Skills", "Spells", "Tattoos", "Weapons"]

# Reviewed spelling/title equivalents, not similarity-based substitutions.
ALIASES = {
    "Advantages": {"Sacrosant": "Sacrosanct", "Versatility": "Void Versatility"},
    "Ancestors": {"Kitsu": "Kitus", "Basso": "Basso (Shinmaki Sect]"},
    "Disadvantages": {"Dependant": "Dependent", "Low Pain Threshold": "Low Pain Threshhold",
                      "Shadolands Taint": "Shadowlands Taint"},
    "Kihos": {"Breaking Flow": "Breaking Blow", "Flee the Darkness": "Flee the Darknes",
              "Grasp of the Earth Dragon": "Grasp the Earth Dragon", "Partaking the Waves": "Partaking the Waters"},
    "Schools": {
        "Daidoji Iron Warriors": "Daidoji Iron Warrior", "Order of the Spider": "The Order of the Spider Monks",
        "Original Chuda Shugenja": None,  # The Spider school with the same family name is a different school.
        "Dark Paragons": "Dark Paragon", "Dutiful Disciple": "Dutiful Disciple Shugenja",
        "Ronin Order": "Ronin Order Shugenja", "Kakita Artisans": "Kakita Artisan",
        "Kakita Master Artisans": "Kakita Master Artisan", "Tamor Master of the Mountain": "Tamori Master of the Mountain",
        "Matsu Beastmasters": "Matsu Beastmaster", "Shosuro Actors": "Shosuro Actor",
        "Yogo Wardmasters": "Yogo Wardmaster", "Meishodo Magic and the Horiuchi Shugenja": "Horiuchi Shugenja",
        "Moto Vindicators": "Moto Vindicator", "Hiruma Scouts": "Hiruma Scout",
        "Scorpion Saboteurs": "Scorpion Saboteur", "Moto Death Priests": "Moto Death Priest",
        "Sodan-Senzo": "Kitsu Sodan-Senzo", "Otomo Diplomats": "Otomo Diplomat (Owl)",
        "Hantei Bushi": "Hantei Bushi (Owl)",
        "Hoshi Tsurui Zumi": "The Hoshi Tsurui Zumi Order", "Hitomi Kikage Zumi": "The Hitomi Kikage Zumi Order",
        "Hawk Purists (Path)": "Hawk Purist", "Fudoist Monks": "Fudoist Order",
    },
    "ShadowlandsPowers": {"Distrupt the Chi": "Disrupt the Chi"},
    "Skills": {"War Fans": "War Fan"},
    "Spells": {
        "Hiden Visage": "Hidden Visage", "Echoes on a Breeze": "Echoes on the Breeze",
        "Tesubo of Earth": "Tetsubo of Earth", "Foce of Will": "Force of Will",
        "Bonds of Ningden-Do": "Bonds of Ningen-Do", "Strike at he Roots": "Strike at the Roots",
        "Enticing Danc of the Flam": "Enticing the Dance of Flame", "Wisdom of Clarity": "Wisdom & Clarity",
        "Strike of th Tsumi": "Strike of the Tsunami", "Sense Vow": "Sense Void",
        "Echoes of the Void": "Echoes in the Void", "Fill with Emptiness": "Fill the Emptiness",
        "Ispire Fear": "Inspire Fear", "Summn Undead Champion": "Summon Undead Champion",
        "Summon On": "Summon Oni", "Tamori’s Curse": "Agasha’s Shield (Tamori’s Curse)",
        "Santuary of the Waves": "SANCTUARY OF THE WAVES", "The Transmute Spell": "Transmute",
        "Judgement of Yomi": "Judgment Of Yomi", "Heart Betays Eyes": "Heart Betrays Eyes",
        "Strength ofthe ts\nunami": "STRENGTH OF THE TSUNAMI",
        "Cloak of the Night": "Cloak of Night", "Ring of Void": "Ring of the Void",
    },
}


def normalize(value):
    """Ignore case, typography and whitespace, while retaining letters/numbers."""
    text = unicodedata.normalize("NFKD", str(value or "")).casefold().replace("&", " and ")
    return re.sub(r"[^a-z0-9]", "", text)


def text_key(value):
    """Normalize prose without erasing signs, fractions or decimal points."""
    text = unicodedata.normalize("NFKD", str(value or "")).casefold().replace("&", " and ")
    text = text.translate(str.maketrans({"−": "-", "–": "-", "—": "-"}))
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"\.(?!\d)|-(?!\d)|(?<!\d)/|/(?!\d)", "", text)
    return re.sub(r"[^a-z0-9+\-./%]", "", text)


def name_key(category, value):
    text = re.sub(r"\[[^]]*\]", "", value).strip()
    if category == "Ancestors":
        text = text.split("(", 1)[0].rstrip("] ")
    if category == "Schools":
        text = re.sub(r"^New Basic School:\s*", "", text, flags=re.I)
        text = re.sub(r"^.+? Clan\s*-\s*", "", text, flags=re.I)
        text = re.sub(r"\s*\(Path\)\s*$", "", text, flags=re.I)
        text = re.sub(r"\s+(School|Monks?)$", "", text, flags=re.I)
    if category in ("Clans", "Schools"):
        text = re.sub(r"^The\s+", "", text, flags=re.I)
    return normalize(text)


def snapshot(value):
    """Bound long prose in the report; hashes identify the full compared values."""
    if isinstance(value, str) and len(value) > 500:
        return {"excerpt": value[:500], "characters": len(value),
                "sha256": hashlib.sha256(value.encode()).hexdigest()}
    return value


def comparison(field, ios, web, kind="value", canonical=None):
    canonical = canonical or (lambda value: text_key(value) if isinstance(value, str) else value)
    if canonical(ios) == canonical(web):
        return None
    return {"field": field, "kind": kind, "ios": snapshot(ios), "web": snapshot(web)}


def numbers(value):
    return sorted(set(float(n) for n in re.findall(r"\d+(?:\.\d+)?", str(value if value is not None else ""))))


def traits(value):
    return sorted(re.findall(r"Stamina|Willpower|Reflexes|Awareness|Strength|Perception|Agility|Intelligence|Void", str(value)))


def pieces(value):
    return sorted(normalize(part) for part in re.split(r",|/", str(value)) if normalize(part) not in ("", "none"))


def technique_parts(technique):
    title = re.sub(r"^Rank\s+\d+\s*:\s*", "", technique.get("name", ""), flags=re.I)
    description = technique.get("description", "")
    if title == "Starting technique":
        split = re.split(r"\s+[-–—]\s+", description, maxsplit=1)
        if len(split) == 2:
            return split
    return title, description


def school_fields(ios, web):
    pairs = [("advanced", ios["advanced"], web.get("kind") == "advanced", "value", None),
             ("discipline", ios["discipline"], web.get("discipline", ""), "value", None)]
    for field in ["benefit", "honor", "skills", "outfit", "affinity", "spells"]:
        if field not in ios:
            continue
        target = web.get("skillsRaw", "") if field == "skills" else web.get(field, "")
        canonical = traits if field == "benefit" else numbers if field == "honor" else None
        pairs.append((field, ios[field], target, "text" if field in ["skills", "outfit", "spells", "affinity"] else "value", canonical))
    techniques = {t["rank"]: technique_parts(t) for t in web.get("techniques", [])}
    for rank in range(1, 6):
        for suffix, index in [("", 0), ("Description", 1)]:
            key = f"technique{rank}{suffix}"
            if key in ios:
                pairs.append((key, ios[key], techniques.get(rank, ("", ""))[index], "text" if suffix else "value", None))
    return pairs


def compare_fields(category, ios, web):
    """Return differences and source fields lacking a standalone web field."""
    pairs, unrepresented = [], []
    add = lambda field, a, b, kind="value", canonical=None: pairs.append((field, a, b, kind, canonical))
    if category in ("Weapons", "Armors"):
        for field, value in ios.items():
            if field != "name":
                add(field, value, web.get(field), "text" if field == "description" else "value",
                    (lambda x: x[0] if isinstance(x, list) and len(x) == 1 else x) if field == "tn" else None)
    elif category == "Clans":
        add("great", ios["great"], web["group"] == "Great Clans")
        unrepresented.append("description")
    elif category == "Families":
        add("clan", ios["clan"], web["_clans"][0], canonical=lambda x: name_key("Clans", x))
        add("benefit", ios["benefit"], web.get("trait", ""), canonical=traits)
        unrepresented.append("description")
    elif category == "Schools":
        pairs = school_fields(ios, web)
        if web.get("_clans"):
            add("clan", ios["clan"], web["_clans"][0], canonical=lambda x: name_key("Clans", x))
        else:
            unrepresented.append("clan")
        # Basic-school background prose is linked in Books, not stored on the entry.
        unrepresented.append("description")
        for field in ["ringTraits", "other"]:
            if field in ios:
                add(field + " vs combined requirements", ios[field], web.get("requirements", ""), "combined_prerequisites")
    elif category == "Skills":
        add("category", ios["category"], web["group"])
        add("trait", ios["trait"], web["traits"], canonical=lambda v: traits(v))
        add("emphasis", ios["emphasis"], ",".join(web["emphases"]), canonical=pieces)
        source_masteries = {int(m[1]): m[2].strip() for m in re.finditer(r"Rank\s+(\d+):\s*(.*?)(?=\s+Rank\s+\d+:|$)", ios["mastery"], re.S)}
        target_masteries = {m["rank"]: m["description"] for m in web["masteries"]}
        add("mastery", source_masteries, target_masteries, "text", lambda values: {rank: text_key(text) for rank, text in values.items()})
        add("description", ios["description"], web["description"], "text")
        unrepresented.append("type")
    elif category in ("Advantages", "Disadvantages"):
        add("points", numbers(ios["points"]), sorted(web["costs"]))
        description = web.get("description", "")
        if description.startswith(web["label"]):
            description = description[len(web["label"]):].strip()
        add("description", ios["description"], description, "text")
        unrepresented.append("subtype")
    elif category == "Ancestors":
        add("points", numbers(ios["points"]), [web["cost"]])
        add("clan", ios["clan"], web["clan"], "text")
        split = re.split(r"\bDemands:\s*", web["description"], maxsplit=1)
        add("description", ios["description"], split[0], "text")
        add("demands", ios["demands"], split[1] if len(split) > 1 else "", "text")
    else:
        add("description", ios["description"], web["description"], "text")
        for field in ["ring", "mastery", "schools", "type", "level"]:
            if field in ios:
                canonical = numbers if field == "mastery" else pieces if field == "schools" else None
                if field == "level":
                    canonical = lambda v: {"greater": "major", "lesser": "mutations"}.get(normalize(v), normalize(v))
                add(field, ios[field], web.get(field, ""), canonical=canonical)
        if category == "Kihos":
            # The web stores the label inside free-form Type, not an atemi boolean.
            add("atemi", ios["atemi"], "1" if "atemi" in web.get("type", "").lower() else "0", "derived_flag")
        if category == "Spells":
            for field, target in [("keywords", "ring/mastery"), ("range", "range"),
                                  ("area", "area of effect"), ("duration", "duration"), ("raises", "raises")]:
                if field not in ios:
                    continue
                value = web["fields"].get(target, "")
                if field == "keywords":
                    value = value or web["fields"].get("ring/master", "")
                    match = re.search(r"[\[(]([^\])]+)[\])]", value)
                    value = match[1] if match else ""
                if field == "area":
                    value = value or web["fields"].get("area of self", "") or web["fields"].get("area", "")
                add(field, ios[field], value, "text", pieces if field == "keywords" else None)
    differences = [d for field, a, b, kind, canonical in pairs
                   if (d := comparison(field, a, b, kind, canonical))]
    covered = {field.split(" vs combined requirements")[0] for field, *_ in pairs} | {"name"} | set(unrepresented)
    unrepresented.extend(sorted(set(ios) - covered))
    return differences, unrepresented, [field for field, *_ in pairs]


def web_catalogs(catalog):
    families, schools = [], []
    for clan in catalog["clans"]:
        families += [dict(f, _clans=[clan["name"]]) for f in clan["families"]]
        schools += [dict(s, _clans=[clan["name"]], _location="starting") for s in clan["schools"]]
    for school in catalog["training"]:
        owners = [clan["name"] for clan in catalog["clans"] if clan.get("schoolSource") == school["slug"]]
        schools.append(dict(school, _clans=owners if len(owners) == 1 else [], _location=school["kind"]))
    result = {"Clans": catalog["clans"], "Families": families, "Schools": schools}
    for name, key in [("Skills", "skills"), ("Advantages", "advantages"), ("Disadvantages", "disadvantages"),
                      ("Ancestors", "ancestors"), ("Weapons", "weapons"), ("Armors", "armors")]:
        result[name] = catalog[key]
    for name, kind in [("Katas", "kata"), ("Kihos", "kiho"), ("Spells", "spell"),
                       ("Tattoos", "tattoo"), ("ShadowlandsPowers", "shadowlands")]:
        result[name] = [e for e in catalog["abilities"] if e["kind"] == kind]
    return result


def identity(category, entry):
    if category == "Families":
        return (entry["name"], tuple(entry["_clans"]))
    return entry.get("id") or (entry["slug"] + "#" + entry["anchor"] if "anchor" in entry else entry["name"])


def target_ref(category, entry):
    return {"name": entry["name"], "identity": identity(category, entry),
            **({"clans": entry["_clans"]} if "_clans" in entry else {}),
            **({"location": entry["_location"]} if "_location" in entry else {}),
            **({"rule_link": f"/#/{entry['slug']}" + (f"#{entry['anchor']}" if entry.get("anchor") else "")} if entry.get("slug") else {})}


class PlainText(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.feed(html)
        self.text = normalize(" ".join(self.parts))

    def handle_data(self, data):
        self.parts.append(data)


def wiki_evidence(name, pages):
    """A mention is evidence of text only, never proof of a complete rules entry."""
    keys = {normalize(name), normalize(re.sub(r"\s*\(Path\)$", "", name, flags=re.I))}
    return [slug for slug, text in pages.items() if any(key and key in text for key in keys)]


def match_entry(category, source, targets):
    aliases = ALIASES.get(category, {})
    label = aliases.get(source["name"], source["name"])
    # Owl reuses Imperial family names for distinct schools.
    if category == "Schools" and source.get("clan") == "Owl" and source["name"] == "Seppun Shugenja":
        label = "Seppun Shugenja (Owl)"
    if label is None:
        return [], "distinct_school"
    candidates = [e for e in targets if name_key(category, e["name"]) == name_key(category, label)]
    if source.get("clan") and category in ("Families", "Schools"):
        scoped = [e for e in candidates if any(name_key("Clans", owner) == name_key("Clans", source["clan"])
                                             for owner in e.get("_clans", []))]
        if scoped:
            candidates = scoped
    if len(candidates) > 1 and category == "Schools":
        scoped = [e for e in candidates if (e.get("kind") == "advanced") == source["advanced"]]
        if scoped:
            candidates = scoped
    if len(candidates) > 1 and category == "Spells":
        scoped = [e for e in candidates if normalize(e.get("ring", "")) == normalize(source["ring"])]
        if scoped:
            candidates = scoped
    unique = {str(identity(category, e)): e for e in candidates}
    method = "explicit_alias" if label != source["name"] else "name" if any(e["name"] == label for e in unique.values()) else "normalized_name"
    return list(unique.values()), method


def audit(resources, catalog, wiki, revision):
    files = sorted(resources.glob("*.json"))
    actual = {p.stem for p in files}
    if actual != set(CATEGORIES):
        raise ValueError(f"Resource inventory changed: missing={set(CATEGORIES)-actual}, unmapped={actual-set(CATEGORIES)}")
    web = web_catalogs(catalog)
    pages = {slug: PlainText(page["html"]).text for slug, page in wiki["pages"].items()}
    categories = []
    for path in files:
        category = path.stem
        source_rows = json.loads(path.read_text())
        targets = web[category]
        matched_ids, source_groups = set(), defaultdict(list)
        items = []
        for index, source in enumerate(source_rows):
            item = {"row": index + 1, "name": source["name"]}
            for field in ["clan", "ring"]:
                if field in source:
                    item[field] = source[field]
            matches, method = match_entry(category, source, targets)
            if len(matches) == 1:
                target = matches[0]
                item.update(status="matched", match_method=method, web=target_ref(category, target))
                item["differences"], item["not_standalone_fields"], item["compared_fields"] = compare_fields(category, source, target)
                if category == "Schools":
                    actual_ranks = {t["rank"] for t in target.get("techniques", [])}
                    item["missing_technique_ranks"] = [rank for rank in range(1, 6)
                                                       if source.get(f"technique{rank}") and rank not in actual_ranks]
                matched_ids.add(str(identity(category, target)))
            elif matches:
                item.update(status="ambiguous", candidates=[target_ref(category, t) for t in matches])
            elif category == "Families" and source["name"] == "The Brotherhood of Shinsei":
                item.update(status="implemented_outside_catalog", implementation="character-rules.js:192",
                            note="The +1 Void benefit is applied when the selected school has brotherhood=true; no selectable family entry.")
            else:
                item.update(status="not_in_catalog", wiki_mentions=wiki_evidence(source["name"], pages))
                names = {name_key(category, t["name"]): t["name"] for t in targets}
                item["possible_name_matches"] = [names[n] for n in difflib.get_close_matches(name_key(category, source["name"]), names, n=3, cutoff=.68)]
            items.append(item)
            source_groups[(name_key(category, source["name"]), name_key("Clans", source.get("clan", "")),
                           normalize(source.get("ring", "")), source.get("advanced"))].append((index + 1, source))
        duplicates = []
        for group in source_groups.values():
            if len(group) < 2:
                continue
            fields = sorted({k for _, row in group for k in row if any(comparison(k, row.get(k), other.get(k)) for _, other in group)})
            first = group[0][1]
            duplicates.append({"name": first["name"], "clan": first.get("clan", ""), "ring": first.get("ring", ""),
                               "rows": [n for n, _ in group], "conflicting_fields": fields,
                               "values": {field: [{"row": n, "value": snapshot(row.get(field))} for n, row in group] for field in fields}})
        status_counts = Counter(item["status"] for item in items)
        field_counts = Counter(d["field"] for item in items for d in item.get("differences", []))
        unmatched_web = {str(identity(category, t)): target_ref(category, t) for t in targets if str(identity(category, t)) not in matched_ids}
        categories.append({"category": category, "source_file": path.name,
                           "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                           "ios_rows": len(items), "ios_identities": len(source_groups), "web_rows": len(targets),
                           "web_identities": len({str(identity(category, t)) for t in targets}),
                           "status_counts": dict(status_counts),
                           "matched_rows_with_differences": sum(bool(item.get("differences")) for item in items),
                           "difference_counts_by_field": dict(field_counts),
                           "source_fields": dict(Counter(k for row in source_rows for k in row)),
                           "source_duplicates": duplicates, "items": items,
                           "web_only": sorted(unmatched_web.values(), key=lambda e: e["name"].casefold())})
    return {"source_repository": SOURCE_REPO, "source_revision": revision,
            "source_directory": "Sources/LegendOfTheFiveRings/Resources", "categories": categories}


def findings(report, catalog):
    categories = {c["category"]: c for c in report["categories"]}
    missing = {name: [i["name"] for i in c["items"] if i["status"] == "not_in_catalog"]
               for name, c in categories.items() if c["status_counts"].get("not_in_catalog")}
    spells = [i for i in categories["Spells"]["items"] if i["status"] == "not_in_catalog"]
    school_ranks = [{"row": i["row"], "name": i["name"], "ranks": i["missing_technique_ranks"]}
                    for i in categories["Schools"]["items"] if i.get("missing_technique_ranks")]
    issues = []
    for ability in catalog["abilities"]:
        if len(ability["name"]) > 150:
            issues.append({"kind": "suspicious_name", "identity": ability["id"], "name": snapshot(ability["name"])})
        if ability["kind"] == "spell":
            for title in ["Commune", "Sense", "Summon"]:
                if ability["name"] != title and re.search(rf"(?:^|\n){title}\s*\[CR\]", ability["description"]):
                    issues.append({"kind": "neighboring_spell_in_description", "name": ability["name"], "neighbor": title})
    return {"missing_entries": missing, "missing_spell_groups": {
                "Name magic": sum(i.get("ring") == "Name" for i in spells),
                "Tsuno magic": sum("tsuno" in i.get("wiki_mentions", []) or i["name"] == "Spruned by Sakkaku" for i in spells),
                "Other": sum(i.get("ring") != "Name" and "tsuno" not in i.get("wiki_mentions", []) and i["name"] != "Spruned by Sakkaku" for i in spells)},
            "school_rows_with_missing_technique_ranks": school_ranks, "web_catalog_anomalies": issues}


def markdown(report):
    rows = report["categories"]
    lines = ["# iOS and web catalog comparison", "",
             f"Source: [{report['source_repository'].split('/')[-1]} at `{report['source_revision']}`]({SOURCE_REPO}/tree/{report['source_revision']}/Sources/LegendOfTheFiveRings/Resources).",
             f"Web catalog SHA-256: `{report['web_catalog_sha256']}`. Includes the Yoritomo Bushi parser fix.", "",
             f"Compared all **{sum(r['ios_rows'] for r in rows):,} rows across {len(rows)} JSON files**. Both directions are recorded in [the machine-readable report](ios-catalog-comparison.json).", "",
             "## Findings to act on", "",
             f"**{sum(len(v) for v in report['findings']['missing_entries'].values())} iOS entries have no structured catalog counterpart.** Missing counts: " + ", ".join(f"{name}: {len(values)}" for name,values in report['findings']['missing_entries'].items()) + ".", "",
             "Missing spells: " + ", ".join(f"{name}: {count}" for name,count in report['findings']['missing_spell_groups'].items()) + ". Name magic and Tsuno systems are reference material in the current site; their absence from the picker is distinct from ordinary Rokugani import failures.", "",
             f"**{len(report['findings']['school_rows_with_missing_technique_ranks'])} matched school rows lack one or more iOS technique rank slots.** See the per-row `missing_technique_ranks` values. Missing structured ranks do not necessarily mean the prose is absent from Books or a combined description.", "",
             "[Manually reviewed findings and reconciliation priorities](ios-catalog-review.md) explain the import defects and concrete rule differences in this snapshot. That review is separate from this generated inventory.", "",
             "The iOS source also requires cleanup: repeated spell identities can contain conflicting values, and several names/clan labels are misspelled. Replacing our data wholesale would carry those issues over. Retain web-only supplementary entries when reconciling the sources.", "",
             "## How to read this audit", "",
             "Name matching ignores case, punctuation, source tags and known school wrappers. Explicit spelling/title aliases are recorded below. Fuzzy suggestions never count as matches. Family membership and reused school names are scoped by clan where possible; school advanced flags and spell rings resolve remaining name collisions. Source rows are never discarded. Source identities use normalized name, clan, ring and advanced flag, so a path and advanced school with the same name remain distinct.", "",
             "`Not in catalog` means absent from the structured character catalog. A wiki mention only proves text is present somewhere in Books; it does not prove a complete or selectable rules entry. Brotherhood's +1 Void is implemented in character rules rather than as a family choice. True Ronin options remain separate unmatched entries.", "",
             "A differing field is a review finding, not proof the iOS value is correct. Prose comparison ignores case, ordinary typography and whitespace, preserves mathematical signs/fractions/decimals, and does not infer equivalent rules. School skills/outfits/spell lists are compared as text; reordered lists and equivalent phrasing can differ. Prerequisites combine multiple iOS fields into one web field and are flagged separately. Original school background prose, family/clan descriptions, advantage/disadvantage subtypes and skill types lack standalone comparable fields; see each item's `not_standalone_fields`. No source descriptions are silently treated as verified equivalents.", "",
             "The report contains one record per iOS row, every comparable differing field, duplicate source conflicts and every web-only identity. Long values include an excerpt, character count and SHA-256 of the full value. Missing source fields are not assumed to mean a zero/default value.", "",
             "## Catalog coverage", "",
             "| Catalog | iOS rows | iOS identities | Web identities | Matched rows | Not in catalog | Other implementation | Ambiguous | Rows with field differences |",
             "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for row in rows:
        s = row["status_counts"]
        lines.append(f"| {row['category']} | {row['ios_rows']} | {row['ios_identities']} | {row['web_identities']} | {s.get('matched',0)} | {s.get('not_in_catalog',0)} | {s.get('implemented_outside_catalog',0)} | {s.get('ambiguous',0)} | {row['matched_rows_with_differences']} |")
    for row in rows:
        lines += ["", f"## {row['category']}", ""]
        missing = [i for i in row["items"] if i["status"] != "matched"]
        lines.append(f"Web-only identities: {len(row['web_only'])}. Full names and rule links are in the JSON report.")
        if missing:
            lines += ["", "Missing or separately implemented source entries:", ""]
            for item in missing:
                context = item.get("clan", item.get("ring", ""))
                detail = "implemented in character rules" if item["status"] == "implemented_outside_catalog" else "ambiguous identity" if item["status"] == "ambiguous" else "not in structured catalog"
                mentions = item.get("wiki_mentions", [])
                if mentions:
                    detail += "; wiki mentions: " + ", ".join(f"`{slug}`" for slug in mentions)
                suggestions = item.get("possible_name_matches", [])
                if suggestions:
                    detail += "; unconfirmed suggestions: " + ", ".join(suggestions)
                lines.append(f"- Row {item['row']}: **{item['name'].replace(chr(10), ' ')}**{f' ({context})' if context else ''}: {detail}.")
        aliases = [item for item in row["items"] if item.get("match_method") == "explicit_alias"]
        if aliases:
            lines += ["", "Explicit title/spelling matches:", ""]
            for item in aliases:
                lines.append(f"- Row {item['row']}: {item['name'].replace(chr(10),' ')} → {item['web']['name']}.")
        if row["difference_counts_by_field"]:
            lines += ["", "Differing comparable fields (row counts; prose and list differences require review):", "",
                      ", ".join(f"`{field}`: {count}" for field, count in sorted(row["difference_counts_by_field"].items())) + "."]
        value_diffs = [(item,d) for item in row["items"] for d in item.get("differences",[]) if d["kind"] in ["value", "derived_flag"]]
        if value_diffs:
            lines += ["", "Value/label differences:", "", "| iOS row / item | Field | iOS | Web |", "| --- | --- | --- | --- |"]
            for item,d in value_diffs:
                fmt = lambda v: json.dumps(v,ensure_ascii=False).replace("|", "\\|").replace("\n", " ")
                lines.append(f"| {item['row']} / {item['name'].replace(chr(10),' ')} | {d['field']} | {fmt(d['ios'])} | {fmt(d['web'])} |")
        if row["source_duplicates"]:
            lines += ["", f"Source duplicate identity groups: {len(row['source_duplicates'])}; {sum(bool(d['conflicting_fields']) for d in row['source_duplicates'])} contain differing fields. Full row references and values are in JSON."]
    lines += ["", "## Reproduce", "", "Use a checkout of the source repository at the revision above, then run:", "", "```sh",
              "python3 scripts/compare_ios_catalogs.py \\",
              "  --ios-resources /path/to/LegendOfTheFiveRings/Sources/LegendOfTheFiveRings/Resources \\",
              f"  --source-revision {report['source_revision']}", "```", "",
              "This command only writes the two comparison reports. It never updates the runtime catalog.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ios-resources", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "reports")
    args = parser.parse_args()
    catalog_path = ROOT / "public/character-data.json"
    report = audit(args.ios_resources, json.loads(catalog_path.read_text()),
                   json.loads((ROOT / "public/wiki.json").read_text()), args.source_revision)
    report["web_catalog_sha256"] = hashlib.sha256(catalog_path.read_bytes()).hexdigest()
    report["findings"] = findings(report, json.loads(catalog_path.read_text()))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "ios-catalog-comparison.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    (args.output_dir / "ios-catalog-comparison.md").write_text(markdown(report))
    for row in report["categories"]:
        print(row["category"], row["ios_rows"], row["status_counts"], "differing:", row["matched_rows_with_differences"])


if __name__ == "__main__":
    main()
