"""Build structured character choices from the imported wiki snapshot."""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, "/tmp/l5r-deps")
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
wiki = json.loads((ROOT / "public/wiki.json").read_text(encoding="utf-8"))["pages"]

great = [
    ("Crab", "fcrab", "sccrab"), ("Crane", "fcrane", "sccrane"),
    ("Dragon", "fdragon", "scdragon"), ("Lion", "flion", "sclion"),
    ("Mantis", "fmantis", "scmantis"), ("Phoenix", "fphoenix", "scphoenix"),
    ("Scorpion", "fscorpion", "scscorpion"), ("Spider", "fspider", "scspider"),
    ("Unicorn", "funicorn", "scunicorn"),
]

TRAITS = "Reflexes|Awareness|Stamina|Willpower|Agility|Intelligence|Strength|Perception|Void"


def soup_for(slug):
    return BeautifulSoup(wiki[slug]["html"], "html.parser")


def family_matches(text, slug, anchor=""):
    pattern = rf"(?:The\s+)?([A-Z][A-Za-z'’\- ]+?)\s+Family\s*:\s*\+\s*1\s+({TRAITS})\b"
    return [{"name": match.group(1).strip(), "trait": match.group(2), "slug": slug, "anchor": anchor}
            for match in re.finditer(pattern, text, re.I)]


def families_for(slug):
    soup = soup_for(slug)
    families = []
    for h in soup.select("h1, h2, h3"):
        families.extend(family_matches(h.get_text(" ", strip=True), slug, h.get("id", "")))
    if not families:
        families = family_matches(soup.get_text("\n", strip=True), slug)
    return families


def split_items(text):
    """Separate list entries without splitting emphases or equipment alternatives."""
    parts, start, depth = [], 0, 0
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(text[start:index].strip())
            start = index + 1
    parts.append(text[start:].strip())
    return [part.rstrip(".") for part in parts if part]


def parse_skills(raw):
    # These typographical errors occur in the imported snapshot.
    raw = raw.replace("Courtier (Manipulation, Defense", "Courtier (Manipulation), Defense")
    raw = raw.replace("Spellcraft: any", "Spellcraft, any")
    raw = raw.replace("Stealth (Sneaking) any", "Stealth (Sneaking), any")
    raw = re.sub(r"(High|Bugei|Merchant|Low),\s*(?=(?:or\s+)?(?:High|Bugei|Merchant|Low)\b)", r"\1 / ", raw)
    parts = split_items(raw)
    skills, choices = [], []
    aliases = {"Mediation": "Meditation", "Knivs": "Knives", "Jiujustu": "Jiujutsu",
               "Kyujustu": "Kyujutsu", "Defenses": "Defense", "Stealthy": "Stealth",
               "War Fans": "War Fan", "Theology": "Lore: Theology"}
    for index, part in enumerate(parts):
        part = re.sub(r"^and\s+(?=\w)", "", part, flags=re.I)
        selection = part if re.search(r"\b(pick|either)\b", part, re.I) else re.sub(r"\([^)]*\)", "", part)
        if re.search(r"\b(any|either|pick|chosen|one\s+(?:High|Low|Bugei|Skill))\b", selection, re.I) and not re.search(r"emphas", part, re.I):
            if "following list" in part:
                part = ", ".join(parts[index:])
            rank = 2 if re.search(r"two ranks", part, re.I) else 1
            count_match = re.search(r"(?:any|pick)\s+(one|two|three|[123])", part, re.I)
            count = {"one": 1, "two": 2, "three": 3, "1": 1, "2": 2, "3": 3}[count_match.group(1).lower()] if count_match else 1
            for _ in range(count):
                choices.append({"prompt": part, "rank": rank, "kind": "skill"})
            if "following list" in part:
                break
            continue
        rank_match = re.search(r"\s+(\d+)$", part)
        rank = int(rank_match.group(1)) if rank_match else 1
        if rank_match:
            part = part[:rank_match.start()].strip()
        emphasis_match = re.search(r"\s*\((.+)\)$", part)
        emphasis = emphasis_match.group(1) if emphasis_match else ""
        name = part[:emphasis_match.start()].strip() if emphasis_match else part
        name = re.sub(r":\s*", ": ", aliases.get(name, name))
        notes = ""
        if re.search(r"\b(treat|may replace)\b", emphasis, re.I):
            notes, emphasis = emphasis, ""
        if re.search(r"\b(pick|choose)\b", emphasis, re.I):
            choices.append({"prompt": f"{name}: {emphasis}", "kind": "emphasis", "skill": name, "rank": 0})
            emphasis = ""
        skill = {"name": name, "rank": rank, "emphases": [emphasis] if emphasis else []}
        if notes:
            skill["notes"] = notes
        skills.append(skill)
    return skills, choices


def school_info(heading, slug):
    raw_title = heading.get_text(" ", strip=True)
    name = re.sub(r"\s*\[[^]]+\]", "", raw_title).strip()
    fields = {}
    techniques = []
    for sibling in heading.next_siblings:
        if getattr(sibling, "name", None) in ("h1", "h2", "h3"):
            break
        if not getattr(sibling, "select", None):
            continue
        for li in sibling.select("li"):
            text = li.get_text(" ", strip=True)
            field_match = re.match(r"^(Benefit|(?:Starting |School )?Skills|Honor|Outfit|Affinity\s*/\s*Deficiency|Spells|Technique)\s*:\s*\*?\*?\s*(.*)", text, re.I)
            if field_match:
                label = field_match.group(1).lower()
                if label.endswith("skills"):
                    label = "skills"
                fields[label] = field_match.group(2)
        for paragraph in [sibling] if sibling.name == "p" else sibling.select("p"):
            for strong in paragraph.find_all("strong"):
                title = strong.get_text(" ", strip=True)
                if re.match(r"Rank\s+1\s*:", title, re.I):
                    text = paragraph.get_text(" ", strip=True)
                    techniques.append({"name": title, "description": text[text.index(title) + len(title):].strip()})
    benefit_match = re.search(rf"\+\s*1\s+({TRAITS})\b", fields.get("benefit", ""), re.I)
    honor_match = re.search(r"\d+(?:\.\d+)?", fields.get("honor", ""))
    skills_raw = fields.get("skills", "")
    skills, choices = parse_skills(skills_raw)
    if fields.get("technique"):
        techniques.append({"name": "Starting technique", "description": fields["technique"]})
    outfit_items = split_items(fields.get("outfit", ""))
    equipment, money = [], {}
    for item in outfit_items:
        currency = re.fullmatch(r"(\d+)\s+(koku|bu|zeni)", item, re.I)
        if currency:
            money[currency.group(2).lower()] = int(currency.group(1))
        else:
            count_match = re.search(r"any\s+(one|two|[12])\b", item, re.I)
            count = 2 if count_match and count_match.group(1).lower() in ("two", "2") else 1
            for _ in range(count):
                equipment.append({"name": item, "choice": bool(re.search(r"\b(any|or)\b", item, re.I))})
    return {"name": name, "slug": slug, "anchor": heading.get("id", ""),
            "benefit": benefit_match.group(1).title() if benefit_match else "",
            "honor": float(honor_match.group()) if honor_match else None,
            "outfit": fields.get("outfit", ""), "skills": skills,
            "choices": [choice["prompt"] for choice in choices], "skillChoices": choices, "skillsRaw": skills_raw,
            "equipment": equipment, "money": money, "techniques": techniques,
            "affinity": fields.get("affinity / deficiency", ""), "spells": fields.get("spells", "")}


def schools_for(slug):
    soup = soup_for(slug)
    current_section = ""
    schools = []
    for h in soup.select("h1, h2, h3"):
        title = h.get_text(" ", strip=True)
        if h.name == "h1":
            current_section = title.lower()
            continue
        if "basic schools" not in current_section:
            continue
        if h.name == "h3" and not any(word in title.lower() for word in ("bushi", "shugenja", "courtier")):
            continue
        info = school_info(h, slug)
        if info["benefit"] or info["skills"]:
            schools.append(info)
    return schools


clans = []
for name, family_slug, school_slug in great:
    clans.append({"name": name, "group": "Great Clans", "families": families_for(family_slug),
                  "schools": schools_for(school_slug), "familySource": family_slug, "schoolSource": school_slug})

minor_soup = soup_for("fminor")
minor_groups = {}
for h in minor_soup.select("h1"):
    name_match = re.match(r"The (.+?) Clan", h.get_text(" ", strip=True))
    if not name_match:
        continue
    name = name_match.group(1)
    text = []
    for sibling in h.next_siblings:
        if getattr(sibling, "name", None) == "h1":
            break
        if getattr(sibling, "get_text", None):
            text.append(sibling.get_text(" ", strip=True))
    minor_groups[name] = family_matches("\n".join(text), "fminor", h.get("id", ""))

minor_schools = schools_for("scminor")
for name, families in minor_groups.items():
    if not families and name == "Falcon":
        families = [family for family in clans[0]["families"] if family["name"] == "Toritaka"]
    if not families and name == "Fox":
        families = [family for family in clans[4]["families"] if family["name"] == "Kitsune"]
    if not families and name == "Snake":
        families = [family for family in clans[7]["families"] if family["name"] == "Chuda"]
    school_matches = [school for school in minor_schools
                      if school["name"].lower().startswith(name.lower() + " clan")
                      or any(school["name"].lower().startswith(family["name"].lower() + " ") for family in families)]
    if name == "Falcon":
        school_matches = [school for school in clans[0]["schools"] if school["name"].startswith("Toritaka ")]
    if name == "Fox":
        school_matches = [school for school in clans[4]["schools"] if school["name"].startswith("Kitsune ")]
    if name == "Snake":
        school_matches = [school for school in clans[7]["schools"] if school["name"].startswith("Chuda ")]
    clans.append({"name": name, "group": "Minor Clans", "families": families,
                  "schools": school_matches, "familySource": "fminor", "schoolSource": "scminor"})

clans.append({"name": "Imperial", "group": "Other", "families": families_for("fimperial"),
              "schools": schools_for("scimperial"), "familySource": "fimperial", "schoolSource": "scimperial"})

ronin_text = soup_for("fronin").get_text("\n", strip=True)
ronin_families = [{"name": m.group(1), "trait": m.group(2), "slug": "fronin", "anchor": ""}
                  for m in re.finditer(rf"^([A-Za-z'’\-]+)\s*\(\+1\s+({TRAITS})\)", ronin_text, re.M)]
clans.append({"name": "Ronin", "group": "Other", "families": ronin_families,
              "schools": schools_for("scronin"), "familySource": "fronin", "schoolSource": "scronin"})

skills = []
for slug, group in (("high-skills", "High"), ("bugei-skills", "Bugei"),
                    ("merchant-skills", "Merchant"), ("low-skills", "Low")):
    for h in soup_for(slug).select("h1, h2"):
        title = h.get_text(" ", strip=True)
        if title:
            trait_match = re.search(r"\(([^)]+)\)$", title)
            skill_traits = re.findall(rf"\b({TRAITS})\b", trait_match.group(1)) if trait_match else []
            specialty_traits = {}
            if not skill_traits:
                description = []
                for sibling in h.next_siblings:
                    if getattr(sibling, "name", None) in ("h1", "h2"):
                        break
                    if getattr(sibling, "get_text", None):
                        description.append(sibling.get_text(" ", strip=True))
                subtypes = " ".join(description).split("Emphases:", 1)[0]
                for match in re.finditer(rf"([A-Za-z][A-Za-z &\-]+?)\s*\(({TRAITS})\)", subtypes):
                    specialty = re.sub(r"^includes\s+", "", match.group(1)).strip()
                    specialty_traits[specialty] = match.group(2)
            skills.append({"name": re.sub(r"\s*\([^)]*\)$", "", title), "group": group,
                           "slug": slug, "anchor": h.get("id", ""),
                           "traits": skill_traits, "specialtyTraits": specialty_traits})


def point_choices(label):
    match = re.search(r"\((\d+(?:\s*/\s*\d+)*)\s+Points?\)", label, re.I)
    return [int(number) for number in re.findall(r"\d+", match.group(1))] if match else []


def options_for(slug):
    entries = []
    for strong in soup_for(slug).select("p > strong"):
        label = strong.get_text(" ", strip=True)
        if not label:
            continue
        name = re.split(r"\s*\[|\s*\(", label, maxsplit=1)[0].strip()
        if name:
            entries.append({"name": name, "label": label, "costs": point_choices(label)})
    unique = {entry["name"]: entry for entry in entries}
    return sorted(unique.values(), key=lambda entry: entry["name"].lower())


result = {"clans": clans, "skills": skills, "advantages": options_for("advantages"),
          "disadvantages": options_for("disadvantages")}
(ROOT / "public/character-data.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
print(f"{len(clans)} clans, {sum(len(c['families']) for c in clans)} families, "
      f"{sum(len(c['schools']) for c in clans)} starting schools, {len(skills)} skills, "
      f"{len(result['advantages'])} advantages, {len(result['disadvantages'])} disadvantages")
