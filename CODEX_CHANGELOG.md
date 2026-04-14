# Codex Change Log

## Purpose
This file tracks the changes made while executing the instructions from `next_step.docx`.

## Status
- Phase: Final runtime hardening complete
- Current task: Clean-start runtime verification completed with targeted reliability fixes

## Changes Made
- Created this running change log before implementation started.
- Extracted and reviewed `next_step.docx`.
- Identified the immediate implementation target from the document: a real lab module schema for `juice-shop-recon`.
- Added a structured lab metadata file with runtime details, task definitions, evidence rules, hints, remediation guidance, and success criteria.
- Added a student manual in Markdown.
- Added an instructor guide in Markdown.
- Replaced the hardcoded backend lab definition with a loader that reads lab modules from `labs/*/metadata.json`.
- Extended lab launch responses to include richer lab-module metadata.
- Added a lab definition route so the backend can expose the structured module directly.
- Aligned the launcher network name with the lab module runtime definition so the backend is no longer partially hardcoded for that value.
- Verified the new lab metadata loads correctly through the backend loader.
- Verified the updated backend files parse successfully.
- Added a frontend API call for the backend lab definition route.
- Updated `App.jsx` to load the structured lab definition from the backend.
- Updated the guided lab UI to render module-driven title, description, learning objectives, prerequisites, task details, hints, remediation guidance, and success criteria.
- Reduced duplicated frontend lab-step assumptions by using module fields like `allowed_completion_methods`, `step_type`, `manual_confirmation_label`, and backend task data.
- Kept the existing session, launch, terminal, AI, findings, and report flow intact while adapting the UI to the module data.
- Started the tracked workflow slice for per-task persistence tied to a session.
- Planned a minimal backend task-completion table and narrow frontend sync so guided progress survives refresh without changing the terminal architecture.
- Added a backend `task_completions` persistence model for per-session lab task tracking and evidence capture.
- Added backend schemas for task completion creation, evidence updates, and progress responses.
- Added a dedicated backend router with routes to fetch session task progress, upsert task completion, and patch evidence on an existing completion record.
- Registered the new task progress router in the FastAPI app.
- Added frontend API helpers for task progress fetch and completion persistence.
- Updated the frontend terminal component to hand off the settled command output to `App.jsx` after the backend AI feedback event for that command, so command-based task completion can store evidence without changing the websocket flow.
- Updated `App.jsx` to hydrate guided lab progress from backend task records, persist browser-step completion, persist command-step evidence, and restore the active session ID from local storage so progress survives refresh.
- Started the next instructional slice so command-based task attempts can be evaluated as successful, insufficient, or off-track instead of only completed/not completed.
- Extended the task progress persistence model with task-level evaluation fields: `ai_status`, `ai_feedback`, `ai_confidence`, and `evidence_quality`.
- Added a small backend schema-repair helper so existing SQLite `task_completions` tables can pick up the new evaluation columns without a broad migration framework.
- Added a deterministic task evaluator service that uses the structured lab task metadata plus the captured command output to classify command attempts as successful, insufficient, or off-track.
- Updated the task progress upsert route so command-based task submissions are evaluated server-side and persisted with task-level instructional feedback.
- Updated `App.jsx` so command attempts for the active task are always persisted and the returned task record decides whether the user advanced, needs stronger evidence, or is off track.
- Updated the lab guide UI to surface persisted task-level evaluation feedback, evidence quality, and command review details inside the task cards.
- Started the learner-summary slice to give the current session a clear at-a-glance progress view without adding a new backend subsystem.
- Reused the existing findings session route so the frontend can rehydrate findings for the active session alongside task progress.
- Added a learner summary panel in `App.jsx` showing lab title, task counts, insufficient/off-track counts, completion percentage, current task, recommended next action, completed-task evidence snippets, and a compact findings summary.
- Derived the learner summary from persisted task-progress records plus session findings instead of creating a separate backend summary subsystem.
- Added a repo-local backend start helper script that safely replaces a stale Python listener on port 8000 before starting uvicorn, so local verification avoids hitting an older backend instance.
- Updated the default SQLite path to a safe temp-directory location outside the OneDrive-backed repo path while preserving `SECURESTACK_DATABASE_URL` and `SECURESTACK_DATABASE_PATH` overrides.
- Hardened websocket sends in `ws_terminal.py` so expected disconnects do not create noisy stack traces or crash the session flow mid-send.
- Hardened terminal writes in `terminal_manager.py` so writes to an exited subprocess fail with a controlled runtime error instead of breaking the flow unpredictably.
- Hardened the lab launcher by making attacker container creation explicit with create + network connect + start, and by wrapping launch failures with clearer runtime context.
- Tightened duplicate AI finding handling so rerunning the same high-signal command does not create another persisted finding for the same session/title.
- Adjusted task evaluation for `curl http://target:3000` so the actual guided command can satisfy the web-app evidence check using the returned HTML content.

## Files Modified
- `CODEX_CHANGELOG.md`
- `backend/app/labs/labs_config.py`
- `backend/app/main.py`
- `backend/app/database.py`
- `backend/app/models.py`
- `backend/app/routers/task_progress.py`
- `backend/app/routers/ws_terminal.py`
- `backend/app/services/task_evaluator.py`
- `backend/app/services/lab_launcher.py`
- `backend/app/services/terminal_manager.py`
- `backend/app/schemas.py`
- `backend/app/routers/labs.py`
- `frontend/src/api/Client.js`
- `frontend/src/App.jsx`
- `frontend/src/components/LiveTerminal.jsx`
- `labs/juice-shop-recon/metadata.json`
- `labs/juice-shop-recon/student_manual.md`
- `labs/juice-shop-recon/instructor_guide.md`
- `scripts/start_backend.ps1`

## Notes
- I will update this file as work progresses.
- The backend now treats the structured lab module as the source of truth for the active Juice Shop recon lab.

## Verification
- Parsed the modified backend files successfully with Python AST checks.
- Parsed `labs/juice-shop-recon/metadata.json` successfully.
- Loaded `LABS["juice-shop-recon"]` through the backend loader and confirmed it resolves the manuals and task list.
- Frontend verification for the lab module integration is the current step.
- Parsed the new backend task progress files successfully with Python AST checks.
- Validated targeted frontend lint for `src/App.jsx`, `src/components/LiveTerminal.jsx`, and `src/api/Client.js`.
- Validated `Base.metadata.create_all()` against an in-memory SQLite engine, including the new `task_completions` table.
- Importing the backend app against the on-disk SQLite file in this environment hit a local `sqlite3` disk I/O error, so runtime verification against the existing file-backed DB remains environment-dependent.
- Parsed the new task-evaluation backend files successfully with Python AST checks.
- Validated targeted frontend lint after adding task-level evaluation rendering.
- Ran focused evaluator checks confirming:
  - successful completion for strong `ping -c 3 target` evidence
  - successful completion for strong `nmap -sV target` evidence
  - insufficient evaluation for weak `nmap` output
  - off-track evaluation for `pwd` during the open-services task
  - successful completion for strong `curl http://target:3000` evidence
- Validated targeted frontend lint after adding the learner summary panel and findings rehydration.
- Verified a clean backend start using `scripts/start_backend.ps1`, `/health`, and OpenAPI route inspection including `task-progress`.
- Verified a clean frontend dev server start at `http://127.0.0.1:5173`.
- Verified a full fresh learner run on session `6`:
  - session start succeeded
  - `juice-shop-recon` launch succeeded
  - `attacker-6` and `target-6` containers existed on `lab-net-6`
  - `browser_url` responded with `200`
  - websocket terminal connected to `attacker-6`
  - `ping -c 3 target` worked
  - `nmap -sV target` worked and auto-saved a finding
  - `curl http://target:3000` worked and auto-saved a finding
  - all task progress persisted correctly, including successful evaluation for the curl step and manual completion for the browser step
  - findings persisted and report generation succeeded with the current findings
- Verified duplicate-finding hardening by rerunning `nmap -sV target` in the same session and confirming no new auto-saved finding was emitted or persisted.
- Backend runtime logs for the clean run showed clean websocket open/close events instead of noisy disconnect stack traces.
