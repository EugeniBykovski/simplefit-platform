import type { Metadata } from "next";
import { Suspense } from "react";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { PartnersApplyPage, siteMetadata } from "@/widgets/public-site";
import { SponsorApplicationFlow } from "@/widgets/sponsor-application";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/partners/apply">): Promise<Metadata> {
  const metadata = await siteMetadata(
    "apply",
    "web.partners.apply",
    await resolveLocaleParam(params),
  );
  // The application itself is private to the signed-in applicant: never indexed.
  return (await searchParams).step === undefined
    ? metadata
    : { ...metadata, robots: { index: false, follow: false } };
}

/**
 * `web.partners.apply`: SPX2 Become a sponsor (SF-43), server-rendered and
 * public; with `?step=` the sponsor application (SF-115: SPA0, SPA1 /
 * SP1–SP7 and review, SP9, SPX5), which runs in the browser on the
 * viewer's session and the SF-113 / SF-114 API.
 */
export default async function PartnersApplyRoute({
  params,
  searchParams,
}: PageProps<"/[locale]/partners/apply">) {
  await resolveLocaleParam(params);
  if ((await searchParams).step === undefined) return <PartnersApplyPage />;
  return (
    <Suspense>
      <SponsorApplicationFlow />
    </Suspense>
  );
}
