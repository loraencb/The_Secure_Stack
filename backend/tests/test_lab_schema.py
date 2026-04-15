import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.labs.schema import (  # noqa: E402
    LabValidationError,
    load_lab_metadata,
    validate_and_normalize_lab_metadata,
)


def metadata_path(name: str) -> Path:
    return ROOT / "labs" / name / "metadata.json"


def build_base_lab(**overrides):
    payload = {
        "lab_id": "sample-lab",
        "name": "Sample Lab",
        "description": "A sample lab for schema validation tests.",
        "runtime": {
            "attacker": {
                "image": "securestack-attacker:latest",
            },
            "target": {
                "image": "bkimminich/juice-shop",
                "app_port": 3000,
                "alias": "target",
            },
        },
        "tasks": [
            {
                "task_id": "verify-connectivity",
                "title": "Verify connectivity",
                "step_type": "command",
                "objective": "Confirm the attacker can reach the target host.",
                "instruction": "Confirm the attacker can reach the target host.",
                "command_hint": "ping -c 3 target",
                "hint_text": "Use the target hostname.",
                "expected_evidence": ["0% packet loss"],
            }
        ],
    }
    payload.update(overrides)
    return payload


class LabSchemaTests(unittest.TestCase):
    def test_current_juice_shop_recon_lab_loads_cleanly(self):
        normalized = load_lab_metadata(metadata_path("juice-shop-recon"))

        self.assertEqual(normalized["lab_id"], "juice-shop-recon")
        self.assertGreater(len(normalized["tasks"]), 0)
        self.assertEqual(normalized["tasks"][0]["step_number"], 1)
        self.assertTrue(normalized["topology"]["nodes"])

    def test_legacy_aliases_normalize_into_current_model(self):
        payload = build_base_lab(
            lab_id=None,
            name=None,
            id="legacy-lab",
            title="Legacy Lab",
            tasks=None,
            steps=[
                {
                    "title": "Verify connectivity",
                    "objective": "Confirm reachability.",
                    "command_hint": "ping -c 3 target",
                    "hint_text": "Use the target hostname.",
                }
            ],
        )

        normalized = validate_and_normalize_lab_metadata(
            payload,
            metadata_path("juice-shop-recon"),
        )

        self.assertEqual(normalized["lab_id"], "legacy-lab")
        self.assertEqual(normalized["name"], "Legacy Lab")
        self.assertEqual(normalized["schema_version"], "2026-04")
        self.assertEqual(normalized["target"]["ports"], {"3000/tcp": None})
        self.assertEqual(normalized["tasks"][0]["step_number"], 1)
        self.assertEqual(normalized["tasks"][0]["instruction"], "Confirm reachability.")
        self.assertEqual(normalized["topology"]["nodes"][0]["id"], "attacker")

    def test_invalid_topology_connection_fails_with_clear_error(self):
        payload = build_base_lab(
            topology={
                "summary": "Broken topology",
                "nodes": [
                    {
                        "id": "attacker",
                        "label": "Attacker",
                    }
                ],
                "connections": [
                    {
                        "from": "attacker",
                        "to": "missing-target",
                    }
                ],
            }
        )

        with self.assertRaises(LabValidationError) as exc:
            validate_and_normalize_lab_metadata(
                payload,
                metadata_path("juice-shop-recon"),
            )

        self.assertIn("references unknown nodes", str(exc.exception))

    def test_invalid_command_step_without_guidance_or_evidence_fails(self):
        payload = build_base_lab(
            tasks=[
                {
                    "task_id": "weak-step",
                    "title": "Weak Step",
                    "step_type": "command",
                    "instruction": "Do something with the target.",
                }
            ]
        )

        with self.assertRaises(LabValidationError) as exc:
            validate_and_normalize_lab_metadata(
                payload,
                metadata_path("juice-shop-recon"),
            )

        self.assertIn("command steps must define", str(exc.exception))

    def test_missing_manuals_are_allowed_but_existing_paths_are_checked(self):
        payload = build_base_lab(
            manuals={
                "student": "missing_student_manual.md",
            }
        )

        with self.assertRaises(LabValidationError) as exc:
            validate_and_normalize_lab_metadata(
                payload,
                metadata_path("juice-shop-recon"),
            )

        self.assertIn("manuals.student references a missing file", str(exc.exception))


if __name__ == "__main__":
    unittest.main()
