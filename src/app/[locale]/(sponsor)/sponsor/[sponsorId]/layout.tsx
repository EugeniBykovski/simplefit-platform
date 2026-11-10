import { notFound } from "next/navigation";

import { SponsorGate } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { SponsorWorkspace } from "@/widgets/sponsor-workspace";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

/**
 * `web.sponsor`: the partner portal of the organization in the path
 * (`/sponsor/:sponsorId`, SF-117, D-SA26). Its pages need the
 * SPONSOR_WORKSPACE capability (the gate sends anyone else where the entry
 * resolver says, an applicant to their application); which organization they
 * show is authorized by the backend for this id on every request. A segment
 * that is not a UUID is the not-found page: it never reaches an API path.
 */
export default async function SponsorWorkspaceLayout({
  children,
  params,
}: LayoutProps<"/[locale]/sponsor/[sponsorId]">) {
  await resolveLocaleParam(params);
  const { sponsorId } = await params;
  if (!isUuid(sponsorId)) notFound();
  return (
    <SponsorGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      <SponsorWorkspace sponsorId={sponsorId}>{children}</SponsorWorkspace>
    </SponsorGate>
  );
}
