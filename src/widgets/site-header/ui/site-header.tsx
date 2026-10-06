import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

import { siteNavigation } from "../model/navigation";

/** Public website header (`web.site`): brand, site links, sign-in and sign-up. */
export function SiteHeader() {
  const t = useTranslations("shells.site");
  const navigation = useTranslations("navigation");
  const actions = useTranslations("actions");
  const links = siteNavigation.map((item) => ({
    key: item.key,
    href: routeHref(item.route, {}, item.query),
    label: t(`nav.${item.key}`),
  }));

  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={routeHref("web.root")} className="rounded-md type-title">
          {siteConfig.name}
        </Link>
        <nav aria-label={t("navigation")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="rounded-md px-2 py-1 type-body-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
            <Link href={routeHref("web.login")}>{t("signIn")}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href={routeHref("web.signup")}>{t("getStarted")}</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={navigation("openNavigation")}
              >
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72" closeLabel={actions("close")}>
              <SheetHeader>
                <SheetTitle>{siteConfig.name}</SheetTitle>
                <SheetDescription>{t("navigation")}</SheetDescription>
              </SheetHeader>
              <nav aria-label={t("navigation")} className="px-4">
                <ul className="flex flex-col gap-1">
                  {[
                    ...links,
                    { key: "signIn", href: routeHref("web.login"), label: t("signIn") },
                    { key: "getStarted", href: routeHref("web.signup"), label: t("getStarted") },
                  ].map((link) => (
                    <li key={link.key}>
                      <SheetClose asChild>
                        <Link
                          href={link.href}
                          className="flex rounded-md px-3 py-2 type-body-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** Public website footer (`web.site`). */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <p className="mx-auto w-full max-w-6xl px-4 py-6 type-body-sm text-muted-foreground sm:px-6">
        {siteConfig.name}
      </p>
    </footer>
  );
}
