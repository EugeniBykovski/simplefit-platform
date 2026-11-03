import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { MemberGyms } from "@/widgets/gym-member-booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/me/gyms">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymBooking" });
  return { title: t("member.gyms.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.me.gyms` (SF-100): the viewer's gyms as a member, account-level
 * (D-G07): no Fighter or Coach profile and no gym workspace is needed.
 */
export default async function MemberGymsPage({ params }: PageProps<"/[locale]/app/me/gyms">) {
  await resolveLocaleParam(params);
  return <MemberGyms />;
}
