# Command Reference

## setup

```bash
ogx setup --scope <user|project> [--force]
```

Install prompts, skills, templates, and initialize local state directories.

## doctor

```bash
ogx doctor [--scope <user|project>]
```

Run environment diagnostics:
- Node.js version
- Gemini CLI availability
- config and assets
- tmux availability
- notification channel readiness (Slack/Telegram/Gmail)
- platform hints (WSL guidance on Windows)

## launch

```bash
ogx launch [--scope <user|project>] [--detach] [--dry-run] [--allow-dangerous] [-- <gemini args...>]
```

Wrap Gemini CLI invocation.

- Project scope sets isolated HOME/config under `.ogx`.
- Dangerous flags are blocked by default.
- Command path priority:
  1. `OGX_GEMINI_CMD`
  2. `.ogx/config.json` -> `runtime.geminiCommand`
  3. `gemini`

## team

```bash
ogx team start [--scope <user|project>] [--name <team>] [--workers <n>]
ogx team status [--scope <user|project>] [--name <team>]
ogx team resume [--scope <user|project>] [--name <team>]
ogx team shutdown [--scope <user|project>] [--name <team>]
```

Manage tmux worker sessions and per-worker inbox/state JSON files.

## status

```bash
ogx status [--scope <user|project>]
```

Show current launch runtime status from `.ogx/state/run.json`.

## cancel

```bash
ogx cancel [--scope <user|project>]
```

Terminate the currently tracked launch process.
