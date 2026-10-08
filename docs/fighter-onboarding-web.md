# Fighter web registration (SF-38)

The production Fighter web registration against Claude Design **V78**
(`1791448557-b0b9`, the latest published version when SF-38 was built),
onboarding page, section **FIGHTER · 5c · Registration · web**, on the SF-25
FighterProfile API.

## Inventory

| Screen                | Design source                         | Route                                 | Production                                 | Backend                        | Status    |
| --------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------------ | ------------------------------ | --------- |
| Route · Fighter (web) | `RouteFighter.dc.html`                | —                                     | the route map (`docs/route-registry.json`) | —                              | reference |
| WF0 · Profile basics  | `WebRegFAccount.dc.html` (1440 × 980) | `/app/onboarding/fighter?step=basics` | `BasicsStep` in `FighterOnboarding`        | SF-25                          | current   |
| WF1 · Boxing profile  | `WebRegFProfile.dc.html` (1440 × 980) | `?step=profile`                       | `ProfileStep`                              | SF-25                          | current   |
| WF6 · Complete        | `WebRegFDone.dc.html` (1440 × 900)    | `?step=complete`                      | `CompleteStep`                             | SF-25 completion               | current   |
| WF2 · Gym             | `WebRegFGym.dc.html`                  | `?step=gym`                           | —                                          | needs the Gym domain           | DEFERRED  |
| WF3 · Coach           | `WebRegFCoach.dc.html`                | `?step=coach`                         | —                                          | needs the Coach domain         | DEFERRED  |
| WF4 · Privacy         | `WebRegFPrivacy.dc.html`              | `?step=privacy`                       | —                                          | needs privacy settings         | DEFERRED  |
| WF5 · Notifications   | `WebRegFNotify.dc.html`               | `?step=notifications`                 | —                                          | needs notification preferences | DEFERRED  |

WF2–WF5 never appear in the flow or the step card; a deferred `?step=`
resolves to the resume step.

## Data and ownership

- **SF-25 is the only authority** (`src/entities/fighter-profile`, generated
  operations through `callWithSession`): `GET /api/v1/me/fighter-profile`
  (always 200; `not_started` before the first save), `PATCH` (any subset,
  `null` clears, the first save creates the profile) and
  `POST …/complete-onboarding` (the server checks every requirement and the
  completed account registration). The cache holds the backend's latest
  answer only; it is refetched on window focus, and a form that is being
  edited is never overwritten by it.
- **Fields** (`display_name` is the Fighter-facing name; it never touches the
  account's `full_name`): WF0 `display_name`, `username`, `country_code`
  (ISO 3166-1 alpha-2), `city`; WF1 `experience_level`, `stance`,
  `amateur_bout_count`, `goals`, `weight_class`, `current_weight_kg`,
  `height_cm`, `next_fight_on`, `next_fight_name`. Every vocabulary is the
  generated OpenAPI enum (identical in the mobile client).
- **Validation** is the API's: errors are mapped from `field_codes`
  (`already_exists`, `invalid_format`, `required`, …), never from messages.
  WF0's Continue checks the step's requirements and the published username
  shape first, for immediate feedback only. Numbers are never rounded: a
  weight with two decimals is sent as typed and rejected (`invalid_format`).
- **Countries** come from the runtime's CLDR region data minus the codes ISO
  does not assign (`src/shared/lib/countries.ts`): exactly the 249 codes the
  API accepts, named in the reader's language; the code is stored.

## Steps, resume and completion

- `?step=` is navigation only. With no step (or a deferred, invalid or
  `complete` step on an unfinished profile) the page opens the earliest step
  with a missing requirement: SF-25 persists data, not a UI cursor.
- Continue, Back, the step card and Save & exit save what changed before
  moving; Continue also requires WF0's fields. Finish saves, then completes;
  WF6 shows only after the API confirmed completion in this tab.
- A completed Fighter on this route (any `?step=`, including `complete`)
  leaves through `/app`, where the entry resolver (SF-45) sends them home.
  "Go to my home" on WF6 takes the same path, so there is no redirect loop.
- Completion refused for an incomplete account registration (SF-44) shows a
  notice linking to account basics (WA5) with the Fighter intent. The
  onboarding gate normally sends such a user to WA5 first.
- `intent` and `returnTo` stay on the URL through every step.

## Approved differences from the artboards

1. **Next fight date** is the browser's date input (localized format and
   picker) instead of the drawn text "Tue, 3 Nov 2026".
2. **Save & exit** saves unsaved edits and goes to the public site: inside
   the application the resolver would send an unfinished Fighter straight
   back to this step.
3. **Status dot** of the notices sits 1 px higher (the 4 px spacing step for
   the drawn 5 px).
4. **Step rows** are 40 px tall (the drawn 7 px padding around a 26 px
   circle) on the 10 px horizontal step.
5. **Radii** 24 and 19 px use the `3xl` (22) and `xl` (18) steps; `#5B615C`
   (Complete, upcoming) uses `faint-foreground`.

## Current limitation

Fighter onboarding completes against the real API, but a brand-new user
reaches it only after account registration (WA5), which is still a
placeholder: the full sign-up → Fighter journey is not yet possible for a new
account in the browser. Accounts whose registration is complete (created by
the API or the mobile app) go through WF0 → WF1 → WF6 end to end. The Fighter
home (`/app/home`) is also a placeholder.

## Verification

- `src/features/fighter-onboarding/model/model.test.ts`: step resolution,
  error mapping, number parsing.
- `e2e/production/fighter-onboarding.spec.ts`: the flows on the production
  build against an SF-25 test double (`e2e/production/fighter-api.ts`).
- `e2e/production/fighter-geometry.spec.ts`: artboard geometry at 1440 and
  the laptop matrix, axe on every screen.
- `src/stories/screens/fighter-onboarding/registration.stories.tsx` and
  `e2e/fighter-storybook.spec.ts`: every state in Storybook.
