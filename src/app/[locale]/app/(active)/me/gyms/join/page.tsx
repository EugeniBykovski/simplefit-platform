import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { MemberJoin } from "@/widgets/gym-member-booking";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/me/gyms/join">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymMembership" });
  return { title: t("join.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.me.gyms.join` (SF-134): joining a gym with its code, account-level
 * (D-G07). The code is typed here and sent only in request bodies: there is
 * deliberately no route that carries it.
 */
export default async function MemberJoinPage({ params }: PageProps<"/[locale]/app/me/gyms/join">) {
  await resolveLocaleParam(params);
  return <MemberJoin />;
}
