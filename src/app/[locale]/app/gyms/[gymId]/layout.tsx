import { notFound } from "next/navigation";

import { GymGate } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { GymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

/**
 * `web.app.gym`: the gym console of the gym in the path (`/app/gyms/:gymId`,
 * SF-88, ADR 0026 D-G23). Its pages need the GYM_WORKSPACE capability (the
 * gate sends anyone else where the entry resolver says); which gym they show
 * is authorized by the backend for this id on every request. A segment that
 * is not a UUID is the not-found page: it never reaches an API path (SF-104).
 */
export default async function GymLayout({
  children,
  params,
}: LayoutProps<"/[locale]/app/gyms/[gymId]">) {
  await resolveLocaleParam(params);
  const { gymId } = await params;
  if (!isUuid(gymId)) notFound();
  return (
    <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      <GymWorkspace gymId={gymId}>{children}</GymWorkspace>
    </GymGate>
  );
}
