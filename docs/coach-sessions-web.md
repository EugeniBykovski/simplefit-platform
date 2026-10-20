# Coach web training planner (SF-64)

The coach's training sessions on the web, against Claude Design **Version
104** (`1792490047-d551`), on SF-62 (`createMyCoachTrainingSession`,
`getMyCoachTrainingSession`, `updateMyCoachTrainingSession`,
`cancelMyCoachTrainingSession`) and SF-63 (`listMyCoachTrainingSessions`
with `view=upcoming|history`).

## Design reconciliation

Up to Version 103, `WebProgramBuilder.dc.html` (WC3) drew a multi-week block
builder assigned to several fighters, and CoachWebNav opened it from
"Programs & sessions". The API plans one session for one fighter of one
active relationship and has no programs, blocks, groups, recurrence or
calendar feed (`D-WEB-COACH-SESSIONS-PLANNER`). With approval, SF-64
reconciled the artboard: an agenda list as the planner (not a calendar grid;
W08 stays FUTURE), the one-session form, the session and its edit. The block
builder stays on the artboard as `screen=builder`, marked FUTURE.

| Artboard               | Source                                    | Route                            | Production           | Status                           |
| ---------------------- | ----------------------------------------- | -------------------------------- | -------------------- | -------------------------------- |
| WCT1 Sessions planner  | `WebProgramBuilder.dc.html` `planner`     | `/app/coach/sessions` (`?view=`) | `CoachSessions`      | current                          |
| WC3 New session        | `WebProgramBuilder.dc.html` `create`      | `/app/coach/sessions/new`        | `CoachSessionCreate` | current (reconciled)             |
| WCT2 Session           | `WebProgramBuilder.dc.html` `detail`      | `/app/coach/sessions/:sessionId` | `CoachSessionDetail` | current                          |
| WCT3 Edit session      | `WebProgramBuilder.dc.html` `edit`        | `/app/coach/sessions/:id/edit`   | `CoachSessionEdit`   | current                          |
| CoachWebNav · Sessions | `CoachWebNav.dc.html` (`active=sessions`) | `web.app.coach#programs`         | `WorkspaceShell`     | current (linked, no longer Soon) |
| Block builder          | `WebProgramBuilder.dc.html` `builder`     | —                                | —                    | FUTURE                           |
| CRW2 product tour      | `FirstRunWebCTour.dc.html`                | `/app/coach/sessions/new?tour=2` | —                    | DEFERRED with CRW1               |

## Planner (WCT1)

- `listMyCoachTrainingSessions` with `view=upcoming` (planned and not yet
  over, earliest first) or `view=history` (`?view=history`: completed,
  cancelled and past-due planned, newest first), narrowed with
  `?status=completed|cancelled`. The projections use the server's clock;
  the page never re-sorts or re-buckets. Cursor pages of 50 ("Show more").
- Rows are grouped by the day of each session's own time zone and show the
  start there with the zone name, type, fighter (display name, else
  `@username`, else "Fighter not shared"), duration and the backend status.
  A past-due planned session stays "Planned", never "Completed".
- The row layout follows the list's width (a container query): six columns
  from 672 px of list, a compact row below.
- Loading, empty (per view and filter), planning not available (`404`: no
  coach profile, or Coach–Fighter sharing off; New session disabled) and
  failure (retry) are separate states.

## New session and edit (WC3, WCT3)

- Fighters come from the coach's active relationships (`listMyCoachFighters`,
  every page). None is its own state with "Go to Fighters"; a `404` is "not
  available". One fighter is preselected; on edit the fighter is fixed.
- **Start:** a date, a time and an IANA zone (default: the browser's zone;
  region zones and UTC only). `shared/lib/time-zone` resolves the wall time
  with the browser's own zone data (Intl, no dependency): one instant, none
  (DST gap: a notice, nothing is sent) or two (DST overlap: the coach must
  choose First / Second with their offsets). The request carries RFC 3339
  with the zone's offset at that instant (`2026-10-25T02:30:00+01:00`), as
  SF-62 requires.
- **Idempotency:** each create attempt carries a `client_request_id`
  (UUID v4). Sending the same body again (after a failure or a lost
  response) reuses it, so the backend returns the session it may already
  have created (`200`) instead of a second one; a changed body is a new
  attempt with a new key. A `409 client_request_id: reused` resets the key.
- **Edit** sends only the fields that changed (`PATCH`); a moved start goes
  with its new offset, a changed zone with its start. Nothing changed: no
  request.
- **Refusals:** field codes land on their fields (`starts_at: out_of_range`
  → "between yesterday and one year from now"); `409` (completed or
  cancelled meanwhile) and `404` (relationship ended, or not available) are
  notices; network failures say nothing changed. A session that is no
  longer planned gets no form.
- Saved: a toast and the session's page, as the backend returned it.

## Session and cancel (WCT2)

- `getMyCoachTrainingSession`: fighter, type, start in the session's zone
  with its offset, "Your time" in the browser's zone (or "same time zone"),
  duration, notes, and once ended the completion time or the cancellation
  (by you, or by the system when the relationship ended).
- Edit and Cancel session only while planned. Cancel needs the
  confirmation; one request; only the backend's `200` is shown as
  cancelled, `409` (completed meanwhile) and `404` get their own message.
- `404` (unknown, another coach's, relationship ended, sharing off) is one
  "not available" state with no detail of which.

## Verification

- Unit / component: `shared/lib/time-zone` (offsets, gap, overlap, edges,
  fractional and southern zones), `features/training-session-form` (body
  and offset, key reuse and renewal, gap never sent, overlap choice, field
  refusals, `404`, no fighters, edit diff, `409`),
  `widgets/coach-sessions` (projections, filter, cursor, states, zones,
  cancel flow), workspace shell and registry tests.
- Storybook: `src/stories/screens/coach-sessions`,
  `e2e/coach-sessions-storybook.spec.ts` (every state, no request leaves).
- Production (contract double): `e2e/production/coach-sessions.spec.ts`
  (nav, geometry at 1440 × 900 and the laptop matrix, 1024 / 768 / 390,
  axe, DST gap and overlap, create body, edit diff, cancel confirmation).
- Real API (local, disposable `simple_fit_sf64_e2e` only): sign-in, create
  after a lost response (one row, same key), gap and overlap against the
  server's validation, edit, cancel, a fighter's completion, an edit losing
  the race to it (`409`), another coach's session (`404`), relationship end
  (system cancellation, fighter gone from the form), sharing off.
