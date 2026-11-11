import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { AccountSearch } from "@/widgets/admin-users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/users">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.users" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/users", locale) };
}

/** `web.admin.users` (SF-122): AD7, exact account search with a recorded reason. */
export default async function Page({ params }: PageProps<"/[locale]/admin/users">) {
  await resolveLocaleParam(params);
  return <AccountSearch />;
}
