@AGENTS.md

# CLAUDE.md — SimpleFit Platform engineering rules

Rules for every Claude Code session in this repository. They are
non-negotiable unless the Jira ticket you are working on explicitly says
otherwise. If a ticket seems to require breaking one, stop and ask.

Read `docs/engineering-standards.md` (shared SimpleFit workflow, commits,
ownership, quality gates, Definition of Done) and `docs/architecture/README.md`
before structural changes, `docs/design-system.md` before any UI work, and
`docs/design-handoff.md` before implementing any designed screen. For Next.js 16
APIs, read the version-matched docs in `node_modules/next/dist/docs/` (see
AGENTS.md, which `next dev` maintains; keep it committed).

## What this is

The canonical SimpleFit Boxing web client: Next.js 16 App Router, React 19,
TypeScript 6 strict, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query,
React Hook Form + Zod, next-intl, Orval-generated API client. Backend:
`../simplefit-api` (Phoenix), which owns the OpenAPI contract.

## Non-negotiable rules

### Backend and API contract

1. **The Phoenix backend owns business logic**: validation, authorization,
   pricing, state transitions, permissions. The web client renders and calls
   the API; it never re-implements or decides business rules.
2. **The backend OpenAPI artifact is canonical.** API contract changes
   originate in `simplefit-api`; this repo consumes them via
   `pnpm api:generate`. Never propose a contract by editing this repo.
3. **Never manually duplicate DTOs.** Use types from
   `src/shared/api/generated/model`. Compose or narrow them; never redefine.
4. **Never manually edit generated code** (`src/shared/api/generated/`,
   `openapi/simplefit.api.json`). Regenerate, then `pnpm api:check`.
5. **No direct database access** of any kind.
6. Errors from the API are `ApiError`: branch on `code`, never on `message`.

### Architecture

7. **FSD-lite**: `app → widgets → features → entities → shared`. Import only
   rightwards; no same-layer slice imports; slices expose one `index.ts`; no
   other barrels. Create slices and folders only for real code.
8. **Server Components by default.** Add `"use client"` only for state,
   effects, event handlers, browser APIs or client hooks, and keep client
   islands at the leaves.
9. **No speculative global state.** Server data: Server Components, or
   TanStack Query in Client Components. No Redux; no Zustand or other store
   until a ticket demonstrates the need.
10. Client form validation (Zod) is for UX only. Never duplicate backend
    business validation; surface backend `validation_error`s with
    `applyApiFieldErrors`.

### Internationalization

11. **All new user-facing product copy must use the established i18n system**
    (`messages/<locale>/<namespace>.json`, `useTranslations` /
    `getTranslations`). Do not introduce hardcoded user-facing strings into
    reusable or product UI. Primitives take labels as props.
12. Supported locales come only from `localeRegistry` in
    `src/shared/i18n/routing.ts`: `en` (default, final fallback), `ru`, `pl`,
    `de`, `uk`, `es`, `es-MX` (falls back to `es`), `fr`. Never duplicate the
    locale list elsewhere.
13. English messages are the source and schema. Add every new key to `en`
    and all full-catalog locales in the same change; `es-MX` only gets keys
    that differ from `es`. Never write copy for screens that do not exist.
14. Navigate with `@/shared/i18n/navigation` (`Link`, `useRouter`,
    `usePathname`, `redirect`), never `next/link` or non-localized
    `next/navigation` APIs.
15. Format with next-intl/Intl (`useFormatter`, `getFormatter`, presets in
    `shared/i18n/formats.ts`). Never hand-format numbers or dates. Never infer
    currency or time zone from locale: currency codes come from the data.

### UI quality

16. **Accessibility is required**: semantic HTML, labelled controls, keyboard
    operability, visible focus, sufficient contrast, correct `lang`. ESLint
    jsx-a11y rules must pass.
17. **Responsive behaviour is required**: mobile-first, works from 320 px up.
18. **Utility-first styling**: Tailwind classes directly on components with
    semantic tokens (`bg-surface`, `text-muted-foreground`) and `type-*`
    typography, never raw colours, hex values or default palette classes
    (ESLint enforces it). Lucide is the only icon set. No CSS modules, styled-components/emotion or static inline style
    objects (ESLint enforces it); inline `style` only for runtime-computed
    values or libraries that require it. Add shadcn primitives with
    `pnpm ui:add <name>`.
19. **Design handoff** (`docs/design-handoff.md`). The canonical product
    design is the Claude Design artifact
    https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY. It is the visual source
    of truth; SF-13 tokens and primitives are the implementation source of
    truth. Before implementing a screen, read its referenced artboard source
    (`project/<Name>.dc.html` + `project/canvas.json`) with the Artifact tool.
    Never work from screenshots or memory. Translate every value through
    SF-13 tokens, primitives, Lucide and i18n. Never copy `.dc.html` markup,
    hex values or design files into the repo. Off-scale values follow §8.1:
    nearest step within tolerance, otherwise stop and ask. Build domain
    components and shells only when a ticket first needs them. Never change
    tokens to follow an artboard without an explicit decision. Every UI PR
    carries a Design QA section (§11). This repo owns `desktop-web`,
    `sponsor-portal`, `admin`, `public-website` and the 1440 px `onboarding`
    artboards. Never modify the design artifact, and never run `/design-sync`
    unless a ticket asks.

### Code quality

20. **Strict TypeScript.** No `any`, no `@ts-ignore`, no non-null assertions
    to silence real nullability. Fix lint/type errors; never suppress them.
21. **Tests accompany meaningful behaviour** (Vitest + Testing Library).
    Query by role and accessible name; mock the network at `fetch`.
22. **No speculative dependencies.** A new dependency needs: the current
    problem, why existing tools fall short, maintenance status, license. Pin
    exact versions, respect the pnpm release-age gate, review install scripts
    in `pnpm-workspace.yaml`, and update the dependency list in
    `docs/architecture/README.md`.
23. Avoid speculative abstractions and empty "future" modules. No TODO code
    disguised as finished work.

### Security

24. **Secrets never enter Git.** No keys, tokens or real `.env` files. Only
    `.env.example` is committed; document every variable there.
25. **Never expose secrets through `NEXT_PUBLIC_*`**: those values ship to
    every browser. Server-only values are read only in server-only modules.

### Git and Jira

26. **A Jira key is required in every commit:**
    `<type>: SF-<ticket> - <description>`, e.g. `feat: SF-16 - add identity domain`.
    Types: feat, fix, refactor, test, docs, chore, build, ci, perf.
    Never bypass hooks (`--no-verify`).
27. **Branch per ticket from `main`**: `SF-<ticket>-<kebab-description>`
    (e.g. `SF-16-identity-authentication`). Never commit or push to `main`,
    never force-push it, never rewrite pushed history. Run
    `pnpm install --frozen-lockfile` and `pnpm quality` before pushing; PR title
    `SF-<ticket> — <Title>`. **Never merge a PR** unless the user explicitly
    asks. Keep changes to the ticket's scope and finish with the final report
    described in `docs/engineering-standards.md` §12.

## Commands

```bash
pnpm install          # Node 24 (.nvmrc) + pnpm 12 (corepack); installs git hooks
pnpm dev              # http://localhost:3000 (redirects to /<locale>)
pnpm quality          # lint, format:check, typecheck, test, api:check, build
pnpm test             # Vitest
pnpm api:generate     # sync backend OpenAPI snapshot + regenerate client
pnpm api:check        # fail on contract or generated-code drift
pnpm ui:add <name>    # add a shadcn/ui primitive the repo's way
```

**Definition of done:** `pnpm quality` passes, behaviour is tested, all
user-facing copy is translated for every locale, the generated client is
current, and docs are updated when a convention or dependency changed.
