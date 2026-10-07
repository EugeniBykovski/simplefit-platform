# Route architecture and route registry

The canonical application route architecture of SimpleFit Boxing (SF-31).
**This file is shared and kept identical** in `simplefit-platform` and
`simplefit-mobile`, together with `docs/route-registry.json`, its
machine-readable registry. Change both only through an SF ticket that updates
both repositories. The tests in `scripts/route-registry.test.*` fail when the
registry is malformed or when a repository's router drifts from it.

- [1. Source-of-truth hierarchy](#1-source-of-truth-hierarchy)
- [2. Canonical route model](#2-canonical-route-model)
- [3. Route ownership](#3-route-ownership)
- [4. Path conventions](#4-path-conventions)
- [5. Dynamic parameters](#5-dynamic-parameters)
- [6. Access classification](#6-access-classification)
- [7. Roles and workspaces](#7-roles-and-workspaces)
- [8. Layout and shell hierarchy](#8-layout-and-shell-hierarchy)
- [9. Guard and redirect semantics](#9-guard-and-redirect-semantics)
- [10. Implementation status](#10-implementation-status)
- [11. Web mapping (Next.js)](#11-web-mapping-nextjs)
- [12. Mobile mapping (Expo Router)](#12-mobile-mapping-expo-router)
- [13. Backend and API relationship](#13-backend-and-api-relationship)
- [14. How tickets consume the registry](#14-how-tickets-consume-the-registry)
- [15. Reconciling Claude Design route changes](#15-reconciling-claude-design-route-changes)
- [16. Discrepancies and decisions](#16-discrepancies-and-decisions)
- [17. Design gaps](#17-design-gaps)

## 1. Source-of-truth hierarchy

| Layer                                                            | Authoritative for                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Design Route Gallery** (product IA)                     | Which screens and routes exist, path intent, platform and surface, hierarchy, navigation, the represented backend surface, access intent |
| **`docs/route-registry.json`** (this contract)                   | The implementation contract derived from the gallery: normalized paths, ids, shells, access, status, discrepancies                       |
| **Individual product artboards**                                 | How a screen looks: layout, states, interactions, copy (`docs/design-handoff.md`)                                                        |
| **Backend OpenAPI** (`simplefit-api/openapi/simplefit.api.json`) | The API contract. The registry's `api` list is design inventory, never the contract                                                      |

The Route Gallery is the three artboards on the `pitch-business` page of the
canonical artifact (https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY):

| Registry id | Artboard                | Title                                                 | Rows |
| ----------- | ----------------------- | ----------------------------------------------------- | ---- |
| `gallery-1` | `GalleryIndex.dc.html`  | route gallery 1 / 3 · onboarding & fighter mobile     | 239  |
| `gallery-2` | `GalleryIndex2.dc.html` | route gallery 2 / 3 · coach & gym mobile, web app     | 122  |
| `gallery-3` | `GalleryIndex4.dc.html` | route gallery 3 / 3 · partners, admin, site & backend | 118  |

Rules:

- **The registry never competes with the design.** It does not add, rename or
  remove product routes. Every product route traces to gallery rows
  (`screens[].design`). Where the gallery is ambiguous, the registry keeps the
  gallery's path and records a discrepancy (§16) instead of redesigning the IA.
- **The registry is not a visual source.** To build a screen, follow the route
  to its screen and read the exact artboard (§14).
- Older route-map boards (`Route*.dc.html`, `Flow*.dc.html`) and the spec
  gallery (`GalleryIndex3.dc.html`) are cross-checks. Where a route-map board
  disagrees with the Route Gallery, the gallery wins (`D-ROUTE-MAP-BOARDS`).
- The registry was derived from artifact version `1791271288-f2e9` and
  reconciled with `1791276973-ad1d`, the route-gap design pass that added 11
  Route Gallery rows, then with `1791311129-8fec` (SF-33), which added 5 rows:
  the SF-21 email sign-in code (mobile O01c and web WA1b, `/login/code`), the
  staff-invite email confirmation (OS1b, `/invite/staff/:token/confirm`), the
  web email-verification link landing (WA4b, `/verify-email`) and the E17
  sign-in code email (`source.version`).

## 2. Canonical route model

One shared specification, read by both clients. Each platform implements only
its own entries; the backend list is inventory.

```
route-registry.json
├── source          artifact, version and the three gallery artboards
├── capabilities    FIGHTER, COACH, GYM_WORKSPACE, SPONSOR_WORKSPACE, ADMIN: what grants them, home and onboarding route per platform
├── guards          sign-in, workspace chooser/switcher, restricted-account, not-found and entry routes; the returnTo parameter
├── shells          layouts (web + mobile), their nav component artboards and every nav item's target
├── routes          one entry per (platform, canonical path): what a router needs
├── screens         one entry per Route Gallery screen row: a state of a route
├── excludedRows    gallery rows deliberately not used, each with the decision that dropped it
├── api             backend endpoints: proposed design inventory + existing operational routes
├── outputs         server-rendered outputs: email previews (E01–E16), share images
├── designGaps      designed intent with no Route Gallery row yet (never a route)
└── discrepancies   every gallery/design/production mismatch, with its decision
```

**Routes vs screens.** The gallery lists 474 rows, but many are states of one
route: `/onboarding/fighter?step=goals`, `/checkout?state=failed`,
`/home?state=first-run`. A **route** is what a router matches: a platform plus
a path without query. A **screen** is one gallery row: a route plus its query,
hash and states, linked to its artboard. Routers are built from routes;
screens are built from artboards. Every row is either a screen, an API entry,
an output or an `excludedRows` entry; the tests check the total.

### Route fields

| Field           | Meaning                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | Stable id, `<platform>.<segments>`; a parameter becomes `_kebab-name` (`web.app.gym.members._member-id`). **Frozen** once published: if a path changes later, the id stays. |
| `platform`      | `web` or `mobile`                                                                                                                                                           |
| `path`          | Canonical product path (§4)                                                                                                                                                 |
| `params`        | Parameter names in path order                                                                                                                                               |
| `name`          | Human name                                                                                                                                                                  |
| `surface`       | Product area (§3)                                                                                                                                                           |
| `shell`         | Layout the route renders in (§8)                                                                                                                                            |
| `parent`        | Nearest ancestor route by path, same platform, or `null`                                                                                                                    |
| `nav`           | `type` (§8) and `from`: the nav component items (`<shell>#<item>`) that link to it                                                                                          |
| `redirect`      | Only on `REDIRECT` routes: `to` (route id of the same platform) and `permanent`                                                                                             |
| `access`        | `session`, `capability`, `phase`, optional `restrictedAccount` (§6)                                                                                                         |
| `status`        | `IMPLEMENTED`, `PLACEHOLDER_REQUIRED` or `DEFERRED` (§10)                                                                                                                   |
| `discrepancies` | Ids of the §16 entries that affect the route                                                                                                                                |
| `production`    | For implemented routes: the router file and a note                                                                                                                          |
| `screens`       | Screen ids rendered by the route                                                                                                                                            |

### Screen fields

| Field                     | Meaning                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                      | The design screen code (`A01`, `WG14`). Uncoded gallery rows get `x-<platform>-<slug>` (`x-mobile-friends`)                    |
| `code`                    | Screen code or `null`                                                                                                          |
| `route`                   | Route id                                                                                                                       |
| `query`, `hash`, `states` | The row's query (`step`, `state`, `modal`, `tab`, …), fragment and listed states                                               |
| `condition`               | Session condition that selects the screen instead of a query (`NO_SESSION` for QA1)                                            |
| `design`                  | `gallery`, canvas `page`, `section`, `step`, platform `tag`, `artboard`; `galleryPath`/`pathNote` when the path was normalized |

## 3. Route ownership

One web frontend monolith (`simplefit-platform`) serves the public site,
`/app`, account-level pages (`/account`), the partner portal (`/sponsor`) and
admin (`/admin`). The native app
(`simplefit-mobile`) is a separate client. Both call the Phoenix API
(`simplefit-api`, `/api/v1`).

| Platform | Surface      | Owns                                                                                                                                      | Routes |
| -------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| web      | `SITE`       | Public website: landing, audience pages, pricing, white label                                                                             |      8 |
| web      | `AUTH`       | Sign in / sign up, sign-in code, email verification link, sponsor and admin sign-in                                                       |      8 |
| web      | `ONBOARDING` | Fighter, coach, gym registration (`/app/onboarding/*`), sponsor application (`/partners*`)                                                |      5 |
| web      | `FIGHTER`    | Fighter web (`/app/home`, `/app/board`, …)                                                                                                |      8 |
| web      | `COACH`      | Coach web (`/app/coach/*`)                                                                                                                |     14 |
| web      | `GYM`        | Gym web console (`/app/gym/*`)                                                                                                            |     34 |
| web      | `SHARED`     | Account-level pages: `/app` billing, checkout, payments, settings, marketplace, calendar, messages; `/account/*` restricted-account pages |     15 |
| web      | `SPONSOR`    | Partner portal (`/sponsor/*`)                                                                                                             |      8 |
| web      | `ADMIN`      | Internal admin (`/admin/*`)                                                                                                               |     39 |
| web      | `SYSTEM`     | `/app` entry, catch-all not found                                                                                                         |      2 |
| mobile   | `AUTH`       | Welcome, sign in / up, sign-in code, consent, role choice, invites and invite email confirmation                                          |     13 |
| mobile   | `ONBOARDING` | Registration wizards, staff onboarding, first-run intros                                                                                  |      8 |
| mobile   | `FIGHTER`    | Fighter app                                                                                                                               |     56 |
| mobile   | `COACH`      | Coach app                                                                                                                                 |     20 |
| mobile   | `GYM`        | Gym cockpit                                                                                                                               |      9 |
| mobile   | `SHARED`     | Settings, account lifecycle, billing, checkout, messages, notifications, search, workspaces                                               |     31 |
| mobile   | `SYSTEM`     | Launch entry, not found                                                                                                                   |      2 |
| both     | `INTERNAL`   | Developer-only routes outside the design (`/dev/design-system`, mobile `/app` placeholder)                                                |      3 |

The backend (`api`, `outputs`) is a separate inventory with its own model
(§13), not forced into the UI router model.

## 4. Path conventions

- **Platform-relative.** Web paths exclude the locale: canonical `/app/home`
  is served as `/<locale>/app/home` (`localePrefix: "always"`). Mobile paths
  are Expo Router paths (deep link `simplefit://<path>`). The same path on two
  platforms is two routes (`web.login`, `mobile.login`).
- Lower-case kebab-case literal segments, no trailing slash, no query or
  fragment in `path`. `/` is the root; `/*` is the catch-all.
- **Query and fragment are screen state**, never part of a route: `?step=`
  (wizard step), `?state=` (screen state), `?modal=` / `?sheet=` / `?panel=`
  (overlay on the route), `?tab=`, `?mode=`, `?tour=` / `?tip=` /
  `?milestone=` (first-run overlays), `?from=` / `?product=` / `?role=` /
  `?device=` (context). They are recorded on the screen.
- `?device=mobile|desktop` in the gallery only names the artboard variant; it
  is never implemented as a query parameter.
- **Resource state is never in the URL.** Where the gallery used `?state=` for
  a resource's lifecycle or relationship (shared session invited/joined/
  completed, a profile's friend/private/blocked view, admin review/approved),
  the backend decides the state and the screen renders it; the gallery form is
  kept in `design.galleryPath`. Screen-level UI states (`?state=loading`,
  `?state=first-run`, wizard `?step=`) stay query state.
- Special gallery forms: `(cold start) → /home` is the mobile root route
  (`mobile.root`), `/app (first load)` is the web entry (`web.app`), and both
  `/* → …` rows are the catch-all routes.

## 5. Dynamic parameters

- Canonical syntax: `:camelCaseName`, named after the resource it identifies
  (`/gyms/:gymId`, `/app/gym/members/:memberId`). Never a bare `:id`
  (`D-PATH-PARAM-NAMES`).
- A gallery path with sample data keeps its literal segments and replaces only
  the sample (`/activity/8812` → `/activity/:activityId`); the screen keeps the
  original in `design.galleryPath` (`D-PATH-EXAMPLES`).
- Parameters are opaque identifiers chosen by the backend. Clients never parse
  them, and static segments always win over parameters at the same level.
- Framework syntax is derived, never canonical:

| Canonical              | Next.js (`src/app/[locale]/…`)  | Expo Router (`src/app/…`)      |
| ---------------------- | ------------------------------- | ------------------------------ |
| `/gyms`                | `gyms/page.tsx`                 | `gyms.tsx` or `gyms/index.tsx` |
| `/gyms/:gymId`         | `gyms/[gymId]/page.tsx`         | `gyms/[gymId].tsx`             |
| `/gyms/:gymId/members` | `gyms/[gymId]/members/page.tsx` | `gyms/[gymId]/members.tsx`     |
| `/*`                   | `[...rest]/page.tsx`            | `+not-found.tsx`               |

## 6. Access classification

Access is a composition, not one enum, because a person can hold several
roles:

| Field               | Values                                                                    | Meaning                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`           | `PUBLIC`, `GUEST_ONLY`, `AUTHENTICATED`                                   | Anyone; signed-out only (signed-in users are redirected); signed-in only                                                                                                        |
| `capability`        | `null`, `FIGHTER`, `COACH`, `GYM_WORKSPACE`, `SPONSOR_WORKSPACE`, `ADMIN` | What the user must hold. `null` = any signed-in user (account level)                                                                                                            |
| `phase`             | `null`, `ONBOARDING`, `ACTIVE`                                            | `ONBOARDING`: the route belongs to setting the capability (or, with `capability: null`, the account) up and is offered only until it completes. `ACTIVE`: requires it completed |
| `restrictedAccount` | `true` (optional)                                                         | Reachable while the account is suspended or pending deletion                                                                                                                    |

How the ticket's classifications map:

| Classification                   | Registry form                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| PUBLIC                           | `session: PUBLIC`                                                                      |
| GUEST_ONLY                       | `session: GUEST_ONLY`                                                                  |
| AUTHENTICATED                    | `session: AUTHENTICATED, capability: null`                                             |
| ONBOARDING_REQUIRED              | `phase: ONBOARDING` (with or without a capability)                                     |
| FIGHTER, COACH                   | `capability: FIGHTER` / `COACH`, `phase: ACTIVE`                                       |
| GYM_WORKSPACE, SPONSOR_WORKSPACE | `capability: GYM_WORKSPACE` / `SPONSOR_WORKSPACE`, plus the active-workspace rule (§7) |
| ADMIN                            | `capability: ADMIN`                                                                    |

Frontend access checks are **UX only**: they decide what to render and where
to redirect. The backend authorizes every API call and every resource. A route
being reachable never implies its data is.

## 7. Roles and workspaces

```
User
├── Identities             (passkey, email, Google, Apple)
├── FighterProfile         → FIGHTER
├── CoachProfile           → COACH
└── WorkspaceMembership
    ├── Gym                → GYM_WORKSPACE (owner, staff, front desk: backend-authorized roles)
    └── Sponsor            → SPONSOR_WORKSPACE
Backend-granted internal staff capability on the same User → ADMIN (D-ADMIN-IDENTITY)
```

- No `User.type` or `User.role`. A user holds any combination of capabilities;
  `capabilities` in the registry lists what grants each one and its home and
  onboarding routes.
- **Active workspace.** Workspace paths carry no workspace id
  (`/app/gym/members`, `/gym/pulse`), so the active workspace is session
  context held by the backend session. It is chosen at sign-in
  (`/login?step=workspace` on web), then switched with the in-shell switcher
  of the web sidebars (an action, no route) or `/workspaces` on mobile. A
  resource that belongs to another workspace resolves as not found. Workspace
  ids may enter deep links later, only when an email or push feature needs
  cross-workspace links (`D-WORKSPACE-NOT-IN-URL`,
  `D-WEB-WORKSPACE-SWITCHER`).
- **Admin** is a backend-granted internal-staff capability on the same global
  User; there is no separate admin user (`D-ADMIN-IDENTITY`). `/admin/login`
  stays `GUEST_ONLY`: it is an authentication entry surface. The future admin
  flow serves both an unauthenticated user (admin sign-in → capability check →
  step-up when required → admin) and an already authenticated user (admin
  entry → capability check → step-up when required → admin). Those step-up and
  re-entry semantics, hardware-key (WebAuthn) step-up and scoped admin sessions
  are owned by the authentication/security implementation; no access class is
  added for them.
- **Sponsor and admin on mobile**: no mobile surfaces. Sponsor workspaces may
  appear in `/workspaces` with a "continue on the web" action
  (`D-MOBILE-SPONSOR-ADMIN`).
- Finer gym roles (owner-only pages such as plan or danger zone) are enforced
  by the backend. The route-level requirement is the membership; the UI may
  hide what the backend denies.
- Account-level routes (settings, billing, checkout, calendar, messages, notifications, `/account/*`)
  need no capability (`D-SHARED-ROUTES-ON-PERSONA-PAGES`).

## 8. Layout and shell hierarchy

```
web.root  /[locale] layout (IMPLEMENTED)
├── web.site            public site header + footer
├── web.auth            sign-in / sign-up chrome, also /sponsor/login, /admin/login
├── web.account         /account pages: restricted-account and recovery states, no product navigation
├── web.app             /app frame: session gate, workspace context (IMPLEMENTED, foundation)
│   ├── web.app.onboarding   registration wizards                     GymSetupSteps
│   ├── web.app.fighter      fighter sidebar                          FighterWebNav
│   ├── web.app.coach        coach sidebar                            CoachWebNav
│   ├── web.app.gym          gym console sidebar                      GymWebNav
│   └── web.app.active       account pages inside the active workspace's sidebar
├── web.sponsor         partner portal sidebar                        SponsorNav
└── web.admin           admin sidebar                                 AdminNav

mobile.root  root Stack (IMPLEMENTED)
├── mobile.auth         welcome, sign in/up, consent, role, invites (no tabs)
├── mobile.onboarding   wizards and first-run intros (no tabs)
├── mobile.fighter      tabs: home · training · board · community · profile   FighterTabs
├── mobile.coach        tabs: today · fighters · board · requests · inbox    CoachTabs
├── mobile.gym          tabs: pulse · classes · check-in · members · staff   GymTabs
└── mobile.shared       account screens pushed above the active role's tabs
```

`nav.type`:

| Type         | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `NAV_ITEM`   | Linked from a tab bar or sidebar item (`nav.from`)                                                               |
| `STACK`      | Child page reached from its `parent`                                                                             |
| `WIZARD`     | One route whose screens are `?step=` steps                                                                       |
| `STANDALONE` | Top-level page with no parent route (auth pages, site pages, deep-linkable details)                              |
| `ENTRY`      | Resolves and redirects (`web.app`, `mobile.root`)                                                                |
| `REDIRECT`   | Section entry that always redirects to `redirect.to` and renders nothing (`web.app.camp` → `web.app.camp.board`) |
| `CATCH_ALL`  | Not found                                                                                                        |

Every shell with a nav component lists all of its items in `navItems`: `key`,
`label`, and either a `route` (plus an optional `query`, for example the
sponsor Challenges and Events items open `/sponsor/campaigns?type=challenge`
and `?type=event`), a `designGap`, or no target with a `note` (sponsor
Creative is a wizard step with no standalone surface). An item never points at
a route that needs a parameter it does not have, and a shell never invents a
default resource: such items wait for their design gap (§17). The web
sidebars' identity card is the workspace switcher: an in-shell action, not a
route.

Overlay states (`?modal=`, `?sheet=`, `?panel=`) render over their route and
are not separate routes. The public site has no nav component artboard; its
header lives in the landing artboards.

## 9. Guard and redirect semantics

Guards run in this order for every navigation. The first rule that applies
decides; all targets are registry routes (`guards`, `capabilities`).

1. **Unknown route** → the platform's catch-all (`guards.notFound`). Never a
   redirect to home.
2. **Unauthenticated → `AUTHENTICATED` route** → the area's sign-in route
   (`guards.signIn`: `/login`; `/sponsor/login` for `/sponsor/*`;
   `/admin/login` for `/admin/*`) with `returnTo=<requested path + query>`.
   `returnTo` accepts only a relative path of the same platform that matches a
   registry route; anything else is dropped. The SF-24 policy, identical on
   both platforms: one leading `/` (never `//`), no backslash, whitespace,
   control character or scheme, decoded exactly once, at most 2048
   characters; a leading web locale segment is removed; the path must match a
   registry route that is not `GUEST_ONLY` (no login loop), not
   `phase: ONBOARDING`, not a `restrictedAccount` route, not the not-found
   catch-all and not `web.verify-email`. Only pathname and query are kept (the
   hash is dropped). Gates add `returnTo` only for a valid destination; the
   auth screens carry it between their steps and provider buttons; it is
   consumed once, by replacing the auth page.
3. **Authenticated → `GUEST_ONLY` route** → the default destination (below),
   except the sign-in flow's own workspace step. For email authentication the
   session begins after successful email verification; consent and role
   onboarding run on an authenticated, onboarding-incomplete account. Social
   providers with provider-verified identities may transition differently
   (SF-22/SF-23) (`D-SIGNUP-SESSION-BOUNDARY`).
4. **Restricted account** (suspended, pending deletion) → only
   `restrictedAccount` routes; everything else redirects to
   `guards.restrictedAccount`: `/account/suspended` and
   `/account/pending-deletion` on both platforms (appeal from suspended). On
   web they are account-level pages in `web.account`, outside `/app` and every
   workspace. The redirects themselves are implemented by the
   authentication/account lifecycle tickets.
5. **Incomplete account onboarding** (consent or first role missing) → the
   account onboarding routes (`guards.accountOnboarding`). Account-level
   `phase: ONBOARDING` routes are offered only until it completes.
6. **Missing capability** (for example, a non-fighter opening a fighter-only
   route) → the default destination. `ADMIN` routes answer **not found**
   instead, so their existence is not revealed.
7. **Workspace capability without the right active workspace**: one
   membership of the required kind activates it; several open the switcher
   (`guards.workspaceChooser`: `/workspaces` on mobile, the in-shell switcher on
   web) and then continue to `returnTo`. No membership counts as a missing
   capability (rule 6).
8. **Phase**: capability set up but onboarding incomplete, on an `ACTIVE`
   route → the capability's onboarding route (resume the saved step). Onboarding
   complete, on a capability `ONBOARDING` route → the capability's home.
9. **Resource**: the route renders and the backend decides. `404` and `403`
   both render the not-found state inside the shell (existence is not
   revealed); a deleted resource renders its designed deleted state where one
   exists (for example S09 `deleted`), otherwise not found. A `401`
   mid-session returns to rule 2.

**Default destination**: the active workspace's home (`capabilities.*.home`).
Without one, the first held capability in the order FIGHTER, COACH,
GYM_WORKSPACE, SPONSOR_WORKSPACE (web). Without any, account onboarding.
`web.app` and `mobile.root` are `ENTRY` routes that apply exactly this
resolution.

**Application entry (SF-24).** Every sign-in method (Google, Apple, the
email sign-in code and the sign-up verification code) ends in one pipeline,
`completeAuthentication`: store the session, resolve the viewer with
`GET /api/me`, publish `authenticated`. The guest-only gate then navigates
once, through a pure `resolveEntry(viewer, returnTo)` per client: the valid
`returnTo`, otherwise the neutral entry (`/app` on web, `/` on mobile). The
API exposes only the viewer's id today, so the default destination,
onboarding, restricted-account and workspace rules above are not applied
yet: no role, profile, workspace, onboarding phase, consent, account status
or last workspace is inferred on the client. SF-25+ add those branches to
`resolveEntry` when `GET /api/me` carries that state. A network or server
failure while the session is restored or the viewer resolved is
`unavailable` (credentials kept, retryable failure state), never a sign-out;
only a rejected credential (401) is. Without any mobile destination (a sponsor-only user), mobile
falls back to `guards.defaultDestinationFallback` (`/workspaces`,
`D-MOBILE-SPONSOR-ADMIN`).

**Checkout** (`/checkout`, mobile) is `PUBLIC`. Without a session it renders
the designed quick-account state (QA1, `condition: NO_SESSION`); every payment
operation requires a normal SimpleFit identity and session, enforced by the
backend. There is no anonymous purchase and no separate quick-account route
(`D-GUEST-CHECKOUT`). Trial and pricing routes stay shared signed-in routes;
the backend decides commercial eligibility (`D-TRIAL-AUDIENCE`).

The full authentication and authorization system is out of scope here; it is
delivered by the SF-18 child tickets against this contract. Until then, no
client may fake a guard with hard-coded roles or local flags.

## 10. Implementation status

| Status                 | Meaning                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMPLEMENTED`          | The route resolves in the production router today. It does **not** mean the screen matches its artboard: `production.note` says what renders |
| `PLACEHOLDER_REQUIRED` | Approved by the gallery, not yet routable. SF-32 (web) / SF-33 (mobile) create it                                                            |
| `DEFERRED`             | Approved but not to be built now: the design marks it future (`discrepancies` says why)                                                      |

Counts at SF-31 (design version `1791276973-ad1d`): web 140 routes, 4
`IMPLEMENTED` (2 are product routes plus not-found and an internal route) and
136 `PLACEHOLDER_REQUIRED` (one of them the `/app/camp` redirect); mobile 139
routes, 4 `IMPLEMENTED` (`/`, not found, 2 internal), 134
`PLACEHOLDER_REQUIRED`, 1 `DEFERRED` (`/sparring/find`). All 32 proposed
backend endpoints and 17 server outputs are `DEFERRED`; the 3 existing
operational API routes are `IMPLEMENTED`. Shells carry the same statuses.

Counts after SF-32 (web): all 140 web routes and all 12 web shells are
`IMPLEMENTED`. 6 routes are real screens or system routes from earlier
tickets (`/`, `/login`, `/signup`, the `/app` entry, not-found,
`/dev/design-system`), 133 render the canonical feature placeholder and 1 is
the `/app/camp` redirect. `production.note` says which.

Design version `1791311129-8fec` (reconciled in SF-33) added 2 web and 2
mobile routes; both clients materialized theirs as placeholders, since no
client implements the email-code screens yet (SF-21 delivered the API only):
web 142 routes (135 placeholders), mobile 141 routes. Server outputs: 18.

Counts after SF-33 (mobile): all 7 mobile shells and the 140 approved mobile
routes are `IMPLEMENTED`; `/sparring/find` stays `DEFERRED` and has no file.
6 routes are real screens or system routes from earlier tickets (`/`,
`/welcome`, `/login`, not found, `/dev/design-system`, `/app`) and 134 render
the canonical feature placeholder; mobile has no `REDIRECT` route.

Both repositories carry this registry byte for byte, including both
platforms' statuses: a ticket that changes routes or statuses on one platform
copies the registry (and this document) to the other repository in the same
change, and each repository's tests check its own router against it.

A screen's visual fidelity is not tracked here. It is delivered by the feature
ticket that implements the screen from its artboard.

## 11. Web mapping (Next.js)

- Every page lives under `src/app/[locale]/`. The canonical path maps to
  directories as in §5 (`:fighterId` → `[fighterId]`); links use
  `@/shared/i18n/navigation`, which adds the locale.
- **Registry → code.** `pnpm routes:generate` turns the registry's web
  routes, shells' `navItems` and web guards into
  `src/shared/routes/web-routes.ts`; `src/shared/routes/routes.ts` resolves
  ids to paths (`routeHref`), paths to routes (`matchWebRoute`, static
  segments first) and routes to their owning nav item (`navKeyForRoute`,
  through `parent`). Code links by route id, never by handwritten path. A
  test fails when the generated module drifts from the registry.
- Shells map to layouts and route groups (SF-32; route groups do not change
  URLs):

```
src/app/[locale]/
├── layout.tsx                         web.root
├── (site)/layout.tsx, page.tsx, …     web.site     PUBLIC: /, /fighters, /pricing, /partners…
├── (auth)/layout.tsx                  web.auth     GUEST_ONLY: login, signup/*, sponsor/login, admin/login
├── account/layout.tsx                 web.account  AUTHENTICATED: /account/*
├── app/layout.tsx                     web.app      AUTHENTICATED session gate; page.tsx = /app entry
│   ├── onboarding/layout.tsx          web.app.onboarding
│   ├── (fighter)/layout.tsx           web.app.fighter   /app/home, /app/board, /app/camp/*…
│   ├── coach/layout.tsx               web.app.coach
│   ├── gym/layout.tsx                 web.app.gym
│   └── (active)/layout.tsx            web.app.active    /app/billing/*, /app/calendar, /app/messages…
├── (sponsor)/sponsor/layout.tsx       web.sponsor  AUTHENTICATED (sign-in: /sponsor/login)
├── (admin)/admin/layout.tsx           web.admin    AUTHENTICATED (sign-in: /admin/login)
├── dev/design-system/page.tsx         web.dev.design-system (INTERNAL)
└── [...rest]/page.tsx                 web.not-found
```

- **Shell widgets.** `WorkspaceShell` (sidebar from the md breakpoint, sheet
  menu below) for fighter, coach, gym, sponsor and admin: items and targets
  from the registry `navItems`, sections, order and icons from the nav
  artboards. Items without a route (sponsor Creative, Analytics) are hidden
  (§14). `AppFrame` (header only) for the /app entry, `web.app.active`,
  `web.app.onboarding` and `web.account`; `SiteHeader`/`SiteFooter` for
  `web.site`; `AuthShell` for `web.auth`. Workspace identity cards and
  switchers, nav badges and "next session" cards wait for workspace data.
- **Active navigation.** The current path resolves to its route; the route
  or its nearest ancestor owns the active item, and items sharing a route
  are told apart by query (sponsor Campaigns / Challenges / Events).
- **Placeholders.** A route whose screen belongs to a later ticket renders
  `FeaturePlaceholder` through `placeholderRoute(id)`: the localized route
  title, a "Planned" badge and the canonical path inside its shell — no data,
  no controls, no API calls, `noindex`. A feature ticket replaces the page
  with its screen; the placeholder is never forked per route.
- **Guards (UX only, §6).** `RequireSession` (AUTHENTICATED) waits for the
  session restore, then sends signed-out visitors to the area's sign-in route
  (`guards.signIn`: `/login`, `/sponsor/login`, `/admin/login`) with
  `returnTo` (when the page is a valid destination); `GuestOnly` sends an
  authenticated viewer to `resolveEntry` (the valid `returnTo`, otherwise
  `/app`). Both render the layout's `unavailable` view (`SessionFailure`)
  while the session cannot be confirmed. Refreshes are serialized across tabs
  with a Web Lock and sign-in / sign-out are broadcast between tabs (ADR 0010
  in simplefit-api).
  Capability (FIGHTER, COACH, GYM_WORKSPACE, SPONSOR_WORKSPACE, ADMIN),
  phase, active workspace and restricted-account rules are **not resolved**:
  the API exposes no capability, workspace or account-state data yet, so no
  state is invented. Their identity tickets add those checks on top of these
  gates; until then every signed-in user can open every shell's placeholders,
  and the backend authorizes all data. `web.app.active` pages render in the
  header-only frame until the active workspace's sidebar can be resolved.
- **Boundaries.** SF-24 owns the auth UI, `returnTo` and the neutral entry;
  SF-25+ the `/app` entry's default-destination redirect. SF-34 owns the loading,
  not-found and error states: `RequireSession` shows the LD3 launch screen
  while the session is restored, the sidebar shells' `loading.tsx` the LD4
  skeleton, `not-found.tsx` and `global-not-found.tsx` the ER2 404, and
  `error.tsx`/`global-error.tsx` the failure states.

- Query-state screens read `searchParams`; overlays use the query as their
  open state so they stay linkable.
- `REDIRECT` routes are a page that only redirects with the localized
  `redirect` (`/app/camp` → `/app/camp/board`); they never render content.
- Tests: `scripts/route-registry.test.mjs` (every page is a registry route),
  `scripts/web-route-skeleton.test.mjs` (resolution strategy, shell layout
  chain, named parameters, session gates, titles) and
  `scripts/web-routes.test.mjs` (generated module in sync).
- Developer routes (`/dev/*`) are `INTERNAL` and answer 404 in production.

## 12. Mobile mapping (Expo Router)

- Files live under `src/app/` with typed routes. The canonical path maps as in
  §5 (`:sessionId` → `[sessionId]`); `index.tsx` is `/` or a path that has
  child routes in the same group, `+not-found.tsx` is `/*`.
- **Registry → code.** `pnpm routes:generate` turns the registry's mobile
  routes (path, params, shell, parent, nav type, status and the complete
  access: `session`, `capability`, `phase`, `restrictedAccount`), the shells'
  `navItems`, the mobile guards and the capabilities' mobile home and
  onboarding routes into `src/shared/routes/mobile-routes.ts`.
  `src/shared/routes/routes.ts` resolves ids to hrefs (`routeHref`, which
  refuses missing parameters and deferred routes), paths to routes
  (`matchMobileRoute`: at the first differing segment a static segment wins,
  as in Expo Router). Code links by route id, never by handwritten path. A
  test fails when the generated module drifts from the registry.
- Shells map to route groups with their own `_layout.tsx` (SF-33; groups do
  not change URLs or deep links):

```
src/app/
├── _layout.tsx                mobile.root        providers, fonts, splash, root Stack
├── index.tsx                  /  (ENTRY: SF-12 foundation home)
├── app.tsx, dev/design-system.tsx, +not-found.tsx
├── (auth)/_layout.tsx         mobile.auth        Stack, no tabs: welcome, login, signup/*, onboarding/role, join, invite/*
├── (onboarding)/_layout.tsx   mobile.onboarding  Stack, no tabs: onboarding/*, welcome/tour, coach/welcome
├── (fighter)/_layout.tsx      mobile.fighter     Stack over (tabs)
│   └── (tabs)/_layout.tsx                        Tabs, one stack per tab: (home) (training) (board) (community) (profile)
├── (coach)/_layout.tsx        mobile.coach       Stack over (tabs)
│   └── (tabs)/_layout.tsx                        Tabs: (today) (fighters) (board) (requests); Inbox → /messages
├── (gym)/_layout.tsx          mobile.gym         Stack over (tabs)
│   └── (tabs)/_layout.tsx                        Tabs: (pulse) (classes) (checkin) (members) (staff)
└── (shared)/_layout.tsx       mobile.shared      Stack pushed above the active role's tabs
```

- **Tabs and stacks.** Every tab is a stack group named after its nav item
  (`(tabs)/(profile)/_layout.tsx`, `TabStack`) whose root is the item's route
  and which keeps its state while the user switches tabs. The routes whose
  artboards show the shell's tab bar live in that tab's stack, so they keep
  the tab bar and go back to the tab root: fighter Training (`/timer`,
  `/calendar`), Community (`/discover`, `/friends`, `/following`,
  `/challenges`, `/marketplace`) and Profile (`/progress`, `/achievements`);
  coach Today (`/coach/activity`, `/coach/challenge/:challengeId`) and
  Requests (`/coach/sparring`); gym Classes (`/gym/classes/:classId/roster`)
  and Members (`/gym/members/:memberId`). Every other route of the shell is
  pushed above the tabs by the shell's stack, and a deep link to such a route
  keeps the tabs underneath (`initialRouteName: "(tabs)"`). `ShellTabBar`
  renders the items and targets of `navItems`, the icons and raised centre
  action of the FighterTabs, CoachTabs and GymTabs components, and labels from
  i18n; the active tab is the focused tab group. An item whose route belongs
  to another shell (coach Inbox → shared `/messages`) is pushed. The design
  also draws a tab bar on Inbox (`/messages`), but the registry places
  `/messages` in `mobile.shared`, pushed above the active role's tabs; that
  shell decision is kept.
- **Guards attach to route groups, never to a URL prefix.** `/gym/*` and
  `/coach/*` serve both fighters (`/gym/:gymId/store`,
  `/coach/:coachId/services/:serviceId`) and the gym/coach workspace
  (`/gym/pulse`, `/coach/today`). They live in different groups
  (`(fighter)/gym/[gymId]/…` vs `(gym)/(tabs)/gym/pulse.tsx`), and static
  segments win over parameters (`D-MOBILE-NAMESPACE-SHARING`).
- **Session guard (UX only, §6).** Each shell layout wraps its stack in
  `SessionGate`, which applies the focused route's own `session` rule, so one
  shell can mix access (the auth shell has public invite links, guest-only
  sign-in and authenticated consent):
  - AUTHENTICATED: waits for the session restore, then sends signed-out
    visitors to `/login` with `returnTo=<path + query>`;
  - GUEST_ONLY: sends an authenticated viewer to `resolveEntry` (the valid
    `returnTo`, otherwise the entry `/`);
  - PUBLIC (`/checkout`, invite links): renders for everyone.

  The navigator stays mounted under the pending cover (hidden from assistive
  technology), so a screen under a gate may mount before the session is
  known: screens get data only through the authenticated API, never from
  state that exists without a session. Capability (FIGHTER, COACH,
  GYM_WORKSPACE), phase, active workspace and restricted-account rules are
  **metadata only**: the API exposes no such viewer state yet, so none is
  invented, every signed-in user can open every shell's placeholders, and the
  backend authorizes all data. The identity tickets add those checks on top
  of `SessionGate` from the generated metadata.

- **Placeholders.** A route whose screen belongs to a later ticket is the file
  `export default placeholderRoute("<route id>");`. `FeaturePlaceholder`
  renders the localized route title (also the header title of pushed
  screens), a "Planned" badge and the canonical path: no data, no controls,
  no API calls. A feature ticket replaces that one file with its screen; the
  placeholder is never forked per route.
- **Deep links.** `simplefit://<canonical path>` opens the route
  (`simplefit://camp/weight`); route groups never appear in URLs. Parameters
  are opaque and only fill their own segment (`routeHref` URL-encodes them).
  `returnTo` is only carried to sign-in, and the sign-in flow (SF-24) accepts
  it only under the §9 policy. Unknown paths and the
  deferred `/sparring/find` land on `+not-found`.
- **Boundaries.** SF-24 owns the auth UI, `returnTo` and the neutral entry;
  SF-25+ the entry's default-destination redirect. Until then `/` is still the
  SF-12 foundation home, so the role shells are reached by link or deep link. SF-34
  owns the loading, not-found and error states: the gate's pending cover is
  the LD1 launch screen, `+not-found` the ER1 404 and the root layout's
  `ErrorBoundary` the failure states; LD2 has primitives only until home
  loads real data. The
  SF-12 `/app` page stays an internal route, moved out of the removed `(app)`
  group (`D-PRODUCTION-FOUNDATION`).
- Tests: `scripts/route-registry.test.js` (every route file is a registry
  route), `scripts/mobile-route-skeleton.test.js` (completeness,
  placeholders, groups, shells, gates, copy, native identity),
  `scripts/mobile-routes.test.js` (generated module in sync, access
  round-trip), `src/shared/routes/routes.test.ts` (helpers) and
  `src/providers/router.test.tsx` (every approved route resolves in the real
  router; deep links, guards, tabs, back navigation).

## 13. Backend and API relationship

- `api` holds the 32 endpoints the gallery shows as "Backend · API surface
  (proposed)", `DEFERRED` until a feature ticket implements one, plus the
  existing operational routes (`/api/health`, `/api/openapi`, `/api/docs`).
  SF-22 implemented the Google half of "Google / Apple" as
  `POST /api/auth/google` (`authenticateWithGoogle`).
- **OpenAPI stays canonical.** An endpoint enters
  `simplefit-api/openapi/simplefit.api.json` only through the feature ticket
  that implements it, following ADR 0003 (versioning, errors) and the API
  rules. That ticket updates the entry's `status` and `openapi.operationId`.
  Paths may change in review (`D-BACKEND-PROPOSED`); the design path stays in
  `design.galleryPath`.
- `outputs` holds server-rendered artefacts with a path in the design (email
  previews E01–E16, share images). Their owner is undecided
  (`D-SERVER-OUTPUTS`).
- UI routes never call these paths directly: clients use the generated
  OpenAPI client.

## 14. How tickets consume the registry

```
Claude Design Route Gallery
        ↓
SF-31 canonical route registry (docs/route-registry.json)
        ↓
production route architecture
       ↙ ↘
    Web   Mobile
 SF-32     SF-33
```

- **SF-32 / SF-33 (shells and skeleton):** build every shell and every route of
  their platform with `PLACEHOLDER_REQUIRED`, using `path`, `shell`, `parent`,
  `nav` and `access`. Then flip each route to `IMPLEMENTED` with its
  `production.file`. A placeholder renders the route name and nothing that
  pretends to be product. Do not build `DEFERRED` routes, and never invent a
  route or screen for a design gap (§17).
- **Feature tickets (visual implementation):**

```
canonical route (registry)
      ↓
exact individual Claude Design artboard (screens[].design.artboard)
      ↓
production screen
```

- **Identity tickets (SF-18 children):** implement §9 with `guards` and
  `capabilities`, following the approved decisions `D-SIGNUP-SESSION-BOUNDARY`,
  `D-ADMIN-IDENTITY`, `D-WORKSPACE-NOT-IN-URL`, `D-GUEST-CHECKOUT` and
  `D-MOBILE-SPONSOR-ADMIN`, and send restricted accounts to the `/account/*`
  pages (`guards.restrictedAccount`).
- **Design gaps (§17):** a nav item that waits for a gap is hidden or shown
  as unavailable (SF-32/SF-33 choose); it never gets an invented target.
- Any code that links to a route uses its canonical path. A path not in the
  registry is a review failure.

## 15. Reconciling Claude Design route changes

The design stays the product IA source. When it changes, nobody exports
screenshots:

1. Re-read `project/canvas.json` with the Artifact tool and record the new
   version.
2. Re-read the affected Route Gallery artboard(s) (`GalleryIndex.dc.html`,
   `GalleryIndex2.dc.html`, `GalleryIndex4.dc.html`).
3. Extract the rows (step, code, artboard link, route, states, platform tag)
   and diff them against `screens[]`: added, removed and changed rows.
4. Update the registry: new screens and routes (status
   `PLACEHOLDER_REQUIRED`), changed paths (keep the route `id`), removed rows
   (remove only when the design removed them). Update `source.version`.
5. Apply the route delta in each affected repository (both registries stay
   identical) and run the tests.
6. Record new ambiguities in `discrepancies`; never resolve them silently.

## 16. Discrepancies and decisions

Every entry has a source A, a source B, the exact mismatch, its impact, a
resolution and a status; the full text is in `discrepancies` of the registry.
The 18 product decisions approved on 2026-10-06 carry `decision` and
`decidedOn`. No discrepancy awaits a product decision; five are `DEFERRED`.

| Id                                 | Status   | Decision / summary                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `D-ROUTE-MAP-BOARDS`               | RESOLVED | Route-map boards use 47 older paths; the gallery wins                                      |
| `D-PATH-EXAMPLES`                  | RESOLVED | 20 gallery paths with sample data normalized to parameters                                 |
| `D-PATH-PARAM-NAMES`               | RESOLVED | Generic `:id` renamed after its resource                                                   |
| `D-ROLE-SELECTION-PATH`            | RESOLVED | `/onboarding/role` canonical; `/auth` alias dropped                                        |
| `D-PROFILE-NO-ID`                  | RESOLVED | Mobile `/profile/fighter/:fighterId`; web `/app/profile` is the own profile / view-as      |
| `D-SHARED-SESSION-NO-ID`           | RESOLVED | `/shared-session/:sharedSessionId`; lifecycle state not in the URL                         |
| `D-ADMIN-SPONSOR-CAMPAIGN-PATHS`   | RESOLVED | `/admin/sponsors/:sponsorId`, `/admin/campaigns/:campaignId` (+ edit, timeline)            |
| `D-NAMING-INCONSISTENCIES`         | RESOLVED | Singular/plural and cross-platform naming kept as designed                                 |
| `D-ALIAS-ROWS`                     | RESOLVED | Uncoded rows registered as screens or excluded by a decision                               |
| `D-CAMP-DUPLICATE`                 | RESOLVED | `/app/camp/board` canonical; `/app/camp` redirects                                         |
| `D-WEB-NAV-MOBILE-TARGETS`         | RESOLVED | Web calendar, messages, coach board designed in `1791276973-ad1d` (W08, W09, WC8)          |
| `D-WEB-WORKSPACE-SWITCHER`         | RESOLVED | In-shell switcher action, no route                                                         |
| `D-SPONSOR-NAV`                    | RESOLVED | Challenges/Events filter `/sponsor/campaigns`; no Creative route; analytics index is a gap |
| `D-NAV-DETAIL-TARGETS`             | RESOLVED | Creator targets kept; list roots designed in `1791276973-ad1d` (G08, G09, WC7, WG27, AD21) |
| `D-WORKSPACE-NOT-IN-URL`           | RESOLVED | Active workspace is session context; no workspace ids in URLs                              |
| `D-WEB-DEFAULT-WORKSPACE`          | RESOLVED | `/app` resolves the active workspace; `/app/home` is fighter-only                          |
| `D-SHARED-ROUTES-ON-PERSONA-PAGES` | RESOLVED | Account-level routes need no capability                                                    |
| `D-TRIAL-AUDIENCE`                 | RESOLVED | Shared signed-in trial/pricing; backend decides eligibility                                |
| `D-GUEST-CHECKOUT`                 | RESOLVED | `/checkout` public; guests see QA1; payment requires a session                             |
| `D-SIGNUP-SESSION-BOUNDARY`        | RESOLVED | Email sign-up: session after email verification                                            |
| `D-ADMIN-IDENTITY`                 | RESOLVED | Same global User + backend-granted staff capability                                        |
| `D-MOBILE-SPONSOR-ADMIN`           | RESOLVED | Sponsor in mobile `/workspaces` with continue-on-web; no mobile surfaces                   |
| `D-WEB-ACCOUNT-STATES`             | RESOLVED | Web `/account/*` pages designed in `1791276973-ad1d` (WS3, WS4, WS5)                       |
| `D-PRODUCTION-FOUNDATION`          | DEFERRED | Existing foundation routes differ from the design (SF-32/SF-33)                            |
| `D-MOBILE-NAMESPACE-SHARING`       | RESOLVED | Mobile `/gym`, `/coach` serve fighters and workspaces; guards per group                    |
| `D-REUSED-ARTBOARDS`               | RESOLVED | Coded wizard keys; no coach account step; Friends are S04/S05                              |
| `D-PROGRAM-BUILDER-PATHS`          | RESOLVED | `/app/coach/sessions/new` canonical; tour is `?tour=2`                                     |
| `D-FUTURE-SPARRING`                | DEFERRED | `/sparring/find` is marked future                                                          |
| `D-BACKEND-PROPOSED`               | DEFERRED | 32 proposed endpoints; OpenAPI stays canonical                                             |
| `D-SERVER-OUTPUTS`                 | DEFERRED | Email previews and share images: owner undecided                                           |
| `D-PITCH-PAGE-AUTHORITY`           | RESOLVED | The Route Gallery is the IA source despite its reference-only page                         |
| `D-404-SCOPE`                      | RESOLVED | One web catch-all for every area                                                           |
| `D-CANVAS-GROWTH`                  | RESOLVED | Canvas grew from 456 (SF-16) to 473 artboards (`1791276973-ad1d`)                          |
| `D-WEB-COACH-FIGHTER-INVITE`       | DEFERRED | Coach web "Invite fighters" links the mobile INV1 artboard: design gap, no web route       |

Gallery rows dropped by a decision are listed in `excludedRows`, so every
row stays accounted for:

| Gallery row                                                | Gallery path                       | Decision                |
| ---------------------------------------------------------- | ---------------------------------- | ----------------------- |
| `x-mobile-role-selection` Role selection                   | `/auth?state=role-selection`       | `D-ROLE-SELECTION-PATH` |
| `x-mobile-fighter-boxing-profile` Fighter · Boxing profile | `/onboarding/fighter?step=profile` | `D-REUSED-ARTBOARDS`    |
| `x-mobile-coach-account` Coach · Account                   | `/onboarding/coach?step=account`   | `D-REUSED-ARTBOARDS`    |
| `x-web-fight-camp-board-desktop` Fight Camp Board Desktop  | `/app/camp`                        | `D-CAMP-DUPLICATE`      |

## 17. Design gaps

A design gap is designed intent (usually a navigation item) with **no Route
Gallery row**. It is never a route or a screen: no placeholder, no invented
path, no default resource. `candidatePath` only names the likely path for the
design discussion. A gap leaves the list only when Claude Design adds the
Route Gallery rows; the registry then gains the route through §15. Status:
`UNRESOLVED_DESIGN`.

| Id                             | Platform | Missing designed surface                                                                                                                                                  | Nav items waiting for it                |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `GAP-SPONSOR-ANALYTICS-INDEX`  | web      | Sponsor analytics index, only if the product needs one (the nav links SPX7, one campaign)                                                                                 | `web.sponsor#analytics`                 |
| `GAP-WEB-COACH-FIGHTER-INVITE` | web      | Coach web "Invite fighters" (WC7 action) links the mobile `InviteCoach.dc.html` (INV1, `/invite/:code`); Coach → Fighter invitation semantics for web are not established | none: an in-page action, not a nav item |

Design version `1791276973-ad1d` resolved the other nine gaps
(`GAP-MOBILE-GYM-CLASSES`, `GAP-MOBILE-GYM-MEMBERS`, `GAP-WEB-COACH-FIGHTERS`,
`GAP-WEB-COACH-BOARD`, `GAP-WEB-GYM-OPEN-SPARRING`, `GAP-WEB-ADMIN-SUPPORT`,
`GAP-WEB-CALENDAR`, `GAP-WEB-MESSAGES`, `GAP-WEB-ACCOUNT-STATES`) with 11 new
Route Gallery rows; they are routes now, and each affected discrepancy records
it in `resolvedByDesign`. The sponsor analytics index was intentionally not
designed: `/sponsor/analytics/:campaignId` stays the canonical analytics route.

`GAP-WEB-COACH-FIGHTER-INVITE` records an in-page action, not a nav item: the
"Invite fighters" action of `WebCoachFighters.dc.html` (WC7) links the mobile
INV1 artboard. INV1 is where a recipient uses a coach, gym or friend invite;
whether the coach's own web invitation of fighters is the same flow is not
established, so no web invite route or screen exists and the action must not
be treated as one (`source` records the artboard, the action and its canvas
target). Owner: future Coach ↔ Fighter relationship/invitation product work.
It does not block SF-19.
The sponsor Challenges and Events items link `SponsorCampaigns.dc.html` on the
canvas and open the query states `/sponsor/campaigns?type=challenge` and
`?type=event` in production; they are not routes.
