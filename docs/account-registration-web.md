# Web account registration · WA5 (SF-46)

The production **WA5 Account basics & consent** screen against Claude Design
**V78** (`1791448557-b0b9`), artboard `WebAccountBasics.dc.html`
(1440 × 980; states `loading`, `empty`, `resumed`, `ready`, `saving`,
`invalid`, `failure`), on the SF-44 account registration and the SF-45 entry
resolver.

## Inventory

| Screen                         | Design source                           | Route                     | Production                                                              | Backend                  | Status  |
| ------------------------------ | --------------------------------------- | ------------------------- | ----------------------------------------------------------------------- | ------------------------ | ------- |
| WA5 · Account basics & consent | `WebAccountBasics.dc.html` (1440 × 980) | `/app/onboarding/account` | `AccountRegistration` (widget) → `AccountBasicsStep` (feature)          | SF-44, SF-45             | current |
| Onboarding frame               | WA5, WF0, WF1 headers                   | —                         | `OnboardingFrame`, `OnboardingGrid`, `OnboardingStepCard` (`shared/ui`) | —                        | current |
| WA6 · Where to start           | `WebRoleSelect.dc.html`                 | `/app/onboarding/role`    | SF-32 placeholder                                                       | SF-45 (`role_selection`) | SF-47   |

The route renders under the onboarding layout: `RequireSession` (an
anonymous visitor goes to `/login` with the journey's `intent`) and
`OnboardingGate` (an incomplete account stays here; a complete one goes to
the resolver's destination). No public footer, no placeholder badge.

## Data and ownership

- **SF-44 is the only authority** (`src/entities/account-profile`, the
  generated `getMyAccountProfile`, `updateMyAccountProfile` and
  `completeAccountRegistration` through `callWithSession`). Opening WA5 only
  reads (`GET` is 200 and `not_started` before the first save) and creates
  nothing. Nothing is stored in the browser.
- **Dirty fields only.** Continue sends a `PATCH` with the fields this form
  changed and that pass the immediate checks. An invalid field is left out
  so it never blocks the valid ones. A saved field becomes the new baseline
  and is never sent again. Unchanged fields are never sent as defaults.
  `full_name` is trimmed, never truncated, and has no character rules. An
  empty name is not sent. A date of birth is never cleared.
- **Full name** is the account's (`AccountProfile.full_name`), never the
  Fighter's public `display_name`; WF0 asks for that separately.
- **Date of birth** is the browser's date input, whose value is already
  `YYYY-MM-DD`. It is sent and compared as that string; it never passes
  through a `Date` instant, so no time zone can shift it. The age rule
  (16 or older by calendar date, 29 February → 1 March in common years) only
  gives immediate feedback against the visitor's local date; the API decides
  against its own (UTC) date (`too_young`, `out_of_range`, `invalid_format`),
  so on a 16th birthday near midnight its answer is the one shown.
  Once registration is complete the form is never shown again, so there is
  no editable date the API would refuse (`immutable` is still mapped).
- **Terms and Privacy** are checked only when the server reports the
  version in force as accepted (`consents.*.current`). Such a box is locked
  (checked and disabled), because the contract has no withdrawal. An
  acceptance of an older version shows the box unchecked, with a note that a
  new version is in force. A tick is sent as `accept_terms: true` /
  `accept_privacy: true`, and the server records it at the version in force.
  The client holds no version string and never sends `false`. The WA3
  pre-authentication controls are disabled and never contribute.
- **Product news** shows the recorded subscription (missing means no). It is
  sent, in either direction, only when the visitor toggles it, and is never
  a completion requirement.
- **Nothing personal is logged**: no form values, DOB or responses in
  logs, URLs, telemetry or breadcrumbs.

## Completion and continuation

1. Immediate checks; every valid change is saved (`PATCH`, awaited).
2. If anything is missing, the fields say what, and focus moves to the first
   one. Nothing completes.
3. `POST …/complete-registration`; only its success continues. A rejection
   (`required` per missing item) lands on the controls and reloads the
   registration, so a version that came into force meanwhile reopens its
   box.
4. Completion drops the cached entry resolution. `OnboardingGate` resolves
   again (SF-45, with the URL's validated `intent`) and goes to
   `entryHref(entry, continuation)`: a Fighter intent to WF0, Coach / Gym /
   Sponsor to their journeys, otherwise a safe `returnTo`, otherwise role
   selection (WA6). There is no second resolver and no client-side
   destination logic.
5. If the resolver fails after completion, registration stays complete; the
   gate's failure screen offers a retry, and a reload or a later sign-in
   resolves from the server.

Completion is permanent. A completed registration opened again goes straight
to the resolver's destination, writing nothing. A later document version
(`consents.*.current: false`) never reopens it; re-consent is a separate
future lifecycle.

## Concurrency policy

- The registration is refetched on window focus (`staleTime 0`). A newer
  server state updates every field not being edited here; fields being edited
  keep the visitor's input until saved (`keepDirtyValues`).
- Saves are per field and the server applies them as they arrive: the last
  write of a field wins. There is no optimistic locking (the API has none),
  and only edited fields are ever sent, so a stale value never overwrites
  another tab's change to a different field.
- A completion in another tab is seen on focus. This tab then continues to
  the resolver's destination without writing.
- Continue is ignored while a request runs (no duplicate completion), and
  completion is idempotent on the server.

## Approved differences from the artboard

1. **Date of birth** is the browser's date input: localized segments and
   picker, segments drawn in the foreground colour, instead of the drawn
   faint "DD / MM / YYYY" text field. It is the same control as WF1's fight
   date.
2. **No "Read" links** beside Terms and Privacy: no legal documents exist
   yet (see below). They are added when the documents are published.
3. **Vertical rhythm**: x positions and widths are exact. y positions are
   within 1–4 px (+3.2 px at Continue), because the type roles' line heights
   (caption 18 for the drawn 16.8, label 14 for 13) accumulate.
4. **Radii** (§8.1, ±2 px): checkbox 7 → `xs` 6; step card 24 → `3xl` 22;
   agreements card 20 (`2xl`) and aside cards 22 (`3xl`) are exact.
5. **Error indent** under a consent is the 32 px step (drawn 34: the 22 px
   box plus the 12 px gap).
6. **Disabled and busy Continue** uses the primitive's 50 % opacity (drawn
   40 % while loading, 70 % while saving). The busy state also shows the
   spinner.
7. **Invalid controls** use the design system's invalid state (coral border
   plus its soft ring), as in every other form.
8. States the artboard does not draw: a locked accepted consent, the "new
   version in force" note, the load failure, and the completed-on-arrival
   hand-off (a spinner while the gate continues).

## Legal-content blocker

The Terms of Service and Privacy Policy are not published. There is no
registry route, no content in either client, and the API does not own
document text (`Consents`: "Document text is not part of the domain"); the
backend's current versions are configured identifiers. WA5 therefore cannot
let the visitor read the documents it asks them to accept, and it links
nowhere rather than to an empty page or an invented URL.

- **Technical journey**: implemented and verified (sign-up → WA5 → WF0 →
  WF1 → WF6).
- **Legal-content readiness**: **blocked**. It needs approved documents for
  the configured versions, published at registry routes, and the WA5 "Read"
  links.
- **Public launch readiness**: blocked by the above.

## Verification

- `src/features/account-registration/model/form.test.ts`: dates (time zone,
  leap day, age boundary), checks, dirty-field patches, error mapping.
- `e2e/production/account-registration.spec.ts`: the flows on the production
  build against the SF-44 / SF-45 test double (`e2e/production/onboarding-api.ts`),
  including the new-visitor journey, two-tab completion, time zones, axe,
  keyboard, and geometry at 1440 × 980 and the laptop matrix.
- `src/stories/screens/account-registration/account-basics.stories.tsx` and
  `e2e/account-storybook.spec.ts`: every state in Storybook.
