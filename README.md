# oh-my-gemini (`ogx`)

Gemini-based multi-agent orchestration CLI inspired by the operational structure of `oh-my-codex`.

## Portfolio posture
- Treat this repo as a CLI-first product; the static site is orientation, not runtime proof.
- README, command reference, `ogx doctor`, and reviewer routes are the evidence layer for operational claims.


## Role signals
- **AI engineer:** agent orchestration, runtime isolation, and CLI-first workflows are the real proof points here.
- **Solution architect:** tmux workers, local state boundaries, and optional hosted wrappers stay clearly separated.
- **Field / sales engineer:** `ogx doctor` and the reviewer routes make onboarding and demos easier to repeat.

## Key Principles

- Independent implementation tuned for CLI operator workflows.
- Node.js 20+ / TypeScript ESM.
- Safe by default.
- Dangerous flags are blocked unless explicitly opted in.
- macOS/Linux first-class support, Windows users should run via WSL.

## Features (MVP)

- `ogx setup`
  - installs prompts/skills/templates
  - initializes `.ogx/state`, `.ogx/logs`, `.ogx/plans`
- `ogx doctor`
  - checks node, gemini CLI, config/assets, tmux, platform hints
  - checks notification channel readiness (Slack/Telegram/Gmail)
- `ogx launch`
  - wraps Gemini CLI launch
  - project scope automatically isolates local HOME/config under `.ogx`
  - Gemini command can be set with env `OGX_GEMINI_CMD` or config `runtime.geminiCommand`
- `ogx team`
  - `start|status|resume|shutdown` for tmux workers
  - worker inbox/state JSON files under `.ogx/state`
- `ogx status`, `ogx cancel`
  - process run-state view and cancellation
- Hooks/notifications
  - turn-complete hook dispatcher
  - Discord, Slack, Telegram, Gmail channels

## Project Structure

- `bin/` CLI shim
- `src/bin` runtime entrypoints
- `src/cli` command routing and handlers
- `src/team` tmux orchestration
- `src/hooks` event dispatching
- `src/notifications` webhook/mail adapters
- `src/state` schemas and stores
- `src/utils` filesystem/process/validation/path helpers
- `prompts/`, `skills/`, `templates/`, `docs/`, `tests/`

## Installation & Validation

```bash
npm install
npm run build
npm test
npm run setup -- --scope project
npm run doctor
```

## Cloud Run Deployment (GCP)

This repository now includes a deployable HTTP API wrapper for Cloud Run.

API routes:
- `GET /health`
- `GET /meta`
- `GET /v1/runtime-brief`
- `GET /v1/review-pack`
- `GET /v1/schema/doctor-report`
- `GET /v1/version`
- `POST /v1/doctor` (body: `{ "scope": "project" | "user" }`)

Local API run:

```bash
npm run build
npm run serve
```

Health surface:

```bash
curl -s http://127.0.0.1:8080/health | jq .
curl -s http://127.0.0.1:8080/meta | jq .
curl -s http://127.0.0.1:8080/v1/runtime-brief | jq .
curl -s http://127.0.0.1:8080/v1/review-pack | jq .
curl -s http://127.0.0.1:8080/v1/schema/doctor-report | jq .
```

Deploy to Cloud Run:

```bash
# 1) Install local gcloud (user-space, no sudo)
npm run install:gcloud

# 2) Login + set project
~/.local/bin/gcloud auth login
~/.local/bin/gcloud config set project <your-project-id>

# 3) Deploy
export GCP_PROJECT_ID=<your-project-id>
export GCP_REGION=asia-northeast3
export SERVICE_NAME_API=oh-my-gemini-api
npm run deploy:gcp
```

## Utility Scripts

- Local tmux fallback install (without Homebrew write access):
  - `./scripts/install-tmux-local.sh`
- End-to-end smoke debugging:
  - `./scripts/debug-smoke.sh`
- Vertex env quick setup:
  - `./scripts/set-vertex-env.sh <gcp-project-id> [location] [credentials-json-path]`

## Command Quick Reference

See [docs/commands.md](docs/commands.md).

## Safety Notes

- `ogx launch` blocks dangerous flags unless:
  - `--allow-dangerous` was provided, or
  - `.ogx/config.json` has `safety.allowDangerousFlags = true`
- `tmux` execution uses argument escaping and strict team/worker naming validation.
- Windows users should use WSL for team-mode/runtime consistency.

## Notification Setup (Slack + Telegram + Gmail)

Set `.ogx/config.json` (or rely on env fallback keys):

```json
{
  "runtime": {
    "geminiCommand": "gemini"
  },
  "notifications": {
    "slackWebhookUrl": "",
    "slackWebhookEnv": "OGX_SLACK_WEBHOOK_URL",
    "telegramBotToken": "",
    "telegramBotTokenEnv": "OGX_TELEGRAM_BOT_TOKEN",
    "telegramChatId": "",
    "telegramChatIdEnv": "OGX_TELEGRAM_CHAT_ID",
    "gmail": {
      "enabled": true,
      "from": "sender@gmail.com",
      "to": "receiver@gmail.com",
      "user": "",
      "appPassword": "",
      "userEnv": "OGX_GMAIL_USER",
      "appPasswordEnv": "OGX_GMAIL_APP_PASSWORD",
      "subjectPrefix": "[ogx]"
    }
  }
}
```

Recommended secret setup:

```bash
export OGX_SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
export OGX_TELEGRAM_BOT_TOKEN='123456:ABC...'
export OGX_TELEGRAM_CHAT_ID='-100123456'
export OGX_GMAIL_USER='sender@gmail.com'
export OGX_GMAIL_APP_PASSWORD='gmail-app-password'
```

## Manual Validation Checklist

See [docs/manual-validation-checklist.md](docs/manual-validation-checklist.md).

## Ops Envelope

- `/health` now exposes:
  - `status`
  - `diagnostics.next_action`
  - `readiness_contract`
  - `report_contract`
  - `links`
  - `ops_contract`
- `/meta` provides runtime posture, route discovery, and capabilities for automation or dashboards.
- `/v1/runtime-brief` summarizes launch/team readiness and operator review flow.
- `/v1/schema/doctor-report` exposes the doctor result contract for downstream automation and reviewers.

## Review Flow

- Open `/health` and `/meta` to confirm runtime mode, command posture, and route discovery.
- Open `/v1/runtime-brief` and `/v1/review-pack` before wiring automation or Cloud Run handoff.
- Run `POST /v1/doctor` with `{"scope":"project"}` and inspect stdout/stderr before launch.
- Rerun doctor after environment drift or notification-channel changes.

## Proof Assets

- `Health Envelope` -> `/health`
- `Runtime Brief` -> `/v1/runtime-brief`
- `Review Pack` -> `/v1/review-pack`
- `Doctor Schema` -> `/v1/schema/doctor-report`
- `Doctor Run` -> `/v1/doctor`
