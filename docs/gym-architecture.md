# Gym domain architecture (SF-82) — web client implications

**Status: accepted (final SF-82 approval, 2026-10-23); SF-83 not started.** Commercial items (D-G09–D-G11) are deferred product decisions; D-G17, D-G19 and D-G25 are open. The source of truth is the API
repository:

- `simplefit-api/docs/architecture/adr/0026-gym-domain-architecture.md`
- `simplefit-api/docs/architecture/proposals/SF-82-gym/`

SF-82 changes no code, no route registry entry and no design in this
repository. The Gym routes (`/app/gym/**` console, `/app/onboarding/gym` owner setup) stay SF-32/SF-33 feature placeholders until
their tickets (SF-83 onwards) are approved.

## What the web client will have to follow

1. **The backend authorizes everything.** Hiding a navigation item is only
   presentation. Every gym action is checked by the API against the user's
   staff role at that gym.
2. **ID-based gym navigation** (`D-G23`, approved). Gym routes carry the
   gym id: `/app/gyms/:gymId/…` (console) and `/app/me/gyms/:gymId/…` (member view). The page passes the id unchanged to
   `/api/v1/gyms/{gym_id}/…` (`D-G15`). The id is only a lookup key, and
   the backend authorizes every request. `/app/gyms` lands on the only gym or
   lists several, preselecting the last choice the server remembers. These
   registry changes are made in SF-85 and SF-91; today's id-free
   placeholders stay until then.
3. **404 vs 403** (`D-G24`, approved). A 404 from a gym endpoint means "not
   available to you", so render not found and never hint that the gym
   exists. A 403 `forbidden` means the user is staff but their role lacks
   the permission: show the role-restriction state (an exception to
   route-architecture rule 9) and do not retry.
4. **Members do not need a FighterProfile** (`D-G07`, approved).
   Member-facing gym routes move from `FIGHTER` to account level under
   `/me/gyms/:gymId` in a registry change (SF-91).
5. **No fabricated data.** Plans, prices, trials, payments, balances,
   revenue, leads and payouts are blocked or future. Their screens stay
   placeholders and their dashboard tiles stay hidden (never shown as zero).
6. **Staff invitations** are a separate domain from Coach–Fighter
   invitations (`D-G16`, approved). The web reads `/invite/staff#token=`;
   member invitations use `/invite/gym#token=`;
   the mobile app never receives a token and shows an invitation inbox
   matched by verified email (`D-G22`, approved). The
   `/invite/coach` link and its SF-80 handling are unchanged.
7. **No gym screen shows members' training data**: no RPE, weight, notes,
   videos or messages. A gym coach sees roster and attendance only.

The per-screen design inventory (116 boards, classification, required states
and truthfulness) is `proposals/SF-82-gym/06-claude-design-inventory.md` in
the API repository.

## SF-83: generated API client (no screens yet)

The generated client now includes the Gym tenant operations from
simplefit-api (ADR 0026, SF-83 amendment):

- `createGym` (`POST /api/v1/gyms`): creates a draft gym with the viewer as
  owner. It is idempotent per `client_request_id`. While the viewer has an
  open draft, it returns that draft with `200`. It answers `429` with
  `retry-after` once the window is spent.
- `listMyGyms` (`GET /api/v1/me/gyms`): the viewer's active staff
  memberships, paginated.
- `getGym` (`GET /api/v1/gyms/{gym_id}`): one gym for its staff, with the
  viewer's `role` and a read-only `permissions` list for display. A `404`
  means the gym is not available to the viewer.

No route, screen or registry entry changes in SF-83. The owner setup flow and
entry projection (`GYM_WORKSPACE`) come with SF-84/SF-85.
