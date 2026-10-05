import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/shared/i18n/navigation";
import { routing } from "@/shared/i18n/routing";
import { fontVariables } from "@/shared/styles/fonts";
import { Button } from "@/shared/ui/button";

import "./globals.css";

export const metadata: Metadata = {
  title: "404",
  robots: { index: false },
};

/**
 * Global 404 for URLs that match no route at all (e.g. an unsupported locale
 * segment rejected by app/[locale]/layout.tsx). Bypasses layouts, so it
 * renders a full document and imports global styles itself. Rendered in the
 * default locale; 404s inside a locale use app/[locale]/not-found.tsx.
 */
export default async function GlobalNotFound() {
  const locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "errors.notFound" });
  const actions = await getTranslations({ locale, namespace: "actions" });

  return (
    <html lang={locale} className={`dark ${fontVariables}`}>
      <body>
        <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-start justify-center gap-4 px-4">
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
          <Button asChild variant="outline">
            <Link href="/" locale={locale}>
              {actions("backToHome")}
            </Link>
          </Button>
        </main>
      </body>
    </html>
  );
}
