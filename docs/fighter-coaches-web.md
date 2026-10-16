# Fighter web coaches and invitation acceptance (SF-60)

The fighter's side of coaching on the web, against Claude Design **Version
101** (`1792151007-1d70`), on SF-56 (`listMyCoaches`, `endMyCoachRelationship`)
and SF-57 (`previewCoachInvitation`, `acceptCoachInvitation`,
`declineCoachInvitation`).

## Design reconciliation

Up to Version 99 the web had no page for the E08 link and no fighter coaches
screen (`GAP-WEB-COACH-FIGHTER-INVITE`). With approval, SF-60 added them; the
artifact was at its 511-file limit, so the frozen `TimerReady` / `TimerRest`
previews were removed (T02 / T05 now point at `TimerLive.dc.html` with their
`phase`, as the registry's queries already said).

| Artboard                  | Source                      | Route                          | Production        | Status          |
| ------------------------- | --------------------------- | ------------------------------ | ----------------- | --------------- |
| WFI1 Coach invitation     | `WebFighterInvite.dc.html`  | `/invite/coach` (`#token=…`)   | `CoachInvitation` | current         |
| WFC1 My coaches           | `WebFighterCoaches.dc.html` | `/app/coaches` (`?view=ended`) | `FighterCoaches`  | current         |
| FighterWebNav · Coaches   | `FighterWebNav.dc.html`     | `web.app.fighter#coaches`      | `WorkspaceShell`  | current         |
| Incoming invitation inbox | —                           | —                              | —                 | blocked (SF-73) |
| Coach relationship detail | —                           | —                              | —                 | blocked (SF-74) |

## The invitation link (WFI1)

- **Link:** `{WEB_APP_URL}/invite/coach#token=sfi_…` (SF-57, E08). The token
  is in the fragment, which never reaches a server: the page is static and
  everything about the token happens in the browser.
- **Token lifecycle** (`entities/pending-coach-invitation`): read once from
  the fragment, validated (`sfi_` + 43 URL-safe characters, never altered),
  the fragment removed from the address bar and history; kept in this tab's
  `sessionStorage` (memory when unavailable), never in a URL, `returnTo`,
  query key, log or `localStorage`. It is unbound while signed out, bound to
  the first signed-in viewer, and dropped at any later session boundary
  (sign-out, expiry, another account), after an hour, and on every final
  outcome. It travels only in SF-57 request bodies.
- **Preview:** anonymous `previewCoachInvitation`: the coach's public
  identity, note, expiry and the disclosure (fields shared, never shared,
  version). `404` (sharing off) and `410` (not a current token) are one
  generic "not available" state, as the API intends; `429` and network
  failures are retryable.
- **Continuation:** "Sign in to respond" and "Create an account" carry the
  token-free `returnTo=/invite/coach` and `intent=fighter` through sign-in,
  sign-up, WA5 and the Fighter onboarding (WF0 → WF1 → WF6), whose last step
  now continues back ("Continue") instead of dropping the `returnTo` (a
  pre-existing gap fixed in SF-60). A Coach without a fighter profile goes
  through Fighter onboarding first. Nothing is accepted on the way.
- **Eligibility:** the entry (SF-45) decides whether the account and fighter
  profile are complete; the backend decides the recipient on submit (a
  verified email identity of the invited address). Google- or Apple-only
  accounts get the recipient-mismatch state until verified-email linking
  exists (SF-77–79).
- **Consent:** an unticked checkbox naming the coach and the backend's
  disclosure version; Accept stays disabled until it is ticked, and submits
  exactly that version. No legal prose is invented: the disclosure is the
  backend's structured projection; a document link comes with SF-71/72.
- **Outcomes:** accepted (or already connected), declined, recipient
  mismatch (`403`, nothing revealed; "Sign out and switch account"),
  profile required (`422`), stale disclosure (`409`: the preview is
  reloaded and consent cleared), not available (`404` / `410`), rate
  limited (`429`), failure. One request at a time; the outcome heading takes
  focus. Closing the page declines nothing.

## My coaches (WFC1)

- `listMyCoaches`, Active and Ended (`?view=ended`), cursor pages of 50.
  Active rows show the coach's display name or brand and start; expanding a
  row shows what that coach sees (`disclosed_fields`) and End relationship.
  Ended rows show only the name at the end, the date and who ended it.
- No detail route: fighters have no single-relationship read (SF-74), and the
  page never scans pages to fake one.
- End relationship: confirmation, one request, only the backend's `204` is
  reported as ended; a `404` gets a neutral message without the name. Either
  answer refetches the lists; other coaches are untouched.
- Loading, empty, unavailable (`404`) and failure are separate states.

## Verification

- Unit / component: `entities/pending-coach-invitation` (fragment capture,
  malformed tokens, binding, boundary, expiry), `widgets/coach-invitation`
  (signed out, unavailable, missing, profile required, explicit consent,
  single submit, already connected, mismatch, stale, answered elsewhere,
  decline), `widgets/fighter-coaches`, `features/fighter-onboarding`
  (WF6 continuation, unsafe `returnTo` dropped), registry tests.
- Storybook: `src/stories/screens/coach-invitation`,
  `src/stories/screens/fighter-coaches`, `e2e/fighter-coaches-storybook.spec.ts`.
- Production (contract double): `e2e/production/fighter-coaches.spec.ts`
  (geometry at 1440 × 900 and the laptop matrix, 1024 / 768 / 390, axe,
  token never in a request URL or `localStorage`, screenshots).
- Real backend (Phoenix + PostgreSQL, throwaway database, test-only sharing
  configuration): an existing fighter signs in from the link and accepts;
  the same link again is not available; decline creates nothing; another
  verified account gets the mismatch and creates nothing; a new person signs
  up, completes WA5 and Fighter onboarding, returns to the invitation and
  accepts; ending one of two relationships leaves the other; sharing off
  shows the generic unavailable state. No token appeared in any request URL
  or console message other than the opening E08 link.
