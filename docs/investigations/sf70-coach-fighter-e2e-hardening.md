# SF-70: Coach–Fighter coaching and training, end-to-end hardening

**Date:** 2026-10-21. **Repos:** simplefit-api, simplefit-platform,
simplefit-mobile, branch `SF-70-coach-fighter-training-e2e-hardening`, from
`main` at API `22c6888`, platform `55d0854`, mobile `ba4a1f2`.
**Verdicts:** Engineering **BLOCKED** by one P1 (D1, iOS token caching),
which predates SF-70: the fix is implemented and proven natively on the
simulator, but not yet in a build of the app, which needs a new dev build
(see "D1 remediation"). Native **PARTIAL**. Public **NO-GO**.

This is the durable record of the SF-70 run. The API's ADR 0010 and the mobile
`docs/investigations/` point here. Evidence such as screenshots, probe JSON and
logs lived in a disposable scratch area and is not committed. Every result
below comes from a command that was actually run.

## Environment and safety

- **Database.** Disposable PostgreSQL database `simple_fit_sf70_e2e`, migrated
  from zero. ExUnit used the separate partition `simple_fit_test_sf70`. Nothing
  touched `simple_fit_dev`, a production database, existing sessions or
  accounts, the port 4000 server or any existing Metro.
- **Fail-closed harness.** Before the first mutation and on every start, the
  harness required three things:
  - the API process environment named the disposable database;
  - the live Repo connection answered `select current_database()` with
    `simple_fit_sf70_e2e`;
  - the log line confirmed that live database.

  Any mismatch aborted the run.

- **Servers.** API on 127.0.0.1:4071. The web production build used
  `NEXT_PUBLIC_API_URL=http://127.0.0.1:4071` with no `.env` files and was
  served on 3100. Metro ran with `EXPO_PUBLIC_API_URL=http://127.0.0.1:4071` and
  `EXPO_NO_DOTENV=1`. The iOS work used three dedicated simulators.
- **Configuration A.** Coaching gate off. This is the production default and
  was not changed.
- **Configuration B.** Gate on, using the `test_only` legal fixtures loaded in
  memory from `simplefit-api/test/support/legal/registry.json`
  (`fighter-coach-disclosure-test-1`, `coach-data-rules-test-1`, approval ref
  `TEST-FIXTURE-NOT-APPROVED`). They were never copied into the production
  registry. The production sharing gate was never enabled.

## Quality gates (final tree)

| Gate                                                                                            | Result                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| API `mix test`                                                                                  | 1070 passed                                                  |
| API `mix quality` (format, warnings, credo strict, openapi.check, dialyzer)                     | pass, 0 issues                                               |
| API Redocly 2.57.0 lint                                                                         | valid                                                        |
| Migrations: zero → all; `rollback --all`; re-migrate                                            | 16 up; only `schema_migrations` left; identical `pg_dump -s` |
| OpenAPI snapshot across 3 repos                                                                 | byte-identical                                               |
| Route registry, platform vs mobile                                                              | byte-identical                                               |
| Platform `pnpm quality`                                                                         | pass (Vitest 1062, build)                                    |
| Platform Playwright (Storybook geometry, production, portability ×3 engines)                    | 824 / 824                                                    |
| Platform real-API suite (5 projects: Chromium, Firefox, WebKit, mobile Chromium, mobile WebKit) | 45 / 45                                                      |
| Mobile `pnpm quality`                                                                           | pass (Jest 922)                                              |

## Coverage matrix

| Area                                                                                                                         | Backend | Web                                               | iOS                                                        | Android      |
| ---------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| Primary journey: register, onboard, invite, accept, plan, complete, sign out and in                                          | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Multi-context: dual role, context switch, cross-capability gates                                                             | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Invitations: email binding, anti-enumeration, uniform 410, stale and unapproved-language disclosure, self-invite, rate limit | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Relationships and IDOR (relationships, invitations, sessions)                                                                | PASS    | n/a                                               | n/a                                                        | n/a          |
| Scheduling and DST (gap 422, overlap offsets, stale offset, UTC midnight)                                                    | PASS    | PASS                                              | backend PASS; native picker **BLOCKED**                    | NOT VERIFIED |
| Completion (early 409, idempotent, concurrent, complete vs cancel)                                                           | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Termination (idempotent, future cancelled, history kept, former coach 404)                                                   | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Session lifecycle: logout revokes, forged and absent tokens 401, SF-75 race                                                  | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Gate off (configuration A): FirstRun unchanged                                                                               | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Concurrency: 8 accepts → 1 relationship and 1 evidence row; 8 completes → 1 stamp                                            | PASS    | n/a                                               | n/a                                                        | n/a          |
| Privacy: logs, URLs, telemetry                                                                                               | PASS    | PASS                                              | fix proven on simulator; app build pending (D1)            | NOT VERIFIED |
| Viewports and themes                                                                                                         | n/a     | PASS (1440, 1280, 1920, 412, 390; dark and light) | PASS 375, 390, 430; dark; XL text PASS after relaunch (D5) | NOT VERIFIED |
| VoiceOver / TalkBack, manual                                                                                                 | n/a     | n/a                                               | NOT VERIFIED (automated audits only)                       | NOT VERIFIED |

## Defects

| ID  | Sev | Status                                 | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | P1  | **FIXED, awaiting build verification** | On iOS, API responses were stored in the HTTP disk cache, `Library/Caches/com.simplefit.boxing/Cache.db`. That included the refresh response, holding a valid access token and the current refresh token, so the refresh token lived outside SecureStore and broke mobile rule 11. See "D1 remediation" for cause, fix and evidence.                                                                                                                                                                                                                                                                                                    |
| D2  | —   | **BLOCKED** (environment)              | The only installed iOS dev build is an EAS build made before SF-65. It has no `RNDateTimePicker` native code, so the Date and Start-time sheets render empty and Done keeps the default value. The backend time-zone path was verified with the coach's mobile form: 16:00 Europe/Warsaw (CEST) was stored as 14:00 UTC and shown correctly on a second device. The native picker interaction itself was never exercised. A new dev build needs Xcode 26+ (this machine has 16.4) or EAS credits, and both need approval. Follow-up, P2: fail loudly when a required native view is missing, rather than silently committing a default. |
| D3  | P2  | **FIXED** in SF-70 (mobile)            | SF-61: Hermes has no `Intl.PluralRules`, so ICU `plural` crashes. The invitation cooldown and limit messages used `plural` in 7 catalogs. The copy was rewritten without plurals, and `hermes-plural.test.ts` now fails any catalog that uses `plural` or `selectordinal`.                                                                                                                                                                                                                                                                                                                                                              |
| D4  | P3  | follow-up                              | SF-66: `CapabilityGate` keeps its children mounted under a cover, so a capability query can fire before the gate resolves. The backend answers 404 and nothing is exposed. Fixing it is an architectural change.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D5  | P3  | follow-up                              | iOS: when the text size is changed to accessibility XL while the app is open, Training keeps stale heights. The title disappears, the "Upcoming" and "History" segments are cut to "Up" and "Hi", and the date headers are clipped. After a relaunch at XL the screen renders correctly.                                                                                                                                                                                                                                                                                                                                                |
| D6  | P3  | follow-up                              | Fighter Home greeting reads "Welcome in, Eli K.." when the display name ends with a period.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D7  | P3  | follow-up                              | Web Fighter Training at 390 px truncates session titles to roughly 12 characters next to the time column. This happens in both themes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D8  | P3  | product decision                       | WCR7 copy "Coach tools are not available yet." while the gate is off. It is accurate today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D9  | P3  | follow-up (ADR 0021)                   | SF-74: a relationship can end while a list is open. Clients read `coach?.`, so there is no crash and no exposure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## D1 remediation

**Cause, traced in source and reproduced.**

- Expo SDK 57 installs `expo/fetch` as the global `fetch`; the bundle and the
  installed binary both confirm it.
- Its iOS session, `ExpoFetchModule.createURLSession`, uses
  `URLSessionConfiguration.default`, and so `URLCache.shared`.
- A per-request policy is impossible: `expo/fetch` passes no `cache` option to
  native code.

The disk cache is filled through two layers:

1. **Release and dev builds.** `URLCache.shared` stores `private, max-age=0`
   answers: before SF-70 that included the credential responses, and still
   includes `/api/me` and profiles.
2. **Debug dev-client builds only.** The network inspector
   (`#if DEBUG && EX_DEV_CLIENT_NETWORK_INSPECTOR`) swizzles
   `URLSessionConfiguration.default` to add a `URLProtocol`. That protocol
   reports every response with `cacheStoragePolicy: .allowed`, so
   `no-store` answers were stored too: refresh, training sessions, first-run.

**Reproduced in the installed dev build (cold start, restore, Training, a
session).** Nine responses were cached, each with `storage_policy` 0:

- `/api/auth/session/refresh`, with both tokens;
- `/api/me`, `entry`, `fighter-profile`, `first-run`;
- three training-session reads.

Several of them were marked `no-store`. Earlier the email sign-in
verification, `coach-profile` and the coach session reads were cached the same
way. Google and Apple sign-in, logout and every other call use the same
transport.

**Fix.**

- **Mobile, local Expo module `modules/sensitive-http-cache`.** Its
  `ExpoAppDelegateSubscriber` runs in `willFinishLaunching`, before React
  Native starts. It installs an `expo/fetch` session configuration through
  Expo's supported `EXFetchCustomExtension`:
  - based on `.ephemeral`, which the inspector does not swizzle, keeping the
    shared cookie store and Expo's Wi-Fi-only setting;
  - with a zero-capacity `URLCache`.

  Images keep their own caches. No fork, no config plugin, no JS change. In
  debug dev-client builds the network inspector no longer shows `fetch`
  traffic.

- **Mobile, one-time purge in the same hook.**
  - It runs `URLCache.shared.removeAllCachedResponses()` behind a versioned
    marker (`SimpleFitSensitiveHTTPCachePurgeVersion`).
  - A sentinel entry proves the removal. The marker is written only once the
    removal is proven, so an interrupted or failed purge runs again.
  - It touches only the HTTP cache. Remote images cached there are fetched
    again once: `URLCache` cannot remove one origin's entries, and editing
    its SQLite store is not supported.
- **API.** Every route of the `:authenticated` pipeline answers
  `Cache-Control: no-store`, which plain iOS sessions, OkHttp and browsers
  honour (ADR 0010).

**Native evidence (iOS 18.5 simulator; the module's exact
`SensitiveHTTPCache.swift` compiled into an XCTest probe; real refresh,
`/api/me`, training and profile calls).**

| Scenario                                                     | Result                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Old configuration, API without the route-wide `no-store`     | `/api/me` and profile cached; `sfa_` bytes on disk                                                                                                                                                           |
| Old configuration under the dev-launcher swizzle             | `/api/me`, training and profile cached; `sfa_`, `sfr_` and titles on disk                                                                                                                                    |
| Fixed configuration, plain and under the swizzle, 3 rounds   | 0 entries; 0 token or title bytes in `Cache.db`, WAL or `fsCachedData`; all calls 200                                                                                                                        |
| Fixed configuration, stale entry planted in the shared cache | never served                                                                                                                                                                                                 |
| Purge                                                        | `purged` with marker 1; then `alreadyDone`; a cache whose removal does nothing → `failed` and no marker; no token bytes left on disk                                                                         |
| Purge, preservation                                          | other user defaults and files beside the cache and in Documents kept. The Keychain could not be exercised (the unsigned XCTest runner gets `errSecMissingEntitlement`); the purge calls only `URLCache` APIs |

The subscriber and module type-check in Swift 5 and Swift 6 strict mode
against the Expo declarations. They have **not** been compiled with Expo
itself: SDK 57 needs Xcode 26 (Swift 6.2) and this machine has Xcode 16.4.

**Still to verify in a new dev build** (EAS `development-simulator`, one iOS
simulator build, approval required):

- email sign-in, refresh, lost-response recovery, logout, revoked session,
  cold restart, rapid navigation, account switch, offline retry;
- the coach and fighter screens;
- upgrade over the old build: install the new build over an affected install,
  launch, then inspect `Cache.db`.

After each scenario, scan the app container. D2, the native date and time
pickers, is verified in the same build:
`@react-native-community/datetimepicker` 9.1.0 is the SDK 57 version and is
autolinked.

**Android (assessment only, no SDK).** `expo/fetch` uses
`OkHttpClientProvider.createClient(context)`, which adds a 10 MB OkHttp disk
cache in `cacheDir/http-cache`. OkHttp honours `no-store`, which every
authenticated answer now carries. Responses of unauthenticated routes are not
personal. Plan: on an emulator or device with a debug build, run the same
scenarios, then `adb shell run-as com.simplefit.boxing ls -R cache/http-cache`
and search the `.0` and `.1` files for `sfa_`, `sfr_`, emails and titles. If
anything is stored, set an `OkHttpClientFactory` without a cache.

## Known regression backlog

| Item                             | Result                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF-61 Hermes plural              | Present; fixed (D3)                                                                                                                                                                     |
| SF-65 detail replaced on refetch | Not reproducible on current `main` with a 503 or a network error, in either client. Regression tests were added to web and mobile `coach-sessions` (keep on error; replace only on 404) |
| SF-66 pre-gate query             | Confirmed (D4)                                                                                                                                                                          |
| SF-69 back label                 | Fixed earlier (`fba2a8e`)                                                                                                                                                               |
| SF-69 clipping                   | Fixed earlier (`fba2a8e`)                                                                                                                                                               |
| SF-69 Jest worker warning        | Fixed earlier (`fba2a8e`)                                                                                                                                                               |
| SF-74 list race                  | D9                                                                                                                                                                                      |
| Native date/time picker          | BLOCKED (D2)                                                                                                                                                                            |
| Android                          | NOT VERIFIED (no SDK installed)                                                                                                                                                         |
| VoiceOver / TalkBack, manual     | NOT VERIFIED                                                                                                                                                                            |
| Light theme                      | Web PASS. Mobile is dark-first by design (SF-69 audit)                                                                                                                                  |
| SF-75 refresh race               | Real-API race suite PASS                                                                                                                                                                |

## Why Public is NO-GO

1. **D1.** The fix is not yet verified in a build of the app (needs a new
   dev build).
2. **No approved legal text.** The coaching gate cannot be enabled until counsel
   approves the disclosure and data-rules texts. Every gate-on result here used
   test fixtures.
3. **Gaps in native verification.** The native pickers (D2), Android, and
   manual VoiceOver/TalkBack were not verified.
