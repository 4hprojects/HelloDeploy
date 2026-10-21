# Phase 2: Build Strategy Abstraction and Python

## In scope

Python 3 supported maintained release(s) verified against official lifecycle at implementation time; `requirements.txt` and `pyproject.toml`; Flask, FastAPI, Django via approved templates; configurable application module and internal port.

## Tasks

1. Extract common strategy selection/validation/build result interface with unit tests. Maintain unchanged release lifecycle.
2. Implement framework detection using dependency and package metadata; never assume `app.py`/`main.py` alone identifies a framework.
3. Validate Python version and dependency installer against approved list. Use lockfiles where available; fail with clear action otherwise.
4. Build approved multi-stage Python runtime image, install as non-root, bind `0.0.0.0` _inside_ container while host bind remains loopback.
5. Suggested defaults only after verification: FastAPI `uvicorn module:app`, Flask `gunicorn`, Django `gunicorn project.wsgi:application`; require confirmation of module identifier.
6. Django: document `ALLOWED_HOSTS`, static collection, migrations and external DB. Avoid automatically applying destructive schema migrations during deploy; make migration operations explicitly authorized and gated.
7. No arbitrary user-defined pre-deploy shell commands in public free tier. Respect image limits/build timeouts and dependency supply-chain checks.
8. UI: `Python > Flask/FastAPI/Django`, version, entry point, port, health URL, env vars.
9. Add integration fixtures for each Python framework and regressions for the Node stack.

## Acceptance

- All three frameworks deploy from fixture repos with healthy routes and correct restart behavior.
- Broken entry point, version mismatch, dependency failure and failed health checks display actionable errors.
- Rollback and secret redaction work; CPU/RAM quotas apply.
- Persist status, evidence and commit before next phase.
