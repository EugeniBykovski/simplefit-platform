"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Link, usePathname } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { matchWebRoute, navKeyForRoute } from "@/shared/routes/routes";
import { SheetClose } from "@/shared/ui/sheet";

import type { SidebarShellId } from "../model/navigation";

export type ShellNavItem = { key: string; href: string; label: string; icon: ReactNode };
export type ShellNavSection = { key: string; label: string; items: ShellNavItem[] };

type ShellNavProps = {
  shell: SidebarShellId;
  label: string;
  sections: ShellNavSection[];
  inSheet?: boolean;
};

/**
 * Sidebar navigation with the active item resolved from the registry: the
 * current path's route, or its nearest registry ancestor, owns the active
 * item (a fighter detail keeps "Fighters" active), and the query tells
 * same-route items apart (sponsor Campaigns / Challenges / Events).
 */
export function ShellNav({ shell, label, sections, inSheet }: ShellNavProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const activeKey = navKeyForRoute(
    shell,
    matchWebRoute(pathname)?.id,
    new URLSearchParams(search.toString()),
  );

  return (
    <ShellNavLinks label={label} sections={sections} activeKey={activeKey} inSheet={inSheet} />
  );
}

/** The links without active state (also the server fallback of `ShellNav`). */
export function ShellNavLinks({
  label,
  sections,
  activeKey,
  inSheet = false,
}: Omit<ShellNavProps, "shell"> & { activeKey?: string | undefined }) {
  return (
    <nav aria-label={label}>
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-1">
          <h2 className="px-3 pt-4 pb-1 type-label text-faint-foreground">{section.label}</h2>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = item.key === activeKey;
              const link = (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 type-body-sm font-bold transition-colors",
                    "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
              return (
                <li key={item.key}>{inSheet ? <SheetClose asChild>{link}</SheetClose> : link}</li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
