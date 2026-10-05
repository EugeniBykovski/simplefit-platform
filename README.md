# SimpleFit Platform

The web platform of **SimpleFit Boxing**, the operating system and
professional network for boxing. One Next.js application will host the public
website, Fighter/Coach/Gym web, the desktop application experience, the
Sponsor portal and Admin. This repository currently contains the
**foundation** (SF-11): architecture, design-system boundaries, API client,
i18n, quality tooling and CI.

The backend lives in [`simplefit-api`](https://github.com/EugeniBykovski/simplefit-api)
(Phoenix) and owns business logic and the API contract.

## Requirements

- Node.js **24.21** (`nvm use` reads `.nvmrc`)
- pnpm **12.9.1** via Corepack (`corepack enable`; the version comes from
  `packageManager` in `package.json`)

## Getting started

```bash
nvm use
corepack enable
pnpm install                  # also installs the git hooks
cp .env.example .env.local    # then adjust if your API is not on :4000
pnpm dev                      # http://localhost:3000 → /en (or your browser language)
```

Foundation routes, available for every locale:

| Route           | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `/<locale>`     | Public home (identifies SimpleFit Boxing)                        |
| `/<locale>/app` | Future authenticated application shell, with an API health check |

Supported locales: `en` (default), `ru`, `pl`, `de`, `uk`, `es`, `es-MX`, `fr`.
Unprefixed URLs are redirected using your last choice or browser language;
explicit locale URLs are always respected.

## Scripts

| Command                                  | Purpose                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop / production build / serve build                                       |
| `pnpm lint`                              | ESLint (zero warnings)                                                         |
| `pnpm format` / `pnpm format:check`      | Prettier                                                                       |
| `pnpm typecheck`                         | Route types + `tsc --noEmit`                                                   |
| `pnpm test` / `pnpm test:watch`          | Vitest                                                                         |
| `pnpm quality`                           | Everything CI runs: lint, format, types, tests, API drift, build               |
| `pnpm api:sync`                          | Copy the backend OpenAPI artifact into `openapi/`                              |
| `pnpm api:generate`                      | Sync (if the backend is checked out next to this repo) + regenerate the client |
| `pnpm api:check`                         | Fail if the generated client or snapshot drifted                               |
| `pnpm ui:add <name>`                     | Add a shadcn/ui primitive into `src/shared/ui`                                 |

## API client

The backend's `openapi/simplefit.api.json` is the contract. Run
`pnpm api:generate` after a backend API change and commit the updated
`openapi/` snapshot and `src/shared/api/generated/` together. Generated code
is never edited by hand. Server Components call the generated functions;
Client Components use the generated TanStack Query hooks.

## Environment

| Variable              | Scope                          | Example                 |
| --------------------- | ------------------------------ | ----------------------- |
| `NEXT_PUBLIC_API_URL` | public (in the browser bundle) | `http://localhost:4000` |

`NEXT_PUBLIC_*` values are public. Secrets never use that prefix and never go
into Git; only `.env.example` is committed.

## Conventions

- Shared SimpleFit standards (workflow, ownership, quality gates, Definition of
  Done): [docs/engineering-standards.md](docs/engineering-standards.md).
- Branches: `SF-<ticket>-<kebab-description>`, e.g. `SF-16-identity-authentication`.
- Commits: `<type>: SF-<ticket> - <description>`, e.g. `feat: SF-16 - add identity domain`
  (enforced by commitlint locally and in CI).
- PR titles: `SF-16 — Identity Authentication`; PRs are merged by a human.
- All user-facing copy goes through `messages/` (next-intl).

## Documentation

- [Architecture](docs/architecture/README.md): FSD-lite, Server/Client
  components, Tailwind tokens, shadcn/ui, Orval, TanStack Query, forms, i18n,
  testing, CI, dependencies and known limitations.
- [CLAUDE.md](CLAUDE.md): non-negotiable engineering rules.
