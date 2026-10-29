import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { StaffScreen } from "./staff-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/staff">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymConsole" });
  return { title: t("staff.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.staff` (WG16, SF-94): the coaches and staff of the
 * gym in the path, inside its console (the layout authorizes the gym).
 */
export default async function GymStaffPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/staff">) {
  await resolveLocaleParam(params);
  return <StaffScreen />;
}
