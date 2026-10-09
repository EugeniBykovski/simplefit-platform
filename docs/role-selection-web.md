# Web role selection · WA6 (SF-47)

The production **WA6 Choose where to start** screen against Claude Design
**V78** (`1791448557-b0b9`; unchanged in the later published version
`1791484446-8cb2`), artboard `WebRoleSelect.dc.html` (1440 × 980; states
`none`, `fighter`, `coach`, `gym`, `sponsor`, `continuing`), on the SF-45
entry resolver.

One user identity, several possible product contexts, no registration role:
a journey picked here is navigation context only.

## Inventory

| Screen                      | Design source                        | Route                     | Production                                                | Backend                  | Status  |
| --------------------------- | ------------------------------------ | ------------------------- | --------------------------------------------------------- | ------------------------ | ------- |
| WA6 · Choose where to start | `WebRoleSelect.dc.html` (1440 × 980) | `/app/onboarding/role`    | `RoleSelection` (widget), `useEntryChoice` (session-gate) | SF-45                    | current |
| Fighter onboarding          | `WebRegFAccount.dc.html` …           | `/app/onboarding/fighter` | SF-38 / SF-27                                             | SF-25                    | current |
| Coach registration          | `WebRegC*.dc.html`                   | `/app/onboarding/coach`   | SF-32 placeholder                                         | needs the Coach domain   | pending |
| Gym setup                   | `WebSetup*.dc.html`                  | `/app/onboarding/gym`     | SF-32 placeholder                                         | needs the Gym domain     | pending |
| Sponsor application         | `BecomeSponsor.dc.html`              | `/partners/apply`         | SF-32 placeholder                                         | needs the Sponsor domain | SF-43   |

## Measurements (1440 × 980)

The frame is the WA5 onboarding frame:

- the 72 px header (brand on the 56 px gutter, the neutral "Account setup"
  badge, Sign out);
- the 250 / fluid (662) / 320 columns at x 64 / 354 / 1056, starting at
  y 120.

The heading and cards:

- The eyebrow is at y 120, and the two-line 32 px heading at y 141 (h 80).
- The cards form a 2 × 2 grid of 324 × 168 at (354, 296), (692, 296),
  (354, 478) and (692, 478), 14 apart. Each card has radius 20, 18
  padding, a 42 × 42 icon tile (radius 14) and a 20 px ring.
- The hint is at y 668, and Continue (48 px, at least 120 wide) sits on the
  column's right edge at y 722.

The aside holds the "One account" card (radius 22) and the muted note.
Production matches every x and width and every card exactly. The heading,
lead, hint and Continue are within 1 px. The aside card is 4.5 px taller and
the step rows sit 3 px lower, from type-role line heights, as on WA5.

## Behaviour

- **When WA6 shows.** The onboarding gate asks the resolver with the URL's
  continuation:
  - an incomplete account goes to WA5;
  - `role_selection` shows WA6;
  - any other answer continues to its destination, so nothing bounces (an
    intent in the URL, a Fighter profile in progress, a completed Fighter
    who goes home).
  - A destination this client does not map is a failure screen, never a
    guessed route.
- **The choice.** The four journeys are one native radio group (arrow keys
  choose, Tab leaves). Nothing is picked by default. Continue is disabled
  until a choice, and the visible hint describes why; its label names the
  journey.
- **Continue** (`useEntryChoice`) asks `GET /api/v1/me/entry` again with
  `intent=<choice>` and the URL's `returnTo`. It then goes to
  `entryHref(entry, continuation)`, the same mapping and precedence as every
  other entry:
  - Fighter goes to `fighter_onboarding` (WF0, which owns its steps), or to
    `fighter_home` when the Fighter profile is already complete.
  - Coach and Gym go to their onboarding routes, with the intent and a safe
    `returnTo` riding along.
  - Sponsor goes to the public `/partners/apply`.
  - It never goes to `/workspaces` or WA2; the web has no workspace chooser
    in entry.
- **Nothing is stored or created.** WA6 sends no write. A reload asks again
  ("Your pick isn't saved"). No role, profile, capability, workspace or
  membership comes from a choice. The intent lives only in the URL of the
  destination.
- **One resolution at a time.** The choice and Continue lock while it
  resolves ("Opening…").
- **A failure** keeps WA6 and the choice: an amber notice, announced by the
  page's live region, with Retry.
  - A destination this client does not map is `unexpected`: it is logged
    with its name only, and the visitor is asked to reload.
  - An expired session goes to sign-in through the session gate.
- **History.** The choice pushes the destination, so Back returns to WA6
  (it asks the resolver again) and Forward returns to the journey.

## Approved differences from the artboard

1. **Icons** are Lucide: Fighter `HandFist` for the drawn glove, Coach
   `UserCheck`, Gym `House`, Sponsor `Star`.
2. **Card title** 17 px → `metric-sm` 18 (§8.1, ±1) at semibold, as on the
   sign-up journey cards.
3. **Card notes** use `type-label-tight` (mono 10/14, 0.08em, uppercase), a
   role added by decision in SF-47 (`typography.onboardingRoles.web`,
   `docs/design-reconciliation.md`): `label` (0.14em) wrapped the longest
   English note where the artboard keeps one line.
4. **Account basics** in the step card is done but not a link (the artboard
   links it to WA5): a completed registration is never reopened.
5. **Disabled and busy Continue** use the primitive's 50 % opacity (drawn
   45 % and 70 %) and its spinner.

## Downstream dependencies

- Coach, Gym and Sponsor onboarding are SF-32 placeholders. WA6 reaches
  their canonical routes truthfully, with no workspace or capability.
- The Fighter home (`/app/home`) and its first run are SF-40
  (`docs/fighter-home-web.md`).
- Legal: the Terms and Privacy documents (SF-48) gate public launch. See
  `docs/account-registration-web.md`.

## Verification

- `src/features/session-gate/ui/session-gate.test.tsx`: the gate's
  role-selection rule, unknown destinations, and `useEntryChoice` (intent,
  precedence, single flight, failures).
- `e2e/production/role-selection.spec.ts`: the flows on the production build
  against the SF-44 / SF-45 test double:
  - every journey, invalid intents and malicious `returnTo` values;
  - failure and retry, keyboard, history, the session, multi-tab;
  - email, Google and Apple without an intent, and the generic sign-up →
    WA5 → WA6 → Fighter → home journey;
  - geometry at 1440 × 980, the laptop matrix and 390, with axe.
- `src/stories/screens/account-registration/where-to-start.stories.tsx` and
  `e2e/role-storybook.spec.ts`: every state in Storybook, real hover and
  keyboard focus.
