# Manual Validation Checklist

## Setup and Doctor

- [ ] `npm run setup -- --scope project` completes without errors.
- [ ] `.ogx/state`, `.ogx/logs`, `.ogx/plans` are created.
- [ ] prompts/skills/templates are copied into `.ogx`.
- [ ] `npm run doctor` reports PASS for required checks.

## Launch Mode

- [ ] `ogx launch --scope project --dry-run -- --help` prints command and scoped HOME.
- [ ] dangerous flags are blocked by default.
- [ ] `--allow-dangerous` allows explicitly opted-in dangerous flags.
- [ ] `ogx status` shows running/stopped state transitions.
- [ ] `ogx cancel` stops tracked process cleanly.

## Team Mode

- [ ] `ogx team start --scope project --name demo --workers 2` creates tmux session and worker files.
- [ ] `ogx team status --scope project --name demo` shows session/worker state.
- [ ] `ogx team resume --scope project --name demo` restores a stopped session.
- [ ] `ogx team shutdown --scope project --name demo` stops session and updates state.

## Hooks / Notifications

- [ ] Slack webhook URL is accepted and receives turn-complete message.
- [ ] Telegram bot token + chat ID are accepted and receive turn-complete message.
- [ ] Gmail receives turn-complete mail when `gmail.enabled=true` and credentials are set.
- [ ] Multiple channels can be enabled simultaneously and all are attempted.
- [ ] Invalid webhook/token/credentials produce clear warnings.

## Platform / Safety

- [ ] macOS/Linux flows execute normally.
- [ ] Windows users see WSL recommendation in doctor output.
- [ ] child process execution is argument-based (no shell injection path).
