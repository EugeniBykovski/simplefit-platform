# Sponsor design handoff (SF-108)

**Design:** [SimpleFit Boxing canvas](https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY), version 117,
`1794042043-ae83`. Started from `1794038955-2ed3`.

**Status: designed, not approved, not built.** ADR 0027 and D-SA01–D-SA30 in `simplefit-api` remain PROPOSED.
No route, API, schema or production page changed. See the
[reconciliation](sponsor-design-reconciliation.md) for each board's action and basis.

## 1. Inventory

Read each board's source before implementing it (`docs/design-handoff.md`). States are `state`, `step`, `section`
and `dialog` props, visible together on the sheets.

### New boards (12)

| Id      | File                      | Page           | Covers                                                                              |
| ------- | ------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| SPA0    | `SponsorEntry`            | Onboarding     | Sign-in, registration first, ready, resume, already applied, member, expired, error |
| SPA1    | `SponsorApply`            | Onboarding     | The form, one source for SP1–SP7 and review                                         |
| Sheet   | `SponsorApplySheet`       | Onboarding     | 8 steps, 14 form states, submitted                                                  |
| Sheet   | `SponsorEntrySheet`       | Onboarding     | Options A and B                                                                     |
| Sheet   | `SponsorStatusSheet`      | Sponsor Portal | Every SPX5 state                                                                    |
| Sheet   | `SponsorPortalSheet`      | Sponsor Portal | Overview, first run, settings, dialogs, restricted, invitation                      |
| Sheet   | `SponsorResponsive`       | Sponsor Portal | Application at 7 widths                                                             |
| Sheet   | `SponsorResponsivePortal` | Sponsor Portal | Portal at 7 widths; docked tour at 4                                                |
| SPE1    | `SponsorSystemStates`     | Sponsor Portal | 17 system states, organization switcher, mobile handoff row                         |
| SPI1    | `SponsorInvite`           | Sponsor Portal | Invitation recipient                                                                |
| E17–E21 | `EmailSponsor`            | Sponsor Portal | Received, changes requested, approved, not approved, invitation                     |
| SPA2    | `SponsorA11y`             | Sponsor Portal | Component states, focus order, announcements                                        |

### Updated (20)

SPX1, SPX2, SP1–SP7, SP8, SP9, SPX4, SPX5, SPX9, SRW1, SRW2, the SRW2 sheet, `SponsorNav`, `RouteSponsor`,
`FlowSponsor`.

SPX4, SPX5, SPX9, SRW1 and SRW2 keep the old drawing at `state=future`. `SponsorNav` keeps it at its default
mode, so FUTURE boards still render as drawn. **SP1–SP8, SP9, SPX1, SPX2 and `RouteSponsor` were replaced;** their old
versions remain in the artifact's version history.

### Other

| Group                      | Boards                                                                                                        | Treatment         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------- |
| Marked FUTURE in the title | SPX6, SPX7, SPX8, SPC1–SPC7                                                                                   | Content untouched |
| Marked draft               | `AdRules`                                                                                                     | Content untouched |
| Unchanged                  | SPX3; AV1, AV2, AV2b, MK11 (FUTURE here, fighter sections left alone); all Admin boards; cross-context boards | —                 |

**Capacity: 507 of 512 files.** Five remain, and Admin design (SF-107 D1) needs room. D-SA30 is now pressing.

## 2. Application states

| Requirement                                | Where                                            |
| ------------------------------------------ | ------------------------------------------------ |
| Empty, partial                             | `state=empty`, `partial`                         |
| Validation                                 | `invalid`: summary with links, message per field |
| Saving, saved, save failure                | `saving`, `saved`, `save_failed`                 |
| Session expired                            | `session_expired`, dialog                        |
| Resume after sign-in                       | `resume`; SPA0 `resume`                          |
| Submission pending, failure                | `submitting`, `submit_failed`                    |
| Changed elsewhere                          | `stale`                                          |
| Duplicate                                  | `duplicate`: says nothing new was sent           |
| Submitted                                  | SP9                                              |
| Correcting requested answers, resubmitting | `changes`, `resubmit`                            |

### Lifecycle, all PROPOSED (D-SA02)

| API state, proposed | SPX5 `state`                           | Applicant can              |
| ------------------- | -------------------------------------- | -------------------------- |
| None                | `none`                                 | Start                      |
| `draft`             | `draft`, or the form                   | Continue, discard          |
| `submitted`         | `submitted`                            | Read, withdraw             |
| `under_review`      | `under_review`                         | Read, withdraw             |
| `changes_requested` | `changes_requested`                    | Update, resubmit, withdraw |
| `approved`          | `approved`                             | Open workspace             |
| `rejected`          | `rejected` (shown as "Not approved")   | Read reason, start again   |
| `withdrawn`         | `withdrawn`                            | Start again                |
| —                   | `withdraw_confirm`, `loading`, `error` | —                          |

Dates are placeholders for real timestamps. No board shows a review deadline.

## 3. Portal screens

| Question                          | Answer on SPX4                             |
| --------------------------------- | ------------------------------------------ |
| Organization's status?            | Organization card with a word and an icon  |
| Application reviewed?             | Application card, links to SPX5            |
| Anything required of me?          | Needs you; empty says so                   |
| What can I do?                    | Invite, edit; read-only for members        |
| Settings?                         | Nav                                        |
| Opportunities and later features? | "Not available yet": says they don't exist |

**No metric anywhere.** No reach, views, engagement, leads, campaigns, revenue or opportunities. Bracketed text stands for
real data; no sample brand remains on MVP surfaces.

**Settings separates:** organization, contact, members, application, notifications, privacy (workspace), from
"Your account", which links to global account settings. No plan, billing, Stripe or campaign setting exists.

**Boundaries drawn:** a draft has no workspace. SPX5 has no portal nav, as an applicant isn't a member. Approval's wording
says it isn't a contract. An operator is never shown as a member. A work email is labelled as not changing sign-in.

## 4. First run

Six steps replace nine: Start here, Overview, Application, Organization, Members, What isn't here yet, then complete.
The reconciliation lists each old step's fate.

| Behavior       | Rule                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| Targets        | The five nav items and two cards. Positions measured on the rendered board at 1440 |
| End tour       | Records `dismissed`                                                                |
| Finish         | Records `completed` (ADR 0018)                                                     |
| Resume         | Refresh restarts at step 1 until an outcome exists                                 |
| Missing target | Step skipped, for example Members for someone who can't manage them                |
| Below 1024     | Card docks at the bottom, no ring                                                  |

## 5. Responsive

375, 390, 430, 768, 1024, 1440, 1920. Layout is real, using container queries in the boards. Production uses the repo's
breakpoints.

| Width     | Behavior                                                                  |
| --------- | ------------------------------------------------------------------------- |
| ≥ 1280    | Application: rail, form, summary                                          |
| 1024–1279 | Summary hidden                                                            |
| < 1024    | Nav becomes a scrolling row. Step rail becomes a progress bar. One column |
| < 640     | Actions and fields stack                                                  |
| All       | No sticky bars. Dialogs fit and scroll inside. No native screens          |

SPX1, SPX2 and SPX3 are still fixed 1440 boards. `/partners` and `/partners/apply` already ship responsive from SF-43.

## 6. Proposed routes

**Not in the registry, and it shouldn't change until approved.** Exact mapping in `simplefit-api`
`docs/architecture/sponsor-admin-route-matrix.md`.

| Board            | Registry today                                  | Proposed                                              |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------- |
| SPX2             | `web.partners.apply`                            | Same, SPX2 only                                       |
| SP1–SP7, review  | `web.partners.apply`                            | `web.app.onboarding.sponsor` `?step=`                 |
| SP9, SPX5        | `web.partners.apply`, `web.sponsor.application` | `web.sponsor.application`, **no `SPONSOR_WORKSPACE`** |
| SPX4, SRW1, SRW2 | `web.sponsor.dashboard`, `.campaigns.new`       | `web.sponsor._sponsor-id.dashboard`                   |
| SPX9             | `web.sponsor.settings`                          | `web.sponsor._sponsor-id.settings`                    |
| SPI1             | None                                            | `web.invite.sponsor`                                  |
| SPE1             | —                                               | States of each route; 404 through `web.not-found`     |

Interaction flow, including what's not linked: `RouteSponsor`. **Registration intent ≠ Sponsor capability.**

The Route Gallery board (`GalleryIndex4`) still lists registry paths, on purpose: it mirrors the registry and should
change with it.

## 7. Accessibility

`SponsorA11y` covers focus, invalid, disabled, loading and selected states, focus order, dialogs, announcements and reduced
motion. Status always has a word and an icon. The audit found 44 px targets or better on every button, field and select. The declaration checkbox is 22 px within a larger label.

**Decision needed: field border.** The canonical border `#3A403B` on `#111312` measures **1.76:1**, below the 3:1 that
WCAG 1.4.11 asks of input boundaries. The new boards use `#7A8177` (4.65:1) on fields and choices. Production tokens
weren't changed. The token owner should decide, as this affects every form in the product.

Skip links are specified but not drawn. Assistive-technology testing belongs to implementation.

## 8. Unapproved assumptions

| Depends on     | What the design assumes                                    | If it changes                         |
| -------------- | ---------------------------------------------------------- | ------------------------------------- |
| D-SA01         | Both options drawn                                         | Remove one                            |
| D-SA02         | Seven states                                               | Rename, adjust SPX5                   |
| D-SA03         | Rejected applicants can start again                        | Add a cooldown state                  |
| D-SA05         | SP5's bands, no currency switch, an estimate               | Change SP5                            |
| D-SA07, D-SA12 | Owner, manager, member; invitations; several organizations | Remove or adjust SPX9, SPI1, switcher |
| D-SA08         | Legal name change needs review                             | Change one line                       |
| D-SA09         | Uploads drawn, blocked                                     | Hide or enable SP7                    |
| D-SA10         | Approval creates a workspace, no commercial right          | Revisit SPX5, E19                     |
| D-SA22         | Nobody named, no times                                     | Could add a contact                   |
| D-SA26         | Id in the workspace path                                   | Route mapping only                    |
| D-SA27         | Handoff row on mobile                                      | Remove row                            |
| Counsel        | Declaration, privacy notice, reason wording, email footers | Copy                                  |

## 9. Remaining gaps

| Gap                               | Note                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Admin boards (G-A01–G-A23)        | SF-107 D1, separate ticket                                                                       |
| Data agreement (G-S12)            | FUTURE, counsel                                                                                  |
| Phone variants of SPX1–SPX3       | Those pages ship responsive in production; not redrawn                                           |
| Hosted editor check               | QA used the same runtime locally. Worth a look in the editor                                     |
| `FlowSponsor`                     | Relabelled only; its lanes B remain drawn                                                        |
| WA2, WCX1, `ContextSwitcher`, A04 | Sponsor rows shown on SPE1 as proposals; those boards are unchanged, as they're shipped features |
| E17–E21                           | English only; other locales in implementation                                                    |

## 10. Implementation readiness

**Design: ready.** **Build: blocked** until the first decisions in the SF-107 register are made, `SimpleFit.Sponsors` exists
(roadmap S1, S2) and SF-110 provides an operator to approve anything. Applications stay closed until the release gate in
that roadmap.

Translate through tokens, primitives, Lucide and i18n. Don't copy markup or hex values from boards (CLAUDE.md rule 19).

## 11. QA evidence

Rendered with the canvas's own runtime (`dc-runtime.js`) in Chromium, 2026-11-07:

| Check                                                                          | Result                                                                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Horizontal overflow, all frames at 7 widths                                    | None                                                                                     |
| Unresolved template holes, runtime errors                                      | None                                                                                     |
| Buttons, fields under 44 px                                                    | None                                                                                     |
| Unlabelled fields, per board                                                   | None. Sheets repeat ids across frames, so their raw count isn't meaningful               |
| Click-through: tour with Back and End, 8 form steps, rail, 7 settings sections | Pass                                                                                     |
| Dead links and imports on Sponsor boards                                       | None                                                                                     |
| FUTURE references and boards that import changed files                         | Render                                                                                   |
| Publication read-back                                                          | Published files match local hashes; an unrelated Admin board is byte-identical to before |

A read-back caught a broken Next handler on the tour, fixed in version 117; the click-through was added because of it.
