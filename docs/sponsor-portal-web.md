# Sponsor entry and the partner portal on the web (SF-117)

**Routes:** the `web.sponsor` shell is id-based since SF-117: `/sponsor/:sponsorId/**` (D-SA26, approved
2026-11-10; simplefit-api `docs/architecture/sponsor-admin-decision-register.md`). Route ids are frozen, so
`web.sponsor.dashboard` is now `/sponsor/:sponsorId/dashboard`. The other `web.sponsor.*` placeholders moved
with the shell and stay placeholders. `web.sponsor.login` renders the one SimpleFit sign-in (WA1).

**Design:** Claude Design canvas `1794299393-d9d6`:

| Board                      | Artboard                      | Where                                          |
| -------------------------- | ----------------------------- | ---------------------------------------------- |
| SPX4 Sponsor overview MVP  | `SponsorDashboard` (mode MVP) | `web.sponsor.dashboard`                        |
| Portal nav                 | `SponsorNav` (mode=mvp)       | `web.sponsor` shell                            |
| SPE1 system states         | `SponsorSystemStates`         | not available (404), suspended, loading, error |
| SPE1 organization switcher | `SponsorSystemStates`         | `ContextSwitcher` sponsor section              |
| WCX1                       | `WebContextSelect`            | sponsor rows in `web.app.context`              |
| Route map                  | `RouteSponsor`                | registry                                       |

## How it decides

- **One resolver.** `GET /api/v1/me/entry` (SF-45) decides. `sponsor_home` maps to the portal of the answer's
  `sponsor_id`; without one it is a controlled failure. `context_selection` lists the answer's
  `sponsor_workspaces` beside profiles and gyms. Applications (draft, submitted, changes requested, approved,
  rejected) map to `/partners/apply` (SF-115), never to a portal.
- **The gate** (`SponsorGate`) needs `SPONSOR_WORKSPACE`; anyone else goes where the entry says, with the page as
  a `returnTo` that is used only once the capability exists.
- **The portal** (`SponsorWorkspace`) reads `GET /api/v1/sponsor-organizations/{sponsor_id}` for the id in the
  path, re-read on focus. 404 (unknown, foreign, malformed, closed, revoked) is one not-available state and
  re-resolves the entry; a suspended organization renders read-only with the notice. Switching changes the path:
  a new key, a skeleton, never the previous organization's data.
- **Switching** records the choice (`PUT /api/v1/me/entry/context`, `context: sponsor`) and opens the portal. The
  remembered choice is the backend's preference, re-validated on every read. Nothing is kept in browser storage.
- **Account changes** clear the query cache at the session boundary; a late answer of the previous session is
  discarded (`SessionChangedError`).
- **Revocation** stops access on the next request (backend). What the browser already received is dropped from
  the screen on the next denial; it can't be recalled from a device.

## Design QA and deviations

- SPX4: built as the MVP's organization card, the approved application card (only the viewer's own application
  that created this organization) and "Not available yet". Not built: "Needs you" and "What you can do" (no
  domain or actions exist), the reason line of the suspended notice (members get no reason), "Approved on
  [date]" (the applicant API has no decision date), SRW1 and SRW2.
- SponsorNav MVP: Overview linked; Application and Settings shown and marked Soon; Organization and Members not
  shown (no pages). Campaigns, challenges, events, invoices, creative and analytics hidden.
- SPE1 switcher: only active memberships of active organizations are listed (entry's projection), so a suspended
  organization isn't a choice, though its portal stays readable by link.
- Revoked membership: the backend answers 404, the same as for a foreign organization, so the page shows the
  not-available state, not SPE1's separate "no longer a member".
- SPX3 (sponsor sign-in) is not built: `/sponsor/login` is WA1.
- Organization tile: the building mark with the amber border (`border-warning`), as SponsorNav.

## SF-118: the partner portal shell, company profile and truthful overview

**Routes** (ids frozen): `web.sponsor.dashboard` (SPX4), `web.sponsor.settings` (SPX9, `?section=organization |
contact | members | application | account`; the sidebar's Organization and Members open theirs),
`web.sponsor.application`, and SPE1's "isn't part of SimpleFit yet" on `web.sponsor.campaigns`, `.campaigns.new`,
`.campaigns._campaign-id`, `.analytics._campaign-id` and `.invoices`. Sidebar: Overview, Application, Organization,
Members, Settings (SponsorNav mode=mvp).

**Data** (generated client, `entities/sponsor-organization`), all read-only:

| Read                                                                  | Operation                 | Who                                                                                      |
| --------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Organization: legal and brand name, website, country, status, created | `getSponsorOrganization`  | every member                                                                             |
| Viewer's role and permissions                                         | same                      | every member                                                                             |
| Members: short name, role, status, joined, "you" (paged)              | `listSponsorMembers`      | every member                                                                             |
| Business contacts: kind, name, position, email, phone                 | `listSponsorContacts`     | owner, manager (`view_contacts`); never requested otherwise; 403 is the restricted state |
| The application that created the organization                         | `getMySponsorApplication` | its applicant only                                                                       |

No write exists for the organization, contacts or memberships (D-SA08, D-SA12 undecided), so no edit, invite, role,
transfer or leave control is drawn and nothing claims to save.

### Design discrepancy register (canvas `1794299393-d9d6`)

| #   | Artboard           | Expected                                                                        | Implemented                                                                 | Reason                                                                     | Class                             | Impact                       | Follow-up                       | Status   |
| --- | ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ---------------------------- | ------------------------------- | -------- |
| 1   | SPX9 organization  | Editable legal name, brand, website, country, industry, logo, description; Save | Read-only legal name, brand, website, country, status, "in SimpleFit since" | No write operation; industry, logo, description aren't organization fields | Missing backend contract          | Owners can't correct details | API: brand/legal edit (D-SA08)  | Open     |
| 2   | SPX9 contact       | Editable business contact; Save                                                 | Read-only, owner/manager only                                               | No contact write                                                           | Missing backend contract          | —                            | API contact edit                | Open     |
| 3   | SPX9 members       | Invite, change role, remove, transfer, invitations list                         | Read-only list, "you", paging                                               | Invitations and membership writes not built (D-SA12, D-SA07)               | Missing backend contract          | —                            | Members/invitations ticket (S9) | Open     |
| 4   | SPX9 notifications | Application and membership email rows                                           | Not built                                                                   | Sending is off in production; membership emails don't exist                | Unapproved business claim         | —                            | Copy once email exists          | Open     |
| 5   | SPX9 privacy       | "Public profile: None", "Athlete data: never shared"                            | Not built                                                                   | Policy statements not approved (D-SA19, D-SA24)                            | Unapproved business claim         | —                            | Counsel / D-SA19                | Open     |
| 6   | SPX9 your account  | "Open account settings", "Leave this organization"                              | Explanation; account settings shown as Soon, unlinked; no leave             | WS1 isn't built; no leave operation                                        | Missing backend contract          | —                            | WS1; leave policy               | Open     |
| 7   | SPX9 sections      | Section buttons inside the page                                                 | Links with `?section=` and `aria-current`                                   | Shareable, back-button safe, keyboard native                               | Accessibility correction          | None                         | —                               | Accepted |
| 8   | SPX4               | "Needs you", "What you can do", "Approved on [date]"                            | "Your access" (real permissions); FUTURE list; application link             | No tasks domain; applicant API has no decision date                        | Missing backend contract          | —                            | —                               | Accepted |
| 9   | SPX4 not available | Prose card                                                                      | Listed FUTURE modules with a "Future" badge, not links or buttons           | Spec: explicit FUTURE modules                                              | Accepted design-system adaptation | None                         | —                               | Accepted |
| 10  | SponsorNav mvp     | Nav becomes a scrolling row below 1024                                          | Shell's sheet menu below 768 (all sidebar shells)                           | One shell for every workspace (SF-34)                                      | Responsive adaptation             | Layout differs 768–1023      | Shell-wide decision             | Accepted |
| 11  | SPE1 unsupported   | Shown for campaigns, analytics, invoices                                        | Same, on the five registry routes                                           | —                                                                          | —                                 | —                            | —                               | Matches  |
| 12  | SPE1 revoked       | "You're no longer a member"                                                     | 404 not-available state                                                     | The API answers 404 for revoked and foreign alike                          | Missing backend contract          | —                            | Distinct API signal             | Open     |
| 13  | SRW1, SRW2         | First run and tour                                                              | Not built                                                                   | No first-run domain for sponsors                                           | Missing backend contract          | —                            | First-run ticket                | Open     |

Geometry checked at 1440 in `e2e/sponsor-portal-storybook.spec.ts`: 240 px sidebar, two overview columns, a settings
column ≤ 800 px, five nav links; no pixel-parity claim beyond these measurements.

## SF-119: first run (SRW1) and guided tour (SRW2)

**Design:** `FirstRunSponsor` (SRW1, MVP) and `FirstRunSponsorTour` (SRW2, MVP, steps 1–6, done, docked), canvas
`1794299393-d9d6`. The design's FUTURE variants (nine steps, campaign creation, partner manager, ad rules, replay)
are not built.

**Persistence:** `GET /api/v1/sponsor-organizations/{sponsor_id}/first-run` and `POST …/start | complete | dismiss`
(simplefit-api ADR 0030, SF-119 amendment), per organization and member, the same on every device. Only explicit
actions are sent: Take the tour (start), Finish (complete), Dismiss or a confirmed End tour (dismiss). Steps are
client-only; a resumed tour starts at step 1. Nothing is kept in browser storage. A failed save is said, never
claimed; a 409 shows the outcome another tab kept; a 404 (revoked meanwhile) closes the tour and the portal
re-reads the organization.

**Where:** SRW1 is a panel at the top of the overview (`[data-tour-target=sponsor-welcome]`), shown only once the
backend answered `not_started` or `in_progress`, never while suspended (`unavailable`). SRW2 is one modal dialog;
its targets are the welcome, the sidebar's Overview, Application, Organization and Members (`[data-nav-item]`) and
the FUTURE card (`[data-tour-target=sponsor-future]`). Below 1024 px, or when a target isn't visible, the card docks
to the bottom. The overview is keyed by organization id: switching closes the tour and reads the other
organization's own state.

### Design discrepancy register, SF-119

| #   | Artboard       | Expected                                                                                  | Implemented                                                                | Reason                                                                                                   | Class                     | Status   |
| --- | -------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- | -------- |
| 14  | SRW1 list      | "Invite a teammate, if you'd like"                                                        | "See who belongs to your organization" (Members)                           | No invitation domain (D-SA12)                                                                            | Missing backend contract  | Open     |
| 15  | SRW1 header    | "PARTNER PORTAL · APPROVED", APPROVED badge                                               | Eyebrow "Welcome"                                                          | An organization isn't necessarily from an approval (fixtures); approval is shown by the application card | Unapproved business claim | Accepted |
| 16  | SRW1 below     | SPX4 cards incl. "Needs you", "What you can do"                                           | SF-118's real overview below the welcome                                   | As SF-118 #8                                                                                             | Missing backend contract  | Accepted |
| 17  | SRW2 step 2    | "…your application and anything that needs you"                                           | "…status and what your access lets you do"                                 | No tasks domain                                                                                          | Missing backend contract  | Accepted |
| 18  | SRW2 step 4    | "Owners and managers can edit them"                                                       | "…read-only for now"; names the business contact only with `view_contacts` | No organization write (D-SA08)                                                                           | Missing backend contract  | Open     |
| 19  | SRW2 step 5    | "Invite teammates and set their roles. If you can't manage members, this step is skipped" | Shown to every member: "Who belongs … Inviting people isn't available yet" | Every role may read members; no invitations                                                              | Missing backend contract  | Open     |
| 20  | SRW2 End tour  | Ends straight to the done card                                                            | A confirmation in the card, then dismissed (no done card)                  | The outcome is final; an accidental Escape mustn't end it                                                | Accessibility correction  | Accepted |
| 21  | SRW2 docked    | No Back button                                                                            | Back kept                                                                  | Keyboard and touch users can go back                                                                     | Accessibility correction  | Accepted |
| 22  | SRW2 placement | Card positions per step drawn at 1440                                                     | Computed beside the real target (shared geometry), docked below 1024       | Real targets move with content                                                                           | Responsive adaptation     | Accepted |
| 23  | SRW1/SRW2      | No restricted, suspended, error states drawn                                              | Suspended: no welcome; read failure: a notice with retry, overview usable  | Not drawn                                                                                                | Missing design asset      | Accepted |
