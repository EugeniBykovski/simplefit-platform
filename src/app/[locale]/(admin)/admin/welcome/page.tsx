import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { ControlPlaneWelcome } from "@/widgets/admin-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/welcome">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.welcome" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/welcome", locale) };
}

/** `web.admin.welcome` (SF-120): ARW1, the Control Plane first visit and tour. */
export default async function Page({ params }: PageProps<"/[locale]/admin/welcome">) {
  await resolveLocaleParam(params);
  return <ControlPlaneWelcome />;
}
