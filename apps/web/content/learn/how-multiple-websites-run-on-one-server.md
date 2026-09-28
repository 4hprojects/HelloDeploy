A single server can host dozens of websites at one address. Understanding how makes several
confusing deployment problems obvious.

## The problem

A server has one public IP address, and web traffic arrives on port 443 for HTTPS. Only one
program can listen on a port at a time.

So how do twenty sites share one machine?

## The answer: the request says which site it wants

When a browser asks for `example.com`, it does not only connect to an IP address. It also
says, in the request, which hostname it is looking for.

That is the whole trick. One program listens on the public port, reads the hostname from each
request, and forwards it to whichever site should handle it.

## The reverse proxy

That program is a reverse proxy — commonly nginx. It sits in front of everything and is the
only thing listening publicly.

Behind it, each application runs on its own private port, reachable only from the machine
itself. The proxy holds a map: `example.com` goes to the program on port 3001,
`another.example` to the one on 3002.

Nothing behind the proxy is directly reachable from the internet, which is a security benefit
as well as an organisational one.

## Why your application's port does not matter to visitors

This is where it clicks for most people.

Your application listens on some private port. Nobody types that port. Visitors reach the
proxy on the standard port, and the proxy forwards to yours.

Which is also why an application bound to the wrong port appears completely dead: the proxy
forwards to where it expects the application to be, finds nothing, and the visitor gets an
error — even though the process is running.

## Isolation between sites

Sharing a machine does not have to mean sharing an environment. Sites are commonly run in
containers: each gets its own filesystem, its own dependencies and its own process space,
while sharing the machine's kernel.

So two sites on one server can need different versions of the same language without
conflicting, and one crashing does not take the other down.

## What is genuinely shared

Isolation is not infinite. CPU, memory, disk and network bandwidth all come from one machine.

A site consuming a great deal of memory affects its neighbours. This is what resource limits
are for — capping what any one site can take, so a single misbehaving application cannot
starve everything else.

## Capacity

How many sites fit on one server depends entirely on what they do. Hundreds of small static
sites are unremarkable. A handful of memory-hungry applications may be the limit of the same
machine.

The constraint is almost always memory, which runs out abruptly rather than gradually.

## Common misunderstandings

- **"My site has its own server."** Usually it has its own isolated environment on a shared
  one.
- **"The port in development is the port in production."** It is not. In production something
  chooses it for you.
- **"Another site cannot affect mine."** Isolation prevents interference, not resource
  competition.

## How HelloDeploy handles it

Each project runs in its own container on a private port, and nginx routes requests by
hostname to the right one. That is why every project gets an address that just works, why
your application must listen on the port it is given, and why a new release only receives
traffic once it has passed its health check — the routing switches at that moment and not
before.
