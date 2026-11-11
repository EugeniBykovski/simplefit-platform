import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { AccountDetail, parseReason } from "@/widgets/admin-users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/users/[userId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.users.detail" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.admin.users._user-id` (SF-122): AD8, one account. The id must be a UUID (never
 * sent to the API otherwise); `?reason=` carries the read reason from the search, and
 * anything the backend doesn't accept is asked for again.
 */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/users/[userId]">) {
  await resolveLocaleParam(params);
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const { reason } = await searchParams;
  return <AccountDetail accountId={userId} initialReason={parseReason(reason)} />;
}
