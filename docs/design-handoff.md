# Claude Design → production handoff

The contract for turning the canonical SimpleFit product design into
production UI (SF-16). **This file is shared and kept identical** in
`simplefit-platform` and `simplefit-mobile`, together with
these related files:

- `docs/design-source.json`: machine-readable artifact metadata.
- `docs/design-tokens.json`: the production design-system contract, i.e. the
  tokens, type roles, scales and control sizes every value is translated
  into (SF-17).
- `docs/design-reconciliation.md`: the evidence and status of every
  design-versus-production finding.

Change them only through an SF ticket that updates both repositories.

Platform-specific implementation rules stay in each repository's
`docs/design-system.md`.

## 1. Canonical design source

| Field       | Value                                                                                   |
| ----------- | --------------------------------------------------------------------------------------- |
| Artifact    | **SimpleFit Boxing — Product design** (Claude Design canvas)                            |
| URL         | https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY                                       |
| Artifact ID | `JEsBg51MjX8KiHWEro8omY` (internal UUID `8b9af407-4197-4905-87b7-0ebf86bf35e7`)         |
| Index       | `project/canvas.json`: pages, artboard frames (`x`, `y`, `w`, `h`), titles, notes       |
| Artboards   | `project/<Name>.dc.html`: one self-contained HTML source per screen, sheet or component |
| Audited by  | SF-16, version `1791206633-31de` (11 pages, 456 artboards, 71 canvas notes)             |

The PDF exports in the workspace `docs/design/` folder are historical
snapshots. Where they disagree with the artifact, **the artifact wins**.

Pages (ids are stable and used in every reference):

| Page id          | Name           | Holds                                                                    |
| ---------------- | -------------- | ------------------------------------------------------------------------ |
| `onboarding`     | Onboarding     | Registration and first-run, every role, **mobile and web**               |
| `fighter-mobile` | Fighter Mobile | Fighter app, settings/lifecycle, social, Live Board, timer, commerce     |
| `coach-mobile`   | Coach Mobile   | Coach app, coach settings, pricing, trials, billing, services, promotion |
| `gym-mobile`     | Gym Mobile     | Gym mobile cockpit, plan comparison                                      |
| `desktop-web`    | Desktop/Web    | Fighter, coach and gym web apps, billing, commerce, marketplace          |
| `sponsor-portal` | Sponsor Portal | Partner portal, campaign creation, advertising UX rules                  |
| `admin`          | Admin          | Internal control plane, revenue, sponsor CRM, enterprise                 |
| `public-website` | Public Website | Landing and pricing pages, transactional email templates                 |
| `design-system`  | Design System  | Style guide, navigation components, component and state sheets           |
| `brand-assets`   | Brand Assets   | “The Corner S” logo sheet, external share cards                          |
| `pitch-business` | Pitch/Business | Pitch deck, business boards, route and spec galleries (reference only)   |

The **Design System page is a page of this canvas**, not a dedicated Claude
Design System project. The canvas has no attached design system and no
`tokens.json`: its artboards carry raw hex values in inline styles.

## 2. Authority model

| Layer                                 | Source of truth for                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Claude Design product design**   | Product and visual intent: screen composition, layout, dimensions, spacing, typography intent, colours, borders, radii, icon intent, alignment, copy, states, flows, responsive intent, interactions, brand usage |
| **2. SF-13 production design system** | Implemented tokens (colour, type, spacing, radius, elevation, motion), primitives, font loading, Lucide icons, theme infrastructure, accessibility guarantees                                                     |
| **3. Feature implementation**         | Composed/domain components and screens, built by the feature ticket that first needs them                                                                                                                         |

Consequences:

- A screen is implemented **from its artboard source**, translated through
  SF-13 tokens and primitives. The design decides _what_ it looks like; SF-13
  decides _how_ that is expressed in code.
- Raw artboard values are **evidence of intent, not tokens**. Never copy a hex
  value, pixel size or inline style from a `.dc.html` file into production.
- Production tokens never change silently to follow an artboard. A real
  conflict is reported (§12) and changed by an explicit, tested decision.
- Accessibility requirements override the design. If an artboard pairing fails
  WCAG AA, or a touch target is under 44 pt, production keeps the accessible
  token and the PR reports the difference.
- Nothing flows from code back into the design automatically. There is no
  `/design-sync`, and no generated design system project is created from code.

## 3. Reading the design

Before implementing or reviewing a screen, Claude Code **must read the
referenced artboard source**. Screenshots, PDFs and memory do not count.

1. Read `project/canvas.json` with the Artifact tool (`action: "read"`,
   `path: "project/canvas.json"`). Confirm the artboard's page, title, frame
   size and whether it is interactive.
2. Read the artboard (`path: "project/<Name>.dc.html"`), plus every component
   artboard it links to or mirrors, for example the tab bar or web nav on the
   `design-system` page.
3. Files are saved to the session scratchpad. **Never copy them into a
   repository**: no `.dc.html`, no `canvas.json`, no exported runtime. The
   repositories' tests reject them.
4. Record the artifact version that the read returned. It goes in the PR's
   design QA section (§11).

What an artboard contains:

- **Markup with inline styles**: the exact geometry, colours, type and copy.
- **`data-props`**: editor tweaks. An `enum` prop is a variant switch, e.g.
  `FighterTabs` `active: home | training | board | community | profile`.
  `$preview` is the frame size.
- **The `renderVals()` script**: the data, lists and per-state values that
  `<sc-for>` / `<sc-if>` render. State sheets keep each state's tag, route,
  copy and CTA there.
- **`href="Other.dc.html"` links**: the prototype interactions. They are the
  navigation contract between screens.
- **Titles**: `<section> · <CODE> · <title>  → <next codes>`, e.g.
  `1.1 · A01 · Welcome / sign in  → O02 · O01b`. The screen code is the stable
  human identifier. `→` lists the screens the prototype navigates to.

Claude Design gives no permanent IDs to elements inside an artboard. Refer to
an element by its artboard plus its visible label, tag or role, e.g.
`StatesSheet.dc.html › "EMPTY · BOARD"`. Never invent element IDs.

## 4. Design reference format

Every feature ticket that implements UI carries one block per screen:

```text
Design:   https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY
Page:     <page id>
Artboard: project/<Name>.dc.html
Screen:   <screen code> · <title>
State:    <state tag / data-props value>        (when the screen has variants)
Related:  <component/state artboards it uses>   (optional)
Version:  <artifact version>                    (only when pinned, see §5)
```

Example:

```text
Design:   https://claude.ai/artifact/JEsBg51MjX8KiHWEro8omY
Page:     fighter-mobile
Artboard: project/LiveBoard.dc.html
Screen:   B21 · Board · journey
State:    empty → project/StatesSheet.dc.html › "EMPTY · BOARD"
Related:  project/FighterTabs.dc.html (active=board)
```

Rules:

- The **artboard path is mandatory**. A screen code or title alone is not a
  reference.
- The page id must match the artboard's `page` in `canvas.json`.
- A ticket implements only the artboards it lists. Flows and route maps
  (§9) give context but are not scope.

## 5. Following the live design vs pinning a version

- **Default: follow the live canonical design.** Tickets reference artboards
  without a version. The implementer reads the current version and records it
  in the PR.
- **Pin a version** (`Version:` line) only when a fixed snapshot is required:
  the design is being reworked while the ticket is in progress, the ticket
  implements a frozen release or audit, or a dispute must be settled against
  what was approved.
- The artifact version changes on **every** edit to the canvas, not only to
  the referenced artboard. A changed version means "check again", not
  "the screen changed".
- The read tool returns the **live** version. A pinned version is the
  agreed baseline that changes are compared against; it does not guarantee
  that an older copy can be retrieved. If the artboard has changed since the
  pin, stop and ask which design applies.

## 6. Platform ownership

"Share design language, not rendering implementation." There is **no
runtime cross-repository UI package**. Each client implements the same design
with its own SF-13 primitives.

| Page                                                       | Owner                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fighter-mobile`, `coach-mobile`, `gym-mobile`             | `simplefit-mobile`                                                                                                                                                                     |
| `onboarding`                                               | **Split by frame**: 390 px-wide artboards → `simplefit-mobile`; 1440 px-wide artboards (`Web*`, `FirstRunWeb*`, sponsor and admin onboarding, partners landing) → `simplefit-platform` |
| `desktop-web`, `sponsor-portal`, `admin`, `public-website` | `simplefit-platform`                                                                                                                                                                   |
| `design-system`, `brand-assets`                            | Cross-platform design intent; each client implements what it needs                                                                                                                     |
| `pitch-business`                                           | Reference only; never implemented. Exception: the three Route Gallery artboards are the IA source for routes (`docs/route-architecture.md`)                                            |

Notes:

- `public-website` also holds the transactional email templates
  (`Email*.dc.html`, E01–E16). Their production owner is **not decided**: the
  backend sends email. A ticket must decide before implementing them.
- Some web navigation targets exist only as mobile artboards (e.g. web
  Calendar and Messages link to `Calendar.dc.html` and `Inbox.dc.html`). The
  web ticket adapts them and records the adaptation as a design gap.
- `Flow*` and `Route*` artboards can span roles and platforms. Each screen
  they show is owned by the platform of its own artboard.
- **Routes come from the Route Gallery** (`GalleryIndex.dc.html`,
  `GalleryIndex2.dc.html`, `GalleryIndex4.dc.html` on `pitch-business`) through
  the canonical route registry, `docs/route-registry.json`, and its contract
  `docs/route-architecture.md` (SF-31). A route's screen is still implemented
  from its own artboard.

## 7. Component classification

Every pattern found in the design falls into exactly one class. The SF-16
inventory is in `docs/design-reconciliation.md` §3.

| Class                          | Meaning                                                                                                                         | Where it lives                                                               | Built when                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A. PRODUCTION_PRIMITIVE**    | Exists in SF-13 (Button, Input, Badge, Card, Skeleton, Modal, …)                                                                | `src/shared/ui`                                                              | Already built; extend with a variant only for a real screen |
| **B. COMPOSED_UI_PATTERN**     | Reusable composition of primitives with no domain knowledge (empty/status message, inline banner, stat tile, list row, stepper) | `src/shared/ui` once a second screen needs it; until then inside the feature | When the first screen needs it                              |
| **C. FUTURE_DOMAIN_COMPONENT** | Business-aware component (PaymentStatus, PlanCard, TrainingCard, CampaignCard, …)                                               | `entities/` or `features/` of the owning domain                              | **Only** by the feature ticket that first needs it          |
| **D. APPLICATION_SHELL**       | Navigation chrome per role and platform (tab bars, web sidebars, admin and sponsor shells, public site header/footer)           | `widgets/`                                                                   | By the first ticket that ships a screen inside that shell   |
| **E. FEATURE_SCREEN**          | A numbered product screen (`A01`, `F04`, `WG3`, …)                                                                              | `app/` route + `widgets/`                                                    | By its feature ticket                                       |

Do not build class C, D or E components because they exist in the design.
Design component sheets (`CommerceComponents`, `PaymentStates`,
`TrialStates`) are specifications. They are not a backlog to implement up
front.

## 8. Translating the design into production

The design is matched exactly. Translation is about **how** each value is
expressed, never about changing it:

| Design value                                              | Production expression                                                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour (hex)                                              | The semantic token with the same role (`docs/design-tokens.json` `semantic`; evidence in `docs/design-reconciliation.md` §2–3). Never a hex value, arbitrary colour or palette class (ESLint).            |
| Font family / role                                        | Unbounded = display and numbers, Manrope = interface and body, JetBrains Mono = labels, metadata, data values. Fonts come only from production font loading; never from the artboard's Google Fonts link. |
| Font size / weight / tracking                             | The type role with the same size (`typography.roles`; web `type-<role>`, mobile `<Text variant>`). Raise the weight only to a contract weight (Manrope 600/700/800). No other text size exists.           |
| Spacing (padding, gap, margin)                            | The spacing step with the same px value (`spacing.steps`: 2 px steps to 24, then 32, 40, 48, 56, 64, 80). ESLint rejects other steps.                                                                     |
| Radius                                                    | The radius step with the same px value (`radius`: `xs` 6, `sm` 9, `md` 12, `lg` 16, `xl` 18, `2xl` 20, `3xl` 22, `4xl` 28) or `full` when radius = height / 2.                                            |
| Buttons, fields, badges, cards                            | The primitive and size whose canonical dimensions match (`controls`), never a restyled copy.                                                                                                              |
| Layout dimensions (frame, column, control and tile sizes) | Tailwind size utilities. Arbitrary `w-[…]`/`h-[…]`/`size-[…]` are allowed only for one-off layout dimensions the scale cannot express.                                                                    |
| Borders                                                   | 1 px hairlines with `border-border` / `border-input`; signal borders via signal tokens.                                                                                                                   |
| Shadow / elevation                                        | Surfaces and borders first; SF-13 shadows only for floating layers.                                                                                                                                       |
| Icons (inline SVG paths)                                  | The Lucide icon with the same meaning (`lucide-react` / `lucide-react-native`). Never export or copy artboard SVG paths for interface icons.                                                              |
| Text glyphs used as icons (✓, ✕, →)                       | Lucide `Check`, `X`, `ArrowRight` etc., decorative next to text.                                                                                                                                          |
| Brand marks (Corner S, wordmark)                          | Production brand assets only (§8.3). Never rebuilt from CSS or text.                                                                                                                                      |
| Copy                                                      | The artboard text, as English i18n messages, translated for every locale. Sample data (names, amounts, dates) is not copy; it comes from the API.                                                         |
| Links between artboards                                   | Real navigation (Expo Router / localized Next.js routes) to the referenced screen, or a disabled/absent action if that screen is not built yet.                                                           |
| Animations                                                | SF-13 motion (short colour/opacity transitions; reduced motion respected) unless the artboard specifies a distinct interaction such as the timer.                                                         |

### 8.1 Values that are not on a production scale

Since SF-17 the scales cover the systematic values of the canonical design.
Ordinary UI therefore translates exactly. Occasional artboard values still
fall between steps: odd 3, 5 or 7 px gaps, 24 px panel radii, `#23272A`
dividers. For each one:

1. **Exact token or step exists**: use it.
2. **Within tolerance** of an existing step (type ±1 px; spacing and radius
   ±2 px; colour: same semantic role and visually indistinguishable at use
   size): use the nearest step and list it in the PR's design QA table.
3. **Beyond tolerance, or a role SF-13 does not have**: stop and ask. The fix
   is a token or variant decision with tests, made in the feature ticket or a
   design-system ticket. It is never a local value.

Never introduce raw colours, a parallel type scale, a feature-local spacing
scale, a duplicate primitive, or restyled primitive colours.

### 8.2 Icons

Lucide is the only production interface icon set: `lucide-react` (web) and
`lucide-react-native` (mobile, via `<Icon>`), same version. Artboard icons are
inline 24-grid stroke paths (stroke 1.8–2, round caps), so they map to Lucide
by meaning. Record the chosen names in the PR. When no Lucide icon carries the
meaning (e.g. the Live Board node graph, the boxing glove), stop and ask: it
may become a SimpleFit-specific custom SVG. Custom SVG is reserved for
genuinely SimpleFit-specific graphics.

### 8.3 Typography and brand assets

- Production typography is **Unbounded** (display/brand/numbers), **Manrope**
  (UI/body), **JetBrains Mono** (labels, metrics, technical values), loaded by
  SF-13 (`next/font` on web, bundled `@expo-google-fonts` weights on mobile).
  Never export or duplicate font files from Claude Design.
- Brand graphics (Corner S mark, wordmark, lockups, app icon, splash) come
  from approved source files committed by a brand-asset ticket, preferably
  SVG. They are never traced, approximated with CSS/text, or rebuilt from
  memory. If no reliable vector source exists, that is a gap to report. What
  the design provides and what is missing is in
  `docs/design-reconciliation.md` §4.
- Never export from Claude Design: buttons, cards, Lucide icons, typography,
  UI backgrounds, borders or screen compositions.

### 8.4 Fixed-frame artboards, fluid compositions (web)

Web artboards are fixed frames: 1440 px wide and the artboard's own height
(900 for the auth screens, 940 for O02w). Production reproduces that
coordinate system at 1440 and translates it into responsive constraints for
every other desktop and laptop width (SF-42):

> Canonical Web compositions are viewport-fluid but topology-invariant across supported desktop/laptop sizes. Breakpoints may adjust spacing and sizing; they must not introduce a different product composition unless an approved responsive design explicitly defines one.

- At 1440 × the artboard height, every element lands on the artboard's
  coordinates (the geometry suite checks major anchors within 2 px).
- At every desktop and laptop width (the `desktop` breakpoint, 1180 px, and
  up: 1280, 1366, 1440, 1512, 1728, 1920 are tested on the production
  routes), the composition is the same: frames and full-bleed regions span
  the viewport (never a centred 1440 px canvas), splits keep their fractions
  (WA1 50 / 50), edge anchors keep their artboard offsets (64 px gutters),
  and fixed-width content (the 440 px auth column, the 420 px aside) stays
  fixed inside its region. Never `transform: scale()`, zoom, a fixed canvas
  or horizontal scrolling.
- Taller than the artboard, the internal layout is not redistributed: no
  `min-h-dvh` + `flex-1` spreading, `justify-between` or bottom-anchored
  footers inside a designed composition. Extra height stays outside it (below
  the footer, or under a background that the design structurally assigns to
  a full-height region, such as the WA1 brand panel).
- Below the `desktop` breakpoint (only where the desktop composition
  physically cannot fit; the artboards draw no tablet or phone web), the
  narrow production extension applies (for example the public header's menu
  sheet) and is reported as such.

Type roles whose line height differs from the artboard's `line-height:
normal` are compensated with spacing steps where they accumulate, so rows
keep their designed positions; tokens are not changed to match.

## 9. States and flows

These artboards are **specifications, not scope**:

| Artboards                                                        | Use                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Flow*` (e.g. `FlowOnboarding`, `FlowFighter`, `FlowCommercial`) | Order of screens, entry points, branches per role. Check that a ticket's navigation matches.                                                                                                                             |
| `Route*` (e.g. `RouteSite`, `RouteGym`)                          | Web route maps per role: flow and grouping intent. Route paths come from `docs/route-registry.json`; where a map disagrees, the Route Gallery wins.                                                                      |
| `StatesSheet`                                                    | Empty, loading (skeleton), error, offline, permission-denied, private profile, blocked user, deleted content, unavailable gym and cancelled training. Each state has a tag, an example route (`?state=…`), copy and CTA. |
| `PaymentStates`                                                  | `PaymentStatus`: processing, success, failed, declined, authentication required, expired card, insufficient funds, network error, duplicate prevented.                                                                   |
| `TrialStates`                                                    | `TrialBanner` (trial active, 7/3 days, ends tomorrow, expired, converted, payment failed) and the `SubscriptionStatus` pill (free … expired).                                                                            |
| `BillingNotifs`                                                  | Monetization notifications per channel (in-app, push, email) and default channel matrix.                                                                                                                                 |
| `AdRules`                                                        | Advertising UX rules that constrain every sponsored placement.                                                                                                                                                           |

Rules:

- A screen ticket implements **the states its screen actually has**: at
  minimum loading, empty, error and offline wherever it loads data. Each
  state follows the matching sheet entry, and the ticket references that
  entry by artboard and tag.
- A state's example route (`/board?state=empty`) shows the design scenario.
  It is not a production URL contract.
- Payment, trial and subscription states are rendered from backend state.
  The client never decides them.
- Behavioural rules written on sheets ("skeletons keep card geometry", "no
  spinners over 300 ms", "timer and logging never wait for network", "never
  on a share card", ad rules) are product requirements for the ticket that
  implements the feature.

## 10. Feature workflow

```text
Claude Design artifact
  ↓ exact page + artboard reference (§4)
SF-13 tokens
  ↓
SF-13 production primitives
  ↓
feature-owned composed / domain components (§7)
  ↓
feature screen
  ↓
visual QA against the artboard (§11)
```

Checklist for every UI ticket:

1. The ticket lists each screen's design reference (§4). Without one, ask.
2. Read `canvas.json`, the artboards, and the component and state artboards
   they use (§3).
3. Map every design value to a token, primitive or icon (§8). Values outside
   tolerance: stop and ask.
4. Build shells or domain components only if this ticket is the first to
   need them (§7), on the owning platform (§6).
5. Copy goes through i18n for every locale. Data comes from the API.
6. Implement the screen's states and the interactions its links define (§9).
7. Run visual QA (§11) and the repository quality gate.

## 11. Visual QA

Every UI ticket's PR includes a **Design QA** section:

- **Reference and version**: each artboard path and the artifact version that
  was read.
- **Side-by-side check** at the artboard's frame size:
  - mobile: a 390 × 844 pt device or simulator (e.g. iPhone 13/14)
  - web: a 1440 px-wide viewport
  - web, additionally: 320 px and 768 px to check responsive behaviour,
    which the design does not draw

  Compare layout, dimensions, spacing, typography, colours, borders, radii,
  icons, alignment, copy, states and interactions.

- **Deviation table**: every value that differs from the artboard, why, and
  its class. Classes: nearest-step translation (§8.1), accessibility
  override, platform convention, design gap, or deferred. Unlisted differences
  are defects and must be fixed.
- Both **themes**: dark matches the design. Light is a production extension
  the design does not draw, so it must stay legible and use the same tokens.

Storybook (web, `pnpm storybook`) and the in-app galleries show the
production primitives in every state and theme. They help with QA, but they
are **not** evidence of fidelity to a product artboard: only the side-by-side
check above is.

Material divergences are fixed before merge or explicitly accepted in the PR.
Do not create screenshot baselines or snapshot tests of artboards.

## 12. Handling drift and conflicts

| Situation                                                                                    | Action                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artboard changed after a screen shipped                                                      | A new ticket references the artboard again; the PR records the old and new versions.                                                               |
| Artboard value conflicts with an SF-13 token (e.g. palette value)                            | Report it with both values and the artboards that use it. Change the token only by explicit decision, updating both platforms and the token tests. |
| Design uses a role SF-13 lacks (e.g. tertiary text, olive 500)                               | Propose a token or variant in the ticket that needs it; add it on both platforms with tests and gallery entry.                                     |
| Design is missing something (light theme, tablet/phone web widths, error state for a screen) | Implement from the closest canonical pattern (state sheets, SF-13 rules) and report a design gap.                                                  |
| Two artboards disagree                                                                       | The component artboard on the `design-system` page wins over a screen's copy of it. Otherwise ask.                                                 |
| Workspace PDF and artifact disagree                                                          | The artifact wins.                                                                                                                                 |

## 13. Automated guards

- `scripts/design-handoff.test.*`:
  - `docs/design-source.json` keeps the canonical artifact and all 11 pages
    with an owner.
  - This document names the artifact and every page.
  - `CLAUDE.md` points here.
  - No design source copies (`*.dc.html`, `canvas.json`) are committed.
- `.gitignore` ignores `*.dc.html` and `canvas.json`.
- Each repository's token tests assert its implementation matches
  `docs/design-tokens.json`: palette, semantic tokens, contrast, type roles,
  radius, spacing and control sizes. Web and mobile cannot drift apart
  silently.
- ESLint (SF-16 and SF-17):
  - Everywhere: Tailwind's default text sizes, leading and tracking presets,
    non-contract weights and bare `rounded` are rejected.
  - Outside `src/shared/ui`:
    - arbitrary spacing, radius and type values are rejected (`p-[…]`,
      `gap-[…]`, `rounded-[…]`, `text-[…]`, `leading-[…]`, `tracking-[…]`,
      `font-[…]`);
    - spacing steps outside the scale are rejected.
  - Design values must go through the contract (§8.1).
- SF-13 guards still apply: no raw colours, palette classes, static inline
  styles, CSS-in-JS or (mobile) `StyleSheet.create`, plus the contrast tests.
