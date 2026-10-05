import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui/button";

export function SiteHeader() {
  const actions = useTranslations("actions");

  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md font-display text-base font-bold tracking-tight">
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeSwitcher />
          <Button asChild size="sm">
            <Link href="/app">{actions("openApp")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
