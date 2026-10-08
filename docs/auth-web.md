# Web authentication screens (SF-36)

The production web authentication set against Claude Design **V78**
(`1791448557-b0b9`, the latest published version when SF-36 was built),
onboarding page, section **5b · Web route · sign up & sign in (all roles)**.
Every artboard of the section is accounted for below; none is omitted.

## Inventory

| Artboard                       | Structured source                                                     | Route                     | Production                                        | States (design → production)                                                                                      | Status                                      | Verified by                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Route · Sign up & sign in      | `RouteAuth.dc.html`                                                   | —                         | the route map itself (`docs/route-registry.json`) | —                                                                                                                 | reference                                   | —                                                                                                                                   |
| O02w · Sign up · choose role   | `WebSignUp.dc.html`                                                   | `/signup`                 | `SignupScreen` in `SiteFrame`                     | default; provider rows (Google GSI, Apple, email)                                                                 | implemented                                 | `auth-pages.test.tsx`, `auth-geometry.spec.ts`, `production/web-responsive.spec.ts`                                                 |
| WA3 · Create account           | `WebRegAccount.dc.html`                                               | `/signup/account`         | `SignupAccountScreen` in `AuthStepFrame`          | default; journey intent; request errors (invalid email, rate limited, generic)                                    | implemented                                 | `auth-pages.test.tsx`, `email-auth.test.tsx`, `auth-geometry.spec.ts`, `production/auth-routes.spec.ts`                             |
| WA4 · Verify email             | `WebRegVerify.dc.html`                                                | `/signup/verify`          | `SignupVerifyScreen` (`RegistrationCodeStep`)     | typing, resent, invalid, expired, submitting, verified, verified-elsewhere, throttled; plus network error (retry) | implemented                                 | `email-auth.test.tsx`, `screens/authentication/email-code.stories.tsx`, `auth-geometry.spec.ts`, `production/auth-routes.spec.ts`   |
| WA1 · Sign in                  | `WebLogin.dc.html`                                                    | `/login`                  | `LoginScreen` in `AuthSplitFrame`                 | default; email request errors                                                                                     | implemented                                 | `auth-pages.test.tsx`, `auth-geometry.spec.ts`, `production/web-responsive.spec.ts`                                                 |
| WA2 · Choose workspace         | `WebLoginWorkspace.dc.html`                                           | — (a step of `/login`)    | **not rendered**                                  | —                                                                                                                 | deferred: no backend workspace data         | `D-WEB-WORKSPACE-SWITCHER`                                                                                                          |
| WA1b · Sign-in code            | `WebSignInCode.dc.html`                                               | `/login/code`             | `LoginCodeScreen` (`SignInCodeStep`)              | sent, typing, resent, invalid, expired, submitting, success, throttled, error                                     | implemented                                 | `email-auth.test.tsx`, `screens/authentication/email-code.stories.tsx`, `auth-geometry.spec.ts`, `production/auth-routes.spec.ts`   |
| WA4b · Email verified          | `WebEmailVerified.dc.html`                                            | `/verify-email`           | `VerifyEmailScreen` in `AuthMinimalFrame`         | verified, already, expired; plus verifying, network error, missing token                                          | implemented                                 | `email-auth.test.tsx`, `screens/authentication/verify-email.stories.tsx`, `auth-geometry.spec.ts`, `production/auth-routes.spec.ts` |
| WA5 · Account basics & consent | `WebAccountBasics.dc.html`                                            | `/app/onboarding/account` | SF-32 placeholder                                 | —                                                                                                                 | owned by the WA5 UI ticket on the SF-44 API | registry `web.app.onboarding.account`                                                                                               |
| WA6 · Choose where to start    | `WebRoleSelect.dc.html`                                               | `/app/onboarding/role`    | SF-32 placeholder                                 | —                                                                                                                 | owned by the WA6 UI ticket                  | registry `web.app.onboarding.role`                                                                                                  |
| Email code states sheet        | `AuthStatesWeb.dc.html`, `AuthCodeInput.dc.html` (design-system page) | —                         | `CodeInput`, `StatusNotice`, `ResendStatus`       | the shared 6-digit states                                                                                         | implemented                                 | `email-auth.test.tsx`, `components/code-input.stories.tsx`, `screens/authentication/email-code.stories.tsx`                         |

## Behaviour

- **One completion pipeline.** Google (SF-22), Apple (SF-23) and both email
  codes (SF-24) hand their session to `completeAuthentication`; the
  guest-only gate then asks the backend entry resolver (SF-45). Account
  registration (WA5) comes first when it is incomplete, then the destination.
  No provider implies a role; Google and Apple never default to Fighter.
- **Intent and returnTo** ride along as the continuation (`withContinuation`):
  navigation context, never authorization. WA3's role segments and identity
  chip show the O02w intent only; without one nothing is highlighted.
- **Consent** is recorded only by account registration after a User exists.
  WA3 keeps the artboard's full name and three consent checkboxes, disabled
  and unchecked; only the email address is sent (D-WA3-PREAUTH-CONSENT).
  O02w's legal line is V78's ("You'll review the Terms and Privacy Policy
  after sign-in").
- **WA2** is not rendered. It lists named workspaces (personal, a coaching
  business, a gym) that no backend provides; sign-in never redirects to it.
- **States** come from the API's error codes (`code_invalid`, `code_expired`,
  `rate_limited` with `Retry-After`, `verified_elsewhere`), never from
  messages; nothing in production simulates a verification or a resend.

- **Provider states** (Google and Apple: loading, ready / cancelled, pending,
  rejected, rate limited, unavailable, script failed, error) render in
  Storybook through the production presentation components
  (`GoogleSignInView`, `AppleSignInView`), with no script, credential or
  network call (`screens/authentication/provider-states.stories.tsx`, checked in
  `auth-geometry.spec.ts`). A cancelled popup returns the control to ready.
- **Navigation** (email registration and sign-in, Google, Apple, cancellation,
  expired and invalid codes, session restore, the protected-route redirect)
  is exercised end to end on the production build with deterministic provider
  and API mocks (`e2e/production/auth-navigation.spec.ts`).

## Approved differences from the artboards

1. **Google's official button** (Google Identity Services, at most 400 × 40)
   instead of the olive "Continue with Google": centred in the designed 52 px
   (WA1) / 54 px (O02w) slot, so the rows keep their positions.
2. **Screen codes** (W01, WC1, WG1, SPX4, E01 in labels, WA5/WF0 in the WA4
   aside) are internal to the design and not rendered.
3. **WA1's "You land in your last workspace" line** states a runtime fact the
   API cannot provide; its 24 px row is reserved so nothing moves.
4. **The E01 preview in WA4** masks the code ("Your code is ••• •••"), so the
   page never shows a code anyone could type.
5. **WA4b's verified body** says "Your email address" rather than the address:
   the link token does not reveal it to the page.
6. **WA3's full name and consent checkboxes** are disabled and unchecked (the
   design-system disabled style for the name, with "Added after you verify";
   the artboard's 22 px boxes for the consents): account registration (WA5)
   collects them after verifying.
7. **WA3, WA4 and WA1b's CTAs** are 52 px as drawn; WA1's are 52 / 50 px;
   O02w's methods are 54 px.

## Responsive behaviour

Desktop and laptop windows (from `desktop`, 1180 px) render each artboard's
composition, fluid in width (`docs/design-system.md`, "Responsive
composition"): WA1 / WA1b are a full-viewport 50 / 50 split whose rows are
anchored to the window (brand at the top, headline and card at the bottom,
form centred); WA3 / WA4 keep the step column on the 64 px gutter beside the
fixed 420 px aside; WA4b centres its 560 px result in `main`. At 1280 × 720 to
1920 × 1080 nothing is clipped and nothing scrolls
(`e2e/production/auth-routes.spec.ts`, `web-responsive.spec.ts`).

## Current end-to-end limitation

Authentication completes and the entry resolver routes correctly (verified
by `e2e/production/auth-navigation.spec.ts`), but the destinations are still
SF-32 placeholders: a new account lands on **Account basics (WA5)** with no
form, so it cannot complete account registration and never reaches a role
journey or the application. The onboarding frame keeps **Sign out** and the
brand link to the public site, so the visitor is never trapped. WA6 (choose
where to start) and the Coach, Gym and Fighter onboarding entries are
placeholders too; WA5 and WA6 are built by their own UI tickets.

A signed-out visitor sent from an onboarding route to `/login` keeps the
journey: onboarding routes are never a `returnTo`, but `RequireSession`
carries the URL's validated `intent`, or the journey the route itself
represents (`journeyIntentOf`: Fighter, Coach and Gym onboarding), so
`/app/onboarding/fighter?step=basics` signs in at `/login?intent=fighter` and
the resolver receives `intent=fighter`. Account registration and role
selection represent no journey; an invalid intent is dropped.
