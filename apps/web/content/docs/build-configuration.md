Most projects need a build before they can run in production — bundling frontend assets,
compiling TypeScript, or producing a framework's production output.

## The build command

HelloDeploy proposes one from your repository and you confirm or correct it. For the
frameworks it recognises, that is usually:

```text
npm run build
```

A project that needs no build — plain HTML, CSS and JavaScript — can leave it empty.

## Dependencies install with npm

Builds run `npm ci`, which requires a `package-lock.json` committed to your repository.

If your project locks with pnpm or Yarn, HelloDeploy tells you before you deploy rather than
letting the build fail with an unhelpful npm error. Commit an npm lockfile to resolve it.

Do not rely on a pnpm or Yarn workflow being reproduced during the build. It is npm that
runs.

## Output directory

Projects served as static files need to say where the build wrote them. HelloDeploy detects
the conventional directory for the frameworks it recognises:

| Project                  | Output directory |
| ------------------------ | ---------------- |
| Create React App         | `build`          |
| React with Vite          | `dist`           |
| Vue with Vite or Vue CLI | `dist`           |

If your build writes somewhere else, set it to match.

## Next.js needs standalone output

HelloDeploy deploys Next.js from its standalone build output, so your `next.config` needs:

```js
module.exports = { output: 'standalone' };
```

Without it, the build succeeds and produces files HelloDeploy cannot start.

## A Dockerfile in your repository is ignored

HelloDeploy generates the container image for your project. If your repository contains a
`Dockerfile`, it is not used, and HelloDeploy warns you so the difference is not a surprise
later.

## When a build fails

The deployment logs cover dependency installation and the build separately from startup, so a
failure tells you which one broke. A build that fails leaves your previous release serving
traffic.
