import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { ReviewQueue } from "@/widgets/admin-sponsor-review";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/sponsors">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.sponsorReview" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/sponsors", locale) };
}

/** `web.admin.sponsors` (SF-124): AS1, the sponsor application queue (`sponsors.applications.read`). */
export default async function Page({ params }: PageProps<"/[locale]/admin/sponsors">) {
  await resolveLocaleParam(params);
  return <ReviewQueue />;
}
