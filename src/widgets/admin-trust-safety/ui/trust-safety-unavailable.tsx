import { CircleSlashIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { PageBody, PageHeader } from "@/shared/ui/page";

export type TrustSafetyArea = "moderation" | "enforcement";

/**
 * AD4 Moderation and AD11 Enforcement (SF-125; Claude Design `AdminModeration`,
 * `AdminEnforcement`, both FUTURE): a truthful "not available" screen. SimpleFit has
 * no reports, user-generated or public content, enforcement cases or appeals, so there
 * is nothing to queue, review or hide (simplefit-api D-SA32). It makes no API call and
 * shows no data: unlike an empty queue, a missing permission or an error, the feature
 * doesn't exist. It points to the real, separate controls that do exist.
 */
export function TrustSafetyUnavailable({ area }: { area: TrustSafetyArea }) {
  const t = useTranslations("controlPlane.trustSafety");

  return (
    <div className="flex min-h-full flex-col" data-trust-safety={area} data-state="unavailable">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t(`${area}.title`)}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <section
          aria-labelledby="trust-safety-status"
          className="flex max-w-180 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
        >
          <Badge variant="outline" className="gap-1.5 uppercase">
            <CircleSlashIcon aria-hidden className="size-3.5" />
            {t("pill")}
          </Badge>
          <h2 id="trust-safety-status" className="type-h3 font-display">
            {t(`${area}.heading`)}
          </h2>
          <p className="type-body-sm text-muted-foreground">{t(`${area}.body`)}</p>
          <p className="type-caption text-muted-foreground">{t("notState")}</p>
        </section>

        <div className="grid max-w-180 gap-4 md:grid-cols-2">
          <section
            aria-labelledby="trust-safety-exists"
            className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
          >
            <h2 id="trust-safety-exists" className="type-title font-display">
              {t("exists.title")}
            </h2>
            <ul className="flex flex-col gap-2 type-body-sm">
              <li>
                <Link
                  href={routeHref("web.admin.users")}
                  className="font-bold text-highlight underline-offset-4 hover:underline"
                >
                  {t("exists.accounts.link")}
                </Link>
                <span className="block text-muted-foreground">{t("exists.accounts.body")}</span>
              </li>
              <li>
                <Link
                  href={routeHref("web.admin.sponsors")}
                  className="font-bold text-highlight underline-offset-4 hover:underline"
                >
                  {t("exists.sponsors.link")}
                </Link>
                <span className="block text-muted-foreground">{t("exists.sponsors.body")}</span>
              </li>
              <li>
                <span className="font-bold">{t("exists.gyms.title")}</span>
                <span className="block text-muted-foreground">{t("exists.gyms.body")}</span>
              </li>
            </ul>
          </section>

          <section
            aria-labelledby="trust-safety-needs"
            className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
          >
            <h2 id="trust-safety-needs" className="type-title font-display">
              {t("needs.title")}
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 ps-5 type-body-sm">
              {(["intake", "reasons", "hiding", "notice", "permissions"] as const).map((item) => (
                <li key={item}>{t(`needs.${item}`)}</li>
              ))}
            </ul>
          </section>
        </div>
      </PageBody>
    </div>
  );
}
