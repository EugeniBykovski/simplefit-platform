import type { Metadata } from "next";

import { siteConfig } from "@/shared/config/site";
import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { HomeHero } from "@/widgets/home-hero";
import { SiteHeader } from "@/widgets/site-header";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  return { alternates: localeAlternates("/", locale) };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await resolveLocaleParam(params);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <HomeHero />
      <footer className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {siteConfig.name}
        </p>
      </footer>
    </div>
  );
}
