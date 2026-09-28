Environment variables keep configuration out of your source code: database URLs, API keys,
service credentials, and anything else that differs between your machine and production or
should not be committed.

## Adding them

Set them on the project. Names are limited to 128 characters and follow the usual convention
of uppercase words separated by underscores, such as `DATABASE_URL`.

Values are encrypted before they are stored, and decrypted only when a container is started.
Log output is scanned for things that look like credentials and those are redacted, but that
is a safety net rather than a guarantee: an application that prints its own configuration can
still put a value in the log.

## Changes need a redeploy

Values are passed to the container at start. A running application does not pick up a
variable that was added or changed afterwards.

Save the variable, then redeploy. This is expected behaviour rather than a fault, and it is
worth checking before assuming a value did not save.

## Names HelloDeploy manages

Four names are set by the platform and cannot be used for your own values:

| Name       | Why                                                         |
| ---------- | ----------------------------------------------------------- |
| `PORT`     | HelloDeploy chooses the port your application listens on    |
| `NODE_ENV` | HelloDeploy runs your application in production mode        |
| `HOST`     | HelloDeploy decides which address to bind inside the server |
| `HOSTNAME` | As above                                                    |

Simple mode refuses these outright. Advanced mode allows them with a warning, because an
application that genuinely reads a fixed one is unusual rather than wrong.

## Build time and run time

A value needed while your project is building is not automatically the same as one needed
while it runs. Frontend frameworks in particular read configuration during the build and
write it into the files they produce — which means anything supplied that way ends up in
what visitors download.

Never put a secret in a variable that a frontend build will inline. A key that reaches the
browser is public, whatever it is called.

## Keeping them safe

- Do not commit a `.env` file containing real values.
- Do not paste values into a support message, an issue, or a screenshot.
- Rotate anything that has been exposed rather than hoping it was not noticed.
