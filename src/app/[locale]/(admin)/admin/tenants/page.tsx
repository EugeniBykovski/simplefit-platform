import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymList } from "@/widgets/admin-gyms";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/tenants">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.gyms" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/tenants", locale) };
}

/** `web.admin.tenants` (SF-123): AD2, the gym list (`gyms.read`), filtered on the server. */
export default async function Page({ params }: PageProps<"/[locale]/admin/tenants">) {
  await resolveLocaleParam(params);
  return <GymList />;
}
