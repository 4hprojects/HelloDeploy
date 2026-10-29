# Phase Tracker and Resource Estimates

All phases initially `NOT STARTED`. Phase SHAs are `feat/learning-hub` commits, squashed into `main` as `3309c51`. Claude Code updates this file after each completed phase, including actual SHA, tests and findings. Never fabricate progress.

| Phase | Focus                 | Initial status                                                                           | Gate                                                                  |
| ----- | --------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0     | Audit                 | DONE 2026-10-29 (`feat/learning-hub`, baseline `2b54d22`) — see PHASE_00_AUDIT_REPORT.md | Report (review gate waived by CLAUDE_CODE_AUTONOMOUS_CONTINUATION.md) |
| 1     | Markdown architecture | DONE 2026-10-29 (`72fdc8f`)                                                              | Content validation tests                                              |
| 2     | Public UI             | DONE 2026-10-29 (`f80db0f`)                                                              | Responsive/a11y tests                                                 |
| 3     | Views and sharing     | DONE 2026-10-29 (`012ad25`)                                                              | Dedup/share tests                                                     |
| 4     | Comments core         | DONE 2026-10-29 (`5c840f5`)                                                              | Disabled route and threading tests                                    |
| 5     | Moderation/reporting  | CODE DONE 2026-10-29 (`5c840f5`); live comments blocked, see BLOCKERS_AND_HANDOFF.md     | Fail-closed/adversarial suite                                         |
| 6     | SEO, GA4, AdSense     | DONE 2026-10-29 (`8b5c734`); GA4 and AdSense off                                         | Rendered SEO and privacy review                                       |
| 7     | Five tutorials        | DONE 2026-10-29 (`4fb5549`) — see ARTICLE_VERIFICATION.md                                | Editorial and technical checks                                        |
| 8     | Release QA            | DEPLOYED 2026-10-29 as `3309c51` (PR #165); hub flags off                                | Regression and release report                                         |

## Rough pre-audit effort (non-binding)

0: 3–6 h; 1: 6–10 h; 2: 8–14 h; 3: 5–9 h; 4: 8–14 h; 5: 12–22 h; 6: 7–12 h; 7: 15–25 h; 8: 8–15 h. Total 72–127 developer hours. Actual agent wall-time and production rollout cannot be promised.

## Rough cumulative tokens across agent sessions (not billed or guaranteed)

0: 20–45K; 1: 25–50K; 2: 30–65K; 3: 15–35K; 4: 30–65K; 5: 40–90K; 6: 25–50K; 7: 35–75K; 8: 30–70K. Total ~250–545K. Token estimates change with repo scope and tests; log measured usage only when available.

## Reporting

After each phase append date, branch, HEAD SHA, files, completed requirements, tests with results, known gaps, performance/security notes, rollback implications, token estimate/measurement, next decision. Never silently mark a phase complete with missing P0 gates.
