# HelloDeploy Phase 5: Troubleshooting Library

## Purpose

Phase 5 creates practical troubleshooting content based on real deployment failures and common configuration mistakes.

The goal is to help users solve problems without immediately contacting support.

## Core Principle

Troubleshooting content should follow this sequence:

```text
Symptom
  ↓
Likely causes
  ↓
How to check
  ↓
How to fix
  ↓
How to verify
  ↓
Related docs
```

## Initial Troubleshooting Set

1. Dependency Installation Failed
2. Build Command Failed
3. Application Starts but Website Does Not Load
4. Application Port Is Incorrect
5. Missing Environment Variable
6. Application Keeps Restarting
7. Custom Domain Is Not Resolving
8. SSL Certificate Is Not Working
9. 502 Bad Gateway
10. 404 After Deployment
11. Root Domain Works but WWW Does Not
12. WWW Works but Root Domain Does Not
13. DNS Record Points to the Wrong Server
14. Application Works Locally but Fails on HelloDeploy

## Evidence Rule

Troubleshooting guidance must reflect actual HelloDeploy behavior.

Do not invent:

- log messages
- retry behavior
- timeout values
- health checks
- restart behavior
- DNS verification behavior
- SSL provisioning behavior

## Scope

Phase 5 content should be:

- practical
- concise
- task-focused
- easy to scan
- easy to link from errors and docs

## Future Extension

Later, add guides based on real support data, such as:

- repository access failure
- branch not found
- unsupported runtime
- out-of-memory
- storage full
- build timeout
- permission error
- database connection failure
- OAuth callback mismatch
