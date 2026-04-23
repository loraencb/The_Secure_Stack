# Secure Stack Lab Authoring

Secure Stack lab metadata is validated when the backend loads each `labs/*/metadata.json` file. Invalid labs now fail fast with author-facing errors instead of breaking later in the Guide, tutor, or launcher.

## Files

- Formal schema: [lab.schema.json](./lab.schema.json)
- Example metadata: [examples/metadata.example.json](./examples/metadata.example.json)
- Ideal course-lab template: [examples/ideal_lab_template.json](./examples/ideal_lab_template.json)
- Production example: [juice-shop-recon/metadata.json](./juice-shop-recon/metadata.json)
- Production example: [http-service-mapping/metadata.json](./http-service-mapping/metadata.json)

## Required top-level fields

- `lab_id` or legacy alias `id`
- `name` or legacy alias `title`
- `description`
- `runtime`
- `tasks` or legacy alias `steps`

## Recommended top-level fields

- `schema_version`
- `learning_objectives`
- `pre_lab_context`
- `environment_overview`
- `reflection_prompt`
- `lab_takeaways`
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
- `learning_takeaway`
- `what_to_observe`
- `why_observation_matters`
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
- `learning_takeaway` is optional, but recommended for a short teaching moment after the step is completed.
- `what_to_observe` is optional, but recommended for steps where the learner should notice a specific banner, header, port, response, or browser-visible change.
- If `what_to_observe` is omitted, Secure Stack falls back to `expected_evidence` where practical.
- `why_observation_matters` is optional, but recommended whenever the step teaches the learner how to interpret a signal rather than just collect it.
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

Command matching notes:

- Secure Stack evaluates command steps against `command_hint`.
- Matching is flexible enough to allow small variations like `ping -c 1 target` for a hint of `ping -c 3 target`.
- Matching also keeps meaningful flags and targets, so separate steps like `curl -I http://target` and `curl http://target` can coexist in one lab without collapsing into the same command intent.

## Topology rules

Topology is optional. If omitted, Secure Stack builds a safe default attacker-to-target topology from runtime data.

When `topology` is provided:

- `nodes` should describe the actors or services in the lab
- `connections` should reference valid node ids
- missing `label` values fall back to the node id
- malformed connections fail validation instead of silently rendering broken topology

Use topology when it adds learning value, not just decoration.

## Teaching reinforcement fields

Secure Stack can now reinforce learning after a step and at the end of a lab without turning the workspace into a quiz engine.

Recommended authoring fields:

- `pre_lab_context`
  - A short framing paragraph that tells the learner why the lab matters before they begin.
  - Use this to position the exercise like a real class assignment rather than a checklist.
- `environment_overview`
  - A short description of the attacker, target, and environment assumptions.
  - Keep it practical and oriented around what the learner should understand before typing commands.
- `reflection_prompt`
  - A short end-of-lab question or prompt that pushes the learner to connect observations back to the lab objective.

- `tasks[].learning_takeaway`
  - A short sentence describing what the completed step proved or why it mattered.
  - Keep it concise and tied to the evidence the learner just captured.
- `tasks[].what_to_observe`
  - A short list of signals the learner should notice in the output or browser.
  - Good examples: `80/tcp open`, `Server: nginx`, `Welcome to nginx!`, or a specific browser-visible behavior.
- `tasks[].why_observation_matters`
  - A short sentence explaining how the observation changes the learner's understanding.
  - Use this when you want the tutor and Guide to reinforce interpretation, not just execution.
- `lab_takeaways`
  - A short array of high-level end-of-lab lessons for the final debrief.
  - These should summarize what the learner now understands after completing the lab.

Good `pre_lab_context` examples:

- `This lab teaches you to separate reachability, service discovery, and application confirmation so you can explain what each stage actually proved.`
- `The point is not just to run tools. It is to notice how each observation reduces uncertainty about the target.`

Good `environment_overview` examples:

- `The attacker container includes ping, nmap, and curl. The target exposes one web service through an isolated Docker network and a forwarded host port for browser validation.`

Good `learning_takeaway` examples:

- `This confirmed the target was reachable before the learner moved on to service discovery.`
- `Header inspection identified the service behavior without needing a full browser interaction yet.`

Good `what_to_observe` examples:

- `Successful ICMP replies and zero packet loss`
- `80/tcp open and an nginx banner`
- `A 200 response plus the Server header`
- `The landing page text matching the terminal response`

Good `why_observation_matters` examples:

- `It proves the attacker can trust later failures as application or service issues instead of a broken path.`
- `It distinguishes a generic open port from a known service family that deserves deeper inspection.`
- `It shows that browser-visible behavior and terminal evidence describe the same target service.`

Good `lab_takeaways` examples:

- `Enumeration translates a reachable host into a defined attack surface.`
- `Application-layer evidence is stronger than a port scan alone because it proves what service is really answering.`

Good `reflection_prompt` examples:

- `Which observation most strongly confirmed the service identity before you opened the browser, and why?`
- `What changed in your understanding of the target between the first connectivity check and the final browser confirmation?`

## Ideal template

If you want a stronger course-style starting point, copy [ideal_lab_template.json](./examples/ideal_lab_template.json) instead of the lighter example metadata. It is structured around:

- pre-lab framing
- environment overview
- observation-driven step authoring
- learning takeaways after each step
- an explicit end-of-lab reflection prompt

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
