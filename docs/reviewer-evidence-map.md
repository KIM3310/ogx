# Review Guide - ogx (oh-my-gemini)

Updated: 2026-05-30

This repository is archived as a supporting proof. Review it for the reusable pattern, domain evidence, and portfolio relationship; do not treat it as the current flagship unless it is explicitly revived.

## Summary

| Field | Notes |
|---|---|
| Repository | `ogx` |
| Status | Archived supporting repository |
| Lane | CLI orchestration and team automation layer |
| Primary reader | Developer platform teams, AI tool builders, DevOps leads, and agencies running multi-agent workflows. |
| Why it exists | Teams need repeatable orchestration, visibility, and cancellation controls when AI CLI work moves beyond solo prompts. |
| Stack | TypeScript/JavaScript, Docker |

## Open First

1. Read the README archived-status note and relationship to active repositories.
2. Inspect `docs/monetization-playbook.md` for the buyer lane and offer ladder.
3. Use the commands below to confirm the proof surface still has a review path.
4. Check CI workflows before making quality claims.
5. Keep the archived status visible in any portfolio conversation.

## Checks

| Purpose | Command |
|---|---|
| Full local gate | `npm run verify` |
| Test suite | `npm test` |
| Production build | `npm run build` |

## CI

- .github/workflows/architecture-blueprint.yml
- .github/workflows/ci.yml
- .github/workflows/dependency-review.yml
- .github/workflows/pages-auto-deploy.yml
- .github/workflows/repository-health.yml
- .github/workflows/repository-surface.yml
- .github/workflows/secret-scan.yml

## Evidence

- Tests and build pass
- Doctor route exposes dependency freshness
- Archived status points to active orchestration repos

## Commercial Notes

| Possible offer | Working price assumption | Scope |
|---|---|---|
| Workflow automation setup | $3k-$15k | Install task graph, team sessions, and review pack for a delivery team. |
| Internal developer tool pilot | $20k-$80k | Adapt orchestration, MCP, and HUD surfaces to a real engineering workflow. |
| Sponsored integration or pro plugin | $2k-$20k/month | Fund connectors, hosting, support, or branded distribution. |

## Boundaries

- Do not market archived code as fully supported SaaS
- Keep secret-handling guidance conservative
- Avoid implying autonomous completion without human review

## Useful Metrics

- Setup conversions
- Active team sessions
- Task completion reliability
- Integration sponsors
