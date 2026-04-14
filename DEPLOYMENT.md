# Secure Stack Deployment

Secure Stack can now run in a containerized setup with a production-style backend, frontend, and PostgreSQL database.

## Prerequisites

- Docker Engine / Docker Desktop
- Docker Compose
- Optional: Ollama running on the host if you want live AI summaries

## 1. Configure environment variables

Copy the sample environment file and update the production values:

```bash
cp .env.example .env
```

Important values to review:

- `SECURESTACK_AUTH_TOKEN_SECRET`
- `POSTGRES_PASSWORD`
- `SECURESTACK_DATABASE_URL`
- `SECURESTACK_CORS_ORIGINS`
- `SECURESTACK_OLLAMA_URL`
- `SECURESTACK_TARGET_PUBLIC_HOST`
- `SECURESTACK_TARGET_PROBE_HOST`

If Ollama runs on the same host machine as Docker, the default `host.docker.internal` value works for Docker Desktop and Linux setups with `host-gateway`.

For lab launches in Docker Compose:

- `SECURESTACK_TARGET_PUBLIC_HOST` should stay `localhost` so the browser can open the published target port.
- `SECURESTACK_TARGET_PROBE_HOST` should be `host.docker.internal` so the backend container can probe the published host port during environment startup.

## 2. Start the stack

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:8000`
- PostgreSQL: internal-only by default

## 3. What happens on startup

The backend container:

1. waits for the configured database
2. initializes tables
3. applies lightweight schema repair for existing SQLite-era columns
4. starts Uvicorn with the configured host/port/workers

## Production notes

- The backend expects Docker socket access for lab launches and terminal sessions.
- `docker-compose.yml` mounts `/var/run/docker.sock` into the backend container.
- Lab launch failures, Docker connectivity issues, database connection retries, and AI service failures now log with clearer backend messages.
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
