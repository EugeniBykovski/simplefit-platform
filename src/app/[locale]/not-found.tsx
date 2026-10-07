import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteHeader } from "@/widgets/site-header";
import { NotFoundState } from "@/widgets/system-states";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("system.notFound");
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * ER2 · the web 404 (SF-34) for every unknown path in a locale (the
 * `[...rest]` catch-all) and every `notFound()`: the public SiteHeader and the
 * referee count on the launch glow. One catch-all for every area (D-404-SCOPE).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-system-glow [--glow-x:74%] [--glow-y:46%]">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <NotFoundState />
      </main>
    </div>
  );
}
