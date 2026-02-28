# oh-my-gemini (`ogx`)

Gemini-based multi-agent orchestration CLI inspired by the operational structure of `oh-my-codex`.

## Key Principles

- Fresh implementation (no code copy).
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
