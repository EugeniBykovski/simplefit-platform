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
  length for UX. An invitation already pending to the address is reported as
  "Already invited".
- **Coach data rules:** inviting needs a published, acknowledged data-rules
  version (`getMyCoachDataRules`). The API exposes no document to read or
  acknowledge yet, so while the rules are not published (or not
  acknowledged) the composer shows a truthful blocked state, with no checkbox
  and no invented legal text or version. **Backend/legal dependency:** the
  document reference (URL or text) for the coach data rules.

## One fighter (WC4)

- The disclosed C1+C2 fields, "Not shared" for the rest, what is never shared
  with coaches, and a note that sessions and notes come later.
- **End relationship** asks for confirmation. The backend ends it (an
  already ended one counts as ended). The cached fighter is dropped, and the
  coach returns to the roster with a confirmation.
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
