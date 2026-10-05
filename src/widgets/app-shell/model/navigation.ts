import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";

import type { Messages } from "@/shared/i18n/messages";

export type NavigationItem = {
  /** Locale-independent path; the active locale is added by the i18n Link. */
  href: string;
  /** Key in the `navigation` message namespace. */
  labelKey: keyof Messages["navigation"];
  icon: LucideIcon;
};

export const appNavigation: readonly NavigationItem[] = [
  { href: "/app", labelKey: "overview", icon: LayoutDashboardIcon },
];
