import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { MemberClasses } from "@/widgets/gym-member-booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/me/gyms/[gymId]/classes">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymBooking" });
  return { title: t("member.classes.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.me.gyms._gym-id.classes` (SF-100): one gym's classes for its
 * member, with booking and cancelling (SF-99). The gym id is only a lookup
 * into the viewer's own memberships; the backend authorizes every request.
 */
export default async function MemberClassesPage({
  params,
}: PageProps<"/[locale]/app/me/gyms/[gymId]/classes">) {
  await resolveLocaleParam(params);
  const { gymId } = await params;
  // A segment that is not a UUID never reaches an API path (SF-104).
  if (!isUuid(gymId)) notFound();
  return <MemberClasses key={gymId} gymId={gymId} />;
}
