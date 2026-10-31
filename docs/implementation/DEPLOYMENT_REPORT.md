# Deployment report

Production: https://hellodeploy.online. Deploys run through the autodeploy timer after `main` CI passes (`scripts/autodeploy.js` → `infrastructure/upgrade.sh`, which backs up first and rolls back automatically on failed verification).

Manual rollback: `sudo bash infrastructure/upgrade.sh --ref <previous sha>` from a clean `/opt/hellodeploy` checkout.

Verification after each merge: `npm run production:check -- https://hellodeploy.online --expected-sha <sha>`, then curl the changed routes.

| PR    | Merge SHA | Deployed         | Checks              | Notes                                                                          |
| ----- | --------- | ---------------- | ------------------- | ------------------------------------------------------------------------------ |
| 1     | `280a9bd` | 2026-10-31 03:13 | production:check 12 | Appeals section and Terms licence live                                         |
| 2 + 3 | `5bda4c0` | 2026-10-31       | production:check    | New pages 200; `/pricing`, `/faq`, `/help` 301                                 |
| 4     | `9295462` | 2026-10-31       | production:check    | Footer groups, `X-Robots-Tag`, JSON-LD on `/`                                  |
| 5     | `7adfae2` | 2026-10-31       | production:check 12 | `/account` 302 to sign-in with `X-Robots-Tag`; no donation section on `/pilot` |
| 6     | `5c8e793` | 2026-10-31       | production:check 12 | Content register, PR template, internal link test; all phases live             |
