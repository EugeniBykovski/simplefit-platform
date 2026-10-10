# SimpleFit Platform architecture

`simplefit-platform` is the canonical web client of SimpleFit Boxing. It will
host the public website, Fighter/Coach/Gym web, the desktop-class application
experience, the Sponsor portal, Admin, Marketplace, Booking, Payments, Social
and the Live Boxing Board. SF-11 built only the **foundation** these will use.

- [System context](#system-context)
- [Stack](#stack)
- [Directory layout](#directory-layout)
- [FSD-lite](#fsd-lite)
- [Server and Client Components](#server-and-client-components)
- [Styling: Tailwind and tokens](#styling-tailwind-and-design-tokens)
- [UI primitives: shadcn/ui](#ui-primitives-shadcnui)
- [API contract and Orval](#api-contract-and-orval)
- [Server state: TanStack Query](#server-state-tanstack-query)
- [Forms and validation](#forms-and-validation)
- [Internationalization](#internationalization)
- [Environment](#environment)
- [Testing](#testing)
- [Quality commands](#quality-commands)
- [Git and Jira conventions](#git-and-jira-conventions)
- [CI](#ci)
- [Dependencies](#dependencies)
- [Known limitations](#known-limitations)

## System context

```
 browser ──HTTP──► simplefit-platform (Next.js) ──REST/JSON──► simplefit-api (Phoenix)
                         │                                         │
                         └── generated client ◄── OpenAPI artifact ┘
```

The **Phoenix backend owns** business logic, authorization, validation,
persistence and the API contract (`simplefit-api/openapi/simplefit.api.json`).
This repository renders UI and calls the API. It never re-implements business
rules, never talks to a database and never hand-writes backend DTOs.

## Stack

| Concern      | Choice                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Runtime      | Node.js 24 LTS (`.nvmrc`), pnpm 12 (`packageManager`)                                             |
| Framework    | Next.js 16 App Router, React 19, React Server Components by default                               |
| Language     | TypeScript 6, strict (+ `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`) |
| Styling      | Tailwind CSS 4, semantic CSS-variable tokens                                                      |
| Primitives   | shadcn/ui (radix-nova style) on Radix, Lucide icons                                               |
| API client   | Orval 8 (fetch + TanStack Query), generated from the backend OpenAPI                              |
| Server state | TanStack Query 5 (Client Components only)                                                         |
| Forms        | React Hook Form + Zod                                                                             |
| i18n         | next-intl 4                                                                                       |
| Tests        | Vitest 5, React Testing Library, jest-dom, user-event                                             |
| Quality      | ESLint 9 (next core-web-vitals + jsx-a11y), Prettier 3, Husky, lint-staged, commitlint            |

## Directory layout

```
simplefit-platform/
├── .github/workflows/ci.yml   CI
├── .husky/                    git hooks (pre-commit, commit-msg)
├── docs/architecture/         this document
├── messages/<locale>/*.json   translations, one file per namespace
├── openapi/simplefit.api.json verbatim snapshot of the backend contract
├── scripts/                   api-sync, api-check, ui-add, commit convention
└── src/
    ├── app/                   routing, layouts, providers (Next.js App Router)
    │   ├── [locale]/          every page lives under a locale segment
    │   └── global-not-found.tsx
    ├── proxy.ts               locale negotiation (Next.js 16 "proxy", formerly middleware)
    ├── widgets/               large composed UI blocks (workspace-shell, app-frame, auth-frame, site-header,
    │                          feature-placeholder, public-site)
    ├── features/              user actions (session-gate, sign-in-with-google, sign-in-with-apple, sign-out,
    │                          switch-locale, check-api-health)
    ├── entities/              client representations of domain concepts (session, system-health)
    ├── shared/
    │   ├── api/               generated client, HTTP transport, ApiError, QueryClient
    │   ├── config/            env (validated), site identity
    │   ├── i18n/              locale registry, routing, messages, formats, navigation
    │   ├── routes/            canonical web routes generated from the SF-31 registry, route helpers
    │   ├── lib/               cn(), form helpers, Google Identity Services and Apple JS boundaries
    │   ├── styles/            design tokens and Tailwind theme mapping
    │   └── ui/                shadcn/ui primitives (locally owned)
    └── test/                  test helpers
```

`shared/hooks/` and `shared/types/` are configured as aliases but are created
only when the first real hook or shared type exists (no empty folders).

## FSD-lite

A pragmatic subset of [Feature-Sliced Design](https://feature-sliced.design).
There is **no FSD `pages` layer**: Next.js `app/` already composes routes.

| Layer      | Holds                                               | Example                     |
| ---------- | --------------------------------------------------- | --------------------------- |
| `app`      | routes, layouts, providers, metadata                | `app/[locale]/app/page.tsx` |
| `widgets`  | large compositional blocks used by routes           | `widgets/app-shell`         |
| `features` | one user action / use case                          | `features/switch-locale`    |
| `entities` | domain-oriented client representations and their UI | `entities/system-health`    |
| `shared`   | domain-independent infrastructure and primitives    | `shared/ui/button`          |

**Dependency direction** (enforced by ESLint `no-restricted-imports`):

```
app ─► widgets ─► features ─► entities ─► shared
```

A layer imports only from layers to its right. Slices on the same layer do not
import each other (compose them one layer up). No circular dependencies.

**Public API.** Each slice in `widgets`/`features`/`entities` exposes one
`index.ts`; import slices through it (`@/features/switch-locale`). Inside
`shared`, import files directly (`@/shared/ui/button`). No other barrels.

**Create slices only for real code.** Product domains (fighter, coach, gym,
booking…) get slices when a ticket implements them, not before.

## Server and Client Components

- **Server Components are the default.** Pages, layouts and widgets render on
  the server, read translations with `getTranslations` / `useTranslations` and
  can call the generated API functions directly.
- **Add `"use client"` only for browser needs:** state, effects, event
  handlers, browser APIs, TanStack Query hooks, `usePathname`. Keep client
  islands small and push them to the leaves (`AppNav`, `LocaleSwitcher`,
  `ApiHealthCard`).
- `app/[locale]/providers.tsx` is the single client provider boundary
  (QueryClient, TooltipProvider), wrapped by `NextIntlClientProvider`.
- All localized pages are statically prerendered (SSG) per locale;
  `resolveLocaleParam()` calls next-intl's `setRequestLocale` to enable it.

## Styling: Tailwind and design tokens

See **[design-system.md](../design-system.md)** (SF-13): Graphite × Olive
tokens shared with mobile, dark-default theme via `next-themes`, brand fonts
via `next/font`, typography utilities, the raw-colour lint guard, primitive
variants and the dev-only gallery. In short:

- Tailwind CSS 4, configured in CSS (no `tailwind.config`):
  `src/app/globals.css` imports Tailwind, `tw-animate-css`,
  `shadcn/tailwind.css`, then the tokens.
- `src/shared/styles/tokens.css` holds the raw palette and the semantic tokens
  per theme; `src/shared/styles/theme.css` resets Tailwind's default palette
  and maps the semantic tokens to utilities (`bg-surface`,
  `text-muted-foreground`), aliasing shadcn names (`card`, `popover`).
- Use semantic utilities and `type-*` typography, never raw colours (ESLint
  enforces it). Mobile-first responsive classes (`sm:`, `md:`, `lg:`).

## UI primitives: shadcn/ui

- `components.json` points shadcn at FSD-lite paths: primitives land in
  `src/shared/ui`, `cn` comes from `src/shared/lib/utils.ts`.
- Installed: Button, Input, Textarea, Label, Select, Checkbox, RadioGroup,
  Switch, Dialog, Sheet, DropdownMenu, Popover, Tooltip, Tabs, Avatar, Badge,
  Card, Separator, Skeleton, Sonner, Field.
- Add more with **`pnpm ui:add <name>`**, not `shadcn add` directly. The
  wrapper rewrites the registry's `import { cn } from "cn"` to our canonical
  helper (clsx + tailwind-merge) and removes the `cn` package shadcn installs,
  so there is one class utility.
- Primitives are **locally owned** and restyled to the design system (SF-13):
  Button and Badge variants, `Spinner`, borders instead of rings, `overlay`
  scrim, semantic shadows. Sonner follows the `next-themes` theme, and
  Dialog/Sheet require a `closeLabel` whenever they render a close button (no
  hardcoded English in primitives).

## API contract and Orval

**The backend OpenAPI artifact is canonical.** Contract changes originate in
`simplefit-api` (controller `operation` + schemas → `mix openapi.gen`).

```
simplefit-api/openapi/simplefit.api.json
        │  pnpm api:sync   (verbatim copy; part of api:generate)
        ▼
openapi/simplefit.api.json          (committed snapshot)
        │  orval            (orval.config.ts)
        ▼
src/shared/api/generated/           (committed, DO NOT EDIT MANUALLY)
  model/      DTO types for every schema
  endpoints/  per OpenAPI tag: request functions + TanStack Query hooks
```

| Command             | What it does                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm api:sync`     | Copies the backend artifact (sibling checkout, or `SIMPLEFIT_API_OPENAPI=<path>`) into `openapi/`                                                   |
| `pnpm api:generate` | `api:sync --if-present`, then Orval                                                                                                                 |
| `pnpm api:check`    | Fails if the snapshot differs from the backend artifact (when available locally) or if the committed generated code differs from a fresh generation |

**Propagating a backend change:** merge the backend change → `pnpm
api:generate` here → review the diff of `openapi/` and `generated/` → adapt
callers → commit both in one PR. CI cannot see the backend repository, so it
verifies the generated client against the committed snapshot.

**Rules:**

- Never edit `generated/` or the snapshot by hand; never hand-write DTOs. Use
  the generated types, compose or narrow them locally if needed.
- Every file carries a `DO NOT EDIT MANUALLY` header; ESLint and Prettier
  ignore generated code; `.gitattributes` marks it `linguist-generated`.
- Transport: `shared/api/http/api-fetch.ts` (Orval mutator) resolves paths
  against `NEXT_PUBLIC_API_URL`, sends JSON, returns the body and throws
  `ApiError` for every non-2xx response. `ApiError` mirrors the backend error
  envelope: branch on `code`, never on `message`; `requestId` is for support.
- **Server Components** call generated request functions directly
  (`await getHealth({ next: { revalidate: 60 } })`): Next.js `fetch` caching
  options pass through. **Client Components** use the generated hooks
  (`useGetHealth()`).
- The generator is configured to also emit Zod schemas or other clients later
  (add an Orval output project); not enabled until a real need exists.
- No direct database access, ever.

## Server state: TanStack Query

- Standard for **client-side** server state: data that must refresh, be
  refetched on interaction, or be mutated from the browser.
- **Do not** use it for data a Server Component can load at render time.
- `shared/api/query-client.ts`: one QueryClient per request on the server, one
  per browser session; 60 s `staleTime`; 4xx are never retried, other errors at
  most twice.
- No Redux, no Zustand, no other global client state. Introduce a client store
  only when a ticket demonstrates a need TanStack Query and URL state cannot
  meet. The one exception is the session below (SF-22).

## Routes and shells (SF-32)

Every web route of the SF-31 registry resolves: the app tree, shells,
generated route module, placeholders and guards are described in
`docs/route-architecture.md` §11. In short: link by route id
(`routeHref("web.app.coach.fighters")` from `@/shared/routes/routes`), never
by a handwritten path; a new or changed route starts in the registry
(`pnpm routes:generate`); a feature ticket replaces its route's
`placeholderRoute(...)` page with the real screen.

## System states (SF-34)

Production loading, not-found and error states (`widgets/system-states`,
Claude Design section 35), each owned by a real boundary:

| State                       | Boundary                                                                    | Real trigger                                        |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| LD3 launch (`LaunchScreen`) | `RequireSession`'s `pending` in the app, account, sponsor and admin layouts | the session restore before a signed-in surface      |
| LD4 (`ApplicationSkeleton`) | `loading.tsx` of the five sidebar shells (inside the shell)                 | a route segment rendering on the server             |
| ER2 404 (`NotFoundState`)   | `app/[locale]/not-found.tsx` (catch-all, `notFound()`), `global-not-found`  | an unknown path                                     |
| Failure (`FailureView`)     | `app/[locale]/error.tsx`, `app/global-error.tsx`                            | a render error; `failureFor` reads only status/type |

No artificial delays: a state renders only while its work runs. Launch
progress is indeterminate (the app has no discrete bootstrap steps). The 404
referee count is local presentation state; its actions open registry routes
only, and search opens the Marketplace until a search capability exists.
Failure states never render an error's message, stack or digest; a 401 is not
a screen but a return to the area's sign-in with `returnTo`. Unexpected,
offline and forbidden follow the Claude Design "System states" sheet;
service unavailable is the design-system fallback (no artboard).

Stories (`src/stories/screens`, real components): `System/Loading` (Launch,
Application Skeleton in the fighter shell), `System/Errors/Not Found` (Count,
KO, Saved, frozen), `System/Errors/Error State`. `pnpm test:geometry`
(Playwright) measures them at 1440 × 900 on the static Storybook build.

## Session (SF-22)

`entities/session` is the browser's SimpleFit session (simplefit-api ADR 0010,
web cookie transport):

- The **access token** lives only in module memory (`useSyncExternalStore`, no
  library). Never in `localStorage`, `sessionStorage`, readable cookies or
  URLs. A reload loses it and `restoreSession()` gets a new one.
- The **refresh token** is the API's `HttpOnly; Secure; SameSite=Strict`
  cookie on `/api/auth`; scripts never see it. Requests that use it
  (`refreshSession`, `authenticateWithGoogle`, `logout`) pass
  `cookieTransport`: `credentials: "include"` plus `x-simplefit-csrf: 1`. The
  web origin must be in the API's `CORS_ALLOWED_ORIGINS`.
- `callWithSession(call)` adds `Authorization: Bearer`, refreshes once and
  retries once on `401`, then ends the session. Concurrent refreshes share one
  request (refresh tokens are single use).
- `signOut()` revokes the session on the API and clears it locally even when
  the request fails.
- The session gates (`features/session-gate`, SF-32) build on this module:
  `RequireSession` for AUTHENTICATED shells, `GuestOnly` for the auth shell.
  Capability, phase and restricted-account guards are added by the identity
  tickets (route-architecture §11).

**Google sign-in** (`features/sign-in-with-google`) uses Google Identity
Services: Google's own rendered button returns a Google ID token, which is
exchanged once at `POST /api/auth/google` and dropped (never stored, logged
or put in a URL). No client secret, no authorization-code flow. The GIS script
is loaded from `https://accounts.google.com/gsi/client`; a future Content
Security Policy must allow `accounts.google.com` for scripts, frames and
styles. Both `account: created` and `existing` continue to `/app`, the `ENTRY`
route that resolves the destination; the client never infers roles.

## Forms and validation

- React Hook Form + Zod (`@hookform/resolvers/zod`), rendered with the shadcn
  `Field` primitives.
- **Zod improves UX; the backend is the canonical validator.** Client schemas
  check shape and obvious input errors only. Never duplicate business rules
  (eligibility, pricing, permissions, uniqueness).
- After submit, map backend `validation_error` responses onto the form with
  `applyApiFieldErrors(error, form.setError, fields)` (`shared/lib/forms.ts`);
  unknown fields go to `root.server`.
- Validation messages shown to users go through i18n like any other copy.

## Internationalization

next-intl 4 with locale-prefixed routing, server-side message loading and
static rendering per locale.

### Locales

| Code    | Language          | Selector label   | Fallback chain  |
| ------- | ----------------- | ---------------- | --------------- |
| `en`    | English (default) | English          | en              |
| `ru`    | Russian           | Русский          | ru → en         |
| `pl`    | Polish            | Polski           | pl → en         |
| `de`    | German            | Deutsch          | de → en         |
| `uk`    | Ukrainian         | Українська       | uk → en         |
| `es`    | Spanish           | Español          | es → en         |
| `es-MX` | Spanish (Mexico)  | Español (México) | es-MX → es → en |
| `fr`    | French            | Français         | fr → en         |

The **single source of truth** is `localeRegistry` in
`src/shared/i18n/routing.ts` (code, native name, optional fallback). Routing,
the proxy, the selector, hreflang, message loading and the tests all read it.
Codes are canonical BCP 47 tags used verbatim in URLs, `<html lang>` and Intl.

`es` and `es-MX` are **distinct locales** (Mexican Spanish has its own
terminology and formatting: `1.234.567,89` vs `1,234,567.89`, 24 h vs 12 h
clock). `es-MX` stores only regional overrides and inherits the rest from `es`.

### Routing

- Every URL carries its locale: `/en`, `/es-MX/app` (`localePrefix: "always"`).
- `src/proxy.ts` (next-intl middleware):
  - non-canonical casing redirects permanently: `/es-mx/app` → `/es-MX/app`;
  - URLs without a locale are negotiated: `NEXT_LOCALE` cookie (last explicit
    choice) → `Accept-Language` best match (CLDR; `es-AR`/`es-419` → `es-MX`,
    `es-ES` → `es`) → `en`. **No geolocation**;
  - an explicit supported URL locale is **never** overridden by cookie or
    browser language.
- Unsupported locales are never treated as supported: `/pt` → `/en/pt` →
  localized 404; `app/[locale]/layout.tsx` calls `notFound()` for any
  non-registered segment.
- Use `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` from
  `@/shared/i18n/navigation`. ESLint forbids `next/link` and the
  non-localized `next/navigation` APIs (`notFound` stays allowed).
- **Every product route comes from the canonical route registry**
  (`docs/route-registry.json`, contract `docs/route-architecture.md`, SF-31):
  canonical path (without the locale), shell (layout / route group), access
  and status. `scripts/route-registry.test.mjs` fails when a page is not in
  the registry or an implemented route is missing.

### Messages

```
messages/<locale>/<namespace>.json
  common      app-wide copy (tagline, skip link, "Language")
  navigation  navigation labels
  actions     verbs on buttons and links
  errors      error pages and messages
  site        public website pages (SF-43)
  app         application shell screen
  apiHealth   API status feature
```

- English is the **source**: its files define the schema and the TypeScript
  types (`AppConfig` augmentation in `shared/i18n/next-intl.d.ts`), so unknown
  keys are compile errors.
- Messages resolve through the fallback chain (`loadMessages`): any missing key
  shows the parent locale's text, finally English, never a raw key.
- Generic namespaces (`common`, `navigation`, `actions`, `errors`) hold reusable
  copy; screen/slice namespaces are named after their owner. Add a namespace by
  creating `messages/en/<ns>.json`, adding it to `namespaces` and the
  `Messages` type in `shared/i18n/messages.ts`, then translating it.
- Only translate UI that exists. No copy for future screens.

**Adding a key:** add it to `messages/en/<ns>.json`, translate it in every
full-catalog locale (not in `es-MX` unless Mexican Spanish differs), run
`pnpm test`. The tests fail on missing keys, unknown keys, empty strings and
ICU placeholder/tag mismatches.

**Adding a locale:** add it to `localeRegistry` (with `fallback` for a
regional variant), add `messages/<locale>/` files, run `pnpm test`.

### Server vs Client usage

```tsx
// Server Component (default): no client JS for translations.
const t = await getTranslations({ locale, namespace: "app" }); // async
const t = useTranslations("site.home"); // sync

// Client Component: same hooks, messages come from NextIntlClientProvider.
("use client");
const t = useTranslations("apiHealth");
const format = useFormatter();
```

### Locale-aware formatting

Use next-intl / Intl, never hand-rolled formatting.

- Named presets in `src/shared/i18n/formats.ts`: `dateTime.date`,
  `dateTime.dateTime`, `dateTime.time`, `number.integer`, `number.decimal`,
  `number.percent`. Usage: `format.number(0.25, "percent")`,
  `format.dateTime(date, "date")`.
- **Currency is never global.** It belongs to the business context (gym,
  payment, user), not the language: `es` does not imply EUR, `es-MX` does not
  imply MXN. Always pass the code from the data:
  `format.number(price.amount, { style: "currency", currency: price.currency })`.
- **Time zone is never inferred from locale.** The foundation renders in UTC
  (explicit, identical on server and client) until users have a stored zone.

### Accessibility and SEO

- `<html lang>` is the active locale; the selector items carry `lang`.
- The selector is a keyboard-accessible Radix menu with native language names
  (no flags), preserving the current route on switch.
- Each page declares `alternates` via `localeAlternates(pathname, locale)`:
  canonical URL plus `hreflang` for every locale and `x-default` → English.
  Absolute URLs follow once `metadataBase` (production domain) is known.

### No hardcoded user-facing copy

User-facing text in reusable or product UI comes from `messages/`. Exceptions:
the brand name `siteConfig.name` (a proper noun), technical identifiers, logs,
and developer-only content. Primitives take labels as props (`closeLabel`).

**Sign in with Apple** (`features/sign-in-with-apple`, SF-23, ADR 0014 in
simplefit-api) uses Apple JS in popup mode: per attempt the button makes a
raw nonce (32 random bytes) and a `state`, sends Apple the nonce's lowercase
hex SHA-256, checks `state` on the answer and sends the identity token with
the raw nonce to `POST /api/auth/apple` (cookie transport). No Apple scopes
are requested; there is no callback route, no code exchange and no client
secret. Cancelling the popup is silent; a second click is ignored while an
attempt runs. The button uses the design-system `secondary` (bone) Button
where WA1 and O02w place it. Apple JS
(`https://appleid.cdn-apple.com/…/appleid.auth.js`) loads only on those pages;
a future Content Security Policy must allow `appleid.cdn-apple.com` (script)
and `appleid.apple.com` (popup). Apple only accepts registered HTTPS
domains, so local testing needs an HTTPS host (see `.env.example`).

## Environment

| Variable                         | Scope  | Purpose                                                                                                         |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`            | public | Base URL of the SimpleFit API, no trailing slash                                                                |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`   | public | Google OAuth **Web** client ID (optional; without it Google sign-in shows as unavailable)                       |
| `NEXT_PUBLIC_APPLE_SERVICES_ID`  | public | Sign in with Apple web Services ID (optional, with the next)                                                    |
| `NEXT_PUBLIC_APPLE_REDIRECT_URI` | public | The HTTPS Return URL registered on that Services ID (optional; without both Apple sign-in shows as unavailable) |

- `NEXT_PUBLIC_*` values are **inlined into the browser bundle at build
  time** and readable by anyone. Never put secrets there.
- Public variables are validated with Zod in `shared/config/env.ts`; read them
  as literal `process.env.NEXT_PUBLIC_X` so Next.js can inline them.
- Server-only variables (none yet) belong in a module that starts with
  `import "server-only"` (add the `server-only` package with the first one),
  are read only by server code, and are set in the deployment environment.
- `.env.example` documents every variable with a safe placeholder;
  `.env.local` and all other `.env*` files are git-ignored.

## Testing

- **Vitest + React Testing Library + jest-dom + user-event**, jsdom by default
  (`// @vitest-environment node` for server/proxy tests). Tests live next to
  the code as `*.test.ts(x)`.
- `src/test/render.tsx`: `renderWithProviders(ui, { locale })` renders with the
  real messages (fallbacks included), formats and a fresh QueryClient.
- Test behaviour through roles and accessible names. Mock the network at
  `fetch`, not the generated client.
- Async Server Components are covered by testing the synchronous components
  they compose, the functions they call, or (for layouts) the returned element.
- Covered today: env validation, ApiError/transport, generated client wiring,
  retry policy, form error mapping, locale registry and fallback chains,
  message catalog completeness for all locales, Intl formatting for all
  locales, proxy negotiation and canonicalization, `<html lang>` per locale,
  translated widgets and features, locale switching (pointer and keyboard),
  navigation state, commit message convention, the session (cookie refresh,
  single retry, sign-out, no token storage), Google sign-in with GIS
  stubbed on `window.google` (real Google is verified manually only), and
  the SF-32 route skeleton (registry → files, shells, named parameters,
  session gates, active navigation, the canonical placeholder), and the SF-34
  system states (boundaries, referee count, failure mapping without leaks).
- **Playwright geometry QA** (`pnpm test:geometry`, `e2e/`): the canonical
  layout and system-state geometry at 1440 × 900, measured on the static
  Storybook build (`pnpm storybook:build` first) and run in CI. It checks
  layout values, not pixel parity with the artboards (Design QA does that).
  E2E user flows arrive with the first meaningful user flow.

## Quality commands

| Command                             | Purpose                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `pnpm lint`                         | ESLint, zero warnings allowed                         |
| `pnpm format` / `pnpm format:check` | Prettier write / verify                               |
| `pnpm typecheck`                    | `next typegen` + `tsc --noEmit`                       |
| `pnpm test`                         | Vitest                                                |
| `pnpm build`                        | Production build (needs `NEXT_PUBLIC_API_URL`)        |
| `pnpm api:check`                    | Generated client drift                                |
| `pnpm quality`                      | lint, format:check, typecheck, test, api:check, build |

## Git and Jira conventions

**Commit messages** (enforced by commitlint in the `commit-msg` hook and in CI
for every PR commit):

Shared SimpleFit rules: [engineering-standards.md](../engineering-standards.md).

```
<type>: SF-<ticket> - <description>

feat: SF-16 - add identity domain
test: SF-16 - cover session rotation
docs: SF-16 - document authentication architecture
```

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`,
  `perf`.
- Jira key pattern `SF-[0-9]+` is mandatory; commits without it are rejected.
- No scopes (`feat(web):`), header ≤ 100 characters, blank line before body.
- The rule lives in `scripts/commit-convention.mjs` (shared by commitlint and
  its tests); commitlint's conventional preset cannot require a Jira key.
- Merge commits and git's default `Revert "…"` messages are ignored.

**Branches:** `SF-<ticket>-<kebab-description>` (e.g.
`SF-16-identity-authentication`), one per ticket and repository.

**Pull requests:** title `SF-16 — Identity Authentication`. Every change goes
through a ticket branch and a PR to `main`; PRs are merged by a human.

**Hooks** (Husky, installed by `pnpm install`):

- `pre-commit`: lint-staged runs ESLint (`--fix`) and Prettier on staged files
  only. No typecheck, tests or build (those run in `pnpm quality` and CI).
- `commit-msg`: commitlint.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:
checkout → pnpm (version from `packageManager`) → Node (from `.nvmrc`) →
`pnpm install --frozen-lockfile` → commitlint over PR commits → lint → format
check → typecheck → test → `api:check` → build → Storybook build. No deployment.

## Dependencies

Every dependency needs a current problem, a reason existing tools fall short,
and an active maintenance status. Versions are pinned exactly; pnpm enforces a
minimum release age (supply-chain protection) and dependency install scripts
are denied unless reviewed in `pnpm-workspace.yaml`.

**Added in SF-13:** `next-themes` 0.4.6 (MIT, actively maintained): class
theme switching with a pre-paint script so statically rendered pages do not
flash; a hand-written provider would have to re-implement that script, storage
sync and system preference tracking.

**Added in SF-17:** Storybook 10.6.1 (`storybook`, `@storybook/nextjs-vite`,
`@storybook/addon-docs`, `@storybook/addon-a11y`, `@storybook/addon-themes`;
MIT, actively maintained, devDependencies only).

- **Problem:** the design system needs a workshop to develop and inspect
  every primitive state in both themes and at several widths, with axe checks.
- **Why existing tools fall short:** the in-app gallery is one integration
  page, not a state catalogue.
- **Integration:** `nextjs-vite` is the official integration for Next 16 App
  Router and reuses the app's CSS, fonts and path aliases.
- **Known warning:** pnpm reports an optional peer warning (`tsconfck` wants
  TypeScript ^5; the repository uses 6). It is harmless for the Vite build.

**Added in SF-42:** `axe-core` 4.13.0 (MPL-2.0, actively maintained by Deque,
devDependency only). Already installed as a dependency of
`@storybook/addon-a11y` at the same version; SF-42 declares it directly.

- **Problem:** the public site shell's accessibility must be checked in the
  geometry suite (landmarks, names, contrast, the open menu), on the real
  production components, in CI.
- **Why existing tools fall short:** the Storybook a11y addon reports in the
  workshop UI only; nothing ran axe in CI.
- **Integration:** `e2e/site-geometry.spec.ts` injects `axe.min.js` into the
  story page and fails on any WCAG 2.1 A/AA or best-practice violation.

**Added in SF-34:** `@playwright/test` 1.63.0 (Apache-2.0, actively
maintained by Microsoft, devDependency only).

- **Problem:** the canonical layout geometry (header heights, gutters,
  sidebar width, system-state composition) must be checked deterministically
  against the Claude Design 1440 px frames.
- **Why existing tools fall short:** Vitest runs in jsdom, which has no
  layout engine; Storybook's own tests do not measure geometry.
- **Integration:** `playwright.config.ts` serves `storybook-static` with
  `scripts/serve-static.mjs` (no extra dependency); Chromium is installed
  with `pnpm exec playwright install chromium` (outside the repository).

**Deferred until a ticket needs them:** authentication libraries, Stripe,
Sentry, PostHog/analytics, XYFlow, maps, rich text, uploads, WebSocket
clients, animation libraries beyond `tw-animate-css`, `server-only`, TanStack Query Devtools, Zustand/Redux, date-fns
(Intl/next-intl cover formatting; add only for date arithmetic).

## Known limitations

- **ESLint 9** is used although npm marks it deprecated: `eslint-config-next`
  bundles `eslint-plugin-react` 7.37, which crashes on ESLint 10
  (`getFilename` removed). Upgrade when Next ships a compatible config.
- **404 pages** return the correct status, but Next.js 16.3 renders the
  not-found UI on the client (`__next_error__` shell plus the RSC payload),
  also in a bare Next app. `app/global-not-found.tsx` uses the experimental
  `globalNotFound` flag Next documents for dynamic root layouts.
- **CORS:** the backend denies cross-origin requests by default, so the
  browser-side API health check from `localhost:3000` reports "offline" until
  a backend ticket allows the web origin.
- Translations other than English were written during SF-11 and need review
  by native speakers before public launch.
- Time zone is UTC everywhere until user time zones exist.
