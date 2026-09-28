A port is a numbered door on a machine. An application listening on port 3000 is waiting for
connections at that number, and connections to any other number do not reach it.

## Why ports exist

One machine has one network address but runs many programs. The address gets a request to the
machine; the port decides which program receives it.

Some numbers are conventional: 80 for HTTP, 443 for HTTPS, 5432 for PostgreSQL. Others are
whatever a program picks. Nothing enforces these conventions — they are agreements.

## Listening

A server "listens" on a port: it tells the operating system that connections to that number
belong to it, and waits.

Two programs cannot listen on the same port on the same interface. The second gets an error
like `EADDRINUSE`, which is almost always a previous copy of the same program still running.

## Local development

Running a project locally, you visit something like:

```text
http://localhost:3000
```

`localhost` is your own machine and `3000` is the port your development server chose. You
type the port because nothing is arranging otherwise.

Production is different — visitors type no port at all. Something is arranging it.

## Internal and public

In production your application typically listens on a private port that is not reachable from
the internet. A [reverse proxy](/learn/what-is-a-reverse-proxy) listens on the public port,
and forwards requests to your application's private one.

So the port your application uses is an internal detail. Visitors reach the proxy on 443 and
never learn what is behind it.

This is also a security property: your application is not directly exposed, so it is only
reachable through something that can filter and terminate connections first.

## The platform chooses the port

Because the port is internal, the platform usually chooses it and tells the application
through an environment variable — conventionally `PORT`.

```js
const port = process.env.PORT || 3000;
app.listen(port);
```

Read the value you are given. Hardcoding a number works only by coincidence, and the
coincidence tends not to survive.

## Binding to the right interface

A separate question from _which_ port is _which interface_.

A server bound to `127.0.0.1` accepts connections only from the same machine. Inside a
container, "the same machine" is the container — so a correctly-ported application bound to
localhost is still unreachable from outside it.

Most frameworks bind to all interfaces by default. If yours takes a host, `0.0.0.0` means
"any".

## When the port is wrong

The symptom is distinctive: the application starts, the logs look healthy, and nothing
responds.

That is what a port mismatch looks like from outside. The proxy forwards to where it expects
the application to be, finds nothing listening, and returns an error — while the application
sits listening somewhere nobody is asking.

| Symptom                             | Cause                                           |
| ----------------------------------- | ----------------------------------------------- |
| Starts, then fails a health check   | Listening on a different port than expected     |
| Runs fine, unreachable from outside | Bound to `localhost` rather than all interfaces |
| `EADDRINUSE` on startup             | Something else already holds the port           |

## How HelloDeploy handles it

HelloDeploy allocates a private port, injects it as `PORT`, and routes public traffic to it.
Read `PORT` rather than hardcoding. An application listening elsewhere never answers the
health check, and the release is rolled back.
