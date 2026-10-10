import { Calendar, Download, Flag, Heart, House, Search, Shield, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { GloveIcon } from "@/shared/ui/glove-icon";

import {
  CompactFeature,
  Eyebrow,
  ExampleTag,
  Lead,
  SectionLabel,
  SiteCard,
  SitePage,
} from "./sections";

/**
 * SPX1 · Partners landing (`web.partners`; Claude Design PartnersLanding,
 * 1440 × 1140): the partnership pitch, the eight formats and three example
 * campaigns (the artboard's "Example campaigns · mock data").
 *
 * SF-43 decisions: the hero's adoption figures are left out (nothing backs
 * them), so the hero is one column; the partnership overview is not
 * published, so its download is shown disabled with a line saying so.
 */
export function PartnersPage() {
  const t = useTranslations("site.partners");
  const common = useTranslations("site.common");
  const formats = [
    { key: "challenges", icon: Flag },
    { key: "events", icon: Calendar },
    { key: "gyms", icon: House },
    { key: "coaches", icon: Users },
    { key: "equipment", icon: GloveIcon },
    { key: "marketplace", icon: Search },
    { key: "community", icon: Heart },
    { key: "privacy", icon: Shield },
  ] as const;
  const campaigns = ["haymaker", "korda", "ringfuel"] as const;

  return (
    <SitePage gap="4">
      <div className="flex max-w-200 flex-col gap-5">
        <Eyebrow tone="warning">{t("eyebrow")}</Eyebrow>
        <h1 className="type-site-section md:type-site-hero-md">{t("title")}</h1>
        <Lead size="md">{t("lead")}</Lead>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="xl">
              <Link href={routeHref("web.partners.apply")}>{t("become")}</Link>
            </Button>
            <Button size="xl" variant="quiet" disabled aria-describedby="partners-download-note">
              <Download aria-hidden />
              {t("download")}
            </Button>
          </div>
          <p id="partners-download-note" className="type-caption text-faint-foreground">
            {t("downloadNote")}
          </p>
        </div>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 desktop:grid-cols-4">
        {formats.map(({ key, icon }) => (
          <li key={key} className="grid">
            <CompactFeature
              as="h2"
              icon={icon}
              titleSize="body-lg"
              title={t(`formats.${key}.title`)}
              body={t(`formats.${key}.body`)}
            />
          </li>
        ))}
      </ul>
      <section aria-labelledby="partners-examples" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <SectionLabel as="h2">
            <span id="partners-examples">{t("campaignsLabel")}</span>
          </SectionLabel>
          <ExampleTag label={common("example")} />
        </div>
        <ul className="grid gap-3.5 md:grid-cols-3">
          {campaigns.map((key) => (
            <li key={key}>
              <SiteCard className="h-full gap-2 p-3.5">
                <span className="flex h-30 items-end rounded-lg bg-linear-150 from-warning-subtle to-background p-3">
                  <Badge variant="warning" className="border-warning-border">
                    {t("sponsored")}
                  </Badge>
                </span>
                <span
                  className={
                    key === "ringfuel" ? "type-label text-highlight" : "type-label text-warning"
                  }
                >
                  {t(`campaigns.${key}.brand`)}
                </span>
                <h3 className="type-site-card-title-sm">{t(`campaigns.${key}.title`)}</h3>
                <p className="type-caption text-muted-foreground">{t(`campaigns.${key}.meta`)}</p>
              </SiteCard>
            </li>
          ))}
        </ul>
      </section>
    </SitePage>
  );
}
