# Secure Stack Deployment

Secure Stack can now run in a containerized setup with a production-style backend, frontend, and PostgreSQL database.

## Prerequisites

- Docker Engine / Docker Desktop
- Docker Compose
- Optional: Ollama running on the host if you want live AI summaries
- Optional: an OpenAI API key if you want the deep tutor path to use the Responses API

## 1. Configure environment variables

Copy the sample environment file and update the production values:

```bash
cp .env.example .env
```

Important values to review:

- `SECURESTACK_AUTH_TOKEN_SECRET`
- `POSTGRES_PASSWORD`
- `SECURESTACK_DATABASE_URL`
- `SECURESTACK_RUN_MIGRATIONS_ON_STARTUP`
- `SECURESTACK_AUTO_CREATE_SCHEMA`
- `SECURESTACK_CORS_ORIGINS`
- `SECURESTACK_INSTRUCTOR_EMAILS`
- `SECURESTACK_OLLAMA_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SECURESTACK_TARGET_PUBLIC_HOST`
- `SECURESTACK_TARGET_PROBE_HOST`
- `SECURESTACK_PULL_RUNTIME_IMAGES`

If Ollama runs on the same host machine as Docker, the default `host.docker.internal` value works for Docker Desktop and Linux setups with `host-gateway`.

OpenAI is backend-only. Set `OPENAI_API_KEY` in `.env` or your deployment secret manager, never in frontend code. The backend uses OpenAI only for deep tutor requests such as explanation, stuck support, richer conceptual questions, and reflection-style prompts. Missing keys, API failures, timeouts, or malformed model output fall back to the local tutor response and log a backend warning.
The websocket tutor path currently returns final OpenAI-enriched responses rather than streaming token deltas; the frontend's existing pending state stays active while the backend waits.

Useful OpenAI settings:

- `OPENAI_TUTOR_ENABLED=1`
- `OPENAI_API_KEY=`
- `OPENAI_MODEL=gpt-5.4-mini`
- `OPENAI_TIMEOUT_SECONDS=14`
- `OPENAI_REASONING_EFFORT=low`
- `OPENAI_TEXT_VERBOSITY=low`

For lab launches in Docker Compose:

- `SECURESTACK_TARGET_PUBLIC_HOST` should stay `localhost` so the browser can open the published target port.
- `SECURESTACK_TARGET_PROBE_HOST` should be `host.docker.internal` so the backend container can probe the published host port during environment startup.
- `SECURESTACK_PULL_RUNTIME_IMAGES=1` lets Secure Stack pull first-use lab target images like `nginx:alpine` automatically. Set it to `0` only if your deployment host is offline and you preload every lab image yourself.
- `SECURESTACK_INSTRUCTOR_EMAILS` can be set to a comma-separated list such as `ta@example.com,professor@example.com` to enable the lightweight instructor review route at `/instructor`.

## 2. Start the stack

```bash
docker compose up --build
```

The Compose file now requires real values for:

- `POSTGRES_PASSWORD`
- `SECURESTACK_AUTH_TOKEN_SECRET`

If you override `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB`, make sure `SECURESTACK_DATABASE_URL` matches the same credentials and database name.
If you change PostgreSQL credentials for an existing named volume, recreate the database volume or rotate the credentials inside PostgreSQL as well. Otherwise the backend will fail startup with a password authentication error.

Services:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:8000`
- PostgreSQL: internal-only by default
- Backend readiness: `http://localhost:8000/health/ready`

## 3. What happens on startup

The backend container:

1. waits for the configured database
2. validates production-critical settings
3. runs `alembic upgrade head` by default
4. verifies the required schema is present
5. starts Uvicorn with proxy-header support enabled

## Alembic migrations

Secure Stack now manages schema changes through Alembic.

Common commands:

```bash
cd backend
alembic upgrade head
alembic current
alembic history
```

For Docker Compose:

```bash
docker compose run --rm backend alembic upgrade head
```

Notes:

- `SECURESTACK_RUN_MIGRATIONS_ON_STARTUP=1` keeps the current single-stack deployment convenient by applying migrations during backend bootstrap.
- In a more controlled production environment, you can set `SECURESTACK_RUN_MIGRATIONS_ON_STARTUP=0` and run `alembic upgrade head` explicitly before starting the backend.
- `SECURESTACK_AUTO_CREATE_SCHEMA=1` is only a lightweight dev fallback for an empty database. It is not the recommended production path.

## Production notes

- The backend expects Docker socket access for lab launches and terminal sessions.
- `docker-compose.yml` mounts `/var/run/docker.sock` into the backend container.
- The backend health check now uses `/health/ready`, which verifies both database access and Docker runtime availability.
- The frontend exposes `/healthz` for container health checks.
- All Compose services use `restart: unless-stopped` for more predictable recovery.
- Lab launch failures, Docker connectivity issues, database connection retries, and AI service failures now log with clearer backend messages.
- If a database already exists but is not tracked by Alembic yet, run `alembic stamp head` only after confirming it already matches the current schema.
- SQLite still works for local fallback, but PostgreSQL is now the recommended deployment database.

## Local non-container fallback

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
VITE_API_URL=http://127.0.0.1:8000 VITE_WS_URL=ws://127.0.0.1:8000/ws npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

For local Vite development, the frontend now defaults to proxied `/api` and `/ws` paths, so `npm run dev` works cleanly against a local backend on port `8000`.
