import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, type ReactNode } from "react";

import { ContextSwitcher } from "@/features/session-gate";
import { SessionControl } from "@/features/sign-out";
import { LocaleSwitcher } from "@/features/switch-locale";
import { ThemeSwitcher } from "@/features/switch-theme";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { routeHref, webShell } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

import { shellNavigation, type SidebarShellId } from "../model/navigation";
import { ShellNav, ShellNavLinks, type ShellNavSection } from "./shell-nav";

/**
 * The sidebar shells of SF-31 (route-architecture §8): fighter, coach and
 * gym workspaces under /app, the partner portal and the admin control plane.
 * Navigation items and their targets come from the registry; sections,
 * order and icons follow the shell's nav artboard. Sidebar from the md
 * breakpoint, a sheet menu below it. Geometry (SF-34, FighterWebNav): a
 * 240 px `surface` sidebar with 22/14 px padding; `<main>` has no padding of
 * its own, pages compose PageHeader and PageBody.
 *
 * The Fighter and Coach shells carry the profile context switcher (SF-54);
 * the gym console passes its own identity block (the gym switcher, SF-88)
 * and the route parameters its links need (`gymId`). Item badges, the
 * "next session" card and the Sponsor workspace identity stay absent until
 * their data exists.
 */
export function WorkspaceShell({
  shell,
  params = {},
  identity,
  children,
}: {
  shell: SidebarShellId;
  /** The parameters of the shell's id-based routes (the gym console's `gymId`). */
  params?: Record<string, string>;
  /** The identity block above the navigation, when the shell supplies its own. */
  identity?: ReactNode;
  children: ReactNode;
}) {
  const config = shellNavigation[shell];
  const t = useTranslations("shells");
  const navigation = useTranslations("navigation");
  const actions = useTranslations("actions");
  const message = (key: string) => t(key as Parameters<typeof t>[0]);

  const items = webShell(shell).navItems;
  const sections: ShellNavSection[] = config.sections.map((section) => ({
    key: section.key,
    label: message(`${config.messages}.sections.${section.key}`),
    items: section.items.map((key) => {
      const item = items.find((candidate) => candidate.key === key);
      if (!item?.route) throw new Error(`${shell} has no routed nav item ${key}`);
      const Icon = config.icons[key];
      if (!Icon) throw new Error(`${shell} has no icon for ${key}`);
      return {
        key,
        href: routeHref(item.route, params, "query" in item ? item.query : {}),
        label: message(`${config.messages}.nav.${key}`),
        icon: <Icon aria-hidden className="size-4.5" />,
        soon: config.soon?.includes(key) ? navigation("soon") : undefined,
      };
    }),
  }));

  const name = message(`${config.messages}.name`);
  const block =
    identity ?? (config.context ? <ContextSwitcher context={config.context} /> : undefined);
  const nav = (inSheet: boolean) => (
    <Suspense fallback={<ShellNavLinks label={name} sections={sections} inSheet={inSheet} />}>
      <ShellNav shell={shell} label={name} sections={sections} inSheet={inSheet} />
    </Suspense>
  );

  return (
    <div data-shell={shell} className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col gap-0.5 bg-surface px-3.5 py-5.5 md:sticky md:top-0 md:flex md:h-dvh">
        <Brand
          name={name}
          internal={shell === "web.admin" ? t("admin.internal") : undefined}
          identity={block}
        />
        <div className="flex-1 overflow-y-auto">{nav(false)}</div>
        <div className="flex flex-col items-start gap-2 pt-2">
          <SessionControl />
          <div className="flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={navigation("openNavigation")}>
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 overflow-y-auto"
              closeLabel={actions("close")}
            >
              <SheetHeader>
                <SheetTitle>{siteConfig.name}</SheetTitle>
                <SheetDescription>{name}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-4">
                {block ?? null}
                {nav(true)}
                <div>
                  <SessionControl />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Link href={routeHref("web.root")} className="rounded-md type-title">
            {siteConfig.name}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Brand row (FighterWebNav, CoachWebNav): the 30 px tile and the wordmark,
 * then the identity block: the profile context switcher in the Fighter and
 * Coach shells (SF-54), the shell name in the others (their workspace
 * identity waits for workspace data).
 */
function Brand({
  name,
  internal,
  identity,
}: {
  name: string;
  internal?: string | undefined;
  identity?: ReactNode;
}) {
  const brand = (
    <Link href={routeHref("web.root")} className="flex w-fit items-center gap-2.5 rounded-md">
      <BrandTile size="sm" />
      <span className="type-brand">{siteConfig.name.split(" ")[0]}</span>
    </Link>
  );
  if (identity !== undefined) {
    return (
      <div className="flex flex-col gap-4 pb-2">
        <div className="px-2">{brand}</div>
        {/* The identity block: the Fighter web tour's step 9 anchors here (SF-40). */}
        <div data-tour-target="workspace">{identity}</div>
      </div>
    );
  }
  return (
    <div data-tour-target="workspace" className="flex flex-col items-start gap-1 px-2 pb-4">
      {brand}
      <span className="type-label text-faint-foreground">{name}</span>
      {internal ? <Badge variant="warning">{internal}</Badge> : null}
    </div>
  );
}
