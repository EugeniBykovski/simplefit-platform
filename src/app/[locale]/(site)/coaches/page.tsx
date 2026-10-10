import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachesPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/coaches">): Promise<Metadata> {
  return siteMetadata("coaches", "web.coaches", await resolveLocaleParam(params));
}

/** `web.coaches` (SF-43). */
export default async function CoachesRoute({ params }: PageProps<"/[locale]/coaches">) {
  await resolveLocaleParam(params);
  return <CoachesPage />;
}
