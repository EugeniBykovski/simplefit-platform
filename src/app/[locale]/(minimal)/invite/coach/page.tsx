import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { CoachInvitation } from "@/widgets/coach-invitation";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/invite/coach">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "coachInvitation" });
  // A one-time link target: never indexed, and no referrer leaves the page.
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/**
 * `web.invite.coach` (WFI1, SF-60): the E08 link, `/invite/coach#token=…`.
 * The token is in the fragment, which never reaches the server: everything
 * about it happens in the browser.
 */
export default async function CoachInvitationPage({ params }: PageProps<"/[locale]/invite/coach">) {
  await resolveLocaleParam(params);
  return <CoachInvitation />;
}
