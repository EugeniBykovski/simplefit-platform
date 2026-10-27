# Web gym console, chooser and switcher (SF-88)

The first production Gym workspace on the web: the id-based gym console
(`/app/gyms/:gymId`), its WG1 dashboard, the gym chooser (`/app/gyms`) and the
gym switcher in the sidebar, on the SF-83 tenant and RBAC, the SF-84 entry
and the SF-85 setup API (ADR 0026 in simplefit-api), through the generated
client. Claude Design `1792675284-1046` (unchanged since SF-82).

## Design audit (2026-10-28, version `1792675284-1046`)

Claude Design is the visual source; the backend contract decides what exists.
Every Gym web board, classified against the current API:

| Artboard                                 | File                                     | Route                                       | Backend data                                           | Access                  | Status      | SF-88 action                                                                    |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| GymWebNav (sidebar, identity block)      | `GymWebNav.dc.html`                      | `web.app.gym` shell                         | `getGym`: name, role, locations; entry: gym workspaces | GYM_WORKSPACE           | MVP PARTIAL | Identity block = switcher; Dashboard linked; 19 items Soon, unlinked            |
| WG1 · Gym dashboard                      | `WebDashboard.dc.html`                   | `/app/gyms/:gymId`                          | `getGym`, `getGymSetup`                                | staff (backend per gym) | MVP PARTIAL | Header and two-column frame; real gym summary, details, access; R5 tiles hidden |
| GRW1 · Dashboard · opening week          | `FirstRunWebG.dc.html`                   | `/app/gyms/:gymId?state=opening-week`       | none (first-run experience keys, SF-101)               | —                       | FUTURE      | Not built (SF-101); no invented checklist                                       |
| GRW2 · Product tour                      | `FirstRunWebGTour(Steps).dc.html`        | console areas                               | none                                                   | —                       | FUTURE      | Not built (SF-101)                                                              |
| WCX1 · Choose where to continue          | `WebContextSelect.dc.html`               | `/app/context`                              | entry: profiles and gym workspaces                     | session                 | MVP         | Gym rows added (Fighter + Gym users land here, SF-84 rule 5)                    |
| WGC1 · Choose a gym (no own artboard)    | WCX1 composition                         | `/app/gyms`                                 | entry `gym_workspaces` (≤ 25) + `listMyGyms` pages     | session                 | MVP         | Built in the WCX1 composition                                                   |
| ContextSwitcher                          | `ContextSwitcher.dc.html`                | Fighter, Coach and Gym sidebars             | entry                                                  | session                 | MVP         | Extended with gyms (open, continue setup, all gyms)                             |
| WG2–WG27, GC2, GC10, GC11, SH0, AV6, AV7 | `WebGymBoard` … `WebGymPromoAnalytics`   | `/app/gyms/:gymId/<area>`                   | none (members, scheduling, staff, billing, community…) | —                       | FUTURE      | SF-32 placeholders, id-based; nav items Soon                                    |
| WG3, WG14, WG15 (members)                | `WebMembers` …                           | `/app/gyms/:gymId/members…`                 | none yet (SF-89 / SF-91)                               | —                       | FUTURE      | Placeholder                                                                     |
| WG16, WG17 (staff, roles)                | `WebStaff`, `WebRoles`                   | `/app/gyms/:gymId/staff`, `/settings/roles` | none yet (SF-92)                                       | —                       | FUTURE      | Placeholder                                                                     |
| WG22, WG23 (settings, locations)         | `WebGymSettings`, `WebLocations`         | `/app/gyms/:gymId/settings…`                | `updateGymSetup` exists; no designed MVP editor        | —                       | BLOCKED     | Placeholder until an editor is designed (SF-98)                                 |
| WG7, WG25, GC10, GC11 (money)            | `WebRevenue`, `WebGymBilling` …          | `/app/gyms/:gymId/revenue…`                 | none (D-G09, D-G10 deferred)                           | —                       | BLOCKED     | Placeholder; never linked                                                       |
| FlowGymWeb, RouteGym                     | `FlowGymWeb.dc.html`, `RouteGym.dc.html` | —                                           | —                                                      | —                       | reference   | Unchanged                                                                       |

No board draws a gym chooser, a gym switcher, a role-restricted state, a
non-owner dashboard or a WG1 composed of existing data. SF-82 R5/C7 (approved,
not applied) keeps only four WG1 tiles (today's classes, bookings, check-ins,
members), all on domains that do not exist yet, so R5 hides them.

### Deviations (approved 2026-10-28, `D-WEB-GYM-CONSOLE-MVP`)

1. **WG1 content.** The header (eyebrow `date · location`, "Dashboard") and
   the 1.7 : 1 two-column frame are WG1's; the cards are not. The left column
   shows OG1's "How members see you" card with the real gym (initials tile in
   the saved accent colour, name, type, primary location, "Setup complete")
   and, for the owner, the saved setup (address, phone, website, tagline,
   accent colour); the right column the viewer's access (role and its
   matrix description) and "Coming to your console" (members, classes &
   timetable, bookings & check-ins, coaches & staff, each "Later", no
   numbers). KPIs, today's classes, revenue, action needed, community and
   coaches on shift are hidden (SF-82 R5); the location filter and "Announce"
   are omitted (one location, no announcements domain).
2. **Non-owner roles.** No non-owner dashboard is designed: managers, coaches
   and front desk see the gym summary, their access and a limited-access
   notice. The owner sections key off the backend's role for this gym
   (`viewer.role`); every role may read the same gym data (SF-82: all staff
   view the console), so this is presentation, never a security boundary.
3. **Chooser.** `/app/gyms` uses the WCX1 composition and its row: the
   gym's initials, name, the viewer's role; completed gyms ("Open") apart
   from the user's draft ("Setup in progress", "Continue"); the completed
   profiles under "Your profiles"; no gym → "Register your gym".
4. **Switcher.** GymWebNav's identity block ("SB · Simple Boxing Gym ·
   OWNER · 3 LOCATIONS") is the ContextSwitcher trigger: initials, name,
   `ROLE · n LOCATION(S)`. Its menu lists "Your gyms" (completed gyms, the
   current one checked; the draft as "Continue gym setup"; "All gyms (n)"
   when the entry lists fewer than the user has), then "Your profiles".
5. **Navigation.** GymWebNav's 21 items keep their sections and order;
   only Dashboard is linked; the others are marked Soon and unlinked (the
   Coach MVP pattern, D-WEB-COACH-HOME-MVP). No badge counts.
6. **States without artboards** (production design-system composition, the
   in-shell card of the Coach detail states): not available (404), role
   restricted (403), draft gym, loading skeleton, failure with retry,
   partial failure of the details card.

### Proposed Claude Design changes (not applied; need approval)

- **WG1 MVP variant** on `WebDashboard.dc.html` (`state=mvp|owner|staff`):
  exactly deviation 1 and 2.
- **WCX1 variant `gyms`** on `WebContextSelect.dc.html`: deviation 3, also
  used as WGC1, plus the mixed lead "Your profiles and gyms live on one
  account."
- **GymWebNav identity** as the switcher trigger and the open menu
  (deviation 4), and the MVP item states (deviation 5).
- **Console states** on one board: not available, role restricted, draft.

No new file is needed (all are variants of existing boards).

## Routes (registry, `D-WEB-GYM-CONSOLE-MVP`)

| Route id                           | Path                      | Shell         | Access                          | Production                            |
| ---------------------------------- | ------------------------- | ------------- | ------------------------------- | ------------------------------------- |
| `web.app.gyms`                     | `/app/gyms`               | `web.app`     | session                         | `GymChooser` (WGC1)                   |
| `web.app.gyms._gym-id`             | `/app/gyms/:gymId`        | `web.app.gym` | GYM_WORKSPACE + backend per gym | `GymWorkspace` + `GymDashboard` (WG1) |
| `web.app.gyms._gym-id.<area>` (33) | `/app/gyms/:gymId/<area>` | `web.app.gym` | GYM_WORKSPACE + backend per gym | SF-32 placeholders                    |

- The 34 id-free `/app/gym/**` placeholders moved to `/app/gyms/:gymId/**`
  (ADR 0026 D-G23); no parallel URLs remain. The `web.app.gym` shell declares
  `params: ["gymId"]`, so its nav items name the gym of the page.
- Entry: `gym_home` → `/app/gyms/<entry.gym_id>` (an entry without `gym_id`
  is not mapped: a controlled failure); `gym_selection` → `/app/gyms`;
  `context_selection` → WCX1 with gym rows. `GYM_WORKSPACE`'s web home is
  `/app/gyms`, which opens the only gym directly.
- Mobile is unchanged (`mobile.gym.pulse`, A04); the registry and
  `route-architecture.md` are synced to simplefit-mobile.
- Route rule 9: in the console, 403 renders the role-restriction state
  (D-G24); 404 renders not found.

## Data, cache and security

- **Gym in the path, authorized per request.** The layout reads
  `GET /api/v1/gyms/{gym_id}` for the URL's id (`useGym(gymId)`, key
  `getGetGymQueryKey(gymId)`, re-read on focus); pages render only with that
  answer and only for that id. 404 (unknown, foreign, malformed, revoked) →
  not available, never revealing which; 403 → role-restricted; 401 → the
  session layer refreshes once, then signs in again.
- **No global selected gym.** `PUT /me/entry/context` records a deliberate
  choice as the landing preference for `/app` (SF-84); it never decides what
  a console URL shows. Two tabs on two gyms stay independent.
- **Late answers.** Each gym is its own query key, without
  `keepPreviousData`; a console of another gym mounts anew. A read abandoned
  by a switch is cancelled; it can only ever land under its own gym's key.
- **Session boundary.** Sign-out and account changes clear the whole query
  cache (`onSessionBoundary`); calls from a previous session are dropped. No
  gym data in browser storage.
- **Draft vs operational.** A draft never renders console pages (its owner
  continues setup); `continue_setup` and `enter` come from the backend's
  `available_actions`.
- **Training data.** No gym screen reads or links to any fighter's private
  training data; no gym role grants it (D-G06).

## Accessibility and localization

All copy in the seven locales (`gymConsole`, additions to
`contextSelection`; plural location counts in ICU). The switcher is the
Radix menu (`aria-expanded`, `menuitemradio` with `aria-checked`, keyboard,
focus returned to the trigger); a console that mounts for another gym
announces it (`role=status`) and moves focus to `#main` when focus was left
on the document. axe (WCAG 2.1 A/AA and best practice) runs on the console,
the open switcher, the chooser and the not-available state in dark and light.

## Verification

- Unit: `entities`/`features/session-gate` (entry mapping with `gym_id`,
  switcher gyms and failures), `widgets/gym-workspace` (owner data only,
  404, 403, draft, retry, revocation, limited roles, partial failure, a late
  answer after a switch), `widgets/gym-chooser` (none, one, several, draft,
  paging past 25, profiles), WCX1 gym rows, the shell's gym navigation.
- Storybook: `Gym Console/Console and chooser` (owner, light, long name,
  manager, coach, front desk, 404, 403, draft, loading, offline, retry,
  partial failure, session expired, switcher, switching, German; chooser
  several / with draft / none / paged), checked by
  `e2e/gym-console-storybook.spec.ts`.
- Production (`e2e/production/gym-console.spec.ts`, Chromium, Firefox,
  WebKit, mocked network edge): entry, chooser, switching, history, reload,
  two tabs, late answer, owner and non-owner, foreign and revoked gym, sign
  out, outage and retry, geometry at 1440 and ten widths (1920–375), axe in
  both themes, keyboard.
- Real backend (`e2e/real-api/gym-console.spec.ts`, Phoenix + PostgreSQL,
  scenarios A–R; J has no member domain yet).
