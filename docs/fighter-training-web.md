# Fighter web training (SF-67)

The fighter's assigned training sessions on the web, against Claude Design
**Version 107** (`1792573853-9116`), on SF-63 (`listMyTrainingSessions` with
`view=upcoming|history` and `status`, `getMyTrainingSession`,
`completeMyTrainingSession`). The same records as the mobile Training tab
(SF-66) and the coach's planner (SF-64).

## Design reconciliation

Up to Version 106 the Fighter web sidebar's "training" item was "Fight camp"
and opened W06, a camp board (phases, weekly blocks, rounds, sparring load,
weight corridor) on domains that do not exist; no web screen listed or
completed the fighter's real sessions (`D-WEB-FIGHTER-TRAINING`). With
approval, SF-67 reconciled `WebCampBoard.dc.html`: WFT1 Training and WFT2
Session are its `training` (default) and `session` screens, W06 stays in the
file as `screen=camp`, FUTURE, and FighterWebNav's item is "Training",
opening WFT1. W01 Home and the sidebar's Next card are unchanged (SF-68).

| Artboard                 | Source                                      | Route                          | Production             | Status  |
| ------------------------ | ------------------------------------------- | ------------------------------ | ---------------------- | ------- |
| WFT1 Training            | `WebCampBoard.dc.html` `training`           | `/app/training` (`?view=`)     | `FighterTraining`      | current |
| WFT2 Session             | `WebCampBoard.dc.html` `session`            | `/app/training/:sessionId`     | `FighterSessionDetail` | current |
| FighterWebNav · Training | `FighterWebNav.dc.html` (`active=training`) | `web.app.fighter#training`     | `WorkspaceShell`       | current |
| W06 Fight camp board     | `WebCampBoard.dc.html` `camp`               | `/app/camp/board` (not in nav) | placeholder            | FUTURE  |

The first-run tour's third step (FRW2) points at the same sidebar item; its
copy now describes Training instead of fight camps.

## Training (WFT1)

- `listMyTrainingSessions` with `view=upcoming` (planned and not yet over,
  earliest first) or `view=history` (`?view=history`: completed, cancelled
  and past-due planned, newest first), narrowed with
  `?status=completed|cancelled`. The projections use the server's clock;
  the page never re-sorts or re-buckets. Cursor pages of 50 ("Show more";
  a failed page keeps the list and says so).
- Sessions come from every coach, also after a relationship ended, and
  whatever the Coach–Fighter sharing gate says (ADR 0023 in simplefit-api).
- Rows are grouped by the day of each session's own time zone and show the
  start there with the zone name, type, coach (display name and brand while
  the relationship is active, "Former coach · name" after it ended, "Coach
  not shared" when nothing was disclosed), duration and the backend status.
  A past-due planned session stays "Planned".
- The row layout follows the list's width (a container query): six columns
  from 672 px of list, a compact row below.
- Loading, empty (per view and filter), not available (`404`: no completed
  fighter profile) and failure (retry) are separate states.

## Session and completion (WFT2)

- `getMyTrainingSession`: coach, type, start in the session's zone with its
  offset, "Your time" in the browser's zone (or "same time zone"),
  duration, the coach's notes, and once ended the completion time or the
  cancellation (by your coach, or because the relationship ended).
- **Mark as completed** only while planned, behind a confirmation dialog
  that names the coach. One `POST` with no body: the server decides whether
  the session has started and sets `completed_at`. While it runs the dialog
  cannot be dismissed or confirmed twice.
  - `200`: the dialog closes, a toast, and the page shows the session the
    backend returned. A repeat returns the same session with its original
    `completed_at`.
  - `409 starts_at: not_started` / `409 status: cancelled`: the dialog
    closes and a notice says why and that nothing was saved; the session is
    read again.
  - `404`: the session is read again (not available).
  - No answer or a server error: the dialog stays open with "It may already
    be saved"; the session and lists are marked stale without an immediate
    refetch (offline it would fail too), and trying again is safe.
- A session already on screen stays when reading it again fails; only a
  `404` replaces it with "not available". Unknown, malformed and someone
  else's ids are that one state.
- A started session whose relationship ended stays completable; its aside
  says so, and the dialog names "your coach" when no name is left.

## Access and privacy

- `(fighter)/layout.tsx` gates every page on the FIGHTER capability the
  entry reports; anyone else goes where the entry says, before any training
  request.
- Nothing is stored in the browser: the data lives in the in-memory query
  cache, which is cleared at every session boundary. Coach notes and tokens
  are never logged.

## Verification

- Unit / component: `widgets/fighter-training` (projections, filter,
  cursor and its failure, states, zones, coach identity, completion flow,
  refusals, lost answer, keep-on-refetch-failure, `404`), registry and
  route tests.
- Storybook: `src/stories/screens/fighter-training`,
  `e2e/fighter-training-storybook.spec.ts` (every state, no request leaves).
- Production (contract double): `e2e/production/fighter-training.spec.ts`
  (nav, geometry at 1440 × 900 and the laptop matrix, 1024 / 768 / 390,
  axe, completion, lost answer, not started, terminal states, the FIGHTER
  gate).
- Real API (local, disposable `simple_fit_sf67_e2e` only): see the SF-67
  report.
