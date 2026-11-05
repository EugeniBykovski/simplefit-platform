import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { MemberInvitations } from "@/widgets/gym-member-booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/me/gyms/invitations">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymMembership" });
  return { title: t("invitations.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.me.gyms.invitations` (SF-134): the viewer's pending member
 * invitations, token-free. Staff invitations are another domain and never appear.
 */
export default async function MemberInvitationsPage({
  params,
}: PageProps<"/[locale]/app/me/gyms/invitations">) {
  await resolveLocaleParam(params);
  return <MemberInvitations />;
}
