# Gym domain architecture (SF-82) — web client implications

**Status: accepted (final SF-82 approval, 2026-10-23); SF-83 not started.** Commercial items (D-G09–D-G11) are deferred product decisions; D-G17, D-G19 and D-G25 are open. The source of truth is the API
repository:

- `simplefit-api/docs/architecture/adr/0026-gym-domain-architecture.md`
- `simplefit-api/docs/architecture/proposals/SF-82-gym/`

SF-82 changes no code, no route registry entry and no design in this
repository. The Gym routes stayed SF-32/SF-33 feature placeholders until
their tickets: owner setup `/app/onboarding/gym` (SF-86) and the id-based
console `/app/gyms/:gymId/**` with the chooser `/app/gyms` (SF-88,
`docs/gym-console-web.md`).

## What the web client will have to follow

1. **The backend authorizes everything.** Hiding a navigation item is only
   presentation. Every gym action is checked by the API against the user's
   staff role at that gym.
2. **ID-based gym navigation** (`D-G23`, approved). Gym routes carry the
   gym id: `/app/gyms/:gymId/…` (console) and `/app/me/gyms/:gymId/…` (member view). The page passes the id unchanged to
   `/api/v1/gyms/{gym_id}/…` (`D-G15`). The id is only a lookup key, and
   the backend authorizes every request. `/app/gyms` lands on the only gym or
   lists several, preselecting the last choice the server remembers. SF-88
   moved the web console to these paths; the member view comes with
   a member-UI task not yet in Jira (SF-91 is the web first run).
3. **404 vs 403** (`D-G24`, approved). A 404 from a gym endpoint means "not
   available to you", so render not found and never hint that the gym
   exists. A 403 `forbidden` means the user is staff but their role lacks
   the permission: show the role-restriction state (an exception to
   route-architecture rule 9) and do not retry.
4. **Members do not need a FighterProfile** (`D-G07`, approved).
   Member-facing gym routes move from `FIGHTER` to account level under
   `/me/gyms/:gymId` in a registry change, part of a member-UI task not yet in Jira (SF-91 is the web first run).
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
  `retry-after` after 5 creations per user, or 20 per client, in any rolling
  24 hours.
- `listMyGyms` (`GET /api/v1/me/gyms`): the viewer's active staff
  memberships, paginated.
- `getGym` (`GET /api/v1/gyms/{gym_id}`): one gym for its staff, with the
  viewer's `role` and a read-only `permissions` list for display. A `404`
  means the gym is not available to the viewer.

No route, screen or registry entry changes in SF-83. The owner setup flow and
entry projection (`GYM_WORKSPACE`) come with SF-84/SF-85.

## SF-84: gym entry (no screens yet)

`GET /api/v1/me/entry` (ADR 0017, SF-84 amendment) now resolves gyms:

- `intent=gym` → `gym_onboarding` (start setup, `gym_id: null`; or resume
  the owned draft, `gym_id`), `gym_home` (one completed gym, `gym_id`), or
  `gym_selection` (several workspaces). It never creates a gym.
- `capabilities` may include `GYM_WORKSPACE`, granted by an active staff
  membership at a gym with a completed setup. A draft grants nothing.
- `gym_workspaces` (at most 25, with `gym_workspace_count`) lists the
  viewer's gyms with `role`, `setup_status`, `available_actions` (`enter`,
  `continue_setup`) and `selected`. Branch on `available_actions`; never
  infer eligibility from labels.
- `PUT /api/v1/me/entry/context` accepts `{ context: "gym", gym_id }` to
  remember a completed gym (404 outside the tenancy, 409 for a draft). It is
  a per-account preference; every gym request still names its gym in the
  path.

Registry: since SF-88, `gym_home` maps on the web to the console of the
entry's `gym_id` (`/app/gyms/:gymId`) and `gym_selection` to the web gym
chooser (`/app/gyms`); on mobile they stay `mobile.gym.pulse` and A04.
Client code keeps its profile-context type to `fighter` / `coach`; gym
workspaces are listed from the entry's `gym_workspaces`.

## SF-85: gym setup API (no screens yet)

The generated client adds the owner setup operations (ADR 0026, SF-85
amendment):

- `getGymSetup` returns the setup, `revision` and `missing_requirements`. A
  draft's owner needs no `GYM_WORKSPACE`.
- `updateGymSetup` is a partial update of the profile and text branding
  (`name`, `gym_type`, `phone`, `website`, `tagline`, `accent_color` from
  the six OG3 swatches). An omitted field is unchanged; `null` clears an
  optional field.
- `setGymPrimaryLocation` sets the whole primary address (OG2).
- `completeGymSetup` is owner-only. Missing requirements answer `422`, with
  each one under `details.field_codes`.
- `discardGymDraft` (`DELETE /gyms/{gym_id}`) is owner-only and works on
  drafts only.
- `updateGymSetup` and `setGymPrimaryLocation` require `expected_revision`
  (the last `revision` read). A stale value answers `409` (`revision:
stale`); reread and retry. Completion and discard take no revision.
- A `client_request_id` is spent once used: after its draft is discarded,
  replaying it answers `409` (`client_request_id: discarded`). Send a new
  key to create again.

Not in the contract yet: gym size and features (OG4/OG5, future with plans)
and logo/cover uploads (waiting for a storage attachment mechanism).

## SF-90: gym first run and setup checklist API

The generated client adds the owner's gym first run (ADR 0026, SF-90
amendment). The web screens GRW1 and GRW2 are SF-91 (below); GR1 and the
GR2 tour on mobile are SF-101.

- `getGymFirstRun` returns the introduction's `status` (`unavailable` for a
  draft, then `not_started`, `in_progress`, `completed`, `dismissed`), its
  timestamps and the derived `checklist`.
- `startGymFirstRun`, `completeGymFirstRun` and `dismissGymFirstRun` take an
  empty body. A repeat returns the same state. The other outcome, or a start
  after one, answers `409` (`details.first_run`); a draft answers `409`
  (`details.setup_status: draft`).
- One state per gym and owner, the same on web and mobile: start on one
  device, resume or finish on the other. Managers, coaches and front desk get
  `403` (`manage_first_run` is the owner's).
- Checklist keys, in order: `create_gym`, `add_class`, `invite_staff`,
  `invite_members`, `first_check_in`. Statuses are `completed`, `available`
  and `coming_later`. Only `create_gym` is real today; show the others as
  "coming later", never as missing or clickable. Neither outcome of the
  introduction changes any item.
- Tour steps, highlights and replays stay in the client. Never send them to
  the API, and never block the gym shell on the first run.

## SF-91: web owner first run (GRW1, GRW2)

`entities/gym-first-run` wraps the SF-90 client: one query per gym
(`gymFirstRunQueryKey`), read only with `manage_first_run`, and the start,
complete and dismiss transitions, which write the backend's answer to that
gym's cache and re-read it on a `409`. The console (`widgets/gym-workspace`)
renders GRW1 and the four-step GRW2 tour of Claude Design 112 from that
state only; the tour step stays in the client. See
`docs/gym-console-web.md` (SF-91) for behaviour and the differences from the
design (`D-WEB-GYM-FIRST-RUN`).

## SF-93: gym staff, roles and staff invitations API (no screens yet)

The generated client adds the gym's staff and staff invitations (ADR 0026,
SF-93 amendment; tag "Gym staff"). There are no screens yet: WG16, OS1, OS1b,
OS2 and the mobile invitation inbox are the next frontend ticket.

- **Roster:** `listGymStaff` (`status=active` for every role; `status=ended`
  for owner and managers). Each member is `staff_membership_id`, `role`,
  `status`, a short `name` ("Natalia W."), `is_viewer`, `joined_at` and the
  end fields. No email, user id or profile.
- **Roles:** `changeGymStaffRole` (`{role}`) follows the matrix: the owner
  sets any non-owner to `manager`, `coach` or `front_desk`; a manager only
  switches coaches and front desk. Nobody changes their own role; the owner's
  row answers `409` (`staff_membership: owner_requires_transfer`).
- **Removal and leaving:** `endGymStaffMembership` ends another member's
  membership (removal) or the viewer's own (leaving; never the owner). The
  member gets `404` at that gym on their next request; their session and
  other gyms are untouched. A repeat answers `404`.
- **Invitations (gym side):** `createGymStaffInvitation` (`{email, role}`;
  `201` new, `200` the same pending address and role), `listGymStaffInvitations`
  (owner, managers; masked addresses), `resendGymStaffInvitation` (new link,
  new 7 days; 3 resends, 60 s apart), `cancelGymStaffInvitation`. The owner
  invites managers, coaches and front desk; a manager coaches and front desk.
  Conflicts: `setup_status: draft`, `staff_invitation: pending_other_role`,
  `staff_membership: already_active`. New permission `view_staff_records`
  (owner, manager) gates the invitation list and ended staff.
- **Invitations (recipient side):** the mobile inbox is token-free:
  `listMyStaffInvitations`, `getMyStaffInvitation`, `acceptMyStaffInvitation`,
  `declineMyStaffInvitation` (by id; matched by the user's verified email
  identities; Google/Apple-only users verify the address first with the SF-77
  linking flow). The web page of the E06 link (`/invite/staff#token=…`, read
  once from the fragment) uses `previewStaffInvitation` (anonymous: gym name,
  role, inviter first name, expiry), `acceptStaffInvitation` and
  `declineStaffInvitation` with the token in the body. Never put the token in
  a route, query, storage or log.
- **Answers:** `410 invitation_unavailable` (expired, cancelled, declined,
  used token), `403 invitation_recipient_mismatch` (token of another address:
  offer to verify that address), `404` (an id not in the viewer's inbox),
  `409 staff_membership: already_active`, `422 account_registration`. A
  repeated acceptance returns `outcome: already_accepted` with the same
  membership. Acceptance creates no Coach or Fighter profile and no
  Coach–Fighter relationship.
- **After acceptance:** the gym appears in `resolveMyEntry` / `listMyGyms`;
  the current context is not switched.
- **Checklist:** `invite_staff` is now `available` at a completed gym and
  `completed` once a staff invitation was accepted. The current checklist
  rows show it without an action; the staff screen should become its
  destination.

## SF-95: gym members, enrollment and member invitations API (no screens yet)

The generated client adds gym **members** (participants), separate from
staff (ADR 0026, SF-95 amendment; tag "Gym members"). There are no member screens yet. `/app/me/gyms`, `/invite/gym`, `/join/:code`
(A03), the mobile inbox entries and the members console have no Jira task
yet (SF-91 is the web first run; SF-100 is booking and attendance UI).

- **A membership is not a workspace:** a member gets no `GYM_WORKSPACE`, no
  gym permission and no Fighter or Coach profile. Member routes stay
  account-level (`/me/gyms/:gymId`, SF-82 07).
- **Joining by code:** `previewGymJoin` (anonymous: gym name,
  `requires_approval`) and `joinGym` (`{code}`; `201` new, `200` the pending
  request again). The result is `requested` unless the gym enabled
  auto-approval (`active`, `auto_approved: true`). Answers: `404` unknown or
  disabled code, `409 gym_member: already_active`, `422
account_registration`, `429` (20 per 10 min per client, 10 per user).
  Codes are typed forgivingly (case, spaces, hyphens; `O`/`I`/`L`).
- **The member's own list:** `listMyGymMemberships`, `getMyGymMembership`,
  `cancelMyGymJoinRequest` (requested → cancelled), `leaveGymMembership`
  (active → ended, `left`). Final rows stay; joining again creates a new
  membership.
- **Gym side:** `listGymMembers` (`status=active|ended`; owner, managers,
  front desk; coaches get `403` until classes exist), `getGymMember`,
  `listGymJoinRequests`, `approveGymJoinRequest`, `rejectGymJoinRequest`
  (owner, managers, front desk), `removeGymMember` (owner, managers). Each
  row: `gym_member_id`, `status`, short `name`, `joined_via`,
  `auto_approved` and dates; never an email or user id.
- **Enrollment settings:** `getGymEnrollmentSettings` (code as `ABCD-EFGH` or
  `null`, `auto_approve`, `can_manage`), `rotateGymJoinCode`,
  `disableGymJoinCode`, `updateGymEnrollmentSettings` (`{auto_approve}`).
  New permission `manage_enrollment_settings` (owner, manager); the front
  desk reads the code. Auto-approval is off by default.
- **Member invitations (E07):** off in production until `/invite/gym` exists
  (`createGymMemberInvitation` and `resendGymMemberInvitation` answer `409
member_invitation: recipient_flow_unavailable`; on in dev and test).
  gym side `createGymMemberInvitation`
  (`{email}`), `listGymMemberInvitations`, `resendGymMemberInvitation`,
  `cancelGymMemberInvitation`; recipient side `listMyGymInvitations`,
  `getMyGymInvitation`, `acceptMyGymInvitation`, `declineMyGymInvitation`
  (token-free inbox), and for the web page of the E07 link
  (`/invite/gym#token=sgm_…`, read once from the fragment)
  `previewGymInvitation`, `acceptGymInvitation`, `declineGymInvitation` with
  the token in the body. Same answers as staff invitations (`410`, `403
invitation_recipient_mismatch`, `404`, `409 gym_member: already_active`).
  Invitations expire 7 days after the last sending.
- **Member list (OG12):** `previewGymMemberImport` is a dry run (CSV text in
  the body; nothing stored or sent; masked addresses; row outcomes). Its
  `commit.available` is always `false` (`legal_basis_pending`): there is no
  import commit until the proposed decision D-G27 (lawful basis, retention) is
  approved.
- **Checklist:** `invite_members` is now `available` at a completed gym and
  `completed` once a member became active. The checklist row shows it
  without an action until a member screen exists.
