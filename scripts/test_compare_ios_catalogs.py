"""Checks for the audit's matching, comparison and source-accounting behavior."""

import json
from pathlib import Path
import tempfile
import unittest

import compare_ios_catalogs as audit


def empty_catalog():
    return {key: [] for key in ["clans", "skills", "advantages", "disadvantages", "ancestors",
                               "abilities", "training", "weapons", "armors"]}


def school(name, clan, advanced=False, location=None):
    entry = {"name": name, "slug": "schools", "anchor": clan, "_clans": [clan], "advanced": advanced}
    if location:
        entry["kind"] = location
    return entry


class CatalogAuditTests(unittest.TestCase):
    def test_name_formatting_preserves_distinct_owl_school(self):
        self.assertEqual(audit.name_key("Schools", "Badger Clan - Ichiro Bushi [CR]"),
                         audit.name_key("Schools", "Ichiro Bushi"))
        self.assertNotEqual(audit.name_key("Schools", "Seppun Shugenja"),
                            audit.name_key("Schools", "Seppun Shugenja (Owl)"))

    def test_family_membership_selects_the_matching_clan(self):
        targets = [{"name": "Chuda", "_clans": [clan]} for clan in ["Spider", "Snake"]]
        matches, _ = audit.match_entry("Families", {"name": "Chuda", "clan": "Snake"}, targets)
        self.assertEqual(matches[0]["_clans"], ["Snake"])

    def test_original_chuda_is_not_matched_to_the_spider_school(self):
        matches, _ = audit.match_entry("Schools", {"name": "Original Chuda Shugenja", "clan": "Snake", "advanced": False},
                                       [school("Chuda Shugenja", "Spider")])
        self.assertEqual(matches, [])

    def test_mislabeled_agasha_ancestor_is_matched_by_verified_identity(self):
        targets = [{"name": name, "id": name} for name in ["Agasha", "Agasha Kitsuki"]]
        matches, method = audit.match_entry("Ancestors", {"name": "Agasha", "description": "The founder of the Kitsuki family originated the Kitsuki Method."}, targets)
        self.assertEqual(matches[0]["name"], "Agasha Kitsuki")
        self.assertEqual(method, "explicit_alias")
        matches, _ = audit.match_entry("Ancestors", {"name": "Agasha", "description": "The founder of the Agasha family."}, targets)
        self.assertEqual(matches[0]["name"], "Agasha")

    def test_advanced_flag_resolves_path_and_advanced_school_collision(self):
        targets = [school("Disciples of Sun Tao", "Ronin", location=kind) for kind in ["path", "advanced"]]
        targets[0]["anchor"] = "path"
        matches, _ = audit.match_entry("Schools", {"name": "Disciples of Sun Tao", "clan": "Ronin", "advanced": True}, targets)
        self.assertEqual([s["kind"] for s in matches], ["advanced"])

    def test_spell_ring_resolves_same_name_without_hiding_a_single_ring_difference(self):
        targets = [{"id": ring, "name": "Whispering Flames", "ring": ring} for ring in ["Air", "Fire"]]
        matches, _ = audit.match_entry("Spells", {"name": "Whispering Flames", "ring": "Fire"}, targets)
        self.assertEqual([s["ring"] for s in matches], ["Fire"])
        matches, _ = audit.match_entry("Spells", {"name": "Whispering Flames", "ring": "Water"}, targets[:1])
        self.assertEqual(len(matches), 1)

    def test_fuzzy_similarity_is_never_a_match(self):
        matches, _ = audit.match_entry("Spells", {"name": "Missing Flame", "ring": "Fire"},
                                       [{"name": "Existing Flame", "ring": "Fire", "id": "x"}])
        self.assertEqual(matches, [])

    def test_zero_honor_and_mounted_armor_values_are_preserved(self):
        self.assertEqual(audit.numbers(0.0), audit.numbers("0"))
        source = {"name": "Armor", "tn": [4, 12]}
        differences, _, _ = audit.compare_fields("Armors", source, {"name": "Armor", "tn": 4})
        self.assertEqual(differences[0]["ios"], [4, 12])
        self.assertEqual(audit.compare_fields("Armors", {"name": "Armor", "tn": [4]}, {"name": "Armor", "tn": 4})[0], [])

    def test_prose_comparison_preserves_mechanically_significant_punctuation(self):
        for source, target in [("+1k0", "-1k0"), ("0.5 Honor", "05 Honor"), ("1/2 damage", "12 damage")]:
            self.assertIsNotNone(audit.comparison("description", source, target))
        self.assertIsNone(audit.comparison("description", "Caster’s +1k0 bonus", "caster's +1k0 bonus"))

    def test_combined_description_fields_are_unwrapped(self):
        source = {"name": "Example", "points": "2", "subtype": "Mental", "description": "Some prose."}
        target = {"name": "Example", "costs": [2], "label": "Example [Mental] (2 Points)",
                  "description": "Example [Mental] (2 Points) Some prose."}
        differences, missing, compared = audit.compare_fields("Advantages", source, target)
        self.assertEqual(differences, [])
        self.assertEqual(missing, ["subtype"])
        self.assertIn("description", compared)

    def test_new_source_metadata_is_explicitly_reported(self):
        source = {"name": "Example", "great": True, "description": "Background", "new_rule": "Unmapped"}
        _, missing, _ = audit.compare_fields("Clans", source, {"group": "Great Clans"})
        self.assertIn("new_rule", missing)

    def test_unrecognized_new_resource_file_fails_instead_of_being_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in audit.CATEGORIES + ["NewCatalog"]:
                (root / f"{name}.json").write_text("[]")
            with self.assertRaisesRegex(ValueError, "unmapped"):
                audit.audit(root, empty_catalog(), {"pages": {}}, "revision")

    def test_every_source_row_and_conflicting_duplicate_survives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in audit.CATEGORIES:
                (root / f"{name}.json").write_text("[]")
            (root / "Weapons.json").write_text(json.dumps([
                {"name": "Katana", "dr": "3k2"}, {"name": "KATANA", "dr": "4k2"}, {"name": "Missing"}]))
            catalog = empty_catalog()
            catalog["weapons"] = [{"name": "Katana", "id": "katana", "dr": "3k2"}, {"name": "Extra", "id": "extra"}]
            report = audit.audit(root, catalog, {"pages": {}}, "revision")
            weapons = next(c for c in report["categories"] if c["category"] == "Weapons")
            self.assertEqual([i["row"] for i in weapons["items"]], [1, 2, 3])
            self.assertEqual(weapons["status_counts"], {"matched": 2, "not_in_catalog": 1})
            self.assertEqual(weapons["source_duplicates"][0]["conflicting_fields"], ["dr"])
            self.assertEqual(weapons["source_duplicates"][0]["rows"], [1, 2])
            self.assertEqual([e["name"] for e in weapons["web_only"]], ["Extra"])


if __name__ == "__main__":
    unittest.main()
