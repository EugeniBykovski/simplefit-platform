import { GymGate } from "@/features/session-gate";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

/**
 * `web.app.gym`: the gym console of the gym in the path (`/app/gyms/:gymId`,
 * SF-88, ADR 0026 D-G23). Its pages need the GYM_WORKSPACE capability (the
 * gate sends anyone else where the entry resolver says); which gym they show
 * is authorized by the backend for this id on every request.
 */
export default async function GymLayout({
  children,
  params,
}: LayoutProps<"/[locale]/app/gyms/[gymId]">) {
  await resolveLocaleParam(params);
  const { gymId } = await params;
  return (
    <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
      <GymWorkspace gymId={gymId}>{children}</GymWorkspace>
    </GymGate>
  );
}
