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
