import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { GymDetail } from "@/widgets/admin-gyms";
import { parseReason } from "@/widgets/admin-users";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/tenants/[tenantId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.gyms.detail" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.admin.tenants._tenant-id` (SF-123): AD12, one gym. The id must be a UUID (never
 * sent to the API otherwise); `?reason=` carries the read reason, and anything the
 * backend doesn't accept is asked for again.
 */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/tenants/[tenantId]">) {
  await resolveLocaleParam(params);
  const { tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const { reason } = await searchParams;
  return <GymDetail gymId={tenantId} initialReason={parseReason(reason)} />;
}
