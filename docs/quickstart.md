# Quickstart

If you want the shortest honest validation path first, run:

```bash
npm install
npm run smoke
npm test
```

Then go deeper with the CLI-native flow below.

## 1) Install

```bash
npm install
```

## 2) Build

```bash
npm run build
```

## 3) Smoke the hosted/runtime walkthrough

```bash
npm run smoke
```

This exercises `/health`, `/meta`, `/v1/runtime-brief`, `/v1/review-pack`, `/v1/team-session-replay`, `/v1/runtime-scorecard`, `/api`, and `POST /v1/doctor` through the local wrapper.

## 4) Test

```bash
npm test
```

## 5) Initialize (project scope)

```bash
npm run setup -- --scope project
```

## 6) Configure runtime and notification envs

```bash
export OGX_GEMINI_CMD='gemini'
export OGX_SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
export OGX_TELEGRAM_BOT_TOKEN='123456:ABC...'
export OGX_TELEGRAM_CHAT_ID='-100123456'
export OGX_GMAIL_USER='sender@gmail.com'
export OGX_GMAIL_APP_PASSWORD='gmail-app-password'
```

## 7) Diagnose environment

```bash
npm run doctor
```

## 8) Launch Gemini via ogx

```bash
node dist/bin/ogx.js launch -- --help
```

## 9) Team mode (tmux)

```bash
node dist/bin/ogx.js team start --scope project --name demo --workers 2
node dist/bin/ogx.js team status --scope project --name demo
node dist/bin/ogx.js team shutdown --scope project --name demo
```

## 10) Inspect team session replay

```bash
curl -s http://127.0.0.1:8080/v1/team-session-replay | jq .
```

If Homebrew tmux installation is blocked by permissions, install locally:

```bash
./scripts/install-tmux-local.sh
```

For a walkthrough of the verification steps, see the [manual validation checklist](./manual-validation-checklist.md).
