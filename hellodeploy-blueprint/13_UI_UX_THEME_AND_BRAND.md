# UI, UX, Theme, and Brand Assets

## Objective

Create a professional, friendly deployment interface that works for general users without hiding important infrastructure state. HelloDeploy uses server-rendered EJS, standard CSS, and small browser JavaScript modules.

## Visual Identity

HelloDeploy uses four semantic color families:

- Deployment orange: brand and primary deployment actions
- Baby blue: active processes, information, links, and metrics
- Infrastructure navy: navigation and technical surfaces
- Green: healthy and successful states only

The palette is inspired by the Ubuntu-based origin of the first server, but HelloDeploy must not use Ubuntu logos, marks, naming, or other visual elements that imply official affiliation.

## Light Theme Tokens

```css
:root {
  color-scheme: light;

  --brand-orange: #e95420;
  --brand-orange-action: #c2410c;
  --brand-orange-hover: #9a3412;
  --brand-orange-soft: #ffedd5;

  --brand-blue: #38bdf8;
  --brand-blue-text: #0369a1;
  --brand-blue-soft: #e0f2fe;

  --surface-page: #f8fafc;
  --surface-card: #ffffff;
  --surface-muted: #f1f5f9;
  --surface-sidebar: #0f172a;
  --surface-sidebar-hover: #1e293b;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-on-dark: #e2e8f0;
  --border-default: #cbd5e1;

  --status-success: #15803d;
  --status-success-soft: #dcfce7;
  --status-warning: #a16207;
  --status-warning-soft: #fef3c7;
  --status-danger: #b91c1c;
  --status-danger-soft: #fee2e2;
  --status-neutral: #475569;

  --focus-ring: #38bdf8;
}
```

Use `--brand-orange-action`, not the brighter brand orange, for primary buttons with white text.

## Dark Theme Tokens

```css
[data-theme='dark'] {
  color-scheme: dark;

  --brand-orange: #fb7a4b;
  --brand-orange-action: #e95420;
  --brand-orange-hover: #fb923c;
  --brand-orange-soft: #431407;

  --brand-blue: #38bdf8;
  --brand-blue-text: #7dd3fc;
  --brand-blue-soft: #0c4a6e;

  --surface-page: #020617;
  --surface-card: #0f172a;
  --surface-muted: #1e293b;
  --surface-sidebar: #020617;
  --surface-sidebar-hover: #1e293b;

  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-on-dark: #e2e8f0;
  --border-default: #334155;

  --status-success: #4ade80;
  --status-success-soft: #14532d;
  --status-warning: #facc15;
  --status-warning-soft: #713f12;
  --status-danger: #f87171;
  --status-danger-soft: #7f1d1d;
  --status-neutral: #94a3b8;

  --focus-ring: #7dd3fc;
}
```

## Supporting Tokens

```css
:root {
  --font-interface: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-code: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;

  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.875rem;

  --shadow-card: 0 1px 3px rgb(15 23 42 / 8%);
  --shadow-dialog: 0 20px 40px rgb(15 23 42 / 18%);

  --content-max: 90rem;
  --sidebar-width: 16rem;
  --topbar-height: 4rem;
}
```

Do not require the Inter web font. The system font fallback must provide a complete experience without external font downloads.

## Color Usage

### Orange

Use for:

- Logo and brand highlights
- Primary actions such as Create Project, Connect GitHub, Deploy, and Request Approval
- Selected navigation indicators

Do not use for every decorative element or normal body text.

### Baby Blue

Use for:

- Building and active-process states
- Informational banners
- Links using the darker text token
- Metrics and charts
- Focus rings

Do not use bright baby blue as small text on white.

### Green

Use only for:

- Healthy application
- Successful deployment
- Verified domain
- Connected service
- Completed build

### Status Mapping

| Status           | Color family    | Required label/icon |
| ---------------- | --------------- | ------------------- |
| Draft            | Slate           | Draft/file          |
| Pending approval | Gold            | Pending/clock       |
| Queued           | Slate or violet | Queued/list         |
| Building         | Baby blue       | Building/spinner    |
| Deploying        | Orange          | Deploying/upload    |
| Healthy          | Green           | Healthy/check       |
| Failed           | Red             | Failed/error        |
| Stopped          | Gray            | Stopped/stop        |
| Suspended        | Red             | Suspended/lock      |
| Archived         | Slate           | Archived/archive    |

Never communicate status by color alone.

## CSS Organization

```text
apps/web/public/css/
|-- main.css
|-- tokens/
|   |-- colors.css
|   |-- spacing.css
|   |-- typography.css
|   `-- themes.css
|-- base/
|   |-- reset.css
|   |-- global.css
|   `-- accessibility.css
|-- layout/
|   |-- container.css
|   |-- sidebar.css
|   |-- topbar.css
|   |-- dashboard.css
|   `-- auth.css
|-- components/
|   |-- buttons.css
|   |-- forms.css
|   |-- cards.css
|   |-- tables.css
|   |-- badges.css
|   |-- alerts.css
|   |-- modal.css
|   |-- dropdown.css
|   |-- pagination.css
|   `-- logs.css
`-- pages/
    |-- home.css
    |-- projects.css
    |-- deployments.css
    |-- domains.css
    `-- admin.css
```

Use predictable component names such as `.button`, `.button--primary`, `.card`, `.card__header`, and `.status-badge--healthy`. Avoid deeply nested selectors and `!important` except for carefully documented accessibility overrides.

## Responsive Layout

- Mobile first
- Tablet breakpoint: `48rem`
- Desktop breakpoint: `64rem`
- Wide dashboard breakpoint: `80rem`
- Sidebar becomes an accessible drawer on small screens
- Tables scroll or use responsive row cards
- Log viewers preserve monospace formatting and horizontal scrolling
- Primary actions remain reachable without covering content

## Accessibility

- Visible labels for every form control
- Visible `:focus-visible` outline
- Regular text contrast target of at least 4.5:1
- Essential graphics and component boundaries target of at least 3:1
- Text and icon for every status
- Semantic headings and landmarks
- Keyboard-operable navigation, dialogs, menus, and forms
- Functional interface at 200% zoom
- Reduced-motion support

```css
:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

## Interaction Standards

- Disable a submit action while its request is processing.
- Replace button text with a meaningful progress label.
- Preserve non-sensitive values after validation failure.
- Show field-level errors and a form-level summary.
- Confirm destructive actions with the target name.
- Use Server-Sent Events for live deployment logs and stages.
- Use Chart.js only where a graph improves understanding.
- Use one consistent SVG icon set or project-owned inline SVGs.

## Brand Asset Structure

```text
apps/web/public/
|-- assets/
|   |-- brand/
|   |   |-- hellodeploy-logo.svg
|   |   |-- hellodeploy-logo-dark.svg
|   |   |-- hellodeploy-mark.svg
|   |   |-- hellodeploy-mark-placeholder.svg
|   |   `-- hellodeploy-wordmark.svg
|   |-- icons/
|   |   |-- favicon.ico
|   |   |-- favicon.svg
|   |   |-- apple-touch-icon.png
|   |   |-- icon-192.png
|   |   `-- icon-512.png
|   `-- social/
|       `-- hellodeploy-og-image.png
`-- manifest.webmanifest
```

## Placeholder Requirements

Until final artwork is approved, `hellodeploy-mark-placeholder.svg` is the source identity mark. It should use:

- A simple rounded container or server outline
- An `HD` monogram or deployment arrow
- Deployment orange and baby blue
- Transparent background
- No Ubuntu logo, circle-of-friends mark, or copied hosting-platform icon

Templates should reference stable production filenames. During Phase 0, approved placeholder copies may occupy those filenames so no template change is needed when artwork is replaced.

## Asset Use

- Public and dashboard navigation: full logo
- Collapsed sidebar and mobile shortcut: mark
- Browser tab: favicon
- Mobile home screen: 192 and 512 icons
- Resend email header: absolute HTTPS logo URL
- Error, maintenance, and suspension pages: mark or full logo
- Social sharing: Open Graph image

## EJS Partials

```text
apps/web/src/views/partials/
|-- head.ejs
|-- brand-logo.ejs
|-- header.ejs
|-- sidebar.ejs
|-- alerts.ejs
|-- form-errors.ejs
|-- deployment-status.ejs
`-- footer.ejs
```

`head.ejs` must reference favicon, Apple touch icon, manifest, theme color, and social metadata. Email templates must use absolute public asset URLs.

## Web Manifest Baseline

```json
{
  "name": "HelloDeploy",
  "short_name": "HelloDeploy",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#E95420",
  "icons": [
    {
      "src": "/assets/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/assets/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Theme Definition of Done

- All pages use shared tokens and EJS partials.
- Light and dark themes are complete.
- Statuses remain understandable without color.
- Mobile and desktop layouts pass the required scenarios.
- Placeholder assets resolve without broken images.
- Replacing final artwork requires file replacement, not template rewrites.
