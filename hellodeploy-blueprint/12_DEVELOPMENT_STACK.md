# Development Stack and Standards

## Confirmed Development Approach

HelloDeploy will be built with the normal tools already used by the project owner. TypeScript is not part of the approved stack.

## Core Development Tools

| Purpose                    | Approved Tool                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| Code editor                | Visual Studio Code                                               |
| Programming language       | JavaScript                                                       |
| JavaScript module format   | ECMAScript modules                                               |
| Package manager            | npm                                                              |
| Web application            | Node.js with Express                                             |
| Server-rendered interface  | EJS templates                                                    |
| Browser interface          | CSS and JavaScript served by Express                             |
| Deployment worker          | Node.js JavaScript process                                       |
| Platform database          | MongoDB Atlas                                                    |
| MongoDB access             | Mongoose or the official MongoDB driver, selected during Phase 0 |
| Queue                      | Redis with BullMQ                                                |
| Source control             | Git and GitHub                                                   |
| Email                      | Resend                                                           |
| Bot protection             | Cloudflare Turnstile                                             |
| Application isolation      | Docker Engine                                                    |
| Reverse proxy              | Nginx                                                            |
| Public ingress             | Cloudflare Tunnel                                                |
| Styling                    | Standard CSS                                                     |
| API validation             | Zod or an equivalent JavaScript validation library               |
| Unit and integration tests | Jest or Node.js test runner, selected during Phase 0             |
| Browser tests              | Playwright                                                       |

## Application Structure

### Express and EJS Web Application

The web application renders pages with EJS and handles authenticated HTTP requests. Browser JavaScript is used only where interactive behavior is needed. Infrastructure work is always queued for the separate worker.

Suggested responsibilities:

- Public EJS pages
- Registration and login interfaces
- User project dashboard
- Deployment controls and history
- Logs and metrics views
- Super Admin dashboard

The Express application owns HTTP business rules and authorization. Page routes and API routes remain separated in the source structure.

Suggested structure:

```text
apps/web/src/
|-- config/
|-- controllers/
|-- middleware/
|-- models/
|-- repositories/
|-- routes/
|   |-- pages/
|   `-- api/
|-- services/
|-- validators/
|-- views/
|   |-- layouts/
|   |-- partials/
|   `-- pages/
|-- utils/
`-- server.js
```

Public files live at `apps/web/public`, not inside `src`:

```text
apps/web/public/
|-- assets/
|-- css/
|-- js/
`-- manifest.webmanifest
```

### Deployment Worker

The worker is a separate Node.js application. It consumes BullMQ jobs and performs controlled Git, Docker, health-check, and Nginx operations.

Suggested structure:

```text
apps/worker/src/
|-- jobs/
|-- deployment/
|-- docker/
|-- git/
|-- nginx/
|-- security/
|-- logs/
|-- metrics/
`-- worker.js
```

## JavaScript Quality Standards

Because the project does not use TypeScript, the following controls are required:

- Use strict ESLint rules.
- Validate API requests, job payloads, environment configuration, and webhook bodies at runtime.
- Use JSDoc for shared contracts and complex public functions.
- Keep modules small with explicit inputs and outputs.
- Avoid unstructured objects crossing package boundaries.
- Test authorization, status transitions, quota calculations, and deployment contracts.
- Fail startup when required environment variables are missing or invalid.
- Do not use `eval`, dynamic code generation, or shell-interpolated user input.

## Local Development Workflow

The expected developer workflow uses VS Code and npm:

```text
Clone repository
      ↓
Copy .env.example to local environment file
      ↓
Install npm dependencies
      ↓
Start MongoDB/Redis development dependencies
      ↓
Run Express web application and worker in development mode
      ↓
Run lint and tests before committing
      ↓
Push changes to GitHub
```

Exact commands will be added to the root `README.md` during Phase 0. They should be simple npm scripts such as:

```bash
npm install
npm run dev
npm run lint
npm test
```

## Separation from Hosted Application Runtimes

HelloDeploy itself uses JavaScript, Express, EJS, and Node.js. Applications hosted by HelloDeploy may still include React, Vue, or supported Next.js projects. Supporting those user applications does not require the HelloDeploy interface to use those frameworks.

## Stack Change Rule

Claude or another implementation agent must not replace JavaScript with TypeScript, EJS with React or Vite, Express with Next.js API routes, npm with another package manager, or MongoDB Atlas with another platform database unless the project owner explicitly approves and the decision log is updated.
