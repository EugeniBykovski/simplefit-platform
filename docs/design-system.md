# Design system (web)

The SimpleFit web design system foundation (SF-13). Mobile follows the same
language in `simplefit-mobile/docs/design-system.md`.

## Design language

SimpleFit uses one visual language on web and mobile, **Graphite × Olive**
(Visual System 2026). The two clients share the language (token names,
values, type scale, spacing, radius, component behaviour), not code: web uses
Tailwind CSS 4 + shadcn/Radix, mobile uses NativeWind + React Native
primitives.

Principles that shape every component:

- **Dark first.** Dark is the default theme; light is available and switchable.
- **Olive = action and progress.** One olive (primary) call to action per
  screen. Secondary actions are bone/graphite, outline or ghost.
- **Amber = attention, coral = failure.** Signals are used only for status;
  never decoration. Status is never colour alone (text and/or icon too).
- **Calm surfaces.** Graphite layers (`background` → `surface` →
  `surface-elevated`) separated by hairline `border`s rather than shadows.
- **Cards 22 pt/px radius**, controls 14, pills full.
- **Skeletons for waits longer than ~300 ms**; spinners for short or
  indeterminate actions (button loading).
- **Gym mode:** primary in-workout controls use 60 pt targets (`gym` button
  size on mobile).

## Token architecture

Two layers, with **identical names and values on both platforms**:

1. **Raw palette** (brand primitives): graphite 950/925/900/850/800/700, bone
   (and 50/200/300/400), stone 500/600/700, olive 200/300/400/600/700/900,
   amber (+700, tints), coral (+600/700, tints). Documented brand values:
   graphite 950 `#111312`, 900 `#181B19`, 850 `#1F2320`, 700 `#2E332F`; bone
   `#EDEFE7`; olive 200 `#E4EAB8`, 300 `#C9D17E`, 400 `#AEB95A`, 600 `#4E5626`,
   900 `#262815`; amber `#E2A250`; coral `#DF7A5E`. Other steps are derived for
   surfaces and contrast; they are not new brand colours. **Raw values are
   referenced only in the token file.**
2. **Semantic tokens** (what components use):

| Token                                                                                         | Purpose                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `background` / `foreground`                                                                   | page and default text                       |
| `surface` (+`-foreground`), `surface-subtle`, `surface-elevated`                              | cards, wells/inputs, dialogs and popovers   |
| `muted` / `muted-foreground`                                                                  | quiet fills, secondary text                 |
| `border`, `input`, `ring`                                                                     | hairlines, control borders, focus indicator |
| `overlay`                                                                                     | modal scrim                                 |
| `primary` / `primary-foreground`                                                              | the one olive call to action                |
| `secondary` / `secondary-foreground`                                                          | high-contrast neutral action                |
| `accent` / `accent-foreground`                                                                | quiet selection, chips                      |
| `destructive`, `success`, `warning`, `info` (+`-foreground`, `-subtle`, `-subtle-foreground`) | status: solid and tinted                    |

Light values are derived from the same ramps. Every text/background pair
components render meets **WCAG AA (4.5:1)** in both themes and `ring` meets
3:1; a unit test computes the ratios from the token values, so a token change
that breaks contrast fails CI.

**Type scale** (families: Unbounded for display and numbers, Manrope for UI,
JetBrains Mono for uppercase labels):

| Style     | Size / line | Family                         |
| --------- | ----------- | ------------------------------ |
| `display` | 44 / 48     | Unbounded Bold, tight tracking |
| `h1`      | 32 / 36     | Unbounded Bold                 |
| `h2`      | 24 / 29     | Unbounded SemiBold             |
| `h3`      | 20 / 26     | Manrope Bold                   |
| `title`   | 17 / 24     | Manrope Bold                   |
| `body`    | 16 / 23     | Manrope Regular                |
| `body-sm` | 14 / 20     | Manrope Regular                |
| `label`   | 11 / 14     | JetBrains Mono, uppercase      |
| `caption` | 12 / 16     | Manrope Medium                 |

**Spacing** is Tailwind's 4-based scale; use the steps 1, 1.5, 2, 3, 4, 5, 6,
8, 10, 12, 16 (no arbitrary values). **Radius:** `xs` 6, `sm` 10, `md` 14
(controls), `lg` 18, `xl` 22 (cards), `2xl` 28 (dialogs/sheets), `full`
(pills, avatars). **Elevation** is semantic: surfaces and borders first;
shadows (web: `shadow-raised`, `shadow-overlay`, `shadow-modal`) only for
floating layers. **Motion:** short (150 ms) colour/opacity transitions; no
decorative animation; reduced motion respected.

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
- `src/shared/styles/theme.css`: `@theme { --color-*: initial; }` removes
  Tailwind's default palette, then `@theme inline` maps each semantic token to
  a colour utility (`bg-surface`, `text-muted-foreground`, `border-border`,
  `bg-warning-subtle`), plus fonts, radius, shadows, easing and the
  `type-*` typography utilities (`type-display` … `type-caption`).
  shadcn names are aliases (`card` → surface, `popover` → surface-elevated),
  so each concept has one value.
- `src/shared/styles/fonts.ts`: Unbounded, Manrope and JetBrains Mono via
  `next/font/google` (self-hosted at build time, Latin + Cyrillic, `swap`),
  exposed as CSS variables on `<html>`.
- `src/app/globals.css`: `@custom-variant dark` (class-based) and base
  styles (`type-body bg-background text-foreground`).

**Theme.** `next-themes` in `app/[locale]/providers.tsx`: `attribute="class"`,
`defaultTheme="dark"`, themes `light`/`dark` + system, stored under
`simplefit-theme`. Its inline script sets the class before paint, so static
pages do not flash. `ThemeSwitcher` (`features/switch-theme`, translated in
all locales) lives in the site header and app shell. Use the `dark:` variant
only for genuine exceptions; tokens already switch.

**Rules**

- Tailwind classes on the component, semantic tokens only. ESLint rejects hex
  values, arbitrary colours (`bg-[#…]`, `text-[rgb(…)]`) and default palette
  classes (`bg-red-500`) in `className`, `cn()` and `cva()`.
- Typography via `type-*` utilities (or `font-display`/`font-mono` for a
  brand accent), not ad-hoc `text-[…]` sizes.
- Variants with `cva`, merged with `cn` (clsx + tailwind-merge).
- No CSS modules, styled-components/emotion or static inline styles.
  **Dynamic `style` is allowed** only for runtime values (computed sizes,
  positions, a CSS variable chosen at runtime, e.g. the gallery's palette
  swatches) and libraries that require it.

**Primitives** (`src/shared/ui`, shadcn/Radix, locally owned):

| Primitive                                                                           | Notes                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                                                            | variants `primary` (default), `secondary`, `outline`, `ghost`, `destructive`, `link`; sizes `sm`, `md`, `lg`, `icon`, `icon-sm`; `loading` (spinner, disabled, `aria-busy`); `asChild` |
| `Badge`                                                                             | `neutral`, `primary`, `accent`, `success`, `warning`, `destructive`, `info`, `outline`                                                                                                 |
| `Spinner`                                                                           | labelled = `role="status"`; unlabelled = decorative; stops with reduced motion                                                                                                         |
| `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `Field` | 40 px controls, `input` border, `ring` focus, `aria-invalid` styling                                                                                                                   |
| `Card`, `Separator`, `Skeleton`, `Avatar`, `Tabs`                                   | cards on `surface`, radius `xl`                                                                                                                                                        |
| `Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Tooltip`, `Sonner`                   | `surface-elevated`, `overlay` scrim, `shadow-overlay`/`shadow-modal`; Dialog/Sheet require `closeLabel`                                                                                |

**Icons:** `lucide-react` only, decorative (`aria-hidden`) next to text or
inside a labelled control.

## Gallery

`pnpm dev`, then open **http://localhost:3000/en/dev/design-system** (any
locale prefix works). It shows typography, semantic and raw colours, every
button/badge variant and state, form controls, cards, skeleton/spinner,
dialog, menu, tooltip, toasts, tabs and avatars, with the theme switcher. The
route calls `notFound()` when `NODE_ENV === "production"` and is `noindex`,
so production builds return 404. The gallery is developer-facing and not
translated by design.

## Testing

- `shared/styles/tokens.test.ts`: every semantic token in both themes, WCAG
  contrast, the Tailwind mapping and palette reset, documented brand values.
- `shared/ui/button.test.tsx`: variants, loading/disabled, `asChild`, Badge,
  Spinner semantics. `features/switch-theme`: switching and persistence.
  `widgets/design-system-gallery`: renders every family.
- Tests query by role and name; no snapshots.
