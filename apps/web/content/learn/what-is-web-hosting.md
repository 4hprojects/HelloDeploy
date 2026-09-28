Web hosting is renting space on a computer that stays switched on, so your website is there
when someone visits.

## What it means

A website has to live on a machine connected to the internet, running all the time, with an
address other computers can find. Your laptop is not that machine: it sleeps, it moves
networks, and it is not meant to accept connections from strangers.

A host provides a machine that does all three.

## Files, or a program

What you are hosting matters more than most introductions admit.

**A static site** is a set of files — HTML, CSS, images, JavaScript. The server sends them as
they are. Nothing runs on the server; everything happens in the visitor's browser. This is
simple, cheap and fast.

**An application** runs code on the server for each request: looking things up in a database,
checking who is signed in, deciding what to send back. That needs a running process, memory,
and somewhere to keep the data.

The first needs somewhere to put files. The second needs somewhere to run a program. Plenty
of confusion comes from buying one and needing the other.

## Hosting is not a domain

These are bought separately and often from different companies.

- **Hosting** is where your site lives.
- **A domain** is the name people type.

A domain with no hosting points nowhere. Hosting with no domain works but is reachable only
at whatever address the host provides. They are connected by DNS, which is what tells the
internet that your name belongs to that place.

## What you are actually renting

- **CPU** — how much computing your site can do at once.
- **Memory** — how much your program can hold while running.
- **Storage** — disk space for your files and data.
- **Bandwidth** — how much traffic can be transferred.

A static site barely touches the first two. An application can exhaust either, and usually
the memory first.

## The common kinds

**Shared hosting** puts many customers on one machine. Cheapest, least control, and your
site's performance depends partly on other people's.

**A VPS** gives you an isolated slice of a machine with guaranteed resources and full
administrative control — and full administrative responsibility.

**Cloud hosting** spreads across managed infrastructure, usually charging for what you use
and scaling more readily.

**Platforms** sit on top of any of these and handle the deployment work for you, trading some
control for not having to administer a server.

## Common mistakes

- **Buying a domain and expecting a website.** The name is not the site.
- **Choosing a plan by price alone.** Cheap shared hosting that cannot run your application
  is not a saving.
- **Assuming hosting includes backups.** Sometimes it does. Check, rather than find out.
- **Confusing uptime with reliability.** A server that is up while your application has
  crashed is still a broken site.

## How HelloDeploy handles it

HelloDeploy is a deployment platform rather than a host you administer. It builds your
project, runs it, routes traffic to it and serves it over HTTPS, without you configuring a
server. You still need a domain if you want your own address.
