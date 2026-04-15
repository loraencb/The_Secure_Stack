# Secure Stack Lab Authoring

Secure Stack lab metadata is validated when the backend loads each `labs/*/metadata.json` file. Invalid labs now fail fast with author-facing errors instead of breaking later in the Guide, tutor, or launcher.

## Files

- Formal schema: [lab.schema.json](./lab.schema.json)
- Example metadata: [examples/metadata.example.json](./examples/metadata.example.json)
- Production example: [juice-shop-recon/metadata.json](./juice-shop-recon/metadata.json)

## Required top-level fields

- `lab_id` or legacy alias `id`
- `name` or legacy alias `title`
- `description`
- `runtime`
- `tasks` or legacy alias `steps`

## Recommended top-level fields

- `schema_version`
- `learning_objectives`
- `prerequisites`
- `required_tools`
- `success_criteria`
- `manuals`
- `topology`

## Runtime requirements

`runtime` must define:

- `attacker.image`
- `target.image`

Optional runtime fields:

- `attacker.container_name`
- `target.container_name`
- `target.alias`
- `target.app_port`
- `target.ports`
- `network_name`

Normalization rules:

- If `target.app_port` exists and `target.ports` is missing, Secure Stack will derive `{"<app_port>/tcp": null}` automatically.
- If `container_name` values are missing, Secure Stack falls back to:
  - `attacker-{session_id}`
  - `target-{session_id}`
- If `network_name` is missing, Secure Stack falls back to `lab-net-{session_id}`.

## Task and step rules

Each lab must have at least one `task` (or legacy `step`).

Supported `step_type` values:

- `command`
- `browser`

Task fields used by the Guide and AI tutor:

- `task_id`
- `title`
- `objective`
- `instruction`
- `explanation`
- `expected_outcome`
- `command_hint`
- `hints`
- `expected_evidence`
- `success_criteria`
- `remediation_text`
- `allowed_completion_methods`
- `manual_confirmation_label`

Normalization rules:

- `instruction` falls back to `objective`, then `title`.
- `explanation` falls back to `objective`, then `instruction`.
- `hints` can be a string or array. Legacy `hint_text` still works.
- `expected_outcome` falls back to the first `success_criteria` item, then a sentence built from `expected_evidence`.
- If `allowed_completion_methods` is missing:
  - command steps default to `["command_match"]`
  - browser steps default to `["manual_confirmation"]`

Validation rules:

- Command steps must provide at least one useful guidance/evidence field:
  - `command_hint`
  - `expected_evidence`
  - `success_criteria`
  - `hints`
- Browser steps must provide at least one browser-oriented guidance field:
  - `command_hint`
  - `manual_confirmation_label`
  - `hints`
- Duplicate `task_id` values are rejected.

## Topology rules

Topology is optional. If omitted, Secure Stack builds a safe default attacker-to-target topology from runtime data.

When `topology` is provided:

- `nodes` should describe the actors or services in the lab
- `connections` should reference valid node ids
- missing `label` values fall back to the node id
- malformed connections fail validation instead of silently rendering broken topology

Use topology when it adds learning value, not just decoration.

## Manuals

`manuals` is optional, but recommended for school-lab-style content.

Supported fields:

- `manuals.student`
- `manuals.instructor`

If a manual path is provided, it must exist relative to the lab folder.

## Backward compatibility

Older metadata is still normalized when practical:

- `id` -> `lab_id`
- `title` -> `name`
- `steps` -> `tasks`
- `objectives` -> `learning_objectives`
- `hint_text` -> first `hints` entry

Older labs without `topology` still work because Secure Stack generates a default topology from runtime metadata.

## Failure behavior

Invalid labs are rejected during backend startup. The loader reports the metadata file path plus every validation issue it found, for example:

```text
Invalid lab metadata in labs/my-lab/metadata.json:
- runtime.target.image must be a non-empty string.
- tasks[1] command steps must define at least one of command_hint, expected_evidence, success_criteria, or hints.
- topology.connections[0] references unknown nodes ('attacker' -> 'missing-target').
```

This is intentional. It is safer to stop the backend early than to let the Guide, tutor, or launcher fail later with less useful errors.
