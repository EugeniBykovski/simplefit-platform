import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { ControlPlaneOverview } from "@/widgets/admin-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.overview" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin", locale) };
}

/** `web.admin` (SF-121): AD1, the Control Plane overview, from the backend's counts. */
export default async function Page({ params }: PageProps<"/[locale]/admin">) {
  await resolveLocaleParam(params);
  return <ControlPlaneOverview />;
}
