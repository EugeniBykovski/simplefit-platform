"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { matchWebRoute, routeHref } from "@/shared/routes/routes";
import { SheetClose } from "@/shared/ui/sheet";

import { activeSiteNavKey, siteNavigation, type SiteNavKey } from "../model/navigation";

function useActiveKey(search?: URLSearchParams): SiteNavKey | undefined {
  const pathname = usePathname();
  return activeSiteNavKey(matchWebRoute(pathname)?.id, search);
}

/**
 * The header's site links (every public-website artboard): 26 px apart, 12 px
 * after the 36 px header gap. The current page's item is bone, extra bold and
 * underlined 4 px below its label in olive (`aria-current="page"`); the items
 * stretch to its height, as the artboards draw it.
 */
function DesktopLinks({ active }: { active: SiteNavKey | undefined }) {
  const t = useTranslations("shells.site");
  return (
    <ul className="flex gap-6.5">
      {siteNavigation.map((item) => {
        const current = item.key === active;
        return (
          <li key={item.key} className="flex">
            <Link
              href={routeHref(item.route, {}, item.query)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "block type-site-nav transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                current
                  ? "border-b-2 border-highlight pb-1 font-extrabold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`nav.${item.key}`)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopLinksWithQuery() {
  const search = useSearchParams();
  return <DesktopLinks active={useActiveKey(new URLSearchParams(search?.toString() ?? ""))} />;
}

/** Without the query (prerender): the route alone decides; `?role=enterprise` follows on load. */
function DesktopLinksFromPath() {
  return <DesktopLinks active={useActiveKey()} />;
}

/** The desktop site navigation: every desktop and laptop width (`desktop`, 1180 px, and up). */
export function SiteNav() {
  const t = useTranslations("shells.site");
  return (
    <nav aria-label={t("navigation")} className="ml-3 hidden self-center desktop:block">
      <Suspense fallback={<DesktopLinksFromPath />}>
        <DesktopLinksWithQuery />
      </Suspense>
    </nav>
  );
}

function MenuLinks({ active }: { active: SiteNavKey | undefined }) {
  const t = useTranslations("shells.site");
  const links = [
    ...siteNavigation.map((item) => ({
      key: item.key,
      href: routeHref(item.route, {}, item.query),
      label: t(`nav.${item.key}`),
      current: item.key === active,
    })),
    { key: "signIn", href: routeHref("web.login"), label: t("signIn"), current: false },
    { key: "getStarted", href: routeHref("web.signup"), label: t("getStarted"), current: false },
  ];
  return (
    <ul className="flex flex-col gap-1">
      {links.map((link) => (
        <li key={link.key}>
          <SheetClose asChild>
            <Link
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              className={cn(
                "flex rounded-md px-3 py-2 type-body-sm font-bold outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                link.current ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          </SheetClose>
        </li>
      ))}
    </ul>
  );
}

function MenuLinksWithQuery() {
  const search = useSearchParams();
  return <MenuLinks active={useActiveKey(new URLSearchParams(search?.toString() ?? ""))} />;
}

function MenuLinksFromPath() {
  return <MenuLinks active={useActiveKey()} />;
}

/** The site navigation in the menu sheet (narrow viewports only, below `desktop`), with sign-in and sign-up. */
export function SiteMenuNav() {
  const t = useTranslations("shells.site");
  return (
    <nav aria-label={t("navigation")} className="px-4">
      <Suspense fallback={<MenuLinksFromPath />}>
        <MenuLinksWithQuery />
      </Suspense>
    </nav>
  );
}
