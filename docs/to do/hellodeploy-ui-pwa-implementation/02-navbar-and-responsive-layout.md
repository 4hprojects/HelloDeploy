# 02 - Navbar and Responsive Layout

## Objective

Replace inconsistent or page-specific navigation with one shared, responsive navigation system.

The navbar should remain simple.

---

# 1. Public Navigation

Recommended primary items:

```text
Product
How It Works
Docs
Supported Apps
```

Recommended utility/actions:

```text
Install
Sign In
Get Started
```

Do not keep Status as a primary navbar item.

Place Status in the footer or a secondary menu.

---

# 2. Authenticated Navigation

Recommended:

```text
Dashboard
Projects
Docs
```

Utilities:

```text
Install
Notifications
Account
```

If Notifications does not yet exist, omit it.

Do not add placeholder navigation solely to match this document.

---

# 3. Single Navigation Source

Create one navigation configuration.

Example:

```ts
export const publicNavItems = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Docs", href: "/docs" },
  { label: "Supported Apps", href: "/supported-apps" }
];

export const appNavItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Projects", href: "/projects" },
  { label: "Docs", href: "/docs" }
];
```

Desktop and mobile navigation must consume this same source.

Do not duplicate arrays.

---

# 4. Desktop Navbar

Target:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HelloDeploy   Product  How It Works  Docs  Supported Apps            │
│                                    Install  Sign In  [Get Started]   │
└──────────────────────────────────────────────────────────────────────┘
```

Rules:

- navbar remains one line
- no wrapping
- brand on left
- primary navigation next
- actions aligned right
- CTA visually stronger than utility links
- sticky at top if current design allows
- background should remain readable over all page content
- preserve active navigation indication

---

# 5. Mobile Navbar

At mobile/tablet threshold:

```text
┌───────────────────────────────────┐
│ HelloDeploy                ☰      │
└───────────────────────────────────┘
```

Do not squeeze desktop links into a smaller width.

Use a drawer or full-width menu.

---

# 6. Mobile Menu

Recommended public menu:

```text
Product
How It Works
Docs
Supported Apps
────────────────────
Install HelloDeploy
Sign In
Get Started
```

Authenticated:

```text
Dashboard
Projects
Docs
────────────────────
Install HelloDeploy
Account
Sign Out
```

---

# 7. Mobile Menu Behavior

Required:

- hamburger button is a `<button>`
- button has accessible name
- `aria-expanded` reflects open state
- open menu is keyboard accessible
- Escape closes menu
- route change closes menu
- clicking outside may close menu
- body scrolling should be controlled while drawer is open
- focus should remain within drawer where practical
- current route is visible
- menu must not overflow vertically on small phones

Use:

```css
max-height: calc(100dvh - var(--nav-height-mobile));
overflow-y: auto;
```

---

# 8. Sticky Navbar

Recommended:

```css
.navbar {
  position: sticky;
  top: 0;
  z-index: 50;
}
```

Before applying, verify it does not conflict with:

- modals
- dropdown menus
- dashboards
- toast notifications
- code editors
- terminal/log viewers

---

# 9. Navbar Height

Recommended:

```text
Mobile:  56–64px
Desktop: 64px
```

Keep page top spacing compatible with sticky navigation.

---

# 10. Navbar Responsive Strategy

Suggested:

```text
>= 1024px
  desktop navigation

< 1024px
  mobile navigation
```

If the current design framework uses another breakpoint, adapt it.

Requirement:

The navbar must never wrap.

---

# 11. Product and How It Works

If these remain homepage sections:

```text
/#product
/#how-it-works
```

Ensure:

- smooth navigation is optional
- sticky navbar offset does not cover section heading
- direct URLs work
- link from other pages returns to correct section

Example:

```css
section {
  scroll-margin-top: calc(var(--nav-height-desktop) + 16px);
}
```

Use the mobile value where needed.

---

# 12. Status

Move Status out of the primary navbar.

Suggested footer grouping:

```text
Platform
- Supported Apps
- Docs
- Status
- Service Limits
```

If real uptime monitoring is later added, Status can remain prominent in the footer or account menu.

---

# 13. Footer

Create one shared footer.

Suggested groups:

```text
Product
- Product
- How It Works
- Supported Apps

Resources
- Docs
- Status
- Service Limits

Company / Legal
- Privacy
- Terms
- Acceptable Use
```

Do not overload the footer.

Mobile footer groups may stack vertically.

---

# 14. Public Page Responsiveness

Audit these areas:

- homepage hero
- feature grids
- workflow steps
- supported application cards
- pricing/service limits
- FAQ
- footer
- authentication calls to action
- docs page
- status page

---

# 15. Hero Section

On desktop:

```text
Copy                          Visual / UI Preview
```

On mobile:

```text
Copy
CTA
Secondary CTA
Visual / UI Preview
```

Rules:

- no tiny two-column hero on mobile
- CTA buttons stack if necessary
- heading uses responsive font size
- visual never exceeds viewport width

---

# 16. Feature Cards

Use:

```text
Desktop: 3–4 columns
Tablet:  2 columns
Mobile:  1 column
```

Prefer auto-fit grid.

---

# 17. Workflow Steps

Desktop may use horizontal process flow.

Mobile should stack vertically.

Avoid forcing a horizontal timeline on narrow screens.

---

# 18. Documentation Layout

Desktop:

```text
┌──────────── Sidebar ───────────┬───────────────────────────────┐
│ Getting Started               │                               │
│ GitHub                        │ Documentation content         │
│ Environment Variables         │                               │
│ Deployment Process            │                               │
└───────────────────────────────┴───────────────────────────────┘
```

Mobile:

```text
[ Documentation Navigation ▼ ]

Documentation content
```

Alternative:

```text
[ ☰ Contents ]
```

The documentation menu should use a sheet, drawer, accordion, or select-like control.

Do not show a 250px sidebar next to a squeezed content column on phones.

---

# 19. Dashboard Layout

Recommended desktop:

```text
┌──────── optional sidebar ─────┬─────────────────────────────────┐
│ Dashboard                    │ Header                          │
│ Projects                     │                                 │
│ ...                          │ Main content                    │
└──────────────────────────────┴─────────────────────────────────┘
```

On mobile:

- collapse sidebar
- use top navigation or drawer
- content becomes full-width
- dashboard widgets stack
- data tables convert appropriately

---

# 20. Project List

Desktop table or grid is acceptable.

Mobile should favor cards.

Each mobile project card may show:

```text
Project name
Status
Production/staging
Domain
Last deployment
Primary action
Overflow menu
```

Do not expose every secondary field by default.

---

# 21. Deployment History

Desktop:

```text
Commit
Branch
Status
Started
Duration
Action
```

Mobile card:

```text
Status
Commit / message
Branch
Started
Duration
View details
```

---

# 22. Domains

Mobile domain card:

```text
hellopera.online
Production
Verified
SSL active

[ Manage ]
```

Avoid wide tables for DNS-related fields.

For DNS records, controlled horizontal scroll is acceptable.

---

# 23. Environment Variables

Mobile:

```text
KEY_NAME
••••••••••••
Production
[ Edit ]
```

Rules:

- values remain masked
- copying should require deliberate action
- do not allow page overflow from long names
- destructive delete actions must be separated

---

# 24. Logs

Logs may scroll horizontally within a bounded area.

Mobile should include:

- full width log viewer
- readable monospace size
- optional wrap toggle
- copy/download actions if already supported
- no page-level horizontal scroll

---

# 25. Responsive Acceptance Criteria

- [ ] Navbar never wraps.
- [ ] Desktop nav switches to mobile layout before crowding.
- [ ] Mobile menu works with keyboard and touch.
- [ ] Public pages use shared navbar.
- [ ] Authenticated pages use consistent product navigation.
- [ ] Status is no longer required as primary nav.
- [ ] Footer is shared.
- [ ] Docs sidebar collapses on mobile.
- [ ] Hero becomes single column on narrow screens.
- [ ] Feature cards collapse correctly.
- [ ] Dashboard widgets stack.
- [ ] Project tables have mobile representation.
- [ ] Deployment history has mobile representation.
- [ ] Domain management fits phone width.
- [ ] Environment variable UI fits phone width.
- [ ] Logs use bounded overflow.
