#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[debug] npm install"
npm install

echo "[debug] build"
npm run build

echo "[debug] test"
npm test

echo "[debug] setup"
npm run setup -- --scope project --force

echo "[debug] doctor"
npm run doctor || true

echo "[debug] help + safety checks"
node dist/bin/ogx.js --help >/tmp/ogx-help.txt
node dist/bin/ogx.js launch --scope project --dry-run -- --version >/tmp/ogx-launch-dry.txt

if node dist/bin/ogx.js launch --scope project --dry-run -- --danger >/tmp/ogx-danger.txt 2>&1; then
  echo "[debug] expected dangerous flag to be blocked, but command succeeded" >&2
  exit 1
fi

node dist/bin/ogx.js launch --scope project --allow-dangerous --dry-run -- --danger >/tmp/ogx-danger-allow.txt

echo "[debug] launch/status/cancel with python sleep"
OGX_GEMINI_CMD=python3 node dist/bin/ogx.js launch --scope project --detach -- -c 'import time; time.sleep(30)'
node dist/bin/ogx.js status --scope project
node dist/bin/ogx.js cancel --scope project

if command -v tmux >/dev/null 2>&1; then
  echo "[debug] team start/status/resume/shutdown"
  node dist/bin/ogx.js team start --scope project --name demo --workers 2
  node dist/bin/ogx.js team status --scope project --name demo
  node dist/bin/ogx.js team shutdown --scope project --name demo
  node dist/bin/ogx.js team resume --scope project --name demo
  node dist/bin/ogx.js team shutdown --scope project --name demo
else
  echo "[debug] tmux not found: skipping team flow"
fi

echo "[debug] done"
