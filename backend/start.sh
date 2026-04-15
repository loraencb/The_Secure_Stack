#!/bin/sh
set -eu

cd /app/backend

python -m app.bootstrap

exec uvicorn app.main:app \
  --host "${SECURESTACK_API_HOST:-0.0.0.0}" \
  --port "${SECURESTACK_API_PORT:-8000}" \
  --workers "${SECURESTACK_API_WORKERS:-1}" \
  --proxy-headers \
  --forwarded-allow-ips="*"
