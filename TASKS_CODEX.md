# Codex Task File — The Secure Stack

> Purpose: give Codex a clear, implementation-oriented roadmap for finishing the project without rewriting working parts.
>
> Use this file from the repository root as `TASKS_CODEX.md`.

---

## Project Context

The Secure Stack is an AI-assisted cybersecurity training platform with:

- FastAPI backend
- React frontend
- Docker-based attacker/target lab environments
- WebSocket terminal
- AI command analysis
- AI-assisted findings and report generation
- Guided lab progression

Current direction:
- prioritize a **stable, demo-ready** implementation
- do not restart architecture from scratch
- preserve working features
- prefer small, high-confidence changes

---

## Global Rules for Codex

1. Read this file fully before making changes.
2. Inspect the current codebase before editing.
3. Do **not** rewrite working systems unless necessary.
4. Prefer minimal edits over broad refactors.
5. If a task is partially implemented, finish or stabilize it instead of replacing it.
6. After each implementation slice:
   - explain what changed
   - list modified files
   - explain why the change was needed
7. Run relevant checks after code changes.
8. Use Git checkpoints before large edits.
9. Preserve current demo flow unless explicitly asked to change it.
10. Focus on reliability first, polish second, new features third.

---

## Definition of Demo-Ready

The project is demo-ready when the following flow works end-to-end without manual patching:

1. Start session
2. Launch Juice Shop recon lab
3. Attacker and target containers are created on an isolated network
4. Browser terminal connects to the session’s attacker container
5. User runs:
   - `ping -c 3 target`
   - `nmap -sV target`
   - `curl http://target:3000`
6. Guided lab steps progress correctly
7. AI provides useful feedback
8. A meaningful finding is suggested or auto-saved
9. Findings appear in the UI
10. Report generates successfully from the session findings

---

## Priority Order

Always work in this order unless the user explicitly overrides it:

1. Core demo reliability
2. Lab functionality
3. Guided progression
4. AI-assisted findings
5. Report correctness
6. UI polish
7. Stretch improvements

---

# Slice 1 — Core Demo Reliability

## Goal
Stabilize the current app so the main flow does not break during demo.

## Tasks
- Ensure WebSocket terminal does not reconnect or clear unexpectedly
- Ensure terminal only opens after lab launch
- Ensure terminal attaches to the correct session attacker container
- Ensure lab launch handles repeated runs safely
- Ensure launch errors are surfaced cleanly in the frontend
- Ensure terminal disconnects are handled gracefully in backend

## Acceptance Criteria
- No repeated WebSocket reconnect spam during normal usage
- Terminal remains stable during one lab session
- Launching the same lab twice does not crash the app
- Frontend does not show “success” when backend returns an error
- If lab is not launched, terminal does not attempt to attach

## Files Likely Involved
- `frontend/src/App.jsx`
- `frontend/src/components/LiveTerminal.jsx`
- `backend/app/routers/ws_terminal.py`
- `backend/app/services/terminal_manager.py`
- `backend/app/services/lab_launcher.py`

---

# Slice 2 — Functional Juice Shop Recon Lab

## Goal
Have one complete, usable pentesting lab with attacker + target + networking.

## Tasks
- Ensure `juice-shop-recon` lab definition is correct
- Ensure attacker image is `securestack-attacker:latest`
- Ensure target image is `bkimminich/juice-shop`
- Ensure per-session network is created
- Ensure target alias is resolvable as `target`
- Ensure target host port is dynamically assigned, not hardcoded
- Return usable `browser_url` from lab launcher
- Ensure attacker container has required tools preinstalled:
  - `bash`
  - `curl`
  - `nmap`
  - `iputils-ping`
  - `net-tools`
  - `procps`
  - `dnsutils`

## Acceptance Criteria
From inside the browser terminal for a launched lab session, all of these work:

```bash
ping -c 3 target
nmap -sV target
curl http://target:3000
```

And the UI shows a valid browser URL for Juice Shop.

## Files Likely Involved
- `labs/attacker/Dockerfile`
- `backend/app/labs/labs_config.py`
- `backend/app/services/lab_launcher.py`
- `backend/app/routers/labs.py`

---

# Slice 3 — Guided Lab Progression

## Goal
Turn the lab into a guided training experience, not just a static checklist.

## Tasks
- Track current step and completed steps
- Advance command-based steps when matching command is submitted
- Prevent accidental skipping of steps
- Distinguish between:
  - command steps
  - informational/browser steps
- Add manual completion for browser-only steps
- Keep UI labels clear:
  - Current
  - Completed
  - Pending
- Optionally add a progress bar if it does not destabilize the UI

## Acceptance Criteria
- Running the correct command advances the current step
- Steps do not complete out of order
- Browser-only step can be manually marked complete
- Guided progression survives normal rerenders

## Files Likely Involved
- `frontend/src/App.jsx`
- `frontend/src/components/LiveTerminal.jsx`

---

# Slice 4 — AI Feedback Quality

## Goal
Make AI feedback useful and believable for the demo.

## Tasks
- Ensure AI prompt includes:
  - command
  - command output
  - pentest phase classification
  - next step guidance
- Ensure false positives are minimized
- Ensure ordinary Linux container behavior is not treated as a vulnerability
- Improve detection of meaningful findings from recon output
- Prioritize meaningful findings from:
  - `nmap -sV target`
  - `curl http://target:3000`

## Acceptance Criteria
- `nmap -sV target` can produce a meaningful exposed-service finding
- ordinary output like basic `ps aux` or generic OS info does not create junk findings
- AI feedback includes:
  - assessment
  - phase
  - explanation
  - security relevance
  - next step

## Files Likely Involved
- `backend/app/services/ai_terminal_feedback.py`
- `backend/app/routers/ws_terminal.py`

---

# Slice 5 — Findings Flow

## Goal
Make findings feel integrated into the learning workflow.

## Tasks
- Keep manual finding entry working
- Keep AI suggestion flow working
- Keep auto-save only for high-confidence findings
- Prevent duplicate findings from being appended repeatedly
- Keep findings list synced after report generation

## Acceptance Criteria
- Suggested findings can be accepted cleanly
- Auto-saved findings appear in findings list
- Findings do not duplicate on rerender or repeated events
- Findings feed into report generation

## Files Likely Involved
- `frontend/src/App.jsx`
- `backend/app/routers/ws_terminal.py`
- `backend/app/models.py`
- `backend/app/routers/findings.py`

---

# Slice 6 — Report Correctness

## Goal
Ensure the generated report matches the current session state.

## Tasks
- Ensure report route uses the correct session
- Ensure generated report reflects current findings
- Ensure UI shows:
  - risk level
  - summary
  - key issues
  - recommendations
- Ensure empty states are clear when no report exists

## Acceptance Criteria
- Generate Report works after findings are added
- Report content reflects the actual session findings
- No stale or empty report data when the backend succeeds

## Files Likely Involved
- `backend/app/routers/reports.py`
- `frontend/src/App.jsx`

---

# Slice 7 — UI Polish (Only after core flow is stable)

## Goal
Improve presentation quality without destabilizing functionality.

## Tasks
- Improve empty state messaging
- Make lab status clearer
- Improve card labels and spacing
- Keep terminal visually stable
- Optionally add progress bar for lab steps
- Optionally add small “Auto-saved by AI” indicator on AI-created findings

## Acceptance Criteria
- UI looks intentional and consistent
- No polish change should break terminal or lab behavior

## Files Likely Involved
- `frontend/src/App.jsx`
- `frontend/src/components/LiveTerminal.jsx`

---

# Slice 8 — Stretch Tasks (Only if all above are stable)

## Stretch A — Terminal Highlighting
- Highlight suspicious lines or AI-detected findings directly in terminal output

## Stretch B — Better Lab Metadata
- Display attacker container, target container, network name, and browser URL in UI

## Stretch C — Additional Labs
- Add a second simple lab only if the first lab is stable

Do not start stretch tasks until the core demo flow is confirmed working.

---

## Recommended Codex Workflow

For best results, use Codex one slice at a time.

### Example Prompt 1
Read `TASKS_CODEX.md` and inspect the repository.

Work only on **Slice 1 — Core Demo Reliability**.

Constraints:
- do not rewrite architecture
- make minimal, high-confidence changes
- explain each file modified
- run relevant checks after edits
- stop after Slice 1 is complete

### Example Prompt 2
Read `TASKS_CODEX.md` and inspect the repository.

Work only on **Slice 2 — Functional Juice Shop Recon Lab**.

Constraints:
- preserve current frontend behavior
- do not add unrelated features
- verify the browser terminal can run:
  - `ping -c 3 target`
  - `nmap -sV target`
  - `curl http://target:3000`
- explain all edits and checks

### Example Prompt 3
Read `TASKS_CODEX.md` and inspect the repository.

Work only on **Slice 3 — Guided Lab Progression**.

Constraints:
- do not break terminal stability
- keep progression logic simple and deterministic
- add manual completion for browser-only steps
- explain all edits and checks

---

## Final Verification Checklist

Before considering the project complete, verify all items below:

- [ ] Start Session works
- [ ] Launch Lab works
- [ ] Lab relaunch does not crash
- [ ] Attacker and target containers are created
- [ ] Per-session network is created
- [ ] Terminal connects to `attacker-{session_id}`
- [ ] `ping -c 3 target` works
- [ ] `nmap -sV target` works
- [ ] `curl http://target:3000` works
- [ ] Guided lab progression works
- [ ] AI feedback works
- [ ] Meaningful finding can be suggested or auto-saved
- [ ] Findings show in UI
- [ ] Report generates correctly

---

## Notes to Codex

- Prefer correctness over cleverness
- Prefer finishing one vertical slice over touching many files incompletely
- If a file already has working logic, patch it instead of replacing it
- If uncertain, inspect the existing implementation before editing
