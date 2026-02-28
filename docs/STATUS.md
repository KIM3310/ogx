# STATUS

## Current Milestone

MVP hardened for Gemini orchestration + multi-channel notifications + Vertex profile wiring.

## Completed

- Project scaffolding with TypeScript ESM.
- Core state schemas and stores with Zod validation.
- CLI commands implemented:
  - setup
  - doctor
  - launch
  - team (start/status/resume/shutdown)
  - status
  - cancel
- Worker runtime skeleton with inbox processing loop.
- tmux orchestration module.
- turn-complete hook dispatcher + notifications:
  - Discord
  - Slack
  - Telegram
  - Gmail
- Runtime Gemini command path support:
  - env `OGX_GEMINI_CMD`
  - fallback `.ogx/config.json` -> `runtime.geminiCommand`
- Utility scripts:
  - `scripts/install-tmux-local.sh` (local tmux install)
  - `scripts/debug-smoke.sh` (end-to-end debug run)
  - `scripts/set-vertex-env.sh` (Vertex env quick setup)
- Vertex profile file wiring:
  - `~/.config/ogx/vertex-gemini.env`
  - auto-source hook in `~/.zshrc`
- Unit tests:
  - validation/paths/store/runtime/program wiring
  - notification target resolution

## Local Environment Progress

- Gemini CLI installed globally and verified:
  - path: `/Users/do-eon/.local/bin/gemini`
  - version: `0.31.0`
- tmux installed locally and verified:
  - path: `/Users/do-eon/.local/bin/tmux`
  - version: `3.5a`

## Local Commands

- Install: `npm install`
- Build: `npm run build`
- Test: `npm test`
- Setup: `npm run setup -- --scope project --force`
- Doctor: `npm run doctor`
- Smoke debug: `./scripts/debug-smoke.sh`

## Latest Run Snapshot

- `npm run build`: success
- `npm test`: success (5 files, 12 tests)
- `npm run doctor`: required checks PASS
  - PASS node
  - PASS gemini-cli (`gemini 0.31.0`)
  - PASS config/prompts/skills
  - PASS tmux
- Vertex doctor checks:
  - PASS vertex-enabled
  - WARN vertex-project (unset)
  - WARN vertex-auth (unset)

## Remaining

- Set actual `GOOGLE_CLOUD_PROJECT`.
- Configure Vertex auth:
  - `gcloud auth application-default login`, or
  - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
- Real Slack/Telegram/Gmail credential wiring in target environment.
