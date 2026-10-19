# Investigation: session revoked by a page load during a session restore

**Status: RESOLVED in SF-75 (2026-10-19)** by a backend lost-response
recovery (simplefit-api ADR 0010, "Lost-response recovery (SF-75)", and
`docs/architecture/proposals/SF-75-refresh-lost-response-recovery.md`, which
holds the threat model). Found during SF-54 (2026-10-14). Owner area: SF-28
session lifecycle (web) and ADR 0010 (simplefit-api). Not introduced by
SF-54: it reproduced identically on clean `main` (`a77c604`).

## Resolution (SF-75)

- **Fix:** the API recovers a lost response. A consumed refresh token
  presented again while none of its children was ever presented (so nothing
  proves the answer arrived) is accepted within 60 s and at most 10 times; it
  supersedes the unused child. Any other consumed token is still reuse and
  revokes the session; two holders of one token always collide on the next
  refresh. No client protocol change: the SF-28 coordinator stays the only
  refresh manager; the refresh deliberately has no `keepalive`.
- **Reproduction, 2026-10-19:** production build, real Phoenix and
  PostgreSQL, and a proxy holding the refresh answer after the commit (no
  Playwright interception). Before the fix, the after-commit navigation, the
  Coach Home reload and the invitation-page reload revoked the session in
  Chromium, Firefox and WebKit; Back/Forward (Chromium) and ten rapid reloads
  (WebKit) did so without the proxy. After the fix, none did.
- **Why the old spec "passed" in WebKit:** it held the answer with
  `route.fetch()`, whose response cookies some engines store before the hold;
  that was not a lost response. The spec now uses a real proxy and asserts
  that the API recorded a recovery.

## Summary

A full page load (reload, typed URL, `location` navigation, browser
Back/Forward without bfcache) that starts while the previous document's
session restore is in flight can end the person's session: the API revokes
it for `refresh_reuse`, every tab and device using that session is signed
out, and the person lands on sign-in.

## Minimal reproduction

Committed as `e2e/real-api/session-navigation-race.spec.ts` (real API and
PostgreSQL, `pnpm test:e2e:real-api`; marked as an expected failure where it
reproduces):

1. Sign in (any method) and open any signed-in page.
2. Start a full page load (`page.goto`), which begins the session restore:
   `POST /api/auth/session/refresh` with the refresh cookie.
3. The request reaches the API, which rotates the token and answers with a
   new cookie, but the answer has not been received when
4. a second full page load starts.
5. The second page restores the session with the old cookie: the API treats
   it as reuse and revokes the session. The page lands on `/login`.

Deterministic form: the first refresh's response is held for 1.5 s by the
test (the server has already rotated), as a slow network would.

Natural form (no interception, investigation script): back-to-back
`page.goto` calls 10–150 ms apart.

| Browser (Playwright) | Deterministic | Natural (first loss in 15 tries)      |
| -------------------- | ------------- | ------------------------------------- |
| Chromium 1440        | revoked       | 1st                                   |
| Mobile Chromium 412  | revoked       | 1st                                   |
| WebKit 1920          | revoked       | 7th                                   |
| Mobile WebKit 390    | revoked       | 7th                                   |
| Firefox 1280         | not revoked   | 11th on `main`; none in one SF-54 run |

Results on clean `main` and on the SF-54 branch were the same (Firefox's
natural loss is timing-dependent). Each loss was a `refresh_reuse`
revocation in `sessions`.

## Browser and session conditions

- Web transport (ADR 0010): the access token lives only in memory, so every
  full page load restores the session by spending the refresh cookie.
- The refresh cookie is `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`,
  single use, with **no grace period**: presenting a consumed token revokes
  the session (ADR 0010, "Reuse").
- Client-side navigation inside the app (Next.js `router.push`, the SF-54
  context switcher) does not restore the session and is not affected.

## Cookie and access-token lifecycle in the race

1. Document A: `restoreSession()` → `refresh()` takes the Web Lock
   `simplefit.session.refresh` and sends the refresh with cookie R1.
2. The API consumes R1, issues R2 and answers `Set-Cookie: R2`.
3. Document A is unloaded before that answer is processed. The browser
   cancels the request; the `Set-Cookie: R2` is never applied, so the cookie
   jar still holds R1 (already consumed on the server).
4. Document B: `refresh()` sends R1 → reuse → the session (and R2) is
   revoked → 401 → `expire()` → sign-in.

The access token of document A dies with it (memory only); that is by
design and harmless.

## Web Lock and BroadcastChannel coordination

- The Web Lock serializes refreshes **between live documents** of the origin.
  A lock is released when its document is destroyed, while the HTTP request
  it guarded may still be in flight or already committed on the server. The
  next document acquires the lock immediately. The lock cannot cover the
  unload gap.
- The BroadcastChannel shares new credentials between live tabs. Document A
  never receives R2's answer, so it never broadcasts; document B has nobody
  to learn from.
- In-tab coalescing (`refreshing ??=`) is per document and does not apply.

## Concurrent refresh handling

Within one live document and across live tabs, refreshes are correctly
serialized and coalesced (covered by `session.test.ts`). The defect is only
the cross-document case where one document is unloading, which neither the
lock nor the channel can see. The server behaves exactly as ADR 0010
specifies.

## Does SF-54 change its likelihood?

No session, lock, channel, cookie or refresh code changed in SF-54
(`git diff main -- src/entities/session src/shared/lib/cross-tab.ts` is
empty). The context switcher and WCX1 navigate client-side and never start a
restore. SF-54's real-API journey first hit the race because it introduced
two consecutive `page.goto` calls in a test; that test now lets each page
settle as a person would, and this dedicated reproduction asserts the
defect instead.

## Proposed fix (outside SF-54)

The race cannot be closed on the web alone: the client cannot learn R2 once
the response is lost, and any refresh with R1 is reuse by policy.

**Web + Backend (recommended), with an ADR 0010 amendment:**

1. **Backend — bounded idempotent re-delivery.** When the presented token is
   the session's immediate predecessor (consumed), its successor has never
   been used, and the consumption is within a short window (for example
   10–30 s), rotate again from it instead of revoking: revoke the unused
   successor, issue a new successor, keep one live token per session. Any
   other reuse (an older token, a successor already used, outside the
   window) still revokes the session. This keeps theft detection for every
   case where an attacker and the owner both use the family.
2. **Web — `keepalive: true` on the refresh request**, so a response that
   arrives after unload still applies its cookie (shrinks the window), and
   keep the restore under the existing lock.
3. Security review of the window, and audit logging of re-deliveries
   (`refresh_redelivered`) to observe frequency.

A web-only alternative (persisting the access token in storage, or a shared
worker owning the refresh) conflicts with the access token-in-memory policy
of ADR 0010 / SF-22 and needs its own decision.

## Regression-test strategy

- Web, real API: `e2e/real-api/session-navigation-race.spec.ts` (expected
  failure until the fix; the marker is removed with it), plus a natural loop
  of rapid full loads across Chromium, Firefox, WebKit and mobile projects.
- Backend: ExUnit cases for the window (predecessor within the window
  re-delivers; an older token, a used successor, or after the window
  revokes; concurrent presentations of the predecessor keep one live token).
- Web unit: the refresh request carries `keepalive`; lock and coalescing
  tests stay as they are.

## Scope

Requires **Web + Backend** changes (and an ADR 0010 amendment). Recorded as
a release blocker until triaged; not fixed in SF-54.
