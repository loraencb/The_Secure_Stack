import re
from typing import Any

MANAGED_LABEL_KEY = "securestack.managed"
SESSION_LABEL_KEY = "securestack.session_id"
LAB_ID_LABEL_KEY = "securestack.lab_id"
RESOURCE_KIND_LABEL_KEY = "securestack.resource_kind"

CONTAINER_NAME_PATTERN = re.compile(r"^(attacker|target)-(?P<session_id>\d+)$")
NETWORK_NAME_PATTERN = re.compile(r"^lab-net-(?P<session_id>\d+)$")


def build_managed_labels(session_id: int, lab_id: str | None, resource_kind: str) -> dict[str, str]:
    return {
        MANAGED_LABEL_KEY: "true",
        SESSION_LABEL_KEY: str(session_id),
        LAB_ID_LABEL_KEY: (lab_id or "unknown").strip() or "unknown",
        RESOURCE_KIND_LABEL_KEY: resource_kind,
    }


def parse_session_id_from_resource(name: str, labels: dict[str, Any] | None) -> int | None:
    raw_label = str((labels or {}).get(SESSION_LABEL_KEY) or "").strip()
    if raw_label.isdigit():
        return int(raw_label)

    container_match = CONTAINER_NAME_PATTERN.match(name)
    if container_match:
        return int(container_match.group("session_id"))

    network_match = NETWORK_NAME_PATTERN.match(name)
    if network_match:
        return int(network_match.group("session_id"))

    return None


def resource_is_managed(name: str, labels: dict[str, Any] | None) -> bool:
    if str((labels or {}).get(MANAGED_LABEL_KEY) or "").lower() == "true":
        return True

    return bool(
        CONTAINER_NAME_PATTERN.match(name) or NETWORK_NAME_PATTERN.match(name)
    )
