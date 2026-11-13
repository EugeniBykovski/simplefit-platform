# Real-backend acceptance (SF-30)

`fighter-journey.spec.ts` drives the new-Fighter journey on the production
build against a real `simplefit-api` and PostgreSQL, with nothing mocked:
email registration → code → account registration (WA5) → Fighter onboarding
(WF0, WF1, WF6) → Home and the first-run tour → sign out → email sign-in →
Home. It runs in Chromium, Firefox and WebKit at desktop widths and in mobile
Chromium and mobile WebKit.

`coach-journey.spec.ts` (SF-52) drives the new-Coach journey the same way:
email registration with `intent=coach` → WA5 → Coach onboarding (WCR1, WCR2,
WCR7) → the Coach context choice → the Coach dashboard (SF-54) → Fighter
setup from the context switcher → switch back to Coach → sign out → email
sign-in → Coach home (the remembered choice).

`gym-journey.spec.ts` (SF-86) drives the Gym owner registration, journeys
A–P of the ticket: Gym intent → email registration → WA5 → OG1 (nothing
created by choosing Gym) → one draft with one owner membership → a refused
completion without a location → OG2 → OG3 → reload, sign out and in, and a
second device all resuming the same draft → a stale revision from the other
device (nothing overwritten, an explicit reapply) → completion → OG6b → the
SF-84 `gym_home` with GYM_WORKSPACE → a completed gym refusing discard → a
stranger getting 404 on every gym operation; then a second gym with a lost
create response (no duplicate) kept isolated from the first; a create key
replayed after its draft was discarded (409, no gym); and a Coach-and-Fighter
account gaining a gym with every context kept. Backend checks read the
disposable database (psql) or call the API with the page's own session.
Journey Q (SF-105) is the API started with `SIMPLEFIT_LOCAL_DEV_COACHING=enabled`
on the disposable database: the mode refuses itself (`database_not_approved`)
and the gym flow needs no bypass.

`session-navigation-race.spec.ts` (SF-75) loses a real refresh response: a
local proxy (`lost-response.ts`) holds the API's answer, after the rotation
committed, until the page has navigated away, so the browser never applies
the new cookie. The session must survive through the API's lost-response
recovery, and the spec asserts that the recovery really happened. It also
covers rapid reloads, Back/Forward, two tabs, a sign-out during a lost
refresh followed by another user, a network failure during the restore, and
a replay of a copied cookie from an independent client
(`docs/investigations/session-refresh-navigation-race.md`).

`email-identity-link.spec.ts` (SF-78) verifies the invited email from a
coach invitation on the SF-77 API: a Google-only and an Apple-only user link
the invited address and then accept explicitly (one relationship, one user);
an address owned by another user stays where it is; expired and superseded
codes link nothing; a logout in another tab ends the flow and neither a new
session nor another user can use the old code; a confirmation whose answer
is lost is reconciled from the identity list; a double submission sends one
confirmation; and, with sharing off (Journey 7), linking works on its own
while the invitation stays unavailable. Google and Apple users are created
in the disposable database by `fixtures/email-link-seed.exs` (SimpleFit's own
context functions, `mix run`, refused on any database without `e2e` in its
name) and the browser receives their refresh cookie. It needs an API with
sharing on and the test-only legal fixtures loaded, e.g.:

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4100 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  COACHING_ACCESS_ENABLED=true \
  COACHING_DISCLOSURES=fighter-coach-disclosure-test-1=basic_profile \
  COACHING_DATA_RULES_VERSION=coach-data-rules-test-1 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load()'
```

Journey 7 runs against the same API restarted with
`COACHING_ACCESS_ENABLED=false`, with `E2E_SHARING=off` for the spec.

`gym-members.spec.ts` (SF-96) drives the gym's members page, scenarios A–AF
of the ticket: the owner creates a gym, turns joining by code on, approves
and rejects requests, rotates the code (the old one stops working), turns
auto-approval on (a verified applicant joins active, an unverified one
still waits), is refused member invitations by the server's gate without
any claim of sending, and previews a CSV whose dry run changes no table;
the manager and front desk answer requests, the coach is refused; a user
joins two gyms that never see each other; a revoked front desk and a
switched account keep nothing. Joining is the member API called with the
applicant's own session (no member web page exists), staff accept their
SF-93 invitations through the API, and the unverified applicant comes from
`fixtures/member-unverified-join.exs`. The API runs with member invitations
off, as in production, and with the test-only legal fixtures:

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4196 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load(); Application.put_env(:simple_fit, SimpleFit.Gyms, Keyword.put(Application.get_env(:simple_fit, SimpleFit.Gyms, []), :member_invitations, false))' \
  > /path/to/api.log 2>&1
```

With `E2E_API_LOG=/path/to/api.log` the spec also checks (AF) that the API's
log holds none of the run's join codes, imported addresses, invitation
tokens, bearer tokens or CSV rows; it prints none of them.

`gym-timetable.spec.ts` (SF-98) drives the gym timetable, scenarios A–AJ of
the ticket: the owner creates a gym, a venue and a template in the web UI,
schedules a one-time class (from a New York browser, shown at its Warsaw
wall time), assigns the coach, is refused overlapping venue and instructor
slots (adjacent ones are fine), schedules weekly classes across the spring
DST change (18:00 stays 18:00; a 02:30 series lists its skipped date),
refuses a 02:30 one-time class on 28 March 2027 and picks the second 02:30 on
31 October 2027, moves and cancels single dates, cancels a series (the date
cancelled on its own keeps its reason), loses a stale edit to the manager
without overwriting it, and recovers a lost create answer without a
duplicate. The manager plans, the coach cancels only their own class, the
front desk only reads, a revoked front desk loses the gym; Gym B (another
owner, API) is invisible to Gym A, and the coach's Gym A class blocks the
same slot in Gym B with a bare `instructor_unavailable`. Staff join through
the SF-93 API with their own sessions. It writes `evidence.json` (status
codes, ids, UTC instants, revisions, audit event counts) to its output and,
with `E2E_EVIDENCE=/path/prefix`, beside it. The API needs only the test-only
legal fixtures:

`gym-member-booking.spec.ts` (SF-100) drives member booking and staff
attendance (scenarios A–AC of the ticket) and writes `E2E_HANDOFF_FILE` (ids
and addresses, no token) for the mobile leg
(`src/providers/gym-member-booking.real-api.test.tsx` in simplefit-mobile).
With `E2E_SYNC=1` it runs its second leg after the mobile one: the web shows
the mobile client's cancellation and booking and cancels the mobile booking.
`E2E_API_LOG` (the API's log, scanned for secrets) and `E2E_EVIDENCE` are
optional. Its "today" classes are scheduled from the run's own clock, so run
it before 22:40 Warsaw time.

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4198 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load()' \
  > /path/to/api.log 2>&1
```

With `E2E_API_LOG=/path/to/api.log` the spec checks (AJ) that the log holds no
bearer, access or refresh token and none of the run's email addresses.

This is a **local acceptance gate, not part of CI**. It needs an API on a
**disposable** database. Never point it at `simple_fit_dev`: the spec refuses
any database whose name does not contain `e2e`, because it clears that
database's rate-limit windows between steps.

The Google and Apple scripts are blocked. Real provider sign-in is not covered
here.

## Staff invitation recipient (SF-133)

`gym-staff-invitation.spec.ts` runs journeys A–T through the browser: the owner
invites, the E06 link is read from the queued email with `mix
e2e.staff_invitation_token --link` and opened as written, and the recipient
previews, signs up or signs in, verifies the address and answers on the page.
SQL only moves an expiry or resets rate limits; the API is called directly only
where a refusal is the point. Google and Apple sign-in are not covered: see
`email-identity-link.spec.ts` for the seeded provider-session variant. Start the
API as for the coach journeys; `E2E_API_LOG` makes the spec scan the log for
tokens and codes, and `E2E_EVIDENCE` is a directory for its result file.

## Member join and invitation (SF-134)

`gym-member-join.spec.ts` runs journeys A–E through the browser: a new user joins by
code and the owner approves in the console; auto-approval; the E07 link read from the
queued email with `mix e2e.member_invitation_token --link` and opened as written; one
person in two gyms; and the security cases. Classes are API fixtures with the owner's
session, SQL only moves an expiry, resets rate limits and reads results, and direct
member API calls appear only where a refusal or another client's view is the point.
Member invitations must be on, as in dev. Google and Apple sign-in are not covered.

## Control Plane (SF-120)

`control-plane.spec.ts` runs the Control Plane entry and first visit in Chrome only:
security keys are Chrome DevTools Protocol virtual authenticators (CTAP2 over USB,
user verification, not backup-eligible; one backup-eligible key proves synced
passkeys are refused). WebAuthn needs a hostname, not an IP, so the web runs at
`http://localhost:3100` and the API must accept that origin:

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4120 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://localhost:3100 WEB_APP_URL=http://localhost:3100 \
  SIMPLEFIT_DEV_WEBAUTHN_ORIGIN=http://localhost:3100 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load()'
NEXT_PUBLIC_API_URL=http://localhost:4120 pnpm build
```

Run `MIX_ENV=dev mix operators.dev_ceremony …` once before starting the API so
development trusts its key (`.operator-dev/`, outside Git). Accounts come from
`fixtures/control-plane-seed.exs`; the spec bootstraps its operator with the
development ceremony, which only bootstraps the first operator of a database
(`operator_exists`), so every run needs a freshly migrated disposable database.
SQL only ages a key check, revokes the operator (the client's answer to the 404 is
under test) and reads results.

**SF-157:** the Control Plane opens at session assurance (simplefit-api ADR 0028 amendment). The specs sign in
through `/en/login` (email code) or `/en/admin/login` (email and password), register keys from the Control Plane's
notice when an action needs them, and answer the action dialog's key check ("Use security key") on the first action
of a session. There is no key check at entry, so the old "check lapsed" step is gone.
`sponsor-partnerships.spec.ts` drives its actions through the API, so it runs the real step-up ceremony in the page
(`keyCheck`) first.

`admin-password-sign-in.spec.ts` (SF-157) runs on the same setup (a fresh database each run): the password is set
through the real emailed code, then email and password sign-in, one answer for a wrong password or an unknown
address, throttling, an ordinary account refused, key registration and a fresh key check before a privileged
action, sign-out and another account in the same browser, a reset that signs out everywhere, revocation, the
email-code sign-in one link away, and no password in the API log (`E2E_API_LOG`). Its keyboard check runs in all
five browser projects.

`control-plane-users.spec.ts` (SF-122) runs on the same setup: account search, suspension, lift and sign-out
checked in the target's own sessions (separate browser contexts) and in the database.

`control-plane-oversight.spec.ts` (SF-123) runs on the same setup (a fresh database each run): its world comes
from `fixtures/oversight-seed.exs` (a set-up gym with an owner and a member, a coach and a fighter in a relationship
with a session note, the fighter's body data). The gym list and detail, the coach and fighter lookups, revoked
grants and another person signing in on the same browser are checked against the database; the seeded canaries
(member name, bio, note, weight, fight, full names, address, emails) must never show.

`control-plane-sponsor-review.spec.ts` (SF-124) runs on the same setup (a fresh database each run) plus storage
on the local S3 stand-in (`fixtures/s3-stub.mjs`, signatures unchecked) for both the API and the spec
(`E2E_S3_BUCKET`, `E2E_S3_ACCESS_KEY_ID`, `E2E_S3_SECRET_ACCESS_KEY`, `E2E_S3_ENDPOINT`). Applicants submit through
`fixtures/sponsor-review-seed.exs`; claim, approve, reject, request changes, suspend and reinstate run through the UI
and are checked in the database, as are a stale second tab and an approval whose answer is lost.

`control-plane-billing.spec.ts` (SF-127) runs on the same setup (a fresh database each run). Its world comes
from `fixtures/billing-seed.exs`: gyms, a published plan and subscription requests through the real contexts, one
activation through the Stripe provider path (trusted in that process only), and the Stripe side (links, invoices,
a failed webhook event) recorded as rows. No Stripe API, real or mocked, runs in this suite; Stripe-backed flows are
covered by the API's Stripe-fake tests. Every expected figure is read back with SQL; SQL also revokes the billing
grants (the client's answer is under test).

`control-plane-configuration.spec.ts` (SF-128) runs on the same setup (a fresh database each run). The operator
suspends and restores a real switch through the SF-111 dialog; `fixtures/configuration-seed.exs` asks the real
consumer (`Gyms.create_member_invitation/4`) from a separate BEAM sharing the database, a second application
instance. SQL reads results, raises a revision under an open dialog (another writer) and revokes grants.

`control-plane-operators.spec.ts` (SF-129) runs on the same setup (a fresh database each run). The founder
adds a second operator by exact email through the UI; that operator registers their own keys in a separate browser
context with its own virtual authenticator. A grant, a removed `operators.manage` (refused on the second
operator's next request, in the UI and by the API), suspension, reinstatement and revocation run through the
SF-111 dialogs; SQL only reads results. The API refuses the founder acting on themselves.

`control-plane-overview.spec.ts` (SF-121) runs on the same setup (a fresh database each run) and
checks every number the overview shows against SQL written from the metric catalog
(simplefit-api `docs/architecture/admin-overview-metrics.md`).

## Run

```bash
# 1. A disposable database and an API on its own port (simplefit-api).
cd ../simplefit-api
export E2E_DB=ecto://postgres:postgres@localhost/simple_fit_e2e
MIX_ENV=dev DATABASE_URL=$E2E_DB mix ecto.create
MIX_ENV=dev DATABASE_URL=$E2E_DB mix ecto.migrate
env -u RESEND_API_KEY MIX_ENV=dev PORT=4100 DATABASE_URL=$E2E_DB \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  mix phx.server

# 2. A production build of the web app against that API (simplefit-platform).
NEXT_PUBLIC_API_URL=http://127.0.0.1:4100 pnpm build

# 3. The journey. Playwright starts `next start` on port 3100.
E2E_REAL_API_URL=http://127.0.0.1:4100 \
E2E_API_DATABASE_URL=postgres://postgres:postgres@localhost/simple_fit_e2e \
  pnpm test:e2e:real-api

# 4. Afterwards: drop the database, then rebuild with your usual API URL.
MIX_ENV=dev DATABASE_URL=$E2E_DB mix ecto.drop   # in simplefit-api
```

| Variable               | Meaning                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `E2E_REAL_API_URL`     | The API the build was made against. Without it, the test skips. |
| `E2E_API_DATABASE_URL` | That API's disposable database (its name must contain `e2e`).   |
| `E2E_API_DIR`          | The `simplefit-api` checkout. Default: `../simplefit-api`.      |

The emailed code is read with `mix e2e.email_code <address>`, a Mix task that
runs only in dev and test. It opens the API's queued, encrypted email the way
the delivery worker does. The development email adapter never logs codes.

`gym-verification.spec.ts` (SF-103) drives business verification, community
defaults and go-live, journeys A–AD: the owner creates a gym, drafts, uploads
a real PDF to the presigned URL (the backend confirms it with a presigned
HEAD) and submits; staff are refused and no approval route exists; the
operator task (`mix gyms.verification`, same database, the dev build's fixture
authority, SF-136) lists, downloads the stored document, refuses `--operator` and a
stale revision, and approves; Stripe tables stay empty; community stores nothing; go-live reads
staff, members and a class; revocation fails go-live closed and keeps every
record; another gym's owner gets 404; a switched account keeps nothing; the
API log holds no business detail, file name or signed URL. It needs an API
whose storage points at a local S3-compatible server with a private bucket
and CORS for `http://127.0.0.1:3100`, e.g.:

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4203 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  AWS_S3_BUCKET=$BUCKET AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=$KEY \
  AWS_SECRET_ACCESS_KEY=$SECRET AWS_S3_ENDPOINT=http://127.0.0.1:4566 mix phx.server
```

and the same values for the spec (`E2E_S3_BUCKET`, `E2E_S3_ACCESS_KEY_ID`,
`E2E_S3_SECRET_ACCESS_KEY`, `E2E_S3_ENDPOINT`), plus `E2E_API_LOG` (the API's
log file) for journey AC.

`gym-billing.spec.ts` (SF-102) drives the SimpleFit plan page: the owner
reaches Settings → SimpleFit plan, sees the backend's provider state, chooses
the published plan (the intent is recorded; checkout is refused before any
Stripe call because the plan has no Stripe Price mapping), withdraws the
request; a manager sees the restriction and requests nothing; a stranger gets
404; signed webhooks over real HTTP (raw body, replay, stale, forged, other
mode) record one event of an unprocessed type. **No journey reaches Stripe.**
Run it twice against the API on a disposable database: `E2E_STRIPE=disabled`
(API with `STRIPE_BILLING_ENABLED=false`) and `E2E_STRIPE=test` with
`E2E_STRIPE_WEBHOOK_SECRET` (API with `STRIPE_BILLING_ENABLED=true
STRIPE_MODE=test` and placeholder test credentials), with a published plan
(`mix billing.catalog seed-provisional` and `publish`).

`sponsor-application.spec.ts` (SF-115) drives the public Partners pages and the sponsor application:

- **A, the public pages:** SPX1 and SPX2 open anonymously, with no invented brands or figures, pass axe, and don't overflow from 375 to 1920 px.
- **B, registration:** registration started from SPA0 comes back to it and creates nothing.
- **C, the full journey:** an email sign-in returns to SPA0, then the eight steps run with the backend's missing answers and a format error. A real upload follows: the first `PUT` is aborted and the retry is confirmed by the API. Then a refresh, Back and Forward, the declaration enforced, and a single submission. No organization, membership or `SPONSOR_WORKSPACE` results, and form URLs are corrected to the status.
- **D, refusals:** a second submission is refused. Another user gets `404` for the application and the document, and the same browser signed in as that user shows nothing of the first.
- **E, two tabs:** a stale revision is refused without overwriting anything, and the refused tab's text is kept.

It needs the test-only legal fixtures (the published declaration), sponsor uploads on (the dev default), and storage on an S3-compatible server with CORS for `http://127.0.0.1:3100`. Without an emulator, `node e2e/real-api/fixtures/s3-stub.mjs` serves one on 4566. It's a stand-in that checks no signatures, so this is not a real-S3 test. For example:

```bash
node e2e/real-api/fixtures/s3-stub.mjs &
env -u RESEND_API_KEY MIX_ENV=dev PORT=4115 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://127.0.0.1:3100 WEB_APP_URL=http://127.0.0.1:3100 \
  AWS_S3_BUCKET=sf115-e2e AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=stub AWS_SECRET_ACCESS_KEY=stub \
  AWS_S3_ENDPOINT=http://127.0.0.1:4566 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load()'
```

Operator review (claim, request changes) needs a WebAuthn step-up ceremony, so the changes-requested journey is covered by the component tests and stories, not here.

## Sponsor partnerships (SF-131)

`sponsor-partnerships.spec.ts` drives the partner portal's partnership pages against a real simplefit-api with
SF-130 and a freshly migrated disposable database (the operator bootstrap ceremony is single-use per database).
Organization A comes from a real SF-116 approval of a submitted application (`fixtures/sponsor-review-seed.exs`);
organization B, a second organization of A's owner, the member and the revocation come from
`mix sponsors.fixture` (development builds only). The operator registers virtual security keys and passes the key
check on the web, then sends the SF-111 commands (claim, request changes, accept, suspend) with the page's own
session, since no operator console exists for proposals yet. Chrome only, one desktop pass:

```bash
env -u RESEND_API_KEY MIX_ENV=dev PORT=4131 DATABASE_URL=$E2E_DB PHX_SERVER=true \
  CORS_ALLOWED_ORIGINS=http://localhost:3100 WEB_APP_URL=http://localhost:3100 \
  SIMPLEFIT_DEV_WEBAUTHN_ORIGIN=http://localhost:3100 \
  mix run --no-halt -e 'Application.put_env(:simple_fit, SimpleFit.Legal, registry_path: "test/support/legal", allow_test_fixtures: true); SimpleFit.Legal.Registry.load()'
NEXT_PUBLIC_API_URL=http://localhost:4131 pnpm build
E2E_REAL_API_URL=http://localhost:4131 E2E_API_DIR=../simplefit-api E2E_API_DATABASE_URL=$E2E_DB \
  pnpm test:e2e:real-api e2e/real-api/sponsor-partnerships.spec.ts --project=chromium-1440
```
