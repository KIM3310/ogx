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
  - path: `gemini` from PATH
  - version: `0.31.0`
- tmux installed locally and verified:
  - path: `tmux` from PATH
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

## 2026-02-28 Pass 5 — Cloud Run deployment path added

- Added Cloud Run API entrypoint:
  - `src/bin/server.ts`
  - routes: `/health`, `/`, `/v1/version`, `/v1/doctor`
- Added container build definition:
  - `Dockerfile`
- Added GCP automation scripts:
  - `scripts/install-gcloud-local.sh` (user-space local install)
  - `scripts/deploy-cloud-run.sh` (Artifact Registry + Cloud Build + Cloud Run deploy)
- Updated npm scripts:
  - `serve`, `dev:api`, `install:gcloud`, `deploy:gcp`
- Updated README with Cloud Run runbook.

## 2026-03-15 Pass 6 — project status + metadata tightening

- Added explicit overhaul plan:
  - `docs/portfolio-overhaul-plan.md`
- Added public proof map:
  - `docs/manual-validation-checklist.md`
- Refreshed portfolio/front-door docs:
  - `README.md`
  - `docs/quickstart.md`
  - `docs/manual-validation-checklist.md`
  - `site/index.html`
- Added a first-class smoke path:
  - `npm run smoke`
  - CI smoke step via `.github/workflows/ci.yml`
- Reduced metadata drift:
  - shared version/description constants in `src/meta.ts`
  - aligned CLI/server version reporting
  - corrected public route counts across review payloads
  - made the local API home page label local vs Cloud Run honestly

### Latest verification snapshot

- `npm run build`: success
- `npm test`: success (6 files, 23 tests)
- `npm run smoke`: success
  - runtime mode: `local`
  - review claim tier: `cli-first-local-wrapper`
  - public route count: `11`
  - doctor result: `degraded` / `doctor_ok=false` on this machine, surfaced honestly rather than hidden
