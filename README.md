# ogx (oh-my-gemini)

> **Archived / Supporting repo**  
> The active flagship runtime story now centers on **stage-pilot** and related reviewer-first workbenches.  
> Keep this repo as historical proof for CLI orchestration, tmux teamwork, and task-graph tooling.

[![CI](https://github.com/KIM3310/ogx/actions/workflows/ci.yml/badge.svg)](https://github.com/KIM3310/ogx/actions/workflows/ci.yml)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

CLI orchestration layer for Google's Gemini CLI with task dependency graphs, lease tokens, critic/verifier planning, tmux teams, HUD, and MCP support.

## Features

- **Task dependency graph** with priority-based scheduling and lease tokens
- **Deep replan** with critic and verifier gates
- **tmux team sessions** with leader, worker, and HUD windows
- **HUD display** showing real-time team/task/worker state
- **MCP server** with 14 tools for Gemini CLI integration
- **Gemini CLI harness** for programmatic prompt execution
- **Notifications** (Discord, Slack, Telegram, Gmail)
- **HTTP API** for Cloud Run deployment

## Quick start

```bash
npm install
npm run build
npm test
```

## Commands

## Review this first

1. `GET /v1/proof-map` — choose the shortest proof lane before touching doctor or team routes
2. `GET /health` / `GET /meta` — confirm wrapper posture and route discovery
3. `GET /v1/runtime-brief` — read runtime and operator boundary
4. `GET /v1/review-pack` — inspect the compact reviewer surface
5. `POST /v1/doctor` — generate dependency freshness evidence before launch claims

### Setup
```bash
ogx setup --scope project
ogx doctor --scope project
```

### Single agent
```bash
ogx launch -- -p "do something"
ogx status
ogx cancel
```

### Team orchestration
```bash
ogx team start --task "build the auth module" --workers 3 --tmux
ogx team status <name>
ogx team graph <name>
ogx team requeue <name> <task-id>
ogx team retry <name>
ogx team restart <name> --deep
ogx team attach <name>
ogx team cleanup <name> --force
```

### HUD
```bash
ogx hud --watch
ogx hud --json
ogx hud --tmux
```

### MCP server
```bash
ogx mcp serve
```

Exposes 14 tools: `omg_project_status`, `omg_team_list`, `omg_team_status`, `omg_hud_snapshot`, etc.

## Architecture

### Task planning
1. Planner breaks root task into sub-tasks with dependencies
2. Critic reviews for clarity and executability
3. Verifier checks coverage and dependency structure
4. Replans with feedback if rejected (up to `deepRestartMaxAttempts`)

### Lease tokens
- 5s heartbeat interval, 20s stale threshold, 60s hard reclaim
- Orphan recovery for dead workers

### File-backed state
All state under `.omg/state/teams/<team-name>/`: config, tasks, workers, events, artifacts.

## Repo layout

```
bin/              CLI shim
src/bin/          Runtime entrypoints (CLI + HTTP server)
src/cli/          Command routing (commander.js)
src/gemini/       Gemini CLI wrapper
src/harness/      Prompt execution harness
src/hud/          HUD render + state snapshots
src/mcp/          MCP server (14 tools)
src/notifications/ Discord / Slack / Telegram / Gmail
src/orchestration/ Task planning, critic/verifier, runtime
src/server/       HTTP API
src/state/        Schemas, stores, task-graph
src/team/         tmux orchestration
tests/            Test suite (vitest)
docs/             Docs
```

## HTTP API

```bash
npm run serve   # Port 8080
```

Routes: `/health`, `/meta`, `/v1/proof-map`, `/v1/runtime-brief`, `/v1/review-pack`, `/v1/runtime-scorecard`, `/v1/automation-guardrails`, `/v1/automation-budget-board`, `/v1/team-session-replay`, `/v1/doctor`.

## Configuration

Project config in `.omg/config.json`. Notifications via env vars (`OGX_SLACK_WEBHOOK_URL`, `OGX_TELEGRAM_BOT_TOKEN`, etc.).

## Safety

- Dangerous flags blocked unless explicitly allowed
- tmux execution uses argument escaping and strict naming validation
- Lease tokens prevent duplicate execution
- macOS/Linux first-class; Windows users should use WSL

## Commercialization Playbook

- [Monetization and GTM playbook](docs/monetization-playbook.md) frames this archived proof as a current buyer conversation, including offer ladder, channels, proof gates, and risk boundaries.

## Review Notes

- [Review guide](docs/reviewer-evidence-map.md) summarizes the archived role, proof surface, checks, and boundaries.
- [Quality notes](docs/quality-gate.md) lists local checks, CI surface, and presentation expectations for this archived repository.
- [Revenue growth model](docs/revenue-growth-model.md) maps the archived proof to an ethical diagnostic, workshop, pilot, or enablement path.
- [Enterprise readiness notes](docs/enterprise-readiness.md) outlines what must be refreshed before any serious buyer or production use.
- [Conversion UX model](docs/conversion-ux-model.md) maps the buyer path, behavioral design, UI/UX direction, pricing frame, and ethical conversion guardrails.

## Cloud + AI Architecture

This repository includes a neutral cloud and AI engineering blueprint that maps the current proof surface to runtime boundaries, data contracts, model-risk controls, deployment posture, and validation hooks.

- [Cloud + AI architecture blueprint](docs/cloud-ai-architecture.md)
- [Machine-readable architecture manifest](docs/architecture/blueprint.json)
- Validation command: `python3 scripts/validate_architecture_blueprint.py`
