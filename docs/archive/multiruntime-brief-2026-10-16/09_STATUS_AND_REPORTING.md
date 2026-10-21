# Mandatory Per-Priority and Per-Phase Updates

## Required files tracked in feature branch

- `docs/multi-runtime/STATUS.md`: dashboard updated on every priority completion or blocker.
- `docs/multi-runtime/CHANGELOG.md`: dated, immutable-style chronological updates.
- `docs/multi-runtime/DECISIONS.md`: ADR-lite decisions with rationale and alternatives.
- `docs/multi-runtime/EVIDENCE/`: short markdown evidence reports with command/result, fixture, git SHA and date. Do not commit live credentials, raw private logs, or sensitive data.

## Status schema (copy for every phase)

```
Phase: P0 / P1 / P2 / P3A / P3B / P4 / P5
Priority item:
State: NOT_STARTED | IN_PROGRESS | BLOCKED | TESTED | COMPLETE
Owner: Codex + human reviewer
Base commit / feature commit:
Started / finished (UTC and PHT):
Scope completed:
Changed files:
Tests (exact command, pass/fail counts):
Smoke evidence / fixture SHA:
Compatibility impact:
Security & resources impact:
Remaining risks / blockers:
Estimated vs actual hours:
Estimated vs measured tokens (input/output, if available):
Next action:
PR link / review status:
```

## Reporting automation in agent workflow

Codex must update STATUS and append CHANGELOG **immediately after finishing any priority item**, including failed or blocked ones, then again on phase completion. If work occurs across sessions, open by reading STATUS, do not reimplement finished items, and verify branch + HEAD. Commit the status and evidence in the same phase PR; do not wait until end of project. Provide a compact user-visible message after each phase: what changed, tests, risks, tokens, expected next work. These instructions ask the executing agent to report; they do not create a background scheduled service.

## Initial status template

| Phase | Topic                        | State       | Gate                              |
| ----- | ---------------------------- | ----------- | --------------------------------- |
| P0A   | Baseline audit               | NOT_STARTED | Audit completed                   |
| P0B   | Existing runtime reliability | NOT_STARTED | Release/rollback verified         |
| P1    | Next.js                      | NOT_STARTED | SSR + static + regression         |
| P2    | Python + strategy interface  | NOT_STARTED | Three framework fixtures          |
| P3A   | PHP                          | NOT_STARTED | PHP + Laravel                     |
| P3B   | Java                         | NOT_STARTED | Maven + Gradle                    |
| P4A   | Dockerfile                   | NOT_STARTED | isolated build threat model       |
| P4B   | OCI registry                 | NOT_STARTED | pinned digest, auth + policy      |
| P5    | Restricted Compose + quotas  | NOT_STARTED | multi-service safety and rollback |

## PR protocol

One persistent draft PR is acceptable if all phases are on a single feature branch. Prefer reviewable sub-PRs targeting a dedicated integration branch if change volume becomes unreviewable. Do not merge experimental P4/P5 functionality into a production-release PR unless its independent security gates pass; feature flags alone do not excuse unsafe unreachable code paths.
