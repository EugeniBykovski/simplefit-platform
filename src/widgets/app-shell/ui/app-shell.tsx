import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/features/switch-locale";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";

import { AppNav } from "./app-nav";

/**
 * Layout frame for the authenticated application: sidebar navigation from the
 * md breakpoint, a sheet menu below it. Server Component; only AppNav, the
 * locale switcher and the sheet primitives hydrate.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("navigation");
  const actions = useTranslations("actions");

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r bg-surface p-4 md:flex">
        <Brand />
        <Separator />
        <AppNav />
        <div className="mt-auto">
          <LocaleSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("openNavigation")}>
                <MenuIcon aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72" closeLabel={actions("close")}>
              <SheetHeader>
                <SheetTitle>{siteConfig.name}</SheetTitle>
                <SheetDescription>{t("applicationNavigation")}</SheetDescription>
              </SheetHeader>
              <div className="px-4">
                <AppNav inSheet />
              </div>
            </SheetContent>
          </Sheet>
          <Brand />
          <div className="ml-auto">
            <LocaleSwitcher />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="rounded-md text-base font-semibold tracking-tight">
      {siteConfig.name}
    </Link>
  );
}
