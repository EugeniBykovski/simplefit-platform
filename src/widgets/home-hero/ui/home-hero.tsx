import { useTranslations } from "next-intl";

import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

const audiences = ["fighters", "coaches", "gyms", "sponsors"] as const;

export function HomeHero() {
  const t = useTranslations("home");
  const common = useTranslations("common");
  const actions = useTranslations("actions");

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-8 px-4 py-16 outline-none sm:px-6 sm:py-24"
    >
      <div className="flex max-w-3xl flex-col gap-6">
        <p className="type-label text-primary">{t("badge")}</p>
        <h1 className="type-h1 text-balance sm:type-display">{siteConfig.name}</h1>
        <p className="max-w-2xl type-body text-pretty text-muted-foreground sm:text-lg">
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
    </main>
  );
}
