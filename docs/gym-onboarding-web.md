# Gym owner web registration (SF-86)

The production Gym owner web registration against Claude Design
`1792675284-1046` (artifact `JEsBg51MjX8KiHWEro8omY`), onboarding page,
section **GYM · 5e · Owner registration & setup · web**, on the SF-83 gym
creation, SF-84 entry resolution and SF-85 gym setup APIs (ADR 0026 in
simplefit-api). The SF-82 reconciliation (D-G01–D-G26) decides what is
current; the approved SF-86 differences below say how the artboards map to
it. Claude Design is unchanged and is reconciled separately.

## Inventory

| Screen                    | Design source                               | Route / query                   | Production                              | Backend                                          | Status   |
| ------------------------- | ------------------------------------------- | ------------------------------- | --------------------------------------- | ------------------------------------------------ | -------- |
| OG0 · Owner handoff       | `OnbGHandoff.dc.html` (mobile)              | `mobile.onboarding.gym`         | — (SF-87)                               | —                                                | mobile   |
| OG1 · Gym name & type     | `WebSetupGym.dc.html` (1440 × 900)          | `/app/onboarding/gym?step=type` | `TypeStep` in `GymOnboarding`           | SF-83 `createGym`, SF-85 `updateGymSetup`        | current  |
| OG2 · Location            | `WebSetupLocations.dc.html` (1440 × 900)    | `?step=location`                | `LocationStep`                          | SF-85 `setGymPrimaryLocation`                    | current  |
| OG3 · Branding            | `WebSetupBrand.dc.html` (1440 × 900)        | `?step=branding`                | `BrandingStep`                          | SF-85 `updateGymSetup`, `completeGymSetup`       | current  |
| OG4 · Gym size            | `WebSetupSize.dc.html`                      | `?step=size`                    | — (rail row, "coming later")            | no sizing domain (D-G14)                         | DEFERRED |
| OG5 · Features            | `WebSetupFeatures.dc.html`                  | `?step=features`                | — (rail row)                            | no entitlement domain (D-G14)                    | DEFERRED |
| OG6 · Plan · trial        | `WebSetupPlan.dc.html`                      | `?step=plan`                    | — (rail row)                            | no billing domain                                | DEFERRED |
| OG6b · Gym created        | `WebGymRegDone.dc.html` (1440 × 900)        | `?step=complete`                | `CreatedStep`                           | SF-85 completion, SF-84 context choice and entry | current  |
| OG7–OG14 · Get ready      | `WebSetupVerify` … `WebSetupLaunch.dc.html` | `?step=verify` … `?step=launch` | — (rail rows; OG6b "coming later" list) | no verification, staff, member, payment domains  | DEFERRED |
| GymSetupSteps (component) | `GymSetupSteps.dc.html` (300 × 900)         | —                               | `SetupSidebar` (`setup-frame.tsx`)      | the setup's saved state                          | current  |

A FUTURE `?step=` never opens anything: it resolves to the resume step
(`D-WEB-GYM-ONBOARDING-FLOW`, route registry).

## Data and ownership

- **The backend is the only authority** (`src/entities/gym-setup`, generated
  operations through `callWithSession`). The draft to resume is the viewer's
  owned draft from `GET /api/v1/me/gyms` (the creation rules keep at most one
  per creator); its fields, `revision`, `missing_requirements` and
  `setup_status` come from `GET /api/v1/gyms/{gym_id}/setup`. Nothing is
  written optimistically; the cache is refetched on window focus. No business
  state is kept in browser storage.
- **Creation** (OG1 Continue, never an effect): `POST /api/v1/gyms` with
  `name`, `gym_type` and the attempt's `client_request_id`. The key is one
  UUID per attempt, in memory: every retry of a lost or failed response
  repeats it, so the API returns the same gym. It is renewed only after the
  API reported it spent (`409 client_request_id: discarded` / `reused`), and
  then only for the visitor's next explicit Continue. A new key while a draft
  exists resolves to that draft (fields ignored): the page says so and loads
  its saved values, keeping what was typed. Phone and website follow as the
  first `PATCH` against the new revision.
- **Every partial write carries `expected_revision`** (`updateGymSetup`,
  `setGymPrimaryLocation`). `409 revision: stale` writes nothing: the page
  re-reads the setup, keeps the visitor's edits in their fields (the other
  fields show the latest values), and saves again only on an explicit
  "Save my changes". No automatic retry, no last-writer-wins.
- **Saves send only what changed** (`changedOnly`); the location is written
  whole and only when it differs from the saved one; its name defaults to
  the city.
- **Validation** is the API's: messages come from `field_codes`; Continue
  checks the contract shapes first, for immediate feedback only (name 1–80,
  six gym types, the phone pattern, an http(s) website without credentials —
  `https://` is added when the scheme is left out — tagline ≤ 120, the six
  accent swatches, country/city/address required).
- **Completion** only through `POST /api/v1/gyms/{gym_id}/complete-setup`
  (OG3 "Create gym" after saving the branding, or "Skip for now" without it).
  Missing requirements are listed with a way to their step; a missing account
  registration links to WA5. OG6b shows only after the API answered
  `completed` in this tab; the entry resolutions are dropped from the cache.
- **Go to gym**: `PUT /api/v1/me/entry/context` (`context: gym`, the gym's
  id), then `/app?intent=gym`; the SF-84 resolver opens `gym_home`
  (`/app/gym`, the SF-88 placeholder today).

## Errors and uncertain outcomes

| Answer                             | Shown                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| no answer, 408, 5xx                | amber "couldn't confirm"; input kept; Retry is safe (key / revision)  |
| 422                                | coral field errors, focus on the first; completion: missing list      |
| 409 `revision: stale`              | amber conflict, latest loaded, edits kept, explicit "Save my changes" |
| 409 `client_request_id: discarded` | amber "draft was discarded"; the next Continue starts a new gym       |
| 409 `setup_status: completed`      | the setup is re-read; the route leaves through the entry              |
| 429                                | amber "several gyms today"; the time when readable, otherwise "later" |
| 403                                | coral "only the owner can change its setup"                           |
| 404                                | amber "no longer available" with "Start a new gym" (looks again)      |
| 401 / session ended                | the session gate signs in again with the Gym intent                   |

The API does not list `retry-after` in `access-control-expose-headers`, so a
cross-origin browser cannot read it; the 429 notice then says "later" instead
of guessing (follow-up for simplefit-api).

## Approved differences from the artboards

Approved for SF-86 ("Approved differences"); the artboards stay as drawn.

1. **Three-step progress.** The rail numbers OG1–OG3 ("Step N of 3"); OG4–OG14
   are listed under "Coming later", unnumbered and never links. The rail's
   "Stuck? Book a call" card is not shown (no such service).
2. **No public handle or public URL** (OG1, OG3): there is no handle domain.
3. **One location** (OG2): no "Add another location" or Wola/Mokotów rows;
   the list shows the one main location and "Adding more locations isn't
   available yet."
4. **Logo and Cover are not available yet** (OG3): the logo tile shows the
   initials on the chosen accent, the cover a dashed "not available yet"
   panel; no file input, no upload, nothing stored.
5. **No verified, trial or plan copy** anywhere (OG3 preview, OG6b); OG6b has
   no trial notice, "Plan details" or "Continue setup", and lists the
   get-ready steps as "coming later".
6. **OG3's primary action is "Create gym"** (`completeGymSetup`), with "Skip
   for now" beside it; OG4–OG6 are never forced.
7. **OG6b "Gym created"** with one action, "Go to gym", through the entry.
8. **Previews are not "How members see you"**: members cannot see a gym yet,
   so the asides are labelled "Preview" / "Address preview" / "Live preview"
   and say the gym stays private. The OG1 cover placeholder is omitted.
9. **The identity note** (OG1) names no provider or email (the client does
   not have them): "This gym belongs to the account you're signed in with".
10. **No Back on OG1**: it is the first step of the flow.

## Layout

The GymSetupSteps frame: a 300 px rail on the `surface` well (sticky, full
height, scrolls on short windows), the step header on 48 px gutters (mono
eyebrow, 30 px `type-setup-title`, lead, save status), the form beside the
360 px aside (26 px apart), and the 84 px action bar (sticky at the bottom).
OG6b: 64 px gutters, the form and a 380 px list. Below `desktop` (1180 px) the
rail becomes a top bar (brand, progress, the three steps, "11 more steps come
later"), the aside stacks under the form and the gutters step down to
16/24/32 px.

## Verification

- Unit: `src/features/gym-onboarding/model/model.test.ts` (steps, outcomes,
  form values), `ui/steps.test.tsx` (create key, lost response, discarded
  key, resumed draft, rate limit, stale revision, Skip, completion).
- Storybook: `Gym Onboarding/Registration` (every state, German, phone,
  light theme), checked by `e2e/gym-storybook.spec.ts`.
- Production build: `e2e/production/gym-onboarding.spec.ts` (journeys and
  payloads against `e2e/production/gym-api.ts`) and
  `e2e/production/gym-geometry.spec.ts` (1440 geometry, 1920–1280 desktop
  matrix, 1024–320 stacked, seven locales, axe in dark and light), in
  Chromium, Firefox and WebKit (`sf86-*` projects).
- Real backend: `e2e/real-api/gym-journey.spec.ts`.
