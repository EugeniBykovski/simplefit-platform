# Sponsor design reconciliation (SF-108)

Written before any structural edit. **Starting version:** `1794038955-2ed3`, unchanged since SF-107.
ADR 0027 and D-SA01–D-SA30 are **PROPOSED**. Where a change depends on one, the board says so, and
this document doesn't treat it as approved.

## Basis codes

Each action states what it rests on:

| Code  | Basis                                                                                  |
| ----- | -------------------------------------------------------------------------------------- |
| **1** | Existing approved behavior (ADRs 0009, 0016, 0017, 0018; SF-43; SF-136)                |
| **2** | SF-107 proposal, unapproved                                                            |
| **3** | Needs a founder decision                                                               |
| **4** | Backend capability that doesn't exist                                                  |
| **5** | Legal or commercial approval needed                                                    |
| **T** | Truthfulness rule of this brief: no invented figures, deadlines or commercial promises |

## Constraint: file capacity

A canvas holds 512 files, and 495 are used (494 boards and the index). Admin design work (SF-107 task D1)
needs room too. So states live **inside** boards through a `state` prop, as `WG1` and `G01` already do, and each
sheet shows them together. Stable files keep stable ids. New files are kept to a minimum.

## Two proposals are drawn side by side, not chosen

**D-SA01 (when an account is needed) is open.** Today's canvas says "No account needed to start"; SF-107
recommends signing in first. The new entry board shows both options, labelled. The form is the same in both.
Only its save line differs. The founder's choice removes one option and needs no redraw.

## Matrix

Action: KEEP, UPDATE, ADD, DEFER (marked FUTURE on the canvas), BLOCKED (marked, and can't ship yet), REFERENCE.

### Application · section 5f

| Board                        | Journey  | Route today → proposed                              | UI state                                         | Data        | Decision               | Action                                                                                                                                   | Basis   |
| ---------------------------- | -------- | --------------------------------------------------- | ------------------------------------------------ | ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| SPX1 `PartnersLanding`       | Discover | `/partners`                                         | One                                              | None        | —                      | **UPDATE:** remove 48K, 312, 5, 31%, 12,482 and the named sponsors' figures. Production already omits them (SF-43)                       | T, 1    |
| SPX2 `BecomeSponsor`         | Discover | `/partners/apply`                                   | One                                              | None        | D-SA01, D-SA22, D-SA23 | **UPDATE:** remove "5 business days", the promised manager and invoices. State what approval does and doesn't do                         | T, 2    |
| SP1–SP7 `SponsorReg1–7`      | Fill     | `web.partners.apply` → `web.app.onboarding.sponsor` | One, filled with a sample brand                  | Draft       | D-SA01, D-SA05, D-SA09 | **UPDATE:** each becomes one step of a single form source, so states aren't duplicated. No sample brand. Reach estimate removed          | T, 2, 4 |
| SP7 uploads                  | Fill     | Same                                                | Uploaded                                         | Files       | D-SA09: no scanner     | **BLOCKED** step, drawn fully and marked optional, "only when approved"                                                                  | 3, 4    |
| SP8 `SponsorRegAuth`         | Account  | Same                                                | Modal                                            | Identity    | D-SA01                 | **UPDATE:** it stays "create account to submit" as option B. Wording no longer implies a sponsor identity. Registration (ADR 0016) added | 1, 2    |
| SP9 `SponsorSubmitted`       | Submit   | → `web.sponsor.application`                         | Submitted                                        | Application | C2                     | **UPDATE:** remove the deadline and "Go to Sponsor Dashboard"                                                                            | T, 2    |
| SPX3 `SponsorLogin`          | Return   | `/sponsor/login`                                    | One                                              | Identity    | —                      | **KEEP**                                                                                                                                 | 1       |
| `RouteSponsor`               | Map      | —                                                   | —                                                | —           | Route matrix           | **UPDATE:** proposed map, labelled                                                                                                       | 2       |
| _new_ review step            | Submit   | `?step=review`                                      | All form states                                  | Draft       | G-S05                  | **ADD** inside the form source                                                                                                           | 2, 4    |
| _new_ entry and continuation | Account  | —                                                   | Signed out, ready, registration, resume, expired | Session     | D-SA01                 | **ADD**                                                                                                                                  | 1, 2    |

### First run · section 34g

| Board                      | Journey   | Route                                  | State           | Data                    | Decision       | Action                                                                          | Basis |
| -------------------------- | --------- | -------------------------------------- | --------------- | ----------------------- | -------------- | ------------------------------------------------------------------------------- | ----- |
| SRW1 `FirstRunSponsor`     | First use | Dashboard state                        | Approved        | First-run, organization | D-SA10, D-SA22 | **UPDATE:** MVP default with truthful steps; old drawing kept as `state=future` | T, 2  |
| SRW2 `FirstRunSponsorTour` | Tour      | Dashboard overlay; not `campaigns.new` | Steps 1–9, done | First-run               | C4             | **UPDATE:** MVP steps below; old nine kept as `state=future`                    | T, 2  |
| SRW2 sheet                 | Reference | —                                      | All             | —                       | —              | **UPDATE:** shows MVP steps                                                     | T     |

### Tour, step by step

| Old step                        | Points at              | Exists in MVP?           | Decision                                                                |
| ------------------------------- | ---------------------- | ------------------------ | ----------------------------------------------------------------------- |
| 1 Launch checklist              | First campaign         | No: campaigns are FUTURE | **Replace** with "Start here": organization status                      |
| 2 Overview and application      | Overview, Applications | Yes                      | **Keep** as two steps, without "active campaigns"                       |
| 3 Campaigns, challenges, events | Campaigns              | No                       | **Remove**                                                              |
| 4 Creative                      | Creative               | No                       | **Remove**                                                              |
| 5 Aggregate results             | Analytics              | No                       | **Remove**                                                              |
| 6 Flat fees, invoices           | Invoices               | No                       | **Remove**                                                              |
| 7 Team and data agreement       | Settings               | Team yes; agreement no   | **Keep** team and settings only                                         |
| 8 Where your brand appears      | Placements             | No                       | **Replace** with "What isn't here yet": says plainly what doesn't exist |
| 9 Partner manager               | Named person           | No                       | **Remove**                                                              |

### Portal · section 29

| Board                   | Journey    | Route                          | State               | Data                  | Decision       | Action                                                                                                            | Basis |
| ----------------------- | ---------- | ------------------------------ | ------------------- | --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | ----- |
| SPX4 `SponsorDashboard` | Home       | Dashboard                      | Populated, invented | Organization          | G-S16          | **UPDATE:** MVP states as default, old as `state=future`                                                          | T, 2  |
| SPX5 `SponsorApp`       | Status     | `web.sponsor.application` (C1) | `needs-info`        | Application           | D-SA02, C1     | **UPDATE:** all lifecycle states as default, old as `state=future`                                                | 2, 4  |
| SPX9 `SponsorSettings`  | Settings   | Settings                       | Populated           | Organization, members | D-SA07, D-SA12 | **UPDATE:** sections, dialogs, restricted states. Old as `state=future`                                           | 2, 4  |
| `SponsorNav`            | Nav        | Shell                          | 9 items             | Organization          | D-SPONSOR-NAV  | **UPDATE:** `mode=mvp` adds the MVP set and collapses at narrow widths. Default unchanged                         | 2     |
| SPX6, SPC1–SPC7         | Campaigns  | Deferred                       | Populated           | None                  | D-SA21         | **DEFER:** marked FUTURE                                                                                          | 4, 5  |
| SPX7                    | Analytics  | Deferred                       | Populated           | No tracking           | D-SA24         | **DEFER:** marked FUTURE, blocked on tracking                                                                     | 4, 5  |
| SPX8                    | Invoices   | Deferred                       | Populated           | None                  | D-SA23         | **DEFER:** marked FUTURE                                                                                          | 4, 5  |
| `AdRules`               | Policy     | —                              | —                   | —                     | Unapproved     | **REFERENCE**, marked draft                                                                                       | 5     |
| AV1, AV2, AV2b, MK11    | Placements | Deferred                       | Populated           | None                  | D-SA21         | **DEFER:** titles untouched, as they sit in fighter sections shared with other work. Listed FUTURE in the handoff | 4     |
| `FlowSponsor`           | Map        | —                              | —                   | —                     | —              | **UPDATE:** campaign lanes marked FUTURE                                                                          | 2     |

### New, for the gaps

| New board                | Covers                                                                               | Basis |
| ------------------------ | ------------------------------------------------------------------------------------ | ----- |
| Application states sheet | Every form state                                                                     | 2, 4  |
| Status sheet             | Every lifecycle state                                                                | 2, 4  |
| Portal sheet             | Dashboard, settings, dialogs, restricted states                                      | 2, 4  |
| System states            | Load, unavailable, denied, expired, revoked, suspended, unsupported, empty, switcher | 2, 4  |
| Invitation recipient     | G-S15                                                                                | 2, 4  |
| Sponsor emails           | G-S19, one source                                                                    | 2, 4  |
| Responsive sheet         | 375, 390, 430, 768, 1024, 1440, 1920                                                 | 2     |
| Accessibility sheet      | Component states, focus order, announcements                                         | 1     |

### Inbox

**DESIGN ONLY, no board.** No notification or inbox backend exists for sponsors, and no decision asks for one.
Applicants get their updates from the status page's history and by email. The system states board shows the
empty-inbox state, labelled FUTURE, so nothing claims a message was delivered.

### Themes

**Dark only.** The canonical product design is dark only (`design-reconciliation.md` row 14), and production's
light theme is a derived extension. No light boards are drawn: production derives them from the same tokens.

## Not changed

Cross-context boards used by shipped features (`ContextSwitcher`, `WebContextSelect`, `Workspaces`), all Admin
boards (SF-107 D1), the route registry, backend, generated clients.

## After publication

The entry states got their own sheet and responsive split into two, to stay under the canvas's 8000 px board height. Final ids and files are in the [handoff](sponsor-design-handoff.md).
