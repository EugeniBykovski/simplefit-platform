import { House, Star, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { routeHref } from "@/shared/routes/routes";
import { GloveIcon } from "@/shared/ui/glove-icon";

import { COACH_PLANS, FIGHTER_FREE, GYM_PLANS } from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { BoardIllustration } from "./board-illustration";
import {
  AccentHeading,
  ActionRow,
  ArrowLink,
  CtaBand,
  Eyebrow,
  FeatureCard,
  Lead,
  PriceTag,
  SectionLabel,
  SiteCard,
  SitePage,
} from "./sections";

/**
 * L1 · Landing · home (`web.root`; Claude Design LandHome, 1440 × 2180): the
 * hero and the Live Board illustration, who SimpleFit is for, what you get,
 * the marketplace and pricing cards, and the privacy band.
 *
 * SF-43 decisions: the hero's adoption figures (members, gyms, markets) are
 * left out, nothing backs them; the illustration is tagged as an example.
 * Sign-up starts without a journey (the visitor picks it on O02w).
 */
export function HomePage() {
  const t = useTranslations("site.home");
  const common = useTranslations("site.common");
  const format = useFormatter();
  const who = [
    { key: "fighters", icon: GloveIcon, route: routeHref("web.fighters") },
    { key: "coaches", icon: Users, route: routeHref("web.coaches") },
    { key: "gyms", icon: House, route: routeHref("web.gyms") },
    { key: "brands", icon: Star, route: routeHref("web.partners") },
  ] as const;
  const gets = ["board", "camps", "book", "community"] as const;
  const coachFrom = COACH_PLANS.find((plan) => plan.id === "starter")?.price;
  const gymFrom = GYM_PLANS.find((plan) => plan.id === "starter")?.price;

  return (
    <SitePage gap="4">
      <div className="grid items-center gap-10 desktop:grid-cols-[minmax(0,1fr)_560px] desktop:gap-16">
        <div className="flex min-w-0 flex-col gap-5.5">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <AccentHeading size="site-hero-xl" text={t("title")} accent={t("titleAccent")} />
          <Lead>{t("lead")}</Lead>
          <ActionRow
            actions={[
              { label: t("getStarted"), href: routeHref("web.signup"), primary: true },
              { label: t("signIn"), href: routeHref("web.login") },
            ]}
          />
        </div>
        <BoardIllustration size="lg" />
      </div>

      <section aria-labelledby="home-who" className="flex flex-col gap-3.5">
        <SectionLabel as="h2">
          <span id="home-who">{t("whoLabel")}</span>
        </SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 desktop:grid-cols-4">
          {who.map(({ key, icon, route }) => (
            <FeatureCard
              key={key}
              icon={icon}
              title={t(`who.${key}.title`)}
              body={t(`who.${key}.body`)}
              link={{ label: t(`who.${key}.link`), href: route }}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="home-get" className="flex flex-col gap-3.5">
        <SectionLabel as="h2">
          <span id="home-get">{t("getLabel")}</span>
        </SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 desktop:grid-cols-4">
          {gets.map((key) => (
            <SiteCard key={key} className="gap-2 px-5 py-4.5">
              <SectionLabel tone="highlight">{t(`get.${key}.label`)}</SectionLabel>
              <h3 className="type-site-card-title-sm">{t(`get.${key}.title`)}</h3>
              <p className="type-body-sm text-muted-foreground">{t(`get.${key}.body`)}</p>
            </SiteCard>
          ))}
        </div>
      </section>

      <div className="grid gap-4 desktop:grid-cols-2">
        <SiteCard className="gap-3 p-6.5">
          <SectionLabel tone="highlight">{t("market.label")}</SectionLabel>
          <h2 className="type-site-section-sm">{t("market.title")}</h2>
          <p className="type-body text-muted-foreground">{t("market.body")}</p>
          <ArrowLink href={routeHref("web.marketplace")}>{t("market.link")}</ArrowLink>
        </SiteCard>
        <SiteCard className="gap-3 p-6.5">
          <SectionLabel tone="highlight">{t("pricing.label")}</SectionLabel>
          <h2 className="type-site-section-sm">{t("pricing.title")}</h2>
          <dl className="flex flex-wrap items-center gap-x-9 gap-y-3">
            {[
              { key: "fighter", price: FIGHTER_FREE, unit: false },
              { key: "coach", price: coachFrom, unit: true },
              { key: "gym", price: gymFrom, unit: true },
            ].map(({ key, price, unit }) =>
              price === undefined ? null : (
                <div key={key} className="flex flex-col-reverse gap-0.5">
                  <dt className="type-caption text-muted-foreground">
                    {t(`pricing.${key}` as "pricing.fighter")}
                  </dt>
                  <dd>
                    <PriceTag
                      size="lg"
                      amount={formatPrice(format, price)}
                      unit={unit ? common("perMonth") : undefined}
                    />
                  </dd>
                </div>
              ),
            )}
          </dl>
          <ArrowLink href={routeHref("web.pricing")}>{t("pricing.link")}</ArrowLink>
        </SiteCard>
      </div>

      <CtaBand
        title={t("band.title")}
        body={t("band.body")}
        actions={[
          { label: t("band.primary"), href: routeHref("web.signup"), primary: true },
          { label: t("band.secondary"), href: routeHref("web.fighters") },
        ]}
      />
    </SitePage>
  );
}
