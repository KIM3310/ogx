# Quickstart

## 1) Install

```bash
npm install
```

## 2) Build

```bash
npm run build
```

## 3) Test

```bash
npm test
```

## 4) Initialize (project scope)

```bash
npm run setup -- --scope project
```

## 5) Configure runtime and notification envs

```bash
export OGX_GEMINI_CMD='gemini'
export OGX_SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'
export OGX_TELEGRAM_BOT_TOKEN='123456:ABC...'
export OGX_TELEGRAM_CHAT_ID='-100123456'
export OGX_GMAIL_USER='sender@gmail.com'
export OGX_GMAIL_APP_PASSWORD='gmail-app-password'
```

## 6) Diagnose environment

```bash
npm run doctor
```

## 7) Launch Gemini via ogx

```bash
node dist/bin/ogx.js launch -- --help
```

## 8) Team mode (tmux)

```bash
node dist/bin/ogx.js team start --scope project --name demo --workers 2
node dist/bin/ogx.js team status --scope project --name demo
node dist/bin/ogx.js team shutdown --scope project --name demo
```

If Homebrew tmux installation is blocked by permissions, install locally:

```bash
./scripts/install-tmux-local.sh
```
