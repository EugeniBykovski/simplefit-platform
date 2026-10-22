# SF-78 final review and follow-up defects

Date: 2026-10-22. Branch `SF-78-verified-email-identity-linking-web`, base
`main` `1d0f631` (SF-77 merged). API for the real journeys: `simplefit-api`
`main` `9b152c1` on the disposable database `simple_fit_sf78_e2e`.

## Review results

| #   | Check                                                              | Result    | Evidence                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The Google/Apple-only user stays the same user                     | Confirmed | Real API, 5 browser projects: the linked address is owned by the signed-in user's id, identities `email,google` / `apple,email`, user count unchanged (Journeys 1, 2, 8)                                                                                                                                                               |
| 2   | SF-60 continuation preserved; no token in the linking flow         | Confirmed | The flow has no access to the token (no import of `pending-coach-invitation`); requests to `/api/v1/me/email-identities/*` never carry it and SF-57 requests never carry the code (unit, production and real-API assertions); the token stays in the SF-60 tab store until a final outcome                                             |
| 3   | Invitation expired, cancelled or consumed during verification      | Confirmed | Journey 8 (real API, 5 projects × 3 variants): linking succeeds, the review comes back unticked, the explicit accept is answered `410` by the backend, the page shows "This invitation isn't available", the invitation keeps the state the backend gave it, no relationship, token dropped                                            |
| 4   | Session change and account switch clear challenge and continuation | Confirmed | Journey 5: a logout in another tab ends the flow, the token is gone from storage, another account signing in to the tab sees no invitation and no flow, and neither a new session of the same user nor another user can complete the old challenge (`code_expired`); unit tests: a session boundary resets the flow and drops the code |
| 7   | SF-78 Playwright tests in Chromium, Firefox, WebKit                | Pass      | Production and Storybook specs: 105/105 (Chromium, `sf78-firefox`, `sf78-webkit`), twice; real API: 50/50 sharing on and 5/5 sharing off in Chromium 1440, Firefox 1280, WebKit 1920, mobile Chromium 412, mobile WebKit 390                                                                                                           |

## Follow-up defects (pre-existing; not caused by SF-78)

None of these is suppressed: the tests that expose them keep failing until
they are fixed.

### FD-1 · `/favicon.ico` (any root path with an extension) answers 500

- **Severity:** P3 (Medium). Every browser requests `/favicon.ico`; each
  request is a 500 and three error log lines.
- **Route:** `/favicon.ico`, `/robots.txt` and any `/<name>.<ext>` outside
  `/_next` and `/api`, on the production server (`next start`).
- **Exists on main:** yes, reproduced on a clean `main` `1d0f631` build.
- **Caused by SF-78:** no. SF-78 does not touch `src/app`,
  `src/proxy.ts` or `src/shared/i18n/request.ts`; the last change to
  `request.ts` is SF-11 (`3aaa2c5`).
- **Reproduce:**

  ```bash
  pnpm build
  NODE_OPTIONS=--enable-source-maps pnpm exec next start -p 3100
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/favicon.ico   # 500
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/robots.txt    # 500
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/xx/whatever   # 307 (no extension: fine)
  ```

- **Stack trace (source-mapped, complete as printed by the server):**

  ```text
  Error: Page changed from static to dynamic at runtime /favicon.ico, reason: headers
  see more here https://nextjs.org/docs/messages/app-static-to-dynamic-error
      at q (src/shared/i18n/request.ts:8:42)
  ⨯ Error: Page changed from static to dynamic at runtime /favicon.ico, reason: headers
  see more here https://nextjs.org/docs/messages/app-static-to-dynamic-error
      at q (src/shared/i18n/request.ts:8:42)
  ⨯ Error: Page changed from static to dynamic at runtime /favicon.ico, reason: headers
  see more here https://nextjs.org/docs/messages/app-static-to-dynamic-error
      at q (src/shared/i18n/request.ts:8:42)
  ```

  Without source maps the frame is
  `at C (.next/server/chunks/ssr/0yc1_next_dist_1mjglm5._.js:140:3605)`.
  The same three lines repeat per request.

- **Cause:** the app ships no favicon. The proxy matcher skips paths with
  an extension (`/((?!api|_next|_vercel|.*\..*).*)`), so the request reaches
  the App Router, which matches the statically generated `[locale]` segment
  with `locale = "favicon.ico"`. In `getRequestConfig`, `await requestLocale`
  (`request.ts:8`) then falls back to reading the request headers, which a
  static route may not do at runtime.
- **Suggested fix (separate ticket):** add the brand favicon/icon files
  (`src/app/icon.*`, `favicon.ico`) and make unknown locale segments
  `notFound()` before any request API is read.

### FD-2 · Light theme: the "Boxing" part of the brand wordmark has 2.7:1 contrast

- **Severity:** Low to Medium, needs a design decision. axe reports
  `color-contrast` (impact _serious_): `#8d9840` (olive 500,
  `--primary-muted`) on `#edefe7`, 14 px regular, 2.7:1 (4.5:1 required).
  WCAG 1.4.3 exempts logotype text, so this may be accepted as a brand
  lockup, but it then needs to be marked and excluded explicitly, not
  silently.
- **Route / component:** every page with the brand lockup in light theme;
  measured on `/en/invite/coach` (`web.minimal` header). Component
  `src/shared/ui/brand-mark.tsx` ("SimpleFit Boxing" with the sport in olive
  500).
- **Dark theme:** passes.
- **Reproduce:** set `localStorage["simplefit-theme"] = "light"` before load
  (or the theme switcher), open `/en/invite/coach`, wait for transitions to
  finish, run axe `color-contrast`: one node, `<span class="text-primary-muted"> Boxing</span>`.
- **Exists on main:** yes (unchanged component and tokens).

### FD-3 · WC7 "Ended" view: axe contrast failure during the segment transition

- **Severity:** Low. The settled screen passes; the failure is a 150 ms
  colour transition, and the production spec measures inside it.
- **Route / component:** `/en/app/coach/fighters?view=ended`, the
  Active / Ended segmented control (`Button` variant `ghost`, size `sm`,
  `rounded-full`), right after clicking "Ended".
- **Measured:** immediately after the click, the "Active" button reads 2.0:1
  (`#7f8479` on `#515450`, a colour between its selected and ghost states);
  after `document.getAnimations()` finish and on a direct load of
  `?view=ended`, 0 violations.
- **Test:** `e2e/production/coach-fighters.spec.ts:234` ("Ended is the query
  view…") fails deterministically on `main` `1d0f631` and on this branch
  (`color-contrast (1–2)`).
- **Cause:** the `Button` primitive's `transition-colors` also runs under
  `prefers-reduced-motion: reduce`, and the spec audits before it ends.
- **Suggested fix (separate ticket):** wait for animations before the
  audit in that spec, and consider `motion-reduce:transition-none` in the
  primitive. SF-78 fixed the same pattern in its own flow by keying the
  buttons that replace each other.

### Not a defect: SF-60 "Decline" outline button in light theme

The 4.12:1 reading reported during SF-78 came from switching the theme
class on a rendered page, which started a colour transition. With the
light theme set before load and transitions settled, `/en/invite/coach`
has no contrast violation on that button. Recorded here so it is not
re-reported.
