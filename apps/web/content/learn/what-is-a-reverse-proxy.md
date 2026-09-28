A reverse proxy is a server that receives requests on behalf of other servers and forwards
them on.

## Forward and reverse

A **forward proxy** acts for the client. Your browser talks to it, and it fetches things on
your behalf. It hides who is asking.

A **reverse proxy** acts for the server. Visitors talk to it believing it is the website, and
it passes requests to whatever is actually behind it. It hides what is answering.

Same mechanism, opposite side, which is the only reason the names are confusing.

## What it does

**Routing.** One public entry point can serve many applications, choosing between them by
hostname or path. This is how several sites share one address — covered in
[how multiple websites run on one server](/learn/how-multiple-websites-run-on-one-server).

**TLS termination.** The proxy handles the encrypted connection and speaks plain HTTP to the
application behind it. That means certificates are managed in one place instead of in every
application.

**Hiding internal topology.** Applications listen on private ports that are not exposed. The
outside world sees one address; what is behind it can be rearranged without anyone noticing.

**Absorbing the awkward parts.** Slow clients, large uploads, connection limits, timeouts —
the proxy deals with these so each application does not have to.

**Serving static files.** A proxy can answer for images and stylesheets itself, without
troubling the application at all.

## Why applications are not exposed directly

You could point the internet at your application. It is a bad idea.

- Every application would need its own certificate handling.
- Each would be directly reachable, so each bug is directly reachable.
- Only one could use the standard port.
- Swapping versions would mean changing what the public address points at.

With a proxy in front, all of that is handled once, and the application behind it can be
restarted or replaced without the public address changing.

## What a deployment looks like through this lens

This explains a detail that otherwise seems arbitrary: why a new version does not receive
traffic the moment it starts.

The new version starts on a new private port while the old one keeps serving. The platform
checks the new one responds. Only then does the proxy's routing change. If the check fails,
routing never changes, and visitors never see the broken version.

The switch is a configuration change in the proxy, not a restart of your site.

## What you see when it goes wrong

A proxy that cannot reach the application behind it returns an error of its own — most often
**502 Bad Gateway**, meaning "I am fine, the thing behind me is not".

That distinction is useful. A 502 says the proxy is working and the application is not
answering: it has crashed, it is listening on the wrong port, or it is not started.

## Common software

nginx, Caddy, HAProxy, Traefik, and the proxies built into cloud load balancers. They differ
in configuration and features rather than in what they fundamentally do — see
[What Is Nginx?](/learn/what-is-nginx).

## How HelloDeploy uses one

nginx sits in front of every deployed project. Each runs in a container on a private port,
and nginx routes requests by hostname to the right one. Routing switches to a new release
only after its health check passes — see [Deployment Process](/docs/deployment-process).
