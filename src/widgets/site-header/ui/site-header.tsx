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
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

import { SiteMenuNav, SiteNav } from "./site-nav";

/**
 * Public website header (`web.site`): the header every public-website
 * artboard shares (Claude Design 1791448557-b0b9: L1–L5, PR1–PR6, SPX1–SPX2,
 * O02w). 76 px including the `border-subtle` hairline on the site Container; brand lockup,
 * the site links, then Sign in and the 42 px Get started, 36 px apart. The
 * language and theme switchers are approved production additions the
 * artboards do not draw (docs/design-system.md); they sit before Sign in.
 * Below 1280 px the links move into the menu sheet; below 640 px Sign in, Get
 * started and the language and theme controls do too, leaving the brand and
 * the menu.
 */
export function SiteHeader() {
  const t = useTranslations("shells.site");
  const navigation = useTranslations("navigation");
  const actions = useTranslations("actions");

  return (
    <header className="h-19 border-b border-border-subtle bg-background">
      <Container className="flex h-full items-center gap-9">
        <BrandLockup />
        <SiteNav />
        <div className="ml-auto hidden items-center gap-1 sm:flex">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
        <Link
          href={routeHref("web.login")}
          className="hidden rounded-xs type-site-nav font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline"
        >
          {t("signIn")}
        </Link>
        <Button asChild size="site" className="hidden sm:inline-flex">
          <Link href={routeHref("web.signup")}>{t("getStarted")}</Link>
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto sm:-ml-5 xl:hidden"
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
            <SiteMenuNav />
            <div className="flex items-center gap-1 px-4 sm:hidden">
              <LocaleSwitcher />
              <ThemeSwitcher />
            </div>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  );
}

/** Brand lockup of the public header: the 32 px olive tile and "SimpleFit Boxing", 10 px apart. */
function BrandLockup() {
  return (
    <Link
      href={routeHref("web.root")}
      className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
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
 * Public website footer (`web.site`): the footer every public-website
 * artboard shares. The sunken band (`surface-sunken`), 36 px above and below
 * the site Container, 80 px between the brand blurb (260 px) and the four
 * link columns. A column is its mono label and 13 px links, 8 px apart, on
 * the fonts' natural lines (`type-site-footer-*`). The Company entries have
 * no routes yet and stay plain text, as drawn.
 */
export function SiteFooter() {
  const t = useTranslations("shells.site.footer");

  return (
    <footer data-site-footer className="border-t border-border-subtle bg-surface-sunken">
      {/* Below 640 px the link columns pair up on a two-column grid under the brand. */}
      <Container className="grid grid-cols-2 gap-8 py-9 sm:flex sm:flex-wrap sm:gap-x-20 sm:gap-y-8">
        <div className="col-span-2 flex max-w-65 flex-col gap-2.5">
          <BrandTile size="sm" />
          <p className="type-site-footer-blurb text-faint-foreground">{t("blurb")}</p>
        </div>
        {footerColumns.map((column) => (
          <nav
            key={column.key}
            aria-label={t(`columns.${column.key}`)}
            className="flex flex-col gap-2"
          >
            <p className="type-site-footer-label text-faint-foreground">
              {t(`columns.${column.key}`)}
            </p>
            {column.links.map((link) => (
              <Link
                key={link.key}
                href={routeHref(link.route, {}, link.query)}
                className="w-fit rounded-xs type-site-footer-link text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(`links.${link.key}`)}
              </Link>
            ))}
            {column.text?.map((key) => (
              <span key={key} className="type-site-footer-link text-muted-foreground">
                {t(`links.${key}`)}
              </span>
            ))}
          </nav>
        ))}
      </Container>
    </footer>
  );
}

/**
 * The public website shell (`web.site`): header, the page's `main` landmark
 * and footer, the one implementation every public route renders (the site
 * layout, and O02w sign-up from the auth group).
 *
 * The composition keeps its designed height at any window size: nothing
 * between header and footer stretches, and the footer follows the content as
 * in the artboards. A window taller than the page shows the footer's sunken
 * band below it (the frame's background), never a stretched page.
 */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div data-site-frame className="flex min-h-dvh flex-col bg-surface-sunken">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-col bg-background outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
