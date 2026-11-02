import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { TimetableScreen } from "./timetable-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/timetable">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymConsole" });
  return { title: t("timetable.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.timetable` (WG5 with OG10, SF-98): the classes,
 * weekly series, class templates and venues of the gym in the path, inside
 * its console (the layout authorizes the gym).
 */
export default async function GymTimetablePage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/timetable">) {
  await resolveLocaleParam(params);
  return <TimetableScreen />;
}
