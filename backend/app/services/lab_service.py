from app.labs.labs_config import LABS


def get_all_labs() -> list[dict]:
    return [
        {
            "lab_id": lab_id,
            "name": lab["name"],
            "description": lab.get("description", ""),
        }
        for lab_id, lab in LABS.items()
    ]


def get_lab(lab_id: str) -> dict:
    lab = LABS.get(lab_id)

    if not lab:
        raise ValueError("Lab not found")

    return {
        "lab_id": lab_id,
        "name": lab["name"],
        "description": lab.get("description", ""),
        "steps": lab.get("steps", []),
        "target_info": lab.get("target", {}),
    }