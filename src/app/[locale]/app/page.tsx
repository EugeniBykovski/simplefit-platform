import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiHealthCard } from "@/features/check-api-health";
import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { AppFrame } from "@/widgets/app-frame";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("metaTitle"), alternates: localeAlternates("/app", locale) };
}

export default async function AppHomePage({ params }: PageProps<"/[locale]/app">) {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "app" });

  // web.app ENTRY (route-architecture §9): resolving and redirecting to the
  // user's default destination belongs to SF-24/SF-25; until then the entry
  // keeps the SF-11 foundation page.
  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="type-h2 sm:type-h1">{t("title")}</h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">{t("description")}</p>
        </div>
        <ApiHealthCard />
      </div>
    </AppFrame>
  );
}
