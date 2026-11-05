import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymInvitation } from "@/widgets/gym-invitation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/invite/gym">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymInvitation" });
  // A one-time link target: never indexed, and no referrer leaves the page.
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * `web.invite.gym` (SF-134): the E07 link, `/invite/gym#token=…`. The token is
 * in the fragment, which never reaches the server: everything about it happens
 * in the browser.
 */
export default async function GymInvitationPage({ params }: PageProps<"/[locale]/invite/gym">) {
  await resolveLocaleParam(params);
  return <GymInvitation />;
}
