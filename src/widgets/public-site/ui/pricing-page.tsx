import { ChartColumn, FileText, Link2, Lock, Plug, Shield, Building2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import {
  COACH_PLANS,
  DEFAULT_PRICING_ROLE,
  FIGHTER_FREE,
  FIGHTER_FREE_FEATURES,
  FIGHTER_PRO,
  FIGHTER_PRO_FEATURES,
  FIGHTER_STAYS_FREE,
  GYM_MULTI_LOCATION_FROM,
  GYM_PLANS,
  PLAN_INTENT,
  PRICING_ROLES,
  type Billing,
  type PricingRole,
} from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { LeadForm } from "./lead-form";
import {
  ArrowLink,
  CheckList,
  CompactFeature,
  Eyebrow,
  FaqGrid,
  Lead,
  PageTitle,
  PriceTag,
  SiteCard,
  SitePage,
} from "./sections";

/**
 * `/pricing` (`web.pricing`): PR1 coach (the default), PR2 fighter, PR3 gym
 * and PR4 enterprise are `?role=` states of one route (Claude Design
 * PricingPublic, PricingFighter, PricingGym, PricingEnterprise · 1440).
 * `?billing=annual` is the Annual state of the billing toggle. Both are plain
 * links read on the server, so the first HTML, Back / Forward and a refresh
 * all show the requested state.
 *
 * The prices are the artboards' (model/pricing). There is no billing domain:
 * every plan action opens sign-up with the role's journey (SF-45 `intent`),
 * never a checkout. Annual prices exist only where the artboards state them
 * (Fighter Pro); the other plans show their monthly price and how annual
 * billing works.
 */
export function PricingPage({
  audience: role,
  billing,
}: {
  audience: PricingRole;
  billing: Billing;
}) {
  const t = useTranslations("site.pricing");
  const faqKeys =
    role === "enterprise"
      ? (["changePlans", "cancel", "fighterPays", "annual"] as const)
      : ([
          "changePlans",
          "cancel",
          "fighterPays",
          "annual",
          "processing",
          "commission",
          "international",
        ] as const);

  return (
    <SitePage gap="9">
      <PricingHeader role={role} billing={billing} />
      {role === "coach" ? <CoachPlans billing={billing} /> : null}
      {role === "fighter" ? <FighterPlans billing={billing} /> : null}
      {role === "gym" ? <GymPlans billing={billing} /> : null}
      {role === "enterprise" ? <Enterprise /> : null}
      <FaqGrid
        label={t("faq")}
        items={faqKeys.map((key) => ({ question: t(`faqs.${key}.q`), answer: t(`faqs.${key}.a`) }))}
      />
    </SitePage>
  );
}

/** The `/pricing` href of a role and billing state (coach is the canonical `/pricing`). */
export function pricingHref(role: PricingRole, billing: Billing = "monthly"): string {
  const query: Record<string, string> = {};
  if (role !== DEFAULT_PRICING_ROLE) query.role = role;
  if (billing === "annual") query.billing = "annual";
  return routeHref("web.pricing", {}, query);
}

/** The title, the role tabs and (except Enterprise) the billing toggle. */
function PricingHeader({ role, billing }: { role: PricingRole; billing: Billing }) {
  const t = useTranslations("site.pricing");
  return (
    <div className="flex flex-col gap-6 desktop:flex-row desktop:items-end desktop:gap-2.5">
      <div className="flex flex-col gap-2.5">
        <PageTitle>{t("title")}</PageTitle>
        <Lead size="md">{role === "enterprise" ? t("enterpriseLead") : t("lead")}</Lead>
      </div>
      <div className="flex flex-col gap-3 desktop:ml-auto desktop:items-end">
        <RoleTabs active={role} billing={billing} />
        {role === "enterprise" ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={t("billing.label")} size="sm">
              <SegmentLink
                href={pricingHref(role, "monthly")}
                current={billing === "monthly" ? "page" : undefined}
                size="sm"
              >
                {t("billing.monthly")}
              </SegmentLink>
              <SegmentLink
                href={pricingHref(role, "annual")}
                current={billing === "annual" ? "page" : undefined}
                size="sm"
              >
                {t("billing.annual")}
                <span className="type-micro font-extrabold text-highlight">
                  {t("billing.save")}
                </span>
              </SegmentLink>
            </Segmented>
            <span className="type-caption text-faint-foreground">{t("billing.vat")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Fighter / Coach / Gym / Enterprise tabs. On PR6 Gym is marked as the
 * current section (`aria-current="true"`), since its link is /pricing, not the
 * page itself.
 */
export function RoleTabs({
  active,
  billing = "monthly",
  current = "page",
}: {
  active: PricingRole;
  billing?: Billing;
  current?: "page" | "true";
}) {
  const t = useTranslations("site.pricing.roles");
  return (
    <Segmented label={t("label")} size="md">
      {PRICING_ROLES.map((role) => (
        <SegmentLink
          key={role}
          href={pricingHref(role, role === "enterprise" ? "monthly" : billing)}
          current={role === active ? current : undefined}
          size="md"
        >
          {t(role)}
        </SegmentLink>
      ))}
    </Segmented>
  );
}

function Segmented({
  label,
  size,
  children,
}: {
  label: string;
  size: "md" | "sm";
  children: ReactNode;
}) {
  return (
    <nav aria-label={label}>
      <ul
        className={cn(
          "inline-flex gap-1 border border-border bg-surface",
          size === "md" ? "rounded-3xl p-1 max-sm:flex-wrap" : "rounded-3xl p-1",
        )}
      >
        {children}
      </ul>
    </nav>
  );
}

function SegmentLink({
  href,
  current,
  size,
  children,
}: {
  href: string;
  current?: "page" | "true";
  size: "md" | "sm";
  children: ReactNode;
}) {
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={current}
        scroll={false}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
          size === "md" ? "h-10 px-5.5 type-body" : "h-8.5 px-4 type-body-sm",
          current
            ? "bg-secondary font-extrabold text-secondary-foreground"
            : "font-bold text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

type CardTone = "default" | "featured";

/** One plan card: name and badge, price, limit, divider, features and the action. */
function PlanCard({
  name,
  badge,
  price,
  priceNote,
  limit,
  features,
  action,
  tone = "default",
  compact = false,
}: {
  name: string;
  badge?: string;
  price: ReactNode;
  priceNote?: string;
  limit: string;
  features: readonly string[];
  action: { label: string; href: string; variant: "primary" | "quiet" | "outline" };
  tone?: CardTone;
  compact?: boolean;
}) {
  return (
    <article
      aria-label={name}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-3xl",
        compact ? "p-4" : "p-5",
        tone === "featured"
          ? "border-[1.5px] border-highlight bg-accent"
          : "border border-border bg-surface",
      )}
    >
      <div className="flex min-h-5.25 items-center justify-between gap-2">
        <h2
          className={cn(
            "type-label-lg",
            tone === "featured" ? "text-highlight" : "text-muted-foreground",
          )}
        >
          {name}
        </h2>
        {badge === undefined ? null : <Badge variant="primary">{badge}</Badge>}
      </div>
      <div className="flex flex-col gap-1">
        {price}
        {priceNote === undefined ? null : (
          <span className="type-caption text-faint-foreground">{priceNote}</span>
        )}
      </div>
      <p className="type-body font-extrabold">{limit}</p>
      <hr className="border-border" />
      <CheckList items={features} size="xs" />
      <div className="mt-auto pt-1.5">
        <Button asChild size="system" variant={action.variant} className="w-full">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </div>
    </article>
  );
}

function useFeatures(namespace: "site.pricing.coach.plans" | "site.pricing.gym.plans") {
  const t = useTranslations(namespace);
  return (id: string, count: number) =>
    Array.from({ length: count }, (_, index) =>
      t(`${id}.features.${index + 1}` as "free.features.1"),
    );
}

function CoachPlans({ billing }: { billing: Billing }) {
  const t = useTranslations("site.pricing");
  const plans = useTranslations("site.pricing.coach.plans");
  const common = useTranslations("site.common");
  const features = useFeatures("site.pricing.coach.plans");
  const format = useFormatter();
  const signup = withContinuation("web.signup", { intent: PLAN_INTENT.coach });
  return (
    <>
      <div className="grid gap-3.5 md:grid-cols-2 desktop:grid-cols-5">
        {COACH_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            name={plans(`${plan.id}.name`)}
            badge={plan.featured ? t("mostPopular") : undefined}
            tone={plan.featured ? "featured" : "default"}
            price={
              <PriceTag
                amount={formatPrice(format, plan.price)}
                unit={plan.price.amount > 0 ? common("perMonth") : undefined}
              />
            }
            priceNote={
              billing === "annual" && plan.price.amount > 0 ? t("billing.annualNote") : undefined
            }
            limit={plans(`${plan.id}.limit`)}
            features={features(plan.id, plan.features)}
            action={{
              label: plans(`${plan.id}.cta`),
              href: signup,
              variant: plan.primary ? "primary" : "quiet",
            }}
          />
        ))}
      </div>
      <p className="flex items-start gap-2.5 rounded-lg border border-accent-border bg-accent px-3.5 py-3 type-caption text-accent-foreground">
        <Lock aria-hidden className="mt-px size-4 flex-none text-highlight" />
        <span>{t.rich("coach.note", { b: (chunks) => <b>{chunks}</b> })}</span>
      </p>
    </>
  );
}

function FighterPlans({ billing }: { billing: Billing }) {
  const t = useTranslations("site.pricing.fighter");
  const common = useTranslations("site.common");
  const format = useFormatter();
  const signup = withContinuation("web.signup", { intent: PLAN_INTENT.fighter });
  const list = (prefix: "free.features" | "pro.features" | "stays.items", count: number) =>
    Array.from({ length: count }, (_, index) => t(`${prefix}.${index + 1}` as "free.features.1"));
  const annual = billing === "annual";
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]">
      <PlanCard
        name={t("free.name")}
        price={<PriceTag amount={formatPrice(format, FIGHTER_FREE)} />}
        limit={t("free.tagline")}
        features={list("free.features", FIGHTER_FREE_FEATURES)}
        action={{ label: t("free.cta"), href: signup, variant: "quiet" }}
      />
      <PlanCard
        tone="featured"
        name={t("pro.name")}
        badge={t("pro.badge")}
        price={
          <PriceTag
            amount={formatPrice(format, annual ? FIGHTER_PRO.annualPerMonth : FIGHTER_PRO.monthly)}
            unit={common("perMonth")}
          />
        }
        priceNote={
          annual
            ? `${formatPrice(format, FIGHTER_PRO.annualPerYear)}${common("perYear")}`
            : undefined
        }
        limit={t("pro.tagline")}
        features={list("pro.features", FIGHTER_PRO_FEATURES)}
        action={{ label: t("pro.cta"), href: signup, variant: "primary" }}
      />
      <SiteCard className="gap-3 p-5">
        <h2 className="type-label text-highlight">{t("stays.label")}</h2>
        <CheckList items={list("stays.items", FIGHTER_STAYS_FREE)} size="sm" />
        <hr className="border-border" />
        <p className="type-body-sm text-muted-foreground">
          {t("stays.annual", {
            year: formatPrice(format, FIGHTER_PRO.annualPerYear),
            month: formatPrice(format, FIGHTER_PRO.annualPerMonth),
          })}
        </p>
      </SiteCard>
    </div>
  );
}

function GymPlans({ billing }: { billing: Billing }) {
  const t = useTranslations("site.pricing");
  const plans = useTranslations("site.pricing.gym.plans");
  const common = useTranslations("site.common");
  const features = useFeatures("site.pricing.gym.plans");
  const format = useFormatter();
  const signup = withContinuation("web.signup", { intent: PLAN_INTENT.gym });
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 desktop:grid-cols-6">
        {GYM_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            compact
            name={plans(`${plan.id}.name`)}
            badge={plan.featured ? t("recommended") : undefined}
            tone={plan.featured ? "featured" : "default"}
            price={
              <PriceTag
                amount={formatPrice(format, plan.price)}
                unit={plan.price.amount > 0 ? common("perMonth") : undefined}
              />
            }
            priceNote={
              billing === "annual" && plan.price.amount > 0 ? t("billing.annualNote") : undefined
            }
            limit={plans(`${plan.id}.limit`)}
            features={features(plan.id, plan.features)}
            action={{
              label: plans(`${plan.id}.cta`),
              href: signup,
              variant: plan.primary ? "primary" : "quiet",
            }}
          />
        ))}
        <PlanCard
          compact
          name={plans("multi.name")}
          price={
            <PriceTag
              amount={plans("multi.from", { price: formatPrice(format, GYM_MULTI_LOCATION_FROM) })}
              unit={common("perMonth")}
            />
          }
          limit={plans("multi.limit")}
          features={features("multi", 5)}
          action={{
            label: plans("multi.cta"),
            href: pricingHref("enterprise"),
            variant: "outline",
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="type-body-sm text-muted-foreground">{t("gym.note")}</p>
        <span className="ml-auto">
          <ArrowLink href={routeHref("web.pricing.compare")}>{t("gym.compare")}</ArrowLink>
        </span>
      </div>
    </>
  );
}

function Enterprise() {
  const t = useTranslations("site.pricing.enterprise");
  const features = [
    { key: "locations", icon: Building2 },
    { key: "analytics", icon: ChartColumn },
    { key: "permissions", icon: Shield },
    { key: "billing", icon: FileText },
    { key: "api", icon: Plug },
    { key: "integrations", icon: Link2 },
  ] as const;
  return (
    <div className="grid gap-10 desktop:grid-cols-[minmax(0,1fr)_520px] desktop:gap-12">
      <div className="flex min-w-0 flex-col gap-4.5">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <PageTitle as="h2" size="site-title-sm">
          {t("title")}
        </PageTitle>
        <p className="type-site-body text-muted-foreground">{t("lead")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {features.map(({ key, icon }) => (
            <CompactFeature
              key={key}
              icon={icon}
              title={t(`features.${key}.title`)}
              body={t(`features.${key}.body`)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="type-body text-muted-foreground">{t("ownBrand")}</span>
          <ArrowLink href={routeHref("web.white-label")}>{t("whiteLabel")}</ArrowLink>
        </div>
      </div>
      <LeadForm
        title={t("form.title")}
        fields={[
          {
            key: "organization",
            label: t("form.organization"),
            placeholder: t("form.organizationPlaceholder"),
            half: true,
          },
          {
            key: "countries",
            label: t("form.countries"),
            placeholder: t("form.countriesPlaceholder"),
            half: true,
          },
          {
            key: "locations",
            label: t("form.locations"),
            placeholder: t("form.locationsPlaceholder"),
            half: true,
          },
          {
            key: "members",
            label: t("form.members"),
            placeholder: t("form.membersPlaceholder"),
            half: true,
          },
          {
            key: "requirements",
            label: t("form.requirements"),
            placeholder: t("form.requirementsPlaceholder"),
          },
          {
            key: "contact",
            label: t("form.contact"),
            placeholder: t("form.contactPlaceholder"),
            half: true,
          },
          {
            key: "email",
            label: t("form.email"),
            placeholder: t("form.emailPlaceholder"),
            half: true,
            type: "email",
          },
        ]}
        submit={t("form.submit")}
        unavailable={t("form.unavailable")}
      />
    </div>
  );
}
