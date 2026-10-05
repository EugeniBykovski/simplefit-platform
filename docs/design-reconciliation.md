# Design reconciliation: Claude Design vs SF-13 (SF-16 snapshot)

A dated audit snapshot, **kept identical** in `simplefit-platform` and
`simplefit-mobile`. The contract it supports is `docs/design-handoff.md`.
This file records findings; it changes no token. Each open item is resolved
by the ticket named in its "Resolve in" column, which then updates this file
in both repositories.

- **Artifact**: `JEsBg51MjX8KiHWEro8omY`, version `1791206633-31de`, read
  2026-10-05 (read-only).
- **Read in full**: `project/canvas.json` (11 pages, 456 artboards, 71 notes),
  every `design-system` artboard (15) and every `brand-assets` artboard (2).
- **Sampled screens**:
  - onboarding: `FlowOnboarding`, `Welcome`, `WebLogin`, `RouteSite`
  - fighter-mobile: `Main`, `TimerLive`, `Settings`
  - coach-mobile: `CoachToday`
  - gym-mobile: `GymPulse`
  - desktop-web: `WebHome`, `WebDashboard`
  - sponsor-portal: `SponsorDashboard`
  - admin: `AdminOverview`
  - public-website: `LandHome`
- **Raw-value statistics** below come from those 31 files.
- **Production compared**: SF-13 on `main` in both repos
  (`tokens.css`/`theme.css`, `tokens.ts`/`tailwind.config.js`, primitives,
  font loading).

Classification: **MATCH**, **PRODUCTION_GAP** (design intent production cannot
express yet), **DESIGN_GAP** (production needs something the design does not
define), **INTENTIONAL_DIFFERENCE** (production deliberately differs),
**DEFERRED** (known; decided by a later ticket). No finding was judged a
material conflict that required stopping SF-16: palette deltas are at most 3
units per channel, and the open items are scale-coverage decisions.

## 1. Canonical design-system intent

From `Styleguide.dc.html` (“Graphite × Olive · Visual System 2026”):

- **Graphite foundation**: 950 `#111312`, 900 `#181B19`, 850 `#1F2320`,
  700 `#2E332F`, text `#EDEFE7`.
- **Olive (action and progress)**: 200 `#E4EAB8`, 300 `#C9D17E`,
  400 `#AEB95A`, 600 `#4E5626`, 900 `#262B15`.
- **Signals (attention only)**: amber `#E3A24F`, coral `#E07A5F`, bone/rest
  `#ECEDE5`.
- **Type roles**: Unbounded (numbers, timers, headlines), Manrope (interface,
  body), JetBrains Mono (labels, metadata, graph edges).
- **Principles**: one olive CTA per screen; bento tiles with one big metric
  each; gym mode (60 px bottom targets, full-bleed olive in rounds, bone at
  rest); AI suggests, the coach decides, every change is reversible.
- **Reference components**: primary button (olive, 48 h, radius 16, Manrope
  800), secondary (bone), outline (olive border/text), chip (`✓ Defense`,
  34 h).

## 2. Reconciliation

### 2.1 Colour: design role → production token (dark theme)

| Design value(s)                               | Role in artboards                                    | Production token                                                                                           | Status                                                |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `#111312`                                     | Page background, text on olive                       | `background`, `primary-foreground`                                                                         | MATCH                                                 |
| `#181B19`                                     | Cards, web sidebars                                  | `surface`                                                                                                  | MATCH                                                 |
| `#1F2320`                                     | Control fills, tab bar, quiet buttons, icon tiles    | `surface-elevated` / `muted` (graphite 850)                                                                | MATCH                                                 |
| `#2E332F`                                     | Control and quiet-button borders                     | `input`                                                                                                    | MATCH                                                 |
| `#282D29`, `#23272A`                          | Card hairlines, dividers                             | `border` (`#272B28`)                                                                                       | MATCH (nearest; design uses two hairlines)            |
| `#EDEFE7`                                     | Primary text, secondary button                       | `foreground`, `secondary`                                                                                  | MATCH                                                 |
| `#AEB95A`                                     | Primary CTA, active tab                              | `primary`                                                                                                  | MATCH                                                 |
| `#E4EAB8`                                     | Text on selected olive                               | `accent-foreground`                                                                                        | MATCH                                                 |
| `#262B15`                                     | Selected nav item, success tint                      | `accent`, `success-subtle` (olive 900 `#262815`)                                                           | MATCH role; value drift, see 2.2                      |
| `#A7AD9F`                                     | Secondary text (most common text colour)             | `muted-foreground` (`#A1A69A`)                                                                             | PRODUCTION_GAP (minor value difference)               |
| `#848B80`                                     | Tertiary text, mono labels, inactive icons           | none (nearest `muted-foreground`)                                                                          | PRODUCTION_GAP                                        |
| `#5B615C`                                     | Quaternary/meta text                                 | none; **2.9:1 on background, fails AA**                                                                    | INTENTIONAL_DIFFERENCE (production keeps an AA token) |
| `#C9D17E`                                     | Links, kickers, olive text, focus/progress           | `ring`, `success-subtle-foreground`; no olive-text role (`text-primary` is `#AEB95A`)                      | PRODUCTION_GAP                                        |
| `#8D9840` (olive 500)                         | Outline button border, olive mid-tone, chart steps   | none; not in the Styleguide ramp either                                                                    | DESIGN_GAP + PRODUCTION_GAP                           |
| `#4E5626`                                     | Olive borders on dark (banners, dashed placeholders) | dark theme has no role (olive 600 is light `primary`)                                                      | PRODUCTION_GAP                                        |
| `#333A1C`, `#1C2010`, `#EEF2D2`, `#B9C08E`    | Chip fill, deep olive surfaces, text on olive        | none; undocumented in the Styleguide                                                                       | DESIGN_GAP                                            |
| `#E3A24F` / `#3A2E1A` / `#5A4421` / `#F2D3A6` | Warning solid / tint / border / text                 | `warning` (`#E2A250`) / `warning-subtle` (`#33281A`) / — / `warning-subtle-foreground` (amber)             | MATCH role; values drift, see 2.2                     |
| `#E07A5F` / `#2A1A16` / `#4A2A22` / `#F0A28E` | Error solid / tint / border / text                   | `destructive` (`#DF7A5E`) / `destructive-subtle` (`#33201B`) / — / `destructive-subtle-foreground` (coral) | MATCH role; values drift, see 2.2                     |
| `#0D0E0D`                                     | Presentation background of sheets                    | not product UI                                                                                             | n/a                                                   |
| `#ECEDE5`, `#1A1D1B`, `#5B6524`, `#F7F7F2`    | Bone/light brand surfaces: logo, share cards, emails | light theme tokens are derived, not designed                                                               | INTENTIONAL_DIFFERENCE (brand/email only)             |

Information is neutral in both (the brand has no blue): MATCH.

### 2.2 Findings by area

| #   | Area             | Finding                                                                                                                                                                                                                                                                                                                                                      | Class                                                    | Resolve in                                                                                      |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Palette          | Graphite 950/900/850/700, bone, olive 200/300/400/600 identical.                                                                                                                                                                                                                                                                                             | MATCH                                                    | —                                                                                               |
| 2   | Palette          | Documented-value drift (≤3 per channel, visually indistinguishable). Styleguide vs SF-13: olive 900 `#262B15` vs `#262815`, amber `#E3A24F` vs `#E2A250`, coral `#E07A5F` vs `#DF7A5E`. SF-13 took its values from the PDF export.                                                                                                                           | DEFERRED                                                 | Design-system token ticket: adopt the artifact values on both platforms (contrast tests re-run) |
| 3   | Semantic colours | Tertiary text `#848B80`, olive text `#C9D17E`, olive 500 `#8D9840`, dark-theme olive borders and olive surface steps have no production role.                                                                                                                                                                                                                | PRODUCTION_GAP                                           | First feature ticket whose screen needs the role (§8.1 of the handoff)                          |
| 4   | Semantic colours | Signal tints/borders: design tints `#3A2E1A`/`#2A1A16` and borders `#5A4421`/`#4A2A22` vs SF-13 tints `#33281A`/`#33201B`, no signal-border tokens.                                                                                                                                                                                                          | DEFERRED                                                 | First screen with banners/status cards                                                          |
| 5   | Typography       | Families and roles: MATCH. Production loads them self-hosted, not from the artboards' Google Fonts link.                                                                                                                                                                                                                                                     | MATCH                                                    | —                                                                                               |
| 6   | Typography       | **Size scale.** Artboard text is mostly 10–15 px (labels 9–11, body 12–15) with headings 17–31 px on mobile and 48–58 px on landing pages. The SF-13 mobile/documented scale is label 11, caption 12, body-sm 14, body 16, title 17, h3 20, h2 24, h1 32, display 44. Most values fall within ±1 px, but 13 px body and 25–31 px headings sit between steps. | PRODUCTION_GAP                                           | Type-scale decision before the first pixel-faithful screen                                      |
| 7   | Typography       | **SF-13 cross-platform drift.** The web `type-*` utilities do not match the documented scale that mobile implements: web display 48, h1 36, h2 26, body 15, body-sm 13 vs documented 44 / 32 / 24 / 16 / 14. Not caused by the design, but it must be settled together with #6.                                                                              | PRODUCTION_GAP                                           | Same type-scale decision (both repos)                                                           |
| 8   | Typography       | Weights: headings are Unbounded **600** (SF-13 h1/display use 700). Emphasis and buttons are Manrope **800**, the most common weight in the artboards. Mobile bundles Manrope 400–700 and JetBrains Mono 500 only (design also uses Mono 600). Web loads variable fonts, so all weights are available.                                                       | PRODUCTION_GAP                                           | Type-scale decision (mobile font weights are an asset change)                                   |
| 9   | Spacing          | Artboard gaps/paddings are 2, 3, 4, 6, 8, **10**, 12, **14**, 16, 18, 20, 22, 24 … SF-13 documents the allowed steps 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64. 10 and 14 are among the most common design gaps. All are expressible on the Tailwind scale (2.5, 3.5) but excluded by the SF-13 rule.                                                          | PRODUCTION_GAP                                           | Spacing-rule decision (allow 0.5/2.5/3.5 or map ±2 px)                                          |
| 10  | Radius           | 22 cards, 14 controls, 18, 28 sheets, full pills: MATCH. Off-scale values are frequent: 9 (status pills), 12 (40 px buttons, nav items, icon tiles), 15/13 (icon tiles), 16 (Styleguide button), 20, 24; 34 (tab bar) is full.                                                                                                                               | PRODUCTION_GAP (12, 9, 16 frequent)                      | First screen using them; map ±2 px or extend the scale                                          |
| 11  | Borders          | 1 px hairlines; dashed olive borders for placeholders/clear space.                                                                                                                                                                                                                                                                                           | MATCH                                                    | —                                                                                               |
| 12  | Elevation        | No drop shadows in product artboards; separation by surfaces and hairlines; ring halos (`0 0 0 5px`) for selected/avatar emphasis.                                                                                                                                                                                                                           | MATCH                                                    | —                                                                                               |
| 13  | Motion           | Only skeleton pulse (1.4 s) and the timer are animated. Web `Skeleton` pulses; mobile skeleton is static by design (SF-13).                                                                                                                                                                                                                                  | INTENTIONAL_DIFFERENCE (mobile static)                   | —                                                                                               |
| 14  | Themes           | Product artboards are dark only. Production is dark-first with a derived light theme.                                                                                                                                                                                                                                                                        | INTENTIONAL_DIFFERENCE / DESIGN_GAP (no light design)    | —                                                                                               |
| 15  | Iconography      | Inline 24-grid stroke icons (1.8–2 px, round caps), visually compatible with Lucide. Glyphs are custom paths: map by meaning. Text glyphs ✓ ✕ → used as icons. Custom concepts: Live Board node graph, boxing glove.                                                                                                                                         | MATCH (style) / DEFERRED (Board and glove icon decision) | First shell/screen using them                                                                   |
| 16  | Primitives       | Buttons: Styleguide 48 h radius 16 Manrope 800; sheets use 40 h radius 12; landing and onboarding use 54 h radius 18. SF-13 web sm 32 / md 40 / lg 48, radius 14, weight 600; mobile sm 36 / md 44 / lg 56 / gym 60.                                                                                                                                         | PRODUCTION_GAP (sizes/radius/weight)                     | First screen per platform                                                                       |
| 17  | Primitives       | Pill badges (`SubscriptionStatus`: 12 px Manrope 800, radius 9, tinted) vs SF-13 Badge (full radius, uppercase, bold).                                                                                                                                                                                                                                       | PRODUCTION_GAP (minor)                                   | First billing screen                                                                            |
| 18  | Primitives       | Segmented control (All / Money / Social: bone selected pill on surface track) matches mobile `SegmentedControl` and web `Tabs` intent.                                                                                                                                                                                                                       | MATCH (intent)                                           | —                                                                                               |
| 19  | Navigation       | Mobile: floating pill tab bars (358×68, radius 34), with a 56 px central Live Board button (fighter), 5 tabs (coach), 4 tabs (gym). Web: 240 px sidebars with mono section headers, a workspace identity card, a 72 px compact variant; admin and sponsor sidebars. Production has no role shells yet (placeholder app shell only).                          | PRODUCTION_GAP (APPLICATION_SHELL)                       | First screen inside each shell                                                                  |
| 20  | Responsive       | Artboards are fixed frames: 390 px mobile, 1440 px web, 680 px email. No tablet or narrow-web design, except the web nav's compact variant. Production rule: mobile-first from 320 px.                                                                                                                                                                       | DESIGN_GAP                                               | Each web ticket (responsive behaviour reported in design QA)                                    |
| 21  | Accessibility    | Design labels icon-only nav (`aria-label`), uses 44–48 px targets and 60 px gym targets. Some meta text (`#5B615C`) fails AA. Production contrast tests stay authoritative.                                                                                                                                                                                  | MATCH / INTENTIONAL_DIFFERENCE (contrast)                | —                                                                                               |
| 22  | Copy             | Artboards contain English copy plus sample data (names, money, dates, gyms). Copy becomes i18n messages; sample data never ships.                                                                                                                                                                                                                            | MATCH (process)                                          | —                                                                                               |

## 3. Component inventory and classification

**A. PRODUCTION_PRIMITIVE** (SF-13 already provides them; extend by variant
only when a screen needs it):

- **Controls**: Button (primary olive, secondary bone, outline olive, quiet
  graphite), Input, Textarea, Checkbox, RadioGroup, Switch, Select,
  SegmentedControl/Tabs
- **Display**: Badge/status pill, Avatar (initials circle), Card (surface,
  hairline, radius 22), Separator
- **Feedback**: Skeleton, Spinner, Modal/Dialog/Sheet, Toast,
  Tooltip/Popover/DropdownMenu
- **Typography**: Text styles

**B. COMPOSED_UI_PATTERN** (reusable, domain-free; build on first use):

- **Status and messages**: status/empty message (icon tile + title + body +
  CTA, from `StatesSheet`); inline banner (tinted, icon + title + detail +
  action, from `TrialStates`); notification row (icon tile, title, detail,
  mono meta)
- **Data display**: icon tile (44 px tinted square); stat/bento tile (one
  metric in Unbounded with a mono label); key/value summary rows (receipts,
  fee breakdowns); data table with mono header row (web, admin)
- **Structure**: section header with mono kicker; page header (kicker +
  display title + description); settings/list row with chevron
- **Inputs and progress**: filter chips; progress bar; stepper (`GymSetupSteps`)

**C. FUTURE_DOMAIN_COMPONENT** (built only by the feature ticket that first
needs them):

- **Commerce sheet (28 components)**:
  - Plans and pricing: PlanCard, PlanComparison, PriceDisplay,
    BillingCycleToggle, UpgradeModal, CancellationFlow
  - Subscription and payment: TrialBanner, SubscriptionStatus,
    CheckoutSummary, PaymentMethod, PaymentStatus, PromoCodeInput
  - Billing records: InvoiceRow, TransactionRow, RefundModal, FeeBreakdown,
    PayoutCard
  - Marketplace: ServiceCard, MembershipCard, PackageCard, MarketplaceCard
  - Sponsorship: SponsoredBadge, SponsorCard, SponsorStatus, CampaignCard,
    CampaignStatus, BudgetSelector, RevenueMetric
- **Training and social**: training/session cards, next-session card (the web
  nav's "NEXT · IN 2 H"), fight-camp progress, sparring cards, fighter/coach/gym
  cards, Live Board graph and node sheets (gym, fighter, training), boxing
  timer, achievement and challenge cards
- **Sharing**: share-card templates (`ShareCards`)
- **Sponsored placements**: native sponsored card, "why am I seeing this"

**D. APPLICATION_SHELL**:

- **Mobile tab bars**: Fighter (`FighterTabs`), Coach (`CoachTabs`), Gym
  (`GymTabs`)
- **Web sidebars**: Fighter (`FighterWebNav`, full + compact), Coach
  (`CoachWebNav`), Gym (`GymWebNav`), Admin (`AdminNav`), Sponsor portal
  (`SponsorNav`)
- **Other web shells**: gym setup wizard frame (`GymSetupSteps`), public
  website header/footer (`LandHome`, `RouteSite`)
- **Identity**: workspace switcher (`Workspaces`, A04)

**E. FEATURE_SCREEN**: every numbered artboard (screen code in its title) on
the product pages.

## 4. Brand assets (`brand-assets` page)

`LogoSheet.dc.html` — “The Corner S”. A boxing ring seen from above, with
four corner posts and an S-route from a solid node (where you trained) to an
open node (where you go next).

| Asset                          | Source in the design                                                                                                                         | Reliable vector source?                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Corner S mark (full)           | Inline SVG, `viewBox="0 0 64 64"`: ring `rect` rx 14 stroke 3.5, four corner posts r 3.4, S path stroke 6, solid node r 5.5, open node r 4.6 | **Yes**: exact SVG geometry in the artboard source  |
| Corner S mark (small, < 32 px) | Same S + nodes, `viewBox="13 13 38 38"`, corner posts dropped                                                                                | **Yes**                                             |
| Colour variants                | On dark (bone ring, olive S, olive-200 open node); on bone (graphite + `#5B6524`); one-colour on olive (graphite)                            | Yes (colour values in source)                       |
| Wordmark / horizontal lockup   | Live text: “SimpleFit” Unbounded 700 + “BOXING” JetBrains Mono 600, letter-spacing 0.62em                                                    | **No**: text, not outlined vectors                  |
| App icon                       | 132 px tile, radius 32: olive, dark or bone fill, small S mark, corner posts as CSS dots; sizes 64/40/28/16                                  | **No**: a CSS composition, no single 1024 px source |
| Splash / launch artwork        | Not designed                                                                                                                                 | **No**                                              |
| Clear space and don'ts         | No gloves, fists or flames; no rotation/mirroring; never fill both nodes                                                                     | Usage rules                                         |

`ShareCards.dc.html`: story (9:16) and post (1:1) share-card templates, with
a "never on a card" privacy list. These are product templates (FUTURE_DOMAIN,
rendered on device), not static brand assets.

**Brand-asset gaps** (for a brand-asset ticket; nothing was exported or
recreated in SF-16):

1. Outlined wordmark and horizontal lockup SVGs (from the brand owner; not
   rebuilt from live text).
2. App icon master (1024 × 1024, iOS and Android adaptive layers) and favicon
   set: the artboard shows the composition but has no master file.
3. Splash/launch artwork. Mobile still uses SF-12 neutral placeholder splash
   colours.
4. Approval to extract the Corner S mark SVG from `LogoSheet.dc.html` as the
   production master. The geometry is exact, but the extracted file should
   be approved as the canonical asset.

## 5. Open decisions (deferred, not made by SF-16)

1. Type scale and weights for both platforms, including the SF-13 web/mobile
   drift (§2.2 #6–8).
2. Spacing steps 2/10/14 and radius 9/12/16 (§2.2 #9–10).
3. Production roles for tertiary text, olive text, olive 500 and dark-theme
   olive borders/surfaces (§2.2 #3).
4. Adopting the artifact's olive 900 / amber / coral values (§2.2 #2).
5. Button sizes per platform (§2.2 #16).
6. Live Board and boxing-glove icons: Lucide equivalent or custom SimpleFit
   SVG (§2.2 #15).
7. Ownership of the transactional email templates (`Email*.dc.html`).
8. Brand-asset sourcing (§4).
