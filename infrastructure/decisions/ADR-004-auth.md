# ADR-004: Authentication Strategy

**Status:** Accepted  
**Date:** 2026-06-19

## Context

HelloDeploy needs user authentication for its web UI and API. The platform must enforce email verification, support password recovery, protect privileged actions, and integrate with GitHub for repository access — without using GitHub as a sign-in provider.

## Decision

Use **email + password** authentication with server-side sessions.

- Sessions stored in MongoDB (TTL-indexed) — no JWT
- Passwords hashed with **bcrypt** (≥12 rounds) or **Argon2id**
- Sessions delivered via **HTTP-only, SameSite=Strict, Secure** cookies
- **GitHub OAuth** is for repository integration only — not for sign-in
- No third-party sign-in providers in V1 (Google, GitHub login deferred)

## Auth terminology (locked, must be used consistently):

- "Create Account" (not Sign Up / Register)
- "Sign In" (not Login / Log In)
- "Sign Out" (not Logout)
- "Forgot Password?" (not Reset Password as a menu item)
- "Verify Email"

## Rationale

- Session-based auth is simpler and more auditable than JWT for a server-rendered app
- Avoids OAuth complexity and third-party dependency for core identity
- GitHub as integration-only prevents users from losing platform access if GitHub is unavailable
- Consistent terminology reduces confusion across the Hello ecosystem

## Consequences

- CSRF protection required for all state-mutating requests
- Session rotation required after login and privilege changes
- Rate limiting required on all auth endpoints (registration, login, password reset, resend)
- Recent-auth checks required for privileged operations (ownership transfer, secret replacement, etc.)
