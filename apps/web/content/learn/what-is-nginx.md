nginx is a piece of software that serves websites. You most often meet the name in an error
page, which is a poor introduction to it.

## What it is

Pronounced "engine-x". It does several related jobs, and which one people mean depends on the
context:

- **A web server** — serving files directly from disk.
- **A reverse proxy** — forwarding requests to applications behind it.
- **A load balancer** — spreading requests across several copies of an application.
- **A TLS terminator** — handling HTTPS so the applications behind it do not have to.

Most deployments use the first two, often at once.

## Serving files

Given a directory, nginx serves what is in it. Ask for `/about.html` and it sends that file.

For a static site this is all you need: no application, no process to keep alive. It is also
why static sites are so cheap to host — nginx serving files is extremely efficient, and one
modest machine handles a great deal of traffic.

## Forwarding to applications

For anything that runs code, nginx sits in front and forwards requests to the application,
usually listening on a private port.

That makes nginx the only thing exposed publicly, which is the arrangement described in
[What Is a Reverse Proxy?](/learn/what-is-a-reverse-proxy).

## Why it appears in your errors

This is how most people first encounter the name: a plain page saying **502 Bad Gateway**
with "nginx" underneath.

That page is nginx telling you it is working and the application behind it is not. Something
crashed, is listening on the wrong port, or never started.

The distinction is genuinely useful. If you see nginx's error page, nginx is running. The
problem is behind it.

| What you see           | What it means                                |
| ---------------------- | -------------------------------------------- |
| 502 Bad Gateway        | The application is not answering             |
| 504 Gateway Timeout    | It answered too slowly                       |
| 404 from nginx         | Routing did not match anything               |
| Browser cannot connect | nginx itself is not running, or DNS is wrong |

## How it is configured

Text files describing server blocks: which hostnames to answer for, which certificate to use,
what to serve or where to forward.

Changes need a reload, which nginx performs without dropping connections — it starts new
workers with the new configuration and retires the old ones. That is what makes it possible
to switch a site to a new version with no interruption.

## Alternatives

Apache has been doing this longer. Caddy is simpler and obtains certificates automatically.
Traefik is built around containers. HAProxy specialises in load balancing.

nginx remains common because it is fast, stable and well understood. Little of what you learn
about the concepts is wasted if you later use another.

## Do you need to learn it?

If you administer your own server, yes, at least enough to read a configuration file.

If you use a deployment platform, no. Something is running nginx or its equivalent on your
behalf. Knowing what it does is still worth the ten minutes, because it makes a 502 legible
rather than mysterious.

## How HelloDeploy uses it

HelloDeploy writes an nginx server block for each release and reloads nginx when that release
is activated. You do not configure it, and a Dockerfile or nginx configuration in your
repository is not used — see [Build Configuration](/docs/build-configuration).
