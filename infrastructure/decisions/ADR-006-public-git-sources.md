# ADR-006: Public Git Repository Sources

**Status:** Accepted
**Date:** 2026-07-14

## Context

HelloDeploy originally required a GitHub App installation for every repository. This provides scoped private-repository access and signed push webhooks, but adds unnecessary setup for users who want to deploy publicly readable code manually.

A repository URL is untrusted network input. Supporting arbitrary Git URLs would expand HelloDeploy into credential management, multi-provider behavior, SSRF protection across arbitrary hosts, redirect policy, SSH key handling, and webhook-less update detection. That scope is not justified by the initial usability requirement.

## Decision

Add a second repository source mode named `PUBLIC_GIT` alongside the existing `GITHUB_APP` mode.

- Initial Public Git support is limited to canonical `https://github.com/owner/repository[.git]` URLs.
- Public Git requires no repository credential and supports Manual or Approval Required deployment only.
- Private repositories and Automatic deployment continue to require the GitHub App.
- The web process validates and records normalized public metadata; it never executes Git.
- The worker performs a credential-free exact-commit clone using reconstructed canonical values.
- Existing GitHub App records and workflows remain backward compatible.
- GitLab, Bitbucket, arbitrary Git hosts, SSH, embedded credentials, polling, pull-request previews, submodules, and Git LFS credentials remain deferred.

Detailed behavior and acceptance gates are defined in the [Public Git Repository Connection Specification](../../docs/PUBLIC_GIT_REPOSITORY_SPEC.md).

## Rationale

- Matches the user's mental model for deploying public code without weakening private-repository access.
- Keeps automatic deployments tied to authenticated, signed webhook relationships.
- Preserves the web/worker privilege boundary and exact-commit build contract.
- Uses an exact host allowlist and canonical reconstruction to keep SSRF and Git argument risks bounded.
- Leaves a provider-extensible data model without claiming unimplemented multi-provider support.

## Consequences

- Repository fields currently required for every record become conditionally required by source type.
- Detection, commit resolution, deployment creation, and worker clone logic must route through a source adapter.
- Unauthenticated GitHub metadata limits become an operational constraint with bounded retry behavior.
- Public Git projects cannot enable Automatic deployment until converted to an authorized GitHub App source.
- New migration, SSRF, redaction, clone, authorization, accessibility, and real-deployment tests are required.
- User documentation distinguishes the implemented source workflow from pending live deployment evidence.

## Approval Gate

The owner approved implementation on 2026-07-14. Change this ADR to **Superseded** if a later accepted decision introduces a broader source-provider architecture.
