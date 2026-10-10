import { Calendar, Timer, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { withContinuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";

import { FIGHTER_PRO } from "../model/pricing";
import { formatPrice } from "../model/price-format";
import { BoardIllustration } from "./board-illustration";
import { RoleHero } from "./role-sections";
import {
  AccentHeading,
  ActionRow,
  ArrowLink,
  CheckList,
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
 * L2 · For fighters (`web.fighters`; Claude Design LandFighters, 1440 × 1820):
 * the hero with the Live Board example, three features, privacy by default
 * and the optional Pro card, and the find-a-gym band. Sign-up actions carry
 * the Fighter journey (SF-45 `intent`).
 */
export function FightersPage() {
  const t = useTranslations("site.fighters");
  const common = useTranslations("site.common");
  const format = useFormatter();
  const join = withContinuation("web.signup", { intent: "fighter" });
  const pricing = routeHref("web.pricing", {}, { role: "fighter" });

  return (
    <SitePage gap="4">
      <RoleHero
        exampleWidth={520}
        copy={
          <div className="flex flex-col gap-5.5">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <AccentHeading size="site-hero" text={t("title")} accent={t("titleAccent")} />
            <Lead>{t("lead")}</Lead>
            <ActionRow
              actions={[
                { label: t("primary"), href: join, primary: true },
                { label: t("secondary"), href: pricing },
              ]}
            />
          </div>
        }
        example={<BoardIllustration size="md" />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <FeatureCard
          as="h2"
          icon={Timer}
          title={t("features.rounds.title")}
          body={t("features.rounds.body")}
        />
        <FeatureCard
          as="h2"
          icon={Users}
          title={t("features.people.title")}
          body={t("features.people.body")}
        />
        <FeatureCard
          as="h2"
          icon={Calendar}
          title={t("features.book.title")}
          body={t("features.book.body")}
        />
      </div>
      <div className="grid gap-4 desktop:grid-cols-2">
        <SiteCard className="gap-3 p-6.5">
          <SectionLabel tone="highlight" as="h2">
            {t("privacy.label")}
          </SectionLabel>
          <CheckList
            items={["notes", "audience", "sponsors", "export"].map((key) =>
              t(`privacy.items.${key}` as "privacy.items.notes"),
            )}
          />
        </SiteCard>
        <SiteCard tone="accent" className="gap-3 p-6.5">
          <SectionLabel tone="highlight" as="h2">
            {t("pro.label")}
          </SectionLabel>
          <div className="flex flex-wrap items-baseline gap-3">
            <PriceTag amount={formatPrice(format, FIGHTER_PRO.monthly)} unit={common("perMonth")} />
            <span className="type-body-sm text-muted-foreground">
              {t("pro.annual", { price: formatPrice(format, FIGHTER_PRO.annualPerMonth) })}
            </span>
          </div>
          <CheckList
            items={["analytics", "ai", "video"].map((key) =>
              t(`pro.items.${key}` as "pro.items.ai"),
            )}
          />
          <ArrowLink href={pricing}>{t("pro.link")}</ArrowLink>
        </SiteCard>
      </div>
      <CtaBand
        title={t("band.title")}
        body={t("band.body")}
        actions={[
          { label: t("band.secondary"), href: routeHref("web.marketplace") },
          { label: t("band.primary"), href: join, primary: true },
        ]}
      />
    </SitePage>
  );
}
