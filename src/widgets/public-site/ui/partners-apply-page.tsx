import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { textLinkClass } from "@/shared/ui/text-link";

import { CheckList, Eyebrow, PageTitle, SectionLabel, SiteCard, SitePage } from "./sections";

/**
 * SPX2 · Become a sponsor (`web.partners.apply`; Claude Design BecomeSponsor,
 * 1440 × 900): how a sponsor application works, what sponsors get and what
 * SimpleFit never does.
 *
 * The application itself (SP1–SP9) needs a sponsor-application domain that
 * does not exist yet, so "Start application" is disabled with a line saying
 * applications are not open (SF-43 decision): nothing is collected, stored
 * or shown as submitted. No sponsor workspace or capability is involved;
 * arriving here with `intent=sponsor` changes nothing.
 */
export function PartnersApplyPage() {
  const t = useTranslations("site.apply");
  const steps = ["brand", "review", "campaign"] as const;
  const list = (prefix: "gets.items" | "never.items", count: number) =>
    Array.from({ length: count }, (_, index) => t(`${prefix}.${index + 1}` as "gets.items.1"));

  return (
    <SitePage gap="10">
      <div className="grid gap-10 desktop:grid-cols-[minmax(0,1fr)_460px] desktop:gap-16">
        <div className="flex min-w-0 flex-col gap-5.5">
          <Eyebrow tone="warning">{t("eyebrow")}</Eyebrow>
          <PageTitle size="site-title">{t("title")}</PageTitle>
          <ol className="flex flex-col gap-5.5">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3.5">
                <span
                  aria-hidden
                  className="flex size-10 flex-none items-center justify-center rounded-md-lg bg-primary type-title font-display font-bold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-body-lg font-extrabold">{t(`steps.${step}.title`)}</span>
                  <span className="type-body-sm text-muted-foreground">
                    {t(`steps.${step}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-5">
              <Button size="xl" disabled aria-describedby="apply-unavailable">
                {t("start")}
              </Button>
              <Link href={routeHref("web.sponsor.login")} className={textLinkClass}>
                {t("signIn")}
              </Link>
            </div>
            <p id="apply-unavailable" className="type-caption text-faint-foreground">
              {t("unavailable")}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <SiteCard className="gap-3 p-5">
            <SectionLabel as="h2">{t("gets.label")}</SectionLabel>
            <CheckList items={list("gets.items", 4)} />
          </SiteCard>
          <SiteCard className="gap-3 p-5">
            <SectionLabel as="h2" tone="destructive">
              {t("never.label")}
            </SectionLabel>
            <CheckList items={list("never.items", 3)} mark="cross" />
          </SiteCard>
        </div>
      </div>
    </SitePage>
  );
}
