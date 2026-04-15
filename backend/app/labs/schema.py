import json
import re
from pathlib import Path


LAB_SCHEMA_VERSION = "2026-04"
VALID_STEP_TYPES = {"command", "browser"}
VALID_COMPLETION_METHODS = {
    "command_match",
    "evidence_match",
    "manual_confirmation",
}
PORT_PATTERN = re.compile(r"^(?P<port>\d+)/(tcp|udp)$")


class LabValidationError(ValueError):
    def __init__(self, metadata_path: Path, errors: list[str]):
        self.metadata_path = str(metadata_path)
        self.errors = errors
        super().__init__(self._build_message())

    def _build_message(self) -> str:
        lines = [f"Invalid lab metadata in {self.metadata_path}:"]
        lines.extend(f"- {error}" for error in self.errors)
        return "\n".join(lines)


def normalize_text_list(
    values,
    field_path: str | None = None,
    errors: list[str] | None = None,
) -> list[str]:
    if isinstance(values, str):
        values = [values]

    if not isinstance(values, list):
        if values not in (None, "") and field_path and errors is not None:
            errors.append(f"{field_path} must be a string or an array of strings.")
        return []

    normalized_values = []
    for index, value in enumerate(values):
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                normalized_values.append(cleaned)
            elif field_path and errors is not None:
                errors.append(f"{field_path}[{index}] must not be empty.")
        elif field_path and errors is not None:
            errors.append(f"{field_path}[{index}] must be a string.")

    return normalized_values


def load_lab_metadata(metadata_path: Path) -> dict:
    try:
        raw_data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LabValidationError(
            metadata_path,
            [f"metadata must be valid JSON ({exc.msg} at line {exc.lineno}, column {exc.colno})."],
        ) from exc

    if not isinstance(raw_data, dict):
        raise LabValidationError(
            metadata_path,
            ["root metadata must be a JSON object."],
        )

    return validate_and_normalize_lab_metadata(raw_data, metadata_path)


def validate_and_normalize_lab_metadata(data: dict, metadata_path: Path) -> dict:
    errors: list[str] = []
    module_dir = metadata_path.parent

    lab_id = _normalize_required_string(
        data.get("lab_id") or data.get("id"),
        "lab_id",
        errors,
        aliases=["id"],
    )
    lab_name = _normalize_required_string(
        data.get("name") or data.get("title"),
        "name",
        errors,
        aliases=["title"],
    )
    description = _normalize_required_string(
        data.get("description"),
        "description",
        errors,
    )
    schema_version = _normalize_optional_string(data.get("schema_version")) or LAB_SCHEMA_VERSION

    runtime = _normalize_runtime(data.get("runtime"), errors)
    topology = _normalize_topology(data.get("topology"), description, runtime, errors)
    manuals = _normalize_manuals(data.get("manuals"), module_dir, errors)
    tasks = _normalize_tasks(
        data.get("tasks"),
        data.get("steps"),
        errors,
    )
    estimated_duration_minutes = _normalize_duration(
        data.get("estimated_duration_minutes"),
        errors,
    )
    learning_objectives = normalize_text_list(
        data.get("learning_objectives") or data.get("objectives"),
        "learning_objectives",
        errors,
    )
    prerequisites = normalize_text_list(
        data.get("prerequisites"),
        "prerequisites",
        errors,
    )
    required_tools = normalize_text_list(
        data.get("required_tools"),
        "required_tools",
        errors,
    )
    success_criteria = normalize_text_list(
        data.get("success_criteria"),
        "success_criteria",
        errors,
    )

    if errors:
        raise LabValidationError(metadata_path, errors)

    return {
        "schema_version": schema_version,
        "lab_id": lab_id,
        "name": lab_name,
        "description": description,
        "difficulty": _normalize_optional_string(data.get("difficulty")) or "Unknown",
        "category": _normalize_optional_string(data.get("category")) or "General",
        "estimated_duration_minutes": estimated_duration_minutes,
        "learning_objectives": learning_objectives,
        "prerequisites": prerequisites,
        "required_tools": required_tools,
        "success_criteria": success_criteria,
        "topology": topology,
        "attacker": runtime["attacker"],
        "target": runtime["target"],
        "network_name": runtime["network_name"],
        "steps": tasks,
        "tasks": tasks,
        "student_manual_path": manuals["student_manual_path"],
        "instructor_guide_path": manuals["instructor_guide_path"],
    }


def _normalize_required_string(
    value,
    field_name: str,
    errors: list[str],
    aliases: list[str] | None = None,
) -> str:
    normalized = _normalize_optional_string(value)
    if normalized:
        return normalized

    alias_note = f" (or {', '.join(aliases)})" if aliases else ""
    errors.append(f"{field_name}{alias_note} must be a non-empty string.")
    return ""


def _normalize_optional_string(value) -> str:
    if not isinstance(value, str):
        return ""

    return value.strip()


def _normalize_duration(value, errors: list[str]) -> int | None:
    if value in (None, ""):
        return None

    try:
        duration = int(value)
    except (TypeError, ValueError):
        errors.append("estimated_duration_minutes must be an integer when provided.")
        return None

    if duration <= 0:
        errors.append("estimated_duration_minutes must be greater than zero when provided.")
        return None

    return duration


def _normalize_manuals(manuals, module_dir: Path, errors: list[str]) -> dict:
    if manuals is None:
        return {
            "student_manual_path": None,
            "instructor_guide_path": None,
        }

    if not isinstance(manuals, dict):
        errors.append("manuals must be an object when provided.")
        return {
            "student_manual_path": None,
            "instructor_guide_path": None,
        }

    normalized_paths = {}
    for key, target_field in (
        ("student", "student_manual_path"),
        ("instructor", "instructor_guide_path"),
    ):
        manual_path = _normalize_optional_string(manuals.get(key))
        if not manual_path:
            normalized_paths[target_field] = None
            continue

        resolved_path = (module_dir / manual_path).resolve()
        if not resolved_path.exists():
            errors.append(
                f"manuals.{key} references a missing file: {manual_path}"
            )
            normalized_paths[target_field] = None
            continue

        normalized_paths[target_field] = str(resolved_path)

    return normalized_paths


def _normalize_runtime(runtime, errors: list[str]) -> dict:
    if not isinstance(runtime, dict):
        errors.append("runtime must be an object with attacker and target configuration.")
        runtime = {}

    attacker = runtime.get("attacker")
    target = runtime.get("target")
    if not isinstance(attacker, dict):
        errors.append("runtime.attacker must be an object.")
        attacker = {}
    if not isinstance(target, dict):
        errors.append("runtime.target must be an object.")
        target = {}

    attacker_image = _normalize_required_string(
        attacker.get("image"),
        "runtime.attacker.image",
        errors,
    )
    target_image = _normalize_required_string(
        target.get("image"),
        "runtime.target.image",
        errors,
    )

    target_ports = _normalize_ports(target.get("ports"), errors)
    target_app_port = _normalize_target_app_port(
        target.get("app_port"),
        target_ports,
        errors,
    )
    if target_app_port and not target_ports:
        target_ports = {f"{target_app_port}/tcp": None}

    return {
        "attacker": {
            "image": attacker_image,
            "container_name": _normalize_optional_string(
                attacker.get("container_name")
            )
            or "attacker-{session_id}",
        },
        "target": {
            "image": target_image,
            "container_name": _normalize_optional_string(
                target.get("container_name")
            )
            or "target-{session_id}",
            "ports": target_ports,
            "app_port": target_app_port or 3000,
            "alias": _normalize_optional_string(target.get("alias")) or "target",
        },
        "network_name": _normalize_optional_string(runtime.get("network_name"))
        or "lab-net-{session_id}",
    }


def _normalize_ports(ports, errors: list[str]) -> dict:
    if ports in (None, ""):
        return {}

    if not isinstance(ports, dict):
        errors.append("runtime.target.ports must be an object when provided.")
        return {}

    normalized_ports = {}
    for raw_port, raw_mapping in ports.items():
        if not isinstance(raw_port, str) or not PORT_PATTERN.match(raw_port.strip()):
            errors.append(
                "runtime.target.ports keys must look like '3000/tcp' or '53/udp'."
            )
            continue

        port_key = raw_port.strip()
        if raw_mapping in (None, ""):
            normalized_ports[port_key] = None
            continue

        if isinstance(raw_mapping, int) and raw_mapping > 0:
            normalized_ports[port_key] = raw_mapping
            continue

        if isinstance(raw_mapping, str) and raw_mapping.strip():
            normalized_ports[port_key] = raw_mapping.strip()
            continue

        errors.append(
            f"runtime.target.ports.{port_key} must be null, a positive integer, or a non-empty string."
        )

    return normalized_ports


def _normalize_target_app_port(app_port, ports: dict, errors: list[str]) -> int | None:
    if app_port not in (None, ""):
        try:
            normalized_port = int(app_port)
        except (TypeError, ValueError):
            errors.append("runtime.target.app_port must be an integer when provided.")
            return None

        if normalized_port <= 0:
            errors.append("runtime.target.app_port must be greater than zero when provided.")
            return None

        return normalized_port

    for port_key in ports:
        match = PORT_PATTERN.match(port_key)
        if match:
            return int(match.group("port"))

    return None


def _build_default_topology(description: str, runtime: dict) -> dict:
    target = runtime.get("target", {})
    target_alias = target.get("alias") or "target"
    target_port = target.get("app_port")
    target_details = (
        f"Exposed lab service on TCP {target_port}."
        if target_port
        else "Exposed lab service for guided validation."
    )

    return {
        "summary": (
            description
            or "The attacker container investigates the target service across an isolated lab network."
        ),
        "nodes": [
            {
                "id": "attacker",
                "label": "Attacker container",
                "role": "attacker",
                "kind": "container",
                "details": "Run guided commands from this shell.",
            },
            {
                "id": "target",
                "label": target_alias,
                "role": "target",
                "kind": "service",
                "details": target_details,
            },
        ],
        "connections": [
            {
                "from": "attacker",
                "to": "target",
                "label": "Isolated lab network",
            }
        ],
    }


def _normalize_topology(topology, description: str, runtime: dict, errors: list[str]) -> dict:
    default_topology = _build_default_topology(description, runtime)
    if topology in (None, "", []):
        return default_topology

    if not isinstance(topology, dict):
        errors.append("topology must be an object when provided.")
        return default_topology

    raw_nodes = topology.get("nodes")
    if raw_nodes is None:
        return default_topology

    if not isinstance(raw_nodes, list):
        errors.append("topology.nodes must be an array when provided.")
        return default_topology

    nodes = []
    node_ids = set()
    for index, node in enumerate(raw_nodes):
        node_path = f"topology.nodes[{index}]"
        if not isinstance(node, dict):
            errors.append(f"{node_path} must be an object.")
            continue

        node_id = _normalize_optional_string(node.get("id")) or f"node-{index + 1}"
        label = (
            _normalize_optional_string(node.get("label"))
            or node_id.replace("-", " ").title()
        )
        if node_id in node_ids:
            errors.append(f"{node_path}.id '{node_id}' is duplicated.")
            continue

        node_ids.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "label": label,
                "role": _normalize_optional_string(
                    node.get("role") or node.get("kind")
                )
                or "service",
                "kind": _normalize_optional_string(node.get("kind")) or "service",
                "details": _normalize_optional_string(
                    node.get("details") or node.get("notes")
                ),
            }
        )

    if not nodes:
        errors.append(
            "topology.nodes must contain at least one valid node when topology is provided."
        )
        return default_topology

    raw_connections = topology.get("connections") or topology.get("links") or []
    if not isinstance(raw_connections, list):
        errors.append("topology.connections must be an array when provided.")
        raw_connections = []

    connections = []
    for index, connection in enumerate(raw_connections):
        connection_path = f"topology.connections[{index}]"
        if not isinstance(connection, dict):
            errors.append(f"{connection_path} must be an object.")
            continue

        source = _normalize_optional_string(connection.get("from") or connection.get("source"))
        target = _normalize_optional_string(connection.get("to") or connection.get("target"))
        if not source or not target:
            errors.append(
                f"{connection_path} must define non-empty 'from' and 'to' node references."
            )
            continue

        if source not in node_ids or target not in node_ids:
            errors.append(
                f"{connection_path} references unknown nodes ('{source}' -> '{target}')."
            )
            continue

        connections.append(
            {
                "from": source,
                "to": target,
                "label": _normalize_optional_string(connection.get("label")),
            }
        )

    return {
        "summary": _normalize_optional_string(topology.get("summary"))
        or default_topology["summary"],
        "nodes": nodes,
        "connections": connections,
    }


def _normalize_tasks(raw_tasks, raw_steps, errors: list[str]) -> list[dict]:
    task_source = raw_tasks if isinstance(raw_tasks, list) else raw_steps
    if not isinstance(task_source, list) or not task_source:
        errors.append("tasks (or legacy steps) must be a non-empty array.")
        return []

    normalized_tasks = []
    seen_task_ids = set()

    for index, task in enumerate(task_source):
        task_path = f"tasks[{index}]"
        if not isinstance(task, dict):
            errors.append(f"{task_path} must be an object.")
            continue

        task_id = _normalize_optional_string(task.get("task_id")) or f"task-{index + 1}"
        if task_id in seen_task_ids:
            errors.append(f"{task_path}.task_id '{task_id}' is duplicated.")
            continue

        seen_task_ids.add(task_id)

        title = (
            _normalize_optional_string(task.get("title"))
            or _normalize_optional_string(task.get("instruction"))
            or _normalize_optional_string(task.get("objective"))
            or f"Task {index + 1}"
        )
        objective = _normalize_optional_string(task.get("objective") or task.get("goal"))
        instruction = (
            _normalize_optional_string(task.get("instruction"))
            or objective
            or title
        )
        explanation = (
            _normalize_optional_string(task.get("explanation"))
            or objective
            or instruction
        )
        step_type = (_normalize_optional_string(task.get("step_type")) or "command").lower()
        if step_type not in VALID_STEP_TYPES:
            errors.append(
                f"{task_path}.step_type must be one of: {', '.join(sorted(VALID_STEP_TYPES))}."
            )
            step_type = "command"

        normalized_hints = normalize_text_list(
            task.get("hints"),
            f"{task_path}.hints",
            errors,
        )
        legacy_hint = _normalize_optional_string(task.get("hint_text"))
        if legacy_hint and not normalized_hints:
            normalized_hints = [legacy_hint]

        normalized_success_criteria = normalize_text_list(
            task.get("success_criteria"),
            f"{task_path}.success_criteria",
            errors,
        )
        normalized_expected_evidence = normalize_text_list(
            task.get("expected_evidence"),
            f"{task_path}.expected_evidence",
            errors,
        )
        command_hint = _normalize_optional_string(task.get("command_hint"))
        remediation_text = _normalize_optional_string(task.get("remediation_text"))
        manual_confirmation_label = _normalize_optional_string(
            task.get("manual_confirmation_label")
        )

        completion_methods = _normalize_completion_methods(
            task.get("allowed_completion_methods"),
            step_type,
            task_path,
            errors,
        )

        if step_type == "command" and not (
            command_hint
            or normalized_expected_evidence
            or normalized_success_criteria
            or normalized_hints
        ):
            errors.append(
                f"{task_path} command steps must define at least one of command_hint, expected_evidence, success_criteria, or hints."
            )

        if step_type == "browser" and not (
            command_hint or manual_confirmation_label or normalized_hints
        ):
            errors.append(
                f"{task_path} browser steps must define a browser URL hint, manual confirmation label, or hint text."
            )

        normalized_tasks.append(
            {
                **task,
                "task_id": task_id,
                "title": title,
                "step_number": index + 1,
                "step_type": step_type,
                "objective": objective,
                "instruction": instruction,
                "explanation": explanation,
                "expected_outcome": _derive_expected_outcome(
                    task,
                    normalized_success_criteria,
                    normalized_expected_evidence,
                ),
                "expected_evidence": normalized_expected_evidence,
                "hints": normalized_hints,
                "hint_text": legacy_hint or (normalized_hints[0] if normalized_hints else ""),
                "command_hint": command_hint,
                "success_criteria": normalized_success_criteria,
                "allowed_completion_methods": completion_methods,
                "completion_state": _normalize_optional_string(
                    task.get("completion_state")
                )
                or "pending",
                "remediation_text": remediation_text,
                "manual_confirmation_label": manual_confirmation_label,
            }
        )

    return normalized_tasks


def _normalize_completion_methods(
    methods,
    step_type: str,
    task_path: str,
    errors: list[str],
) -> list[str]:
    normalized_methods = normalize_text_list(methods)
    if not normalized_methods:
        return (
            ["manual_confirmation"]
            if step_type == "browser"
            else ["command_match"]
        )

    validated_methods = []
    for method in normalized_methods:
        if method not in VALID_COMPLETION_METHODS:
            errors.append(
                f"{task_path}.allowed_completion_methods contains unsupported value '{method}'."
            )
            continue

        validated_methods.append(method)

    if validated_methods:
        return validated_methods

    return (
        ["manual_confirmation"]
        if step_type == "browser"
        else ["command_match"]
    )


def _derive_expected_outcome(
    task: dict,
    normalized_success_criteria: list[str],
    normalized_expected_evidence: list[str],
) -> str:
    explicit_outcome = _normalize_optional_string(task.get("expected_outcome"))
    if explicit_outcome:
        return explicit_outcome

    if normalized_success_criteria:
        return normalized_success_criteria[0]

    if normalized_expected_evidence:
        if len(normalized_expected_evidence) == 1:
            return f"Capture evidence showing {normalized_expected_evidence[0]}."

        evidence_summary = ", ".join(normalized_expected_evidence)
        return f"Capture evidence showing {evidence_summary}."

    return ""
