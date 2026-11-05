# Web gym console, chooser and switcher (SF-88)

The first production Gym workspace on the web: the id-based gym console
(`/app/gyms/:gymId`), its WG1 dashboard, the gym chooser (`/app/gyms`) and the
gym switcher in the sidebar, on the SF-83 tenant and RBAC, the SF-84 entry
and the SF-85 setup API (ADR 0026 in simplefit-api), through the generated
client. Claude Design `1792675284-1046` (unchanged since SF-82).

## Design audit (2026-10-28, version `1792675284-1046`)

Claude Design is the visual source; the backend contract decides what exists.
Every Gym web board, classified against the current API:

| Artboard                                 | File                                     | Route                             | Backend data                                           | Access                  | Status      | SF-88 action                                                                    |
| ---------------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------------------------------ | ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| GymWebNav (sidebar, identity block)      | `GymWebNav.dc.html`                      | `web.app.gym` shell               | `getGym`: name, role, locations; entry: gym workspaces | GYM_WORKSPACE           | MVP PARTIAL | Identity block = switcher; Dashboard linked; 19 items Soon, unlinked            |
| WG1 · Gym dashboard                      | `WebDashboard.dc.html`                   | `/app/gyms/:gymId`                | `getGym`, `getGymSetup`                                | staff (backend per gym) | MVP PARTIAL | Header and two-column frame; real gym summary, details, access; R5 tiles hidden |
| GRW1 · Dashboard · opening week          | `FirstRunWebG.dc.html`                   | `/app/gyms/:gymId` (owner)        | `getGymFirstRun` (SF-90)                               | —                       | MVP         | Built in SF-91 from Claude Design 112 (see below)                               |
| GRW2 · Product tour                      | `FirstRunWebGTour(Steps).dc.html`        | `/app/gyms/:gymId` (overlay)      | client-only steps; SF-90 outcomes                      | —                       | MVP PARTIAL | SF-91: 4 MVP steps + complete; 7 FUTURE steps not built                         |
| WCX1 · Choose where to continue          | `WebContextSelect.dc.html`               | `/app/context`                    | entry: profiles and gym workspaces                     | session                 | MVP         | Gym rows added (Fighter + Gym users land here, SF-84 rule 5)                    |
| WGC1 · Choose a gym (no own artboard)    | WCX1 composition                         | `/app/gyms`                       | entry `gym_workspaces` (≤ 25) + `listMyGyms` pages     | session                 | MVP         | Built in the WCX1 composition                                                   |
| ContextSwitcher                          | `ContextSwitcher.dc.html`                | Fighter, Coach and Gym sidebars   | entry                                                  | session                 | MVP         | Extended with gyms (open, continue setup, all gyms)                             |
| WG2–WG27, GC2, GC10, GC11, SH0, AV6, AV7 | `WebGymBoard` … `WebGymPromoAnalytics`   | `/app/gyms/:gymId/<area>`         | none (members, scheduling, staff, billing, community…) | —                       | FUTURE      | SF-32 placeholders, id-based; nav items Soon                                    |
| WG3 (members), OG12 (import preview)     | `WebMembers`, `WebSetupImport`           | `/app/gyms/:gymId/members`        | SF-95 members, requests, invitations, enrollment       | per action (below)      | MVP PARTIAL | Built in SF-96 (see below)                                                      |
| WG5 (timetable), OG10 (setup timetable)  | `WebTimetable`, `WebSetupTimetable`      | `/app/gyms/:gymId/timetable`      | SF-97 venues, templates, series, classes               | per action (below)      | MVP PARTIAL | Built in SF-98 (see below)                                                      |
| WG14, WG15 (member detail, ban)          | `WebMemberDetail`, `WebMemberBan`        | `/app/gyms/:gymId/members/:id`    | none (no member detail, suspension or ban domain)      | —                       | FUTURE      | Placeholder                                                                     |
| WG16 (staff)                             | `WebStaff`                               | `/app/gyms/:gymId/staff`          | SF-93 staff and invitations                            | per action (below)      | MVP         | Built in SF-94 (see below)                                                      |
| WG17 (roles matrix)                      | `WebRoles`                               | `/app/gyms/:gymId/settings/roles` | none (no matrix read for all roles)                    | —                       | FUTURE      | Placeholder; the staff page carries the matrix in words                         |
| WG22, WG23 (settings, locations)         | `WebGymSettings`, `WebLocations`         | `/app/gyms/:gymId/settings…`      | `updateGymSetup` exists; no designed MVP editor        | —                       | BLOCKED     | Placeholder until an editor is designed (SF-98)                                 |
| WG7, WG25, GC10, GC11 (money)            | `WebRevenue`, `WebGymBilling` …          | `/app/gyms/:gymId/revenue…`       | none (D-G09, D-G10 deferred)                           | —                       | BLOCKED     | Placeholder; never linked                                                       |
| FlowGymWeb, RouteGym                     | `FlowGymWeb.dc.html`, `RouteGym.dc.html` | —                                 | —                                                      | —                       | reference   | Unchanged                                                                       |

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

### Claude Design handoff (not applied; needs approval)

Exact corrections against version `1792675284-1046`, each a revision or a
variant of an existing structured board (no new file; the canvas stays under
its 512-file limit). SF-82 references are to
`simplefit-api/docs/architecture/proposals/SF-82-gym/12-design-reconciliation-plan.md`.

| #   | Board (file)                                                                  | Today                                                                                                                    | Correction                                                                                                                                                                                                                                                                                                                                                                                                                               | Production reference                  | SF-82                 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------- |
| H1  | WG1 · Gym dashboard (`WebDashboard.dc.html`)                                  | Five KPI cards, Today's classes, Revenue · 30 days, Action needed, Community, Coaches on shift; location tabs; Announce  | Add `state=mvp` (keep the full board as FUTURE). Keep the 76 px header (eyebrow `SAT · OCT 3 · <location>`, "Dashboard"); remove the location tabs while a gym has one location and Announce until announcements exist. Body 1.7 : 1, 16 px gap: left H7 + H2a; right "Your access" + "Coming to your console"                                                                                                                           | `GymDashboardView`                    | R5, C7                |
| H2a | WG1 owner section (same board)                                                | —                                                                                                                        | "Gym details" card (22 px radius): rows Address (line, city · country, entrance note), Phone, Website, Tagline, Accent colour (swatch + name), "Not added" when empty; its own inline error with Try again                                                                                                                                                                                                                               | `GymDetails`                          | R5                    |
| H2b | Coming soon (same board)                                                      | Fabricated tiles                                                                                                         | "Coming to your console" list: Members, Classes & timetable, Bookings & check-ins, Coaches & staff, each with a clock icon, one line and a "Later" badge; never a number or zero                                                                                                                                                                                                                                                         | `ComingLater`                         | R5 (hidden, not zero) |
| H3  | Gym chooser (`WebContextSelect.dc.html`)                                      | Variants `completed`/`setup` with Fighter and Coach rows only                                                            | Add `variant=gyms` (WGC1, `/app/gyms`): eyebrow YOUR GYMS, "Which gym do you want to open?"; groups Gyms (initials tile, gym name, role, Open), Setup in progress (draft, "Not set up yet · only setup continues", Continue), Your profiles; "Show more gyms (n in total)"; empty "You don't work at a gym yet" + Register your gym. Add gym rows to `variant=completed` with the lead "Your profiles and gyms live on one account."     | `GymChooserView`, `ContextChooser`    | R1 (entry)            |
| H4  | Gym switcher (`GymWebNav.dc.html` identity, `ContextSwitcher.dc.html`)        | Identity block is a static link "SB · Simple Boxing Gym · OWNER · 3 LOCATIONS"; ContextSwitcher has Fighter ↔ Coach only | Draw the identity block as the ContextSwitcher trigger (chevrons, 212 px, `ROLE · n LOCATION(S)`), and an open state: "Your gyms" (menuitemradio rows: tile, name, role, current checked), "Continue gym setup" (dashed plus, draft name), "All gyms (n)", separator, "Your profiles", footnote; pending ("Opening…") and failed states as ContextSwitcher                                                                               | `ContextSwitcher` (`gym` prop)        | —                     |
| H5  | Non-owner dashboard (`WebDashboard.dc.html`)                                  | None                                                                                                                     | `state=staff`: H7 summary (no accent tile), "Your access" with the role and its matrix line, "Your dashboard" card with the amber notice "The <Role> dashboard isn't available yet. You can open this gym; its tools arrive with their features." No owner-only fields; no wording that gym data is private to owners                                                                                                                    | `LimitedAccess`, `YourAccess`         | C10 (matrix)          |
| H6  | 403 restricted (`StatesSheet.dc.html`)                                        | "PERMISSION DENIED · Members only" (amber, lock) for a member-only community                                             | Add a card "ROLE RESTRICTED · GYM" (`/app/gyms/:gymId/…`): amber tone, lock, "Your role doesn't include this", body as production, action "Back to the dashboard". Align "UNAVAILABLE GYM" for the console 404: "This gym isn't available", "It doesn't exist, or you don't work there.", action "Your gyms" (production now uses the olive tile with a lock / search icon inside the console card; adopt the sheet's tones on approval) | `GymRestricted`, `GymNotAvailable`    | D-G24                 |
| H7  | Gym identity and location (`WebSetupGym.dc.html` "How members see you" → WG1) | OG1's preview card: logo tile, name, "Boxing · Fitness boxing · Praga, Wola, Mokotów", cover placeholder                 | Reuse on WG1 as "Your gym": 56 px tile with initials on the saved accent colour (olive tile when none), name (Unbounded, wraps), `<type> · <city>, <country>` of the primary location, badge "Setup complete"; no cover, no multi-location list, no handle or URL                                                                                                                                                                        | `GymSummary`                          | C2, C4                |
| H8  | Coming-soon navigation (`GymWebNav.dc.html`)                                  | 21 linked items with badges 4, 2, 12                                                                                     | `active` plus a `mvp` flag: Dashboard linked; every other item muted, unlinked, with a "Soon" tag (CoachWebNav MVP pattern); remove the badges                                                                                                                                                                                                                                                                                           | `shellNavigation["web.app.gym"].soon` | R5                    |
| H9  | Draft gym in the console (WG1 board or StatesSheet)                           | None                                                                                                                     | Card "This gym isn't set up yet" (wrench) with "Continue setup" for the owner, "Its console opens once the owner completes setup." for others                                                                                                                                                                                                                                                                                            | `GymDraftState`                       | D-G05                 |

GRW1 / GRW2 (first run) are not part of this handoff: they stay with
SF-101 (C7 checklist from real state).

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

## SF-91: the owner's first run (GRW1, GRW2)

Claude Design 112 (`1793198527-a0fc`, artifact `JEsBg51MjX8KiHWEro8omY`)
supersedes the opening-week GRW1 and the five-step timetable GRW2 of
`1792675284-1046`; those are not implemented. Its structured artboards were
reconciled before coding: GRW1 `FirstRunWebG` draws 11 states
(`not_started`, `in_progress`, `pending`, `failed`, `skip_confirm`,
`completed`, `dismissed`, `loading`, `error`, `session_expired`, `revoked`);
GRW2 `FirstRunWebGTour` draws 4 MVP steps (checklist, gym and access, the
menu's Soon items, the switcher) plus `done`, `finishing`, `finish_failed` and
`confirm`, and 7 FUTURE steps (`f-board`, `f-people`, `f-timetable`,
`f-bookings`, `f-community`, `f-money`, `f-public`) for domains that do not
exist. Only the 4 MVP steps are built; no FUTURE target is anchored or
reachable.

**Behaviour** (`widgets/gym-workspace`, `entities/gym-first-run`):

- Only a viewer with `manage_first_run` (the owner) reads
  `GET /api/v1/gyms/{gym_id}/first-run`; managers, coaches and front desk
  never call it and keep WG1. A `403` keeps WG1; a `404` re-reads the gym
  (not available). The console never waits on the first run: a failed read
  shows "We couldn't load your introduction and checklist" with Try again,
  beside the gym cards.
- `not_started` and `in_progress` render GRW1 in WG1's 1.7 : 1 frame: the
  introduction (Start the tour / Resume tour with the start date, Skip
  introduction) and the checklist, then the gym and access cards on the
  right. WG1's details and coming-later cards return once the first run ends.
- The checklist renders the API's five items, in its order, with its
  statuses (`completed` Done, `available`, `coming_later` under "More tools
  are coming"). Nothing is derived, counted or linked; the introduction's
  outcome changes no item.
- Start and Resume call `startGymFirstRun` (idempotent) and open GRW2 only
  when the backend answers `in_progress`. Back and Next record nothing (a
  resumed tour starts at step 1 on any device). Finish calls
  `completeGymFirstRun`; End tour or Escape asks first, then
  `dismissGymFirstRun`; Skip introduction asks in a dialog, then dismisses.
  Only the backend's answer moves the page; a failure keeps the state with
  "Nothing changed".
- `completed` and `dismissed` never reopen: the page that kept the outcome
  says it once (notice), every later visit, device and sign-in shows WG1.
  A `409` (another device kept the other outcome) closes the tour or dialog
  and shows the outcome the backend kept. `unavailable` (a draft) never
  reaches the console. Nothing about the first run is in the URL or browser
  storage; the cache is keyed per gym, so Gym A and Gym B are independent.
- The tour is one modal dialog: focus stays in the card (Tab, Arrow keys,
  Escape asks to end), the page is inert, the spotlight re-measures on
  resize and scroll and is clipped to the scrolling sidebar; focus returns
  to the page heading (or to Skip introduction after "Keep it").

**Differences from Claude Design 112** (`D-WEB-GYM-FIRST-RUN`, resolved):

1. The artboards are a fixed 1440 × 900 frame with a 612 px checklist;
   production is content-sized from 390 to 1920 px (geometry at 1440 matches
   the frame: sidebar 240, 16 px gaps, 1.7 : 1 columns).
2. "Your gym is ready" heads the checklist only when the API reports
   `create_gym` completed; otherwise the neutral "Your gym's checklist".
3. Step 2 spotlights the gym and access cards together (one union box).
4. The card sits 22 px beside its target with an arrow when it fits; at
   1280 px and below it slides to the viewport edge without the arrow; when
   the target is hidden (the sidebar is a sheet below `md`) or there is no
   room it is centred over the dimmed page.
5. `pending` is the Start button's loading state and `failed` its inline
   alert; `session_expired` and `revoked` are the console's shared session
   and not-available states, not first-run cards.
6. The completed and dismissed notices show only on the page that kept the
   outcome; there is no tour replay (FUTURE).
7. Warning text uses `text-warning-subtle-foreground`: the artboards' amber
   `text-warning` on the bone card is 2.19 : 1 in the light theme (axe).

**Verification:** unit and widget tests (`model/tour.test.ts`,
`ui/gym-first-run.test.tsx`); production E2E
`e2e/production/gym-first-run.spec.ts` (mocked network edge, 1440 × 900:
every GRW1 and GRW2 state, geometry, widths 390–1920, keyboard, focus, axe in
dark and light with the theme actually switched); real backend
`e2e/real-api/gym-first-run.spec.ts` (Phoenix + PostgreSQL: first visit with
no row, start, finish with the `first_run_completed` audit event, reload and
sign-in never reopen, Gym A/B independence, cross-device resume and skip, a
late finish answered `409`, manager `403` with no request from the page,
stranger `404`).

Finding outside SF-91: the SF-86 and SF-88 production "light" axe runs only
call `emulateMedia`, which does not switch next-themes (`simplefit-theme` in
localStorage, default dark), so they test the dark theme twice. The SF-91
spec sets the stored theme and asserts the `html` class.

## SF-94: coaches & staff (WG16)

Claude Design 112 (`1793198527-a0fc`) is unchanged; WG16 `WebStaff`, OG11
`WebSetupTeam` and WG17 `WebRoles` still carry the pre-SF-82 content, so the
SF-82 corrections R4, R7, R10, R11 and C10–C16 apply (`D-WEB-GYM-STAFF`).

### Design inventory

| Artboard / state                           | Route                    | API operation                                          | Permission                                        | Status                       | Implementation                                                     |
| ------------------------------------------ | ------------------------ | ------------------------------------------------------ | ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| WG16 header: eyebrow, title                | `/app/gyms/:gymId/staff` | `getGym` (console)                                     | `view_staff`                                      | MVP                          | Built                                                              |
| WG16 header: Invite                        | same                     | `createGymStaffInvitation`                             | `invite_staff` (+ `invite_manager` for manager)   | MVP                          | Dialog: email, role                                                |
| WG16 header: search                        | —                        | none                                                   | —                                                 | FUTURE                       | Not built (no search domain)                                       |
| WG16 header: Roles & permissions → WG17    | `/settings/roles`        | none                                                   | —                                                 | FUTURE                       | Not linked; the roles card says the matrix in words                |
| WG16 tile TEAM + breakdown                 | same                     | `listGymStaff` (active)                                | `view_staff`                                      | MVP                          | Shown once the list is complete                                    |
| WG16 tile ON SHIFT NOW                     | —                        | none                                                   | —                                                 | FUTURE                       | Not built (R11)                                                    |
| WG16 tile PENDING INVITES                  | same                     | `listGymStaffInvitations`                              | `view_staff_records`                              | MVP                          | Shown once the list is complete                                    |
| WG16 roster: person, role, status          | same                     | `listGymStaff`                                         | `view_staff`                                      | MVP                          | Person, role, joined, status                                       |
| WG16 roster: LOCATION, LAST ACTIVE         | —                        | none                                                   | —                                                 | FUTURE                       | Not built                                                          |
| WG16 roster: INVITED rows                  | same                     | `listGymStaffInvitations`                              | `view_staff_records`                              | MVP PARTIAL                  | Their own Invitations card, never roster rows                      |
| WG16 roster: ON SHIFT, Head coach          | —                        | none                                                   | —                                                 | FUTURE                       | Not built (R11, D-G03)                                             |
| WG16 roster: ended staff                   | same                     | `listGymStaff?status=ended`                            | `view_staff_records`                              | MVP                          | Ended view                                                         |
| WG16 detail panel: name, role, since       | same                     | `listGymStaff`                                         | `view_staff`                                      | MVP                          | Built                                                              |
| WG16 detail panel: permission checklist    | —                        | none                                                   | —                                                 | MVP PARTIAL                  | The role in words (C10); no fighter notes, sparring, payments (R7) |
| WG16 detail: Change role                   | dialog                   | `changeGymStaffRole`                                   | `change_staff_role` (manager: coach ⇄ front desk) | MVP                          | Built                                                              |
| WG16 detail: Remove from team              | dialog                   | `endGymStaffMembership`                                | `remove_staff` (manager: coach, front desk)       | MVP                          | Built; Leave for one's own row                                     |
| OG11 invite row: email, role               | dialog                   | `createGymStaffInvitation`                             | as above                                          | MVP                          | Built                                                              |
| OG11 invite row: location                  | —                        | none                                                   | —                                                 | FUTURE                       | Not built (no per-member location)                                 |
| OG11 roles panel                           | staff page               | none (copy)                                            | —                                                 | MVP PARTIAL                  | Roles card from the MVP matrix (C10)                               |
| Invitation resend / cancel                 | staff page               | `resendGymStaffInvitation`, `cancelGymStaffInvitation` | as inviting that role                             | MVP                          | Built; cancel confirmed                                            |
| Loading, empty, error, retry               | staff page               | —                                                      | —                                                 | MVP                          | Built                                                              |
| Not available (404), role-restricted (403) | console                  | `getGym`                                               | —                                                 | MVP                          | The console's shared states                                        |
| E06 recipient page `/invite/staff`         | `/invite/staff`          | SF-93 recipient operations                             | the invited address                               | MVP                          | Built by SF-133 (below); no web artboard                           |
| Mobile inbox                               | —                        | SF-93 recipient operations                             | —                                                 | BLOCKED (not in this ticket) | Not built on the web                                               |

### Behaviour

- **Data:** every read and write names the gym in the path; query keys
  carry the gym id, the page is keyed by gym, and the session boundary
  clears the cache. Nothing is stored in the browser.
- **Actions** are offered from the viewer's permission projection
  (`staffCapabilities`): the owner may invite and manage managers, coaches and
  front desk; a manager coaches and front desk only (expressed by the absence
  of `invite_manager`); coaches and front desk see a read-only roster. The
  backend decides every request: a refusal is said in the dialog and the
  page re-reads the roster, invitations, gym and checklist.
- **Invite:** email and role only. A new invitation and the already pending
  one (201 / 200) read the same: pending until its expiry. A dropped answer
  claims nothing (sending again returns the pending invitation).
- **Role change and removal** wait for the backend; removal and leaving are
  confirmed, naming the gym and saying the account and other gyms are not
  affected. Leaving re-reads the gym, which then shows as not available.
- **Checklist:** the dashboard's available `invite_staff` links here for a
  viewer who may invite; only the backend completes it.

## SF-96: members (WG3) and the member-list import preview (OG12)

Claude Design 112 (`1793198527-a0fc`) is unchanged and still the latest
version. WG3 `WebMembers`, WG14 `WebMemberDetail`, WG15 `WebMemberBan`, OG8
`WebSetupPlans` and OG12 `WebSetupImport` are all marked FUTURE and carry the
pre-SF-82 content (plans, payments, visits, an import that sends invitations
and merges duplicates). The SF-95 contract, D-G06, D-G09/D-G10 (deferred) and
the proposed D-G27 decide what exists (`D-WEB-GYM-MEMBERS`). Claude Design
was not changed.

### Design inventory

| Artboard / state                                    | Route                      | API operation                                               | Permission                                             | Status      | Implementation                                                           |
| --------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| WG3 header: title                                   | `/app/gyms/:gymId/members` | `getGym` (console)                                          | console access                                         | MVP         | Built (eyebrow, title)                                                   |
| WG3 header: total ("612")                           | same                       | none (no count operation)                                   | —                                                      | MVP PARTIAL | Count beside the roster only once the list is complete                   |
| WG3 header: search, Export CSV                      | —                          | none                                                        | —                                                      | FUTURE      | Not built                                                                |
| WG3 header: + Add member                            | same                       | `createGymMemberInvitation`                                 | `manage_member_enrollment`                             | MVP PARTIAL | "Invite member" (email only); gated by the server (409, below)           |
| WG3 tabs All, Active                                | same                       | `listGymMembers?status=active`                              | `view_members` (all scope)                             | MVP         | Active / Ended toggle                                                    |
| WG3 tabs At risk, Frozen, Expired, Trials           | —                          | none                                                        | —                                                      | FUTURE      | Not built (no attendance, freeze, plan or trial domain)                  |
| WG3 roster: MEMBER, STATUS                          | same                       | `listGymMembers`                                            | `view_members`                                         | MVP         | Member, joined, joined with, status                                      |
| WG3 roster: PLAN, LOCATION, LAST VISIT, 30 D        | —                          | none                                                        | —                                                      | FUTURE      | Not built (D-G10, no attendance)                                         |
| WG3 roster: DISCOVERABLE                            | —                          | none                                                        | —                                                      | FUTURE      | Not built (a member's own privacy, not the gym's)                        |
| Ended memberships                                   | same                       | `listGymMembers?status=ended`                               | `view_members`                                         | MVP         | Ended view: ended, how it ended                                          |
| WG3 panel: name, since                              | same                       | `listGymMembers`                                            | `view_members`                                         | MVP         | Person, joined with, asked on, approved (auto / gym)                     |
| WG3 panel: visits, renewal, payment, waiver, coach  | —                          | none                                                        | —                                                      | FUTURE      | Not built                                                                |
| WG3 panel: "Gym admin can't see"                    | same                       | none (copy)                                                 | —                                                      | MVP         | Kept (D-G06), plus "not a paid plan or subscription"                     |
| WG3 panel: Open member (WG14), Message              | —                          | none                                                        | —                                                      | FUTURE      | Not linked; WG14/WG15 stay placeholders                                  |
| End membership (WG15 "end")                         | dialog                     | `removeGymMember`                                           | `change_member_status` (owner, managers)               | MVP         | Confirmed; spares account, profiles, coaches, other gyms                 |
| WG15 suspend, ban                                   | —                          | none                                                        | —                                                      | FUTURE      | Not built                                                                |
| Join requests (no artboard)                         | tab                        | `listGymJoinRequests`, `approve…`, `rejectGymJoinRequest`   | `manage_member_enrollment`                             | MVP         | Approve (one click), reject (confirmed)                                  |
| Member invitations (no artboard)                    | tab                        | `listGymMemberInvitations`, `resend…`, `cancel…`            | `manage_member_enrollment`                             | MVP         | Masked address, backend status; resend, cancel (confirmed)               |
| Invitations off (409 `recipient_flow_unavailable`)  | dialog, tab                | `createGymMemberInvitation`, `resendGymMemberInvitation`    | —                                                      | MVP         | "Nothing was created and no email was sent"; invite and resend withdrawn |
| Join code, rotate, disable (no artboard)            | tab                        | `getGymEnrollmentSettings`, `rotateGymJoinCode`, `disable…` | read: `manage_member_enrollment`; change: `can_manage` | MVP         | Code, copy; new code and turn off confirmed                              |
| Auto-approval (no artboard)                         | tab                        | `updateGymEnrollmentSettings`                               | `can_manage` (owner, managers)                         | MVP         | Switch; turning on explained and confirmed                               |
| OG8 Memberships (priced plans)                      | —                          | none (D-G10)                                                | —                                                      | FUTURE      | Not built; WG6/GC2 stay placeholders                                     |
| OG12 file card                                      | tab                        | none (browser)                                              | `manage_member_enrollment`                             | MVP         | Choose CSV; 1 MB, UTF-8, header names checked locally                    |
| OG12 column mapping: name, email                    | tab                        | `previewGymMemberImport` (`mapping`)                        | `manage_member_enrollment`                             | MVP         | Email (suggest or a column), name (optional)                             |
| OG12 column mapping: plan, start date, phone        | —                          | none                                                        | —                                                      | FUTURE      | "Other columns aren't used"; listed as not used in the result            |
| OG12 "Before you send": Ready, Missing email        | tab                        | `previewGymMemberImport` (`summary`)                        | `manage_member_enrollment`                             | MVP         | Every outcome the backend returns, row by row, masked                    |
| OG12 "Duplicates merged"                            | tab                        | `summary.duplicate`, `duplicate_of_line`                    | —                                                      | MVP PARTIAL | Duplicates shown, never merged                                           |
| OG12 "Send invite emails", Continue                 | —                          | none (commit blocked, D-G27)                                | —                                                      | BLOCKED     | Not built; "Importing members is not available yet"                      |
| Loading, empty, error, retry, restricted (403)      | page                       | —                                                           | —                                                      | MVP         | Built per tab                                                            |
| Not available (404), session (401)                  | console                    | `getGym`                                                    | —                                                      | MVP         | The console's shared states                                              |
| Recipient page `/invite/gym`, mobile join and inbox | —                          | SF-95 `/me` operations                                      | —                                                      | BLOCKED     | Not in this ticket; E07 stays gated off in production                    |

### Behaviour

- **Data:** every read and write names the gym in the path; query keys
  carry the gym id, the page is keyed by gym, and the session boundary
  clears the cache. The join code is held only while shown (`gcTime: 0`).
- **Permissions** come from the viewer's projection: `manage_member_enrollment`
  (owner, managers, front desk) opens requests, invitations, the code and
  the import preview; `change_member_status` (owner, managers) ends a
  membership; the settings' own `can_manage` decides rotation, disabling and
  auto-approval. A coach holds `view_members` only for their own classes;
  the backend refuses the roster (403) and the page shows it as restricted.
- **Nothing before the answer:** approving does not add a roster row; the
  roster, requests, invitations, settings, gym and checklist are read again
  after every answer. A request decided elsewhere (409 `gym_member: …`) is
  said as such. A lost answer claims nothing.
- **Invitations:** an invitation is pending until its expiry, never "sent".
  Where the server answers 409 `recipient_flow_unavailable` (production
  until the recipient page exists), the dialog says nothing was created or
  sent, and the page stops offering invite and resend; the join code is the
  way in.
- **Import preview:** the file is read in the browser only to check its
  size, encoding and header names; its text stays in memory (not in React
  Query, storage, the URL or a log) until the preview is sent, and is
  dropped on Clear, another file, leaving the tab or page, another gym and
  any session boundary. The backend parses, validates and classifies; the
  page shows its masked rows and summary and says importing is not
  available. No commit, invitation, user or membership results from it.
- **Checklist:** the dashboard's available `invite_members` links here (not
  to an invitation form) for a viewer who may enroll; only the backend
  completes it, when someone is an active member.

## SF-98: timetable (WG5) and classes

Claude Design 112 (`1793198527-a0fc`) is unchanged and still the latest
version. WG5 `WebTimetable`, OG10 `WebSetupTimetable`, G08 `GymClasses`, G03
`ClassRoster`, WG18 `WebBookings` and F13 `BookClass` are marked FUTURE and
carry participant counts, waitlists, visibility settings and setup imports.
The SF-97 contract decides what exists (`D-WEB-GYM-TIMETABLE`). Claude Design
was not changed.

### Design inventory

| Artboard / state                                                                         | Route                        | API operation                                                                                                       | Permission                                          | Status      | Implementation                                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| WG5 header: title, gym · week, + Class                                                   | `/app/gyms/:gymId/timetable` | `getGym`; `createGymClassOccurrence`, `createGymClassSeries`                                                        | read: `view_workspace`; + Class: `manage_timetable` | MVP         | Eyebrow, title; + Class for owner and managers                                                                      |
| WG5 Week toggle, week grid, hour rail                                                    | same                         | `listGymClassOccurrences` (one window, every page)                                                                  | `view_workspace`                                    | MVP         | 7-day grid in the locale's week order; lanes for overlapping venues; opens at the first class                       |
| WG5 Day toggle                                                                           | same                         | same                                                                                                                | `view_workspace`                                    | MVP         | Day agenda (cards in start order)                                                                                   |
| WG5 Coach toggle                                                                         | same                         | `listGymClassOccurrences?instructor_staff_membership_id`                                                            | `view_workspace`                                    | MVP PARTIAL | Instructor filter instead of a third view                                                                           |
| List view (no artboard)                                                                  | same                         | same                                                                                                                | `view_workspace`                                    | MVP         | Accessible list grouped by wall date; every task works from it                                                      |
| Venue filter, show cancelled (no artboard)                                               | same                         | `venue_id`, `status` filters                                                                                        | `view_workspace`                                    | MVP         | Backend filters only                                                                                                |
| WG5 block: title, time                                                                   | same                         | `local_starts_at`, `local_ends_at`, `venue`                                                                         | `view_workspace`                                    | MVP         | Title, wall times, venue; instructor-needed tint; cancelled dashed                                                  |
| WG5 block: 14/20, full, waitlist                                                         | —                            | none (no bookings)                                                                                                  | —                                                   | FUTURE      | Not built                                                                                                           |
| WG5 block kinds: Shared · Team, Open sparring                                            | —                            | none                                                                                                                | —                                                   | FUTURE      | Not built (no shared-session or open-sparring domain)                                                               |
| WG5 panel: eyebrow, title, Coach, Repeats                                                | same                         | occurrence fields, `series_id`                                                                                      | `view_workspace`                                    | MVP         | Day · time · venue; instructor or "Instructor needed"; weekly series link                                           |
| WG5 panel: Capacity 19 / 20 · 2 waitlist                                                 | same                         | `capacity`                                                                                                          | `view_workspace`                                    | MVP PARTIAL | "Up to N people" (a limit)                                                                                          |
| WG5 panel: Level                                                                         | —                            | none                                                                                                                | —                                                   | FUTURE      | Not built                                                                                                           |
| WG5 panel: VISIBILITY (public, friends, names)                                           | —                            | none                                                                                                                | —                                                   | FUTURE      | Not built                                                                                                           |
| WG5 panel: Roster (G03), Save                                                            | —                            | none (no bookings, no roster)                                                                                       | —                                                   | FUTURE      | Not built; changes go through "Change this class"                                                                   |
| Change this class (no artboard)                                                          | dialog                       | `updateGymClassOccurrence`                                                                                          | `manage_timetable`                                  | MVP         | Date, wall time, venue (same zone), instructor, length, capacity; revision                                          |
| Cancel class (no artboard)                                                               | dialog                       | `cancelGymClassOccurrence`                                                                                          | `manage_timetable`; coach: own classes              | MVP         | Confirmed; stays as cancelled                                                                                       |
| One-time class form (no artboard)                                                        | dialog                       | `createGymClassOccurrence`                                                                                          | `manage_timetable`                                  | MVP         | Template defaults shown; zone shown; gap and repeated hour explicit                                                 |
| Weekly class form (no artboard)                                                          | dialog                       | `createGymClassSeries`                                                                                              | `manage_timetable`                                  | MVP         | Weekdays, time, first and last date; summary; result with skipped dates                                             |
| Weekly series (no artboard)                                                              | tab                          | `listGymClassSeries`, `getGymClassSeries`, `updateGymClassSeries`, `cancelGymClassSeries`, `generateGymClassSeries` | read: `view_workspace`; write: `manage_timetable`   | MVP         | Rule, period, counts, skipped dates; edit (whole series); cancel (stronger confirmation); check for missing classes |
| "This and following" (no artboard)                                                       | —                            | none                                                                                                                | —                                                   | FUTURE      | Not offered: the backend edits a series as a whole                                                                  |
| Class templates (no artboard)                                                            | tab                          | `listGymClassTemplates`, `create…`, `update…`, `archiveGymClassTemplate`                                            | read: `view_workspace`; write: `manage_timetable`   | MVP         | Title, defaults; archive confirmed                                                                                  |
| Venues (no artboard)                                                                     | tab                          | `listGymVenues`, `create…`, `update…`, `deactivateGymVenue`                                                         | read: `view_workspace`; write: `manage_timetable`   | MVP         | Location, IANA zone (once), capacity; deactivate confirmed                                                          |
| OG10 Start from template, Import CSV, Google Calendar                                    | —                            | none                                                                                                                | —                                                   | FUTURE      | Not built (`D-WEB-GYM-ONBOARDING-FLOW`)                                                                             |
| OG10 week template copied to other locations                                             | —                            | none                                                                                                                | —                                                   | FUTURE      | Not built                                                                                                           |
| G08 Classes, G03 Class roster (mobile)                                                   | —                            | —                                                                                                                   | —                                                   | FUTURE      | Not in this ticket (no Expo timetable)                                                                              |
| WG18 Bookings, F13 Book class                                                            | —                            | none (no Booking domain)                                                                                            | —                                                   | BLOCKED     | Not built                                                                                                           |
| Loading, empty (no venue, no template, free dates, filtered), error, retry, rate limited | page                         | —                                                                                                                   | —                                                   | MVP         | Built                                                                                                               |
| Not available (404), role-restricted (403), session (401)                                | console                      | `getGym`                                                                                                            | —                                                   | MVP         | The console's shared states                                                                                         |

### Behaviour

- **Source of truth:** every class on screen is a row of
  `listGymClassOccurrences`; nothing is built from a series rule. A week is
  read as one window (14 hours either side of its wall dates, so every
  zone's classes are caught, never more than 31 days) with every cursor
  page; until the last page arrives the page says it is loading.
- **Time zones:** a class is placed on its own wall date and time
  (`local_starts_at`) in its venue's IANA zone, with the zone and UTC offset
  in its details; the viewer's device zone never moves it. A one-time class
  is sent with the venue zone's own offset (`resolveWallTime`). A wall time
  the clocks skip is said before sending and, sent as written, refused by
  the backend; a repeated one is sent only with the instant the user chose.
  A weekly class sends its rule; the result lists the backend's skipped
  dates. Weeks start on the locale's first day.
- **Idempotency and revisions:** creates carry one `client_request_id` per
  attempt; a lost answer says the outcome is unknown and "Try again" sends
  the same request. Changes carry the revision they were based on; a stale
  one re-reads the record and keeps only the user's own edits for an
  explicit save, so nobody's change is overwritten.
- **Conflicts:** `409 venue_unavailable` (with the series' dates) and
  `instructor_unavailable` keep the form and say what to change; nothing is
  said about the other class, which may be another gym's.
- **Permissions:** from the projection: `view_workspace` reads,
  `manage_timetable` writes, `cancel_occurrence` lets a coach cancel the
  classes they teach. Instructors offered are the gym's active owners,
  managers and coaches (SF-93 roster); the backend checks again.
- **Isolation:** query keys carry the gym id, the page is keyed by gym, and
  the session boundary clears the cache. Nothing is kept in browser storage.
- **Checklist:** the dashboard's available `add_class` links here for a
  viewer who may plan; only the backend completes it, once a class is
  scheduled (a template or venue alone does not).

## SF-100: member booking, class rosters and check-in

Claude Design 112 (`1793198527-a0fc`) is unchanged and still the latest
version; it was read, not edited. F13 `BookClass` (390 pt) is the only member
booking board and is approved; there is no web member board. G03, G08, WG18
and WG19 are labelled "FUTURE · no backend domain yet", which predates
SF-97/SF-99; as SF-98 did for WG5, the boards whose domain now exists are
built with backend-driven adaptations (product decision for SF-100). The web
member pages are an interim composition of F13 and F16 content
(`D-WEB-GYM-MEMBER-BOOKING`, needs a web artboard); rosters and check-in
follow `D-GYM-CLASS-ROSTER`.

### Design inventory

| Artboard                                                           | Platform | Route                                             | User context                                | Backend operation                                                           | Status                                   | Implementation ticket          |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------ |
| F13 BookClass                                                      | Mobile   | `/me/gyms/:gymId/classes`                         | Active member (no profile)                  | `listMyGymClasses`, `bookMyGymClass`, `cancelMyGymClassBooking`             | APPROVED WITH BACKEND-DRIVEN ADAPTATIONS | SF-100                         |
| F13 credits, PT, sparring, waitlist, cutoffs, reminders            | Mobile   | —                                                 | —                                           | none                                                                        | FUTURE                                   | —                              |
| F16 Membership pass (rows)                                         | Mobile   | `/me/gyms`                                        | Member                                      | `listMyGymMemberships`                                                      | APPROVED WITH BACKEND-DRIVEN ADAPTATIONS | SF-100                         |
| F16 pass, QR, plan, credits                                        | Mobile   | `/membership` (placeholder)                       | —                                           | none (D-G19 open)                                                           | FUTURE                                   | —                              |
| (none) web My gyms                                                 | Web      | `/app/me/gyms`                                    | Member                                      | `listMyGymMemberships`                                                      | BLOCKED BY DESIGN · interim composition  | SF-100 (PARTIAL design parity) |
| (none) web gym classes                                             | Web      | `/app/me/gyms/:gymId/classes`                     | Active member                               | `listMyGymClasses`, `bookMyGymClass`, `cancelMyGymClassBooking`             | BLOCKED BY DESIGN · interim composition  | SF-100 (PARTIAL design parity) |
| (none) web My bookings                                             | Web      | `/app/me/bookings`                                | Member                                      | `listMyGymClassBookings`, `cancelMyGymClassBooking`                         | BLOCKED BY DESIGN · interim composition  | SF-100 (PARTIAL design parity) |
| (none) mobile My bookings                                          | Mobile   | —                                                 | Member                                      | `listMyGymClassBookings` (hook only)                                        | BLOCKED BY DESIGN                        | needs an artboard              |
| WG5 panel · Roster                                                 | Web      | `/app/gyms/:gymId/timetable` (sheet)              | Owner, manager, front desk; coach own class | `getGymClassRoster`, `checkInGymClassBooking`                               | APPROVED WITH BACKEND-DRIVEN ADAPTATIONS | SF-100                         |
| G08 GymClasses                                                     | Mobile   | `/gyms/:gymId/classes`                            | Gym staff                                   | `listGymClassOccurrences`                                                   | APPROVED WITH BACKEND-DRIVEN ADAPTATIONS | SF-100                         |
| G03 ClassRoster                                                    | Mobile   | `/gyms/:gymId/classes/:classId/roster`            | Gym staff                                   | `getGymClassOccurrence`, `getGymClassRoster`, `checkInGymClassBooking`      | APPROVED WITH BACKEND-DRIVEN ADAPTATIONS | SF-100                         |
| G03/G08 waitlist, Promote, Pay at desk, Trial, 8/16 counts, levels | Both     | —                                                 | —                                           | none                                                                        | FUTURE                                   | —                              |
| WG18 Bookings                                                      | Web      | `/app/gyms/:gymId/bookings` (placeholder, Soon)   | Gym staff                                   | no per-day aggregate; KPIs (fill rate, waitlist, no-shows) have no contract | FUTURE                                   | —                              |
| WG19 Attendance                                                    | Web      | `/app/gyms/:gymId/attendance` (placeholder, Soon) | Gym staff                                   | analytics, at-risk, nudges: no contract                                     | FUTURE                                   | —                              |
| G02 QR check-in                                                    | Mobile   | `/gyms/:gymId/check-in` (placeholder, Soon)       | —                                           | none (QR out of scope)                                                      | FUTURE                                   | —                              |
| GymTabs, GymWebNav                                                 | Both     | shells                                            | Gym staff                                   | —                                                                           | APPROVED (Classes tab linked)            | SF-100                         |
| RouteGym, FlowGym, FlowGymWeb                                      | —        | —                                                 | —                                           | —                                                                           | REFERENCE ONLY                           | —                              |

### Behaviour

- **One booking domain:** every class, place count, booking and arrival is
  the SF-99 API's (generated client only). The client never decides who may
  book, never counts or reserves a place, and never infers attendance; it
  hides actions for a class that has started (the panel's clock, as SF-98)
  and the backend refuses again.
- **Account level (`D-G07`):** `/app/me/gyms`, `/app/me/gyms/:gymId/classes`
  and `/app/me/bookings` sit in the header-only app frame (`web.app.active`)
  and need no Fighter or Coach profile and no gym workspace. The gym id only
  selects one of the viewer's own memberships (`GET /me/gym-memberships`);
  a pending request, an ended membership or no membership is said as such.
  Entry points: the context switcher (every workspace sidebar) and role
  selection (WA6) when the account holds a membership.
- **Idempotency:** one `client_request_id` per attempt to book a class,
  reused after a lost answer ("Try again"); once the backend answers for
  certain the next attempt gets a new key. After every answer the member's
  classes and bookings are read again; a lost answer whose booking the
  re-read shows is said as confirmed (reconciled), never booked twice.
- **Errors:** `409 class_occurrence: full | started | cancelled | not_today`,
  `class_booking: already_booked | cancelled | checked_in`, `gym_member`,
  `client_request_id: reused`, `403`, `404` (never implies existence), `429`
  (`retry-after` when readable) and unknown outcomes each have their own
  sentence; a failed read says it could not load (nothing changed).
- **Rosters:** short names and booking facts only; confirmed and cancelled
  views; counts from the backend's summary; manual check-in for
  `record_check_in`, one per booking; afterwards the roster, the gym and the
  owner's checklist (`first_check_in`, completed by the backend) are read again.
- **Isolation:** keys name the membership or the gym and class; the session
  boundary clears the cache; nothing is kept in browser storage.
- **Refresh:** focus and every mutation re-read the backend; there is no
  push channel, so another client's change shows on the next read.
- **Copy:** console texts that said bookings did not exist (capacity notes,
  class and series cancellation, staff role details, the dashboard's
  coming-later card) now say what happens.
- **Tests:** unit tests (member pages, roster, problem mapping), Storybook
  stories with `e2e/gym-member-booking-storybook.spec.ts` (Chromium, Firefox,
  WebKit, seven widths), and the real-backend
  `e2e/real-api/gym-member-booking.spec.ts` (web leg A–AC and, with
  `E2E_SYNC=1`, the second leg after the mobile leg).

## SF-102: the SimpleFit plan (WG25) and Stripe billing

The owner's SimpleFit plan in Gym settings
(`web.app.gyms._gym-id.settings.plan`) on the SF-101/SF-102 API, with
Stripe-hosted Checkout and Customer Portal. The console's Settings item is
live; `web.app.gyms._gym-id.settings` lists the settings sections (only the
plan has a domain; the others are marked Soon and not linked).

### Design inventory

Claude Design `1793198527-a0fc` (read with the Artifact tool): `WebGymBilling`
(WG25, FUTURE, "SimpleFit plan"), `WebSetupPayments` (OG9, FUTURE, payouts and
member payment methods: the Connect side, not built), `WebBilling`/`WebBillingPastDue`
(BL1/BL1b, coach billing, used for the status and past-due patterns),
`WebInvoices`/`InvoiceDetail` (BL9/BL10), `PaymentStates`.

| WG25 element                         | Built as                                                                                                                                                    | Why                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Settings tab bar                     | `GymSettingsHeader`: all six tabs; only "SimpleFit plan" links, the others are "Soon"                                                                       | Only the plan has a domain                          |
| Current plan card (olive)            | Plan name, the backend's price and interval, status, paid period, next payment (only when the backend confirms a renewing subscription), "Test mode" badge  | Trial and member caps have no domain                |
| Usage meters                         | Not shown                                                                                                                                                   | Entitlements are not enforced; no limits exist      |
| "Need more locations? Compare plans" | The published plans with month/year buttons that start Stripe Checkout                                                                                      | Real catalog; plan changes are not available (said) |
| Invoices table                       | Stripe's invoices as reconciled: date, number, amount, status, refunds, disputes, "View" (Stripe-hosted)                                                    | No PDF is rendered by SimpleFit                     |
| "€89 + VAT 23%" note                 | "Prices are shown without tax"                                                                                                                              | No tax is configured (open decision)                |
| Payment method (Visa •• 0042)        | "Billing" card: Stripe Customer Portal button, refresh, cancel                                                                                              | No card data exists in the contract                 |
| — (no artboard)                      | Payment notices: processing, action required, payment failed, past due, scheduled end; return from checkout; restricted role; disabled/unavailable payments | States the design does not draw                     |

### Behaviour

- **Authority:** every state is the backend's (`getGymBillingSummary`),
  reconciled from Stripe; the return from Checkout (`?checkout=returned`) asks
  the backend to read Stripe once (`reconcileGymSaasSubscription`) and the
  query is removed. A redirect is never shown as a payment.
- **Checkout:** choosing a price records the intent
  (`requestGymSaasSubscription`, one `client_request_id` per attempt, reused
  after a lost answer) and leaves for the Stripe-hosted URL the backend
  answered (`createGymSaasCheckoutSession`, idempotent). A pending intent
  offers "Continue to checkout". No card field exists in SimpleFit.
- **Portal and cancellation:** "Manage billing" opens a short-lived portal
  URL (never stored); cancelling ends at the period end (default) or now, and
  a pending request is withdrawn; the backend cancels at Stripe first (`503`
  changes nothing). No refund is implied.
- **Permissions:** only `manage_billing` (the owner) sees the page; other
  staff see the restriction and nothing billing-related is requested.
- **Errors:** `payment_provider: disabled`, `checkout: completed`,
  `saas_subscription`, `saas_plan_version`, `stripe_price`, `billing_portal`,
  `503`, `429`, `403`, `404`, unknown outcomes: one sentence each.
- **Copy:** `gymBilling` in all seven locales; amounts and dates through
  next-intl with the currency from the data.
- **Tests:** unit tests (states, actions, problem mapping, settings tabs),
  Storybook stories with `e2e/gym-billing-storybook.spec.ts` (Chromium,
  Firefox, WebKit; dark/light; axe; 375–1920 px), and the real-backend
  `e2e/real-api/gym-billing.spec.ts` (Stripe disabled and test mode with
  placeholder credentials; no journey reaches Stripe). Real Stripe-hosted
  journeys need Stripe test credentials.

## SF-103: business verification (OG7), community defaults (WG10 / OG13) and go-live (OG14)

Three gym-settings screens on the SF-103 API. The design draws OG7, OG13 and
OG14 as onboarding steps 7, 13 and 14 ("coming later" in the setup stepper);
they are built under Gym settings (`settings/verification`,
`settings/community`, `settings/go-live`), linked from the settings tabs and
sections (`D-WEB-GYM-VERIFICATION-GO-LIVE`).

### Design inventory

Claude Design `1793198527-a0fc` (read with the Artifact tool, version
unchanged since baseline 112):

| Artboard                                                | Route                                        | User           | API                                                                                                                                                                                              | Source of truth                                                              | Status                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| OG7 WebSetupVerify                                      | `web.app.gyms._gym-id.settings.verification` | owner          | `getGymBusinessVerification`, `saveGymBusinessVerification`, `createGymVerificationEvidence`, `confirmGymVerificationEvidence`, `removeGymVerificationEvidence`, `submitGymBusinessVerification` | SF-103 verification domain; decisions by operators (`mix gyms.verification`) | Built with adaptations                                                                                  |
| OG13 WebSetupCommunity, WG10 WebCommunitySettings       | `web.app.gyms._gym-id.settings.community`    | owner, staff   | none                                                                                                                                                                                             | platform guarantees (ADR 0026 D-G06)                                         | Guarantees built; every switch FUTURE                                                                   |
| OG14 WebSetupLaunch                                     | `web.app.gyms._gym-id.settings.go-live`      | owner, manager | `getGymGoLive`                                                                                                                                                                                   | backend readiness evaluator                                                  | Built with adaptations; publishing BLOCKED (D-G11)                                                      |
| GymSetupSteps                                           | onboarding stepper                           | owner          | —                                                                                                                                                                                                | —                                                                            | Unchanged ("coming later" list)                                                                         |
| EmailGymLive (E05), Discover, MarketGyms                | —                                            | —              | —                                                                                                                                                                                                | —                                                                            | BLOCKED: no public gym surface                                                                          |
| AdminTenants, AdminTenantDetail, AdminAccess (AD0–AD20) | —                                            | operator       | —                                                                                                                                                                                                | —                                                                            | BLOCKED: no operator identity or admin authorization domain; review is the `mix gyms.verification` task |

| Design element                                      | Built as                                                                                              | Why                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| OG7 "Tax ID (NIP)", "Registry (KRS)"                | Generic legal name, registration country (combobox), registration number, registered address, website | No jurisdiction-specific requirement is approved |
| OG7 "Owner identity ✓ VERIFIED · payments partner"  | Not shown                                                                                             | No identity verification exists                  |
| OG7 per-document ACCEPTED / IN REVIEW               | Uploading / Uploaded / Submitted (backend-confirmed); the decision is per application                 | No per-document review exists                    |
| OG7 "under 24 h", payouts / EU AML / Discover badge | "What verification means": reviewed by people; doesn't publish, enable payments or change the plan    | Unapproved claims                                |
| OG13 / WG10 switches, "142 athletes trained today"  | Listed as coming later; no switch, no count                                                           | No enforcing domain; no fabricated numbers       |
| OG13 "Admins never see"                             | "Never, whatever the setting" guarantees                                                              | Enforced by the platform                         |
| OG14 "Everything is ready", every row DONE          | The backend's checks grouped by requiredness with their status and reason                             | Readiness is derived by the backend              |
| OG14 "Publish gym", invites "tomorrow 10:00", E05   | "Publishing · Not available yet"                                                                      | No public surface or policy                      |

### Behaviour

- **Authority:** every status, missing item and check is the backend's;
  verification and go-live are read again on focus (a revoked approval never
  stays shown as Verified). Only an operator decides; no button approves.
- **Draft:** saved against the application's revision (no revision starts an
  application, also after a rejection or revocation); a stale revision shows
  the conflict and reads the latest state; field errors map with
  `applyApiFieldErrors`.
- **Documents:** announced (kind, file name, type, exact size within the
  backend's limits), then sent by the browser directly to the presigned URL
  (`https:` only, or loopback http in local development; the URL is used
  once and never stored), then confirmed by the backend, which reads the
  stored object itself. An interrupted upload stays "Uploading" with "Check
  upload" and remove. No download link exists for the owner.
- **Permissions:** OG7 for `manage_business_verification` (owner); OG14 for
  `view_go_live` (owner, manager); others see the restriction and nothing is
  requested.
- **Copy:** `gymVerification`, `gymGoLive`, `gymCommunity` in all seven
  locales.
- **Tests:** unit tests (screens, upload flow, problem mapping), stories with
  `e2e/gym-verification-storybook.spec.ts` (Chromium, Firefox, WebKit;
  dark/light; axe; 375–1920 px), and the real-backend
  `e2e/real-api/gym-verification.spec.ts` (journeys A–AD with a local
  S3-compatible server and the operator task).

## SF-133: the staff invitation recipient page (`/invite/staff`)

The E06 email's link now has a page: an invited person can preview, sign up
or sign in, verify the invited address, and accept or decline on the web. SF-93
remains the domain; the only API addition is `resolveStaffInvitation`.

### Design inventory

Claude Design 112 (`1793198527-a0fc`) was read, not edited.

| Artboard       | What it is                        | Used here                                          |
| -------------- | --------------------------------- | -------------------------------------------------- |
| OS1            | Staff invitation, mobile (390 pt) | Content: gym, role, inviter, abilities             |
| OS1b           | Confirm email, mobile             | Content: "this is for another email", verify       |
| OS2, OS3       | Mobile staff onboarding           | Not used: no web equivalent in this ticket         |
| INV2           | Mobile invitation rows            | Not used: the inbox stays mobile                   |
| E06            | The email itself                  | Unchanged; the link's fragment contract is kept    |
| WFI1           | Coach invitation, web             | Composition: the column, frame and action layout   |
| Web staff page | **Does not exist**                | `D-WEB-STAFF-INVITATION`, needs a product decision |

This is an interim composition, not design parity. Proposed missing artboard:
**WSI1 Staff invitation · web**, with the states below, in the WFI1 column.
Nothing was added to Claude Design; that needs separate approval.

### The token

- It arrives only in the fragment (`/invite/staff#token=sfs_…`). The page reads
  it in the browser, removes the fragment at once, and sends it only in request
  bodies. The page sets `referrer: no-referrer` and `noindex`.
- It is kept in this tab's `sessionStorage` so that it survives sign-up, the
  code step and account registration. **This is a deliberate exception to "no
  browser storage"**: the same approved pattern as the SF-60 coach invitation,
  scoped to the tab, kept for an hour at most, bound to the first signed-in
  viewer and dropped at any session boundary and on every final answer. It is
  never in `localStorage`, a cookie, a URL, `returnTo`, a query key or a log.
- A switched account drops it: the next person reopens the link from the email.

### Who sees what

| Viewer                                        | State (`data-invitation-state`)                                        |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| No or malformed token                         | `missing`, no request                                                  |
| Signed out, pending                           | `signed-out`: gym, role, inviter's first name, expiry                  |
| Signed out, anything else                     | `unavailable`: one state for every other case, no oracle               |
| Signed in, invited address not on the account | `wrong-account`: verify in place (SF-77/SF-78) or use another account  |
| Recipient, account not finished               | `registration`: nothing is offered until it is done                    |
| Recipient, pending                            | `pending`, `decline-confirm`: explicit answers only                    |
| Recipient, already ended                      | `expired`, `cancelled`, `declined`                                     |
| Recipient, accepted                           | `already-accepted`, or `access-ended` once the gym no longer grants it |
| Recipient, already on the team (409)          | `already-staff`                                                        |
| Too many requests, 5xx, dropped connection    | A notice with a retry; nothing is claimed until the server confirms it |

An acceptance refreshes `resolveMyEntry` and `listMyGyms`, then opens the
console of the gym the backend answered. Permissions come from the membership,
so the page grants nothing itself. `/invite/coach` is unchanged; it shares only
the extracted `shared/lib/pending-invitation-token` factory.

### Delivery gate

Sending E06 is off unless `GYM_STAFF_INVITATIONS=enabled` (on in dev and test).
While off, `createGymStaffInvitation` and resend answer 409
`staff_invitation: recipient_flow_unavailable`, and the invite dialog says
nothing was created or sent. E05, E07 and coach invitations are not affected.

Activation order: backend compatibility, then the recipient page deployed, then
a production smoke test, then sending enabled under explicit release approval.

## SF-134: joining a gym as a member (`/invite/gym`, `/app/me/gyms/join`, `/invitations`)

A person can now join a gym on the web with its code or an E07 invitation, see
every state of their memberships, and answer invitations in an inbox. SF-95
remains the domain; the only API addition is `resolveGymInvitation`.

### Design inventory

Claude Design 112 (`1793198527-a0fc`) was read, not edited, and is still the latest
version.

| Artboard                           | What it is                                  | Used here                                                         |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| A03 `JoinInvite`                   | Mobile: QR, six-letter code, role, group    | Code entry only: QR, six letters, role and group have no contract |
| OF6 `OnbFMembership`               | Mobile Fighter onboarding step, with prices | "Send join request" wording only                                  |
| E07 `EmailMemberInvite`            | Email, older "claim" copy                   | Unchanged template; its approved content on the page              |
| F13, F16                           | Mobile booking and pass                     | As in SF-100; no pass, plan or credits                            |
| GC1                                | Mobile plans with prices                    | Not used: no such product here                                    |
| WFI1                               | Coach invitation, web                       | The column of `/invite/gym`                                       |
| StatesSheet, RouteGym, FlowGym     | No member join entries                      | Not applicable                                                    |
| Web join, inbox, membership states | **Do not exist**                            | `D-WEB-GYM-MEMBER-JOIN`, needs a product decision                 |

These are interim compositions from approved components, not design parity.
Nothing was added to Claude Design; that needs separate approval.

**Proposed artboards:**

- **WMI1 Member invitation · web:** loading, signed out, pending, decline confirm,
  wrong account, registration, expired, cancelled, declined, already accepted,
  membership ended, already member, unavailable, missing, limited, failed.
- **WMG4 Join a gym · web:** code, not found, limited, preview (approval or
  auto-approval), requested, active, already member, registration.
- **WMG5 Gym invitations · web:** list, empty, loading, failed, decline confirm,
  accepted, declined.
- **WMG1 state sheet:** active, requested, rejected, cancelled, ended (with reason),
  leave and cancel confirmations.

### Join by code

The code is held only while it is typed and is sent only in request bodies: never
a URL, query key, stored value or retry, and no route carries it. The backend reads
it forgivingly, so this page checks only that something was typed; an unknown,
malformed, disabled or rotated code gets one answer. The preview changes nothing.
Joining is a separate press, sent once. Whether it is `requested` or `active` is the
backend's answer, even when the preview hinted otherwise.

### The invitation token

As in SF-133: read from the fragment, removed at once, sent only in bodies.
`/invite/gym` sets `referrer: no-referrer` and `noindex`.

**Security trade-off:** the token stays in this tab's `sessionStorage` so that it
survives sign-up, the code step and account registration, which leave the page. It
is scoped to the tab, kept for an hour at most, bound to the first signed-in viewer
and dropped at any session boundary and on every final answer. Script running in the
page could read it, but it grants nothing alone: the backend still requires a session
of the verified invited address. It is never in `localStorage`, a cookie, a URL,
`returnTo`, a query key or a log. A switched account drops it, and the next person
reopens the email. A malformed fragment opened in the same tab leaves an earlier valid
token in place until its hour or session ends.

### My gyms and the inbox

My gyms lists `active`, `requested` and history (`rejected`, `cancelled`, `ended` with
its reason), each from the backend, and offers only what the contract allows: open
classes, leave, cancel a request. Leaving is asked first, ends only that membership,
and the backend releases its upcoming bookings. Rejoining creates a new record.

The inbox is `listMyGymInvitations` with `status=pending`, every page, token-free.
Opening it accepts nothing. Staff invitations never appear in it.

A membership grants no gym workspace, and joining creates no Fighter or Coach profile,
staff membership or Coach–Fighter relationship. Entry points: the My gyms page, the
context switcher of every workspace, and WA6 role selection.

### Delivery gate

E07 stays off in production: creating and resending answer 409
`member_invitation: recipient_flow_unavailable` unless
`GYM_MEMBER_INVITATIONS=enabled`. Activation order: compatible backend, then the
recipient page deployed, then the production URL and token transport verified, then a
production-safe smoke test, then sending enabled under explicit release approval.
