# Secure Stack

Secure Stack is a multi-user cybersecurity training platform that combines containerized labs, a guided session workspace, live terminal interaction, adaptive AI tutoring, evidence-aware findings, and report generation in one workflow-aware application.

## What Secure Stack Does

Secure Stack is built around a real lab journey:

1. A user registers or signs in.
2. The user selects a lab and starts a session.
3. The backend launches an isolated container-based environment.
4. The learner works through a guided lab workspace.
5. Terminal activity, task progress, and AI feedback shape the session flow.
6. Evidence is turned into findings and findings are turned into reports.
7. Sessions can be refreshed, resumed, cleaned up, and revisited later from session history.

The result is more than a lab launcher. It is a guided cyber investigation platform with durable session state and backend-backed ownership.

## Current Highlights

- Multi-user authentication and authorization with protected routes and user-owned data.
- Multi-page React frontend with a polished session mini-app.
- Nested session workspace with `Overview`, `Guide`, `Workspace`, and `Reports`.
- Real-time terminal access over WebSockets with a shell-style prompt and Docker-backed exec sessions.
- Structured lab modules loaded from `labs/*/metadata.json`.
- Formal lab schema validation and backward-compatible normalization for authored labs.
- Task progress persistence with evidence capture and instructional AI evaluation.
- Workflow-aware guidance that reacts to launch state, progress, findings, and reports.
- Lab-manual-style Guide with topology-aware steps and richer instructional metadata.
- Step-aware AI tutor with progressive hint escalation and explicit Ask Tutor actions.
- Evidence-aware findings and report readiness cues.
- Investigation timeline and durable session history.
- Lightweight instructor review view for TA/professor session inspection.
- Environment teardown and cleanup workflow for lab lifecycle safety.
- Deployment-ready Docker Compose stack with frontend, backend, and PostgreSQL.

## Core Capabilities

### Guided Session Workspace

Each active lab session behaves like a mini application inside the platform:

- `Overview` shows session status, progress, environment details, and investigation timeline.
- `Guide` acts like a lab manual with objectives, topology, instructions, explanations, expected outcomes, and hints.
- `Workspace` provides the live terminal, AI review, and active task context.
- `Reports` organizes findings, evidence context, and report generation.

The frontend routes currently include:

- `/login`
- `/`
- `/labs`
- `/session/:id/overview`
- `/session/:id/guide`
- `/session/:id/workspace`
- `/session/:id/reports`
- `/profile`
- `/instructor` for allowlisted instructor accounts

### Workflow and Evidence Intelligence

Secure Stack derives useful guidance from real session signals:

- active session and lab metadata
- environment launch state
- current lab task and task progress
- command activity and captured evidence
- findings and report generation state
- visited session sections

This intelligence powers:

- next recommended actions
- current step and completion feel
- evidence-aware finding drafts
- report readiness cues
- investigation timeline summaries

### Adaptive AI Tutor

Secure Stack's tutor is aware of the active lab and step context, not just raw terminal output. It uses:

- current lab and step metadata
- topology summary
- recent commands and outputs
- task objective and expected outcome
- prior struggle, off-track, and help signals

The tutor currently supports:

- progressive hint levels
- off-track redirection
- learning-oriented success explanations
- explicit Ask Tutor actions for hint, explanation, stuck support, and next-step help
- optional OpenAI-backed deep reasoning for richer explanation, stuck, and conceptual tutor questions

OpenAI is used only on the backend and only for deeper tutor moments. Fast local tutor behavior still handles success reinforcement, redirects, browser handoffs, weak-attempt nudges, and simple check-ins.
The current websocket flow keeps final tutor responses non-streaming and uses the existing tutor pending state while deeper responses are prepared.

### Authentication and Data Ownership

The platform now supports:

- user registration and login
- bearer-token authentication
- protected API routes
- per-user session ownership
- per-user finding and report isolation
- protected terminal WebSocket access
- optional allowlisted instructor review access via `SECURESTACK_INSTRUCTOR_EMAILS`

### Container-Based Lab Infrastructure

Lab environments are launched per session using Docker. The backend manages:

- attacker and target containers
- per-session network names
- launch/runtime metadata
- terminal exec sessions inside the attacker container
- teardown and cleanup of attacker, target, and network resources
- clearer failure handling when Docker or lab services are unavailable

### Durable Persistence

Secure Stack persists:

- users and auth tokens
- sessions and ownership
- environment launch metadata
- task progress and evidence state
- findings with task and evidence context
- report-generated milestones
- compact session history for the Profile page

The frontend still keeps lightweight UI-only state when useful, but backend-backed data is preferred during hydration after refresh, reconnect, and resume.

## Architecture

### Frontend

- React
- React Router
- xterm.js terminal experience
- lazy-loaded session panels
- auth-aware application shell

### Backend

- FastAPI
- SQLAlchemy models and routers
- bearer-token authentication with stored auth tokens
- structured error handling and logging
- WebSocket terminal transport

### Database

- PostgreSQL recommended for deployment
- SQLite supported as a local fallback

### AI Layer

- terminal-aware coaching and summary support
- configurable external AI service endpoint
- optional OpenAI Responses API deep tutor layer
- graceful degradation when AI is unavailable

## Repository Layout

```text
The_Secure_Stack/
|-- backend/
|   |-- app/
|   |   |-- routers/
|   |   |-- services/
|   |   |-- config.py
|   |   |-- database.py
|   |   `-- main.py
|   |-- tests/
|   |-- Dockerfile
|   `-- start.sh
|-- frontend/
|   |-- src/
|   |-- Dockerfile
|   `-- nginx.conf
|-- labs/
|   |-- attacker/
|   |-- juice-shop/
|   `-- juice-shop-recon/
|-- .env.example
|-- docker-compose.yml
|-- DEPLOYMENT.md
|-- secure_stack_roadmap.md
`-- README.md
```

## Lab Module Structure

Labs are module-driven and discovered from `labs/*/metadata.json`.

A typical lab module can include:

- `metadata.json`
- `student_manual.md`
- `instructor_guide.md`
- Docker runtime configuration
- task definitions, hints, remediation guidance, and success criteria

This keeps lab content version-controlled and reusable without hardcoding every lab into the backend or frontend.

### Lab Authoring and Validation

Secure Stack now validates lab metadata when the backend loads each lab. Invalid labs fail early with author-facing errors instead of breaking later inside the Guide, tutor, or launcher.

Validation currently covers:

- top-level identity and description fields
- runtime attacker/target configuration
- topology structure and connection integrity
- step/task structure and duplicate ids
- step guidance and evidence fields required by the Guide and tutor
- optional manual file paths when provided

Backward-compatible aliases are still normalized where practical:

- `id` -> `lab_id`
- `title` -> `name`
- `steps` -> `tasks`
- `objectives` -> `learning_objectives`
- `hint_text` -> first hint

Authoring references:

- [labs/lab.schema.json](labs/lab.schema.json)
- [labs/LAB_AUTHORING.md](labs/LAB_AUTHORING.md)
- [labs/examples/metadata.example.json](labs/examples/metadata.example.json)

## API Overview

Major backend surfaces include:

- `/auth/*` for registration, login, logout, and current-user lookup
- `/labs/*` for lab definitions and environment launch
- `/sessions/*` for session create, fetch, and history
- `/task-progress/*` for task progress and evidence persistence
- `/findings/*` for saved findings
- `/reports/*` for report generation
- `/ws/*` for live terminal sessions

Health check:

- `GET /health`

## Quick Start

### Recommended: Docker Compose

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Set real values for at least:

- `SECURESTACK_AUTH_TOKEN_SECRET`
- `POSTGRES_PASSWORD`
- `SECURESTACK_DATABASE_URL`
- `SECURESTACK_OLLAMA_URL` if you want live AI responses
- `OPENAI_API_KEY` if you want OpenAI-backed deep tutor explanations

3. Start the stack:

```bash
docker compose up --build
```

4. Open:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:8000`
- Health check: `http://localhost:8000/health`

For the full deployment guide, see [DEPLOYMENT.md](DEPLOYMENT.md).

### Local Development

Backend:

```bash
cd backend
python -m app.bootstrap
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite frontend defaults to proxied `/api` and `/ws` paths for local development.

## Important Environment Variables

Secure Stack now relies on environment-based configuration instead of hardcoded deployment assumptions.

Common values include:

- `SECURESTACK_DATABASE_URL`
- `SECURESTACK_DATABASE_PATH`
- `SECURESTACK_AUTH_TOKEN_SECRET`
- `SECURESTACK_CORS_ORIGINS`
- `SECURESTACK_OLLAMA_URL`
- `OPENAI_API_KEY` for backend-only deep tutor calls
- `OPENAI_MODEL`, defaulting to `gpt-5.4-mini`
- `SECURESTACK_TARGET_PUBLIC_HOST`
- `SECURESTACK_TARGET_PROBE_HOST`
- `SECURESTACK_PULL_RUNTIME_IMAGES`
- Docker and runtime resource settings

OpenAI keys must stay server-side. The frontend only receives tutor responses from the FastAPI websocket; it never receives `OPENAI_API_KEY`.

`SECURESTACK_TARGET_PUBLIC_HOST` and `SECURESTACK_TARGET_PROBE_HOST` are especially important in Dockerized deployment:

- the browser should open the target using `localhost`
- the backend container should probe target readiness using `host.docker.internal`
- `SECURESTACK_PULL_RUNTIME_IMAGES=1` lets Secure Stack automatically pull first-use lab images on launch; set it to `0` only if you preload every required lab image on the Docker host.

See [.env.example](.env.example) and [DEPLOYMENT.md](DEPLOYMENT.md) for the supported values.

## Testing and Validation

### Automated Checks

Backend test suite:

```bash
python -m unittest backend.tests.test_auth_workflow
```

Frontend production build:

```bash
cd frontend
npm run build
```

### Manual Smoke Test

A practical end-to-end validation flow is:

1. Register a new user.
2. Start a lab session from `Labs`.
3. Launch the environment.
4. Move through `Overview`, `Guide`, and `Workspace`.
5. Run commands in the live terminal.
6. Confirm AI feedback appears.
7. Save a finding with evidence context.
8. Generate a report.
9. Refresh the session.
10. Confirm timeline, findings, report state, and history rehydrate correctly.
11. Open `Profile` and confirm the session appears in history.

## Deployment Notes

- PostgreSQL is the recommended deployment database.
- SQLite remains available for lightweight local use.
- The backend needs Docker socket access to launch lab containers and open terminal exec sessions.
- The frontend is served through Nginx in the Compose setup.
- The backend includes clearer logging for auth errors, launch failures, database issues, and AI service problems.

## Documentation Map

- [README.md](README.md): primary project overview and developer entry point
- [DEPLOYMENT.md](DEPLOYMENT.md): containerized deployment and migration flow
- [labs/LAB_AUTHORING.md](labs/LAB_AUTHORING.md): lab schema and authoring rules
- [secure_stack_roadmap.md](secure_stack_roadmap.md): planned future work

## Current Status

Secure Stack has moved well beyond a capstone demo baseline. The current codebase includes:

- multi-user auth and route protection
- backend-backed session persistence
- workflow-aware guidance
- evidence-aware findings and report generation
- session replay timeline and durable history
- containerized deployment support
- backend tests for the core owned-session workflow

The next planned work is tracked in [secure_stack_roadmap.md](secure_stack_roadmap.md).

## License

This project is intended for educational and research use. All lab environments should be used ethically, in controlled settings, and only with systems that are explicitly part of the training environment.
