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


def school_info(heading, slug):
    raw_title = heading.get_text(" ", strip=True)
    name = re.sub(r"\s*\[[^]]+\]", "", raw_title).strip()
    fields = {}
    for sibling in heading.next_siblings:
        if getattr(sibling, "name", None) in ("h1", "h2", "h3"):
            break
        if not getattr(sibling, "select", None):
            continue
        for li in sibling.select("li"):
            strong = li.find("strong")
            if strong:
                label = strong.get_text(" ", strip=True).rstrip(":").lower()
                if label in ("benefit", "skills", "honor", "outfit"):
                    fields[label] = li.get_text(" ", strip=True).split(":", 1)[-1].strip()
    benefit_match = re.search(rf"\+\s*1\s+({TRAITS})\b", fields.get("benefit", ""), re.I)
    honor_match = re.search(r"\d+(?:\.\d+)?", fields.get("honor", ""))
    skills_raw = fields.get("skills", "")
    skills = []
    choices = []
    for part in skills_raw.split(","):
        part = part.strip()
        if not part:
            continue
        if re.search(r"\b(any|one of|two of|choice|either)\b", part, re.I):
            choices.append(part)
            continue
        rank_match = re.search(r"\s+(\d+)$", part)
        rank = int(rank_match.group(1)) if rank_match else 1
        if rank_match:
            part = part[:rank_match.start()].strip()
        skills.append({"name": part, "rank": rank})
    return {"name": name, "slug": slug, "anchor": heading.get("id", ""),
            "benefit": benefit_match.group(1).title() if benefit_match else "",
            "honor": float(honor_match.group()) if honor_match else None,
            "outfit": fields.get("outfit", ""), "skills": skills,
            "choices": choices, "skillsRaw": skills_raw}


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
            skills.append({"name": re.sub(r"\s*\([^)]*\)$", "", title), "group": group,
                           "slug": slug, "anchor": h.get("id", "")})


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
