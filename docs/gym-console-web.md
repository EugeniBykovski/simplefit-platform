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

| Artboard / state                                 | Route                    | API operation                                          | Permission                                        | Status                       | Implementation                                                     |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------ | ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| WG16 header: eyebrow, title                      | `/app/gyms/:gymId/staff` | `getGym` (console)                                     | `view_staff`                                      | MVP                          | Built                                                              |
| WG16 header: Invite                              | same                     | `createGymStaffInvitation`                             | `invite_staff` (+ `invite_manager` for manager)   | MVP                          | Dialog: email, role                                                |
| WG16 header: search                              | —                        | none                                                   | —                                                 | FUTURE                       | Not built (no search domain)                                       |
| WG16 header: Roles & permissions → WG17          | `/settings/roles`        | none                                                   | —                                                 | FUTURE                       | Not linked; the roles card says the matrix in words                |
| WG16 tile TEAM + breakdown                       | same                     | `listGymStaff` (active)                                | `view_staff`                                      | MVP                          | Shown once the list is complete                                    |
| WG16 tile ON SHIFT NOW                           | —                        | none                                                   | —                                                 | FUTURE                       | Not built (R11)                                                    |
| WG16 tile PENDING INVITES                        | same                     | `listGymStaffInvitations`                              | `view_staff_records`                              | MVP                          | Shown once the list is complete                                    |
| WG16 roster: person, role, status                | same                     | `listGymStaff`                                         | `view_staff`                                      | MVP                          | Person, role, joined, status                                       |
| WG16 roster: LOCATION, LAST ACTIVE               | —                        | none                                                   | —                                                 | FUTURE                       | Not built                                                          |
| WG16 roster: INVITED rows                        | same                     | `listGymStaffInvitations`                              | `view_staff_records`                              | MVP PARTIAL                  | Their own Invitations card, never roster rows                      |
| WG16 roster: ON SHIFT, Head coach                | —                        | none                                                   | —                                                 | FUTURE                       | Not built (R11, D-G03)                                             |
| WG16 roster: ended staff                         | same                     | `listGymStaff?status=ended`                            | `view_staff_records`                              | MVP                          | Ended view                                                         |
| WG16 detail panel: name, role, since             | same                     | `listGymStaff`                                         | `view_staff`                                      | MVP                          | Built                                                              |
| WG16 detail panel: permission checklist          | —                        | none                                                   | —                                                 | MVP PARTIAL                  | The role in words (C10); no fighter notes, sparring, payments (R7) |
| WG16 detail: Change role                         | dialog                   | `changeGymStaffRole`                                   | `change_staff_role` (manager: coach ⇄ front desk) | MVP                          | Built                                                              |
| WG16 detail: Remove from team                    | dialog                   | `endGymStaffMembership`                                | `remove_staff` (manager: coach, front desk)       | MVP                          | Built; Leave for one's own row                                     |
| OG11 invite row: email, role                     | dialog                   | `createGymStaffInvitation`                             | as above                                          | MVP                          | Built                                                              |
| OG11 invite row: location                        | —                        | none                                                   | —                                                 | FUTURE                       | Not built (no per-member location)                                 |
| OG11 roles panel                                 | staff page               | none (copy)                                            | —                                                 | MVP PARTIAL                  | Roles card from the MVP matrix (C10)                               |
| Invitation resend / cancel                       | staff page               | `resendGymStaffInvitation`, `cancelGymStaffInvitation` | as inviting that role                             | MVP                          | Built; cancel confirmed                                            |
| Loading, empty, error, retry                     | staff page               | —                                                      | —                                                 | MVP                          | Built                                                              |
| Not available (404), role-restricted (403)       | console                  | `getGym`                                               | —                                                 | MVP                          | The console's shared states                                        |
| E06 recipient page `/invite/staff`, mobile inbox | —                        | SF-93 recipient operations                             | —                                                 | BLOCKED (not in this ticket) | Not built; the invitations card says acceptance opens later        |

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
