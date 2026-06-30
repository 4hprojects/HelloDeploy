# Worklog

## Worklog and Push Policy

- Status: Completed
- Started: 2026-06-30T20:47:44+08:00
- Completed: 2026-06-30T20:47:44+08:00

### Rule

- Before any implementation, create or update a markdown worklog entry for the priority, phase, or task.
- Each worklog entry must include started and completed timestamps.
- When a priority, phase, or task is completed, run the relevant verification, commit the completed work, and push it to the remote.

## P3 MongoDB Connection Check

- Status: Completed
- Started: 2026-06-30T21:01:49+08:00
- Completed: 2026-06-30T21:02:34+08:00

### Checklist

- [x] Test MongoDB connection using the project's configured environment.
- [x] Record the result without exposing credentials.
- [x] Run verification for the documentation update.
- [x] Commit and push after completion.

### Result

- Initial sandboxed attempt could not resolve the MongoDB Atlas SRV record because network DNS access was blocked.
- Escalated credential-safe check succeeded with `readyState: 1`.
- Connected database: `hellodeploy_db`.
- Connected topology: `ReplicaSetWithPrimary`.

## P3 Real Local Integration Smoke

- Status: Completed
- Started: 2026-06-30T21:07:17+08:00
- Completed: 2026-06-30T21:11:50+08:00

### Checklist

- [x] Confirm configured MongoDB is reachable.
- [x] Confirm Redis availability.
- [x] Start the web process with the real `.env`.
- [x] Confirm `/health` responds from the running server.
- [x] Smoke-test public/auth pages against the running server.
- [x] Check worker startup path where local services permit.
- [x] Record blockers separately from passing checks.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- MongoDB check passed against the configured environment: database `hellodeploy_db`, topology `ReplicaSetWithPrimary`.
- Redis check passed against `127.0.0.1:6379` with `PONG`.
- Web process started with `npm run start -w @hellodeploy/web` and connected to MongoDB.
- `/health` returned `200 OK` with JSON status `ok`.
- HTTP smoke checks returned `200 OK` for `/`, `/auth/sign-in`, `/auth/create-account`, `/auth/forgot-password`, `/terms`, and `/privacy`.
- `/dashboard` returned the expected unauthenticated `302` redirect to `/auth/sign-in?returnTo=%2Fdashboard`.
- Worker process started with `npm run start -w @hellodeploy/worker`, connected to MongoDB and Redis, and reached `ready — listening for jobs`.
- Worker shut down cleanly on `SIGINT`.

### Notes

- Local socket probes require elevated tool access in this environment; sandboxed `curl` and Redis checks could not open localhost sockets.
- No browser automation dependency is installed in the repo, so this pass used real HTTP integration smoke checks rather than Playwright/Puppeteer rendering.
- `/auth/register` returned `404`; this is expected because the implemented registration route is `/auth/create-account`.

## P4 User Guide and FAQ

- Status: Completed
- Started: 2026-06-30T21:15:23+08:00
- Completed: 2026-06-30T21:17:29+08:00

### Checklist

- [x] Create a user guide for the main HelloDeploy usage flow.
- [x] Create an FAQ for users and project owners.
- [x] Add a root README that links to the user-facing docs.
- [x] Keep guidance aligned with current V1 scope and implemented routes.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added `README.md` with links to user-facing and project documentation.
- Added `docs/USER_GUIDE.md` covering account setup, projects, GitHub connection, detection, environment variables, approval, deployment, rollback, roles, custom domains, limits, and troubleshooting.
- Added `docs/FAQ.md` covering common user, project, GitHub, deployment, configuration, domain, limit, and support questions.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P2 Browser Smoke Test

- Status: Completed
- Started: 2026-06-30T20:17:34+08:00
- Completed: 2026-06-30T20:28:41+08:00

### Checklist

- [x] Start the web app locally.
- [ ] Confirm `/health` responds.
- [x] Smoke-test public pages.
- [x] Smoke-test authenticated/admin pages where local data permits.
- [x] Smoke-test project pages where local data permits.
- [x] Validate changed interactions where local data permits.
- [x] Run final verification commands.

### Findings

- Web startup could not complete because local MongoDB was unavailable at `127.0.0.1:27017`.
- Docker is installed, but this user cannot access `/var/run/docker.sock`, so temporary MongoDB/Redis containers were not available.
- Used direct EJS render smoke tests with mock admin/project data as a fallback.
- Found and fixed invalid partial include paths in admin/project/dashboard templates.
- Render smoke covered public landing/auth pages, admin pages, project pages, sidebar output, pagination markup, and `data-confirm` markup.

### Verification

- Direct EJS render smoke test passed for main changed public/admin/project templates.
- Direct EJS render smoke test passed for auth templates through the auth layout.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm test` passed.
