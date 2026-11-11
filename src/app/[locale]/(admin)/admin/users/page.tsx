import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { parseTab, UserExplorer } from "@/widgets/admin-users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.users" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/users", locale) };
}

/**
 * `web.admin.users` (SF-122, SF-123): AD7, the user explorer. Exact account search
 * (`users.read`), and exact fighter and coach lookup (`fighters.read`, `coaches.read`),
 * each with a recorded reason; `?tab=` picks the tab.
 */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/admin/users">) {
  await resolveLocaleParam(params);
  const { tab } = await searchParams;
  return <UserExplorer initialTab={parseTab(tab)} />;
}
