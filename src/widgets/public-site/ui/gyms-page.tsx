import { Megaphone, QrCode, Ticket, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";

import { GYM_PLANS } from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { PlansCard, RoleHero, Stat } from "./role-sections";
import {
  AccentHeading,
  ActionRow,
  ArrowLink,
  CheckList,
  CtaBand,
  Eyebrow,
  ExampleTag,
  FeatureCard,
  Lead,
  SectionLabel,
  SiteCard,
  SitePage,
} from "./sections";

/**
 * L4 · For gyms (`web.gyms`; Claude Design LandGyms, 1440 × 1840): the hero
 * with an example gym day, four features, the 14 setup steps and the plans
 * table, and the open-your-gym band. Sign-up carries the Gym journey; several
 * locations lead to Enterprise (PR4).
 */
export function GymsPage() {
  const t = useTranslations("site.gyms");
  const pricing = useTranslations("site.pricing.gym.plans");
  const format = useFormatter();
  const setup = withContinuation("web.signup", { intent: "gym" });
  const plans = routeHref("web.pricing", {}, { role: "gym" });

  return (
    <SitePage gap="4">
      <RoleHero
        exampleWidth={520}
        copy={
          <>
            <Eyebrow tone="muted">{t("eyebrow")}</Eyebrow>
            <AccentHeading size="site-hero" text={t("title")} accent={t("titleAccent")} />
            <Lead>{t("lead")}</Lead>
            <ActionRow
              actions={[
                { label: t("primary"), href: setup, primary: true },
                { label: t("secondary"), href: plans },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-body-sm text-faint-foreground">{t("locations")}</span>
              <ArrowLink href={routeHref("web.pricing", {}, { role: "enterprise" })}>
                {t("sales")}
              </ArrowLink>
            </div>
          </>
        }
        example={<GymDay />}
      />
      <div className="grid gap-4 md:grid-cols-2 desktop:grid-cols-4">
        <FeatureCard
          as="h2"
          icon={Ticket}
          title={t("features.memberships.title")}
          body={t("features.memberships.body")}
        />
        <FeatureCard
          as="h2"
          icon={QrCode}
          title={t("features.checkin.title")}
          body={t("features.checkin.body")}
        />
        <FeatureCard
          as="h2"
          icon={Users}
          title={t("features.staff.title")}
          body={t("features.staff.body")}
        />
        <FeatureCard
          as="h2"
          icon={Megaphone}
          title={t("features.promote.title")}
          body={t("features.promote.body")}
        />
      </div>
      <div className="grid gap-4 desktop:grid-cols-2">
        <SiteCard className="gap-3 p-6.5">
          <SectionLabel tone="highlight" as="h2">
            {t("setup.label")}
          </SectionLabel>
          <CheckList
            items={["first", "second", "import"].map((key) =>
              t(`setup.items.${key}` as "setup.items.first"),
            )}
          />
        </SiteCard>
        <PlansCard
          label={t("plans.label")}
          columns={[t("plans.plan"), t("plans.members"), t("plans.price")]}
          rows={GYM_PLANS.map((plan) => ({
            id: plan.id,
            name: pricing(`${plan.id}.name`),
            capacity: t("plans.upTo", { count: plan.limit ?? 0 }),
            price: formatPrice(format, plan.price),
            featured: plan.featured,
          }))}
          link={{ label: t("plans.link"), href: plans }}
        />
      </div>
      <CtaBand
        title={t("band.title")}
        body={t("band.body")}
        actions={[{ label: t("band.primary"), href: setup, primary: true }]}
      />
    </SitePage>
  );
}

/** The example gym day of the hero (tagged; one described figure). */
function GymDay() {
  const t = useTranslations("site.gyms.today");
  const common = useTranslations("site.common");
  const rows = [
    { title: t("class"), note: t("classNote") },
    { title: t("failed"), note: t("failedNote"), badge: t("retry") },
    { title: t("leads"), note: t("leadsNote") },
  ];
  return (
    <figure aria-label={t("description")}>
      <SiteCard className="gap-2.5 p-5.5">
        <div aria-hidden className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="type-label text-faint-foreground">{t("label")}</span>
            <ExampleTag label={common("example")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label={t("checkedIn")}
              value={t("checkedInValue")}
              note={t("checkedInNote")}
              accent
            />
            <Stat label={t("revenue")} value={t("revenueValue")} note={t("revenueNote")} />
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
              {row.badge === undefined ? null : <Badge variant="warning">{row.badge}</Badge>}
            </div>
          ))}
        </div>
      </SiteCard>
    </figure>
  );
}
