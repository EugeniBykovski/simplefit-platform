import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref, type WebRouteId } from "@/shared/routes/routes";
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
    // 76 px including the hairline, as LandHome / WebSignUp draw it.
    <header className="h-19 border-b">
      <Container className="flex h-full items-center gap-4">
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

type FooterLinkKey =
  | "fighters"
  | "coaches"
  | "gyms"
  | "signIn"
  | "pricing"
  | "marketplace"
  | "enterprise"
  | "whiteLabel"
  | "becomeSponsor"
  | "partnership"
  | "sponsorSignIn";
type FooterTextKey = "about" | "careers" | "privacy" | "terms";
type FooterColumn = {
  key: "product" | "business" | "partners" | "company";
  links: readonly { key: FooterLinkKey; route: WebRouteId; query?: Record<string, string> }[];
  text?: readonly FooterTextKey[];
};

/*
 * Footer columns of the landing artboards (WebSignUp O02w, LandHome). Every
 * link is a registry route; the company entries have no routes yet and are
 * plain text, as in the design.
 */
const footerColumns: readonly FooterColumn[] = [
  {
    key: "product",
    links: [
      { key: "fighters", route: "web.fighters" },
      { key: "coaches", route: "web.coaches" },
      { key: "gyms", route: "web.gyms" },
      { key: "signIn", route: "web.login" },
    ],
  },
  {
    key: "business",
    links: [
      { key: "pricing", route: "web.pricing" },
      { key: "marketplace", route: "web.marketplace" },
      { key: "enterprise", route: "web.pricing", query: { role: "enterprise" } },
      { key: "whiteLabel", route: "web.white-label" },
    ],
  },
  {
    key: "partners",
    links: [
      { key: "becomeSponsor", route: "web.partners.apply" },
      { key: "partnership", route: "web.partners" },
      { key: "sponsorSignIn", route: "web.sponsor.login" },
    ],
  },
  { key: "company", links: [], text: ["about", "careers", "privacy", "terms"] },
];

/**
 * Public website footer (`web.site`; Claude Design WebSignUp / LandHome): the
 * brand blurb and four link columns on the site Container, 36 px vertical
 * padding (32 + 4 px steps), 80 px between groups. The artboard sets the 13 px
 * links on 18 px lines, 8 px apart (a 26 px row); with the 20 px `body-sm`
 * line the gap is 6 px, so every row keeps its designed position.
 */
export function SiteFooter() {
  const t = useTranslations("shells.site.footer");

  return (
    <footer data-site-footer className="border-t bg-background">
      <Container className="py-8">
        <div className="flex flex-wrap gap-x-20 gap-y-8 pt-1">
          <div className="flex max-w-65 flex-col gap-2.5">
            <BrandTile size="sm" />
            <p className="type-caption text-faint-foreground">{t("blurb")}</p>
          </div>
          {footerColumns.map((column) => (
            <nav
              key={column.key}
              aria-label={t(`columns.${column.key}`)}
              className="flex flex-col gap-1.5"
            >
              <p className="mb-0.5 type-label text-faint-foreground">
                {t(`columns.${column.key}`)}
              </p>
              {column.links.map((link) => (
                <Link
                  key={link.key}
                  href={routeHref(link.route, {}, link.query)}
                  className="w-fit rounded-xs type-body-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(`links.${link.key}`)}
                </Link>
              ))}
              {column.text?.map((key) => (
                <span key={key} className="type-body-sm text-muted-foreground">
                  {t(`links.${key}`)}
                </span>
              ))}
            </nav>
          ))}
        </div>
      </Container>
    </footer>
  );
}

/**
 * The `web.site` chrome: header, the page's `main` landmark and footer. The
 * site layout and pages that render the site chrome themselves (O02w sign-up
 * in the auth group) share it, so their geometry is one implementation.
 *
 * - `fill` (the site layout, unchanged from SF-11): `main` grows so the footer
 *   sits at the bottom of a tall window; the foundation pages centre in it.
 * - `fill={false}` (O02w): a designed fixed composition. Header, content and
 *   footer keep their artboard positions at any window height; extra height
 *   stays below the footer instead of being spread through the page.
 */
export function SiteFrame({ children, fill = true }: { children: ReactNode; fill?: boolean }) {
  return (
    <div className={fill ? "flex min-h-dvh flex-col" : "flex flex-col"}>
      <SiteHeader />
      <main
        id="main"
        tabIndex={-1}
        className={fill ? "flex flex-1 flex-col outline-none" : "flex flex-col outline-none"}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
