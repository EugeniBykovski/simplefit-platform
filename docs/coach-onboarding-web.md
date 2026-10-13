# Coach web registration (SF-52)

The production Coach web registration against Claude Design **Version 87**
(`1791896379-65b7`), onboarding page, section **COACH · 5d · Registration ·
web**, on the SF-50 CoachProfile API and the SF-51 entry resolution.

## Inventory

| Screen               | Design source                         | Route                                | Production                         | Backend                                | Status   |
| -------------------- | ------------------------------------- | ------------------------------------ | ---------------------------------- | -------------------------------------- | -------- |
| WCR1 · Coach profile | `WebRegCProfile.dc.html` (1440 × 980) | `/app/onboarding/coach?step=profile` | `ProfileStep` in `CoachOnboarding` | SF-50                                  | current  |
| WCR2 · Coaching type | `WebRegCType.dc.html` (1440 × 980)    | `?step=type`                         | `TypeStep`                         | SF-50                                  | current  |
| WCR7 · Complete      | `WebRegCDone.dc.html` (1440 × 940)    | `?step=complete`                     | `CompleteStep`                     | SF-50 completion, SF-51 context choice | current  |
| WCR3 · Credentials   | `WebRegCCreds.dc.html`                | `?step=credentials`                  | —                                  | needs the verification domain          | DEFERRED |
| WCR4 · Business size | `WebRegCSize.dc.html`                 | `?step=size`                         | —                                  | needs the billing domain               | DEFERRED |
| WCR5 · Gym           | `WebRegCGym.dc.html`                  | `?step=gym`                          | —                                  | needs the Gym domain                   | DEFERRED |
| WCR6 · Plan          | `WebRegCPlan.dc.html`                 | `?step=plan`                         | —                                  | needs the billing domain               | DEFERRED |

WCR3–WCR6 never appear in the flow or the step card; a FUTURE `?step=`
resolves to the resume step (`D-WEB-COACH-ONBOARDING-FLOW`).

## Data and ownership

- **SF-50 is the only authority** (`src/entities/coach-profile`, generated
  operations through `callWithSession`): `GET /api/v1/me/coach-profile`
  (always 200; `not_started` before the first save), `PATCH` (any subset;
  `null`, blank or `[]` clears; the first save creates the profile) and
  `POST …/complete-onboarding` (the server checks every requirement and the
  completed account registration). The cache holds the backend's latest
  answer only; it is refetched on window focus.
- **Several clients at once**: as for Fighter onboarding (SF-27), a save
  sends only the fields this page changed (`changedOnly`), and a refetch
  updates every field not being edited (`keepDirtyValues`).
- **Fields**: WCR1 `display_name` (required, 1–60), `brand_name` (1–80),
  `country_code` (required, ISO 3166-1 alpha-2, the shared country list),
  `city` (required, 1–80), `bio` (up to 500, line breaks kept), `languages`
  (`en pl ru be uk`, shown by their native names); WCR2 `coaching_formats`
  (at least one) and `competition_levels`. Every vocabulary is the generated
  OpenAPI enum. Lengths count code points, as the API does.
- **Validation** is the API's: errors are mapped from `field_codes`
  (`required`, `too_long`, `invalid_format`, `invalid_choice`, `invalid`,
  `invalid_type`), never from messages. Continue and Finish check the step's
  requirements first, for immediate feedback only.
- **The account name is a suggestion only.** For a new, unsaved profile
  (`not_started`, no coach name) WCR1 pre-fills the coach name with the
  account's `full_name` as an editable value and says so. It reaches the API
  only when the visitor saves the step; a coach name saved elsewhere
  meanwhile replaces it while it is untouched; a saved coach name is never
  replaced; the account is never written.

## Steps, resume and completion

- `?step=` is navigation only. With no step (or a FUTURE, invalid or
  `complete` step on an unfinished profile) the page opens the earliest step
  with a missing requirement.
- Continue, Back, the step card and Save & exit save what changed before
  moving. Finish saves, then completes; WCR7 shows only after the API
  confirmed completion in this tab. Missing Coach profile details are listed
  on WCR2 with "Go to Coach profile"; a missing account registration links to
  WA5 with the Coach intent.
- **WCR7 → Coach home.** "Continue to coach home" records the explicit Coach
  context choice (`PUT /api/v1/me/entry/context`, SF-51) and goes through
  `/app`, where the entry resolver answers `coach_home` → `/app/coach`. A
  failed choice keeps the visitor on WCR7 with Try again. Coach Home is not
  built yet: `/app/coach` is the canonical "Planned" placeholder, and WCR7
  says so ("Coach tools are not available yet.") instead of promising a
  workspace.
- A completed Coach on this route (any `?step=`) leaves through
  `/app?intent=coach`, which resolves to Coach home whatever the last chosen
  context.
- **Workspace gates** check the capability the entry reports, not the last
  chosen context: the Coach area (`/app/coach/*`) needs COACH (`CoachGate`),
  the Fighter area FIGHTER (`FighterGate`), so a user with both profiles
  opens either. WF6's "Go to my home" asks the entry with `intent=fighter`,
  so a Coach finishing Fighter onboarding lands on Fighter home.
- `context_selection` has no route (`D-ENTRY-CONTEXT-SELECTION`): the web
  treats it as an unknown destination (a retryable failure), never as WA6.

## Approved differences from the artboards

1. **No email in the header.** WCR1/WCR2 draw the account email next to
   Save & exit; the session's viewer (`GET /api/me`) carries no email, so
   the header shows the badge and Save & exit only, as WF0/WF1 do.
2. **WCR7 copy (pending design reconciliation).** Version 87 draws "Open
   coach workspace". Production says "Continue to coach home" and adds the
   neutral note "Coach tools are not available yet. Your coach home shows
   what is planned. Your profile is ready for it.", and the failure title
   "We couldn’t open your coach home.", because Coach Home does not exist
   yet. The same change is prepared for the canonical artboard; publishing
   it to Claude Design awaits approval.
3. **Save & exit** saves unsaved edits and goes to the public site, as in
   Fighter onboarding.
4. **Step rows** are 40 px; **radii** follow §8.1: the step card's 24 px is
   `3xl` 22, the 36/38 px pills are full pills on 36 px; the format card's
   20 px and the 76 px completion tile's 26 px (`4xl` 28) are within ±2 px.

## Verification

- `src/features/coach-onboarding/model/model.test.ts`: step resolution,
  patches, lengths, the name suggestion, error mapping.
- `src/features/coach-onboarding/ui/profile-step.test.tsx`: the suggestion
  is saved only with the step and never replaces a saved coach name.
- `src/features/session-gate`: `coach_home`, `context_selection`, the
  capability gates and the router-read continuation.
- `e2e/production/coach-onboarding.spec.ts`: the flows on the production
  build against an SF-50 / SF-51 test double (`e2e/production/onboarding-api.ts`).
- `e2e/production/coach-geometry.spec.ts`: artboard geometry at 1440, the
  laptop matrix, 1440 × 980 and 390 × 844, axe on every screen.
- `src/stories/screens/coach-onboarding/registration.stories.tsx` and
  `e2e/coach-storybook.spec.ts`: every state in Storybook.
- `e2e/real-api/coach-journey.spec.ts`: the new-Coach journey against a real
  API on a disposable database (local acceptance gate).
