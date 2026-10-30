import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { MembersScreen } from "./members-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/members">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymConsole" });
  return { title: t("members.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.members` (WG3 with OG12, SF-96): the members of the
 * gym in the path, its join requests, member invitations, join code and the
 * member-list preview, inside its console (the layout authorizes the gym).
 */
export default async function GymMembersPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/members">) {
  await resolveLocaleParam(params);
  return <MembersScreen />;
}
