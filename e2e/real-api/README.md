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

This is a **local acceptance gate, not part of CI**. It needs an API on a
**disposable** database. Never point it at `simple_fit_dev`: the spec refuses
any database whose name does not contain `e2e`, because it clears that
database's rate-limit windows between steps.

The Google and Apple scripts are blocked. Real provider sign-in is not covered
here.

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
