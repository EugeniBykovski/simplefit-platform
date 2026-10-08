# Design system (web)

The SimpleFit web design system foundation (SF-13, reconciled with the canonical design in SF-17). Mobile follows the same
language in `simplefit-mobile/docs/design-system.md`.

**Design source.** Product screens are designed in the canonical Claude Design
artifact (https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY). How to
reference, read, translate and visually QA an artboard is in
`docs/design-handoff.md`. That document is the visual source of truth; this
one is the implementation source of truth. On web, design values become
semantic token classes, `type-*` utilities, Tailwind spacing/radius steps,
`src/shared/ui` primitives and `lucide-react` icons. Known gaps between the
design and these tokens are tracked in `docs/design-reconciliation.md`.

## Design language

SimpleFit uses one visual language on web and mobile, **Graphite × Olive**
(Visual System 2026). Its values were reconciled with the canonical Claude
Design artifact in SF-17 and are fixed in **`docs/design-tokens.json`**. That
file is the cross-platform contract: it is kept identical in both
repositories, and each repository's tests assert that its implementation
matches it. The two clients share the language (token names, values, type
roles, spacing, radius, control sizes, component behaviour), not code: web
uses Tailwind CSS 4 + shadcn/Radix, mobile uses NativeWind + React Native
primitives.

Principles that shape every component:

- **Dark first.** Dark is the default theme and the **canonical,
  pixel-faithful reference**: Claude Design draws only the dark product. The
  light theme is a supported production extension; its values are derived
  for legibility and AA contrast, not designed. Do not invent light-only
  designs. Until a canonical light design exists, light screens follow the
  dark composition with the light tokens.
- **Olive = action and progress.** One olive (primary) call to action per
  screen. Secondary actions are `quiet` (graphite), `secondary` (bone),
  `outline` or `ghost`.
- **Amber = attention, coral = failure.** Signals are used only for status,
  never decoration. Status is never colour alone (text and/or icon too).
- **Calm surfaces.** Graphite layers (`background` → `surface` →
  `surface-elevated`) separated by hairline `border`s rather than shadows.
- **Bento tiles:** one metric per tile, the number set big (`metric-*` roles).
- **Skeletons for waits longer than ~300 ms**; spinners for short or
  indeterminate actions (button loading).
- **Gym mode:** primary in-workout controls use 60 pt targets.

## Token architecture

Two layers, with **identical names and values on both platforms**:

1. **Raw palette** (`palette` in the contract), referenced only in the token
   file:
   - graphite 950–600, bone (+50/200/300/400), stone 500/550/600/650/700
   - olive 200–900 (incl. 350, 500, 800)
   - amber and coral, each with 200, tints and borders

   Canonical Styleguide values: graphite 950 `#111312`, 900 `#181B19`, 850
   `#1F2320`, 700 `#2E332F`; bone `#EDEFE7`; olive 200 `#E4EAB8`, 300
   `#C9D17E`, 400 `#AEB95A`, 600 `#4E5626`, 900 `#262B15`; amber `#E3A24F`;
   coral `#E07A5F`. Steps the Styleguide does not list come from the
   artboards (e.g. secondary text `#A7AD9F`, tertiary text `#848B80`) or are
   derived for the light theme.

2. **Semantic tokens** (what components use):

| Token                                                                                                    | Purpose                                                                             |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `background` / `foreground`                                                                              | Page and default text                                                               |
| `surface` (+`-foreground`), `surface-subtle`, `surface-elevated`                                         | Cards and fields, wells, quiet controls / dialogs / popovers                        |
| `surface-sunken`                                                                                         | Below the page: the public-site footer band (SF-42)                                 |
| `muted` / `muted-foreground`                                                                             | Quiet fills; **secondary** text                                                     |
| `faint-foreground`                                                                                       | **Tertiary** text: metadata, helper copy, inactive icons                            |
| `border`, `border-strong`, `input`, `ring`                                                               | Hairlines, stronger dividers / handles, control borders, focus indicator            |
| `border-subtle`                                                                                          | The public-site header and footer hairline, `#1F2320` (SF-42)                       |
| `overlay`                                                                                                | Modal scrim                                                                         |
| `primary` / `primary-foreground`, `primary-muted`                                                        | The one olive call to action; olive mid-tone for outline borders and progress steps |
| `secondary` / `secondary-foreground`                                                                     | High-contrast neutral (bone) action, selected segment                               |
| `highlight` / `highlight-foreground`                                                                     | Olive text, links, kickers, active icons; olive emphasis fills (avatars, progress)  |
| `accent` / `accent-foreground`, `accent-muted-foreground`, `accent-strong`, `accent-border`              | Selection and olive-tinted surfaces, their secondary text, chips, their border      |
| `destructive`, `success`, `warning`, `info` (+`-foreground`, `-subtle`, `-subtle-foreground`, `-border`) | Status: solid, tinted, and the tinted surface's border                              |

Every text/background pair in `contrast.text` meets **WCAG AA (4.5:1)** in
both themes, and `ring` meets 3:1. The tests compute the ratios from the
token values, so a token change that breaks contrast fails CI. Where an
artboard uses a lower-contrast value (e.g. `#5B615C` meta text, 2.9:1),
production keeps the accessible token: an accessibility override.

**Type roles** are the only way to size text: no other font sizes exist. The
same roles exist on both platforms: web `type-<role>` utilities, mobile
`<Text variant>` in camelCase.

| Role                                               | Size / line                           | Family, weight                        | Use                                      |
| -------------------------------------------------- | ------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `display`                                          | 44 / 48                               | Unbounded 600, −0.02em                | Hero                                     |
| `h1`                                               | 26 / 30                               | Unbounded 600, −0.02em                | Mobile screen title, email title         |
| `h2`                                               | 22 / 26                               | Unbounded 600, −0.02em                | Web page title, section title            |
| `h3`                                               | 19 / 24                               | Unbounded 600, −0.01em                | Sheet / modal / mobile section title     |
| `title`                                            | 15 / 20                               | Unbounded 600                         | Card and panel title                     |
| `metric-xl` · `metric-lg` · `metric` · `metric-sm` | 30 / 34 · 26 / 30 · 22 / 26 · 18 / 22 | Unbounded 700, −0.03em, tabular       | Bento numbers, prices, timers            |
| `body-lg`                                          | 15 / 22                               | Manrope 400                           | Primary mobile copy, mobile field values |
| `body`                                             | 14 / 21                               | Manrope 400                           | Mobile body copy                         |
| `body-sm`                                          | 13 / 20                               | Manrope 400                           | Web body copy, table rows, web controls  |
| `caption`                                          | 12 / 18                               | Manrope 400                           | Meta and helper text, field labels (700) |
| `micro`                                            | 11 / 16                               | Manrope 400                           | Small meta                               |
| `badge`                                            | 10 / 14                               | Manrope 800, uppercase                | Status pills                             |
| `label-lg`                                         | 11 / 16                               | JetBrains Mono 400, 0.16em, uppercase | Large kickers (web, email)               |
| `label`                                            | 10 / 14                               | JetBrains Mono 400, 0.14em, uppercase | Kickers, section labels, metadata        |

**Weights:** Unbounded 600 (headings) and 700 (metrics). Manrope 400 (role
default), 600 (field values), 700 (labels, names), 800 (emphasis and every
button label). JetBrains Mono 400. No other weights are loaded or allowed.

**Spacing** uses only these steps (Tailwind keys, 1 step = 4 px):

| Key | 0.5 | 1   | 1.5 | 2   | 2.5 | 3   | 3.5 | 4   | 4.5 | 5   | 5.5 | 6   | 6.5 | 8   | 9   | 10  | 12  | 14  | 16  | 20  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| px  | 2   | 4   | 6   | 8   | 10  | 12  | 14  | 16  | 18  | 20  | 22  | 24  | 26  | 32  | 36  | 40  | 48  | 56  | 64  | 80  |

The canonical design spaces in 2 px steps up to 24, then 32–64. 80 is the
public-website section rhythm; 26 and 36 are the public-website header and
footer rhythm (SF-42: the 26 px between site links, the 36 px between header
items and above and below the footer). ESLint rejects other steps and arbitrary
values in product code.

**Radius** (`rounded-*`): `xs` 6 (marks), `sm` 9 (badges, small tiles),
`md` 12 (compact controls ≤ 48 px: web buttons and fields, chips), `md-lg`
14 (public-site controls 40–46 px, such as the 42 px header Get started;
SF-42), `lg` 16
(mobile fields, banners), `xl` 18 (primary CTAs 50–56 px), `2xl` 20 (compact
cards), `3xl` 22 (cards), `4xl` 28 (sheets, dialogs), `full` (pills, circles,
segmented controls, toggles).

**Controls** (`controls` in the contract):

|                     | Web                                                                       | Mobile                                             |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Button `sm`         | 32, `md`, body-sm 800                                                     | 36 pill, body-sm 800, touch target extended to 44  |
| Button `md`         | 40, `md`, body-sm 800 (default)                                           | 50, `xl`, body 800 (default)                       |
| Button `lg`         | 48, `md`, body-sm 800                                                     | 56, `xl`, body-lg 800 (main action)                |
| Button `xl` / `gym` | `xl` 54, `xl`, body-lg 800 (hero, checkout)                               | `gym` 60, `2xl`, body-lg 800                       |
| Button `site`       | 42, `md-lg`, body 800, 18 px sides, no border (public-site header, SF-42) | —                                                  |
| Field               | 40, `md`, body-sm, `surface` well, hairline `border`, olive focus border  | 54, `lg`, body-lg 600, same colours                |
| Field label         | caption 700, `muted-foreground`                                           | same                                               |
| Badge               | badge role, `sm`, padding 4 × 9                                           | same                                               |
| Card                | `3xl`, padding 18 × 20; compact `2xl`, 14 × 16                            | same                                               |
| Switch              | 44 × 26                                                                   | native switch (platform convention), token colours |

Button variants on both platforms: `primary`, `secondary`, `quiet`,
`outline`, `ghost`, `destructive`, `destructive-subtle` (mobile
`destructiveSubtle`); web adds `link`. Web and mobile heights differ on
purpose: pointer versus touch.

**Elevation** is semantic: surfaces and borders first; shadows (web:
`shadow-raised`, `shadow-overlay`, `shadow-modal`) only for floating layers.
**Motion:** short (150 ms) colour/opacity transitions; no decorative
animation in product UI; reduced motion respected. **Exception (SF-34):** the
approved system states of Claude Design section 35 (launch, loading, 404)
carry their designed motion: `animate-system-*` (logo ring, corner posts,
drawn "S", glow, running bar, indeterminate segments, pop, shake) and the
`skeleton-shimmer` sweeps in `theme.css`. All of it stops under
`prefers-reduced-motion` (`reduce` on mobile) and leaves the static layout.

### System-state typography (SF-34)

`typography.systemRoles` in `docs/design-tokens.json` extends the SF-17 type
scale for system states only (launch wordmark, 404 headline and numerals).
Each role has a value per frame: web 1440 (`type-*` utilities in `theme.css`)
and mobile 390 (NativeWind `text-*`).

| Role         | Web                     | Mobile  | Use                         |
| ------------ | ----------------------- | ------- | --------------------------- |
| `hero`       | 52/56 Unbounded 600     | 28/30   | 404 headline                |
| `lead`       | 17/26 Manrope 400       | —       | 404 explanation (web)       |
| `wordmark`   | 44/42 Unbounded 700     | 36/34   | Launch wordmark "SimpleFit" |
| `numeral`    | 200/200 Unbounded 700   | 112/112 | Referee count numeral       |
| `numeral-ko` | 168/152 Unbounded 700   | 92/84   | Knockout "404"              |
| `label-wide` | 11/14 mono 600, 0.62 em | same    | "BOXING" under the wordmark |
| `count-word` | 12/16 mono, 0.3 em      | same    | 404 count word ("ONE")      |

Product screens keep using the roles above; a new system role needs a design
reason and a contract test, never a one-off value.

### Authentication typography and controls (SF-24)

`typography.authRoles` extends the scale for the authentication screens
only (Claude Design onboarding page: WA1/WA1b, O02w, WA3/WA4, WA4b, A01,
O01c/O03), with a web (1440) and a mobile (390) value per role, by decision
in SF-24 instead of off-scale local values.

| Role           | Web                 | Mobile | Use                                 |
| -------------- | ------------------- | ------ | ----------------------------------- |
| `auth-display` | 52/54 Unbounded 600 | —      | O02w "Join the boxing community."   |
| `auth-hero`    | 48/50 Unbounded 600 | 31/35  | WA1 panel "Welcome back.", A01 hero |
| `auth-title`   | 34/38 Unbounded 600 | —      | WA3, WA4, WA4b headings             |
| `auth-heading` | 30/34 Unbounded 600 | —      | WA1, WA1b form headings             |
| `auth-lead`    | 17/26 Manrope 400   | —      | O02w lead                           |
| `code-digit`   | 30/34 Unbounded 700 | 24/28  | the six code cells                  |

`controls.field.webLarge` is the 44 px, body 600 email field of the web auth
screens (`<Input fieldSize="lg">`). The auth CTAs use the existing `xl`
button (54 px, radius `xl`); the designed 50 and 52 px buttons translate to
it.

Primitives added with them: `CodeInput` (Claude Design component
"AuthCodeInput": one `one-time-code` input over six decorative cells, states
typing, filled, error, expired, submitting, success, locked; 66 × 78 cells,
fluid below `sm`), `Notice` (olive, amber, coral and muted status boxes) and
`textLinkClass` (inline text actions).

Also from SF-34: the product role `brand` (Unbounded 13/16, 600, −0.01 em)
for the wordmark in product chrome (the FighterWebNav sidebar), and mono 600
(`typography.weights.mono`) for the "BOXING" label and the 404 KO tag. The
`Button` gains the `warning` variant (amber action of warning-tone system
states) and the `system` size (44 px, radius `md`, body-sm 800: the action of
the system-state cards), on web and mobile.

### Public website shell (SF-42)

The header and footer every public-website artboard shares (Claude Design
`1791448557-b0b9`), measured and matched 1:1 at 1440. The values the scales
lacked became contract tokens rather than local values (handoff §8.1, case
3), because they recur on every public page: spacing `6.5` (26) and `9`
(36), radius `md-lg` (14), `surface-sunken` (`#0D0E0D`, the footer band) and
`border-subtle` (`#1F2320`, the header and footer hairline), the Button
`site` size, and four public-site type roles that keep the artboards'
natural line boxes (`typography.siteRoles.web`):

| Role                | Size / line | Family, weight                        | Use                         |
| ------------------- | ----------- | ------------------------------------- | --------------------------- |
| `site-nav`          | 14 / 19     | Manrope 600                           | Header links, Sign in (700) |
| `site-footer-label` | 10 / 13     | JetBrains Mono 400, 0.14em, uppercase | Footer column labels        |
| `site-footer-link`  | 13 / 18     | Manrope 400                           | Footer links and entries    |
| `site-footer-blurb` | 12 / 19.2   | Manrope 400                           | Footer brand blurb          |

Use them only in the shell (`widgets/site-header`); pages use the product
roles.

The brand lockup's wordmark has three sizes (`BrandWordmark size`): `sm` 14
(`type-auth-wordmark-sm`, the 72 px auth header of WA3, WA4 and WA4b), `md` 15
(`type-title`, the site header and product chrome) and `lg` 16
(`type-auth-wordmark`, the WA1 / WA1b brand panel). The auth header hairline
is `border-subtle`, as the artboards draw it.

### System-state colour compositions (SF-34)

No new colour tokens. `theme.css` composes the existing semantic tokens:
`bg-system-glow` (radial `accent` → `background`, position via
`--glow-x`/`--glow-y`), `bg-system-mark-glow` (`primary` at 22 %),
`skeleton-shimmer` (`muted` → `border`), `skeleton-shimmer-accent`
(`accent`/`accent-strong` mix → `accent-strong`). Artboard literals map to the
nearest roles: `#0D0E0D` → `background`, `#141614` → `surface-subtle`,
`#23272A` → `border`, `#2E332F` → `input`, `#3A403B` → `border-strong`,
`#C9CDBF` → `foreground` at 80 %, `#5B615C`/`#3A403B` meta text →
`faint-foreground` (contrast, SF-17).

## Accessibility

- Every interactive primitive has a role, an accessible name (labels are
  props, never built-in copy), and reports disabled/checked/selected/busy
  state.
- Visible focus (web `focus-visible` ring using `ring`), 44 pt minimum touch
  targets on mobile (60 pt gym mode).
- Errors are announced (live region / `alert`) and shown by text plus border,
  never colour alone; status badges always carry a text label.
- Text scales with the user's font size (mobile up to 2×).
- Contrast is tested (see above).

## How domain components consume the system

Feature and widget components compose primitives from `shared/ui` and style
layout with semantic token classes. They do not:

- use raw colours, hex values, arbitrary colour values or palette names
  (ESLint rejects them),
- restyle a primitive's colours from outside (add a variant to the primitive
  instead, if a real screen needs it),
- add copy to primitives (pass translated labels as props).

Add a variant or a new primitive only when a real screen needs it, with a test
and an entry in the gallery.

## Web implementation

**Files**

- `src/shared/styles/tokens.css`: raw palette and the semantic tokens for
  dark (`:root, .dark`) and light (`.light`).
- `src/shared/styles/theme.css`:
  - `@theme` resets Tailwind's default colour palette, radius scale and
    font-size scale (`--color-*`, `--radius-*`, `--text-*: initial`).
  - `@theme inline` maps each semantic token to a colour utility
    (`bg-surface`, `text-faint-foreground`, `border-accent-border`).
  - It also defines the fonts, the radius scale, shadows and easing, and the
    `type-*` role utilities, generated from the contract.
  - shadcn names are aliases (`card` → surface, `popover` →
    surface-elevated), so each concept has one value.
- `src/shared/styles/fonts.ts`: Unbounded, Manrope and JetBrains Mono via
  `next/font/google`: variable fonts, self-hosted at build time, Latin +
  Cyrillic, `swap`. Exposed as CSS variables on `<html>`.
- `src/app/globals.css`: `@custom-variant dark` (class-based) and base
  styles (`type-body bg-background text-foreground`).

**Theme.** `next-themes` in `app/[locale]/providers.tsx`:

- **Configuration:** `attribute="class"`, `defaultTheme="dark"`, themes
  `light`/`dark` + system, stored under `simplefit-theme`.
- **No flash:** its initialisation script runs from the server HTML and sets
  the class before paint.
- **Client mounts:** when the provider mounts on the client (a locale
  navigation remounts the `[locale]` layout), the script is rendered as an
  inert data block (`scriptProps.type`), because a client-created script never
  runs and React 19 reports it. The provider applies the theme itself.
  `providers.test.tsx` / `providers.server.test.tsx` guard both halves.
- **Switcher:** `ThemeSwitcher` (`features/switch-theme`, translated in all
  locales) lives in the site header and app shell.
- Use the `dark:` variant only for genuine exceptions; tokens already switch.

**Rules**

- Tailwind classes on the component, semantic tokens only. ESLint rejects hex
  values, arbitrary colours (`bg-[#…]`, `text-[rgb(…)]`) and default palette
  classes (`bg-red-500`) in `className`, `cn()` and `cva()`.
- Text is sized only by `type-*` roles. A role's weight may be raised with
  `font-semibold`, `font-bold` or `font-extrabold`, which override it.
  - ESLint rejects:
    - Tailwind's default sizes (`text-sm`), leading/tracking presets
    - weights the contract does not use (`font-medium`)
    - bare `rounded`
    - arbitrary spacing, radius and type values
    - spacing steps outside the scale
  - Primitives in `src/shared/ui` are exempt only from the last two: they
    own their internal geometry.
- Platform exception: inputs and textareas render 16 px text below `md` so iOS
  Safari does not zoom on focus.
- Variants with `cva`, merged with `cn` (clsx + tailwind-merge).
- No CSS modules, styled-components/emotion or static inline styles.
  **Dynamic `style` is allowed** only for runtime values (computed sizes,
  positions, a CSS variable chosen at runtime, e.g. the gallery's palette
  swatches) and libraries that require it.

**Primitives** (`src/shared/ui`, shadcn/Radix, locally owned):

| Primitive                                                         | Notes                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                          | Variants `primary` (default), `secondary`, `quiet`, `outline`, `ghost`, `destructive`, `destructive-subtle`, `link`. Sizes `sm` 32, `md` 40, `lg` 48, `xl` 54, `icon`, `icon-sm`. Labels Manrope 800. `loading` (spinner, disabled, `aria-busy`); `asChild` |
| `Badge`                                                           | `neutral`, `primary`, `accent`, `success`, `warning`, `destructive`, `info`, `outline`; `type-badge`, radius `sm`                                                                                                                                           |
| `Spinner`                                                         | Labelled = `role="status"`; unlabelled = decorative; stops with reduced motion                                                                                                                                                                              |
| `Input`, `Textarea`, `Select`                                     | 40 px, radius `md`, `type-body-sm`, `surface` well, hairline `border`, olive focus border + `ring`, `aria-invalid` styling                                                                                                                                  |
| `Label`, `Field`                                                  | Field label above a control: caption 700 muted; inline label (checkbox, switch): body-sm 700                                                                                                                                                                |
| `Checkbox`, `RadioGroup`, `Switch`                                | Switch 44 × 26 (sm 34 × 20)                                                                                                                                                                                                                                 |
| `Card`                                                            | `surface`, radius `3xl`, padding 18 × 20; `size="sm"`: `2xl`, 14 × 16; `CardTitle` = `type-title`                                                                                                                                                           |
| `Tabs`                                                            | Segmented pill track on `surface`; selected segment `secondary` (bone) 800; `line` variant                                                                                                                                                                  |
| `Separator`, `Skeleton`, `Avatar`                                 | Avatar initials on `highlight` in Unbounded 700                                                                                                                                                                                                             |
| `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Tooltip`, `Sonner` | `surface-elevated`, `overlay` scrim, `shadow-overlay`/`shadow-modal`. Dialog radius `4xl`; titles `type-h3`; menu section labels `type-label`. Dialog/Sheet require `closeLabel`                                                                            |

**Icons:** `lucide-react` only, decorative (`aria-hidden`) next to text or
inside a labelled control.

### Layout primitives (SF-34)

The canonical web geometry of the Claude Design 1440 px frames lives in
primitives; screens never add their own page margins:

- `Container` (`size="site"`): public site, auth and system pages. 64 px
  gutters at desktop (1312 px of content), centred beyond 1440 px; 16/24/32 px
  below `lg`.
- `Container` (`size="app"`): the fluid content column beside a shell
  sidebar, 32 px gutters at desktop (16/24 below).
- `PageHeader`: the 76 px page header with a hairline (title, page actions);
  `PageBody`: 24 px top and bottom. Both take `inset="app" | "site"` to line
  up with their frame.
- Shells: `SiteHeader` 76 px on the site Container; `WorkspaceShell` sidebar
  240 px with 22/14 px padding, nav items 38 px (radius `md`), the active
  item on `accent` / `accent-foreground` with a `highlight` icon; `<main>`
  has no padding. `AppFrame` and `AuthShell` headers are 76 px on the site
  Container.
- `Skeleton` gains `motion="shimmer"` and `tone="accent"` (the loading
  artboards' sweep and its olive variant); the default stays the SF-13 pulse.

## Gallery

`pnpm dev`, then open **http://localhost:3000/en/dev/design-system** (any
locale prefix works). It shows every type role and weight, the semantic
surfaces, text and border colours, the raw palette, the spacing and radius
scales, every button variant, size and state, form controls, badges, default
and compact cards, skeleton/spinner, dialog, menu, tooltip, toasts, tabs and
avatars, with the theme switcher. The
route calls `notFound()` when `NODE_ENV === "production"` and is `noindex`,
so production builds return 404. The gallery is developer-facing and not
translated by design.

## Storybook

Storybook is the **component workshop** for the production primitives:
development, every state, theme and viewport inspection, and supplemental
accessibility checks. It is web-only; mobile keeps its in-app gallery.

```bash
pnpm storybook        # http://localhost:6006
pnpm storybook:build  # static build in storybook-static/ (CI builds it on every run)
```

**Architecture.**

- **Framework:** Storybook 10 with `@storybook/nextjs-vite`, the official
  Next.js (App Router, Next 16) integration on Vite.
- **Addons:** `addon-docs` (autodocs), `addon-a11y` (axe), `addon-themes`.
- **Same styles as the app:** `.storybook/preview.tsx` imports the app's
  `globals.css` (Tailwind, `tokens.css`, `theme.css`) and puts the same
  `next/font` variables on `<html>`.
- **Theme toolbar:** toggles the same `dark` / `light` class next-themes
  uses. Dark is the default and the canonical reference.
- **No duplication:** there is no Storybook-only style, token value or
  component. Stories import the real primitives from `src/shared/ui`.
- **Viewports** (toolbar): phone web 390, narrow 320, tablet 768, desktop 1440. They are QA tools, not canonical responsive designs.
- **Accessibility:** axe runs in the a11y panel. The `region` (landmark) rule
  is off because an isolated story is not a page. The repository's
  role-based tests and the contract's contrast tests stay authoritative.
  Radix's outside-hiding while a menu or select is open shows as
  `aria-hidden-focus` in the axe panel: expected Radix behaviour.
- **Production isolation:** stories and `.storybook/` are never imported by
  application code. Stories are not routes, and Storybook packages are
  devDependencies only, so the Next.js build is unaffected.

**Organisation.**

- **Foundations** (`src/shared/styles/*.stories.tsx`): Colors, Typography,
  Spacing, Radius, Icons. They read names and values from
  `docs/design-tokens.json` and render the live CSS variables and real
  utilities. Class maps use `satisfies` against the contract, so a new role
  or step without a story fails the typecheck.
- **Components** (`src/shared/ui/<primitive>.stories.tsx`, title
  `Components/<Name>`): meaningful production states (variants, sizes,
  disabled, loading, invalid, focus, open). Behaviour stories use play
  functions (`storybook/test`).

**When stories are required.**

- Every new or changed reusable primitive in `src/shared/ui` adds or updates
  its stories in the same ticket.
- Composed patterns and domain components get stories once they are reused or
  have meaningful state complexity.
- One-off screen compositions do not.

**Relationship to the other surfaces.**

- **Claude Design:** the visual source of truth.
- **Storybook:** component development, states, visual and accessibility
  inspection.
- **In-app gallery** (`/[locale]/dev/design-system`): kept. It is the
  integration smoke test inside the real application. It runs:
  - the real root layout, next-intl messages and locale routing;
  - the next-themes provider and the translated `ThemeSwitcher`;
  - the global Toaster and the production `notFound()` guard.

  Storybook does not cover these.

- **Pixel fidelity:** neither surface proves fidelity to a product artboard.
  That is checked against the exact Claude Design artboard in each feature
  ticket (`docs/design-handoff.md` §11).

## Testing

- `shared/styles/tokens.test.ts`:
  - `tokens.css` and `theme.css` match `docs/design-tokens.json` (palette,
    every semantic token in both themes, radius scale, every `type-*` role,
    allowed weights).
  - The contract's WCAG contrast pairs.
  - The palette, radius and font-size resets.
- `shared/ui/button.test.tsx`: Button variants and canonical sizes,
  loading/disabled, `asChild`; Badge roles; Spinner semantics.
- `app/[locale]/providers*.test.tsx`: the theme script is executable in the
  server HTML and inert on client mounts.
- `features/switch-theme`: switching and persistence.
- `widgets/design-system-gallery`: renders every family, role and size.
- `scripts/design-handoff.test.mjs`: handoff metadata (SF-16).
- Tests query by role and name; no snapshots.
