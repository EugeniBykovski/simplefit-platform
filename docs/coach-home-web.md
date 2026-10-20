# Coach web workspace, home and context switching (SF-54)

The Coach web shell, the first Coach dashboard and switching between a
person's Fighter and Coach contexts, against Claude Design **Version 90**
(`1791982482-71e3`), on the SF-50 CoachProfile and the SF-51 entry
(`resolveMyEntry`, `chooseMyEntryContext`).

## Design reconciliation

Up to Version 89 the Coach web artboards described a coaching business that
does not exist yet: a twelve-item sidebar with badges and a next-session
card, a dashboard of team metrics, sessions, fighters in camp and requests,
a first-run with licence review, services, payouts and a trial, and a
sign-in workspace chooser with a gym row and a per-device "remember my
choice". With approval, SF-54 reconciled them in Claude Design (SF-49 CR-8,
CR-9, CR-16):

| Artboard                      | Source                      | Route / place                        | Production                    | Status  |
| ----------------------------- | --------------------------- | ------------------------------------ | ----------------------------- | ------- |
| CoachWebNav (MVP)             | `CoachWebNav.dc.html`       | `web.app.coach` sidebar              | `WorkspaceShell` + `ShellNav` | current |
| ContextSwitcher               | `ContextSwitcher.dc.html`   | Fighter and Coach sidebars           | `ContextSwitcher`             | current |
| FighterWebNav (identity)      | `FighterWebNav.dc.html`     | `web.app.fighter` sidebar            | `WorkspaceShell`              | current |
| WC1 Coach dashboard (reduced) | `WebCoachDashboard.dc.html` | `/app/coach`                         | `CoachHome`                   | current |
| WCX1 Choose where to continue | `WebContextSelect.dc.html`  | `/app/context` (`context_selection`) | `ContextSelection`            | current |
| WA2 Sign in                   | `WebLoginWorkspace.dc.html` | `/login` (no workspace chooser now)  | unchanged sign-in             | current |
| CRW1 Coach first run          | `FirstRunWebC.dc.html`      | —                                    | —                             | FUTURE  |

The route diagrams follow in **Version 91** (`1791985352-6ddc`):
`RouteCoach.dc.html` draws WA3 → WA4 → WA5 → WCR1 → WCR2 → WCR7 → WC1 with
WCX1, the entry rules and the switcher, and lists WCR3–WCR6 and CRW1 as
FUTURE; `FlowWebRoute.dc.html` draws the same Coach row (WCR3–WCR6 dashed
FUTURE, no plan / checkout branch), WA2 as sign-in → entry and WCX1
(step 5.16a; it follows sign-in).

## Coach dashboard (WC1)

- **Data:** the saved CoachProfile only: coach name, brand, city and country,
  coaching formats, competition levels, coaching languages and bio.
- **Unavailable domains:** fighters, sessions and invitations show a dash and
  "not available yet", never `0`: no backend counts them. The setup
  checklist marks the completed profile and lists inviting a first fighter,
  planning a first session and the coach data rules as not available.
  Nothing links to a placeholder.
- **States:** loading (skeleton), failure (retry), ready.

## Coach sidebar (CoachWebNav MVP)

Dashboard (linked), then Fighters, Sessions and Coach settings as unlinked
rows marked Soon. SF-58 links Fighters (`docs/coach-fighters-web.md`), SF-64 links Sessions (`docs/coach-sessions-web.md`). The registry keeps the Route Gallery's twelve nav items and
their placeholder routes; production shows the MVP subset
(`D-WEB-COACH-HOME-MVP`).

## Context switching

- **The switcher** (Fighter and Coach sidebars, and the navigation sheet on
  narrow windows) shows the current context's profile name and opens the
  account's contexts. Every option comes from the entry the workspace gate
  resolved: completed contexts are the capabilities it reports; a context
  without its capability is a journey ("Continue … setup" when the profile is
  in progress, "Set up …" otherwise).
- **Opening a completed context** records the choice with the backend
  (`PUT /api/v1/me/entry/context`), resolves the entry again and goes where it
  answers. A failure keeps the user in the current context with a retry; one
  choice runs at a time. Choosing the current context does nothing.
- **Continuing a journey** resolves the entry with that journey's intent and
  goes to its onboarding. Nothing is recorded: an incomplete profile is never
  a context.
- **Requested versus remembered:** workspace gates check the capability, not
  the last choice, so `/app/coach` and `/app/home` open for anyone holding
  them; `/app` (and sign-in) follows the backend's remembered choice.
- **WCX1** is where the entry's `context_selection` lands (two completed
  contexts and no remembered choice, or two journeys in progress, E11). It
  shows only while the entry answers it; any other answer, including a choice
  made in another tab, continues there.
- Nothing about contexts is kept in the browser.

## Approved differences from the artboards

1. The menu is non-modal (`DropdownMenu modal={false}`), so the page behind
   stays in the accessibility tree; it is portalled to `<body>` and reached
   from its trigger in the sidebar.
2. The page header is 76 px plus its 1 px rule; the dashboard body starts
   22 px below it, as drawn.
3. Initials avatars are round in the switcher and the dashboard (the design
   tokens' `full` radius).

## Verification

- Unit: `features/session-gate/model/contexts.test.ts`,
  `features/session-gate/ui/context-switcher.test.tsx`,
  `widgets/coach-home/ui/coach-home.test.tsx`,
  `widgets/context-selection/ui/context-selection.test.tsx`,
  `widgets/workspace-shell/ui/workspace-shell.test.tsx`, the entry tests.
- Production (contract double): `e2e/production/coach-home.spec.ts`
  (completed Coach, Fighter becomes Coach, two completed contexts with
  refresh, Back / Forward and two tabs, failed and repeated choices, expired
  session, E11, access and forged links, narrow viewport) and
  `e2e/production/coach-home-geometry.spec.ts` (artboard anchors at
  1440 × 900, the laptop and desktop matrix, 1024 / 768 / 390, axe).
- Storybook: `src/stories/screens/coach-home`,
  `src/stories/screens/context-selection`, `e2e/coach-home-storybook.spec.ts`.
- Real backend: `e2e/real-api/coach-journey.spec.ts` (Coach registration →
  dashboard → Fighter setup from the switcher → switch back to Coach → sign
  out and in lands on Coach home).
