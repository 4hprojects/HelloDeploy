# HelloDeploy Legal Policies

Effective: 30 June 2026

These policies are operational drafts for the HelloDeploy pilot. They are written to cover the practical legal surfaces of a self-hosted deployment platform, but they are not legal advice and should be reviewed by a qualified lawyer before public commercial launch, wider international availability, or regulated-data use.

## Policy Set

HelloDeploy should publish and maintain these user-facing policies:

- Terms of Service: `/terms`
- Privacy Policy: `/privacy`
- Cookie Policy: `/cookies`
- Acceptable Use Policy: `/acceptable-use`
- Service Limits: `/service-limits`
- Data Processing Terms: `/data-processing`
- Copyright Policy: `/copyright`
- Security Policy: `/security`
- Legal index: `/legal`

## Terms of Service Coverage

The Terms of Service should explain:

- What HelloDeploy is and who operates it.
- That account creation or use means acceptance of all linked policies.
- Eligibility, account responsibility, and credential security.
- Pilot/beta status and lack of production SLA.
- User ownership of deployed code and content.
- Permission for HelloDeploy to access, clone, build, run, route, log, and manage authorized repositories.
- User responsibility for deployed applications, application users, and application-collected data.
- Service limits and administrator enforcement rights.
- Third-party service dependencies.
- Suspension, termination, and data deletion expectations.
- Disclaimer of warranties, limitation of liability, indemnity, governing law, policy changes, and contact process.

## Privacy Policy Coverage

The Privacy Policy should explain:

- Account data collected: name, email, password hash, session data, IP/security metadata.
- GitHub data collected: installation IDs, repository names, branch names, commit metadata, and short-lived clone tokens.
- Project and deployment data collected: configuration, environment variable names, encrypted values, logs, container metadata, health-check results, domains, quotas, and audit events.
- Third-party services used: MongoDB Atlas, GitHub, Resend, Cloudflare, Docker/host infrastructure, and server hosting.
- Retention periods for logs, sessions, audit events, project data, account data, and rollback artifacts.
- User rights: access, correction, deletion, objection/restriction, and portability where feasible.
- International processing notice.
- Security practices.
- How user application data differs from platform account data.

## Cookie Policy Coverage

HelloDeploy currently uses:

| Name              | Purpose                                              | Duration                                                 | Type               |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| `hellodeploy.sid` | Authenticated session and server-side session lookup | 24 hours of inactivity, sign-out, or session destruction | Strictly necessary |

HelloDeploy also uses browser storage:

| Key        | Purpose                               | Duration                                               | Type               |
| ---------- | ------------------------------------- | ------------------------------------------------------ | ------------------ |
| `hd-theme` | Remembers light/dark theme preference | Until browser storage is cleared or preference changes | Preference storage |

HelloDeploy does not currently use advertising cookies, cross-site tracking cookies, analytics cookies, or marketing pixels. If optional cookies are added later, a consent control should be implemented before setting them where required.

## Acceptable Use Coverage

The Acceptable Use Policy should prohibit:

- Illegal content.
- Malware, exploits, phishing, credential theft, and fraud.
- Cryptocurrency mining.
- Spam, abusive bots, and unauthorized traffic generation.
- Network scanning or attacks.
- Attempts to bypass resource limits.
- Reselling platform capacity.
- Copyright infringement.
- Public proxy, VPN, game server, video encoding, and large-file workloads when outside V1 scope.

## Data Processing Coverage

HelloDeploy should distinguish between:

- Platform account and project data, where HelloDeploy determines processing purposes for operating the service.
- User application data, where the project owner is responsible for their own end-user privacy notices, consent, retention, legal basis, and compliance obligations.

The Data Processing Terms should explain platform processing activities, subprocessors, security measures, deletion/return handling, and support for data requests.

## Copyright Coverage

The Copyright Policy should provide:

- A clear copyright complaint address.
- Required notice content.
- A counter-notice process.
- A repeat-infringer policy.
- A note that public U.S. service operation may require DMCA designated-agent registration.

## Security Disclosure Coverage

The Security Policy should provide:

- A vulnerability reporting address.
- Safe testing rules.
- Out-of-scope activity such as denial of service, exfiltration, malware, spam, and social engineering.
- Summary of platform security controls.
- Good-faith reporting assurance.

## Operational Follow-Ups Before Public Launch

- Confirm the operator legal name, jurisdiction, and mailing address.
- Confirm whether the platform is operated from the Philippines, United States, or another jurisdiction for governing-law and privacy-rights wording.
- Register a DMCA designated agent if operating as a public U.S. online service and relying on DMCA safe-harbor procedures.
- Add a real cookie consent flow before introducing optional analytics, advertising, or marketing cookies.
- Add an in-app data export/delete workflow if privacy requests become frequent.
- Have counsel review these policies before commercial launch or use with regulated data.
