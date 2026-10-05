import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@/shared/config/site";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { routing } from "@/shared/i18n/routing";
import { Toaster } from "@/shared/ui/sonner";

import { Providers } from "./providers";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "common" });

  return {
    title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
    description: t("tagline"),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <html lang={locale}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          {t("skipToContent")}
        </a>
        {/* Passes locale, messages, formats and time zone to Client Components. */}
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
