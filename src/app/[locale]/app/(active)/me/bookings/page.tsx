import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { MemberBookings } from "@/widgets/gym-member-booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/me/bookings">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymBooking" });
  return { title: t("member.bookings.metaTitle"), robots: { index: false } };
}

/** `web.app.me.bookings` (SF-100): the viewer's class bookings at every gym. */
export default async function MemberBookingsPage({
  params,
}: PageProps<"/[locale]/app/me/bookings">) {
  await resolveLocaleParam(params);
  return <MemberBookings />;
}
