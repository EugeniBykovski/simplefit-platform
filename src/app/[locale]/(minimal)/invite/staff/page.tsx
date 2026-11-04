import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { StaffInvitation } from "@/widgets/staff-invitation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/invite/staff">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "staffInvitation" });
  // A one-time link target: never indexed, and no referrer leaves the page.
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * `web.invite.staff` (SF-133): the E06 link, `/invite/staff#token=…`. The
 * token is in the fragment, which never reaches the server: everything about
 * it happens in the browser.
 */
export default async function StaffInvitationPage({ params }: PageProps<"/[locale]/invite/staff">) {
  await resolveLocaleParam(params);
  return <StaffInvitation />;
}
