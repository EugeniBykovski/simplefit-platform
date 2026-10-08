import { connection } from "next/server";
import type { ReactNode } from "react";

/**
 * `/pricing` (and `/pricing/compare`): PR1–PR4 are `?role=` states of one
 * route (PR4 Enterprise is `?role=enterprise`). The segment renders per
 * request, so the first HTML already carries the requested state, including
 * the site header's current item (Pricing or Enterprise), with no client-side
 * switch after hydration.
 */
export default async function PricingLayout({ children }: { children: ReactNode }) {
  await connection();
  return children;
}
