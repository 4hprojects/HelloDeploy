HTTPS encrypts traffic between a visitor's browser and your site, so what they send and
receive cannot be read or altered in transit.

## Project addresses

A `hellodeploy.online` project address is served over HTTPS from the moment it is deployed.
There is nothing to configure.

## Custom domains

Once your domain is provisioned and its DNS points at HelloDeploy, it is served over HTTPS
too.

TLS is terminated upstream of your application, which means HelloDeploy does not issue or
renew a certificate per project. There is no certificate to request, install, or keep track
of on your side.

## Before HTTPS can work

- The domain is added to the right project.
- Ownership verification has succeeded.
- An administrator has provisioned the domain.
- The CNAME record resolves.

Every one of these is about the domain being set up and reachable. None of them is about a
certificate.

## Checking

Load your site over `https://`. Three things should be true: the page loads, the browser
reports a secure connection, and the certificate matches the domain you typed.

## When it does not work

| Symptom                                       | Where to look                                            |
| --------------------------------------------- | -------------------------------------------------------- |
| Browser cannot find the site at all           | DNS — the CNAME is missing, wrong, or not yet propagated |
| Site loads over `http://` but not `https://`  | Provisioning may not be complete                         |
| Certificate warning naming a different domain | The request is reaching something other than HelloDeploy |
| Root secure, `www` not                        | The tunnel covers only one of the two hostnames          |

The cause is almost always DNS or provisioning. It is very rarely a certificate that needs
requesting.

## Do not work around a warning

A certificate warning means traffic is not going where you think, or is not protected. Do not
tell visitors to click through it, and do not disable certificate validation in an
application to make an error go away — that removes the protection rather than fixing the
problem.
