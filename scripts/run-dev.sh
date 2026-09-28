#!/usr/bin/env bash
# Development: Vite frontend (:5173) + FastAPI backend (:8000) using backend/.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${ROOT}/.venv"
ENV_FILE="${ROOT}/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — run scripts/setup-local.sh first."
  exit 1
fi

# shellcheck source=/dev/null
source "$VENV/bin/activate"

load_env() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

load_env

mkdir -p "${VECTOR_DATA_DIR:-$HOME/.openestimate/vectors}"

cleanup() {
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://127.0.0.1:8000 (PostgreSQL)"
(cd "$ROOT/backend" && uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000) &
BACKEND_PID=$!

sleep 2
echo "Starting frontend on http://127.0.0.1:5173 (proxies /api -> :8000)"
cd "$ROOT/frontend" && npm run dev
