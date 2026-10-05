"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { SheetClose } from "@/shared/ui/sheet";

import { appNavigation } from "../model/navigation";

/**
 * Primary application navigation. A Client Component only because the active
 * item depends on the current pathname.
 */
export function AppNav({ inSheet = false }: { inSheet?: boolean }) {
  const t = useTranslations("navigation");
  const pathname = usePathname();

  return (
    <nav aria-label={t("primary")}>
      <ul className="flex flex-col gap-1">
        {appNavigation.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href;
          const link = (
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 type-body-sm font-bold transition-colors",
                "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {t(labelKey)}
            </Link>
          );

          return <li key={href}>{inSheet ? <SheetClose asChild>{link}</SheetClose> : link}</li>;
        })}
      </ul>
    </nav>
  );
}
