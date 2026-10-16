# Estimates, Token Budgets, Dependencies and Decisions

## Planning estimates (NOT guarantees)

Assumptions: one experienced engineer or Codex-assisted developer, existing CI works, limited access to isolated test host, product scope as written, no major refactor. Calendar time depends on review, operational access, cloud resources, build isolation procurement and hidden regressions.

| Phase                           | Engineering effort | Approx. elapsed time\* | Codex context/token budget\*\* | Main dependency                  |
| ------------------------------- | -----------------: | ---------------------: | -----------------------------: | -------------------------------- |
| P0A audit                       |             8–16 h |           2–4 workdays |                        20k–50k | repo + test access               |
| P0B current pipeline validation |            16–32 h |           3–6 workdays |                        35k–90k | nonproduction Docker host        |
| P1 Next.js                      |            20–40 h |           4–8 workdays |                       45k–110k | P0 gates                         |
| P2 strategy + Python            |            40–72 h |          8–14 workdays |                      100k–220k | existing worker refactor         |
| P3A PHP                         |            24–48 h |           5–9 workdays |                       60k–140k | P2 contracts                     |
| P3B Java                        |            24–48 h |           5–9 workdays |                       60k–140k | P2 contracts                     |
| P4 Dockerfile + OCI             |           64–120 h |         12–24 workdays |                      140k–300k | isolated builder/security review |
| P5 Compose + quota enhancements |           80–160 h |         16–32 workdays |                      180k–380k | P4 security + orchestration ADR  |

- Elapsed estimates are sequential single-engineer equivalents and include development/testing/review under reasonable conditions. Some P3 work can run concurrently. P0–P3 total roughly 132–256 engineering hours, or 5–10 working weeks at 25–30 productive engineering hours per week. P0–P5 total roughly 276–536 hours, or 10–22 working weeks at that same pace, excluding waiting on infrastructure/security approval. Re-estimate after P0; do not promise dates.

\** Tokens are per-phase aggregate *working budgets\* for Codex input+output across many sessions, not guaranteed consumption, price, or a context window. Actual use depends on chosen model, codebase size, tool output, retries and tests. Log real provider usage if accessible; otherwise mark `unavailable`, never invent counts. Keep prompts narrowly scoped and do not paste whole repository repeatedly.

## Resource needs

- Existing development: repo/CI, MongoDB/Redis test services, Docker integration test environment, disposable example repositories, storage for images, Playwright/browser for UI flows.
- Nonproduction deployment test host: initially recommended >= 4 vCPU, >= 8GB RAM, >= 50GB available SSD as a **planning starting point**, not a measured requirement; larger for Java/Next builds. Retain 8GB Dell pilot host for limited validation, avoid concurrent heavy builds.
- P4: separately isolated ephemeral builder VM/agent (not shared production Docker daemon), strict network and resource policy, registry credential storage, scanner and review time.
- P5: dedicated storage/backup/restore testing, multi-service network tests, resource telemetry; preferably >=16GB lab machine for concurrent service simulations (proposal pending benchmark).
- Operations: PR review, incident response, backup restore and security approvals; don't count infrastructure subscriptions as zero-cost.

## Decisions preselected for Codex

- Delivery: feature branch, PR-first, no automatic main merge or production deploy.
- Rollout: new strategies default OFF, release in phases and enable by approved cohorts.
- P0–P3 first public shipping candidate; P4 and P5 separate follow-up releases if security and resource requirements delay them.
- No built-in databases in initial implementation. Use external application DB connections.
- Restricted Compose, not arbitrary Compose.
- Framework auto-detection may recommend, never bypass owner confirmation or administrator policy.
- Existing project runtime behavior and quota policies must stay backwards compatible.

## Decisions needing owner approval before their relevant gates

1. What nonproduction host and isolation method will be provided for untrusted Dockerfile builds? (P4 blocker)
2. Whether PHP WordPress persistent storage is in initial PHP release or separate tracked enhancement. (default defer)
3. Which pricing tiers and resources may be advertised, after benchmarking. (default no pricing changes)
4. Whether to split final P0–P3 and P4–P5 deliveries into separate PRs. (default yes if safety/readiness differs)

## Sources

- Repository: https://github.com/4hprojects/hellodeploy
- Repository docs: `docs/PLATFORM_ARCHITECTURE.md`, `docs/PRIORITIES.md`, `docs/USER_GUIDE.md`
- Next.js deploy: https://nextjs.org/docs/app/getting-started/deploying
- Next.js self-host: https://nextjs.org/docs/app/guides/self-hosting
- Docker Next.js guide: https://docs.docker.com/guides/nextjs/
- Docker build secrets: https://docs.docker.com/build/building/secrets/
- Docker Compose production: https://docs.docker.com/compose/how-tos/production/
- Docker Engine security: https://docs.docker.com/engine/security/
