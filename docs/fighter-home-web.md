# Fighter web home · first run (SF-40)

The production Fighter home (`/app/home`, `web.app.home`) and its first run
against Claude Design section **34b · Onboarding · web first run** (version
`1791484446-8cb2`). It builds on the SF-45 entry resolver and the first-run
record of simplefit-api ADR 0018.

## Inventory

| Artifact            | Design source                           | Production                                      | Domain dependency                        | Status                                |
| ------------------- | --------------------------------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| FRW1 · first run    | `FirstRunWebF.dc.html` (1440 × 900)     | `FighterHome` (widget), first-run state         | FighterProfile; first-run record         | current                               |
| FRW2 · tour         | `FirstRunWebFTour.dc.html` (1440 × 900) | `HomeTour`, a coach mark on the Live Board item | first-run record (`fighter_web_tour`)    | current, one step (decision)          |
| Home after it (W01) | `WebHome.dc.html` (1440 × 900)          | `FighterHome`, home state                       | sessions, camp, challenges, social       | greeting only; the rest needs domains |
| Fighter shell       | `FighterWebNav.dc.html` (240 × 900)     | `WorkspaceShell` (SF-31 / SF-34)                | workspaces (identity card, next session) | current, as SF-34                     |
| Flow                | `FlowFirstRun.dc.html`                  | this document                                   |                                          | reference                             |

Section 34b holds exactly FRW1 and FRW2. FRW2 draws step 2 of 4; steps 1,
3 and 4 are not designed.

## Lifecycle

- **Who sees Home.** Every `web.app.fighter` page sits behind
  `FighterGate`. It asks the entry resolver (no intent) and renders only on
  `fighter_home`. Anyone else goes where the resolver says, with the page as
  `returnTo`:
  - an incomplete account goes to account basics (WA5);
  - an unfinished Fighter onboarding goes back to it;
  - a user without a role goes to the role choice (WA6).

  Opening a Fighter page never starts a Fighter journey. A destination this
  client does not map is a failure screen.

- **First run or home.** `GET /api/v1/me/first-run` answers the Fighter web
  tour's status:
  - `pending` shows the first run (FRW1);
  - `completed` or `dismissed` shows the home;
  - `unavailable`, or an experience the API does not list, shows the home and
    never offers the tour.

  Completing Fighter onboarding records nothing, so a new Fighter lands on
  the first run.

- **The tour opens only when asked**, from "Take the tour" in the header or
  "Take the tour →" on the Live Board card. "Done" records `completed`;
  "End tour" and Escape record `dismissed`
  (`PUT /api/v1/me/first-run/fighter_web_tour`). A click on the dimmed page
  does nothing.
- **Nothing optimistic.** The dialog stays open until the backend has kept
  the outcome. A failed write shows the error in the dialog and records
  nothing; trying again records once. An expired session goes to sign-in.
- **Final and account-wide.** The first outcome is kept: another tab's or
  device's earlier answer wins. A tab picks it up when it regains focus or
  reloads.
  - A reload during the tour closes it unrecorded: unfinished is not an
    outcome.
  - A reload after the tour, a new sign-in or another browser shows the home.
  - Nothing is kept in the URL or in browser storage.
- **Existing Fighters at rollout:** no backfill (nothing has been deployed).
  The tour is offered, never forced.

## Content: real, static, empty, unavailable

| Element                            | Category                   | Production                                                                       |
| ---------------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| Name in the title                  | Real (FighterProfile)      | `display_name`                                                                   |
| "Day N"                            | Real (FighterProfile)      | Days since `onboarding.completed_at`, in the browser's time zone; first run only |
| Date                               | Real (the browser's clock) | Weekday and date in the locale                                                   |
| Checklist (6 steps)                | Needs domains              | 0 / 6; every step "Not available yet", no links, no ticks                        |
| "Book a class", "Your first class" | Needs bookings / gyms      | Not rendered                                                                     |
| Get the app: QR code               | Needs a published app      | Not rendered; the card says store links come with the release                    |
| Your Live Board                    | Approved empty state       | "Empty" and the first-node line                                                  |
| Pro note                           | Static product copy        | As drawn                                                                         |
| Tour copy                          | Static, rewritten          | Promises nothing the Live Board does not do yet                                  |

The checklist steps are domain facts (gym membership, the app, bookings,
training logs, privacy settings, partners). A step ticks only from its
domain's state, which web and mobile share. A click never ticks a step.

## Measurements (1440 × 900)

- **Shell.** The 240 px sidebar and a 1200 px main column. The 76 px page
  header renders 77 px with the PageHeader's hairline (SF-34). The title
  block is centred: the date label, then the 22 px title at y 33. "Take the
  tour" (40 px) is on the 32 px gutter.
- **Body:** padding 24 / 32, a `1.35fr : 1fr` grid with a 20 px gap
  (641.1 + 474.9 px).
  - The checklist card is at (272, 101): radius 22, padding 22 / 24 / 10,
    rows of 56 px.
  - The Live Board card is 16 px below it, with a 150 px dashed well.
  - The app card is at (933.1, 101), with the olive Pro note 16 px below it.
- **FRW2:**
  - The spotlight is the Live Board nav item's box plus 4 px, with a 2 px
    olive border and the page dimmed around it.
  - The 380 px card sits 22 px to its right; its top is the item's centre
    minus 37 px, and the arrow is on the item's centre.
  - The positions are measured from the real item on open, resize and
    scroll. The production sidebar has no identity card (SF-34), so the item
    is at y 168, not the artboard's 209; the anchoring keeps the drawn
    relationship.

Production matches the artboard's x positions and widths. Card heights
follow type-role line heights: the checklist is 442 (+3), the Live Board
card 256 (+8).

## Approved differences from the artboards

1. **The checklist is truthful.** It shows 0 / 6 with no done rows, no
   chevrons and no fabricated subtitles (decision).
2. **Fabricated parts are left out.** "Book a class", the "Your first class"
   card and the QR code are not rendered (decision).
3. **The tour has one step.** It is labelled "Tour", has "Done" instead of
   "Next", and its copy is rewritten (decision).
4. **The tour card uses the light theme's tokens.** The arrow tip is square
   instead of 3 px (`docs/design-reconciliation.md`, SF-40).
5. **Spacing within tolerance.** The header title gap is 2 px (drawn 3), and
   the checklist label gap is 4 px (drawn 5).
6. **The Fighter shell is unchanged.** It has no identity card and no "next
   session" card (SF-34, D-WEB-WORKSPACE-SWITCHER).
7. **Below `md`** the sidebar is a menu, so the tour card is centred over the
   dimmed page without a spotlight. Below `sm` each step's status sits under
   its text.

## Downstream

- **Home after the first run** shows the greeting, the date and the same
  truthful cards. W01's next session, week, camp, challenge and friends need
  their domains.
- **Live Board** (`/app/board`) is a placeholder. The home only introduces
  it.
- **SF-41 (mobile first run)** reads the same record. Mobile adds its own
  experience keys; the client is already regenerated.
- **Legal:** the Terms and Privacy documents (SF-48) gate public launch.

## Verification

- simplefit-api:
  - `test/simple_fit/first_run_test.exs` covers availability, final
    outcomes, errors and the database rules;
  - `first_run_concurrency_test.exs` covers concurrent outcomes;
  - `controllers/first_run_controller_test.exs` covers the API contract.
- `src/features/session-gate/ui/session-gate.test.tsx` (`FighterGate`) and
  `src/widgets/fighter-home/**/*.test.ts(x)` cover the states, the tour
  flow, failures, the kept outcome and the date helpers.
- `e2e/production/fighter-home.spec.ts` runs on the production build against
  the test double. It covers:
  - the gate, the first run, the tour, failures and the session;
  - reload, sign-in again, two tabs and history;
  - the full sign-up → Home journey;
  - geometry at 1440 × 900, the laptop matrix and 390;
  - axe and German.
- `src/stories/screens/fighter-home/fighter-home.stories.tsx` and
  `e2e/home-storybook.spec.ts` cover every state in Storybook.
