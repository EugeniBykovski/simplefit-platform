import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { ReviewDetail } from "@/widgets/admin-sponsor-review";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/sponsors/[sponsorId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.sponsorReview.detail" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.admin.sponsors._sponsor-id` (SF-124): AS2 with AS4's organization state, keyed by
 * the sponsor application (every review endpoint is). The id must be a UUID; nothing
 * else is ever put in the URL.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/sponsors/[sponsorId]">) {
  await resolveLocaleParam(params);
  const { sponsorId } = await params;
  if (!isUuid(sponsorId)) notFound();
  return <ReviewDetail applicationId={sponsorId} />;
}
