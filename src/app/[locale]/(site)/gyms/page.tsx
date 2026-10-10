import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymsPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({ params }: PageProps<"/[locale]/gyms">): Promise<Metadata> {
  return siteMetadata("gyms", "web.gyms", await resolveLocaleParam(params));
}

/** `web.gyms` (SF-43). */
export default async function GymsRoute({ params }: PageProps<"/[locale]/gyms">) {
  await resolveLocaleParam(params);
  return <GymsPage />;
}
