import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for next/link and next/navigation. Paths are
 * written without a locale ("/app") and resolved against the active locale.
 * ESLint forbids the non-localized Next.js equivalents.
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
