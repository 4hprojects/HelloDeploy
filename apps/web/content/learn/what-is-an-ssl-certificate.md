A certificate is how a website proves it is the site it claims to be, and how an encrypted
connection to it gets established.

## A note on the name

Almost everyone says "SSL certificate". SSL is the old protocol; it was replaced by TLS years
ago and the versions that remain are considered insecure.

What you have is a TLS certificate. The name stuck, so both terms mean the same thing in
practice. Nobody will misunderstand you either way.

## What it is

A small file containing:

- The domain names it covers.
- A public key.
- Who issued it.
- The dates between which it is valid.
- A signature from the issuer.

The server presents it at the start of every connection.

## The public key part

Public key cryptography uses a pair of keys. Anything encrypted with one can only be
decrypted with the other.

The site keeps the private key and never shares it. The certificate contains the matching
public key. A browser can therefore encrypt something only that site can read — which is how
the two agree on the keys used for the rest of the conversation, without anyone listening
being able to work them out.

If the private key leaks, the certificate must be replaced. That is the one part of this
genuinely worth being careful with.

## What the browser checks

1. **Does the certificate cover this name?** A certificate for `example.com` does not cover
   `www.example.com` unless it says so.
2. **Is it signed by someone trusted?** Browsers ship with a list of trusted authorities.
3. **Has it expired?** Certificates are short-lived on purpose.
4. **Does the server hold the matching private key?** Presenting someone else's certificate
   proves nothing.

Any check failing produces a warning rather than a page.

## What it proves, and what it does not

It proves the connection is to the domain named in it, and is encrypted.

It does not prove the organisation behind that domain is legitimate, competent or honest.
Certificates are free and automatic — obtaining one for a domain you control is a matter of
minutes, and that is as true for a fraudster as for anyone else.

## Expiry and renewal

Certificates last months rather than years, deliberately: a leaked key stops being useful
sooner.

Renewal is normally automated. Expired certificates are almost always an automation that
failed quietly some weeks earlier, which is why the failure is invisible until the morning it
is not.

## How HelloDeploy handles it

TLS is terminated upstream of your application, so HelloDeploy does not issue or renew a
certificate per project, and there is nothing for you to install or track.

What this means practically: there is no "certificate pending" state to wait through. If an
address does not load securely, look at DNS and provisioning first — see
[HTTPS and SSL](/docs/https-and-ssl).
