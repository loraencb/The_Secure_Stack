from pathlib import Path

from app.labs.schema import LabValidationError, load_lab_metadata

ROOT_DIR = Path(__file__).resolve().parents[3]
LABS_DIR = ROOT_DIR / "labs"


def load_labs():
    labs = {}
    load_errors = []

    for metadata_path in sorted(LABS_DIR.glob("*/metadata.json")):
        try:
            lab = load_lab_metadata(metadata_path)
        except LabValidationError as exc:
            load_errors.append(str(exc))
            continue

        if lab["lab_id"] in labs:
            load_errors.append(
                f"Invalid lab metadata in {metadata_path}:\n- lab_id '{lab['lab_id']}' is duplicated."
            )
            continue

        labs[lab["lab_id"]] = lab

    if load_errors:
        error_message = "Lab definition validation failed:\n\n" + "\n\n".join(
            load_errors
        )
        raise RuntimeError(error_message)

    return labs


LABS = load_labs()
