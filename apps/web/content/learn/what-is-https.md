HTTPS is HTTP with the traffic encrypted, so that what passes between a visitor's browser and
your site cannot be read or altered on the way.

## HTTP and HTTPS

HTTP is the language browsers and servers speak. On its own it is plain text: anything
between the two — a network operator, someone running the café wifi, anyone in between — can
read every request and response, and can modify them.

HTTPS is the same language inside an encrypted channel. Same requests, same responses, but
unreadable to anything in the middle.

## What encryption in transit protects

It protects the journey, not the destination.

- Passwords, form contents and cookies cannot be read in transit.
- Pages cannot be modified on the way — no injected adverts, no swapped downloads.
- An observer can still see _which site_ you connected to, but not what you did there.

What it does not protect is what happens at either end. A compromised browser or a badly
written server is not helped by the connection being encrypted.

## Where the certificate comes in

Encryption alone would be insufficient. You could have a perfectly encrypted connection to an
impostor.

So a site presents a certificate: a document stating which domain it is, signed by an
authority the browser already trusts. The browser checks that the certificate covers the name
it asked for, that the signature is valid, and that it has not expired.

Only then does it proceed. That is what makes HTTPS about identity as well as secrecy.

## What the browser shows

Modern browsers say very little when everything is fine — the absence of a warning is the
message. They are loud when something is wrong: a name mismatch, an expired certificate, an
untrusted signer.

Those warnings mean the connection is not trustworthy. They are not a formality to click
past.

## HTTPS does not mean a site is safe

This is the most common misunderstanding, and it matters.

HTTPS tells you the connection is private and you are talking to the domain you typed. It
tells you nothing about whether the people running that domain are honest.

A phishing site can have a perfectly valid certificate. It is trivial to obtain one. The
padlock means "nobody is eavesdropping", not "this site deserves your card details".

## Why every site should use it

Not only sites handling passwords:

- Browsers mark plain HTTP as not secure, which visitors notice.
- Search engines prefer HTTPS.
- Some browser features are unavailable without it.
- Content injection on plain HTTP is real and common.

There is no longer a good reason to serve a public site over HTTP.

## How HelloDeploy handles it

Project addresses are served over HTTPS from the moment they are deployed. A custom domain is
served over HTTPS too, once it has been provisioned and its DNS resolves.

TLS is terminated upstream of your application, so there is no certificate for you to request,
install or renew. If a secure address does not load, the cause is almost always DNS or
provisioning rather than a certificate. See [HTTPS and SSL](/docs/https-and-ssl).
