"""Build structured character choices from the imported wiki snapshot."""

import json
import re
import sys
import argparse
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
    pattern = rf"^\s*(?:The\s+)?([A-Z][A-Za-z'’\- ]+?)\s+(Family|Order|Monks)\s*:\s*\+\s*1\s+({TRAITS})\b"
    families = []
    for match in re.finditer(pattern, text, re.I | re.M):
        name, kind, trait = match.groups()
        family = {"name": name.strip(), "trait": trait, "slug": slug, "anchor": anchor}
        if kind.lower() == "order":
            family["kind"] = "order"
        elif kind.lower() == "monks":
            family["name"] += " Monks"
        families.append(family)
    return families


def families_for(slug):
    soup = soup_for(slug)
    families = []
    anchor, vassals = "", False
    # Alternatives can be paragraph labels (Hitomi/Hoshi, Spider Monks), and
    # vassal entries are line-separated lists beneath their own heading.
    for node in soup.select("h1, h2, h3, p"):
        text = node.get_text(" ", strip=True)
        if node.name.startswith("h"):
            anchor = node.get("id", "")
            vassals = bool(re.match(r"Vassal Famil(?:i)?es", text, re.I))
        families.extend(family_matches(text, slug, anchor))
        if vassals and node.name == "p":
            pattern = rf"^\s*([A-Z][A-Za-z'’\- ]+?)\s*\(([^)]+)\)\s*:\s*\+\s*1\s+({TRAITS}|any Physical)\b"
            for match in re.finditer(pattern, node.get_text("\n", strip=True), re.M):
                name, parent, trait = match.groups()
                family = {"name": name.strip(), "trait": trait, "slug": slug, "anchor": anchor,
                          "parent": parent.strip()}
                if trait == "any Physical":
                    family["traitOptions"] = ["Stamina", "Reflexes", "Strength", "Agility"]
                families.append(family)
    families = list({family["name"]: family for family in families}.values())
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
               "War Fans": "War Fan", "Theology": "Lore: Theology", "Jijutsu": "Jiujutsu"}
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
            field_match = re.match(r"^(Benefit|(?:Starting |School )?Skills|(?:Starting )?Honor|Outfit|Devotion|Requirements|School Rank|Replaces|Affinity\s*/\s*Deficiency|Spells|Technique)\s*:\s*\*?\*?\s*(.*)", text, re.I)
            if field_match:
                label = field_match.group(1).lower()
                if label.endswith("skills"):
                    label = "skills"
                fields[label] = field_match.group(2)
        for paragraph in [sibling] if sibling.name == "p" else sibling.select("p"):
            for strong in paragraph.find_all("strong"):
                title = strong.get_text(" ", strip=True)
                if re.match(r"Rank\s+\d+\s*:", title, re.I):
                    text = paragraph.get_text(" ", strip=True)
                    techniques.append({"name": title, "rank": int(re.search(r"Rank\s+(\d+)", title, re.I).group(1)), "description": text[text.index(title) + len(title):].strip()})
    benefit_match = re.search(rf"\+\s*1\s+({TRAITS})\b", fields.get("benefit", ""), re.I)
    honor_match = re.search(r"\d+(?:\.\d+)?", fields.get("honor", fields.get("starting honor", "")))
    skills_raw = fields.get("skills", "")
    skills, choices = parse_skills(skills_raw)
    if fields.get("technique"):
        techniques.append({"name": "Starting technique", "rank": 1, "description": fields["technique"]})
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
            "discipline": "Shugenja" if "shugenja" in raw_title.lower() else "Monk" if "monk" in raw_title.lower() or slug == "scmonk" else "Courtier" if "courtier" in raw_title.lower() else "Ninja" if "ninja" in raw_title.lower() else "Bushi",
            "requirements": fields.get("requirements", ""), "replaces": fields.get("replaces", ""), "schoolRank": fields.get("school rank", ""), "devotion": fields.get("devotion", ""),
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
        if h.name == "h3" and not any(word in title.lower() for word in ("bushi", "shugenja", "courtier", "monk", "ninja", "henshin")):
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
    match = re.search(r"[\[(][^\d\])]*(\d+(?:\s*/\s*\d+)*)\s+Points?\b", label, re.I)
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


# Catalog entries always link to local books; never infer conditional mechanics from prose.
def clean_name(value):
    return re.sub(r"\s*\[[^]]*\]", "", value).strip().rstrip(":")


def fields_after(node):
    fields, paragraphs = {}, []
    for sibling in node.next_siblings:
        if not getattr(sibling, "name", None):
            continue
        if sibling.name in ('h1', 'h2', 'h3'):
            break
        if sibling.name == 'p' and (sibling.find('strong') or sibling.find('span', style=re.compile('underline'))):
            following = sibling.find_next_sibling()
            if following and following.name == 'ul' and re.search(r'Ring/Mastery|Mastery:', following.get_text()):
                break
        if sibling.name == 'ul':
            for li in sibling.find_all('li', recursive=False):
                text = li.get_text(' ', strip=True)
                m = re.match(r'([^:]+):\s*(.*)', text)
                if m:
                    fields[m[1].strip().lower()] = m[2]
        else:
            paragraphs.append(sibling.get_text(' ', strip=True))
    return fields, '\n'.join(paragraphs)


def powers_for(slug, kind):
    soup = soup_for(slug)
    entries, ring, anchor = [], '', ''
    for node in soup.select('h1,h2,h3,p'):
        if node.name.startswith('h'):
            anchor = node.get('id', '')
            m = re.search(r'\b(Air|Earth|Fire|Water|Void)\b', node.get_text())
            if m: ring = m[1]
            continue
        next_node = node.find_next_sibling()
        if not next_node or next_node.name != 'ul':
            continue
        fields, description = fields_after(node)
        mastery = fields.get('ring/mastery', fields.get('ring/master', fields.get('mastery', '')))
        if not mastery: continue
        level = re.search(r'\d+', mastery)
        if not level: continue
        element = re.search(r'Air|Earth|Fire|Water|Void|All|Universal', mastery, re.I)
        entry = {'id': f'{kind}:{slug}:{clean_name(node.get_text(" ", strip=True))}',
                 'name': clean_name(node.get_text(' ', strip=True)), 'kind': kind,
                 'ring': element[0].title() if element else ring, 'mastery': int(level[0]),
                 'description': description or fields.get('effect', ''), 'slug': slug, 'anchor': anchor,
                 'schools': fields.get('schools', ''), 'type': fields.get('type', ''),
                 'fields': fields}
        entries.append(entry)
    return entries


def inline_for(slug, kind):
    entries, faction, anchor = [], '', ''
    for node in soup_for(slug).select('h1,h2,h3,p,li'):
        if node.name.startswith('h'):
            faction = node.get_text(' ', strip=True).replace(' Ancestors', '')
            anchor = node.get('id', '')
            continue
        strong = node.find('strong', recursive=True)
        if not strong: continue
        label = strong.get_text(' ', strip=True)
        if kind == 'ancestor' and not re.search(r'\d+\s+Points', label, re.I): continue
        if kind == 'tattoo' and node.name != 'li': continue
        if kind == 'shadowlands' and node.name != 'p': continue
        name = clean_name(label)
        text = node.get_text(' ', strip=True)
        costs = re.findall(r'\d+', label)
        entries.append({'id': f'{kind}:{slug}:{name}', 'kind': kind, 'name': name,
                        'description': text[len(label):].strip(), 'clan': faction,
                        'cost': int(costs[0]) if costs else 0, 'slug': slug, 'anchor': anchor,
                        'level': slug.split('-')[0].title() if kind == 'shadowlands' else ''})
    return list({e['id']: e for e in entries}.values())


# Monk schools have a fixed outfit and no family benefit.
monks = schools_for('scmonk')
for school in monks:
    school['brotherhood'] = True
    school['equipment'] = [{'name': 'Bo', 'choice': False}, {'name': 'Traveling Clothing', 'choice': False}, {'name': 'Scroll Satchel', 'choice': False}]
    school['money'] = {'zeni': 2}
clans.append({'name': 'Brotherhood of Shinsei', 'group': 'Other', 'families': [], 'schools': monks})
# Human trainees of unusual schools remain selectable; foreign and nonhuman systems stay book references.
kenku = [school_info(h, 'scmisc') for h in soup_for('scmisc').select('h2') if 'Kenku Swordsman' in h.get_text()]
clans.append({'name': 'Other Rokugani', 'group': 'Other', 'families': [], 'schools': kenku})
# Lost and unusual minor clans retain their own family/school bonuses.
training = []
lost_soup = soup_for('sclost')
for h in lost_soup.select('h1'):
    title = h.get_text(' ', strip=True)
    match = re.search(r'The (.+?)(?: Clan)?$', title)
    if not match or any(x in title for x in ('Kiho', 'Advantages', 'Tattoos')): continue
    group_families, group_schools = [], []
    for n in h.next_siblings:
        if getattr(n, 'name', '') == 'h1': break
        if getattr(n, 'name', '') in ('h2', 'h3'):
            fs = family_matches(n.get_text(' ', strip=True), 'sclost', n.get('id', ''))
            group_families += fs
            if not fs:
                info = school_info(n, 'sclost')
                if 'advanced school' in info['name'].lower():
                    info['kind'] = 'advanced'
                    info['description'] = '\n'.join(t['description'] for t in info['techniques'])
                    info['requiredSkills'] = info['skills']
                    training.append(info)
                elif info['skills']: group_schools.append(info)
    if group_schools:
        clans.append({'name': match[1].removesuffix(' Clan'), 'group': 'Other', 'families': group_families, 'schools': group_schools})

for slug in ['sccrab','sccrane','scdragon','sclion','scmantis','scphoenix','scscorpion','scspider','scunicorn','scminor','scimperial','scmonk','scronin','scmisc']:
    section = ''
    for h in soup_for(slug).select('h1,h2,h3'):
        if h.name == 'h1': section = h.get_text(' ', strip=True).lower(); continue
        if not any(x in section for x in ['alternate','advanced','paths']): continue
        info = school_info(h, slug)
        info['kind'] = 'advanced' if 'advanced' in section else 'path'
        # Keep prerequisites and technique text even where an entry has no rank heading.
        body = []
        for n in h.next_siblings:
            if getattr(n,'name','') in ('h1','h2','h3'): break
            if getattr(n,'get_text',None): body.append(n.get_text(' ', strip=True))
        info['description'] = '\n'.join(body)
        if info['kind'] == 'advanced':
            prereqs = []
            for n in h.next_siblings:
                if getattr(n, 'name', '') in ('h1','h2','h3'): break
                if getattr(n, 'name', '') == 'ul':
                    for li in n.find_all('li', recursive=False):
                        text = li.get_text(' ', strip=True)
                        if ':' in text:
                            key, value = text.split(':', 1)
                            if key.lower() in ('ring/traits','rings/traits','rings','traits','skills','other','special','honor','requirements'):
                                prereqs.append(value.strip() if key.lower() != 'honor' else 'Honor '+value.strip())
            if prereqs: info['requirements'] = ', '.join(prereqs)
        info['requiredSkills'] = info['skills'] if info['kind']=='advanced' else []
        if info['description']:
            training.append(info)

advantages, disadvantages = options_for('advantages'), options_for('disadvantages')
for entries, slug in [(advantages,'advantages'),(disadvantages,'disadvantages')]:
    for entry in entries:
        for p in soup_for(slug).select('p'):
            strong = p.find('strong')
            if strong and clean_name(re.split(r'\s*\(', strong.get_text(' ', strip=True))[0]) == entry['name']:
                entry.update(description=p.get_text(' ', strip=True), slug=slug)
                break

# Verified old core data supplies weapon/armor statistics and skill mastery descriptions.
# Optional input makes refresh reproducible without fetching an external repository.
parser = argparse.ArgumentParser()
parser.add_argument('--core-resources', type=Path)
args = parser.parse_args()
if args.core_resources:
    weapons = json.loads((args.core_resources/'Weapons.json').read_text())
    armors = json.loads((args.core_resources/'Armors.json').read_text())
    legacy_skills = json.loads((args.core_resources/'Skills.json').read_text())
else:
    existing = json.loads((ROOT/'public/character-data.json').read_text())
    weapons, armors, legacy_skills = existing.get('weapons',[]), existing.get('armors',[]), existing['skills']
for skill in skills:
    old = next((s for s in legacy_skills if s['name'].lower() == skill['name'].lower()), {})
    skill['description'] = old.get('description', '')
    skill['emphases'] = [s.strip() for s in old.get('emphasis','').split(',') if s.strip()] if 'emphasis' in old else old.get('emphases',[])
    mastery = old.get('mastery', '')
    skill['masteries'] = [{'rank': int(m[1]), 'description': m[2].strip()} for m in re.finditer(r'Rank\s+(\d+):\s*(.*?)(?=\s+Rank\s+\d+:|$)', mastery, re.S)] if mastery else old.get('masteries',[])
    skill['slug'] = f"{skill['group'].lower()}-skills"
# Known malformed printed headers in the archive.
for clan in clans:
    for school in clan['schools']:
        if school['name'] == 'Asahina Shugenja': school['affinity'] = 'Air / Fire'
        if 'Ogre' in school['name']: school['nonhuman'] = True
for kind, entries in [('weapon',weapons),('armor',armors)]:
    for entry in entries:
        entry.update(id=f"{kind}:{entry['name']}", kind=kind, slug='equipment')
        if kind == 'armor': entry['tn'] = entry['tn'][0] if isinstance(entry['tn'],list) else entry['tn']

abilities = []
for slug in ['universal-spells','air-spells','earth-spells','fire-spells','water-spells','void-spells','multi-elemental-spells','maho','dragon-spells']:
    abilities += powers_for(slug, 'spell')
abilities += powers_for('katas','kata') + powers_for('kiho','kiho') + inline_for('tattoos','tattoo')
for slug in ['minor-shadowlands-powers','major-shadowlands-powers','mutations','akutenshi-powers']:
    abilities += inline_for(slug,'shadowlands')
result = {'version': 2, 'clans': clans, 'skills': skills, 'advantages': advantages,
          'disadvantages': disadvantages, 'ancestors': inline_for('ancestors','ancestor'),
          'abilities': abilities, 'training': training, 'weapons': weapons, 'armors': armors}
(ROOT/'public/character-data.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
print(f"{len(clans)} clans, {sum(len(c['schools']) for c in clans)} starting schools, {len(training)} paths/advanced schools, {len(abilities)} abilities")
