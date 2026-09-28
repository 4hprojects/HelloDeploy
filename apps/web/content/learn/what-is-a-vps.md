A VPS — virtual private server — is your own slice of a physical machine: guaranteed
resources, full administrative access, and full responsibility for what you do with it.

## What it means

One physical server is divided into several virtual ones. Each behaves like a separate
computer with its own operating system, its own storage and its own allocation of CPU and
memory.

They share hardware, but they do not share a system. Another customer cannot see your files,
and cannot install software into your environment.

## What virtualisation actually gives you

The important word is _isolation_. On shared hosting, you are one account among many inside a
single system. On a VPS, you get a system of your own.

That means:

- You can install whatever you like, including specific language versions.
- You can configure the web server however you want.
- Your resources are allocated to you rather than competed for.
- You have root access, so nothing is off limits.

## What you are responsible for

Everything the previous list implies.

- Security updates, for the operating system and everything you installed.
- Firewall configuration.
- Keeping your application running, and restarting it when it stops.
- Backups.
- Certificates, and their renewal.
- Diagnosing problems with no support team to escalate to.

A VPS is a computer. Renting one makes you its administrator, whether or not you wanted the
job.

## When a VPS makes sense

- You need software shared hosting will not run.
- You need predictable resources rather than whatever is left over.
- You are running several things and want them on one machine you control.
- You want to learn server administration — a genuinely good reason.

## When it is more than you need

- A static site. A VPS is a large answer to a small question.
- A standard application on a platform that already supports it.
- A team with nobody willing to own the maintenance. An unpatched VPS is worse than shared
  hosting, because you are the only one responsible for it.

Be honest about the last one. The machine does not maintain itself, and the work does not go
away because it is inconvenient.

## VPS versus shared hosting

|              | Shared                         | VPS                     |
| ------------ | ------------------------------ | ----------------------- |
| Isolation    | Account within a shared system | Your own virtual system |
| Resources    | Shared with others             | Allocated to you        |
| Control      | What the host allows           | Root access             |
| Maintenance  | The host's job                 | Yours                   |
| Cost         | Lower                          | Higher                  |
| Skill needed | Little                         | Real administration     |

## How HelloDeploy relates to this

HelloDeploy runs on server infrastructure and manages it for you: your project runs in an
isolated container with its own resources, and the updates, routing and certificates are
handled. You get isolation without becoming a system administrator, and in exchange you work
within what the platform supports.
