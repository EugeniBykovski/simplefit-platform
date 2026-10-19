# Coach web fighters and invitations (SF-58)

The coach's fighter roster, one fighter, and the coach's invitations on the
web, against Claude Design **Version 98** (`1792056621-3707`), on the SF-56
relationship API (`listMyCoachFighters`, `getMyCoachFighter`,
`endMyCoachFighterRelationship`) and the SF-57 invitation API
(`listMyCoachInvitations`, `createMyCoachInvitation`,
`resendMyCoachInvitation`, `cancelMyCoachInvitation`, `getMyCoachDataRules`).

## Design reconciliation

Up to Version 97, WC7 and WC4 showed data the backend does not have and must
never share with a coach: weight, camp, sessions, notes and a "Fighter 360".
There was no invitation composer and no cancel or end confirmations. With
approval, SF-58 reconciled them in Claude Design (Version 98 published over
`1791997599-a707`):

| Artboard                   | Source                      | Route / place                    | Production                                   | Status  |
| -------------------------- | --------------------------- | -------------------------------- | -------------------------------------------- | ------- |
| WC7 Fighters (reduced)     | `WebCoachFighters.dc.html`  | `/app/coach/fighters`            | `CoachFighters`                              | current |
| WC4 One fighter (reduced)  | `WebFighter360.dc.html`     | `/app/coach/fighters/:fighterId` | `CoachFighterDetail`                         | current |
| Invite composer            | `WebCoachFighters` dialog   | dialog on WC7 (no route)         | `InviteFighterDialog`                        | current |
| Cancel / end confirmations | WC7 and WC4 dialogs         | alert dialogs                    | `InvitationActions`, `EndRelationshipDialog` | current |
| CoachWebNav (Fighters)     | `CoachWebNav.dc.html`       | `web.app.coach` sidebar          | `WorkspaceShell`                             | current |
| WC1 Coach dashboard        | `WebCoachDashboard.dc.html` | `/app/coach`                     | unchanged                                    | current |

## Roster (WC7)

- **Active** (default) and **Ended** (`?view=ended`, no new route). Cursor
  pages of 50 from the backend; "Show more" follows `next_cursor`.
- **Active rows** show only the C1+C2 fields the fighter disclosed: name,
  username, place, level, stance, amateur bouts and the start date. A field
  that is not disclosed reads "Not shared", never a zero or a guess. The row
  opens WC4 through its name link, addressed by the relationship id.
- **Ended rows** show the name when it ended, the dates and who ended it.
  Nothing links: the coach has no access after the end.
- **States:** loading (skeleton), empty (the backend returned none), sharing
  not available (`404`, the Coach sharing gate is off: never shown as an
  empty roster, and inviting is disabled) and failure (retry).

## Invitations (WC7 section)

- The coach's invitations are listed apart from the roster: an invitation is
  never a relationship. Each shows the masked recipient, the backend status
  (pending, accepted, declined, cancelled, expired) and its dates.
- **Pending** invitations offer Resend (while resends remain) and Cancel
  (after confirmation). The backend decides: a cooldown (`429`), no resends
  left, or an invitation already answered are reported as they come.
- **Invite fighter** opens the composer (email and an optional one-paragraph
  note up to 500 characters). The browser sends only these. It creates no
  token, link or email, and validates only the address format and note
  length for UX. Send is disabled while a request runs.
- **Success is neutral.** The backend answers a new invitation (`201`, email
  queued) and one already pending to the address (`200`, no new email) with
  the same body, and the generated client exposes only the body
  (`apiFetch`, `includeHttpResponseReturnType: false`). The composer therefore
  says only what both share, "an invitation to {address} is pending until
  {expiry}", never that an email was sent, and refetches the list. It never
  infers created vs existing from the cached list. **Contract dependency:**
  an explicit outcome (a response field, or the status exposed by the client
  transport) is needed before the UI can tell them apart.
- **Coach data rules (SF-72):** inviting needs a published, acknowledged
  data-rules version. `getMyCoachDataRules?language=<page language>` returns
  the backend's approved text (`document`: summary, full text, checkbox
  label, version, language). The composer shows the summary, the full text on
  demand and the approved confirmation next to an unticked box, then
  `acknowledgeMyCoachDataRules` with exactly that version and
  `document_language`; `409 stale` (or `document_language: unavailable`)
  reloads and asks again, and `409 data_rules_acknowledgement: required` on
  sending returns to the rules. Without an approved text in the page language
  there is nothing to acknowledge (never another language). While no version
  is published, or sharing is off, the composer is truthfully blocked. No
  document is approved yet (SF-71): in production the composer stays
  blocked. Public legal pages: design gap `GAP-WEB-LEGAL-DOCUMENTS`.

## One fighter (WC4)

- The disclosed C1+C2 fields, "Not shared" for the rest, what is never shared
  with coaches, and a note that sessions and notes come later.
- **End relationship** asks for confirmation. Only the backend's `204`
  confirms the end and is reported as "ended". A `404` (already ended by
  either side, or not reachable for this coach) proves nothing about this
  request: the coach sees a neutral "no longer available" message without
  the fighter's name. Either way the cached fighter is dropped, every roster
  list is refetched and the coach returns to the roster.
- Ended, foreign or unknown relationships, and sharing switched off, are one
  "not available" state (`404`), with no detail of which.

## Privacy

- Only the coach's own `/api/v1/me/coach/*` endpoints are read; no Fighter
  profile DTO is fetched. Rendering never goes beyond the generated DTO
  fields, so extra data in a response is not shown (tested with canaries).
- Session boundaries clear the query cache (SF-28), so one coach's roster
  never reaches the next account in the tab.
- No token or secret travels in a URL.

## Approved differences from the artboards

1. The roster is an ARIA table whose rows hold one link (the name)
   stretched over the row, so a row stays a row for assistive technology
   and remains clickable as a whole.
2. Below 1024 px the invitations column moves under the roster; below 768 px
   the roster rows stack their cells with visually hidden labels.
3. Initials avatars are round, as in the Coach dashboard.

## Verification

- Unit: `widgets/coach-fighters/ui/coach-fighters.test.tsx`,
  `widgets/coach-fighters/ui/coach-fighter-detail.test.tsx` (states, paging,
  unavailable versus empty, privacy canaries, invite / resend / cancel /
  end and their errors), `widgets/workspace-shell/ui/workspace-shell.test.tsx`.
- Production (contract double): `e2e/production/coach-fighters.spec.ts` (nav
  link and `aria-current`, artboard anchors at 1440 × 900, the laptop and
  desktop matrix, 1024 / 768 / 390, axe including the dialogs, the gate off,
  the blocked composer, end with confirmation, no secrets in URLs).
- Storybook: `src/stories/screens/coach-fighters`,
  `e2e/coach-fighters-storybook.spec.ts`.
- Real backend: a local smoke against Phoenix and PostgreSQL on a throwaway
  database, with the gate on (roster, canaries absent, invitations, invite,
  existing invite, resend cooldown, cancel, end, not-available ids) and off
  (not available, inviting disabled).
