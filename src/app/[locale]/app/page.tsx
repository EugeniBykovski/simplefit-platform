import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiHealthCard } from "@/features/check-api-health";
import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("metaTitle"), alternates: localeAlternates("/app", locale) };
}

export default async function AppHomePage({ params }: PageProps<"/[locale]/app">) {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "app" });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="max-w-2xl text-pretty text-muted-foreground">{t("description")}</p>
      </div>
      <ApiHealthCard />
    </div>
  );
}
