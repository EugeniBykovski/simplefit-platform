# Design reconciliation: Claude Design vs production

This record is **kept identical** in `simplefit-platform` and
`simplefit-mobile`. Related documents:

- `docs/design-handoff.md`: the contract this record supports.
- `docs/design-tokens.json`: the resulting production contract.

History:

- **SF-16:** audited the canonical design against SF-13 and recorded the gaps.
- **SF-17:** resolved them from evidence across the **whole** canvas.

What remains is listed as INTENTIONAL_DIFFERENCE or DEFERRED with an owner.

- **Artifact:** `JEsBg51MjX8KiHWEro8omY`, version `1791206633-31de`, read
  read-only.
  - SF-16 (2026-10-05): `canvas.json`, all 15 Design System artboards, both
    Brand Assets artboards, and 14 sampled screens.
  - SF-17 (2026-10-05): all **456** artboards. Statistics count only the
    **410 product screens** (artboards whose title carries a screen code):
    205 mobile, 189 web, 16 email. Flow, route, gallery and pitch boards are
    excluded.
- **Production compared:** SF-13 on `main`, with the SF-16 handoff, in both
  repositories.

Status vocabulary: **RESOLVED** (production now expresses the canonical
intent), **INTENTIONAL_DIFFERENCE** (production deliberately differs, with
the reason), **DEFERRED** (known; owned by a later ticket).

## 1. Canonical design-system intent

From `Styleguide.dc.html` (“Graphite × Olive · Visual System 2026”), the
Design System page's reference artboard:

- **Graphite foundation:** 950 `#111312`, 900 `#181B19`, 850 `#1F2320`, 700
  `#2E332F`; text `#EDEFE7`.
- **Olive (action and progress):** 200 `#E4EAB8`, 300 `#C9D17E`, 400
  `#AEB95A`, 600 `#4E5626`, 900 `#262B15`.
- **Signals (attention only):** amber `#E3A24F`, coral `#E07A5F`, bone/rest
  `#ECEDE5`.
- **Type roles:** Unbounded (numbers, timers, headlines), Manrope (interface,
  body), JetBrains Mono (labels, metadata).
- **Principles:**
  - one olive CTA per screen
  - bento tiles, one big metric each
  - gym mode: 60 px bottom targets, full-bleed olive in rounds, bone at rest
  - AI suggests, the coach decides

## 2. Evidence (SF-17, 410 product screens)

The decisions below rest on these counts. Each value lists its occurrences
and the number of screens it appears on.

**Typography.** The most frequent (family, size, weight) combinations:

| Family         | Size / weight             | Count        | Screens      | Platforms     | Became                               |
| -------------- | ------------------------- | ------------ | ------------ | ------------- | ------------------------------------ |
| Manrope        | 12 / 400                  | 2013         | 353          | mobile + web  | `caption`                            |
| Manrope        | 13 / 400                  | 1369         | 261          | mostly web    | `body-sm`                            |
| JetBrains Mono | 10 / 400, 0.14em          | 1307         | 350          | both          | `label`                              |
| Manrope        | 13 / 800                  | 1250         | 277          | mostly web    | button label (body-sm 800)           |
| Manrope        | 14 / 800                  | 1024         | 252          | both          | mobile `md` button label (body 800)  |
| Manrope        | 12 / 700                  | 861          | 193          | both          | field label (caption 700)            |
| Manrope        | 10 / 800                  | 611          | 171          | both          | `badge`                              |
| Manrope        | 15 / 800                  | 517          | 214          | both          | primary CTA label (body-lg 800)      |
| JetBrains Mono | 11 / 400, 0.16em          | 350          | 86           | web, email    | `label-lg`                           |
| Unbounded      | 15 / 600                  | 249          | 108          | web           | `title`                              |
| Unbounded      | 26 / 700, −0.03em         | 190          | 53           | both          | `metric-lg`                          |
| Unbounded      | 22 / 600, −0.02em         | 137          | 131          | both          | `h2`                                 |
| Unbounded      | 22, 30, 18 / 700, −0.03em | 72 · 54 · 60 | 49 · 23 · 25 | both          | `metric`, `metric-xl`, `metric-sm`   |
| Unbounded      | 26 / 600, −0.02em         | 60           | 58           | mobile, email | `h1`                                 |
| Unbounded      | 19 / 600, −0.01em         | 57           | 57           | mobile        | `h3`                                 |
| Manrope        | 14 / 400, 15 / 400 · 600  | 184, 76 · 55 | 111, 68 · 25 | both          | `body`, `body-lg` (600 field values) |

Weights in use: Manrope 400, 600, 700 and **800** (the most frequent
emphasis weight). Unbounded 600 (headings) and 700 (metrics). JetBrains Mono 400. Manrope 500 and Mono 500, which SF-13 bundled, do not occur.

**Spacing.**

- **Gaps (9 981):** 2 (11.6%), 4, 6 (10.2%), 8 (18.0%), 10 (10.5%), 12
  (22.2%), 14 (7.7%) and 16 cover 90%. Odd values (1, 3, 5, 7) are about 6%.
- **Paddings (9 163):** dominated by 4, 8, 10, 12, 14, 16, 18, 20, 22 and 32.
  9 px is internal badge padding.
- **Public website (all 11 pages):** 56, 64 and 80 px section spacing.

**Radius.** Radii 7, 11, 13, 15, 17, 26 and 30 are circles or pills, where
radius = height / 2. The non-full roles:

- **9:** badges (571, padding 4 × 9).
- **12:** 40–48 px web buttons and fields, chips (990 total).
- **16:** 54 px mobile fields, banners.
- **18:** 50–56 px CTAs.
- **20:** compact cards, padding 14 × 16 (316).
- **22:** cards, padding 18 × 20 (1 024 on 360 screens).
- **24–30:** sheets and panels.

**Controls.**

- **Web buttons:** 40 px with radius 12 and 13/800 (quiet 103, primary 68,
  ghost, danger); 46–48 px with radius 12; 52–54 px with radius 18 and 15/800
  (hero, checkout).
- **Mobile buttons:** 56 px with radius 18 and 15/800 (primary, 86); 50 px
  with radius 18 and 14/800 (secondary); 34–36 px compact.
- **Fields:** web 40 px, radius 12, 13 px; mobile 54 px, radius 16, 15/600.
  Both use `#181B19` with a `#282D29` border and a 1.5 px olive focus border.
- **Toggles:** 44 × 26.

**Colour.** Text colours by occurrence:

| Colour    | Count | Screens |
| --------- | ----- | ------- |
| `#EDEFE7` | 3 852 | 386     |
| `#A7AD9F` | 3 753 | 373     |
| `#848B80` | 2 032 | 352     |
| `#C9D17E` | 871   | 253     |
| `#5B615C` | 226   | 97      |
| `#F2D3A6` | 186   | 107     |
| `#F0A28E` | 173   | 89      |
| `#B9C08E` | 170   | 99      |

Borders by occurrence:

| Colour    | Count |
| --------- | ----- |
| `#282D29` | 1 562 |
| `#2E332F` | 862   |
| `#23272A` | 735   |
| `#3A403B` | 243   |
| `#C9D17E` | 229   |
| `#4E5626` | 223   |
| `#8D9840` | 124   |

## 3. Findings and status

| #   | Area              | SF-16 finding                                                                     | SF-17 status and resolution                                                                                                                                                                                                                                                                               |
| --- | ----------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Palette           | Graphite, bone and olive core steps identical                                     | **RESOLVED** (matched already)                                                                                                                                                                                                                                                                            |
| 2   | Palette           | Olive 900, amber and coral drift from the PDF-derived values                      | **RESOLVED**: canonical Styleguide values adopted on both platforms. Olive 900 `#262B15`, amber `#E3A24F`, coral `#E07A5F`; graphite 800 `#282D29` (the artboards' hairline). Every contrast pair still passes                                                                                            |
| 3   | Semantic colour   | No role for tertiary text, olive text, olive 500, olive borders or olive surfaces | **RESOLVED**: new roles `faint-foreground` (`#848B80`), `highlight`/`-foreground` (`#C9D17E`), `primary-muted` (olive 500 `#8D9840`), `accent-border` (`#4E5626`), `accent-strong` (`#333A1C`), `accent-muted-foreground` (`#B9C08E`), `border-strong` (`#3A403B`). Secondary text corrected to `#A7AD9F` |
| 4   | Signals           | Tints, borders and tinted-text values differ; no signal borders                   | **RESOLVED**: canonical tints (`#3A2E1A`, `#2A1A16`), tinted text (`#F2D3A6`, `#F0A28E`) and new `*-border` tokens for every status                                                                                                                                                                       |
| 5   | Typography        | Families and roles                                                                | **RESOLVED** (matched already)                                                                                                                                                                                                                                                                            |
| 6   | Typography        | Design text 10–15 px between SF-13 steps                                          | **RESOLVED**: one semantic scale of 17 roles from the evidence above, identical px on web and mobile                                                                                                                                                                                                      |
| 7   | Typography        | Web `type-*` differed from the documented scale that mobile used                  | **RESOLVED**: both platforms implement the same roles from `design-tokens.json`, enforced by each repository's tests                                                                                                                                                                                      |
| 8   | Typography        | Unbounded 600 headings; Manrope 800 frequent but not bundled on mobile; Mono 600  | **RESOLVED**: headings 600, metrics 700; mobile bundles Manrope 800 and Mono 400 (and drops the unused 500 weights). Mono 600 occurs only in the brand wordmark (a brand asset, not UI)                                                                                                                   |
| 9   | Spacing           | 10 and 14 frequent but outside the SF-13 rule                                     | **RESOLVED**: the spacing scale is 2 px steps to 24 (0.5–6), then 8, 10, 12, 14, 16 and 20. ESLint enforces it. Mobile also had a hidden 12.5% shrink (NativeWind 1 rem = 14 pt), fixed with `inlineRem: 16`                                                                                              |
| 10  | Radius            | 9, 12, 16 (and 18, 20) frequent; SF-13 had 10/14/18                               | **RESOLVED**: scale `xs` 6, `sm` 9, `md` 12, `lg` 16, `xl` 18, `2xl` 20, `3xl` 22, `4xl` 28, `full`. Tailwind defaults removed                                                                                                                                                                            |
| 11  | Borders           | 1 px hairlines; dashed placeholders                                               | **RESOLVED** (matched); dividers `#23272A` map to `border` (`#282D29`), the nearest step and visually indistinguishable                                                                                                                                                                                   |
| 12  | Elevation         | Surfaces and hairlines, ring halos                                                | **RESOLVED** (matched)                                                                                                                                                                                                                                                                                    |
| 13  | Motion            | Skeleton pulse on web; static on mobile                                           | **INTENTIONAL_DIFFERENCE**: mobile skeleton stays static (SF-13 decision; avoids continuous native animation)                                                                                                                                                                                             |
| 14  | Themes            | Product design is dark-only                                                       | **INTENTIONAL_DIFFERENCE**: dark is the canonical pixel-faithful reference; light stays a supported, derived, AA-tested extension. No light design is invented                                                                                                                                            |
| 15  | Icons             | Live Board node graph and boxing glove have no Lucide equivalent                  | **DEFERRED**: owned by the first application-shell / Live Board ticket, with source assets (§5)                                                                                                                                                                                                           |
| 16  | Buttons           | Sizes, radius and weight 800 differ; no quiet graphite button                     | **RESOLVED**: web sm 32 / md 40 / lg 48 (radius 12), xl 54 (radius 18); mobile sm 36 pill (44 pt target) / md 50 / lg 56 (radius 18), gym 60 (radius 20). All labels 800. New `quiet` and `destructive-subtle` variants; `ghost` uses muted text; `outline` uses the olive-500 border and highlight text  |
| 17  | Badges            | Pill text and radius                                                              | **RESOLVED**: `badge` role (10 / 800, uppercase), radius `sm` 9, padding 4 × 9                                                                                                                                                                                                                            |
| 18  | Segmented control | Selected segment                                                                  | **RESOLVED**: pill track on `surface`, selected segment bone (`secondary`) 800 on both platforms                                                                                                                                                                                                          |
| 19  | Navigation        | Role tab bars and web sidebars                                                    | **DEFERRED**: APPLICATION_SHELL tickets (handoff §7); not built in SF-17                                                                                                                                                                                                                                  |
| 20  | Responsive        | Only fixed frames (390, 1440, 680)                                                | **DEFERRED** per screen: each web ticket reports responsive behaviour in its design QA                                                                                                                                                                                                                    |
| 21  | Accessibility     | `#5B615C` meta text at 2.9:1                                                      | **INTENTIONAL_DIFFERENCE**: production uses `faint-foreground` (≥4.54:1 on every surface)                                                                                                                                                                                                                 |
| 22  | Copy              | Copy vs sample data                                                               | **RESOLVED** (process in the handoff contract)                                                                                                                                                                                                                                                            |

Other SF-17 decisions:

- **Field labels and fields** follow the artboards (§2). Web inputs render
  16 px below `md` so iOS Safari does not zoom: **INTENTIONAL_DIFFERENCE**
  (platform convention).
- **Web switch** is 44 × 26 like the design. The **mobile switch** stays the
  native control: **INTENTIONAL_DIFFERENCE** (platform convention), with token
  colours.
- **Avatar** initials sit on `highlight` in Unbounded (badge role on the
  smallest mobile avatar).
- **SF-42 public website shell:** the header and footer shared by every
  public-website artboard are matched 1:1 at 1440 instead of by nearest step,
  so the values the scales lacked are now tokens: spacing `6.5` (26) and `9`
  (36), radius `md-lg` (14), palette `graphite-975` (`#0D0E0D`) as
  `surface-sunken` (the footer band; light `bone-200`), `border-subtle`
  (graphite 850 `#1F2320`, the shell's hairline; light `bone-200`) and the web
  type roles `typography.siteRoles.web`. Decision 11 (hairlines → `border`)
  still holds everywhere else; the public-site shell uses `border-subtle`.
  New contrast pairs: `muted-foreground` and `faint-foreground` on
  `surface-sunken`, AA in both themes.
- **SF-38 Fighter web registration (decision):** WF0 / WF1 set their step
  heading at 32 px and WF6 its completion headline at 40 px (Unbounded 600),
  beyond the ±1 px tolerance of every role. They are added as
  `typography.onboardingRoles.web` (`onboarding-title` 32/40, −0.02em, the
  font's natural line; `onboarding-done` 40/44, −0.025em), web only and for
  the Fighter onboarding screens only. The authentication roles are unchanged.
- **SF-47 web role selection (decision):** WA6 draws its journey card notes
  in mono 10 px at 0.08em, uppercase; `label` (0.14em) makes the longest
  English note wrap where the artboard keeps one line. Added as
  `typography.onboardingRoles.web.label-tight` (10/14, 0.08em, uppercase),
  web only and for the web account onboarding screens only. `label` is
  unchanged.
- **SF-37 mobile account entry (decision, no token change):** O04 draws date
  of birth, a required contact-sport / health notice and no full name; it is
  built with the SF-44 fields instead (full name, date of birth, Terms,
  Privacy, optional product news), as the web WA5, because ADR 0016 makes no
  health notice global and O02 cannot store a name. O05 draws Fighter
  preselected; production picks nothing by default (SF-45). Both keep the
  artboards' layout; their invite links wait for the invite domain (A03).
- **SF-40 web first-run tour (decision, no token change):** FRW2 (nine steps
  and a completion state since design `1791543685-48be`) draws a bone
  coach-mark card on the dark page. Production builds it from the light
  theme's semantic tokens (`background`, `foreground`, `muted-foreground`,
  `highlight`, `secondary`), scoped to the card, so it stays a theme-correct
  inverse surface without new tokens. The card's 3 px arrow radius has no
  step within tolerance; the arrow tip is square.
- **SF-39 mobile Fighter registration (decision, no token change):** OF5–OF10
  draw gym search, membership plans, coach invites, privacy toggles, friend
  suggestions and notification switches; none of those domains exists, so
  each step keeps its heading, line, progress and Skip and shows one muted
  notice saying what the step will do, recording nothing (OF8 adds the one
  real fact: body weight is never public). OF1 draws no date of birth (O04
  owns it) and its avatar waits for media upload. OF11 draws a first class,
  requests and a weekly plan; production shows the saved profile only, with
  no back button (completion is final). OF4's privacy note drops "and a
  coach you approve" (no coach access exists). The OF11 28 px heading uses
  `h1` (26 px, within tolerance).
- **Hero type** larger than `display` (40–58 px on a handful of landing and hero artboards)
  is **DEFERRED** to the public-website ticket, which decides whether a
  `display-lg` role is needed.
- **SF-34 extension:** the system states of Claude Design section 35 use
  sizes beyond `display` (404 numerals 92–200 px, a 52 px headline, the
  launch wordmark). They are added as `typography.systemRoles` with a web and
  a mobile value each (`hero`, `lead`, `wordmark`, `numeral`, `numeral-ko`,
  `label-wide`, `count-word`), for system states only. The product scale
  gains `brand` (the 13 px sidebar wordmark) and mono 600; the button
  contract gains the `warning` variant and the 44 px `system` size (System
  states sheet).
- **SF-24 extension (decision):** the authentication artboards use type and
  control sizes beyond the product roles (WA1 48 px hero, O02w 52 px
  display and 17 px lead, 30 and 34 px form headings, 30 / 24 px code
  digits, A01 31 px hero, a 44 px web email field). They are added as
  `typography.authRoles` (web `auth-display`, `auth-hero`, `auth-title`,
  `auth-heading`, `auth-lead`, `code-digit`; mobile `auth-hero`,
  `code-digit`) and `controls.field.webLarge`, for authentication screens
  only. The 50 and 52 px web auth buttons translate to the `xl` button
  (54 px).
- **Undocumented olive steps** `#1C2010` (selected deep surface) and
  `#EEF2D2` map to `accent` / `accent-foreground`, the nearest roles; they
  are within tolerance and not systematic enough for tokens.

## 4. Component inventory and classification

Unchanged from SF-16 apart from the primitive list.

**A. PRODUCTION_PRIMITIVE** (in `src/shared/ui`):

- **Controls:** Button (primary, secondary, quiet, outline, ghost,
  destructive, destructive-subtle), Input, Textarea, Select, Checkbox,
  RadioGroup, Switch, SegmentedControl / Tabs
- **Display:** Badge, Avatar, Card (default and compact), Separator
- **Feedback:** Skeleton, Spinner, Modal / Dialog / Sheet, Toast,
  Tooltip / Popover / DropdownMenu
- **Typography:** Text roles

**B. COMPOSED_UI_PATTERN** (domain-free; build on first use):

- **Status and messages:** status/empty message (icon tile + title + body +
  CTA, `StatesSheet`); inline banner (tinted, icon + title + detail +
  action); notification row
- **Data display:** icon tile; stat/bento tile (`metric-*` + `label`);
  key/value summary rows; data table with a `label` header row
- **Structure:** section header (`label` kicker); page header; settings/list
  row
- **Inputs and progress:** filter chips; progress bar; stepper

**C. FUTURE_DOMAIN_COMPONENT** (built only by the feature ticket that first
needs them):

- **Commerce sheet (28):**
  - Plans and pricing: PlanCard, PlanComparison, PriceDisplay,
    BillingCycleToggle, UpgradeModal, CancellationFlow
  - Subscription and payment: TrialBanner, SubscriptionStatus,
    CheckoutSummary, PaymentMethod, PaymentStatus, PromoCodeInput
  - Billing records: InvoiceRow, TransactionRow, RefundModal, FeeBreakdown,
    PayoutCard
  - Marketplace: ServiceCard, MembershipCard, PackageCard, MarketplaceCard
  - Sponsorship: SponsoredBadge, SponsorCard, SponsorStatus, CampaignCard,
    CampaignStatus, BudgetSelector, RevenueMetric
- **Training and social:** training/session cards, next-session card,
  fight-camp progress, sparring cards, fighter/coach/gym cards, Live Board
  graph and node sheets, boxing timer, achievement and challenge cards
- **Sharing and sponsorship:** share-card templates, sponsored placements

**D. APPLICATION_SHELL** (not built):

- **Mobile tab bars:** Fighter (`FighterTabs`), Coach (`CoachTabs`), Gym
  (`GymTabs`)
- **Web sidebars:** Fighter (`FighterWebNav`), Coach (`CoachWebNav`), Gym
  (`GymWebNav`), Admin (`AdminNav`), Sponsor portal (`SponsorNav`)
- **Other shells:** gym setup wizard frame, public website header/footer,
  workspace switcher

**E. FEATURE_SCREEN:** every numbered product artboard.

## 5. Brand assets (`brand-assets` page)

Unchanged by SF-17: nothing was exported, traced or recreated.

| Asset                                                         | Source in the design                           | Reliable vector source? |
| ------------------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| Corner S mark (full, `viewBox 0 0 64 64`)                     | Exact inline SVG in `LogoSheet.dc.html`        | **Yes**                 |
| Corner S mark (small, `viewBox 13 13 38 38`, no corner posts) | Exact inline SVG                               | **Yes**                 |
| Colour variants (on dark, on bone, one-colour on olive)       | Colour values in source                        | Yes                     |
| Wordmark / horizontal lockup                                  | Live text (Unbounded 700 + JetBrains Mono 600) | **No**                  |
| App icon                                                      | CSS composition of tile + dots + small mark    | **No**                  |
| Splash / launch artwork                                       | Not designed                                   | **No**                  |

**Brand-asset gaps:** these stay explicit and are owned by a brand-asset
ticket.

1. Outlined wordmark and lockup SVGs.
2. App icon master (1024 px plus adaptive layers) and favicon set. The web
   currently answers `/favicon.ico` with 404.
3. Splash artwork. Mobile still uses SF-12 neutral splash colours.
4. Approval to extract the Corner S SVG as the production master.

## 6. Deferred (owner)

1. Role navigation shells (tab bars, web sidebars): APPLICATION_SHELL tickets.
2. Live Board and boxing-glove icons: the first shell / Live Board ticket,
   with source assets and explicit ownership.
3. Brand assets (§5): brand-asset ticket.
4. Transactional email templates (`Email*.dc.html`): owner not decided.
5. A `display-lg` hero role: public-website ticket.
6. Canonical light-theme design: Claude Design, if and when it exists.
