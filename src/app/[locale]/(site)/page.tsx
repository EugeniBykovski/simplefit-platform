import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { HomePage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  return siteMetadata("home", "web.root", await resolveLocaleParam(params));
}

/** `web.root` (SF-43). */
export default async function HomeRoute({ params }: PageProps<"/[locale]">) {
  await resolveLocaleParam(params);
  return <HomePage />;
}
