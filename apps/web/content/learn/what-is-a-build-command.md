A build command is the instruction that turns your project into the form that actually runs
in production.

## What it means

You write code in whatever form is easiest to work with. Browsers and servers want something
else: fewer files, plain JavaScript, compiled templates, processed styles.

The build command is what performs that conversion. In most JavaScript projects it is:

```text
npm run build
```

which runs a `build` script defined in your `package.json`.

## What a build actually does

It depends on the project, but usually some of:

- **Compiling** — TypeScript to JavaScript, for instance, because browsers do not run
  TypeScript.
- **Bundling** — combining many small files into a few, so a browser makes fewer requests.
- **Minifying** — stripping whitespace and shortening names, to make files smaller.
- **Processing assets** — compiling styles, optimising images, fingerprinting filenames so
  they can be cached safely.

The result is written to an output directory — often `dist` or `build` — which is what gets
served.

## Why it matters for deployment

A build is where a great many deployment failures occur, because it is the first step that
runs your project's own code rather than a standard installation.

Common causes:

- A dependency that exists on your machine but is not in the project's dependency list.
- A file that exists locally and was never committed.
- A configuration value the build needs and does not have.
- A file path with different capitalisation, which works on a case-insensitive machine and
  fails on a case-sensitive server.

## Does your project need one?

If your project is HTML, CSS and JavaScript files that a browser can use as they are, no. You
can leave the build command empty.

If you use a framework, almost certainly yes, and that framework's documentation will name
the command. If your `package.json` has a `build` script, that is the one.

## Common mistakes

- **Using the development command.** A development server with hot reloading is not a build.
  It is slower, larger, and not meant to face the public.
- **Assuming a build outputs to the same place everywhere.** Create React App writes to
  `build`; Vite writes to `dist`. If the platform looks in the wrong place it will find
  nothing.
- **Putting secrets in build-time variables.** Anything a frontend build reads gets written
  into the files visitors download. A key supplied that way is public.

## How HelloDeploy handles it

HelloDeploy inspects your repository and proposes a build command and an output directory for
frameworks it recognises, marking anything it had to guess. Builds install dependencies with
`npm ci`, so a `package-lock.json` needs to be committed. See
[Build Configuration](/docs/build-configuration).
