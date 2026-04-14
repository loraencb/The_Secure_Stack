import json
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
LABS_DIR = ROOT_DIR / "labs"


def _load_lab_module(metadata_path: Path):
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    module_dir = metadata_path.parent
    runtime = data.get("runtime", {})

    return {
        "lab_id": data["lab_id"],
        "name": data["name"],
        "description": data["description"],
        "difficulty": data.get("difficulty", "Unknown"),
        "category": data.get("category", "General"),
        "estimated_duration_minutes": data.get("estimated_duration_minutes"),
        "learning_objectives": data.get("learning_objectives", []),
        "prerequisites": data.get("prerequisites", []),
        "required_tools": data.get("required_tools", []),
        "success_criteria": data.get("success_criteria", []),
        "attacker": runtime.get("attacker", {}),
        "target": runtime.get("target", {}),
        "network_name": runtime.get("network_name", "lab-net-{session_id}"),
        "steps": data.get("tasks", []),
        "tasks": data.get("tasks", []),
        "student_manual_path": str(module_dir / data["manuals"]["student"]),
        "instructor_guide_path": str(module_dir / data["manuals"]["instructor"]),
    }


def load_labs():
    labs = {}
    for metadata_path in LABS_DIR.glob("*/metadata.json"):
        lab = _load_lab_module(metadata_path)
        labs[lab["lab_id"]] = lab
    return labs


LABS = load_labs()
