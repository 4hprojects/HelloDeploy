# Desktop-first UI/UX Specification

## Layout and priority

Main `/admin` content spans >=95% of **available content area**, measured after sidebar/padding, not 95% of viewport. Remove article-style `max-width` from dashboard only. Use CSS Grid with a 12-column conceptual layout or responsive `minmax()` implementation; avoid hardcoded oversized cards. Preserve branding, theme, keyboard navigation and existing navigation structure.

Proposed hierarchy:

1. Sticky compact page header: `Admin Operations`, LIVE/DEGRADED/STALE badge, last updated, manual refresh, Settings.
2. Critical/active incident strip (hide only when none, with compact healthy summary).
3. Six compact KPIs where width allows: CPU, available/used RAM, disk, network, healthy applications, deployment state.
4. Resource trend charts and allocation/headroom with visible units and selected time range.
5. Applications/containers table and deployment status with priority on active problems.
6. Services and Build Service, administrative attention, reviews and recent activity.

Desktop reference allocation (flexible):

- 1920px: 6 KPI cards; two significant charts side by side or 2/3+1/3 split, two dense tables below.
- 2560px: more columns/side panels or richer tables, **not** giant whitespace or arbitrarily wide unreadable text.
- 1366px: 3–4 KPIs across, adaptive 2-column panels, no clipping.
- 1024px: two-column, below 768px stacked.
- At 100%, 125%, 150% zoom panels remain accessible without body horizontal overflow.

## Personal controls

Collapsible sidebar (about 56–64px collapsed, current expanded width preserved unless audit justifies change); compact/comfortable/spacious density with Compact default; visible optional panels, selected history range, theme, preferred refresh, row count. Persist per admin. Never hide critical status entirely through personalization.

## Visual detail

Keep title/header height modest; padding 20–24px desktop, gaps 12–16px, compact table rows; use readable typography and minimum tap/click targets. Trends use sparklines with correct units/time windows. Charts support hover, keyboard-accessible summary, legends, source, timestamps, stale gaps. Don't animate every update or reorder tables while reading. Show empty, loading, forbidden, partial, stale and collector-down states. For a metric with no data use `Unavailable`, never zero.

## UI measurement gates

Capture screenshots at 1366x768, 1600x900, 1920x1080, 2560x1440, 1024x768 and mobile 390x844, in light and dark themes; test 100/125/150% zoom. Measure main content utilization, number of primary cards above fold, overflow, contrast, keyboard access, layout stability. Compare baseline screenshot and revised screenshot. At 1920x1080 top of page should show health, active alerts, six KPIs and meaningful resource trend context wherever feasible; don't force tiny unreadable charts simply to fit.
