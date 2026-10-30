# Phase 5: Account management

Audit then refine: registration/sign-in/recovery, session policy, profile, connected GitHub identity and permission revocation, application stop/deletion, account closure and user-data rights, suspension notices and fair appeals, additional MFA feasibility.

## Rules
- GitHub disconnect must not silently delete apps; explain update/deploy limitations.
- Project deletion must distinguish runtime stop, files/logs/env cleanup, domains, external databases and backups; confirm destructive actions.
- Account deletion needs identity verification, realistic retention/backups exceptions, receipts/status and meaningful user notice. No promise of instant universal erasure.
- Admin action on accounts and apps should be RBAC-protected, logged, justified and appealable except immediate security containment.
- Mark MFA and suspicious-login alerting as planned unless implemented/tested.
- Accessible mobile Account Settings grouping and appropriate tests.

Document risks of changing authentication or deletion semantics and migrate only with separate approval if destructive.
