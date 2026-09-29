# Phase 4 Privacy and Sanitization Rules

## Purpose

Case studies should be detailed without exposing sensitive system information.

## Always Remove or Mask

- passwords
- API keys
- private tokens
- private keys
- database passwords
- full database connection strings
- deploy hook URLs
- session tokens
- OAuth client secrets
- service role keys
- private repository credentials
- confidential user data

## Platform redaction is not sanitisation

Deployment logs are scanned for things that look like credentials — GitHub, AWS
and npm tokens, bearer headers, JSON web tokens, private key blocks, and
assignments such as `password=` — and those are replaced with `[REDACTED]`.

That is pattern matching, not knowledge of the values a project set. It does not
catch a database URL carrying its password inline, or an application printing its
own configuration at startup:

```text
DATABASE_URL=postgres://user:hunter2@db.example.com:5432/app
{ STRIPE_SECRET: 'rk_live_51H8xyz' }
```

So a log that appears redacted may still contain secrets. Read every line of any
log excerpt or screenshot before publishing it, and treat anything that was
exposed as leaked and rotate it. Never assume a log is safe because the platform
redacts.

## Review Before Publishing

Check screenshots for:

- email addresses
- account IDs
- private repository names
- project IDs
- IP addresses
- internal hostnames
- file paths
- deployment identifiers
- logs containing environment values

Some of these may be safe, but review them intentionally.

## Environment Variable Screenshots

Preferred:

```text
DATABASE_URL        ••••••••••••
APP_URL             ••••••••••••
AUTH_SECRET         ••••••••••••
```

Do not show values.

## Logs

Sanitize logs before publishing.

Remove:

- connection strings
- tokens
- secret query parameters
- authentication headers
- user data

## DNS

Public DNS values may be visible publicly already, but do not assume every infrastructure detail should be emphasized.

Show only what is needed to explain the case study.

## User Data

Never use real end-user information as deployment examples.

Use:

- synthetic values
- test accounts
- anonymized records
