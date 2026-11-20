---
id: lh-ai-agent-security
slug: ai-agent-security-deployment
title: 'AI Agent Security: The Risks of Automated Coding and Deployment'
description: How AI coding agents can be hijacked or over-trusted, the lethal trifecta, OWASP's agentic risks, and the controls that keep agents useful and contained.
category: web-security
tags: [ai, agents, prompt-injection, least-privilege, ci-cd]
authorId: henson-sagorsor
status: draft
publishedAt: '2026-11-20'
difficulty: intermediate
commentsEnabled: true
adEligible: false
socialImage: /assets/blog/social/ai-agent-security-deployment.png
references:
  - title: OWASP — LLM06:2025 Excessive Agency
    url: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
  - title: OWASP — Top 10 for Agentic Applications for 2026 (December 2025)
    url: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
  - title: OWASP — LLM01:2025 Prompt Injection
    url: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
  - title: 'Simon Willison — The lethal trifecta for AI agents: private data, untrusted content, and external communication (16 June 2025)'
    url: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
  - title: 'NIST — Technical Blog: Strengthening AI Agent Hijacking Evaluations (17 January 2025)'
    url: https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations
  - title: Claude Code Docs — Security
    url: https://code.claude.com/docs/en/security
  - title: GitHub Docs — Risks and mitigations for GitHub Copilot cloud agent
    url: https://docs.github.com/en/copilot/concepts/agents/coding-agent/risks-and-mitigations
---

AI coding agents can now read a repository, run commands, install packages, open pull requests, and in some setups deploy to production. That is a lot of power to hand to software that takes instructions in plain language from whatever text it reads. A comment in an issue, a line in a README, or a paragraph on a web page can all become instructions to an agent that was only meant to read them.

This guide explains how agents get misused, using published research and the risk lists OWASP maintains, and turns it into controls you can apply whether you use an agent in your terminal, in your editor, or in your CI pipeline.

## What you will learn

By the end of this guide you should be able to:

- **Explain** why giving an AI model tools and credentials changes its risk, and what agent hijacking is.
- **Identify** the "lethal trifecta" of capabilities that makes data theft possible.
- **Recognize** OWASP's excessive agency risk and the categories in its Top 10 for Agentic Applications.
- **Apply** containment controls: least privilege, isolation, network limits, human approval, and review.
- **Evaluate** whether an agent setup in your own workflow is safe enough for the access it has.

## Before you begin

A few terms:

- An **AI agent** is a large language model (LLM) connected to **tools**, such as a shell, a file editor, a browser, or an API, so it can take actions in steps toward a goal.
- **Prompt injection** is when text the model reads changes its behavior in ways you did not intend. **Indirect** prompt injection hides the instructions in content the model processes, such as a web page or file. [AI-Powered Cyberattacks: What Developers Need to Know](/blog/ai-powered-cyberattacks) introduces it.
- **Agent hijacking**, in NIST's definition, is a type of indirect prompt injection in which an attacker inserts malicious instructions into data that an AI agent may ingest.

## What changes when a model can act

A chat assistant that gives bad advice wastes your time. An agent that follows bad instructions can run them. Three properties make the difference:

1. **Agents read untrusted text as part of their work.** Issues, pull request comments, dependency source code, documentation, error messages, and web search results can all be written by strangers.
2. **Agents have tools.** A shell can delete files, push code, or send data over the network.
3. **Agents carry your credentials.** An agent in your terminal runs with your user account's access; an agent in CI runs with the pipeline's tokens.

No model reliably tells the difference between the instructions you gave it and instructions hidden in the text it reads. OWASP's prompt injection guidance states that it is unclear whether fool-proof prevention exists. So the security question is not "can this agent be tricked?" but "**what happens when it is?**"

## The evidence

NIST's Center for AI Standards and Innovation published an evaluation of agent hijacking on 17 January 2025, using the AgentDojo research framework. Against the model it tested, new red-team attacks raised the success rate from 11% for the strongest baseline attack to 81%. When attackers were allowed 25 attempts per task, the average success rate rose from 57% to 80%. The injected tasks included remote code execution, database exfiltration, and automated phishing. These are research results on a test framework, not measurements of any particular product, but they show that repeated attempts raise success sharply, so plan for some attacks to get through.

Attackers also use agents themselves: Anthropic reported in 2025 that a criminal and a state-sponsored group used its coding agent, Claude Code, to automate intrusions, as covered in the [AI-powered cyberattacks guide](/blog/ai-powered-cyberattacks).

## The lethal trifecta

On 16 June 2025, the developer Simon Willison described a simple test for when an agent can be turned against you. The danger appears when one agent combines all three of:

1. **Access to your private data**, such as source code, secrets, or customer records.
2. **Exposure to untrusted content**, such as issues, web pages, emails, or dependency code that an attacker could have written.
3. **The ability to communicate externally**, such as making network requests, opening links, or posting comments that someone else can read.

With all three, an attacker can plant instructions in content the agent reads, telling it to collect private data and send it out. Willison's advice is to avoid combining all three, because there is still no reliable way to prevent the injection itself.

This is a useful design tool. You usually cannot remove the first two from a coding agent; it needs your code, and it reads things you did not write. **Limiting external communication** is often the leg you can control. That means more than a network firewall: pull request descriptions, issue comments, and any allowlisted host the agent can post to are also ways out, so limit what the agent can publish as well as where it can connect.

## OWASP's view: excessive agency

OWASP lists **Excessive Agency** (LLM06:2025) in its Top 10 for LLM Applications. It traces the problem to three root causes:

- **Excessive functionality**: the agent has tools it does not need, such as a shell when it only needed to read files.
- **Excessive permissions**: its tools can do more than the task requires, such as a database connection that can drop tables.
- **Excessive autonomy**: high-impact actions happen without independent verification or approval.

OWASP's mitigations follow directly: minimize the tools and their permissions, avoid open-ended tools such as an unrestricted shell where possible, run tools with the user's own limited access, require human approval for high-impact actions, and enforce authorization in the downstream systems rather than relying on the model to decide what is allowed.

In December 2025 OWASP also published the **Top 10 for Agentic Applications for 2026**, a list specific to agents. Its categories are:

| ID    | Risk                                 |
| ----- | ------------------------------------ |
| ASI01 | Agent Goal Hijack                    |
| ASI02 | Tool Misuse and Exploitation         |
| ASI03 | Identity and Privilege Abuse         |
| ASI04 | Agentic Supply Chain Vulnerabilities |
| ASI05 | Unexpected Code Execution (RCE)      |
| ASI06 | Memory & Context Poisoning           |
| ASI07 | Insecure Inter-Agent Communication   |
| ASI08 | Cascading Failures                   |
| ASI09 | Human-Agent Trust Exploitation       |
| ASI10 | Rogue Agents                         |

You do not need to memorize it. For a developer using a coding agent, the most relevant are goal hijacking (injected instructions), tool misuse, privilege abuse (the agent's credentials), supply chain (packages and plugins the agent pulls in), unexpected code execution, and human-agent trust exploitation, where an agent's fluent, confident output leads people to approve actions without independent validation.

## Realistic failure scenarios

- **The poisoned issue.** An agent is asked to fix a bug described in a public issue. The issue contains hidden instructions to read `.env` and include its contents in a pull request description. The agent has private data, read untrusted content, and can post publicly: the trifecta.
- **The production shortcut.** An agent working on a database migration has production credentials in its environment "for testing", and runs a destructive command against the wrong database.
- **The hallucinated dependency.** An agent adds a package that does not exist on the registry yet, or adds a look-alike that does. [Software Supply Chain Attacks in npm](/blog/npm-supply-chain-security) explains the risk.
- **The rubber-stamp review.** An agent opens a large pull request that mostly looks right. A reviewer skims it and merges, and a subtle change to an authorization check ships with it.
- **The edited instructions file.** Agents read project files that configure their behavior and permissions, such as `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, or `.claude/settings.json`. A pull request that changes those files changes what every future agent session is allowed to do.

## Controls that contain an agent

### 1. Give the agent its own, minimal credentials

Never give a coding agent production credentials. Use separate development keys, a read-only database user where possible, and tokens scoped to one repository. In CI, give the agent's job the narrowest `GITHUB_TOKEN` permissions it needs; [GitHub Actions Security](/blog/github-actions-security) shows how. If a task truly needs production access, have the agent prepare the change and let a person or a reviewed pipeline apply it.

### 2. Isolate where it runs

Run agents in a container, dev container, or virtual machine, rather than directly on a laptop that holds your SSH keys, cloud credentials, and browser sessions. The Claude Code security documentation, for example, notes that its working-directory restriction is a permission prompt, so an approved shell command can still write anywhere your user account can; it recommends turning on its sandbox (`/sandbox`) to run shell commands with file system and network isolation, or running the whole agent inside a dev container.

### 3. Restrict outbound network access

Limiting where the agent can connect breaks the external communication leg of the trifecta. Allow the package registry and the services the task needs; block everything else. GitHub documents that it restricts its Copilot cloud agent's internet access with a firewall.

### 4. Keep a human in the loop for high-impact actions

Merges, deployments, deletions, payments, and permission changes should need a person's approval. GitHub's Copilot cloud agent is a useful reference design: it can push only to its own branch, it cannot approve or merge its pull requests, its draft pull requests must be reviewed and merged by a human, and CI workflows do not run on its changes until someone with write access approves them.

### 5. Enforce permissions outside the model

A system prompt that says "never delete production data" is not a security control. Use OWASP's principle of complete mediation: the database, API, or cloud account must refuse actions the agent's identity is not allowed to perform, whatever the model decides.

### 6. Review agent output as untrusted code

Treat an agent's pull request like one from a new contributor you have not met: run CI, code scanning, secret scanning, and dependency review on it, and read the diff, especially anything touching authentication, authorization, configuration, workflows, or dependencies. Ask for smaller pull requests; a 2,000-line diff is very hard to review properly.

### 7. Protect agent configuration and secrets

Review changes to agent instruction and permission files as carefully as changes to CI workflows, for example by requiring code-owner review on them. Keep real secrets out of the agent's workspace; [How to Protect Environment Variables and API Keys in Production](/blog/protect-environment-variables-api-keys) covers where they leak.

### 8. Keep an audit trail

Make it clear which changes came from an agent, and log the commands and tool calls it made. When something goes wrong, you need to know what it did and on whose request.

## A quick self-assessment

For each agent setup you use, answer these:

| Question                                                       | Safer answer                           |
| -------------------------------------------------------------- | -------------------------------------- |
| Can it read secrets or production data?                        | No, or only development copies         |
| Does it read content from people outside the team?             | If yes, restrict its tools and network |
| Can it reach any host on the internet?                         | No; only an allowlist                  |
| Can it merge, deploy, or delete without a person approving?    | No                                     |
| Are its credentials scoped to the task and short-lived?        | Yes                                    |
| Is its output reviewed and tested like any other contribution? | Yes                                    |

If you answered yes to the first three questions, the agent has all three legs of the trifecta: change the setup before the next task.

## Common mistakes and misconceptions

- **"The model is aligned, so it won't follow malicious instructions."** Models are trained to resist, but published evaluations show injection succeeds a meaningful share of the time, and attackers can retry.
- **"I approve every command, so I'm safe."** OWASP lists human-agent trust exploitation as an agentic risk, and notes it grows when people approve actions without independent validation. Approvals work best for a small number of genuinely high-impact actions, backed by sandboxing for the rest.
- **"It only has access to the repository."** Your repository may contain secrets, CI configuration that controls deployments, and history you have forgotten about.
- **"We'll add guardrails in the prompt."** Prompts guide behavior; they do not enforce it. Enforce limits in credentials, sandboxes, networks, and downstream systems.

## Check your understanding

Try to answer each question before reading the answers below.

1. Name the three parts of the lethal trifecta, and the one you can most often limit for a coding agent.
2. What are OWASP's three root causes of excessive agency?
3. Your agent has a database connection string with full admin rights "so it can run migrations". Which control is missing, and what is a safer setup?
4. Why is a system prompt that says "never push to main" not enough?

**Answers**

1. Access to private data, exposure to untrusted content, and the ability to communicate externally. Limiting external communication, both network access and what the agent can post publicly, is often the most practical leg to cut.
2. Excessive functionality, excessive permissions, and excessive autonomy.
3. Least privilege. Give the agent a development database, or a user without destructive rights, and have migrations applied to production by a reviewed pipeline. [Zero Trust Explained](/blog/zero-trust-security-developers) uses the same per-service database user idea.
4. Injected instructions can override it. Enforce it with branch protection, so the repository refuses the push regardless of what the agent attempts.

## Key takeaways

- Agents act on text they read, and no model reliably separates your instructions from an attacker's.
- Avoid combining private data, untrusted content, and open network access in one agent.
- Follow OWASP: minimize tools, permissions, and autonomy, and enforce authorization outside the model.
- Isolate agents, give them their own minimal credentials, and require human approval for high-impact actions.
- Review agent output as untrusted code, and protect the files that configure agents.

## Related guides

- [AI-Powered Cyberattacks: What Developers Need to Know](/blog/ai-powered-cyberattacks)
- [GitHub Actions Security: How to Protect Your Deployment Pipeline](/blog/github-actions-security)
- [Zero Trust Security Explained for Developers and Small Teams](/blog/zero-trust-security-developers)
