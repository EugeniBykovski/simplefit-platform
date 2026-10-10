import { CreditCard, Flag, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";

import { COACH_PLANS } from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { PlansCard, RoleHero, Stat } from "./role-sections";
import {
  AccentHeading,
  ActionRow,
  CtaBand,
  Eyebrow,
  ExampleTag,
  FeatureCard,
  Lead,
  PriceTag,
  SectionLabel,
  SiteCard,
  SitePage,
} from "./sections";

/**
 * L3 · For coaches (`web.coaches`; Claude Design LandCoaches, 1440 × 1840):
 * the hero with an example coach week, three features, the fees example and
 * the plans table, and the invite band. The week and the fees are examples
 * of the product (tagged), the plans come from the pricing model.
 */
export function CoachesPage() {
  const t = useTranslations("site.coaches");
  const pricing = useTranslations("site.pricing.coach.plans");
  const format = useFormatter();
  const start = withContinuation("web.signup", { intent: "coach" });
  const plans = routeHref("web.pricing", {}, { role: "coach" });

  return (
    <SitePage gap="4">
      <RoleHero
        exampleWidth={500}
        copy={
          <>
            <Eyebrow tone="warning">{t("eyebrow")}</Eyebrow>
            <AccentHeading size="site-hero" text={t("title")} accent={t("titleAccent")} />
            <Lead>{t("lead")}</Lead>
            <ActionRow
              actions={[
                { label: t("primary"), href: start, primary: true },
                { label: t("secondary"), href: plans },
              ]}
            />
            <p className="type-body-sm text-faint-foreground">{t("note")}</p>
          </>
        }
        example={<CoachWeek />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <FeatureCard
          as="h2"
          icon={Flag}
          title={t("features.programs.title")}
          body={t("features.programs.body")}
        />
        <FeatureCard
          as="h2"
          icon={Users}
          title={t("features.sparring.title")}
          body={t("features.sparring.body")}
        />
        <FeatureCard
          as="h2"
          icon={CreditCard}
          title={t("features.paid.title")}
          body={t("features.paid.body")}
        />
      </div>
      <div className="grid gap-4 desktop:grid-cols-2">
        <FeesCard />
        <PlansCard
          label={t("plans.label")}
          columns={[t("plans.plan"), t("plans.fighters"), t("plans.price")]}
          rows={COACH_PLANS.map((plan) => ({
            id: plan.id,
            name: pricing(`${plan.id}.name`),
            capacity:
              plan.limit === null ? t("plans.unlimited") : t("plans.upTo", { count: plan.limit }),
            price: formatPrice(format, plan.price),
            featured: plan.featured,
          }))}
          link={{ label: t("plans.link"), href: plans }}
        />
      </div>
      <CtaBand
        title={t("band.title")}
        body={t("band.body")}
        actions={[{ label: t("band.primary"), href: start, primary: true }]}
      />
    </SitePage>
  );
}

/** The example coach week of the hero (tagged; one described figure). */
function CoachWeek() {
  const t = useTranslations("site.coaches.week");
  const common = useTranslations("site.common");
  const rows = [
    { title: t("camp"), note: t("campNote"), badge: t("onTrack") },
    { title: t("sparring"), note: t("sparringNote") },
    { title: t("pt"), note: t("ptNote"), badge: t("paid") },
  ];
  return (
    <figure aria-label={t("description")} className="relative">
      <SiteCard className="gap-2.5 p-5.5">
        <div aria-hidden className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="type-label text-faint-foreground">{t("label")}</span>
            <ExampleTag label={common("example")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label={t("fighters")} value={t("fightersValue")} note={t("fightersNote")} />
            <Stat
              label={t("sessions")}
              value={t("sessionsValue")}
              note={t("sessionsNote")}
              accent
            />
          </div>
          {rows.map((row, index) => (
            <div
              key={row.title}
              className={
                index < rows.length - 1
                  ? "flex min-h-15 items-center gap-3 border-b border-border py-2"
                  : "flex min-h-15 items-center gap-3 py-2"
              }
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-body font-extrabold">{row.title}</span>
                <span className="type-caption text-muted-foreground">{row.note}</span>
              </span>
              {row.badge === undefined ? null : <Badge variant="accent">{row.badge}</Badge>}
            </div>
          ))}
        </div>
      </SiteCard>
    </figure>
  );
}

/** The example PT sale behind "Fees you can see" (tagged; one described figure). */
function FeesCard() {
  const t = useTranslations("site.coaches.fees");
  const common = useTranslations("site.common");
  const format = useFormatter();
  const eur = (amount: number) => formatPrice(format, { amount, currency: "EUR" });
  const lines = [
    { label: t("clientPays"), value: eur(50) },
    { label: t("processing"), value: `− ${eur(1.05)}`, negative: true },
    { label: t("platform"), value: eur(0) },
  ];
  return (
    <SiteCard className="gap-2.5 p-6.5">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel tone="highlight" as="h2">
          {t("label")}
        </SectionLabel>
        <ExampleTag label={common("example")} />
      </div>
      <figure aria-label={t("description")} className="flex flex-col">
        <div aria-hidden className="flex flex-col">
          {lines.map((line) => (
            <div
              key={line.label}
              className="flex justify-between gap-3 border-b border-border py-2 type-body-sm"
            >
              <span className="text-muted-foreground">{line.label}</span>
              <span
                className={
                  line.negative ? "font-bold text-destructive-subtle-foreground" : "font-bold"
                }
              >
                {line.value}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-2.5">
            <span className="type-body font-extrabold">{t("receive")}</span>
            <PriceTag size="md" amount={eur(48.95)} />
          </div>
        </div>
      </figure>
      <p className="type-micro text-faint-foreground">{t("note")}</p>
    </SiteCard>
  );
}
