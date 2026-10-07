import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { BrandTile, BrandWordmark } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
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

/**
 * Public website header (`web.site`; Claude Design LandHome, ER2): 76 px on
 * the site Container, brand lockup, site links, sign-in and sign-up. The
 * language and theme switchers are production additions the design does not
 * draw.
 */
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
      <Container className="flex h-19 items-center gap-4">
        <BrandLockup />
        <nav aria-label={t("navigation")} className="ml-8 hidden xl:block">
          <ul className="flex items-center gap-6">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="rounded-md type-body font-semibold text-muted-foreground transition-colors hover:text-foreground"
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
          <Link
            href={routeHref("web.login")}
            className="ml-4 hidden rounded-md type-body font-bold text-foreground sm:inline"
          >
            {t("signIn")}
          </Link>
          <Button asChild className="ml-8 hidden sm:inline-flex">
            <Link href={routeHref("web.signup")}>{t("getStarted")}</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="xl:hidden"
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
      </Container>
    </header>
  );
}

/** Brand lockup of the public header: the olive tile and "SimpleFit Boxing". */
function BrandLockup() {
  return (
    <Link href={routeHref("web.root")} className="flex items-center gap-2.5 rounded-md">
      <BrandTile />
      <BrandWordmark />
    </Link>
  );
}

/** Public website footer (`web.site`). */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container asChild>
        <p className="py-6 type-body-sm text-muted-foreground">{siteConfig.name}</p>
      </Container>
    </footer>
  );
}
