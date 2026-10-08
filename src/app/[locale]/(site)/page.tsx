import type { Metadata } from "next";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { PageContent } from "@/shared/ui/page";
import { HomeHero } from "@/widgets/home-hero";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  return { alternates: localeAlternates("/", locale) };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await resolveLocaleParam(params);
  // A short single-screen composition: centred in the space between header and footer.
  return (
    <PageContent align="center">
      <HomeHero />
    </PageContent>
  );
}
