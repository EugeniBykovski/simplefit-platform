import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FightersPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/fighters">): Promise<Metadata> {
  return siteMetadata("fighters", "web.fighters", await resolveLocaleParam(params));
}

/** `web.fighters` (SF-43). */
export default async function FightersRoute({ params }: PageProps<"/[locale]/fighters">) {
  await resolveLocaleParam(params);
  return <FightersPage />;
}
