Shared hosting, a VPS and cloud hosting are three different bargains between control, cost
and how much administration you take on.

## The short version

- **Shared** — cheapest, simplest, least control. Your site is one of many on a machine.
- **VPS** — your own virtual machine. Full control, full responsibility.
- **Cloud** — managed infrastructure you pay for by usage, designed to scale.

Most small sites are well served by the first. Most people who think they need the third
need the second.

## Control

Shared hosting gives you an account inside a system someone else configured. You work within
it.

A VPS gives you root access. Anything you can do to a Linux machine, you can do.

Cloud hosting varies enormously — from a raw virtual machine that behaves like a VPS to a
managed service where you supply code and nothing else.

## Isolation

This is the difference that matters most and gets discussed least.

On shared hosting you share an operating system. Another site consuming resources can slow
yours, and a compromise elsewhere on the machine is a worse problem for you than it should
be.

A VPS isolates you at the machine level. Cloud services isolate at various levels depending
on the service, generally at least as well.

## Resources

Shared hosting typically oversells — assuming not everyone peaks at once, which is usually
true and occasionally not.

A VPS allocates you a fixed amount. You get what you pay for, including when you are not
using it.

Cloud hosting tends to charge for what you consume, which is efficient when usage varies and
alarming when something runs away unnoticed.

## Scaling

Shared hosting scales by moving you to a bigger plan.

A VPS scales by resizing the machine, usually with a restart, or by adding machines and
learning to balance between them.

Cloud hosting is built for this, which is its main advantage and the reason for its
complexity.

## Management

Shared hosting is maintained for you.

A VPS is maintained by you: updates, firewall, backups, certificates, monitoring, and
whatever broke at an inconvenient hour.

Cloud hosting depends on the service. A managed database is somebody else's problem; a virtual
machine is yours.

## Cost, conceptually

Shared hosting is a small fixed amount. A VPS is a larger fixed amount. Cloud hosting is
variable, which makes it cheap when idle and expensive when something is wrong.

The cost people forget is time. A VPS at a few pounds a month plus four hours of
administration is not cheaper than a managed option, unless your time is free.

## Comparison

|              | Shared      | VPS             | Cloud             |
| ------------ | ----------- | --------------- | ----------------- |
| Control      | Low         | Full            | Varies            |
| Isolation    | Shared OS   | Virtual machine | Service dependent |
| Resources    | Shared      | Allocated       | Usually metered   |
| Scaling      | Change plan | Resize or add   | Built in          |
| You maintain | Nothing     | Everything      | Varies            |
| Cost         | Low fixed   | Higher fixed    | Variable          |
| Suits        | Small sites | Custom needs    | Variable load     |

## Choosing

Start with what your project needs, not what sounds serious.

- A static site or a small application, no special requirements: shared hosting or a
  platform.
- Software with specific requirements, or several projects together: a VPS.
- Genuinely variable load, or a team that will operate it: cloud.

## Where a platform fits

A deployment platform is not a fourth category so much as a layer over one of these. It runs
on infrastructure of its own and handles the deployment work — building, running, routing,
certificates — so you supply a project rather than administer a machine.

The trade is the usual one: less control, less to maintain. HelloDeploy is this kind of thing,
which is why it supports particular runtimes rather than anything you care to install.
