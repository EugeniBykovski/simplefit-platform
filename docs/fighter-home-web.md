# Fighter web home · first run (SF-40)

The production Fighter home (`/app/home`, `web.app.home`) and its first run
against Claude Design section **34b · Onboarding · web first run** (version
`1791543685-48be`; the nine-step tour since that version, after a one-step
tour on `1791484446-8cb2`). It builds on the SF-45 entry resolver and the first-run
record of simplefit-api ADR 0018.

## Inventory

| Artifact            | Design source                                                                                              | Production                                             | Domain dependency                        | Status                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------------------- |
| FRW1 · first run    | `FirstRunWebF.dc.html` (1440 × 900)                                                                        | `FighterHome` (widget), first-run state                | FighterProfile; first-run record         | current                               |
| FRW2 · tour         | `FirstRunWebFTour.dc.html` (1440 × 900; steps 1–9, complete), `FirstRunWebFTourSteps.dc.html` (all states) | `HomeTour` on `model/tour` (nine steps, then complete) | first-run record (`fighter_web_tour`)    | current                               |
| Home after it (W01) | `WebHome.dc.html` (1440 × 900)                                                                             | `FighterHome`, home state                              | sessions, camp, challenges, social       | greeting only; the rest needs domains |
| Fighter shell       | `FighterWebNav.dc.html` (240 × 900)                                                                        | `WorkspaceShell` (SF-31 / SF-34)                       | workspaces (identity card, next session) | current, as SF-34                     |
| Flow                | `FlowFirstRun.dc.html`                                                                                     | this document                                          |                                          | reference                             |

Section 34b holds FRW1 and FRW2. FRW2 is one interactive artboard with ten
states: steps 1–9 and "complete". (An intermediate version, `1791542796-ed68`,
drew them as FRW2–FRW11; the latest version folds them back into FRW2 with
the same copy, order and placement rules.)

### The nine steps

| Step | Title                      | Production target (anchor)                                                           | Spotlight        |
| ---- | -------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| 1    | Start here                 | The checklist card (`data-tour-target=checklist`)                                    | +6 / +7 px, r 28 |
| 2    | Your Live Board            | Live Board nav item (`data-nav-item=board`)                                          | +4 px, r 14      |
| 3    | Fight camp, week by week   | Fight camp nav item (`training`)                                                     | +4 px, r 14      |
| 4    | See your progress          | Progress nav item (`progress`)                                                       | +4 px, r 14      |
| 5    | Your people                | Community, Discover and My profile (`community`, `discover`, `profile`): their union | +4 px, r 14      |
| 6    | Coaches, gyms and programs | Marketplace nav item (`market`)                                                      | +4 px, r 14      |
| 7    | Your week and your chats   | Calendar and Messages (`calendar`, `messages`): their union                          | +4 px, r 14      |
| 8    | You decide who sees what   | Privacy & settings nav item (`settings`)                                             | +4 px, r 14      |
| 9    | One account, every role    | The shell identity block (`data-tour-target=workspace`), where the switcher will sit | +4 px, r 18      |
| Done | You know your way around   | "Take the tour" (`data-tour-target=tour-button`)                                     | +4 px, r 16      |

The steps, targets and placement are one typed definition
(`src/widgets/fighter-home/model/tour.ts`); `HomeTour` renders the current
one.

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

- **The tour opens only when asked**, at step 1, from "Take the tour" in the
  header or "Take the tour →" on the Live Board card.
  - Next, Back and the arrow keys move between steps and record nothing.
  - "End tour" or Escape on any step records `dismissed`.
  - "Finish" on step 9 records `completed` and then shows the completion
    card; "Back to my checklist" closes it.
  - Writes go to `PUT /api/v1/me/first-run/fighter_web_tour`.
  - A click on the dimmed page does nothing.
- **Replay.** After the first run, "Take the tour" stays in the header
  (FRW2 complete: "Replay the tour any time"). A replay starts at step 1 and
  records nothing; the kept outcome never changes. The Live Board card's
  link is first-run only.
- **Nothing optimistic.** The dialog stays open until the backend has kept
  the outcome. A failed write shows the error in the dialog and records
  nothing; trying again records once. An expired session goes to sign-in.
- **Final and account-wide.** The first outcome is kept: another tab's or
  device's earlier answer wins. A tab picks it up when it regains focus or
  reloads.
  - A reload during the tour closes it unrecorded: unfinished is not an
    outcome. It is offered again from step 1.
  - A reload after the tour, a new sign-in or another browser shows the home.
  - Nothing is kept in the URL or in browser storage.
- **Existing Fighters at rollout:** no backfill (nothing has been deployed).
  The tour is offered, never forced.
- **Fighters who finished the one-step tour:** their kept outcome stands; the
  nine-step tour is not offered again automatically, only as a replay. No new
  experience key or version was added.

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
| Tour copy                          | Static, rewritten          | Says what each section is for, never that an unbuilt feature works (below)       |

The checklist steps are domain facts (gym membership, the app, bookings,
training logs, privacy settings, partners). A step ticks only from its
domain's state, which web and mobile share. A click never ticks a step.

### Tour copy against the canonical text

The titles, order and targets are the artboard's. Descriptions are rewritten
where the canonical copy describes a feature that does not exist yet (SF-40
decision). These need design reconciliation:

| Step | Canonical                                                                                          | Production                                                                              | Why                           |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | "…once you train. Two of six steps are already done."                                              | Ends at "…once you train."                                                              | The checklist is 0 / 6        |
| 2    | "Your Live Board, on a big screen": drag through weeks, filter by gym or partner, open any session | "Your Live Board": sessions will build one board; it starts empty                       | `/app/board` is a placeholder |
| 3    | Set a fight date and plan the camp in phases…                                                      | Camps will be planned here…; planning isn't open yet                                    | No camp domain                |
| 4    | Rounds per week… by month, by camp or for the whole year                                           | Will show here once you log training                                                    | No training log               |
| 5    | Community shows… Discover finds…                                                                   | Community will show… Discover will find…                                                | Placeholders                  |
| 6    | Book personal training, buy a membership… Checkout runs through a secure payment provider          | Will be offered here…; nothing is on sale yet                                           | No commerce domain            |
| 7    | Calendar layers… Messages is where…                                                                | Calendar will layer… Messages will be where…                                            | Placeholders                  |
| 8    | …connected apps all live here                                                                      | …will be managed here (weight and coach notes private by default kept)                  | Settings are a placeholder    |
| 9    | "…switch here — no second sign-in…"                                                                | Your personal fighter space on one account; joining a team never needs a second sign-in | No workspace switcher         |
| Done | "Next on your checklist: get the app on your phone." and a "Book a class" link                     | "Your setup steps open as their features arrive."; no "Book a class"                    | No published app; no bookings |

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
- **FRW2, steps 1–9:**
  - The spotlight is the target's box (or the union of several nav items)
    plus the step's padding, with a 2 px olive border and the page dimmed
    around it.
  - The 380 px card sits 22 px to its right; its top is the target's centre
    minus 52 px, kept 16 px inside the window, and the arrow is on the
    target's centre.
  - The card header shows "Tour · N of 9" and nine 14 × 4 dashes, the first
    N olive. The actions are End tour, then Back (from step 2) and Next, or
    Finish on step 9; the buttons are 42 px.
- **FRW2, complete:** the card sits 20 px below the "Take the tour" button,
  centred on it and kept 16 px inside the window. It shows "Tour complete",
  the 22 px check and "Back to my checklist".
- Positions are measured from the real elements on open, resize and scroll;
  a step scrolls its target into view. The production sidebar has no
  identity card (SF-34), so the nav items sit higher than drawn (Live Board
  at y 168, not 211); the anchoring keeps every drawn relationship.

Production matches the artboard's x positions and widths. Card heights
follow type-role line heights: the checklist is 442 (+3), the Live Board
card 256 (+8).

## Approved differences from the artboards

1. **The checklist is truthful.** It shows 0 / 6 with no done rows, no
   chevrons and no fabricated subtitles (decision).
2. **Fabricated parts are left out.** "Book a class", the "Your first class"
   card and the QR code are not rendered (decision).
3. **The tour copy is truthful.** Descriptions are rewritten where they
   describe unbuilt features (table above), and the completion card has no
   "Book a class" link (decision).
4. **Step 9 spotlights the shell identity block.** The workspace switcher
   card it draws is not built (decision).
5. **The tour card uses the light theme's tokens.** The arrow tip is square
   instead of 3 px (`docs/design-reconciliation.md`, SF-40).
6. **Spacing within tolerance.** The header title gap is 2 px (drawn 3), the
   checklist label gap is 4 px (drawn 5), and the progress dashes are 4 px
   apart (drawn 3).
7. **The Fighter shell is unchanged.** It has no identity card and no "next
   session" card (SF-34, D-WEB-WORKSPACE-SWITCHER).
8. **Below `md`** the sidebar is a menu, so the tour card is centred over the
   dimmed page without a spotlight; so is any step whose target is hidden or
   leaves no room for the card. Below `sm` each step's status sits under
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
  `src/widgets/fighter-home/**/*.test.ts(x)` cover the states, the nine-step
  order, Back / Next / arrow keys, End tour and Finish, replay, failures, the
  kept outcome, the placement maths and the date helpers.
- `e2e/production/fighter-home.spec.ts` runs on the production build against
  the test double. It covers:
  - the gate, the first run, every tour step in order on its real target,
    Back, End tour, Finish and the completion card, replay, failures and the
    session;
  - reload, sign-in again, two tabs and history;
  - the full sign-up → Home journey;
  - geometry of every step at 1440 × 900, resize, every step on the laptop
    matrix and at 390;
  - axe on steps 1, 9 and complete, and German.
- `e2e/portability/first-run-tour.spec.ts`: the coach mark's placement and
  Escape in Chromium, Firefox and WebKit.
- `src/stories/screens/fighter-home/fighter-home.stories.tsx` and
  `e2e/home-storybook.spec.ts` cover every state in Storybook.
