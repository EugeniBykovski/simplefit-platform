# SF-70: Coach–Fighter coaching and training, end-to-end hardening

**Date:** 2026-10-21. **Repos:** simplefit-api, simplefit-platform,
simplefit-mobile, branch `SF-70-coach-fighter-training-e2e-hardening`, from
`main` at API `22c6888`, platform `55d0854`, mobile `ba4a1f2`.
**Verdicts:** Engineering **READY**: D1 is fixed and proven in the app
binary (EAS build `9d7292f8`, mobile `762eb91`), and D2 is verified on the
real native pickers. Native QA **PARTIAL**: Android and manual
VoiceOver/TalkBack are not verified. Public **NO-GO** until the legal texts are
approved (see the end).

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
| Scheduling and DST (gap 422, overlap offsets, stale offset, UTC midnight)                                                    | PASS    | PASS                                              | PASS (native pickers, D2)                                  | NOT VERIFIED |
| Completion (early 409, idempotent, concurrent, complete vs cancel)                                                           | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Termination (idempotent, future cancelled, history kept, former coach 404)                                                   | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Session lifecycle: logout revokes, forged and absent tokens 401, SF-75 race                                                  | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Gate off (configuration A): FirstRun unchanged                                                                               | PASS    | PASS                                              | PASS                                                       | NOT VERIFIED |
| Concurrency: 8 accepts → 1 relationship and 1 evidence row; 8 completes → 1 stamp                                            | PASS    | n/a                                               | n/a                                                        | n/a          |
| Privacy: logs, URLs, telemetry                                                                                               | PASS    | PASS                                              | PASS (app binary, D1)                                      | NOT VERIFIED |
| Viewports and themes                                                                                                         | n/a     | PASS (1440, 1280, 1920, 412, 390; dark and light) | PASS 375, 390, 430; dark; XL text PASS after relaunch (D5) | NOT VERIFIED |
| VoiceOver / TalkBack, manual                                                                                                 | n/a     | n/a                                               | NOT VERIFIED (automated audits only)                       | NOT VERIFIED |

## Defects

| ID  | Sev | Status                                | Summary                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | P1  | **FIXED**, verified in the app binary | On iOS, API responses were stored in the HTTP disk cache, `Library/Caches/com.simplefit.boxing/Cache.db`. That included the refresh response, holding a valid access token and the current refresh token, so the refresh token lived outside SecureStore and broke mobile rule 11. Fixed by `modules/sensitive-http-cache` plus API `no-store`, and verified in EAS build `9d7292f8`. See "D1 remediation". |
| D2  | —   | **VERIFIED** in the app binary        | The old dev build lacked `RNDateTimePicker`. EAS build `9d7292f8` contains it. The pickers were checked on iPhone 13 mini (375 pt) and 16 Plus (430 pt): a normal date, Warsaw's repeated hour, Warsaw's skipped hour, editing, dismissing, and display after a cold restart all passed. See "D2 verification". The follow-up stays P2: fail loudly if a required native view is missing.                   |
| D3  | P2  | **FIXED** in SF-70 (mobile)           | SF-61: Hermes has no `Intl.PluralRules`, so ICU `plural` crashes. The invitation cooldown and limit messages used `plural` in 7 catalogs. The copy was rewritten without plurals, and `hermes-plural.test.ts` now fails any catalog that uses `plural` or `selectordinal`.                                                                                                                                  |
| D4  | P3  | follow-up                             | SF-66: `CapabilityGate` keeps its children mounted under a cover, so a capability query can fire before the gate resolves. The backend answers 404 and nothing is exposed. Fixing it is an architectural change.                                                                                                                                                                                            |
| D5  | P3  | follow-up                             | iOS: when the text size is changed to accessibility XL while the app is open, Training keeps stale heights. The title disappears, the "Upcoming" and "History" segments are cut to "Up" and "Hi", and the date headers are clipped. After a relaunch at XL the screen renders correctly.                                                                                                                    |
| D6  | P3  | follow-up                             | Fighter Home greeting reads "Welcome in, Eli K.." when the display name ends with a period.                                                                                                                                                                                                                                                                                                                 |
| D7  | P3  | follow-up                             | Web Fighter Training at 390 px truncates session titles to roughly 12 characters next to the time column. This happens in both themes.                                                                                                                                                                                                                                                                      |
| D8  | P3  | product decision                      | WCR7 copy "Coach tools are not available yet." while the gate is off. It is accurate today.                                                                                                                                                                                                                                                                                                                 |
| D9  | P3  | follow-up (ADR 0021)                  | SF-74: a relationship can end while a list is open. Clients read `coach?.`, so there is no crash and no exposure.                                                                                                                                                                                                                                                                                           |
| D10 | P2  | follow-up                             | iOS dev build: the toast after an invitation resend ("Invitation resent" and the 429 "You can resend in {seconds} s.") never appeared, in screenshots or in the accessibility tree. The coach gets no visible feedback. No crash and no JS error. Not checked: whether it predates the Expo 57.0.31 / expo-router 57.0.29 update.                                                                           |
| D11 | —   | observation, not reproduced           | During one failed automated edit run, a `PATCH` saved a time that had been picked but not confirmed. In 4 controlled reproductions, Done, a drag on the sheet, a tap behind the sheet and the backdrop all sent no write; only "Save changes" saves. No code path was found. Watch in manual QA.                                                                                                            |

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

**Application-level verification.** EAS build
`9d7292f8-e585-44a1-a42e-7158c0301b69` (profile `development-simulator`,
commit `762eb91`, FINISHED in 9.5 min, free plan, no overage). The binary
contains:

- the module's subscriber, its log lines, the purge marker and the sentinel;
- `EXFetchCustomExtension`;
- `RNDateTimePicker`;
- bundle id `com.simplefit.boxing`.

The test setup:

- iOS 18.5 simulators;
- the disposable API (`simple_fit_sf70_e2e`), behind a local proxy that can
  drop one refresh answer or go offline, and never logs bodies or tokens;
- Metro from HEAD.

After every scenario, the app's `Library/Caches/com.simplefit.boxing` was
read byte for byte (`Cache.db`, WAL, `fsCachedData`), together with the
module's log lines and the app's Keychain item count.

| Scenario                                                                              | Result                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before upgrade (old build; 3 devices)                                                 | 5 to 15 cached API answers per device, including refresh or sign-in verify with `sfa_`/`sfr_`, emails and titles                                                     |
| Upgrade over an affected install (iPhone 14, 16 Plus)                                 | Session kept (Keychain item, refresh 200, no sign-in). Log: `purge purged` and `expo/fetch session without HTTP cache`. 0 API entries, 0 token, email or title bytes |
| Upgrade with a revoked session (13 mini)                                              | `purge purged`, refresh 401, Keychain item removed, cache empty                                                                                                      |
| Relaunch                                                                              | `purge alreadyDone`, provider used, refresh rotated (one more refresh-token row), cache empty                                                                        |
| Browse and 12 rapid tab switches; fighter and coach profile, roster and session reads | 0 entries                                                                                                                                                            |
| Lost refresh answer (dropped after commit)                                            | "You're offline" (no sign-out); Try again within 60 s, so the API recovered it (`recoveries` 0 → 1); 0 entries                                                       |
| Offline cold start, then back online                                                  | Retry restored the session; 0 entries                                                                                                                                |
| Invitation preview and acceptance (test fixture)                                      | Accepted with `fighter-coach-disclosure-test-1`, relationship active; 0 entries                                                                                      |
| Logout                                                                                | `204`, Keychain item removed, 0 entries                                                                                                                              |
| Email sign-in and account switch (Eli → Dana, 2 devices)                              | Verify 200 not cached, no email bytes, Keychain 1                                                                                                                    |
| Revoked session (`logout` revocation in the DB)                                       | Refresh 401, Keychain item removed, 0 entries                                                                                                                        |

Every launch logged the provider line, so `expo/fetch` never fell back to the
default disk-caching session. Even with the API's route-wide `no-store` live,
the old build still cached refresh answers through the dev inspector; the new
build cached nothing.

## D2 verification

These are the real `UIDatePicker`s (inline calendar and spinner) in EAS build
`9d7292f8`, driven through XCUITest. `starts_at` was read on the wire (proxy)
and in the DB.

| Case                                         | Result                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Native pickers open (375 and 430 pt)         | Inline calendar with yesterday as the earliest day, wheels for hour, minute and AM/PM; accessibility audit clean |
| Normal date, Fri 23 Oct                      | Wheels 6:06 PM → `2026-10-23T18:06:00+02:00`, DB 16:06 UTC                                                       |
| Autumn repeated hour, Sun 25 Oct 2:30 AM     | "This time happens twice" with "First · UTC+02:00" and "Second · UTC+01:00"; Second → `+01:00`, DB 01:30 UTC     |
| Spring skipped hour, Sun 28 Mar 2027 2:30 AM | "This time doesn't exist" notice; Assign disabled and no request sent; 3:30 AM → `+02:00`, DB 01:30 UTC          |
| Edit an existing session                     | 6:15 PM via the wheel and Save changes → `PATCH`, same row, DB 16:15 UTC, no duplicate                           |
| Cancel or dismiss                            | Backdrop dismissal keeps the form's date and time; Done changes only the form; nothing is written until Save     |
| Display after save and cold restart          | Coach and fighter lists (two devices) show 6:15 PM, 2:30 AM and 3:30 AM Europe/Warsaw                            |

The SF-62/SF-63 time-zone rules are unchanged.

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
| Native date/time picker          | VERIFIED (D2)                                                                                                                                                                           |
| Android                          | NOT VERIFIED (no SDK installed)                                                                                                                                                         |
| VoiceOver / TalkBack, manual     | NOT VERIFIED                                                                                                                                                                            |
| Light theme                      | Web PASS. Mobile is dark-first by design (SF-69 audit)                                                                                                                                  |
| SF-75 refresh race               | Real-API race suite PASS                                                                                                                                                                |

## Why Public is NO-GO

1. **No approved legal text.** The coaching gate cannot be enabled until counsel
   approves the disclosure and data-rules texts. Every gate-on result here used
   test fixtures.
2. **Gaps in native verification.** Android and manual VoiceOver/TalkBack are
   not verified. D10 (no toast feedback on iOS) is open.
