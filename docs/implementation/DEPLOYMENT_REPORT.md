# Deployment report

Production: https://hellodeploy.online. Deploys run through the autodeploy timer after `main` CI passes (`scripts/autodeploy.js` → `infrastructure/upgrade.sh`, which backs up first and rolls back automatically on failed verification).

Manual rollback: `sudo bash infrastructure/upgrade.sh --ref <previous sha>` from a clean `/opt/hellodeploy` checkout.

Verification after each merge: `npm run production:check -- https://hellodeploy.online --expected-sha <sha>`, then curl the changed routes.

| PR  | Merge SHA | Deployed | Checks | Notes          |
| --- | --------- | -------- | ------ | -------------- |
| 1   | —         | —        | —      | Awaiting merge |
