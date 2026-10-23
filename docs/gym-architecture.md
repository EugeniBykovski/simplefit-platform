# Gym domain architecture (SF-82) — web client implications

**Status: PROPOSED — awaiting approval.** The source of truth is the API
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
2. **Active gym is client-held** (`D-G15`, proposed). Every gym API path
   carries the gym id (`/api/v1/gyms/{gym_id}/…`). UI paths stay id-free.
   The client remembers the active gym and tells the server the last
   explicit choice. A 404 from a gym endpoint means "workspace no longer
   available": drop the active gym, refetch `/me/entry` and show the chooser.
3. **403 `forbidden`** means the user is staff but their role lacks the
   permission. Explain the restriction; do not retry.
4. **Members do not need a FighterProfile** (`D-G07`, proposed).
   Member-facing gym routes will move from `FIGHTER` to account level in a
   registry change (SF-91).
5. **No fabricated data.** Plans, prices, trials, payments, balances,
   revenue, leads and payouts are blocked or future. Their screens stay
   placeholders and their dashboard tiles stay hidden (never shown as zero).
6. **Staff invitations** will use one `/invite/staff#token=` entry
   (`D-G16`, proposed), separate from SF-57/SF-80 coach invitations.
7. **No gym screen shows members' training data**: no RPE, weight, notes,
   videos or messages. A gym coach sees roster and attendance only.

The per-screen design inventory (116 boards, classification, required states
and truthfulness) is `proposals/SF-82-gym/06-claude-design-inventory.md` in
the API repository.
