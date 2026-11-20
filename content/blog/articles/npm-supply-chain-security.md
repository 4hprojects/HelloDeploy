---
id: lh-npm-supply-chain
slug: npm-supply-chain-security
title: 'Software Supply Chain Attacks: The Hidden Risks in npm Packages'
description: How attackers reach your app through npm dependencies, what the 2025 Shai-Hulud worm showed, and the settings that reduce the risk for users and publishers.
category: web-security
tags: [npm, supply-chain, dependencies, nodejs, security]
authorId: henson-sagorsor
status: published
publishedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/npm-supply-chain-security.png
testedEnvironment:
  summary: >-
    Install scripts running on install, --ignore-scripts and the .npmrc setting, the express
    dependency count, npm ci refusing an out-of-sync lockfile, --before, --min-release-age, npm
    audit signatures, npm view on a missing package, and the package.json files allowlist were run
    in a disposable node:26-bookworm-slim container with Node.js 26.13.0 and npm 11.20.0. Trusted
    publishing and provenance need a registry account and CI, and were not run.
  verifiedAt: '2026-11-20'
references:
  - title: OWASP NPM Security Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html
  - title: GitHub Blog — Our plan for a more secure npm supply chain (22 September 2025)
    url: https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/
  - title: Socket — Updated and Ongoing Supply Chain Attack Targets CrowdStrike npm Packages (16 September 2025)
    url: https://socket.dev/blog/ongoing-supply-chain-attack-targets-crowdstrike-npm-packages
  - title: npm Docs — Config (ignore-scripts, before, min-release-age)
    url: https://docs.npmjs.com/cli/v11/using-npm/config
  - title: npm Docs — Trusted publishing for npm packages
    url: https://docs.npmjs.com/trusted-publishers
  - title: npm Docs — Generating provenance statements
    url: https://docs.npmjs.com/generating-provenance-statements
  - title: GitHub Changelog — npm trusted publishing with OIDC is generally available (31 July 2025)
    url: https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/
  - title: pnpm — Settings (minimumReleaseAge)
    url: https://pnpm.io/settings/dependency-resolution
---

A typical Node.js application contains far more code written by strangers than by you. In the test for this guide, installing one direct dependency, Express 4.21.2, added 69 packages to the project. Each of those packages has maintainers, accounts, and release processes you do not control, and any of them can become the way an attacker reaches your laptop, your CI pipeline, or your production server.

That is a **software supply chain attack**: instead of breaking into your application directly, the attacker compromises something your application depends on and lets you install it yourself.

## What you will learn

By the end of this guide you should be able to:

- **Explain** why npm dependencies are an attractive target and how install scripts make a malicious package dangerous before you run any of its code.
- **Identify** the main supply chain attack types: compromised maintainers, look-alike names, dependency confusion, and hallucinated packages.
- **Configure** npm to install reproducibly, skip install scripts, and wait before adopting brand-new versions.
- **Evaluate** a package before adding it, and know what `npm audit`, signatures, and provenance do and do not prove.
- **Respond** sensibly if a package you use is reported as compromised.

## Before you begin

You should be comfortable with `npm install`, `package.json`, and `package-lock.json`. Commands were tested with npm 11.20; some options shown here do not exist in older npm versions, so run `npm --version` first.

Practice in a throwaway folder or container. Never run a package you suspect is malicious on a machine that holds real credentials.

## Why npm packages are a target

Three properties of the npm ecosystem make it attractive to attackers:

1. **Deep dependency trees.** You choose a handful of packages; they choose the rest. A popular package with a compromised release reaches thousands of projects the next time they resolve versions without a lockfile or update it, because version ranges such as `^4.21.0` accept new minor and patch releases.
2. **Install scripts.** A package can declare `preinstall`, `install`, or `postinstall` scripts that npm runs during installation. In the test for this guide, a dependency's `postinstall` script ran during a plain `npm install` and wrote a file to disk. A malicious package does not need you to `require()` it; installing it is enough.
3. **Valuable credentials nearby.** Developer laptops and CI runners hold npm tokens, GitHub tokens, and cloud keys. Code that runs at install time can read environment variables and files, and send them elsewhere.

## Common attack types

### Compromised maintainer accounts

An attacker takes over a legitimate maintainer's account, often through phishing or a stolen token, and publishes a new version with malicious code. Because the package name is real and trusted, version ranges accept the update the next time dependencies are resolved. This is the hardest type to spot, because nothing about the name looks wrong.

### Look-alike names (typosquatting)

The attacker publishes a package whose name is one typo away from a popular one, and waits for someone to mistype an install command. Copy package names from the official documentation or repository rather than typing them from memory.

### Dependency confusion

The OWASP NPM Security Cheat Sheet describes this attack: if your company uses a private package called, say, `billing-utils` from an internal registry, an attacker publishes a public package with the same name and a higher version number. A misconfigured install may prefer the public one. The fix is to publish internal packages under a **scope** you own, such as `@yourcompany/billing-utils`, and configure that scope to resolve only from your private registry.

### Hallucinated package names

AI coding assistants sometimes suggest packages that do not exist, and attackers can register those names. [AI-Powered Cyberattacks: What Developers Need to Know](/blog/ai-powered-cyberattacks) covers the research. OWASP's advice is simple: run `npm view <package-name>` before installing an AI-suggested package. If the package does not exist, `npm view` fails, as it did in the test for a made-up name. If it does exist, that is not proof it is safe, because attackers register commonly hallucinated names: check when it was first published, who publishes it, and whether it links to a real repository.

## Case study: the Shai-Hulud worm (September 2025)

GitHub reports that on 14 September 2025 it was notified of an attack it called Shai-Hulud, a self-replicating worm in the npm registry. GitHub removed more than 500 compromised packages.

According to GitHub and the security firm Socket's analysis of affected packages:

- The malicious code was added as **post-install scripts** in real, popular packages, so it ran when developers and CI systems installed them.
- It searched the machine for **tokens and cloud credentials**, including npm and GitHub tokens, and sent them to an attacker-controlled endpoint.
- When it found an npm token with publish rights, it used it to add itself to **other packages that token could publish**, which is what made it a worm.
- It created unauthorized **GitHub Actions workflows** in repositories it could reach.

Socket's recommended response was to uninstall or pin known-good versions, rotate npm tokens and other exposed secrets, and audit CI agents and developer laptops.

Notice how each defense below breaks a link in that chain: no install scripts means no execution at install time; a waiting period means a malicious release is often caught before you install it; short-lived, narrowly scoped tokens mean a stolen token is useful for less time and can publish fewer packages.

## Defenses when you install packages

### 1. Install exactly what you tested

Commit `package-lock.json`, and use `npm ci` in CI and production rather than `npm install` (on production servers, `npm ci --omit=dev` also skips development tools). `npm ci` installs the exact versions in the lockfile, and it refuses to run when the lockfile and `package.json` disagree. In the test, adding a dependency to `package.json` without updating the lockfile made `npm ci` stop with:

```text
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
```

Review lockfile changes in pull requests. A new package appearing deep in the tree is worth a question.

### 2. Do not run install scripts by default

You can tell npm to skip dependency install scripts for one command or for a whole project:

```bash
npm ci --ignore-scripts
```

```bash
# .npmrc in the project
ignore-scripts=true
```

Both were tested, along with `npm install --ignore-scripts`: in each case the dependency was installed, but its `postinstall` script did not run. The OWASP cheat sheet recommends adding `ignore-scripts=true` to your project or global configuration.

There is a cost. Some packages, often ones that compile native code, need their install script to work and will fail to load without it. When that happens, check why the script is needed and whether the package is one you trust, rather than switching scripts back on for everything. The setting also affects your own project: `npm install` skips your `prepare` and `postinstall` scripts (some tools use these to set up Git hooks), and `npm run` skips automatic `pre` and `post` hooks such as `prebuild`.

### 3. Let new versions age before you install them

Malicious releases are often discovered and removed within days. npm has two options to avoid installing versions that are too new: `--before` has existed for a long time, while `--min-release-age` needs a recent npm 11 release.

```bash
# Only versions published at least 7 days ago
npm install --min-release-age=7

# Only versions published on or before a date
npm install --before=2026-11-01
```

In the test, `--min-release-age=365` installed Express 5.1.0 instead of the latest 5.3.0, and `--before=2020-01-01` installed Express 4.17.1. To make the waiting period a habit rather than a flag you must remember, put it in the project's `.npmrc`; the test confirmed that this applies to every install:

```bash
# .npmrc
min-release-age=7
```

pnpm offers the same idea through its `minimumReleaseAge` setting. A waiting period delays security fixes too, so allow urgent fixes through deliberately when an advisory requires it.

### 4. Evaluate a package before adding it

Before you add a dependency, spend two minutes on it:

- Run `npm view <name>` and check the repository link, recent versions, and maintainers.
- Open the repository. Is it active? Does the published package match the source?
- Ask whether you need it at all. A ten-line helper you write yourself has no maintainers to compromise.

### 5. Use the audit tools, knowing their limits

- `npm audit` reports dependencies with **known, published vulnerabilities**. It cannot detect a malicious release that nobody has reported yet.
- `npm audit signatures` checks that installed packages carry valid **registry signatures** (and provenance attestations where present). In the test project (Express 5.1.0 and its dependencies) it reported "68 packages have verified registry signatures". This shows a package came from the registry unaltered, not that its contents are safe.

### 6. Protect the credentials an install could reach

Assume that, one day, malicious code will run during an install. Limit what it can steal: give CI jobs only the tokens they need, use short-lived credentials, keep production secrets off developer laptops, and run installs in containers or CI runners that hold no long-lived secrets. [How to Protect Environment Variables and API Keys in Production](/blog/protect-environment-variables-api-keys) covers this in more depth.

## Defenses when you publish packages

If you maintain a package, you are part of other people's supply chain:

- **Turn on two-factor authentication**, preferably with a security key or passkey. GitHub's September 2025 plan for npm includes moving from one-time-code 2FA to FIDO-based methods, which phishing pages cannot capture.
- **Publish from CI with trusted publishing.** Trusted publishing (generally available since July 2025) lets a CI workflow publish without a long-lived npm token. It requires npm CLI 11.5.1 or later and Node.js 22.14.0 or later, and supports GitHub Actions, GitLab CI/CD, and CircleCI cloud runners. Once it works, set the package to disallow token-based publishing.
- **Publish with provenance.** Provenance links a package version to the source repository and build that produced it. npm's documentation is clear that it does not guarantee the package contains no malicious code; it makes tampering easier to detect.
- **Control what goes into the tarball.** A `files` list in `package.json` publishes only what you name. In the test, `npm pack --dry-run` included `index.js` and left out a `.env` file in the same folder.

## If a package you use is compromised

1. **Stop installing it.** Pin to a known-good version or remove it, and regenerate the lockfile.
2. **Find where it ran.** Check which laptops, CI runs, and servers installed the bad version, using lockfiles and CI logs.
3. **Rotate every secret those machines could read**: npm and GitHub tokens, cloud keys, and deployment credentials. Assume they were taken.
4. **Look for persistence.** Check for unexpected GitHub Actions workflows, new deploy keys, or new packages published under your account.

## Common mistakes and misconceptions

- **"`npm audit` is clean, so my dependencies are safe."** Audit only knows about reported vulnerabilities. A new malicious release is invisible to it at first.
- **"Popular packages are safe."** Popular packages are the most valuable to compromise, because one bad release reaches the most projects.
- **"Malicious code only runs if I import it."** Install scripts run during installation.
- **"Provenance means the code is trustworthy."** It proves where a package was built, not what it does.
- **"Pinning versions means I never need updates."** Pinned dependencies still collect known vulnerabilities. Update deliberately, from a reviewed lockfile.

## Check your understanding

Try to answer each question before reading the answers below.

1. Why was Shai-Hulud able to spread from package to package?
2. Your CI runs `npm install`. What two changes make installs reproducible and stop dependency install scripts from running?
3. A teammate says, "This package has verified registry signatures, so it can't be malicious." What is wrong with that?
4. Your company has an internal package named `auth-helpers`. How do you protect it from dependency confusion?

**Answers**

1. It ran as a post-install script, stole npm tokens from the machines that installed it, and used tokens with publish rights to inject itself into other packages.
2. Use `npm ci` with a committed lockfile, and add `--ignore-scripts` (or `ignore-scripts=true` in `.npmrc`).
3. Signatures show the package came from the registry unaltered. A maintainer's compromised account can still publish a correctly signed malicious version.
4. Rename it under a scope you own, such as `@yourcompany/auth-helpers`, and configure that scope to use only your private registry.

## Key takeaways

- Installing a package can run its code, so treat installs as code execution.
- Use a committed lockfile with `npm ci`, and turn off install scripts unless a package truly needs them.
- Let new versions age for a few days with `--min-release-age` or an equivalent setting.
- Audit, signatures, and provenance each answer a narrow question; none proves a package is safe.
- Limit the credentials an install can reach, and rotate them all if a compromised package ran.

## Related guides

- [How to Protect Environment Variables and API Keys in Production](/blog/protect-environment-variables-api-keys)
- [AI-Powered Cyberattacks: What Developers Need to Know](/blog/ai-powered-cyberattacks)
- [How to Secure a Node.js Application Before Production Deployment](/blog/secure-nodejs-before-production)

```

```
