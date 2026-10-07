import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { routing } from "@/shared/i18n/routing";
import { fontVariables } from "@/shared/styles/fonts";
import { SiteHeader } from "@/widgets/site-header";
import { NotFoundState } from "@/widgets/system-states";

import { Providers } from "./[locale]/providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "system.notFound" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * Global 404 for URLs that match no route at all (e.g. an unsupported locale
 * segment rejected by app/[locale]/layout.tsx). Bypasses layouts, so it
 * renders a full document with the app's providers itself, in the default
 * locale. The same ER2 composition as app/[locale]/not-found.tsx (SF-34).
 */
export default function GlobalNotFound() {
  const locale = routing.defaultLocale;
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`dark ${fontVariables}`} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale}>
          <Providers>
            <div className="flex min-h-dvh flex-col bg-system-glow [--glow-x:74%] [--glow-y:46%]">
              <SiteHeader />
              <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
                <NotFoundState />
              </main>
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
