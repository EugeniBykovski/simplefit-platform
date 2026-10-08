import { useTranslations } from "next-intl";

import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { containerVariants } from "@/shared/ui/container";

const audiences = ["fighters", "coaches", "gyms", "sponsors"] as const;

export function HomeHero() {
  const t = useTranslations("home");
  const common = useTranslations("common");
  const actions = useTranslations("actions");

  return (
    // The SF-32 placeholder body (SF-43 replaces it): the page's content inside the
    // site frame's `main`, top-anchored on the artboard's 56 × 64 px body padding.
    <div className={cn(containerVariants(), "flex flex-col gap-8 py-14")}>
      <div className="flex max-w-3xl flex-col gap-6">
        <p className="type-label text-highlight">{t("badge")}</p>
        <h1 className="type-h1 text-balance sm:type-display">{siteConfig.name}</h1>
        <p className="max-w-2xl type-body text-pretty text-muted-foreground sm:type-body-lg">
          {common("tagline")}
        </p>
        <ul aria-label={t("audiencesLabel")} className="flex flex-wrap gap-2">
          {audiences.map((audience) => (
            <li key={audience}>
              <Badge variant="accent">{t(`audiences.${audience}`)}</Badge>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/app">{actions("openTheApp")}</Link>
        </Button>
      </div>
    </div>
  );
}
